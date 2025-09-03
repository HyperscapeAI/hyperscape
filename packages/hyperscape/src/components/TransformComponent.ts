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
    super('transform', entity, {
      position: data.position instanceof THREE.Vector3 
        ? data.position 
        : new THREE.Vector3(data.position?.x || 0, data.position?.y || 0, data.position?.z || 0),
      rotation: data.rotation instanceof THREE.Quaternion
        ? data.rotation
        : new THREE.Quaternion(data.rotation?.x || 0, data.rotation?.y || 0, data.rotation?.z || 0, data.rotation?.w || 1),
      scale: data.scale instanceof THREE.Vector3
        ? data.scale
        : new THREE.Vector3(data.scale?.x || 1, data.scale?.y || 1, data.scale?.z || 1),
      ...data
    });
  }
  
  get position(): THREE.Vector3 {
    const pos = this.get<THREE.Vector3 | { x?: number; y?: number; z?: number }>('position');
    if (pos instanceof THREE.Vector3) {
      return pos;
    }
    // Convert plain object to THREE.Vector3
    return new THREE.Vector3(pos?.x || 0, pos?.y || 0, pos?.z || 0);
  }
  
  set position(value: THREE.Vector3 | { x: number; y: number; z: number }) {
    const vec3 = value instanceof THREE.Vector3 
      ? value 
      : new THREE.Vector3(value.x, value.y, value.z);
    this.set('position', vec3);
    this.syncToNode();
  }
  
  get rotation(): THREE.Quaternion {
    const rot = this.get<THREE.Quaternion | { x?: number; y?: number; z?: number; w?: number }>('rotation');
    if (rot instanceof THREE.Quaternion) {
      return rot;
    }
    // Convert plain object to THREE.Quaternion
    return new THREE.Quaternion(rot?.x || 0, rot?.y || 0, rot?.z || 0, rot?.w || 1);
  }
  
  set rotation(value: THREE.Quaternion | { x: number; y: number; z: number; w: number }) {
    const quat = value instanceof THREE.Quaternion
      ? value
      : new THREE.Quaternion(value.x, value.y, value.z, value.w);
    this.set('rotation', quat);
    this.syncToNode();
  }
  
  get scale(): THREE.Vector3 {
    const scale = this.get<THREE.Vector3 | { x?: number; y?: number; z?: number }>('scale');
    if (scale instanceof THREE.Vector3) {
      return scale;
    }
    // Convert plain object to THREE.Vector3
    return new THREE.Vector3(scale?.x || 1, scale?.y || 1, scale?.z || 1);
  }
  
  set scale(value: THREE.Vector3 | { x: number; y: number; z: number }) {
    const vec3 = value instanceof THREE.Vector3 
      ? value 
      : new THREE.Vector3(value.x, value.y, value.z);
    this.set('scale', vec3);
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