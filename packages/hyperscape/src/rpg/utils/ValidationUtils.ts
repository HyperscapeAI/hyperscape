/**
 * Common validation utilities to reduce boilerplate
 */

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate a position object has required numeric properties
 */
export function validatePosition(pos: unknown, name: string = 'position'): ValidationResult {
  if (!pos || typeof pos !== 'object') {
    return { isValid: false, error: `${name} is required and must be an object` };
  }
  
  const position = pos as Record<string, unknown>;
  
  if (typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
    return { 
      isValid: false, 
      error: `${name} must have numeric x, y, z properties, got: ${JSON.stringify(pos)}` 
    };
  }
  
  return { isValid: true };
}

/**
 * Assert a condition is true, throw descriptive error if not
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Validate required string parameter
 */
export function validateString(value: unknown, name: string): ValidationResult {
  if (!value || typeof value !== 'string') {
    return { isValid: false, error: `${name} must be a non-empty string` };
  }
  return { isValid: true };
}

/**
 * Validate numeric parameter with optional range
 */
export function validateNumber(
  value: unknown, 
  name: string, 
  options?: { min?: number; max?: number }
): ValidationResult {
  if (typeof value !== 'number' || isNaN(value)) {
    return { isValid: false, error: `${name} must be a valid number` };
  }
  
  if (options?.min !== undefined && value < options.min) {
    return { isValid: false, error: `${name} must be at least ${options.min}` };
  }
  
  if (options?.max !== undefined && value > options.max) {
    return { isValid: false, error: `${name} must be at most ${options.max}` };
  }
  
  return { isValid: true };
}

/**
 * Validate movement parameters in one call
 */
export function validateMovementParams(params: {
  playerId: unknown;
  targetPosition: unknown;
  currentPosition: unknown;
}): void {
  const playerResult = validateString(params.playerId, 'playerId');
  if (!playerResult.isValid) throw new Error(playerResult.error);
  
  const targetResult = validatePosition(params.targetPosition, 'targetPosition');
  if (!targetResult.isValid) throw new Error(targetResult.error);
  
  const currentResult = validatePosition(params.currentPosition, 'currentPosition');
  if (!currentResult.isValid) throw new Error(currentResult.error);
}

/**
 * Calculate distance and validate it's within reasonable bounds
 */
export function calculateAndValidateDistance(
  pos1: Position3D, 
  pos2: Position3D,
  maxDistance: number = 1000
): number {
  const dx = pos2.x - pos1.x;
  const dz = pos2.z - pos1.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  
  if (distance > maxDistance) {
    throw new Error(`Distance ${distance}m exceeds maximum allowed ${maxDistance}m`);
  }
  
  return distance;
}