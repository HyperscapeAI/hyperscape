/**
 * Shared movement physics simulator
 * Used by both client (for prediction) and server (for authority)
 * Based on Quake/Source engine movement physics
 */

import * as THREE from 'three';
import type { 
  InputCommand, 
  PlayerStateSnapshot,
  MovementConfig as IMovementConfig 
} from '../types/networking';
import { 
  MoveState,
  InputButtons
} from '../types/networking';
import { MovementPhysics } from '../config/movement';

/**
 * Core movement physics simulator
 * Deterministic and frame-rate independent
 */
export class MovementSimulator {
  /**
   * Main simulation step - processes one input to produce new state
   * This must be DETERMINISTIC - same input always produces same output
   */
  static simulate(
    state: PlayerStateSnapshot,
    input: InputCommand,
    config: IMovementConfig,
    world?: { getSystem?: (name: string) => unknown }
  ): PlayerStateSnapshot {
    // Clone state to avoid mutations
    const newState: PlayerStateSnapshot = {
      ...state,
      position: state.position.clone(),
      velocity: state.velocity.clone(),
      acceleration: state.acceleration.clone(),
      rotation: state.rotation.clone(),
      groundNormal: state.groundNormal?.clone()
    };
    
    const dt = input.deltaTime;
    
    // Apply status effects
    const speedMultiplier = state.effects?.speedMultiplier ?? 1.0;
    const canMove = state.effects?.canMove ?? true;
    const canJump = state.effects?.canJump ?? true;
    
    if (!canMove) {
      // Player is rooted/stunned - only apply gravity
      if (!state.grounded) {
        newState.velocity.y += config.gravity * dt;
      }
      newState.position.add(newState.velocity.clone().multiplyScalar(dt));
      return newState;
    }
    
    // Process movement input
    const wishDir = this.getWishDirection(input);
    const wishSpeed = this.getWishSpeed(input, state, config) * speedMultiplier;
    
    // Apply movement based on state
    if (state.grounded) {
      // Ground movement
      newState.velocity = this.accelerateGround(
        state.velocity,
        wishDir,
        wishSpeed,
        config.groundAcceleration,
        config.groundFriction,
        dt
      );
      
      // Handle jump
      if (canJump && (input.buttons & InputButtons.JUMP) && !state.airTime) {
        const jumpVelocity = MovementPhysics.getJumpVelocity(
          config.jumpHeight * (state.effects?.jumpMultiplier ?? 1.0),
          config.gravity
        );
        newState.velocity.y = jumpVelocity;
        newState.grounded = false;
        newState.moveState = MoveState.JUMPING;
        newState.airTime = 0;
      }
      
      // Check if we walked off a ledge
      const nextPos = state.position.clone().add(newState.velocity.clone().multiplyScalar(dt));
      if (!this.checkGround(nextPos, config, world)) {
        newState.grounded = false;
        newState.moveState = MoveState.FALLING;
        newState.airTime = 0;
      }
    } else {
      // Air movement
      newState.velocity = this.accelerateAir(
        state.velocity,
        wishDir,
        wishSpeed,
        config.airAcceleration,
        config.airFriction,
        dt
      );
      
      // Apply gravity
      const gravityMultiplier = state.effects?.gravityMultiplier ?? 1.0;
      newState.velocity.y += config.gravity * gravityMultiplier * dt;
      
      // Track air time
      newState.airTime = (state.airTime ?? 0) + dt;
    }
    
    // Clamp velocity to max speed
    const horizontalVel = new THREE.Vector2(newState.velocity.x, newState.velocity.z);
    const maxHorizontalSpeed = state.grounded ? 
      this.getMaxGroundSpeed(input, config) : 
      config.maxAirSpeed;
    
    if (horizontalVel.length() > maxHorizontalSpeed * speedMultiplier) {
      horizontalVel.normalize().multiplyScalar(maxHorizontalSpeed * speedMultiplier);
      newState.velocity.x = horizontalVel.x;
      newState.velocity.z = horizontalVel.y;
    }
    
    // Update position
    const movement = newState.velocity.clone().multiplyScalar(dt);
    newState.position.add(movement);
    
    // Ground check at new position
    const groundCheck = this.performGroundCheck(newState.position, newState.velocity, config, world);
    newState.grounded = groundCheck.grounded;
    newState.groundNormal = groundCheck.normal;
    
    // Landing detection
    if (!state.grounded && newState.grounded) {
      // Just landed - apply landing effects
      newState.velocity.y = 0; // Cancel downward velocity
      newState.airTime = undefined;
      
      // Could apply fall damage here based on velocity
      const fallSpeed = Math.abs(state.velocity.y);
      if (fallSpeed > 20) {
        // Heavy landing - could reduce health
      }
    }
    
    // Update movement state
    newState.moveState = this.determineMovementState(newState, input);
    
    // Update rotation based on movement direction
    if (wishDir.lengthSq() > 0.01) {
      newState.rotation = this.calculateRotation(wishDir, state.rotation, dt);
    }
    
    return newState;
  }
  
  /**
   * Get movement wish direction from input
   */
  private static getWishDirection(input: InputCommand): THREE.Vector3 {
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);
    
    // Apply view rotation to get world-space directions
    forward.applyQuaternion(input.viewAngles);
    right.applyQuaternion(input.viewAngles);
    
    // Remove vertical component for movement
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();
    
    // Build wish direction from input
    const wishDir = new THREE.Vector3();
    
    if (input.buttons & InputButtons.FORWARD) {
      wishDir.add(forward);
    }
    if (input.buttons & InputButtons.BACKWARD) {
      wishDir.sub(forward);
    }
    if (input.buttons & InputButtons.LEFT) {
      wishDir.sub(right);
    }
    if (input.buttons & InputButtons.RIGHT) {
      wishDir.add(right);
    }
    
    // Use direct move vector if provided (for click-to-move)
    if (input.moveVector && input.moveVector.lengthSq() > 0.01) {
      return input.moveVector.clone().normalize();
    }
    
    return wishDir.normalize();
  }
  
  /**
   * Get desired movement speed
   */
  private static getWishSpeed(
    input: InputCommand,
    state: PlayerStateSnapshot,
    config: IMovementConfig
  ): number {
    if (input.buttons & InputButtons.SPRINT) {
      return config.maxSprintSpeed;
    }
    if (input.buttons & InputButtons.WALK) {
      return config.maxGroundSpeed * 0.5;
    }
    if (state.moveState === MoveState.RUNNING || !state.grounded) {
      return config.maxRunSpeed;
    }
    return config.maxGroundSpeed;
  }
  
  /**
   * Get maximum ground speed based on input
   */
  private static getMaxGroundSpeed(input: InputCommand, config: IMovementConfig): number {
    if (input.buttons & InputButtons.SPRINT) {
      return config.maxSprintSpeed;
    }
    if (input.buttons & InputButtons.WALK) {
      return config.maxGroundSpeed * 0.5;
    }
    return config.maxRunSpeed;
  }
  
  /**
   * Accelerate on ground (with friction)
   */
  private static accelerateGround(
    velocity: THREE.Vector3,
    wishDir: THREE.Vector3,
    wishSpeed: number,
    acceleration: number,
    friction: number,
    dt: number
  ): THREE.Vector3 {
    const vel = velocity.clone();
    
    // Apply friction first
    const speed = vel.length();
    if (speed > 0.1) {
      const drop = speed * friction * dt;
      const newSpeed = Math.max(0, speed - drop);
      vel.normalize().multiplyScalar(newSpeed);
    }
    
    // Then accelerate
    if (wishDir.lengthSq() > 0 && wishSpeed > 0) {
      const currentSpeed = vel.dot(wishDir);
      const addSpeed = wishSpeed - currentSpeed;
      
      if (addSpeed > 0) {
        let accelSpeed = acceleration * dt * wishSpeed;
        if (accelSpeed > addSpeed) {
          accelSpeed = addSpeed;
        }
        
        vel.add(wishDir.clone().multiplyScalar(accelSpeed));
      }
    }
    
    return vel;
  }
  
  /**
   * Accelerate in air (limited control)
   */
  private static accelerateAir(
    velocity: THREE.Vector3,
    wishDir: THREE.Vector3,
    wishSpeed: number,
    acceleration: number,
    friction: number,
    dt: number
  ): THREE.Vector3 {
    const vel = velocity.clone();
    
    // Apply air friction (much less than ground)
    const speed = new THREE.Vector2(vel.x, vel.z).length();
    if (speed > 0.1) {
      const drop = speed * friction * dt;
      const newSpeed = Math.max(0, speed - drop);
      const scale = newSpeed / speed;
      vel.x *= scale;
      vel.z *= scale;
    }
    
    // Limited air control
    if (wishDir.lengthSq() > 0 && wishSpeed > 0) {
      // Only apply acceleration perpendicular to current velocity
      // This gives Quake-style air strafing
      const currentSpeed = vel.dot(wishDir);
      const addSpeed = Math.min(wishSpeed - currentSpeed, wishSpeed * 0.5); // Limit air control
      
      if (addSpeed > 0) {
        let accelSpeed = acceleration * dt * wishSpeed;
        if (accelSpeed > addSpeed) {
          accelSpeed = addSpeed;
        }
        
        vel.add(wishDir.clone().multiplyScalar(accelSpeed));
      }
    }
    
    return vel;
  }
  
  /**
   * Check if position is on ground
   */
  private static checkGround(position: THREE.Vector3, config: IMovementConfig, world?: { getSystem?: (name: string) => unknown }): boolean {
    // Get terrain height if available
    let groundHeight = 0;
    
    if (world) {
      const terrain = world.getSystem ? world.getSystem('terrain') as { getHeightAt?: (x: number, z: number) => number } | null : null;
      if (terrain && terrain.getHeightAt) {
        groundHeight = terrain.getHeightAt(position.x, position.z);
      }
    }
    
    return position.y <= groundHeight + config.stepHeight;
  }
  
  /**
   * Perform detailed ground check
   */
  private static performGroundCheck(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    config: IMovementConfig,
    world?: { getSystem?: (name: string) => unknown }
  ): { grounded: boolean; normal?: THREE.Vector3 } {
    // Get terrain height if available
    let groundHeight = 0;
    
    if (world) {
      const terrain = world.getSystem ? world.getSystem('terrain') as { getHeightAt?: (x: number, z: number) => number } | null : null;
      if (terrain && terrain.getHeightAt) {
        groundHeight = terrain.getHeightAt(position.x, position.z);
      }
    }
    
    const isGrounded = position.y <= groundHeight + config.stepHeight;
    
    if (isGrounded && velocity.y <= 0) {
      // Could calculate actual terrain normal here
      return {
        grounded: true,
        normal: new THREE.Vector3(0, 1, 0)
      };
    }
    
    return { grounded: false };
  }
  
  /**
   * Determine movement state from physics state
   */
  private static determineMovementState(
    state: PlayerStateSnapshot,
    input: InputCommand
  ): MoveState {
    if (!state.grounded) {
      return state.velocity.y > 0 ? MoveState.JUMPING : MoveState.FALLING;
    }
    
    if (input.buttons & InputButtons.CROUCH) {
      return MoveState.CROUCHING;
    }
    
    const speed = new THREE.Vector2(state.velocity.x, state.velocity.z).length();
    
    if (speed < 0.1) {
      return MoveState.IDLE;
    }
    
    if (input.buttons & InputButtons.SPRINT) {
      return MoveState.SPRINTING;
    }
    
    if (speed > 6) {
      return MoveState.RUNNING;
    }
    
    return MoveState.WALKING;
  }
  
  /**
   * Calculate rotation from movement direction
   */
  private static calculateRotation(
    moveDir: THREE.Vector3,
    currentRotation: THREE.Quaternion,
    dt: number
  ): THREE.Quaternion {
    if (moveDir.lengthSq() < 0.01) {
      return currentRotation;
    }
    
    // Calculate target rotation from movement direction
    const forward = new THREE.Vector3(0, 0, -1);
    const targetQuat = new THREE.Quaternion();
    targetQuat.setFromUnitVectors(forward, moveDir.normalize());
    
    // Smooth rotation
    const result = currentRotation.clone();
    result.slerp(targetQuat, Math.min(1, dt * 10)); // Smooth turning
    
    return result;
  }
  
  /**
   * Validate that a state is physically valid
   */
  static validateState(state: PlayerStateSnapshot, config: IMovementConfig): boolean {
    // Check for NaN/Infinity
    if (!Number.isFinite(state.position.x) || 
        !Number.isFinite(state.position.y) || 
        !Number.isFinite(state.position.z)) {
      return false;
    }
    
    // Check speed limits
    const speed = state.velocity.length();
    const maxSpeed = Math.max(
      config.maxSprintSpeed,
      config.maxAirSpeed
    ) * (state.effects?.speedMultiplier ?? 1.0) * config.maxSpeedTolerance;
    
    if (speed > maxSpeed) {
      return false;
    }
    
    // Check position bounds (prevent going out of world)
    const MAX_COORD = 10000;
    if (Math.abs(state.position.x) > MAX_COORD ||
        Math.abs(state.position.y) > MAX_COORD ||
        Math.abs(state.position.z) > MAX_COORD) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Apply a correction to a state (for server reconciliation)
   */
  static applyCorrection(
    clientState: PlayerStateSnapshot,
    serverState: PlayerStateSnapshot,
    smoothing: number = 0.1
  ): PlayerStateSnapshot {
    const corrected = { ...clientState };
    
    // Smooth position correction
    corrected.position = clientState.position.clone().lerp(
      serverState.position,
      smoothing
    );
    
    // Take server velocity directly (more responsive)
    corrected.velocity = serverState.velocity.clone();
    
    // Take server physics state
    corrected.grounded = serverState.grounded;
    corrected.moveState = serverState.moveState;
    corrected.groundNormal = serverState.groundNormal?.clone();
    
    return corrected;
  }
}
