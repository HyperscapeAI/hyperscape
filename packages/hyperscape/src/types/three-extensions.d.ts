import * as THREE from '../core/extras/three';
import type PhysX from '@hyperscape/physx-js-webidl';

declare module 'three' {
  // Vector3 extensions for PhysX integration
  interface Vector3 {
    fromPxVec3?(pxVec3: PhysX.PxVec3): this;
    toPxVec3?(pxVec3?: PhysX.PxVec3): PhysX.PxVec3 | null;
    toPxExtVec3?(pxExtVec3?: PhysX.PxVec3): PhysX.PxVec3 | null;
    toPxTransform?(pxTransform: PhysX.PxTransform): void;
  }

  // Quaternion extensions for PhysX integration
  interface Quaternion {
    toPxTransform?(pxTransform: PhysX.PxTransform): void;
  }

  // Matrix4 extensions for PhysX integration
  interface Matrix4 {
    toPxTransform?(pxTransform: PhysX.PxTransform): void;
  }

  // Euler extensions
  interface Euler {
    onChange?(callback: () => void): void;
    _onChange?: () => void;
  }

  // Object3D extensions for Hyperscape
  interface Object3D {
    activate?(context: { world: unknown; entity: any }): void;
    deactivate?(): void;
    disableRateCheck?(): void;
    active?: boolean;
    getHeadToHeight?(): number;
    height?: number;
    setEmote?(emote: string): void;
    getBoneTransform?(boneName: string): Matrix4 | null;
    label?: string;
    health?: number;
    value?: string;
    updateTransform?(): void;
    userData: {
      [key: string]: unknown;
      vrm?: {
        humanoid?: {
          getRawBone?(name: string): { node: Object3D };
        };
      };
    };
    // Shadow extensions
    shadow?: {
      camera?: Camera | null;
    };
    _listeners?: { [event: string]: Function[] };
  }

  // Material extensions
  interface Material {
    userData: {
      [key: string]: unknown;
      wind?: boolean;
    };
    // Dynamic material properties for texture access
    [key: string]: unknown;
  }

  // Mesh extensions
  interface Mesh {
    isSkinnedMesh?: boolean;
    morphTargetDictionary?: { [key: string]: number };
    morphTargetInfluences?: number[];
    userData: {
      [key: string]: unknown;
      entityId?: string;
      entityType?: string;
    };
  }

  // SkinnedMesh extensions
  interface SkinnedMesh {
    isSkinnedMesh: true;
  }

  // Texture extensions
  interface Texture {
    image: {
      width?: number;
      height?: number;
      data?: unknown;
      [key: string]: unknown;
    };
  }

  // WebGLRenderer extensions
  interface WebGLRenderer {
    setAnimationLoop(callback: ((time: number) => void) | null): void;
  }

  // Camera extensions
  interface Camera {
    matrixWorldInverse: Matrix4;
    projectionMatrix: Matrix4;
    projectionMatrixInverse: Matrix4;
    matrixWorld: Matrix4;
  }
}

// Additional type definitions for specific THREE.js patterns
export interface HyperscapeObject3D extends THREE.Object3D {
  activate?(context: { world: unknown; entity: any }): void;
  deactivate?(): void;
  disableRateCheck?(): void;
  active?: boolean;
  getHeadToHeight?(): number;
  height?: number;
  setEmote?(emote: string): void;
  getBoneTransform?(boneName: string): THREE.Matrix4 | null;
  label?: string;
  health?: number;
  value?: string;
  updateTransform?(): void;
}

export interface HyperscapeMaterial extends THREE.Material {
  userData: {
    [key: string]: unknown;
    wind?: boolean;
  };
}

export interface HyperscapeMesh extends THREE.Mesh {
  userData: {
    [key: string]: unknown;
    entityId?: string;
    entityType?: string;
  };
}

// UserData interface for resource nodes
export interface ResourceUserData {
  id: string;
  type: string;
  resourceType: string;
  interactable: boolean;
}

// UserData interface for entities  
export interface EntityUserData {
  entityId: string;
  entityType: string;
}

// UserData interface for general game objects
export interface GameObjectUserData {
  id: string;
  type?: string;
  [key: string]: unknown;
}

// Common CSS style properties for React components
export interface CSSStyleProperties {
  pointerEvents?: 'auto' | 'none' | string;
  position?: 'relative' | 'absolute' | 'fixed' | 'static' | 'sticky' | string;
  alignItems?: 'center' | 'flex-start' | 'flex-end' | 'stretch' | 'baseline' | string;
  justifyContent?: 'center' | 'flex-start' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly' | string;
  [key: string]: unknown;
}