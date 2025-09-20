/**
 * Entity Interpolation System
 * Provides smooth movement for remote entities
 */

import { System } from './System';
import type { World } from '../World';
import type { Entity } from '../entities/Entity';
import * as THREE from 'three';

interface PlayerEntity extends Entity {
  base?: {
    position: THREE.Vector3
    quaternion?: THREE.Quaternion
    visible?: boolean
    children?: unknown[]
    parent?: unknown | null
  } | THREE.Object3D
}

interface InterpolationState {
  entityId: string;
  positions: Array<{
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
    timestamp: number;
  }>;
  currentPosition: THREE.Vector3;
  currentRotation: THREE.Quaternion;
  targetPosition: THREE.Vector3;
  targetRotation: THREE.Quaternion;
  lastUpdate: number;
  interpolationDelay: number;
}

/**
 * Smoothly interpolates remote entity positions
 */
export class EntityInterpolationSystem extends System {
  private states: Map<string, InterpolationState> = new Map();
  private interpolationDelay: number = 100; // ms - how far behind to render
  private maxBufferSize: number = 20;
  private extrapolationLimit: number = 500; // ms - max extrapolation time
  
  constructor(world: World) {
    super(world);
  }
  
  override start(): void {
    console.log('[EntityInterpolation] Starting entity interpolation system');
    
    // Listen for entity updates
    this.world.on('entityModified', this.handleEntityUpdate.bind(this));
    this.world.on('entityRemoved', this.handleEntityRemoved.bind(this));
  }
  
  /**
   * Handle entity added event
   */
  private handleEntityAdded(entity: unknown): void {
    // For now, just log the entity addition
    if (typeof entity === 'object' && entity && 'id' in entity) {
      console.log('[EntityInterpolation] Entity added:', (entity as { id: string }).id);
    }
  }

  /**
   * Handle entity position update
   */
  private handleEntityUpdate(data: {
    id: string;
    changes: {
      p?: [number, number, number];
      q?: [number, number, number, number];
      v?: [number, number, number];
    };
  }): void {
    // Skip local player
    if (data.id === this.world.entities.player?.id) return;
    
    // Get or create state
    let state = this.states.get(data.id);
    if (!state) {
      state = this.createInterpolationState(data.id);
      this.states.set(data.id, state);
    }
    
    // Add position to buffer if provided
    if (data.changes.p) {
      const position = new THREE.Vector3(
        data.changes.p[0],
        data.changes.p[1],
        data.changes.p[2]
      );
      
      const rotation = data.changes.q ? 
        new THREE.Quaternion(
          data.changes.q[0],
          data.changes.q[1],
          data.changes.q[2],
          data.changes.q[3]
        ) : state.currentRotation.clone();
      
      // Add to position buffer
      state.positions.push({
        position,
        rotation,
        timestamp: performance.now()
      });
      
      // Limit buffer size
      while (state.positions.length > this.maxBufferSize) {
        state.positions.shift();
      }
      
      state.lastUpdate = performance.now();
    }
  }
  
  /**
   * Handle entity removal
   */
  private handleEntityRemoved(data: { id: string }): void {
    this.states.delete(data.id);
  }
  
  /**
   * Update interpolation for all entities
   */
  override update(_delta: number): void {
    const now = performance.now();
    const renderTime = now - this.interpolationDelay;
    
    for (const [entityId, state] of this.states) {
      const entity = this.world.entities.get(entityId);
      if (!entity) continue;
      
      // Interpolate or extrapolate position
      this.updateEntityPosition(entity, state, renderTime, now);
    }
  }
  
  /**
   * Update entity position with interpolation
   */
  private updateEntityPosition(
    entity: Entity,
    state: InterpolationState,
    renderTime: number,
    now: number
  ): void {
    if (state.positions.length < 2) {
      // Not enough data to interpolate
      if (state.positions.length === 1) {
        // Just use the single position
        this.applyPosition(entity, state.positions[0].position, state.positions[0].rotation);
      }
      return;
    }
    
    // Find two positions to interpolate between
    let older: typeof state.positions[0] | null = null;
    let newer: typeof state.positions[0] | null = null;
    
    for (let i = 0; i < state.positions.length - 1; i++) {
      if (state.positions[i].timestamp <= renderTime && 
          state.positions[i + 1].timestamp >= renderTime) {
        older = state.positions[i];
        newer = state.positions[i + 1];
        break;
      }
    }
    
    if (older && newer) {
      // Interpolate between positions
      const t = (renderTime - older.timestamp) / (newer.timestamp - older.timestamp);
      
      state.currentPosition.lerpVectors(older.position, newer.position, t);
      state.currentRotation.slerpQuaternions(older.rotation, newer.rotation, t);
      
      this.applyPosition(entity, state.currentPosition, state.currentRotation);
    } else {
      // Need to extrapolate
      this.extrapolatePosition(entity, state, renderTime, now);
    }
  }
  
  /**
   * Extrapolate position when no future data available
   */
  private extrapolatePosition(
    entity: Entity,
    state: InterpolationState,
    renderTime: number,
    now: number
  ): void {
    if (state.positions.length === 0) return;
    
    // Get last known position
    const last = state.positions[state.positions.length - 1];
    
    // Check if we should extrapolate
    const timeSinceLastUpdate = now - state.lastUpdate;
    if (timeSinceLastUpdate > this.extrapolationLimit) {
      // Too old, just use last position
      this.applyPosition(entity, last.position, last.rotation);
      return;
    }
    
    // Calculate velocity for extrapolation
    if (state.positions.length >= 2) {
      const secondLast = state.positions[state.positions.length - 2];
      const velocity = new THREE.Vector3()
        .subVectors(last.position, secondLast.position)
        .divideScalar((last.timestamp - secondLast.timestamp) / 1000);
      
      // Extrapolate position
      const extrapolationTime = (renderTime - last.timestamp) / 1000;
      const extrapolatedPos = last.position.clone()
        .add(velocity.multiplyScalar(extrapolationTime));
      
      // Apply with smoothing
      state.currentPosition.lerp(extrapolatedPos, 0.5);
      state.currentRotation.slerp(last.rotation, 0.5);
      
      this.applyPosition(entity, state.currentPosition, state.currentRotation);
    } else {
      // Just use last position
      this.applyPosition(entity, last.position, last.rotation);
    }
  }
  
  /**
   * Apply interpolated position to entity
   */
  private applyPosition(
    entity: Entity,
    position: THREE.Vector3,
    rotation: THREE.Quaternion
  ): void {
    // Update entity position
    if ('position' in entity) {
      (entity.position as THREE.Vector3).copy(position);
    }
    
    // Update node
    if (entity.node) {
      entity.node.position.copy(position);
      entity.node.quaternion.copy(rotation);
    }
    
    // Update base if player
    const player = entity as PlayerEntity
    if (player.base) {
      player.base.position.copy(position);
      player.base.quaternion.copy(rotation);
    }
    
    // Update physics if needed (but don't for remote entities)
    // Remote entities should not have physics simulation
  }
  
  /**
   * Create interpolation state for entity
   */
  private createInterpolationState(entityId: string): InterpolationState {
    const entity = this.world.entities.get(entityId);
    const position = entity && 'position' in entity ?
      (entity.position as THREE.Vector3).clone() :
      new THREE.Vector3();
    
    const rotation = entity?.node?.quaternion ?
      entity.node.quaternion.clone() :
      new THREE.Quaternion();
    
    return {
      entityId,
      positions: [],
      currentPosition: position.clone(),
      currentRotation: rotation.clone(),
      targetPosition: position.clone(),
      targetRotation: rotation.clone(),
      lastUpdate: performance.now(),
      interpolationDelay: this.interpolationDelay
    };
  }
  
  /**
   * Set interpolation delay
   */
  public setInterpolationDelay(delay: number): void {
    this.interpolationDelay = Math.max(0, Math.min(500, delay));
    console.log(`[EntityInterpolation] Interpolation delay set to ${this.interpolationDelay}ms`);
  }
  
  /**
   * Get interpolation statistics
   */
  public getStats() {
    const stats = {
      trackedEntities: this.states.size,
      averageBufferSize: 0,
      interpolating: 0,
      extrapolating: 0,
      stale: 0
    };
    
    const now = performance.now();
    let totalBufferSize = 0;
    
    for (const state of this.states.values()) {
      totalBufferSize += state.positions.length;
      
      const timeSinceUpdate = now - state.lastUpdate;
      if (timeSinceUpdate > this.extrapolationLimit) {
        stats.stale++;
      } else if (timeSinceUpdate > this.interpolationDelay) {
        stats.extrapolating++;
      } else {
        stats.interpolating++;
      }
    }
    
    if (this.states.size > 0) {
      stats.averageBufferSize = totalBufferSize / this.states.size;
    }
    
    return stats;
  }
  
  /**
   * Clear interpolation state for entity
   */
  public clearEntity(entityId: string): void {
    this.states.delete(entityId);
  }
  
  /**
   * Clear all interpolation states
   */
  public clearAll(): void {
    this.states.clear();
  }
}

