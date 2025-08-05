/**
 * Ground Positioning Utilities
 * Provides utilities for positioning entities on terrain with proper height detection
 */

import * as THREE from '../extras/three';
import type { World } from '../../types';
import type { System } from '../systems/System';

// Type for terrain system interface
interface TerrainSystem extends System {
  getHeightAtPosition?(x: number, z: number): number | null;
  getHeightAt?(x: number, z: number): number | null;
}

// Type for ground checking system interface
interface GroundCheckingSystem extends System {
  getGroundHeight(position: THREE.Vector3): {
    groundHeight: number;
    isValid: boolean;
    correction: THREE.Vector3;
  };
}

export interface GroundPositionResult {
  position: THREE.Vector3;
  method: 'terrain' | 'ground-checking' | 'raycast' | 'fallback';
  success: boolean;
  originalHeight?: number;
  groundHeight?: number;
}

/**
 * Get proper ground position for any entity using multiple fallback methods
 * Matches the same logic used in RPGPlayerSpawnSystem.positionPlayerOnGround()
 */
export function getGroundPosition(
  world: World,
  x: number,
  z: number,
  yOffset: number = 1.8
): GroundPositionResult {
  // Validate input coordinates
  if (typeof x !== 'number' || isNaN(x)) {
    console.warn(`[GroundPositioning] Invalid x coordinate: ${x}, using 0`);
    x = 0;
  }
  if (typeof z !== 'number' || isNaN(z)) {
    console.warn(`[GroundPositioning] Invalid z coordinate: ${z}, using 0`);
    z = 0;
  }

  // Method 1: Use terrain system if available
  const terrainSystem = world.getSystem<TerrainSystem>('terrain');
  if (terrainSystem) {
    let groundHeight: number | null = null;
    
    // Try getHeightAtPosition first
    if ('getHeightAtPosition' in terrainSystem && terrainSystem.getHeightAtPosition && typeof terrainSystem.getHeightAtPosition === 'function') {
      groundHeight = terrainSystem.getHeightAtPosition(x, z);
    }
    
    // Fallback to getHeightAt if first method failed
    if ((groundHeight === null || isNaN(groundHeight)) && 'getHeightAt' in terrainSystem && terrainSystem.getHeightAt && typeof terrainSystem.getHeightAt === 'function') {
      groundHeight = terrainSystem.getHeightAt(x, z);
    }
    
    if (groundHeight !== null && !isNaN(groundHeight)) {
      const position = new THREE.Vector3(x, groundHeight + yOffset, z);
      return {
        position,
        method: 'terrain',
        success: true,
        groundHeight,
        originalHeight: 0
      };
    } else {
      console.warn(`[GroundPositioning] Terrain system returned invalid height: ${groundHeight}`);
    }
  } else {
    // No terrain system available, continue to next method
  }

  // Method 2: Use world raycast
  if (world.raycast) {
    const origin = new THREE.Vector3(x, 1000, z); // Start high above
    const direction = new THREE.Vector3(0, -1, 0); // Ray down
    
    const hit = world.raycast(origin, direction, 2000);
    if (hit && hit.point) {
      const position = new THREE.Vector3(x, hit.point.y + yOffset, z);
      return {
        position,
        method: 'raycast',
        success: true,
        groundHeight: hit.point.y,
        originalHeight: 0
      };
    } else {
      console.warn(`[GroundPositioning] Raycast did not hit terrain`);
    }
  }

  // Method 3: Use ground checking system
  const groundCheckingSystem = world.getSystem<GroundCheckingSystem>('ground-checking');
  if (groundCheckingSystem) {
    const testPosition = new THREE.Vector3(x, 100, z); // Start high
    const groundResult = groundCheckingSystem.getGroundHeight(testPosition);
    
    if (groundResult.isValid) {
      const position = new THREE.Vector3(x, groundResult.groundHeight + yOffset, z);
      return {
        position,
        method: 'ground-checking',
        success: true,
        groundHeight: groundResult.groundHeight,
        originalHeight: 0
      };
    } else {
      console.warn(`[GroundPositioning] Ground checking system returned invalid result`);
    }
  } else {
    // No ground checking system available, continue to fallback method
  }

  // Final fallback: use provided offset as absolute height
  console.warn(`[GroundPositioning] ❌ Could not determine ground height, using fallback height of ${yOffset}m`);
  const position = new THREE.Vector3(x, yOffset, z);
  return {
    position,
    method: 'fallback',
    success: false,
    originalHeight: 0
  };
}

/**
 * Get ground position for a test player (uses player-appropriate offset)
 */
export function getTestPlayerGroundPosition(world: World, x: number, z: number): GroundPositionResult {
  return getGroundPosition(world, x, z, 1.8); // Player height offset
}

/**
 * Get ground position for a test mob (uses mob-appropriate offset)
 */
export function getTestMobGroundPosition(world: World, x: number, z: number): GroundPositionResult {
  return getGroundPosition(world, x, z, 1.3); // Mob height offset (shorter than players)
}

/**
 * Get ground position for a test item (uses minimal offset)
 */
export function getTestItemGroundPosition(world: World, x: number, z: number): GroundPositionResult {
  return getGroundPosition(world, x, z, 0.3); // Item height offset (just above ground)
}

/**
 * Get ground position for a test resource (uses minimal offset)
 */
export function getTestResourceGroundPosition(world: World, x: number, z: number): GroundPositionResult {
  return getGroundPosition(world, x, z, 0.1); // Resource height offset (nearly on ground)
}

/**
 * Helper to fix existing position objects that might have y=0
 */
export function fixPositionIfAtGroundLevel(
  world: World,
  position: { x: number; y: number; z: number },
  entityType: 'player' | 'mob' | 'item' | 'resource' = 'player'
): { x: number; y: number; z: number } {
  // Validate input position
  const validatedPosition = {
    x: (typeof position?.x === 'number' && !isNaN(position.x)) ? position.x : 0,
    y: (typeof position?.y === 'number' && !isNaN(position.y)) ? position.y : 0,
    z: (typeof position?.z === 'number' && !isNaN(position.z)) ? position.z : 0
  };
  
  // Silently handle invalid positions
  
  position = validatedPosition;
  // If position is at or near ground level, fix it
  if (position.y <= 0.5) {
    
    let result: GroundPositionResult;
    switch (entityType) {
      case 'player':
        result = getTestPlayerGroundPosition(world, position.x, position.z);
        break;
      case 'mob':
        result = getTestMobGroundPosition(world, position.x, position.z);
        break;
      case 'item':
        result = getTestItemGroundPosition(world, position.x, position.z);
        break;
      case 'resource':
        result = getTestResourceGroundPosition(world, position.x, position.z);
        break;
      default:
        result = getTestPlayerGroundPosition(world, position.x, position.z);
    }
    
    const fixedPosition = {
      x: result.position.x,
      y: result.position.y,
      z: result.position.z
    };
    
    return fixedPosition;
  }
  
  // Position is already OK
  return position;
}