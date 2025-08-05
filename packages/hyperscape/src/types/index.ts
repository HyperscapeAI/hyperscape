import { Avatar } from '../core/nodes';
import { Component } from '../core/components/Component';
import { Entity } from '../core/entities/Entity';
import * as THREE from '../core/extras/three';
import { System } from '../core/systems/System';
import { World } from '../core/World';
import { RPGSystemBase, RPGSystemConfig } from '../rpg/types';
import type { PxTransform } from './physx';
import { Inventory, PlayerEquipment, PlayerHealth } from '../rpg/types/core';

// Export core types that are being imported by other files
export type { Component, Entity, System };

// Component and Entity type definitions
export interface ComponentDefinition {
  type: string;
  createComponent: (data: unknown) => Component;
}

export interface EntityConstructor {
  new (world: World, data: EntityData, local?: boolean): Entity;
}

// Action system types
export interface ActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  required?: boolean;
  description?: string;
}

export interface ActionDefinition {
  name: string;
  description: string;
  parameters: ActionParameter[];
  validate?: (context: ActionContext) => boolean;
  execute: (context: ActionContext, params: Record<string, unknown>) => Promise<unknown>;
}

export interface ActionContext {
  world: World;
  playerId?: string;
  entity?: Entity;
}

export interface Entities extends System {
  get(id: string): Entity | null;
  add(data: EntityData, local?: boolean): Entity;
  serialize?(): unknown;
  deserialize(data: EntityData[]): Promise<void>;
  
  player?: Entity;
  items?: Map<string, Entity>;
  players?: Map<string, Entity>;
  
  // Entity management methods
  values?(): IterableIterator<Entity>;
  remove(id: string): boolean;
  has?(id: string): boolean;
  create?(type: string, data: EntityData): Entity | null;
  destroyEntity?(id: string): boolean;
  
  // Player-specific methods
  getPlayer?(id: string): Player | null;
  getLocalPlayer?(): Player | null;
  getPlayers?(): Player[];
}

// Chat message interface - unified ChatMessage with all required properties
export interface ChatMessage {
  id: string;
  from: string;
  fromId?: string;
  userId?: string;
  userName?: string;
  username?: string;
  body: string;
  text: string;
  message?: string; // For backward compatibility
  timestamp: number;
  createdAt: string;
  avatar?: string;
  entityId?: string;
  playerId?: string;
  playerName?: string;
}

// Alias for backward compatibility
export type ExtendedChatMessage = ChatMessage;

// Import actual system classes
export { Chat } from '../core/systems/Chat';
export { ClientActions } from '../core/systems/ClientActions';
export { ClientAudio } from '../core/systems/ClientAudio';
export { ClientControls } from '../core/systems/ClientControls';
export { ClientEnvironment } from '../core/systems/ClientEnvironment';
export { ClientGraphics } from '../core/systems/ClientGraphics';
export { ClientLiveKit } from '../core/systems/ClientLiveKit';
export { ClientLoader } from '../core/systems/ClientLoader';
export { ClientNetwork } from '../core/systems/ClientNetwork';
export { ClientPrefs } from '../core/systems/ClientPrefs';
export { ClientStats } from '../core/systems/ClientStats';
export { ClientUI } from '../core/systems/ClientUI';
export { Server as ServerServer } from '../core/systems/Server';
// ServerNetwork is server-only and should not be exported for client use
// Use type-only import if needed: import type { ServerNetwork } from '../core/systems/ServerNetwork';
export { Settings } from '../core/systems/Settings';
export { XR as XRSystem } from '../core/systems/XR';

// Export missing core system types
export { Anchors } from '../core/systems/Anchors';
export { Events } from '../core/systems/Events';
export { Stage } from '../core/systems/Stage';

// Basic input types
export interface InputState {
  down: boolean;
  pressed: boolean;
  released?: boolean;
  onPress?: () => void;
}

export interface MouseInput extends InputState {
  coords?: THREE.Vector2;
  delta?: THREE.Vector2;
}

// Control and ClientControls interfaces are defined later in the file with full definitions

// Core entity data types
export interface EntityData {
  id: string;
  type: string;
  name?: string;
  owner?: string;
  active?: boolean;
  visible?: boolean;
  // Player-specific properties
  userId?: string;
  emote?: string;
  avatar?: string;
  sessionAvatar?: string;
  roles?: string[];
  // Effect data for any entity
  effect?: {
    anchorId?: string;
    snare?: number;
    freeze?: boolean;
    turn?: boolean;
    emote?: string;
    duration?: number;
    cancellable?: boolean;
  };
  // Allow additional properties
  [key: string]: unknown;
}

export interface ComponentData {
  type: string;
  data: unknown;
}

// Core World Types
export interface WorldOptions {
  storage?: unknown;
  assetsDir?: string;
  assetsUrl?: string;
  physics?: boolean;
  renderer?: 'webgl' | 'webgl2' | 'headless';
  networkRate?: number;
  maxDeltaTime?: number;
  fixedDeltaTime?: number;
  db?: unknown;
}

// Use the actual World class from core/World.ts
export { World } from '../core/World';

// Client System Types - Now imported from actual system classes























// ServerDB interface kept as there's no corresponding system class
export interface ServerDB extends System {
  db: unknown;
  run(query: string, params?: unknown[]): Promise<unknown>;
  get(query: string, params?: unknown[]): Promise<unknown>;
  all(query: string, params?: unknown[]): Promise<unknown[]>;
}

// ClientMonitor interface kept as there's no corresponding client monitor system class  
export interface ClientMonitor extends System {
  stats: unknown;
  show(): void;
  hide(): void;
}

// EntityData is now exported from ./core

// System is now a class - already exported at the top

export interface SystemConstructor {
  new (world: World): System;
}

export interface RPGSystemConstructor {
  new (world: World, config: RPGSystemConfig): RPGSystemBase;
}

// Entity and Component are now classes - already exported at the top

// Control binding interface for what bind() method returns
export interface ControlBinding {
  options: {
    priority?: number;
    onRelease?: () => void;
    onTouch?: (info: TouchInfo) => boolean;
    onTouchEnd?: (info: TouchInfo) => boolean;
  };
  entries: Record<string, unknown>;
  actions: unknown;
  api: {
    setActions(value: unknown): void;
    release(): void;
  };
  
  // Direct release method
  release(): void;
  
  // Allow dynamic properties for control types
  [key: string]: unknown;
  
  // Control properties with input state
  keyI?: ButtonEntry;
  keyE?: ButtonEntry;
  keyC?: ButtonEntry;
  keyW?: ButtonEntry;
  keyS?: ButtonEntry;
  keyA?: ButtonEntry;
  keyD?: ButtonEntry;
  keyZ?: ButtonEntry;
  arrowUp?: ButtonEntry;
  arrowDown?: ButtonEntry;
  arrowLeft?: ButtonEntry;
  arrowRight?: ButtonEntry;
  shiftLeft?: ButtonEntry;
  shiftRight?: ButtonEntry;
  ctrlLeft?: ButtonEntry;
  metaLeft?: ButtonEntry;
  slash?: ButtonEntry;
  enter?: ButtonEntry;
  escape?: ButtonEntry;
  tab?: ButtonEntry;
  mouseLeft?: MouseInput;
  touchB?: ButtonEntry;
  xrLeftTrigger?: ButtonEntry;
  xrRightTrigger?: ButtonEntry;
  
  // Special control objects
  pointer?: {
    locked?: boolean;
  };
  camera?: {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    zoom: number;
    write?: (camera: THREE.Camera) => void;
  };
  screen?: {
    width?: number;
  };
}

// Control interface
export interface Control {
  id: string;
  playerId: string;
  enabled: boolean;
  
  // Key controls
  keyA?: InputState;
  keyB?: InputState;
  keyC?: InputState;
  keyD?: InputState;
  keyE?: InputState;
  keyF?: InputState;
  keyG?: InputState;
  keyH?: InputState;
  keyI?: InputState;
  keyJ?: InputState;
  keyK?: InputState;
  keyL?: InputState;
  keyM?: InputState;
  keyN?: InputState;
  keyO?: InputState;
  keyP?: InputState;
  keyQ?: InputState;
  keyR?: InputState;
  keyS?: InputState;
  keyT?: InputState;
  keyU?: InputState;
  keyV?: InputState;
  keyW?: InputState;
  keyX?: InputState;
  keyY?: InputState;
  keyZ?: InputState;
  
  // Arrow keys
  arrowUp?: InputState;
  arrowDown?: InputState;
  arrowLeft?: InputState;
  arrowRight?: InputState;
  
  // Special keys
  space?: InputState;
  shiftLeft?: InputState;
  shiftRight?: InputState;
  ctrlLeft?: InputState;
  ctrlRight?: InputState;
  altLeft?: InputState;
  altRight?: InputState;
  enter?: InputState;
  escape?: InputState;
  tab?: InputState;
  
  // Number keys
  digit0?: InputState;
  digit1?: InputState;
  digit2?: InputState;
  digit3?: InputState;
  digit4?: InputState;
  digit5?: InputState;
  digit6?: InputState;
  digit7?: InputState;
  digit8?: InputState;
  digit9?: InputState;
  
  // Mouse controls
  mouseLeft?: MouseInput;
  mouseRight?: MouseInput;
  mouseMiddle?: MouseInput;
  mouseWheel?: MouseInput;
  
  // Screen and camera
  screen?: {
    width: number;
    height: number;
  };
  camera?: {
    position: Vector3;
    quaternion: Quaternion;
    zoom: number;
    write?: boolean | ((camera: unknown) => void);
  };
  
  // Pointer
  pointer?: {
    locked: boolean;
    lock?: () => void;
    coords?: Vector2;
    position?: Vector3;
    delta?: Vector2;
  };
  
  // XR controls
  xrLeftStick?: {
    value: { x: number; z: number };
  };
  xrLeftTrigger?: InputState;
  xrLeftBtn1?: InputState;
  xrLeftBtn2?: InputState;
  xrRightStick?: {
    value: { x: number; y: number };
  };
  xrRightTrigger?: InputState;
  xrRightBtn1?: InputState;
  xrRightBtn2?: InputState;
  
  // Touch controls
  touchA?: InputState;
  touchB?: InputState;
  touchStick?: {
    value: { x: number; y: number };
    delta: { x: number; y: number };
  };
  
  // Scroll
  scrollDelta?: {
    value: number;
  };
}

// THREE.js type exports for convenience
export type Vector3 = THREE.Vector3;
export type Quaternion = THREE.Quaternion;
export type Matrix4 = THREE.Matrix4;
export type Vector2 = THREE.Vector2;
export type Euler = THREE.Euler;

// Position interfaces for serialization/deserialization
// These are plain objects, unlike THREE.Vector3 which has methods
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Position2D {
  x: number;
  y: number;
}

// Deprecated: Use Position3D instead
export type Vector3D = Position3D;

// Deprecated: Use Position2D instead  
export type Vector2D = Position2D;

// Rotation types
export interface Rotation3D {
  x: number;
  y: number;
  z: number;
  w: number;
}

// Scale types
export interface Scale3D {
  x: number;
  y: number;
  z: number;
}

// Bounds and area types
export interface Bounds3D {
  min: Position3D;
  max: Position3D;
}

export interface Bounds2D {
  min: Position2D;
  max: Position2D;
}

// Transform types
export interface Transform3D {
  position: Position3D;
  rotation: Rotation3D;
  scale: Position3D;
}

// Color types
export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface ColorHex {
  hex: number;
}

// Time types
export type Timestamp = number; // Unix timestamp in milliseconds
export type Duration = number; // Duration in milliseconds

// Range types
export interface Range {
  min: number;
  max: number;
}

// PhysX types
export interface PhysXMaterial {
  setFrictionCombineMode(mode: number): void;
  setRestitutionCombineMode(mode: number): void;
  setStaticFriction?(friction: number): void;
  setDynamicFriction?(friction: number): void;
  setRestitution?(restitution: number): void;
}

// Physics Types
export interface PhysicsOptions {
  gravity?: Vector3;
  timestep?: number;
  maxSubsteps?: number;
}

export interface RigidBody {
  type: 'static' | 'dynamic' | 'kinematic';
  mass: number;
  position: Vector3;
  rotation: Quaternion;
  velocity: Vector3;
  angularVelocity: Vector3;
  
  applyForce(force: Vector3, point?: Vector3): void;
  applyImpulse(impulse: Vector3, point?: Vector3): void;
  setLinearVelocity(velocity: Vector3): void;
  setAngularVelocity(velocity: Vector3): void;
}

export interface Collider {
  type: 'box' | 'sphere' | 'capsule' | 'mesh';
  isTrigger: boolean;
  material?: PhysicsMaterial;
  
  onCollisionEnter?: (other: Collider) => void;
  onCollisionStay?: (other: Collider) => void;
  onCollisionExit?: (other: Collider) => void;
  onTriggerEnter?: (other: Collider) => void;
  onTriggerStay?: (other: Collider) => void;
  onTriggerExit?: (other: Collider) => void;
}

export interface PhysicsMaterial {
  friction: number;
  restitution: number;
}

// Physics system interface
export interface Physics {
  // Core physics methods
  createRigidBody(type: 'static' | 'dynamic' | 'kinematic', position?: Vector3, rotation?: Quaternion): RigidBody;
  createCollider(geometry: unknown, material?: PhysicsMaterial, isTrigger?: boolean): unknown;
  createMaterial(staticFriction?: number, dynamicFriction?: number, restitution?: number): PhysicsMaterial;
  createLayerMask(...layers: string[]): number;
  
  // Casting methods
  sphereCast(origin: Vector3, radius: number, direction: Vector3, maxDistance?: number, layerMask?: number): RaycastHit | null;
  raycast(origin: Vector3, direction: Vector3, maxDistance?: number, layerMask?: number): RaycastHit | null;
  sweep(geometry: unknown, origin: Vector3, direction: Vector3, maxDistance?: number, layerMask?: number): RaycastHit | null;
  
  // Simulation
  simulate(deltaTime: number): void;
  
  // Cleanup methods
  removeCollider(collider: unknown): void;
  removeActor(actor: unknown): void;
  
  // PhysX integration properties
  world?: unknown; // PhysX world instance
  physics?: unknown; // PhysX physics instance
  scene?: unknown; // PhysX scene instance
  
  // Actor management
  addActor(actor: unknown, handle?: unknown): unknown;
}





// Network Types
export interface NetworkPacket {
  type: string;
  data: unknown;
  timestamp: number;
  reliable?: boolean;
}

export interface NetworkConnection {
  id: string;
  latency: number;
  
  send(packet: NetworkPacket): void;
  disconnect(): void;
}
// Network data for entity synchronization
export interface NetworkData {
  id: string;
  p?: [number, number, number]; // position
  q?: [number, number, number, number]; // quaternion
  e?: string; // emote
  s?: number; // scale
  v?: [number, number, number]; // velocity
  [key: string]: unknown;
}

// World Chunk Types
export interface WorldChunk {
  chunkX: number;
  chunkZ: number;
  biome: string;
  heightData: number[] | null;
  chunkSeed?: number;
  lastActiveTime: Date | null;
  lastActivity: Date;
}

// Movement Types
export enum MovementMode {
  WASD = 'wasd',
  CLICK_TO_MOVE = 'click_to_move',
  HYBRID = 'hybrid'
}

export interface MovementTarget {
  playerId: string;
  targetPosition: { x: number; y: number; z: number };
  startPosition: { x: number; y: number; z: number };
  startTime: number;
  estimatedDuration: number;
  movementSpeed: number;
  isRunning: boolean;
  path?: Vector3[];
  currentWaypoint?: number;
}

export interface PlayerStamina {
  current: number;
  max: number;
  regenerating: boolean;
}

// Player Types
export type Player = Entity & {
  connection?: NetworkConnection;
  input: PlayerInput;
  stats: PlayerStats;
  avatar: Avatar;
  avatarUrl: string;
  metadata?: Record<string, unknown>;
  username: string;
  
  // RPG-specific properties that may be added dynamically
  health: PlayerHealth;
  inventory: Inventory;
  equipment: PlayerEquipment;
  
  // Player-specific methods
  spawn(position: Vector3): void;
  respawn(): void;
  damage(amount: number, source?: Entity): void;
  heal(amount: number): void;
}

export interface PlayerInput {
  movement: Vector3;
  rotation: Quaternion;
  actions: Set<string>;
  mouse: { x: number; y: number };
}

export interface PlayerStats {
  health: number;
  maxHealth: number;
  score: number;
  kills: number;
  deaths: number;
}

// Node Types
export interface Node {
  id: string;
  type: string;
  parent: Node | null;
  children: Node[];
  transform: PxTransform;
  visible: boolean;
  
  add(child: Node): void;
  remove(child: Node): void;
  traverse(callback: (node: Node) => void): void;
  getWorldPosition(): Vector3;
  getWorldRotation(): Quaternion;
  getWorldScale(): Vector3;
}

// Node data for serialization
export interface NodeData {
  id?: string;
  position?: [number, number, number];
  quaternion?: [number, number, number, number];
  scale?: [number, number, number];
  active?: boolean;
  [key: string]: unknown;
}

export interface Transform {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  matrix: Matrix4;
  worldMatrix: Matrix4;
}

// Audio Types
export interface AudioGroupGains {
  music: GainNode;
  sfx: GainNode;
  voice: GainNode;
}

// Camera Types
export interface CameraTarget {
  position: THREE.Vector3;
  quaternion?: THREE.Quaternion;
  base?: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  data?: { 
    id: string;
    roles?: string[];
    [key: string]: unknown;
  };
}

// Control System Types
export interface TouchInfo {
  id: number;
  position: THREE.Vector3;
  prevPosition: THREE.Vector3;
  delta: THREE.Vector3;
}

export interface ButtonEntry {
  $button: true;
  down: boolean;
  pressed: boolean;
  released: boolean;
  capture: boolean;
  onPress: (() => boolean | void) | null;
  onRelease: (() => void) | null;
}

export interface VectorEntry {
  $vector: true;
  value: THREE.Vector3;
  capture: boolean;
}

export interface ValueEntry {
  $value: true;
  value: unknown;
  capture: boolean;
}

export interface ScreenEntry {
  $screen: true;
  width: number;
  height: number;
}

export interface CameraEntry {
  $camera: true;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  rotation: THREE.Euler;
  zoom: number;
  write: boolean;
}

export interface PointerEntry {
  $pointer: true;
  coords: THREE.Vector3;
  position: THREE.Vector3;
  delta: THREE.Vector3;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export type ControlEntry = ButtonEntry | VectorEntry | ValueEntry | ScreenEntry | CameraEntry | PointerEntry;

export interface ControlAction {
  id?: number;
  type: string;
}

export interface ControlsBinding {
  options: {
    priority?: number;
    onRelease?: () => void;
    onTouch?: (info: TouchInfo) => boolean;
    onTouchEnd?: (info: TouchInfo) => boolean;
  };
  entries: Record<string, ControlEntry>;
  actions: ControlAction[] | null;
  api: {
    setActions: (value: ControlAction[] | null) => void;
    release: () => void;
  };
  onButtonPress?: (prop: string, text: string) => boolean;
}

export interface XRInputSource {
  handedness: 'left' | 'right' | 'none';
  gamepad?: {
    axes: readonly number[];
    buttons: readonly { pressed: boolean }[];
  };
}

// Environment Types
export interface BaseEnvironment {
  model?: string;
  bg?: string;
  hdr?: string;
  sunDirection?: THREE.Vector3;
  sunIntensity?: number;
  sunColor?: string;
  fogNear?: number;
  fogFar?: number;
  fogColor?: string;
}

export interface SkyNode {
  _bg?: string;
  _hdr?: string;
  _sunDirection?: THREE.Vector3;
  _sunIntensity?: number;
  _sunColor?: string;
  _fogNear?: number;
  _fogFar?: number;
  _fogColor?: string;
}

export interface SkyHandle {
  node: SkyNode;
  destroy: () => void;
}

export interface SkyInfo {
  bgUrl?: string;
  hdrUrl?: string;
  sunDirection: THREE.Vector3;
  sunIntensity: number;
  sunColor: string;
  fogNear?: number;
  fogFar?: number;
  fogColor?: string;
}

export interface EnvironmentModel {
  deactivate: () => void;
  activate: (options: { world: World; label: string }) => void;
}

// Loader Types
export interface LoadedModel {
  toNodes: () => Map<string, Node>; // Node type from node system
  getStats: () => { fileBytes?: number; [key: string]: unknown };
}

export interface LoadedEmote {
  toNodes: () => Map<string, Node>;
  getStats: () => { fileBytes?: number; [key: string]: unknown };
  toClip: (options?: { fps?: number; name?: string }) => THREE.AnimationClip | null;
}

export interface LoadedAvatar {
  toNodes: (customHooks?: { scene: THREE.Scene; octree?: unknown; camera?: unknown; loader?: unknown }) => Map<string, Node>;
  getStats: () => { fileBytes?: number; [key: string]: unknown };
}

export interface VideoSource {
  get ready(): boolean;
  get width(): number;
  get height(): number;
  get duration(): number;
  get loop(): boolean;
  set loop(value: boolean);
  get isPlaying(): boolean;
  get currentTime(): number;
  set currentTime(value: number);
  play: (restartIfPlaying?: boolean) => void;
  pause: () => void;
  stop: () => void;
  createHandle: () => VideoSource;
  release: () => void;
}

export interface VideoFactory {
  get: (key: string) => VideoSource;
}

export type LoaderResult = THREE.Texture | THREE.DataTexture | VideoFactory | LoadedModel | LoadedEmote | LoadedAvatar | HTMLImageElement | AudioBuffer;

// GLTF/GLB Data Types
export interface GLBData {
  scene: THREE.Scene | THREE.Group;
  animations?: THREE.AnimationClip[];
  userData?: {
    vrm?: {
      humanoid?: {
        getRawBoneNode?: (boneName: string) => THREE.Object3D | null;
        _rawHumanBones?: {
          humanBones?: Record<string, { node?: THREE.Object3D }>;
        };
        _normalizedHumanBones?: {
          humanBones?: Record<string, { node?: THREE.Object3D }>;
        };
        update?: (delta: number) => void;
      };
      meta?: {
        metaVersion?: string;
      };
    };
  };
}

// Network Types
export interface SnapshotData {
  id: string;
  serverTime: number;
  apiUrl?: string;
  maxUploadSize?: number;
  assetsUrl?: string;
  settings?: Partial<SettingsData>;
  entities?: EntityData[];
  livekit?: { token?: string };
  chat?: ChatMessage[];
  authToken?: string;
}

export interface SettingsData {
  title?: string | null;
  desc?: string | null;
  image?: string | null;
  model?: string | null;
  avatar?: string | null;
  public?: boolean | null;
  playerLimit?: number | null;
}

// Asset Types
export interface Asset {
  id: string;
  url: string;
  type: 'model' | 'texture' | 'audio' | 'video' | 'script';
  data?: unknown;
  loaded: boolean;
  loading: boolean;
  error?: Error;
}

// Event Types
export interface GameEvent {
  type: string;
  data: unknown;
  timestamp: number;
  source?: Entity;
  target?: Entity;
}

// Hot Reloadable
export interface HotReloadable {
  fixedUpdate(delta: number): void;
  update(delta: number): void;
  lateUpdate(delta: number): void;
  postLateUpdate(delta: number): void;
}


// Touch input
export interface Touch {
  id: number;
  x: number;
  y: number;
  pressure: number;
  position?: { x: number; y: number };
  delta?: { x: number; y: number };
}

// Node context
export interface NodeContext {
  entity?: Entity;
  world: World;
  node: Node;
  parent?: NodeContext;
}

// Physics layers
export interface Layers {
  environment: number;
  player: number;
  [key: string]: number;
}
export interface ActorHandle {
  move: (matrix: unknown) => void;
  snap: (pose: unknown) => void;
  destroy: () => void;
}

export interface RaycastHit {
  point: Vector3;
  normal: Vector3;
  distance: number;
  collider: Collider;
  entity?: Entity;
  handle?: unknown;
}



// RPG types have been moved to packages/hyperscape/src/rpg/types/



// Note: World type is now imported directly from '../core/World'
// This avoids conflicts between interface and class definitions 