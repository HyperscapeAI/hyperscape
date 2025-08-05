/**
 * MovementSystem - Handles player movement with click-to-move and pathfinding
 */

import { EventType } from '../types/events';
import * as THREE from '../extras/three';
import { SystemDependencies } from './System';
import type { World } from '../types/index';
import {
  ClickToMoveEvent,
  MovementComponent,
  PlayerID,
  Position3D
} from '../types';
import {
  toPosition3D,
  toVector3
} from '../types/utilities';
import {
  createPlayerID,
  isValidPlayerID,
  toPlayerID,
} from '../utils/IdentifierUtils';
import { EntityManager } from './EntityManager';
import { SystemBase } from './SystemBase';
import { Logger } from '../utils/Logger';



export class MovementSystem extends SystemBase {
  private movements = new Map<PlayerID, MovementComponent>();
  private entityManager?: EntityManager;

  constructor(world: World) {
    super(world, {
      name: 'rpg-movement',
      dependencies: {
        required: ['rpg-entity-manager'],
        optional: ['terrain', 'rpg-pathfinding']
      },
      autoCleanup: true
    });
  }

  getDependencies(): SystemDependencies {
    return {
      required: ['rpg-entity-manager'], // Movement system requires entity manager
      optional: ['terrain', 'rpg-pathfinding'] // Better with terrain and pathfinding but can work without
    };
  }

  async init(): Promise<void> {
    // Get entity manager reference - required dependency
    this.entityManager = this.world.getSystem<EntityManager>('rpg-entity-manager');
    if (!this.entityManager) {
      throw new Error('[MovementSystem] EntityManager not found - required dependency');
    }
    
    // Set up event subscription for movement
    this.subscribe(EventType.MOVEMENT_CLICK_TO_MOVE, (event) => {
      this.handleClickToMove(event as ClickToMoveEvent);
    });
    

  }

  /**
   * Fixed update loop - preserve movement logic
   */
  fixedUpdate(_dt: number): void {
    this.updateMovements(_dt);
  }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all movement data
    this.movements.clear();
    
    // Clear system references
    this.entityManager = undefined;
    

    
    // Call parent cleanup
    super.destroy();
  }

  private handleClickToMove(data: ClickToMoveEvent): void {
    const playerId = toPlayerID(data.playerId);
    if (!playerId) return;
    this.startMovement(playerId, data.targetPosition);
  }

  startMovement(playerId: PlayerID, targetPosition: Position3D): void {
    const player = this.world.getPlayer(playerId);

    // Get current position
    const currentPosition = player.node.position;

    // Create or update movement component
    const movement: MovementComponent = {
      position: { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z },
      velocity: new THREE.Vector3(), // THREE.Vector3 compatible with MovementComponent velocity
      targetPosition: targetPosition,
      destination: targetPosition,
      speed: 5.0,
      movementSpeed: 5.0, // Units per second
      isMoving: true,
      path: [targetPosition],
      pathNodes: [targetPosition], // Simple direct path for now
      currentPathIndex: 0,
      lastMovementTime: Date.now()
    };

    this.movements.set(playerId, movement);


  }

  stopMovement(playerId: string): void {
    const playerIdTyped = createPlayerID(playerId);
    const movement = this.movements.get(playerIdTyped);
    if (movement) {
      movement.isMoving = false;
      if (movement.velocity) {
        movement.velocity.set(0, 0, 0);
      }
      movement.targetPosition = null;
  
    }
  }

  // API method for compatibility with tests and other systems
  movePlayer(
    playerId: string, 
    targetPosition: Position3D,
    options?: {
      speed?: number;
      useStamina?: boolean;
      pathfinding?: boolean;
      avoidCollisions?: boolean;
    }
  ): boolean {
    // Start the movement
    const playerIdTyped = createPlayerID(playerId);
    this.startMovement(playerIdTyped, targetPosition);

    // Update movement component with options if provided
    const movement = this.movements.get(playerIdTyped);
    if (movement && options) {
      if (options.speed !== undefined) {
        movement.movementSpeed = options.speed;
      }
      // Additional options can be handled here in the future
    }

    return true;
  }

  // Teleport player instantly to a position
  teleportPlayer(
    playerId: string,
    targetPosition: Position3D,
    _options?: {
      validateLocation?: boolean;
      allowElevation?: boolean;
    }
  ): boolean {
    const player = this.world.getPlayer(playerId);
    
    // Set position directly - all players should have node.position as THREE.Vector3
    if (!player.node.position) {
      Logger.systemError('MovementSystem', `Player ${playerId} has no node.position - this should not happen`);
      return false;
    }
    
    player.node.position.set(targetPosition.x, targetPosition.y, targetPosition.z);

    // Update movement component
    const playerIdTyped = createPlayerID(playerId);
    const movement = this.movements.get(playerIdTyped);
    if (movement) {
      movement.position = { ...targetPosition };
      movement.isMoving = false;
      if (movement.velocity) {
        movement.velocity.set(0, 0, 0);
      }
      movement.targetPosition = null;
    }

    return true;
  }

  private updateMovements(_dt: number): void {
    if (!this.entityManager) return;

    this.movements.forEach((movement, playerId) => {
      if (!movement.isMoving || !movement.targetPosition) return;

      const player = this.world.getPlayer(playerId);

      // Calculate direction to target
      const currentPos = toVector3(player.node.position);
      const targetPos = toVector3(movement.targetPosition);
      
      const direction = new THREE.Vector3()
        .copy(targetPos)
        .sub(currentPos);

      // Check if we've reached the target
      const distanceToTarget = currentPos.distanceTo(targetPos);
      const moveThreshold = 0.5; // Stop when within 0.5 units

      if (distanceToTarget < moveThreshold) {
        // Reached target
        this.stopMovement(playerId);
        if (!player.node.position) {
          Logger.systemError('MovementSystem', `Player ${playerId} has no node.position - this should not happen`);
          return;
        }
        player.node.position.copy(targetPos);
        return;
      }

      // Calculate movement for this frame
      const moveDistance = movement.movementSpeed * _dt;
      
      // Don't overshoot the target
      const actualMoveDistance = Math.min(moveDistance, distanceToTarget);

      // Normalize direction for movement (we know it's non-zero because distanceToTarget > moveThreshold)
      direction.normalize();

      // Update position - all players should have node.position as THREE.Vector3
      const deltaMovement = direction.multiplyScalar(actualMoveDistance);
      
      if (!player.node.position) {
        Logger.systemError('MovementSystem', `Player ${playerId} has no node.position - this should not happen`);
        return;
      }
      
      player.node.position.add(deltaMovement);

      // Update movement component
      movement.position = toPosition3D(player.node.position);
      movement.lastMovementTime = Date.now();

      // Emit movement event for other systems
      this.emitTypedEvent(EventType.MOVEMENT_COMPLETED, {
        playerId: playerId,
        finalPosition: {
          x: movement.position.x,
          y: movement.position.y,
          z: movement.position.z
        }
      });
    });
  }

  // Public API methods
  isMoving(playerId: string): boolean {
    const playerIdTyped = createPlayerID(playerId);
    const movement = this.movements.get(playerIdTyped);
    return movement ? movement.isMoving : false;
  }

  getMovementComponent(playerId: string): MovementComponent | null {
    const playerIdTyped = createPlayerID(playerId);
    return this.movements.get(playerIdTyped) || null;
  }

  setMovementSpeed(playerId: string, speed: number): void {
    const playerIdTyped = createPlayerID(playerId);
    const movement = this.movements.get(playerIdTyped);
    if (movement) {
      movement.movementSpeed = Math.max(0, speed);
    }
  }

  getPosition(playerId: string): Position3D | null {
    const player = this.world.getPlayer(playerId);
    if (!player) return null;

    if (!player.node.position) {
      Logger.systemError('MovementSystem', `Player ${playerId} has no node.position - this should not happen`);
      return null;
    }

    return toPosition3D(player.node.position);
  }

  setPosition(playerId: string, position: { x: number; y: number; z: number }): void {
    const player = this.world.getPlayer(playerId);
    if (!player) return;

    if (!player.node.position) {
      Logger.systemError('MovementSystem', `Player ${playerId} has no node.position - this should not happen`);
      return;
    }

    player.node.position.copy(toVector3(position));
    
    // Update movement component if it exists
    const playerIdTyped = createPlayerID(playerId);
    const movement = this.movements.get(playerIdTyped);
    if (movement) {
      movement.position = position;
    }

    // Emit position update event
    this.emitTypedEvent(EventType.PLAYER_POSITION_UPDATED, {
      playerId: playerIdTyped as string,
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      }
    });
  }

  /**
   * Move any entity (player or NPC) to a target position
   * This is the method that NPCBehaviorManager and other systems can use
   */
  moveEntity(entityId: string, targetPosition: Position3D): void {
    // First check if it's a player
    if (isValidPlayerID(entityId)) {
      const playerIdTyped = createPlayerID(entityId);
      this.startMovement(playerIdTyped, targetPosition);
      return;
    }

    // If not a player, handle as NPC/other entity
    const entity = this.world.entities.get(entityId);
    if (!entity || !entity.node) {

      return;
    }

    // For NPCs, use direct position setting since they don't use the player movement system
    if (!entity.node?.position) {
      Logger.systemError('MovementSystem', `Entity ${entityId} has no node.position - this should not happen`);
      return;
    }
    
    entity.node.position.set(targetPosition.x, targetPosition.y, targetPosition.z);


  }

  // Clean up inactive movement components
  cleanup(): void {
    const _now = Date.now();
    const inactiveThreshold = 60000; // 1 minute

    const now = Date.now();
    
    this.movements.forEach((movement, playerId) => {
      if (!movement.isMoving && movement.lastMovementTime && (now - movement.lastMovementTime) > inactiveThreshold) {
        this.movements.delete(playerId);
  
      }
    });
  }

  // Debug methods
  getMovementStats(): { activeMovements: number; totalMovements: number } {
    const activeMovements = Array.from(this.movements.values())
      .filter(m => m.isMoving).length;
    
    return {
      activeMovements,
      totalMovements: this.movements.size
    };
  }
}
