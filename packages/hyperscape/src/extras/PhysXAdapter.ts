/**
 * PhysXAdapter - Safe PhysX Integration
 * 
 * Replaces dangerous prototype pollution with safe adapter pattern.
 * Provides type-safe conversion between THREE.js and PhysX types.
 */

import * as THREE from './three';
import type PhysX from '@hyperscape/physx-js-webidl';

// Global PHYSX declaration
declare const PHYSX: typeof PhysX;

export interface PhysXAvailable {
  available: boolean;
  error?: string;
}

/**
 * Check if PhysX is available and properly initialized
 */
export function checkPhysXAvailability(): PhysXAvailable {
  if (typeof PHYSX === 'undefined') {
    return { available: false, error: 'PHYSX not loaded' };
  }

  return { available: true };
}

/**
 * Safe PhysX adapter that doesn't pollute prototypes
 */
export class PhysXAdapter {
  private static _pxVec3?: PhysX.PxVec3;
  private static _tempVec3 = new THREE.Vector3();
  private static _tempQuat = new THREE.Quaternion();
  private static _tempScale = new THREE.Vector3();

  /**
   * Get or create reusable PxVec3 instance
   */
  private static getPxVec3(): PhysX.PxVec3 {
    if (!this._pxVec3) {
      const availability = checkPhysXAvailability();
      if (!availability.available) {
        throw new Error(`PhysX not available: ${availability.error}`);
      }
      this._pxVec3 = new PHYSX.PxVec3();
    }
    return this._pxVec3;
  }

  /**
   * Convert THREE.Vector3 to PhysX.PxVec3
   */
  static vector3ToPxVec3(vector3: THREE.Vector3, target?: PhysX.PxVec3): PhysX.PxVec3 {
    const pxVec3 = target || this.getPxVec3();
    pxVec3.x = vector3.x;
    pxVec3.y = vector3.y;
    pxVec3.z = vector3.z;
    return pxVec3;
  }

  /**
   * Convert PhysX.PxVec3 to THREE.Vector3
   */
  static pxVec3ToVector3(pxVec3: PhysX.PxVec3, target?: THREE.Vector3): THREE.Vector3 {
    const vector3 = target || new THREE.Vector3();
    vector3.x = pxVec3.x;
    vector3.y = pxVec3.y;
    vector3.z = pxVec3.z;
    return vector3;
  }

  /**
   * Convert THREE.Vector3 to PhysX.PxVec3
   */
  static vector3ToPxExtVec3(vector3: THREE.Vector3, target: PhysX.PxVec3): PhysX.PxVec3 {
    target.x = vector3.x;
    target.y = vector3.y;
    target.z = vector3.z;
    return target;
  }

  /**
   * Set PhysX.PxTransform position from THREE.Vector3
   */
  static setTransformPosition(transform: PhysX.PxTransform, position: THREE.Vector3): void {
    transform.p.x = position.x;
    transform.p.y = position.y;
    transform.p.z = position.z;
  }

  /**
   * Set PhysX.PxTransform rotation from THREE.Quaternion
   */
  static setTransformRotation(transform: PhysX.PxTransform, quaternion: THREE.Quaternion): void {
    transform.q.x = quaternion.x;
    transform.q.y = quaternion.y;
    transform.q.z = quaternion.z;
    transform.q.w = quaternion.w;
  }

  /**
   * Set PhysX.PxTransform from THREE.Matrix4 (decomposes matrix)
   */
  static setTransformFromMatrix4(transform: PhysX.PxTransform, matrix: THREE.Matrix4): void {
    matrix.decompose(this._tempVec3, this._tempQuat, this._tempScale);
    this.setTransformPosition(transform, this._tempVec3);
    this.setTransformRotation(transform, this._tempQuat);
  }

  /**
   * Create a new PhysX.PxTransform from THREE.js transform data
   */
  static createTransform(
    position: THREE.Vector3, 
    quaternion: THREE.Quaternion
  ): PhysX.PxTransform | null {
    const availability = checkPhysXAvailability();
    if (!availability.available) {
      console.error('Cannot create PhysX transform:', availability.error);
      return null;
    }

    try {
      const transform = new PHYSX.PxTransform();
      this.setTransformPosition(transform, position);
      this.setTransformRotation(transform, quaternion);
      return transform;
    } catch (error) {
      console.error('Failed to create PhysX transform:', error);
      return null;
    }
  }

  /**
   * Safe helper to check if we can use PhysX functionality
   */
  static isAvailable(): boolean {
    return checkPhysXAvailability().available;
  }
}