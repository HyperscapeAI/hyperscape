/**
 * Base types for the Hyperscape system
 * 
 * These are fundamental types that are used throughout the system
 * and should not have dependencies on other type files to avoid circular imports.
 */

// Core position interfaces - plain objects without methods
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Position2D {
  x: number;
  y: number;
}

// Deprecated aliases - use Position3D/Position2D instead
export type Vector3D = Position3D;
export type Vector2D = Position2D;

// Core entity data interface
export interface EntityData {
  id: string;
  type: string;
  name?: string;
  owner?: string;
  active?: boolean;
  visible?: boolean;
  // Player-specific properties
  userId?: string;
  emote?: string;
  avatar?: string;
  sessionAvatar?: string;
  roles?: string[];
  // Effect data for any entity
  effect?: {
    anchorId?: string;
    snare?: number;
    freeze?: boolean;
    turn?: boolean;
    emote?: string;
    duration?: number;
    cancellable?: boolean;
  };
  // Allow additional properties
  [key: string]: unknown;
}

// Component data interface
export interface ComponentData {
  type: string;
  data: unknown;
}