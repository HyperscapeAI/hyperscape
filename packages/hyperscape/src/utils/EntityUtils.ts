/**
 * Utility functions for common entity operations
 * Consolidates duplicate patterns across systems
 */

import type { Entity, Position2D, Position3D, Vector3, World } from '../types';
import THREE from '../extras/three';

export interface EntityComponent {
  [key: string]: unknown;
}

/**
 * Safe entity retrieval with validation
 */
export function getEntity(world: World, entityId: string): Entity | null {
  if (!world.entities.get || typeof entityId !== 'string') {
    return null;
  }
  const entity = world.entities.get(entityId);
  return entity as Entity | null;
}

/**
 * Safe component retrieval with validation
 */
export function getComponent<T = EntityComponent>(entity: Entity | null, componentName: string): T | null {
  if (!entity || typeof entity.getComponent !== 'function') {
    return null;
  }
  const entityWithComponent = entity as Entity & { getComponent: (name: string) => unknown };
  const component = entityWithComponent.getComponent(componentName);
  return component as T | null;
}

/**
 * Get entity with specific component validation
 */
export function getEntityWithComponent<T = EntityComponent>(
  world: World, 
  entityId: string, 
  componentName: string
): { entity: Entity; component: T } | null {
  const entity = getEntity(world, entityId);
  if (!entity) return null;
  
  const component = getComponent<T>(entity, componentName);
  if (!component) return null;
  
  return { entity, component };
}

// Import and re-export core math utilities
import { calculateDistance, calculateDistance2D, clamp } from './MathUtils';
export { calculateDistance, calculateDistance2D, clamp };

/**
 * Check if entity is within range of another entity
 */
export function isWithinRange(entity1: Entity, entity2: Entity, range: number): boolean {
  return calculateDistance(entity1.position, entity2.position) <= range;
}

/**
 * Find entities within range of a position
 */
export function getEntitiesInRange(
  world: World,
  centerPosition: Vector3,
  range: number,
  filter?: (entity: Entity) => boolean
): Entity[] {
  if (!world.entities || !world.entities.values) return [];
  
  const result: Entity[] = [];
  const entities = Array.from(world.entities.values());
  for (const entity of entities) {
    // entity is already Entity type from our interface
    const rpgEntity = entity;
    if (calculateDistance(rpgEntity.position, centerPosition) <= range) {
      if (!filter || filter(rpgEntity)) {
        result.push(rpgEntity);
      }
    }
  }
  return result;
}

/**
 * Common entity validation patterns
 */
export function validateEntity(entity: Entity | null, componentNames?: string[]): boolean {
  if (!entity) return false;
  if (!componentNames) return true;
  
  for (const componentName of componentNames) {
    if (!getComponent(entity, componentName)) {
      return false;
    }
  }
  return true;
}

/**
 * Safe position update with validation
 */
export function updateEntityPosition(entity: Entity | null, newPosition: Vector3): boolean {
  if (!entity || !newPosition) return false;
  if (typeof newPosition.x !== 'number' || typeof newPosition.y !== 'number' || typeof newPosition.z !== 'number') {
    return false;
  }
  
  // Update position properties directly
  if (entity.position) {
    entity.position.x = newPosition.x;
    entity.position.y = newPosition.y;
    entity.position.z = newPosition.z;
  }
  return true;
}

/**
 * Get player entity with validation
 */
export function getPlayer(world: World, playerId: string) {
  const entity = getEntity(world, playerId);
  if (!entity || !entity.id.startsWith('player_')) {
    return null;
  }
  return entity;
}

/**
 * Batch entity retrieval with validation
 */
export function getEntitiesBatch(world: World, entityIds: string[]): (Entity | null)[] {
  return entityIds.map(id => getEntity(world, id));
}

/**
 * Find closest entity to a position
 */
export function findClosestEntity(
  world: World,
  position: Vector3,
  filter?: (entity: Entity) => boolean
): { entity: Entity; distance: number } | null {
  if (!world.entities || !world.entities.values) return null;
  
  let closest: { entity: Entity; distance: number } | null = null;
  
  const entities = Array.from(world.entities.values());
  for (const entity of entities) {
    // entity is already Entity type from our interface
    const rpgEntity = entity;
    if (filter && !filter(rpgEntity)) continue;
    
    const distance = calculateDistance(position, rpgEntity.position);
    if (!closest || distance < closest.distance) {
      closest = { entity: rpgEntity, distance };
    }
  }
  
  return closest;
}


/**
 * Safely access world.stage.scene with null checks
 */
export function getWorldScene(world: World): THREE.Scene | null {
  if (!world) {
    console.warn('[EntityUtils] getWorldScene called with null/undefined world');
    return null;
  }
  
  if (!world.stage) {
    console.warn('[EntityUtils] world.stage is not available - likely in headless test environment');
    return null;
  }
  
  if (!world.stage.scene) {
    console.warn('[EntityUtils] world.stage.scene is not available - Three.js scene not initialized');
    return null;
  }
  
  return world.stage.scene;
}

/**
 * Safely access world.stage.camera with null checks
 */
export function getWorldCamera(world: World): THREE.Camera | null {
  if (!world) {
    console.warn('[EntityUtils] getWorldCamera called with null/undefined world');
    return null;
  }
  
  // Try world.camera first, then world.stage.camera
  if (world.camera) {
    return world.camera;
  }
  
  if (!world.stage) {
    console.warn('[EntityUtils] world.stage is not available - likely in headless test environment');
    return null;
  }
  
  const stageWithCamera = world.stage as { camera?: THREE.Camera };
  if (!stageWithCamera.camera) {
    console.warn('[EntityUtils] world.stage.camera is not available - camera not initialized');
    return null;
  }
  
  return stageWithCamera.camera;
}

/**
 * Safely add object to scene with error handling
 */
export function safeSceneAdd<TObj extends THREE.Object3D>(world: World, obj: TObj): boolean {
  const scene = getWorldScene(world);
  if (!scene) {
    return false;
  }
  
  try {
    scene.add(obj);
    return true;
  } catch (_error) {
    console.error('[EntityUtils] Failed to add object to scene:', _error);
    return false;
  }
}

/**
 * Safely remove object from scene with error handling
 */
export function safeSceneRemove<TObj extends THREE.Object3D>(world: World, obj: TObj): boolean {
  const scene = getWorldScene(world);
  if (!scene) {
    return false;
  }
  
  try {
    scene.remove(obj);
    return true;
  } catch (_error) {
    console.error('[EntityUtils] Failed to remove object from scene:', _error);
    return false;
  }
}

// ============== END SYSTEM-SPECIFIC INTERFACES ==============

export function toPosition2D(pos: Position2D | { x: number; y: number }): Position2D {
  return {
    x: pos.x,
    y: pos.y
  }
}

export function distance2D(a: Position2D, b: Position2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Type guards
export function isPosition3D(value: unknown): value is Position3D {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    'z' in value &&
    typeof (value as { x: unknown; y: unknown; z: unknown }).x === 'number' &&
    typeof (value as { x: unknown; y: unknown; z: unknown }).y === 'number' &&
    typeof (value as { x: unknown; y: unknown; z: unknown }).z === 'number'
  )
}

export function isPosition2D(value: unknown): value is Position2D {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    typeof (value as { x: unknown; y: unknown }).x === 'number' &&
    typeof (value as { x: unknown; y: unknown }).y === 'number'
  )
}