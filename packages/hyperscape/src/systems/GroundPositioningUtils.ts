import * as THREE from '../extras/three'
import type { World, Entity } from '../types'
import { TransformComponent } from '../components/TransformComponent'
import { TerrainSystem } from './TerrainSystem'

/**
 * Utility functions for positioning entities on the ground
 * This provides a clean interface for all systems to use ground positioning
 */
export class GroundPositioningUtils {
  
  /**
   * Position any entity on the ground at a specific world position
   */
  static positionEntityOnGround(
    world: World, 
    entity: Entity, 
    worldX: number, 
    worldZ: number, 
    heightOffset: number = 0.5
  ): void {
    const groundHeight = this.getGroundHeightAt(world, worldX, worldZ)
    
    // Position the entity
    const transform = entity.getComponent('Transform') as TransformComponent
    transform.position.set(worldX, groundHeight + heightOffset, worldZ)
  }

  /**
   * Get the ground height at a specific world position using multiple methods
   */
  static getGroundHeightAt(world: World, worldX: number, worldZ: number): number {
    // Use terrain system directly
    const terrainSystem = world.getSystem('terrain') as TerrainSystem
    return terrainSystem.getHeightAt(worldX, worldZ)
  }

  /**
   * Check if a position is on walkable ground
   */
  static isPositionWalkable(world: World, worldX: number, worldZ: number): boolean {
    const terrainSystem = world.getSystem('terrain') as TerrainSystem
    return terrainSystem.isPositionWalkable(worldX, worldZ).walkable
  }

  /**
   * Find the nearest walkable position within a radius
   */
  static findNearestWalkablePosition(
    world: World, 
    centerX: number, 
    centerZ: number, 
    maxRadius: number = 10,
    gridResolution: number = 1
  ): THREE.Vector2 {
    
    // Start from center and spiral outward
    for (let radius = 0; radius <= maxRadius; radius += gridResolution) {
      const positions = this.getPositionsInRing(centerX, centerZ, radius, gridResolution)
      
      for (const pos of positions) {
        if (this.isPositionWalkable(world, pos.x, pos.y)) {
          return pos
        }
      }
    }

    // Return center position as fallback
    return new THREE.Vector2(centerX, centerZ)
  }

  /**
   * Get positions in a ring around a center point
   */
  private static getPositionsInRing(centerX: number, centerZ: number, radius: number, resolution: number): THREE.Vector2[] {
    if (radius === 0) {
      return [new THREE.Vector2(centerX, centerZ)]
    }

    const positions: THREE.Vector2[] = []
    const circumference = 2 * Math.PI * radius
    const steps = Math.max(8, Math.ceil(circumference / resolution))

    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * 2 * Math.PI
      const x = centerX + Math.cos(angle) * radius
      const z = centerZ + Math.sin(angle) * radius
      positions.push(new THREE.Vector2(x, z))
    }

    return positions
  }

  /**
   * Safely drop an entity to the ground from any height
   */
  static dropEntityToGround(world: World, entity: Entity, heightOffset: number = 0.5): void {
    const transform = entity.getComponent('Transform') as TransformComponent
    const currentPos = transform.position
    
    // Position on ground at current X,Z coordinates
    this.positionEntityOnGround(world, entity, currentPos.x, currentPos.z, heightOffset)
  }

  /**
   * Get spawn position for entity type with proper ground positioning
   */
  static getSpawnPosition(
    world: World, 
    baseX: number, 
    baseZ: number, 
    entityType: 'player' | 'mob' | 'item' | 'npc' = 'mob'
  ): THREE.Vector3 {
    
    // Define height offsets for different entity types
    const heightOffsets = {
      player: 1.8,  // Human height
      mob: 1.0,     // Average mob height
      item: 0.1,    // Items rest on ground
      npc: 1.6      // NPC height
    }

    const heightOffset = heightOffsets[entityType]
    const groundHeight = this.getGroundHeightAt(world, baseX, baseZ)

    return new THREE.Vector3(baseX, groundHeight + heightOffset, baseZ)
  }

  /**
   * Batch position multiple entities on ground
   */
  static batchPositionOnGround(
    world: World,
    entities: Array<{ entity: Entity, x: number, z: number, heightOffset?: number }>
  ): void {
    for (const { entity, x, z, heightOffset = 0.5 } of entities) {
      this.positionEntityOnGround(world, entity, x, z, heightOffset)
    }
  }

  /**
   * Get debug information about ground at a position
   */
  static getGroundDebugInfo(world: World, worldX: number, worldZ: number): {
    position: { x: number; z: number };
    terrainHeight: number;
    isWalkable: boolean;
  } {
    const terrainSystem = world.getSystem('terrain') as TerrainSystem
    
    return {
      position: { x: worldX, z: worldZ },
      terrainHeight: terrainSystem.getHeightAt(worldX, worldZ),
      isWalkable: terrainSystem.isPositionWalkable(worldX, worldZ).walkable
    }
  }
}