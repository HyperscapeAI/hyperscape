/**
 * Utility functions for RPG type conversions and helpers
 * 
 * This file contains strongly-typed utility functions for working with Position3D
 * and THREE.js Vector3 types, ensuring type safety across position calculations.
 */

import type { Position3D } from './core';
import * as THREE from '../../core/extras/three';

// Position conversion utilities
export function toVector3(pos: Position3D | THREE.Vector3): THREE.Vector3 {
  if (pos instanceof THREE.Vector3) {
    return pos;
  }
  return new THREE.Vector3(pos.x, pos.y, pos.z);
}

export function toPosition3D(pos: Position3D | THREE.Vector3): Position3D {
  return { x: pos.x, y: pos.y, z: pos.z };
}

// Position comparison
export function positionsEqual(a: Position3D, b: Position3D, tolerance = 0.001): boolean {
  return (
    Math.abs(a.x - b.x) < tolerance &&
    Math.abs(a.y - b.y) < tolerance &&
    Math.abs(a.z - b.z) < tolerance
  );
}

// Distance calculation
export function distance3D(a: Position3D, b: Position3D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Linear interpolation (alpha should be between 0 and 1)
export function lerpPosition(from: Position3D, to: Position3D, alpha: number): Position3D {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return {
    x: from.x + (to.x - from.x) * clampedAlpha,
    y: from.y + (to.y - from.y) * clampedAlpha,
    z: from.z + (to.z - from.z) * clampedAlpha
  };
}

// Clamping utilities
export function clampPosition(pos: Position3D, min: Position3D, max: Position3D): Position3D {
  return {
    x: Math.max(min.x, Math.min(max.x, pos.x)),
    y: Math.max(min.y, Math.min(max.y, pos.y)),
    z: Math.max(min.z, Math.min(max.z, pos.z))
  };
}

// Direction utilities
export function normalizeDirection(dir: Position3D): Position3D {
  const length = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
  if (length === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: dir.x / length,
    y: dir.y / length,
    z: dir.z / length
  };
}

export function getDirection(from: Position3D, to: Position3D): Position3D {
  const dir = {
    x: to.x - from.x,
    y: to.y - from.y,
    z: to.z - from.z
  };
  return normalizeDirection(dir);
}

// Angle utilities
export function getYawAngle(from: Position3D, to: Position3D): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(dz, dx);
}

// Grid utilities
export function snapToGrid(pos: Position3D, gridSize = 1): Position3D {
  return {
    x: Math.round(pos.x / gridSize) * gridSize,
    y: Math.round(pos.y / gridSize) * gridSize,
    z: Math.round(pos.z / gridSize) * gridSize
  };
}

// Random position utilities
export function randomPositionInRadius(center: Position3D, radius: number, minRadius = 0): Position3D {
  if (radius < minRadius) throw new Error('radius must be >= minRadius');
  const angle = Math.random() * Math.PI * 2;
  const distance = minRadius + Math.random() * (radius - minRadius);
  return {
    x: center.x + Math.cos(angle) * distance,
    y: center.y,
    z: center.z + Math.sin(angle) * distance
  };
}

// Bounds checking
export function isInBounds(pos: Position3D, min: Position3D, max: Position3D): boolean {
  return (
    pos.x >= min.x && pos.x <= max.x &&
    pos.y >= min.y && pos.y <= max.y &&
    pos.z >= min.z && pos.z <= max.z
  );
}

// Array utilities
export function averagePosition(positions: Position3D[]): Position3D {
  if (positions.length === 0) return { x: 0, y: 0, z: 0 };
  
  const sum = positions.reduce((acc, pos) => ({
    x: acc.x + pos.x,
    y: acc.y + pos.y,
    z: acc.z + pos.z
  }), { x: 0, y: 0, z: 0 });
  
  return {
    x: sum.x / positions.length,
    y: sum.y / positions.length,
    z: sum.z / positions.length
  };
}