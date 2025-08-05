/**
 * Helper utilities for terrain operations
 */

import * as THREE from '../extras/three';

export interface TerrainTile {
  x: number;
  z: number;
  key: string;
  mesh?: THREE.Mesh;
  heightData?: Float32Array;
  biome?: string;
  resources?: Array<{ type: string; position: THREE.Vector3 }>;
  roads?: Array<{ start: THREE.Vector2; end: THREE.Vector2 }>;
  lakes?: Array<{ position: THREE.Vector3; radius: number }>;
}

export interface TerrainConfig {
  tileSize: number;
  segmentsPerTile: number;
  maxLoadedTiles: number;
  worldSize: number;
  worldHalfSize: number;
  chunkSize: number;
}

/**
 * Generate a unique key for a tile position
 */
export function getTileKey(x: number, z: number): string {
  return `${x},${z}`;
}

/**
 * Parse tile coordinates from a key
 */
export function parseTileKey(key: string): { x: number; z: number } {
  const [x, z] = key.split(',').map(Number);
  return { x, z };
}

/**
 * Convert world position to tile coordinates
 */
export function worldToTileCoords(
  worldX: number, 
  worldZ: number, 
  tileSize: number
): { tileX: number; tileZ: number } {
  const tileX = Math.floor(worldX / tileSize);
  const tileZ = Math.floor(worldZ / tileSize);
  return { tileX, tileZ };
}

/**
 * Convert tile coordinates to world position (center of tile)
 */
export function tileToWorldCoords(
  tileX: number, 
  tileZ: number, 
  tileSize: number
): { worldX: number; worldZ: number } {
  const worldX = (tileX + 0.5) * tileSize;
  const worldZ = (tileZ + 0.5) * tileSize;
  return { worldX, worldZ };
}

/**
 * Get local position within a tile
 */
export function getLocalTilePosition(
  worldX: number,
  worldZ: number,
  tileX: number,
  tileZ: number,
  tileSize: number
): { localX: number; localZ: number } {
  const localX = worldX - tileX * tileSize;
  const localZ = worldZ - tileZ * tileSize;
  return { localX, localZ };
}

/**
 * Calculate distance between two tiles
 */
export function getTileDistance(
  tile1: { x: number; z: number },
  tile2: { x: number; z: number }
): number {
  const dx = tile2.x - tile1.x;
  const dz = tile2.z - tile1.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Get all tiles within a radius
 */
export function getTilesInRadius(
  centerX: number,
  centerZ: number,
  radius: number
): Array<{ x: number; z: number }> {
  const tiles: Array<{ x: number; z: number }> = [];
  const radiusSq = radius * radius;
  
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz <= radiusSq) {
        tiles.push({ x: centerX + dx, z: centerZ + dz });
      }
    }
  }
  
  return tiles;
}

/**
 * Check if position is within world bounds
 */
export function isWithinWorldBounds(
  worldX: number,
  worldZ: number,
  worldBounds: { min: { x: number; z: number }; max: { x: number; z: number } }
): boolean {
  return worldX >= worldBounds.min.x && 
         worldX <= worldBounds.max.x &&
         worldZ >= worldBounds.min.z && 
         worldZ <= worldBounds.max.z;
}

/**
 * Simple 2D noise function for terrain generation
 */
export function noise2D(x: number, y: number): number {
  const n = Math.sin(x * 0.01) * Math.cos(y * 0.01) +
           Math.sin(x * 0.05) * Math.cos(y * 0.05) * 0.5 +
           Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.25;
  return (n + 1.75) / 3.5; // Normalize to 0-1
}

/**
 * Calculate terrain slope at a position
 */
export function calculateSlope(
  heights: { nw: number; ne: number; sw: number; se: number },
  tileSize: number
): number {
  const dx = (heights.ne + heights.se - heights.nw - heights.sw) / (2 * tileSize);
  const dz = (heights.sw + heights.se - heights.nw - heights.ne) / (2 * tileSize);
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Interpolate height between four corners
 */
export function bilinearInterpolate(
  heights: { nw: number; ne: number; sw: number; se: number },
  fracX: number,
  fracZ: number
): number {
  const n = heights.nw * (1 - fracX) + heights.ne * fracX;
  const s = heights.sw * (1 - fracX) + heights.se * fracX;
  return n * (1 - fracZ) + s * fracZ;
}