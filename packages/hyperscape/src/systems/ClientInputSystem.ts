/**
 * Client Input System - Captures, buffers, and sends player input
 * Implements proper input sequencing for client-side prediction
 */

import { System } from './System';
import type { World } from '../World';
import type { InputCommand } from '../types/networking';
import { InputButtons } from '../types/networking';
import { MovementConfig } from '../config/movement';
import * as THREE from 'three';

interface BufferedInput {
  command: InputCommand;
  sent: boolean;
  acknowledged: boolean;
  timestamp: number;
}

/**
 * Manages client-side input capture and networking
 */
export class ClientInputSystem extends System {
  private inputBuffer: BufferedInput[] = [];
  private sequenceNumber: number = 0;
  private lastAcknowledgedSequence: number = -1;
  private lastInputTime: number = 0;
  private accumulator: number = 0;
  
  // Input state
  private moveVector: THREE.Vector3 = new THREE.Vector3();
  private buttons: number = 0;
  private viewAngles: THREE.Quaternion = new THREE.Quaternion();
  
  // Network stats
  private inputsDropped: number = 0;
  private inputsSent: number = 0;
  private inputsAcknowledged: number = 0;
  
  constructor(world: World) {
    super(world);
  }
  
  override start(): void {
    console.log('[ClientInputSystem] Started - capturing input at', MovementConfig.clientTickRate, 'Hz');
    this.lastInputTime = performance.now();
    
    // Listen for server acknowledgments
    this.world.on('inputAck', this.handleInputAck.bind(this));
    
    // Bind to controls
    this.bindControls();
  }
  
  override update(delta: number): void {
    // Accumulate time for fixed-rate input capture
    this.accumulator += delta;
    const tickInterval = 1.0 / MovementConfig.clientTickRate;
    
    // Process fixed timestep inputs
    while (this.accumulator >= tickInterval) {
      this.captureAndSendInput(tickInterval);
      this.accumulator -= tickInterval;
    }
    
    // Clean old acknowledged inputs
    this.cleanInputBuffer();
  }
  
  /**
   * Capture current input state and send to server
   */
  private captureAndSendInput(deltaTime: number): void {
    const now = performance.now();
    
    // Build input command
    const input: InputCommand = {
      sequence: this.sequenceNumber++,
      timestamp: now,
      deltaTime: deltaTime,
      moveVector: this.moveVector.clone(),
      buttons: this.buttons,
      viewAngles: this.viewAngles.clone(),
      checksum: this.calculateChecksum()
    };
    
    // Add to buffer
    const buffered: BufferedInput = {
      command: input,
      sent: false,
      acknowledged: false,
      timestamp: now
    };
    
    this.inputBuffer.push(buffered);
    
    // Send to server
    if (this.world.network?.send) {
      // Convert keyboard input to move request for server
      if (this.buttons !== 0) {
        // Calculate target position based on button input
        const player = this.world.entities.player;
        if (player && 'position' in player) {
          const pos = player.position as THREE.Vector3;
          const moveDistance = 30; // Units to move (larger for more noticeable movement)
          let moveX = 0;
          let moveZ = 0;
          
          // Convert button flags to movement direction
          if (this.buttons & InputButtons.FORWARD) {
            moveZ -= 1;
          }
          if (this.buttons & InputButtons.BACKWARD) {
            moveZ += 1;
          }
          if (this.buttons & InputButtons.LEFT) {
            moveX -= 1;
          }
          if (this.buttons & InputButtons.RIGHT) {
            moveX += 1;
          }
          
          // Normalize diagonal movement
          const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
          if (length > 0) {
            moveX = (moveX / length) * moveDistance;
            moveZ = (moveZ / length) * moveDistance;
            
            // Calculate target position
            const targetX = pos.x + moveX;
            const targetZ = pos.z + moveZ;
            
            // Send as moveRequest that server understands
            const runMode = (this.buttons & InputButtons.SPRINT) !== 0;
            console.log('[ClientInputSystem] Sending moveRequest:', {
              from: [pos.x, pos.y, pos.z],
              target: [targetX, pos.y, targetZ],
              runMode: runMode,
              buttons: this.buttons
            });
            this.world.network.send('moveRequest', {
              target: [targetX, pos.y, targetZ],
              runMode: runMode
            });
          }
        }
      }
      
      // Still send raw input for future use
      this.world.network.send('input', {
        seq: input.sequence,
        t: input.timestamp,
        dt: input.deltaTime,
        mv: [input.moveVector.x, input.moveVector.y, input.moveVector.z],
        b: input.buttons,
        va: [input.viewAngles.x, input.viewAngles.y, input.viewAngles.z, input.viewAngles.w],
        cs: input.checksum
      });
      
      buffered.sent = true;
      this.inputsSent++;
      
      // Also send to prediction system
      this.world.emit('clientInput', input);
    }
    
    // Trim buffer if too large
    while (this.inputBuffer.length > MovementConfig.inputBufferSize) {
      const dropped = this.inputBuffer.shift();
      if (!dropped?.acknowledged) {
        this.inputsDropped++;
      }
    }
  }
  
  /**
   * Handle input acknowledgment from server
   */
  private handleInputAck(data: { sequence: number; corrections?: unknown }): void {
    this.lastAcknowledgedSequence = data.sequence;
    
    // Mark inputs as acknowledged
    for (const buffered of this.inputBuffer) {
      if (buffered.command.sequence <= data.sequence) {
        buffered.acknowledged = true;
        this.inputsAcknowledged++;
      }
    }
    
    // Notify prediction system
    if (data.corrections) {
      this.world.emit('serverCorrection', {
        sequence: data.sequence,
        corrections: data.corrections
      });
    }
  }
  
  /**
   * Clean acknowledged inputs from buffer
   */
  private cleanInputBuffer(): void {
    const now = performance.now();
    
    // Remove old acknowledged inputs (keep last few for debugging)
    this.inputBuffer = this.inputBuffer.filter(buffered => {
      // Keep unacknowledged
      if (!buffered.acknowledged) return true;
      
      // Keep recent acknowledged (last 5)
      const age = now - buffered.timestamp;
      return age < 100; // Keep for 100ms
    });
  }
  
  /**
   * Bind to control system
   */
  private bindControls(): void {
    const controls = this.world.controls;
    if (!controls) return;
    
    const _binding = controls.bind({
      priority: 100 // High priority
    });
    
    // Listen for control events separately
    // This is a simplified approach - in production we'd properly integrate
    this.setupControlListeners();
    
    // Also get camera for view angles
    if (this.world.rig) {
      // Update view angles from camera
      setInterval(() => {
        this.viewAngles.copy(this.world.rig.quaternion);
      }, 16); // 60 FPS
    }
  }
  
  /**
   * Setup control listeners
   */
  private setupControlListeners(): void {
    // Listen for keyboard events directly
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        this.handleButtonPress(e.code);
      });
      
      window.addEventListener('keyup', (e) => {
        this.handleButtonRelease(e.code);
      });
    }
  }
  
  /**
   * Handle button press
   */
  private handleButtonPress(button: string): void {
    console.log('[ClientInputSystem] Button pressed:', button);
    switch (button) {
      case 'KeyW':
      case 'ArrowUp':
        this.buttons |= InputButtons.FORWARD;
        console.log('[ClientInputSystem] FORWARD button set, buttons:', this.buttons);
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.buttons |= InputButtons.BACKWARD;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.buttons |= InputButtons.LEFT;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.buttons |= InputButtons.RIGHT;
        break;
      case 'Space':
        this.buttons |= InputButtons.JUMP;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.buttons |= InputButtons.SPRINT;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.buttons |= InputButtons.CROUCH;
        break;
    }
  }
  
  /**
   * Handle button release
   */
  private handleButtonRelease(button: string): void {
    switch (button) {
      case 'KeyW':
      case 'ArrowUp':
        this.buttons &= ~InputButtons.FORWARD;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.buttons &= ~InputButtons.BACKWARD;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.buttons &= ~InputButtons.LEFT;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.buttons &= ~InputButtons.RIGHT;
        break;
      case 'Space':
        this.buttons &= ~InputButtons.JUMP;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.buttons &= ~InputButtons.SPRINT;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.buttons &= ~InputButtons.CROUCH;
        break;
    }
  }
  
  /**
   * Set movement target (for click-to-move)
   */
  public setMoveTarget(target: THREE.Vector3 | null): void {
    if (target) {
      const player = this.world.entities.player;
      if (player && 'position' in player) {
        const direction = new THREE.Vector3()
          .subVectors(target, player.position as THREE.Vector3)
          .setY(0)
          .normalize();
        this.moveVector.copy(direction);
      }
    } else {
      this.moveVector.set(0, 0, 0);
    }
  }
  
  /**
   * Calculate checksum for input validation
   */
  private calculateChecksum(): number {
    // Simple checksum for now
    const data = 
      this.sequenceNumber +
      this.buttons +
      Math.floor(this.moveVector.x * 1000) +
      Math.floor(this.moveVector.z * 1000);
    
    return data % 65536; // 16-bit checksum
  }
  
  /**
   * Get unacknowledged inputs for reconciliation
   */
  public getUnacknowledgedInputs(): InputCommand[] {
    return this.inputBuffer
      .filter(b => !b.acknowledged)
      .map(b => b.command);
  }
  
  /**
   * Get network statistics
   */
  public getStats() {
    return {
      sequenceNumber: this.sequenceNumber,
      lastAcknowledged: this.lastAcknowledgedSequence,
      bufferSize: this.inputBuffer.length,
      unacknowledged: this.inputBuffer.filter(b => !b.acknowledged).length,
      inputsSent: this.inputsSent,
      inputsAcknowledged: this.inputsAcknowledged,
      inputsDropped: this.inputsDropped,
      acknowledgmentRate: this.inputsSent > 0 ? 
        this.inputsAcknowledged / this.inputsSent : 0
    };
  }
  
  /**
   * Reset the system
   */
  public reset(): void {
    this.inputBuffer = [];
    this.sequenceNumber = 0;
    this.lastAcknowledgedSequence = -1;
    this.moveVector.set(0, 0, 0);
    this.buttons = 0;
    this.accumulator = 0;
  }
}
