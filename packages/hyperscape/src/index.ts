/**
 * @hyperscape/hyperscape
 * 
 * Main export for the Hyperscape framework package
 */
import path from 'path';
import { fileURLToPath } from 'url';

export { createClientWorld } from './core/createClientWorld';
export { createServerWorld } from './core/createServerWorld';
export { createViewerWorld } from './core/createViewerWorld';
export { World } from './core/World';

// Export entity classes
export { Entity } from './core/entities/Entity';
export { PlayerLocal } from './core/entities/PlayerLocal';
export { PlayerRemote } from './core/entities/PlayerRemote';

// Export System class from core systems
export { System } from './core/systems/System';

// Export all types from types/index.ts
export type {
    Anchors, Chat, ChatMessage, Component, Entities,
    // Entity Component System Types
    Entity as EntityInterface, Events,
    // UI and control types
    HotReloadable, Matrix4,
    // Network Types
    NetworkConnection, Physics,
    // Physics Types
    PhysicsOptions,
    // Player Types
    Player,
    PlayerInput,
    PlayerStats, Quaternion,
    // Additional system interfaces
    Settings, Stage, SystemConstructor,
    // System Types  
    System as SystemInterface,
    // Math Types
    Vector3, World as WorldInterface,
    // Core World Types
    WorldOptions
} from './types/index';

// Export EventType enum
export { EventType } from './types/events';

// Export node client components directly from their source modules
export { createNodeClientWorld } from './core/createNodeClientWorld';
export { ClientControls } from './core/systems/ClientControls';
export { ClientNetwork } from './core/systems/ClientNetwork';
export { ServerLoader } from './core/systems/ServerLoader';
export { NodeClient } from './core/systems/NodeClient';
export { NodeEnvironment } from './core/systems/NodeEnvironment';
export { Node } from './core/nodes/Node';
export { storage } from './core/storage';
export { loadPhysX, waitForPhysX, getPhysX, isPhysXReady } from './core/PhysXManager';
export { uuid } from './core/utils';
export { ReactiveVector3 } from './core/extras/ReactiveVector3';
export { createEmoteFactory } from './core/extras/createEmoteFactory';
export { createNode } from './core/extras/createNode';
export { glbToNodes } from './core/extras/glbToNodes';
export { Emotes } from './core/extras/playerEmotes';
// GLTFLoader export disabled due to TypeScript declaration generation issues
// Users can import it directly: import { GLTFLoader } from './core/libs/gltfloader/GLTFLoader';
export { CSM } from './core/libs/csm/CSM';
export type { CSMOptions } from './core/libs/csm/CSM';

// PhysX asset path helper function
export function getPhysXAssetPath(assetName: string): string {
  // This assumes that the 'vendor' directory is at the root of the installed package
  // Use ES module equivalent of __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, '..', 'vendor', assetName);
}

// Export THREE separately to avoid naming conflicts
export * as THREE from './core/extras/three';

// Export Vector3 compatibility utilities for plugin use
export { 
  toTHREEVector3,
  assignVector3,
  cloneVector3,
  createVector3,
  toVector3Object,
  isVector3Like
} from './core/extras/vector3-compatibility';

// Export PhysX types
export type { PxVec3, PxTransform, PxQuat } from './types/physx';
