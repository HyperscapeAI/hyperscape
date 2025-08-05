import type { PxTransform, PxVec3 } from '../../types/physx'
import type PhysX from '@hyperscape/physx-js-webidl'
import * as THREE from './three'
import { setTransformPosition, vector3ToPxVec3 } from '../physics/vector-conversions'

/**
 * A wrapper around THREE.Vector3 that provides change detection
 * Used for reactive updates in Node transforms
 */
export class ReactiveVector3 {
  private _vector: THREE.Vector3
  private _onChange?: () => void

  constructor(x = 0, y = 0, z = 0) {
    this._vector = new THREE.Vector3(x, y, z)
  }

  get x(): number {
    return this._vector.x
  }

  set x(value: number) {
    this._vector.x = value
    this._onChange?.()
  }

  get y(): number {
    return this._vector.y
  }

  set y(value: number) {
    this._vector.y = value
    this._onChange?.()
  }

  get z(): number {
    return this._vector.z
  }

  set z(value: number) {
    this._vector.z = value
    this._onChange?.()
  }

  set(x: number, y: number, z: number): this {
    this._vector.set(x, y, z)
    this._onChange?.()
    return this
  }

  copy(v: THREE.Vector3 | ReactiveVector3): this {
    if (v instanceof ReactiveVector3) {
      this._vector.copy(v._vector)
    } else {
      this._vector.copy(v)
    }
    this._onChange?.()
    return this
  }

  fromArray(array: number[] | Float32Array, offset = 0): this {
    this._vector.fromArray(array, offset)
    this._onChange?.()
    return this
  }

  toArray(array?: number[], offset = 0): number[] {
    return this._vector.toArray(array, offset)
  }

  clone(): ReactiveVector3 {
    return new ReactiveVector3(this.x, this.y, this.z)
  }

  // Get the underlying THREE.Vector3 for compatibility
  get vector3(): THREE.Vector3 {
    return this._vector
  }

  // Set the change callback
  onChange(callback: () => void): this {
    this._onChange = callback
    return this
  }

  // PhysX conversion methods (delegated to vector-conversions)
  toPxVec3(pxVec3?: PxVec3): PhysX.PxVec3 | undefined {
    return vector3ToPxVec3(this._vector, pxVec3) as PhysX.PxVec3 | undefined
  }

  toPxExtVec3(pxExtVec3?: PxVec3): PhysX.PxVec3 | undefined {
    return vector3ToPxVec3(this._vector, pxExtVec3) || undefined
  }

  toPxTransform(pxTransform: PxTransform): void {
    setTransformPosition(pxTransform, this._vector)
  }
}