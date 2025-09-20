import { Component } from './Component';
import type { Entity } from '../entities/Entity';
import THREE from '../extras/three';

/**
 * Transform Component
 * 
 * Stores position, rotation, and scale data for an entity.
 * This is automatically synced with the entity's Three.js node.
 */
export class TransformComponent extends Component {
  constructor(entity: Entity, data: {
    position?: THREE.Vector3 | { x?: number; y?: number; z?: number };
    rotation?: THREE.Quaternion | { x?: number; y?: number; z?: number; w?: number };
    scale?: THREE.Vector3 | { x?: number; y?: number; z?: number };
  } = {}) {
    const position = data.position || { x: 0, y: 0, z: 0 };
    const rotation = data.rotation || { x: 0, y: 0, z: 0, w: 1 };
    const scale = data.scale || { x: 1, y: 1, z: 1 };
    super('transform', entity, {
      position: position instanceof THREE.Vector3 
        ? position 
        : new THREE.Vector3(position.x, position.y, position.z),
      rotation: rotation instanceof THREE.Quaternion
        ? rotation
        : new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
      scale: scale instanceof THREE.Vector3
        ? scale
        : new THREE.Vector3(scale.x, scale.y, scale.z),
    });
  }
  
  get position(): THREE.Vector3 {
    return this.get<THREE.Vector3>('position');
  }
  
  set position(value: THREE.Vector3 | { x: number; y: number; z: number }) {
    const currentPosition = this.get<THREE.Vector3>('position');
    if (value instanceof THREE.Vector3) {
      currentPosition.copy(value);
    } else {
      currentPosition.set(value.x, value.y, value.z);
    }
    this.syncToNode();
  }
  
  get rotation(): THREE.Quaternion {
    return this.get<THREE.Quaternion>('rotation');
  }
  
  set rotation(value: THREE.Quaternion | { x: number; y: number; z: number; w: number }) {
    const currentRotation = this.get<THREE.Quaternion>('rotation');
    if (value instanceof THREE.Quaternion) {
      currentRotation.copy(value);
    } else {
      currentRotation.set(value.x, value.y, value.z, value.w);
    }
    this.syncToNode();
  }
  
  get scale(): THREE.Vector3 {
    return this.get<THREE.Vector3>('scale');
  }
  
  set scale(value: THREE.Vector3 | { x: number; y: number; z: number }) {
    const currentScale = this.get<THREE.Vector3>('scale');
    if (value instanceof THREE.Vector3) {
      currentScale.copy(value);
    } else {
      currentScale.set(value.x, value.y, value.z);
    }
    this.syncToNode();
  }
  
  // Sync component data to the entity's Three.js node
  private syncToNode(): void {
    if (this.entity.node) {
      const pos = this.position;
      const rot = this.rotation;
      const scale = this.scale;
      
      this.entity.node.position.set(pos.x, pos.y, pos.z);
      this.entity.node.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      this.entity.node.scale.set(scale.x, scale.y, scale.z);
    }
  }
  
  init(): void {
    // Initial sync to node
    this.syncToNode();
  }
}