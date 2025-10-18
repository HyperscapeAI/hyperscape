import { Component } from '../components/Component';
import { Entity } from '../entities/Entity';
import THREE from '../extras/three';
import { Avatar } from '../nodes';
import type { Node as NodeClass } from '../nodes/Node';
import { System } from '../systems/System';
import { World } from '../World';
import type { EntityData, Position2D, Position3D } from './base-types';

// Re-enable core imports - circular dependency should be resolved
import type {
  Inventory,
  PlayerEquipmentItems,
  PlayerHealth,
  PlayerStats,
  SystemConfig
} from './core';

// Import database types for use within this file
import type { SystemDatabase } from './database';

// Position3D, Position2D, and EntityData are exported from base-types.ts

/**
 * Central Types Export
 * Single source of truth for all type definitions
 * 
 * Import and re-export types to maintain consistency across the codebase.
 * Avoid duplicating types that exist in other files - import and re-export instead.
 * Use strongly typed interfaces without optional properties or unknown types.
 */

// Re-export core Hyperscape types
export { SystemBase } from '../systems/SystemBase';

// Import types needed from other modules
export type { World } from '../World';

// Re-export base types first to establish fundamental types
export * from './base-types';

// Re-export core types that are commonly used
// Export base types (already available from base-types export but also explicit for convenience)
export type { EntityData, Position2D, Position3D } from './base-types';

// Export core types that were imported above
export type {
  AggroTarget,
  AuthenticationResult,
  ClickToMoveEvent,
  Inventory,
  MobAIStateData,
  MovementComponent,
  PlayerHealth,
  PlayerIdentity,
  PlayerStats,
  SystemConfig
} from './core';

// Re-export additional core types that are needed by many modules
export {
  AttackType, CombatStyle, ItemType,
  WeaponType
} from './core';

export type {
  AnimationTask, BankData, BankEntityData, CombatBonuses, CombatTarget, DialogueNode,
  DialogueSession, EquipmentComponent, EquipmentSlot, InteractionAction, InventoryItem, InventorySlotItem, LootTable, MeshUserData, MobEntityData, PrayerComponent, RespawnTask, SkillData, Spawner, SpawnPoint, StatsComponent
} from './core';

export type PlayerEquipment = PlayerEquipmentItems;

// Export additional types needed by combat and other systems
export { EquipmentSlotName } from './core';

// Re-export other types (using specific exports to avoid circular dependencies)
export * from './database';
export * from './entities';
// Explicitly export enums from entities that are commonly used
export { EntityType, InteractionType, ItemRarity, MobAIState, NPCType, ResourceType } from './entities';
export * from './events';
export * from './identifiers';
export * from './networking';
export * from './nodes';

// Import AvatarFactory from nodes for use in LoadedAvatar type below
import type { AvatarFactory as AvatarFactoryType } from './nodes';
type AvatarFactory = AvatarFactoryType;

export type Player = PlayerEntity

// Re-export system-specific types
export type {
  ClientInterfaceSystem, ItemRegistrySystem
} from './system-interfaces';

// Re-export data types (specific exports to avoid conflicts)
export { ITEMS } from '../data/items';
export * from '../data/mobs';
export * from '../data/world-areas';

// Types are now re-exported above in the main export block

// World type is already exported as 'World' above - use that instead of creating alias

// Common interfaces that are used across multiple systems
// Note: Use Position3D from core.ts instead of creating duplicates
export interface EntityWithPosition {
  position: Position3D;
  rotation: Position3D;
}

export interface EntityWithId {
  id: string;
}

// Event data interfaces - strongly typed versions
export interface BaseEventData {
  timestamp: number;
  source: string;
}

export interface PlayerEventData extends BaseEventData {
  playerId: string;
}

export interface ItemEventData extends BaseEventData {
  itemId: string;
  quantity: number;
}

export interface CombatEventData extends BaseEventData {
  attackerId: string;
  targetId: string;
  damage: number;
  attackType: 'melee' | 'ranged' | 'magic';
}

// System state interfaces
export interface SystemState {
  isInitialized: boolean;
  isActive: boolean;
  lastUpdate: number;
  errorCount: number;
}

export interface TestSystemState extends SystemState {
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  currentTest: string | null;
}

// Utility types
export type Callback<T = void> = (result: T) => void;
export type AsyncCallback<T = void> = (result: T) => Promise<void>;
export type EventCallback<T extends BaseEventData = BaseEventData> = (data: T) => void;

// Constants
export const CONSTANTS = {
  MAX_INVENTORY_SLOTS: 28,
  MAX_BANK_SLOTS: 500,
  DEFAULT_HEALTH: 100,
  DEFAULT_STAMINA: 100,
  COMBAT_TIMEOUT_MS: 10000,
  RESPAWN_TIME_MS: 30000,
  SAVE_INTERVAL_MS: 60000
} as const;

// Error codes for type safety
export const ERROR_CODES = {
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  PLAYER_ERROR: 'PLAYER_ERROR',
  ITEM_ERROR: 'ITEM_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// Error types
export class HyperscapeError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly context: Record<string, string | number | boolean> = {}
  ) {
    super(message);
    this.name = 'HyperscapeError';
  }
}

export class SystemError extends HyperscapeError {
  constructor(
    systemName: string,
    message: string,
    context: Record<string, string | number | boolean> = {}
  ) {
    super(`[${systemName}] ${message}`, ERROR_CODES.SYSTEM_ERROR, { system: systemName, ...context });
    this.name = 'SystemError';
  }
}

export class PlayerError extends HyperscapeError {
  constructor(
    playerId: string,
    message: string,
    context: Record<string, string | number | boolean> = {}
  ) {
    super(`Player ${playerId}: ${message}`, ERROR_CODES.PLAYER_ERROR, { playerId, ...context });
    this.name = 'PlayerError';
  }
}

export class ItemError extends HyperscapeError {
  constructor(
    itemId: string,
    message: string,
    context: Record<string, string | number | boolean> = {}
  ) {
    super(`Item ${itemId}: ${message}`, ERROR_CODES.ITEM_ERROR, { itemId, ...context });
    this.name = 'ItemError';
  }
}

// Logger interface
export interface Logger {
  debug(message: string, context?: Record<string, string | number | boolean>): void;
  info(message: string, context?: Record<string, string | number | boolean>): void;
  warn(message: string, context?: Record<string, string | number | boolean>): void;
  error(message: string, error?: Error, context?: Record<string, string | number | boolean>): void;
  system(systemName: string, message: string, context?: Record<string, string | number | boolean>): void;
  player(playerId: string, message: string, context?: Record<string, string | number | boolean>): void;
  test(testName: string, message: string, context?: Record<string, string | number | boolean>): void;
}

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

// Action parameter interface for registry actions
export interface ActionParams {
  // Combat parameters
  targetId?: string;
  attackStyle?: string;
  
  // Item parameters
  itemId?: string;
  slot?: number;
  quantity?: number;
  
  // Movement parameters
  destination?: Position3D;
  x?: number;
  y?: number;
  z?: number;
  
  // Banking/Store parameters
  bankId?: string;
  storeId?: string;
  
  // Skill parameters
  skill?: string;
  resourceId?: string;
  
  // Generic parameters
  [key: string]: string | number | boolean | Position3D | undefined;
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
  getAll(): Entity[];
  
  // Player-specific methods
  getPlayer?(id: string): PlayerEntity | null;
  getLocalPlayer?(): PlayerEntity | null;
  getPlayers?(): PlayerEntity[];
  getAllPlayers(): PlayerEntity[];
}

// Chat message interface with all required properties
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
export { Chat } from '../systems/Chat';
export { ClientActions } from '../systems/ClientActions';
export { ClientAudio } from '../systems/ClientAudio';
export { ClientInput } from '../systems/ClientInput'; // Keyboard, mouse, touch, XR input handling
export { ClientGraphics } from '../systems/ClientGraphics';
export { ClientLiveKit } from '../systems/ClientLiveKit';
export { ClientLoader } from '../systems/ClientLoader';
export { ClientNetwork } from '../systems/ClientNetwork';
export { ClientInterface } from '../systems/ClientInterface'; // UI state, preferences, stats display
export { ClientRuntime } from '../systems/ClientRuntime'; // Client lifecycle and diagnostics
// ServerRuntime is server-only and should not be exported for client use
// It's available only in the main index (server-side)
// ServerNetwork is server-only and should not be exported for client use
// Use type-only import if needed: import type { ServerNetwork } from '../systems/ServerNetwork';
export { Settings } from '../systems/Settings';
export { XR as XRSystem } from '../systems/XR';

// Export missing core system types
export { Anchors } from '../systems/Anchors';
export { Events } from '../systems/Events';
export { Stage } from '../systems/Stage';

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

// EntityData and ComponentData are now exported from base-types.ts

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
  db?: SystemDatabase;
  // Client-network convenience options (optional)
  wsUrl?: string;
  name?: string;
  avatar?: string;
}

// Use the actual World class from core/World.ts
// World is already exported as a type above

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
  new (world: World, config?: SystemConfig): System;
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
// Position3D, Position2D, Vector3D, Vector2D are now exported from base-types.ts

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

// Character Controller types
export interface CharacterController {
  id: string;
  position: Vector3;
  velocity: Vector3;
  isGrounded: boolean;
  radius: number;
  height: number;
  maxSpeed: number;
  move: (displacement: Vector3) => void;
  jump: () => void;
  walkToward: (
    targetPosition: { x: number; y?: number; z: number },
    speed?: number
  ) => Vector3;
  walk?: (direction: { x: number; z: number }, speed?: number) => Vector3;
  setPosition: (position: Vector3) => void;
  getPosition: () => Vector3;
  getVelocity: () => Vector3;
}

export interface CharacterControllerOptions {
  id: string;
  position?: Vector3;
  radius?: number;
  height?: number;
  maxSpeed?: number;
  move?: (displacement: Vector3) => void;
  jump?: () => void;
  walkToward?: (
    targetPosition: { x: number; y?: number; z: number },
    speed?: number
  ) => Vector3;
  walk?: (direction: { x: number; z: number }, speed?: number) => Vector3;
  setPosition?: (position: Vector3) => void;
  getPosition?: () => Vector3;
  getVelocity?: () => Vector3;
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

  // Plugin-specific extensions
  enabled?: boolean;
  timeStep?: number;
  gravity?: Vector3;
  controllers?: Map<string, CharacterController>;
  step?: (deltaTime: number) => void;
  createCharacterController?: (options: CharacterControllerOptions) => CharacterController;
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

// Player Entity Types (ECS)
export type PlayerEntity = Entity & {
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
  chat(text: string): void;
}

export interface PlayerInput {
  movement: Vector3;
  rotation: Quaternion;
  actions: Set<string>;
  mouse: { x: number; y: number };
}

// Use the concrete Node base class from nodes module under a non-DOM-colliding alias
export type HSNode = NodeClass;
// Also export it as Node for external type imports that expect Node
export type Node = HSNode;

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

// CameraEntry removed; camera is controlled exclusively by ClientCameraSystem

export interface PointerEntry {
  $pointer: true;
  coords: THREE.Vector3;
  position: THREE.Vector3;
  delta: THREE.Vector3;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export type ControlEntry = ButtonEntry | VectorEntry | ValueEntry | ScreenEntry | PointerEntry;

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
  release(): void;
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
  toNodes: () => Map<string, HSNode>; // Node type from node system
  getStats: () => { fileBytes?: number; [key: string]: unknown };
}

export interface LoadedEmote {
  toNodes: () => Map<string, HSNode>;
  getStats: () => { fileBytes?: number; [key: string]: unknown };
  // Match createEmoteFactory toClip signature (VRM retarget options)
  toClip: (options?: { rootToHips?: number; version?: string; getBoneName?: (name: string) => string }) => THREE.AnimationClip | null;
}

export interface LoadedAvatar {
  uid: string;
  factory: AvatarFactory;
  toNodes: (customHooks?: { scene: THREE.Scene; octree?: unknown; camera?: unknown; loader?: unknown }) => Map<string, HSNode>;
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

// SystemDatabase type - re-exported from database.ts via the export * statement above
