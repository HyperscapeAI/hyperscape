/**
 * Core Movement System
 * movement system supporting multiple movement modes:
 * - WASD movement (first person/traditional)
 * - Click-to-move (MMO/RTS style)
 * - Pathfinding and navigation
 * - Stamina management
 */

import { EventType } from '../types/events';
import * as THREE from '../extras/three';
import { calculateDistance } from '../utils';
import { hasSystem } from '../utils/SystemUtils';
import type { World } from '../World';
import { System, SystemDependencies } from './System';
import { MovementMode, Player } from '../types';
import type { MovementTarget, PlayerStamina } from '../types';

// Types are now imported from shared types

export class ClientMovementSystem extends System {
  private mode: MovementMode = MovementMode.WASD;
  private activeMovements = new Map<string, MovementTarget>();
  private playerStamina = new Map<string, PlayerStamina>();
  
  // Movement constants
  private readonly WALK_SPEED = 4; // meters per second
  private readonly RUN_SPEED = 8; // meters per second
  private readonly MAX_STAMINA = 100;
  private readonly STAMINA_DRAIN_RATE = 10; // per second while running
  private readonly STAMINA_REGEN_RATE = 5; // per second while not running
  private readonly MIN_MOVEMENT_DISTANCE = 0.5;
  
  // Raycasting for ground detection
  private raycaster = new THREE.Raycaster();
  private groundDirection = new THREE.Vector3(0, -1, 0);
  
  // Last update times for frame-based updates
  private lastMovementUpdate = 0;
  private lastStaminaUpdate = 0;
  
  constructor(world: World) {
    super(world);
  }
  
  getDependencies(): SystemDependencies {
    return {
      optional: ['physics', 'terrain'] // Movement works better with physics but can function without it
    };
  }
  
  async init(): Promise<void> {
    // Listen for camera click events from ClientCameraSystem
    this.world.on(EventType.CAMERA_CLICK_WORLD, this.handleWorldClick.bind(this));
    
    // Listen for movement control events
    this.world.on(EventType.MOVEMENT_SET_MODE, this.setMovementMode.bind(this));
    this.world.on(EventType.MOVEMENT_STOP, this.stopMovement.bind(this));
    this.world.on(EventType.MOVEMENT_TOGGLE_RUN, this.toggleRunning.bind(this));
    
    // Listen for player events
    this.world.on(EventType.PLAYER_REGISTERED, this.initializePlayerStamina.bind(this));
    this.world.on(EventType.PLAYER_UNREGISTERED, this.cleanupPlayerMovement.bind(this));
    
    // Auto-detect movement mode based on available systems
    this.detectMovementMode();
  }
  
  start(): void {
    // Initialize frame-based update timing
    const now = Date.now();
    this.lastMovementUpdate = now;
    this.lastStaminaUpdate = now;
    
    console.log('[ClientMovementSystem] Started - using frame-based updates');
  }
  
  private detectMovementMode(): void {
    // Check if we have systems - if so, default to click-to-move
    if (hasSystem(this.world, 'rpg-player')) {
      this.setMovementMode({ mode: MovementMode.CLICK_TO_MOVE });
    } else {
      this.setMovementMode({ mode: MovementMode.WASD });
    }
  }
  
  private setMovementMode(event: { mode: MovementMode }): void {
    const oldMode = this.mode;
    this.mode = event.mode;
    
    if (oldMode !== this.mode) {
      console.log(`[ClientMovementSystem] Movement mode changed: ${oldMode} -> ${this.mode}`);
      this.onMovementModeChanged(oldMode, this.mode);
    }
  }
  
  private onMovementModeChanged(oldMode: MovementMode, newMode: MovementMode): void {
    // Clear any active movements when switching modes
    this.activeMovements.clear();
    
    // Mode-specific setup
    switch (newMode) {
      case MovementMode.WASD:
        // Enable traditional WASD controls
        break;
        
      case MovementMode.CLICK_TO_MOVE:
        // Enable click-to-move
        break;
        
      case MovementMode.HYBRID:
        // Enable both systems
        break;
    }
  }
  
  private handleWorldClick(event: { 
    screenPosition: { x: number; y: number }; 
    normalizedPosition: THREE.Vector2;
    target: { position?: THREE.Vector3 };
  }): void {
    if (this.mode === MovementMode.WASD) return;
    
    // Get local player
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
    // Raycast to find world position
    const camera = this.world.camera;
    if (!camera) return;
    
    this.raycaster.setFromCamera(event.normalizedPosition, camera);
    
    // Get terrain and world objects for intersection
    const scene = this.world.stage.scene;
    
    // First, find the terrain container
    const terrainContainer = scene?.children.find((child) => 
      child.name === 'TerrainContainer' || child.name?.includes('Terrain')
    ) as THREE.Object3D | undefined;
    
    let worldObjects: THREE.Object3D[] = [];
    
    if (terrainContainer && terrainContainer.children) {
      // Get terrain meshes from inside the container
      worldObjects = terrainContainer.children.filter((child) => 
        child.type === 'Mesh' ||
        child.userData?.walkable === true || 
        child.userData?.type === 'terrain' ||
        child.userData?.type === 'ground'
      ) as THREE.Object3D[];
      console.log(`[ClientMovementSystem] Found ${worldObjects.length} terrain meshes in TerrainContainer`);
    } else {
      // Fallback: look for terrain objects in the main scene
      worldObjects = (scene?.children.filter((child) => 
        child.userData?.walkable === true || 
        child.userData?.type === 'terrain' ||
        child.userData?.type === 'ground' ||
        child.name?.includes('terrain') ||
        child.name?.includes('Terrain') ||
        child.type === 'Mesh'
      ) || []) as THREE.Object3D[];
      console.log(`[ClientMovementSystem] Fallback: Found ${worldObjects.length} potential terrain objects in scene`);
    }
    
    console.log(`[ClientMovementSystem] Terrain objects for click-to-move:`, 
      worldObjects.slice(0, 3).map(obj => ({ 
        name: obj.name, 
        type: obj.type, 
        hasGeometry: !!(obj as unknown as THREE.Mesh).geometry, 
        userData: obj.userData 
      })));
    
    if (worldObjects.length === 0) {
      console.log('[ClientMovementSystem] No terrain objects found for click-to-move');
      return;
    }
    
    const intersects = this.raycaster.intersectObjects(worldObjects, true);
    console.log(`[ClientMovementSystem] Raycast intersects: ${intersects.length}`);
    
    if (intersects.length === 0) {
      console.log('[ClientMovementSystem] No intersects found for click-to-move');
      return;
    }
    
    const hitPoint = intersects[0].point;
    console.log(`[ClientMovementSystem] Click hit point:`, { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z });
    
    // Start movement to clicked position
    const currentPosition = this.getPlayerPosition(localPlayer);
    console.log(`[ClientMovementSystem] Starting movement from:`, currentPosition, 'to:', { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z });
    
    this.startMovement({
      playerId: localPlayer.id,
      targetPosition: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
      currentPosition,
      isRunning: false // Default to walking, can be toggled
    });
  }
  
  private initializePlayerStamina(event: { id: string }): void {
    this.playerStamina.set(event.id, {
      current: this.MAX_STAMINA,
      max: this.MAX_STAMINA,
      regenerating: true
    });
  }
  
  private cleanupPlayerMovement(event: { id: string }): void {
    this.activeMovements.delete(event.id);
    this.playerStamina.delete(event.id);
  }
  
  private startMovement(data: {
    playerId: string;
    targetPosition: { x: number; y: number; z: number }
    currentPosition: { x: number; y: number; z: number }
    isRunning?: boolean;
  }): void {
    // Stop any existing movement
    this.stopMovement({ playerId: data.playerId });
    
    // Calculate distance
    const distance = calculateDistance(data.currentPosition, data.targetPosition);
    if (distance < this.MIN_MOVEMENT_DISTANCE) return;
    
    // Check stamina for running
    const stamina = this.playerStamina.get(data.playerId);
    const isRunning = data.isRunning && stamina && stamina.current > 0;
    
    if (data.isRunning && (!stamina || stamina.current <= 0)) {
      this.world.emit(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: 'You are too tired to run.',
        type: 'info'
      });
    }
    
    // Determine movement speed
    const speed = isRunning ? this.RUN_SPEED : this.WALK_SPEED;
    
    // For now, use direct movement (pathfinding can be added later)
    const movement: MovementTarget = {
      playerId: data.playerId,
      targetPosition: data.targetPosition,
      startPosition: data.currentPosition,
      startTime: Date.now(),
      estimatedDuration: (distance / speed) * 1000,
      movementSpeed: speed,
      isRunning: isRunning || false
    };
    
    this.activeMovements.set(data.playerId, movement);
    
    // Emit movement started event
    this.world.emit(EventType.MOVEMENT_STARTED, {
      playerId: data.playerId,
      targetPosition: data.targetPosition,
      isRunning: isRunning,
      estimatedDuration: movement.estimatedDuration
    });
    
    // Update stamina regeneration
    if (stamina) {
      stamina.regenerating = !isRunning;
    }
  }
  
  private stopMovement(data: { playerId: string }): void {
    const movement = this.activeMovements.get(data.playerId);
    if (movement) {
      this.activeMovements.delete(data.playerId);
      
      this.world.emit(EventType.MOVEMENT_STOPPED, {
        playerId: data.playerId
      });
      
      // Resume stamina regeneration
      const stamina = this.playerStamina.get(data.playerId);
      if (stamina) {
        stamina.regenerating = true;
      }
    }
  }
  
  private toggleRunning(data: { playerId: string; isRunning: boolean }): void {
    const movement = this.activeMovements.get(data.playerId);
    if (movement) {
      const stamina = this.playerStamina.get(data.playerId);
      
      // Check if player can run
      if (data.isRunning && (!stamina || stamina.current <= 0)) {
        this.world.emit(EventType.UI_MESSAGE, {
          playerId: data.playerId,
          message: 'You are too tired to run.',
          type: 'info'
        });
        return;
      }
      
      // Update movement speed
      const wasRunning = movement.isRunning;
      movement.isRunning = !!(data.isRunning && stamina && stamina.current > 0);
      
      if (wasRunning !== movement.isRunning) {
        // Recalculate remaining time with new speed
        const elapsed = Date.now() - movement.startTime;
        const _progress = elapsed / movement.estimatedDuration;
        const remainingDistance = calculateDistance(
          this.getCurrentPosition(movement),
          movement.targetPosition
        );
        
        movement.movementSpeed = movement.isRunning ? this.RUN_SPEED : this.WALK_SPEED;
        const newRemainingTime = (remainingDistance / movement.movementSpeed) * 1000;
        movement.estimatedDuration = elapsed + newRemainingTime;
        
        // Update stamina regeneration
        if (stamina) {
          stamina.regenerating = !movement.isRunning;
        }
        
        this.world.emit(EventType.MOVEMENT_SPEED_CHANGED, {
          playerId: data.playerId,
          isRunning: movement.isRunning,
          newSpeed: movement.movementSpeed
        });
      }
    }
  }
  
  private updateMovements(): void {
    const now = Date.now();
    
    for (const [playerId, movement] of this.activeMovements.entries()) {
      const player = this.getPlayer(playerId);
      if (!player) {
        this.activeMovements.delete(playerId);
        continue;
      }
      
      // Update direct movement
      this.updateDirectMovement(player, movement);
      
      // Check if movement is complete
      const elapsed = now - movement.startTime;
      const progress = elapsed / movement.estimatedDuration;
      
      if (progress >= 1.0) {
        this.completeMovement(playerId, movement, player);
      }
    }
  }
  
  private updateDirectMovement(player: Player, movement: MovementTarget): void {
    const elapsed = Date.now() - movement.startTime;
    const progress = Math.min(elapsed / movement.estimatedDuration, 1.0);
    
    // Calculate new position
    const newPosition = new THREE.Vector3(
      movement.startPosition.x + (movement.targetPosition.x - movement.startPosition.x) * progress,
      movement.startPosition.y + (movement.targetPosition.y - movement.startPosition.y) * progress,
      movement.startPosition.z + (movement.targetPosition.z - movement.startPosition.z) * progress
    );
    
    // Apply ground detection to keep player on terrain
    const groundPosition = this.getGroundPosition(newPosition);
    if (groundPosition) {
      newPosition.copy(groundPosition);
    }
    
    // Update player position
    this.updatePlayerPosition(player, newPosition, movement);
  }
  
  private getGroundPosition(position: THREE.Vector3): THREE.Vector3 | null {
    // Cast ray downward to find ground
    this.raycaster.set(
      new THREE.Vector3(position.x, position.y + 10, position.z) as THREE.Vector3,
      this.groundDirection
    );
    
    const scene = this.world.stage.scene;
    
    // First, find the terrain container
    const terrainContainer = scene?.children.find((child) => 
      child.name === 'TerrainContainer' || child.name?.includes('Terrain')
    ) as THREE.Object3D | undefined;
    
    let terrainObjects: THREE.Object3D[] = [];
    
    if (terrainContainer && terrainContainer.children) {
      // Get terrain meshes from inside the container
      terrainObjects = terrainContainer.children.filter((child) => 
        child.type === 'Mesh' ||
        child.userData?.walkable === true || 
        child.userData?.type === 'terrain'
      ) as THREE.Object3D[];
    } else {
      // Fallback: look for terrain objects in the main scene
      terrainObjects = (scene?.children.filter((child) =>
        child.userData?.type === 'terrain' || child.userData?.walkable === true
      ) || []) as THREE.Object3D[];
    }
    
    if (terrainObjects.length === 0) return null;
    
    const intersects = this.raycaster.intersectObjects(terrainObjects, true);
    if (intersects.length > 0) {
      const groundY = intersects[0].point.y + 0.1; // Slight offset above ground
      return new THREE.Vector3(position.x, groundY, position.z);
    }
    
    return null;
  }
  
  private updatePlayerPosition(player: Player, newPosition: THREE.Vector3, movement: MovementTarget): void {
    // Use Entity's setPosition method
    player.setPosition(newPosition.x, newPosition.y, newPosition.z);
    
    // Update player rotation to face movement direction
    const direction = new THREE.Vector3(
      movement.targetPosition.x - movement.startPosition.x,
      0,
      movement.targetPosition.z - movement.startPosition.z
    );
    
    // Only normalize and calculate angle if direction is non-zero
    if (direction.lengthSq() > 0.0001) { // Use lengthSq to avoid sqrt calculation
      direction.normalize();
      const targetAngle = Math.atan2(direction.x, direction.z);
      
      // Create quaternion for Y rotation and update player rotation
      const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
      
      // Interpolate rotation smoothly
      const currentQuaternion = player.node.quaternion;
      currentQuaternion.slerp(targetQuaternion, 0.1);
        player.node.quaternion.copy(currentQuaternion);
    }
  }
  
  private completeMovement(playerId: string, movement: MovementTarget, player: Player): void {
    // Set final position
    const finalPos = new THREE.Vector3(
      movement.targetPosition.x,
      movement.targetPosition.y,
      movement.targetPosition.z
    );
    
    // Apply ground detection to final position
    const groundPosition = this.getGroundPosition(finalPos);
    if (groundPosition) {
      finalPos.copy(groundPosition);
    }
    
    this.updatePlayerPosition(player, finalPos, movement);
    
    // Remove movement
    this.activeMovements.delete(playerId);
    
    // Resume stamina regeneration
    const stamina = this.playerStamina.get(playerId);
    if (stamina) {
      stamina.regenerating = true;
    }
    
    // Emit completion event
    this.world.emit(EventType.MOVEMENT_COMPLETED, {
      playerId: playerId,
      finalPosition: movement.targetPosition
    });
  }
  
  private getCurrentPosition(movement: MovementTarget): { x: number; y: number; z: number } {
    const elapsed = Date.now() - movement.startTime;
    const progress = Math.min(elapsed / movement.estimatedDuration, 1.0);
    
    return {
      x: movement.startPosition.x + (movement.targetPosition.x - movement.startPosition.x) * progress,
      y: movement.startPosition.y + (movement.targetPosition.y - movement.startPosition.y) * progress,
      z: movement.startPosition.z + (movement.targetPosition.z - movement.startPosition.z) * progress
    };
  }
  
  private updateStamina(): void {
    for (const [playerId, stamina] of this.playerStamina.entries()) {
      const movement = this.activeMovements.get(playerId);
      
      if (movement && movement.isRunning) {
        // Drain stamina while running
        stamina.current = Math.max(0, stamina.current - this.STAMINA_DRAIN_RATE);
        stamina.regenerating = false;
        
        // Stop running if out of stamina
        if (stamina.current <= 0) {
          movement.isRunning = false;
          movement.movementSpeed = this.WALK_SPEED;
          stamina.regenerating = true;
          
          this.world.emit(EventType.MOVEMENT_STAMINA_DEPLETED, {
            playerId: playerId
          });
        }
      } else if (stamina.regenerating) {
        // Regenerate stamina when not running
        stamina.current = Math.min(stamina.max, stamina.current + this.STAMINA_REGEN_RATE);
      }
      
      // Emit stamina update
      this.world.emit('player:stamina_update', {
        playerId: playerId,
        current: stamina.current,
        max: stamina.max,
        regenerating: stamina.regenerating
      });
    }
  }
  
  private getPlayer(playerId: string): Player {
    return this.world.getPlayer(playerId);
  }
  
  private getPlayerPosition(player: Player): { x: number; y: number; z: number } {
    // Use Entity's position property which is a THREE.Vector3
    return { x: player.node.position.x, y: player.node.position.y, z: player.node.position.z };
  }
  
  // Public API methods
  public movePlayer(playerId: string, targetPosition: { x: number; y: number; z: number }): void {
    const player = this.getPlayer(playerId);
    if (!player) {
      console.warn(`[ClientMovementSystem] Player ${playerId} not found`);
      return;
    }
    
    const currentPosition = this.getPlayerPosition(player);
    this.startMovement({
      playerId,
      targetPosition,
      currentPosition,
      isRunning: false
    });
  }
  
  public getPlayerStamina(playerId: string): PlayerStamina | null {
    return this.playerStamina.get(playerId) || null;
  }
  
  public isPlayerMoving(playerId: string): boolean {
    return this.activeMovements.has(playerId);
  }
  
  public async teleportPlayer(playerId: string, targetPosition: { x: number; y: number; z: number }): Promise<boolean> {
    const player = this.getPlayer(playerId);
    if (!player) {
      console.warn(`[ClientMovementSystem] Player ${playerId} not found`);
      return false;
    }
    
    try {
      // Stop any current movement
      this.stopMovement({ playerId });
      
      // Apply ground detection to teleport position
      const position = new THREE.Vector3(targetPosition.x, targetPosition.y, targetPosition.z);
      const groundPosition = this.getGroundPosition(position);
      if (groundPosition) {
        position.copy(groundPosition);
      }
      
      player.setPosition!(position.x, position.y, position.z);
      
      this.world.emit(EventType.PLAYER_TELEPORTED, {
        playerId,
        position: { x: position.x, y: position.y, z: position.z }
      });
      
      return true;
    } catch (error) {
      console.error(`[ClientMovementSystem] Teleport failed for player ${playerId}:`, error);
      return false;
    }
  }
  
  // System lifecycle methods
  update(_deltaTime: number): void {
    const now = Date.now();
    
    // Update movements at ~20 FPS (50ms intervals)
    if (now - this.lastMovementUpdate >= 50) {
      this.lastMovementUpdate = now;
      this.updateMovements();
    }
    
    // Update stamina every second
    if (now - this.lastStaminaUpdate >= 1000) {
      this.lastStaminaUpdate = now;
      this.updateStamina();
    }
  }
  
  destroy(): void {
    // Clean up movement data
    this.activeMovements.clear();
    this.playerStamina.clear();
    
    console.log('[ClientMovementSystem] Destroyed');
  }
  
  // Required System lifecycle methods
  preTick(): void {}
  preFixedUpdate(): void {}
  fixedUpdate(_dt: number): void {}
  postFixedUpdate(): void {}
  preUpdate(): void {}
  postUpdate(): void {}
  lateUpdate(): void {}
  postLateUpdate(): void {}
  commit(): void {}
  postTick(): void {}
}