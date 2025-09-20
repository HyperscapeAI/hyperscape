/**
 * Type validation utilities for core nodes
 * Provides consistent type checking across the codebase
 */

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// Specific validation functions
export function isValidColor(value: unknown): value is string {
  return isString(value) && (
    value.startsWith('#') || 
    value.startsWith('rgb') || 
    value.startsWith('hsl') ||
    /^[a-z]+$/i.test(value) // Basic color names
  );
}

export function isValidUrl(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return value.startsWith('/') || value.startsWith('./') || value.startsWith('../');
  }
}