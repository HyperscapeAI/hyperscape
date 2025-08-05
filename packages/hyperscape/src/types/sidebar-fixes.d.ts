// Type fixes for Sidebar.tsx

import * as THREE from '../extras/three';

// Extend THREE.js Euler to accept number array
declare module 'three' {
  interface Euler {
    fromArray(array: number[]): Euler;
  }
}

// Fix for storage module if not already fixed
declare module '../../storage' {
  export const storage: {
    get(key: string, defaultValue?: unknown): unknown;
    set(key: string, value: unknown): void;
  } | undefined;
}

// Add missing properties to fields
declare module './Fields' {
  export interface FieldCurveProps {
    label: string;
    hint?: string;
    x?: string;
    xRange?: number;
    y?: string;
    yMin?: number;
    yMax?: number;
    value: unknown;
    onChange: (value: string) => void;
  }
} 