/**
 * @hyperscape/hyperscape
 * 
 * Main export for the Hyperscape framework package
 */
import path from 'path';
import { fileURLToPath } from 'url';

export { createClientWorld } from './createClientWorld';
export { createServerWorld } from './createServerWorld';
export { createViewerWorld } from './createViewerWorld';
export { World } from './World';

// Export entity classes
export { Entity } from './entities/Entity';
export { PlayerLocal } from './entities/PlayerLocal';
export { PlayerRemote } from './entities/PlayerRemote';

// Export System class from core systems
export { System } from './systems/System';

// Export all types from types/index.ts
export type {
    Anchors, Chat, ChatMessage, Component,
    // Entity Component System Types
    Entity as EntityInterface, Events,
    // UI and control types
    HotReloadable, Matrix4,
    // Network Types
    NetworkConnection,
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
    WorldOptions,
    // Additional interfaces without corresponding classes
    ClientMonitor,
    ServerDB
} from './types/index';

// Export EventType enum
export { EventType } from './types/events';

// Export system classes to fix API extractor warnings
export { Entities } from './systems/Entities';
export { Physics } from './systems/Physics';
export { Particles } from './systems/Particles';
export { LODs } from './systems/LODs';
export { ClientUI } from './systems/ClientUI';
export { ClientLoader } from './systems/ClientLoader';
export { ServerNetwork } from './systems/ServerNetwork';
export { ClientEnvironment } from './systems/ClientEnvironment';
export { ClientGraphics } from './systems/ClientGraphics';
export { ClientPrefs } from './systems/ClientPrefs';
export { ClientAudio } from './systems/ClientAudio';
export { ClientLiveKit } from './systems/ClientLiveKit';
export { ClientStats } from './systems/ClientStats';
export { Server } from './systems/Server';
export { ClientActions } from './systems/ClientActions';
export { XR } from './systems/XR';

// Export MockNetwork from World
export { MockNetwork } from './World';

// Export node client components directly from their source modules
export { createNodeClientWorld } from './createNodeClientWorld';
export { ServerLoader } from './systems/ServerLoader';
export { NodeClient } from './systems/NodeClient';
export { NodeEnvironment } from './systems/NodeEnvironment';
export { Node } from './nodes/Node';
export { storage } from './storage';
export { loadPhysX, waitForPhysX, getPhysX, isPhysXReady } from './PhysXManager';
export { uuid } from './utils';
export { ReactiveVector3 } from './extras/ReactiveVector3';
export { createEmoteFactory } from './extras/createEmoteFactory';
export { createNode } from './extras/createNode';
export { glbToNodes } from './extras/glbToNodes';
export { Emotes } from './extras/playerEmotes';
// GLTFLoader export disabled due to TypeScript declaration generation issues
// Users can import it directly: import { GLTFLoader } from './libs/gltfloader/GLTFLoader';
export { CSM } from './libs/csm/CSM';
export type { CSMOptions } from './libs/csm/CSM';

// PhysX asset path helper function
export function getPhysXAssetPath(assetName: string): string {
  // This assumes that the 'vendor' directory is at the root of the installed package
  // Use ES module equivalent of __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, '..', 'vendor', assetName);
}

// Export THREE namespace as a default-only module export
export { default as THREE } from './extras/three';

// Export Vector3 compatibility utilities for plugin use
export { 
  toTHREEVector3,
  assignVector3,
  cloneVector3,
  createVector3,
  toVector3Object,
  isVector3Like
} from './extras/vector3-compatibility';

// Export PhysX types
export type { PxVec3, PxTransform, PxQuat } from './types/physics';

// Re-export types referenced by API Extractor warnings
export type { PhysXInfo, PhysXModule } from './types/physics';
