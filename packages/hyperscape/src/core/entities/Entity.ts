import type {
  Entity as IEntity,
  Quaternion,
  Vector3
} from '../../types';
import type { EntityData } from '../../types/index';
import { Component, createComponent } from '../components';
import * as THREE from '../extras/three';
import { getPhysX } from '../PhysXManager';
import { type PhysXRigidDynamic } from '../systems/Physics';
import { getWorldNetwork } from '../utils/SystemUtils';
import type { World } from '../World';
import { EventType } from '../../types/events';

export class Entity implements IEntity {
  world: World;
  data: EntityData;
  id: string;
  name: string;
  type: string;
  node: THREE.Object3D<THREE.Object3DEventMap>;
  components: Map<string, Component>;
  velocity: Vector3;
  isPlayer: boolean;
  active: boolean = true;
  destroyed: boolean = false;
  
  // Physics body reference
  private rigidBody?: PhysXRigidDynamic;
  
  // Additional properties for plugin compatibility
  metadata?: Record<string, unknown>;
  
  constructor(world: World, data: EntityData, local?: boolean) {
    this.world = world;
    this.data = data;
    this.id = data.id;
    this.name = data.name || 'entity';
    this.type = data.type || 'generic';
    this.isPlayer = data.type === 'player';
    
    // Initialize components map
    this.components = new Map();
    
    // Create Three.js node
    this.node = new THREE.Object3D() as THREE.Object3D<THREE.Object3DEventMap>;
    this.node.name = this.name;
    this.node.userData.entity = this;
    
    // Set default transform values - no longer read from EntityData
    this.node.position.set(0, 0, 0);
    this.node.quaternion.set(0, 0, 0, 1);
    this.node.scale.set(1, 1, 1); // Always assume scale of 1,1,1
    
    // Initialize velocity as THREE.Vector3
    this.velocity = new THREE.Vector3(0, 0, 0);
    
    // Add to world scene
    if (this.world.stage.scene) {
      this.world.stage.scene.add(this.node);
    }
    
    // Automatically add transform component for ECS architecture
    this.addComponent('transform', {
      position: this.position,
      rotation: this.rotation,
      scale: this.scale
    });
    
    // Network sync for local entities
    const network = getWorldNetwork(this.world);
    if (local && network) {
      network.send('entityAdded', this.serialize());
    }
  }
  
  // Transform getters - return THREE.Vector3 instances
  get position(): Vector3 {
    return this.node.position;
  }
  
  set position(value: Vector3) {
    this.node.position.set(value.x, value.y, value.z);
    this.syncPhysicsTransform();
  }
  
  get rotation(): Quaternion {
    return this.node.quaternion.clone();
  }
  
  set rotation(value: Quaternion) {
    this.node.quaternion.set(value.x, value.y, value.z, value.w);
    this.syncPhysicsTransform();
  }
  
  get scale(): Vector3 {
    // Strong type assumption - node.scale is always Vector3
    return this.node.scale;
  }
  
  set scale(value: Vector3) {
    this.node.scale.set(value.x, value.y, value.z);
  }
  
  // Transform convenience methods
  setPosition(x: number, y: number, z: number): void {
    this.node.position.set(x, y, z);
    this.syncPhysicsTransform();
  }
  
  setRotation(x: number, y: number, z: number, w: number): void {
    this.node.quaternion.set(x, y, z, w);
    this.syncPhysicsTransform();
  }
  
  setScale(x: number = 1, y: number = 1, z: number = 1): void {
    this.node.scale.set(x, y, z);
  }
  
  // Component management
  addComponent<T extends Component = Component>(type: string, data?: Record<string, unknown>): T {
    // Check if component already exists
    if (this.components.has(type)) {
      console.warn(`Entity ${this.id} already has component ${type}`);
      // Strong type assumption - component is guaranteed to exist and be of correct type
      return this.components.get(type)! as T;
    }
    
    // Create component using the registry
    const component = createComponent(type, this, data);
    if (!component) {
      throw new Error(`Failed to create component of type: ${type}`);
    }
    
    // Store component
    this.components.set(type, component);
    
    // Initialize component if it has init method
    if (component.init) {
      component.init();
    }
    
    // Handle special component types (legacy compatibility)
    this.handleSpecialComponent(type, component);
    
    // Emit event
    this.world.emit(EventType.ENTITY_COMPONENT_ADDED, {
      entityId: this.id,
      componentType: type,
      component
    });
    
    // Strong type assumption - component creation succeeded
    return component as T;
  }
  
  removeComponent(type: string): void {
    const component = this.components.get(type);
    if (!component) return;
    
    // Destroy component if it has destroy method
    if (component.destroy) {
      component.destroy();
    }
    
    // Handle special component cleanup
    this.handleSpecialComponentRemoval(type, component);
    
    // Remove from map
    this.components.delete(type);
    
    // Emit event
    this.world.emit(EventType.ENTITY_COMPONENT_ADDED, {
      entityId: this.id,
      componentType: type
    });
  }
  
  getComponent<T extends Component = Component>(type: string): T | null {
    const component = this.components.get(type);
    return component ? component as T : null;
  }
  
  hasComponent(type: string): boolean {
    return this.components.has(type);
  }
  
  removeAllComponents(): void {
    // Remove all components
    for (const type of Array.from(this.components.keys())) {
      this.removeComponent(type);
    }
  }
  
  // Physics methods
  applyForce(force: Vector3): void {
    if (!this.rigidBody) return;
    
    if (this.world.physics) {
      const PhysX = getPhysX();
      if (PhysX) {
        const physicsForce = new PhysX.PxVec3(force.x, force.y, force.z);
        this.rigidBody.addForce(physicsForce);
      }
    }
  }
  
  applyImpulse(impulse: Vector3): void {
    if (!this.rigidBody) return;
    
    if (this.world.physics) {
      const PhysX = getPhysX();
      if (PhysX) {

        // Assume rigidBody has getMass, getLinearVelocity, and setLinearVelocity methods
        const mass = this.rigidBody.getMass();
        const currentVel = this.rigidBody.getLinearVelocity();
        const deltaV = new PhysX.PxVec3(impulse.x / mass, impulse.y / mass, impulse.z / mass);
        // Add deltaV to currentVel
        const newVel = new PhysX.PxVec3(
          currentVel.x + deltaV.x,
          currentVel.y + deltaV.y,
          currentVel.z + deltaV.z
        );
        this.rigidBody.setLinearVelocity(newVel, true);
      }
    }
  }
  
  // Set velocity updates the THREE.Vector3 instance and syncs with physics if enabled
  setVelocity(vel: Vector3): void {
    this.velocity = vel;
    
    // Apply to physics body if available
    if (this.rigidBody) {
      this.world.physics.setLinearVelocity(this.rigidBody, this.velocity);
    }
  }
  
  // Get velocity returns the THREE.Vector3 instance
  getVelocity(): Vector3 {
    return this.velocity;
  }
  
  // Update methods - Required for HotReloadable interface
  fixedUpdate(delta: number): void {
    // Update components with fixedUpdate
    for (const component of this.components.values()) {
      if (component.fixedUpdate) {
        component.fixedUpdate(delta);
      }
    }
  }
  
  update(delta: number): void {
    // Update components with update
    for (const component of this.components.values()) {
      if (component.update) {
        component.update(delta);
      }
    }
  }
  
  lateUpdate(delta: number): void {
    // Update components with lateUpdate
    for (const component of this.components.values()) {
      if (component.lateUpdate) {
        component.lateUpdate(delta);
      }
    }
  }
  
  postLateUpdate(delta: number): void {
    // Update components with postLateUpdate
    for (const component of this.components.values()) {
      if (component.postLateUpdate) {
        component.postLateUpdate(delta);
      }
    }
  }
  
  // Event handling
  on(event: string, callback: Function): void {
    if (this.world.events) {
      this.world.emit(`entity:${this.id}:${event}`, callback);
    }
  }
  
  off(event: string, callback: Function): void {
    if (this.world.events) {
      this.world.emit(`entity:${this.id}:${event}:off`, callback);
    }
  }
  
  emit(event: string, data?: unknown): void {
    if (this.world.events) {
      this.world.emit(`entity:${this.id}:${event}`, data);
    }
  }
  
  // Serialization
  serialize(): EntityData {
    const serialized: EntityData = {
      id: this.id,
      name: this.name,
      type: this.type,
      // Add data properties dynamically
    };

    // Copy data properties - assume all enumerable properties should be serialized
    for (const key in this.data) {
      // Strong assumption - if key exists in data, it should be serialized
      const value = this.data[key as keyof EntityData];
      if (value !== undefined) {
        Object.defineProperty(serialized, key, {
          value,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    }

    return serialized;
  }
  
  // Modification from network/data
  modify(data: Partial<EntityData>): void {
    // Update data - transform properties no longer part of EntityData
    Object.assign(this.data, data);
    
    // Transform is now handled directly by Entity, not through data
    // Use setPosition(), setRotation() methods instead for transform updates
  }
  
  // Network event handling
  onEvent(version: number, name: string, data: unknown, networkId: string): void {
    // Handle entity-specific network events
    this.world.emit(`entity:${this.id}:network:${name}`, {
      version,
      data,
      networkId
    });
  }
  
  // Destruction
  destroy(local?: boolean): void {
    // Destroy all components
    for (const type of Array.from(this.components.keys())) {
      this.removeComponent(type);
    }
    
    // Remove from scene
    if (this.node?.parent) {
      this.node.parent.remove(this.node);
    }
    
    // Clean up physics
    if (this.rigidBody && this.world.physics?.world) {
      // Remove rigid body from physics world
      // Implementation depends on physics engine
    }
    
    // Network sync
    const network = getWorldNetwork(this.world);
    if (local && network) {
      network.send('entityRemoved', this.id);
    }
    
    // Emit destroy event
    this.world.emit(EventType.ENTITY_DEATH, {
      entityId: this.id
    });
  }
  
  // Helper methods
  syncPhysicsTransform(): void {
    if (!this.rigidBody || !this.world.physics?.world) return;
    
    // Sync Three.js transform to physics body
    const pos = this.position;
    const rot = this.rotation;
    
    const PhysX = getPhysX();
    if (!PhysX) return;
    
    const transform = new PhysX.PxTransform(
      new PhysX.PxVec3(pos.x, pos.y, pos.z),
      new PhysX.PxQuat(rot.x, rot.y, rot.z, rot.w)
    );
    
    this.rigidBody.setGlobalPose(transform);
    
    // PhysX manages object lifecycle - no manual deletion needed
  }
  
  handleSpecialComponent(type: string, component: Component): void {
    switch (type) {
      case 'rigidbody':
        this.createPhysicsBody(component);
        break;
      case 'collider':
        this.updateCollider(component);
        break;
      case 'mesh':
        this.updateMesh(component);
        break;
    }
  }
  
  private handleSpecialComponentRemoval(type: string, component: Component): void {
    switch (type) {
      case 'rigidbody':
        this.removePhysicsBody();
        break;
      case 'mesh':
        this.removeMesh(component);
        break;
    }
  }
  
  private createPhysicsBody(_component: Component): void {
    // Create physics rigid body based on component data
    // Implementation depends on physics engine integration
  }
  
  private removePhysicsBody(): void {
    if (this.rigidBody) {
      // Remove from physics world
      this.rigidBody = undefined;
    }
  }
  
  private updateCollider(_component: Component): void {
    // Update physics collider shape
    // Implementation depends on physics engine
  }
  
  private updateMesh(component: Component): void {
    // Add/update Three.js mesh from component data
    const meshData = component.data;
    if (meshData.geometry && meshData.material) {
      // Create or update mesh
    }
  }
  
  private removeMesh(_component: Component): void {
    // Remove mesh from node
    // Implementation depends on mesh management
  }
  
  private isDefaultRotation(): boolean {
    return this.rotation.x === 0 && this.rotation.y === 0 && 
           this.rotation.z === 0 && this.rotation.w === 1;
  }
  
  private isDefaultScale(): boolean {
    return this.scale.x === 1 && this.scale.y === 1 && this.scale.z === 1;
  }
}
