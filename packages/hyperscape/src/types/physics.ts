/**
 * Physics-related type definitions (non-PhysX specific)
 */

import * as THREE from '../extras/three';
import type { System } from '../systems/System';
import type PhysX from '@hyperscape/physx-js-webidl'
import type { Entity, Collider } from './index'

// Geometry to PhysX mesh conversion interfaces
export interface GeometryPhysXMesh {
  release: () => void;
}

export interface GeometryCacheItem {
  id: string;
  pmesh: GeometryPhysXMesh;
  refs: number;
}

export interface PMeshHandle {
  pmesh: GeometryPhysXMesh;
  addRef: () => void;
  release: () => void;
}

// Client UI interfaces
export interface UIState {
  visible: boolean;
  locked: boolean;
  activePanel: string | null;
  panels: Set<string>;
  callbacks: Map<string, () => void>;
}

export interface ControlWithRelease {
  name: string;
  release?: () => void;
}

// ClientActions interfaces
export interface ActionHandler {
  node: THREE.Object3D;
  handler: (event: { point: THREE.Vector3; normal: THREE.Vector3 }) => void;
}

// Camera system interfaces
export interface PlayerTarget extends THREE.Object3D {
  matrixWorld: THREE.Matrix4;
}

export interface RendererWithDomElement {
  domElement: HTMLElement;
}

export interface UISystemWithCameraRegister extends System {
  registerCameraControls?: (element: HTMLElement) => void;
}

export interface ControlsWithEnabled extends System {
  enabled?: boolean;
}

// Wind system interfaces
export interface WindUniforms {
  time: { value: number };
  windDirection: { value: THREE.Vector3 };
  windStrength: { value: number };
  windFrequency: { value: number };
}

// Ground checking interfaces
export interface TerrainSystem extends System {
  getHeightAtPosition?: (x: number, z: number) => number;
  getGroundInfoAtPosition?: (x: number, z: number) => { height: number; normal?: THREE.Vector3 };
}

export interface PhysicsSystemWithRaycast extends System {
  raycast?: (origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number, layers?: number) => unknown;
}

export interface GroundCheckResult {
  isGrounded: boolean;
  groundHeight: number;
  groundNormal?: THREE.Vector3;
  distance: number;
}

export interface GroundCheckEntity {
  position: THREE.Vector3;
  lastGroundCheck?: GroundCheckResult;
}

// Nametag system interfaces
export interface Nametag {
  text: string;
  subtext?: string;
  subtextColor?: string;
  position: THREE.Vector3;
  offset: number;
  visible: boolean;
  priority: number;
  element?: HTMLDivElement;
  lastUpdate?: number;
}

// Spatial index interfaces
export interface SpatialCell {
  entities: Set<string>;
}

export interface SpatialQuery {
  center: THREE.Vector3;
  radius: number;
  filter?: (entityId: string) => boolean;
}

// ClientTarget interfaces
export interface DOMRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HTMLDivElement {
  style: CSSStyleDeclaration;
  getBoundingClientRect: () => DOMRect;
}

// Time system interfaces
export interface TimeConfig {
  dayDuration?: number; // Real seconds for a full day cycle
  startHour?: number; // Starting hour (0-23)
  timeScale?: number; // Time multiplier
}

// Server network interfaces
export interface NodeWebSocket extends WebSocket {
  isAlive?: boolean;
  userId?: string;
  terminate?: () => void;
}

export interface NetworkWithSocket {
  socket?: NodeWebSocket;
  close?: () => void;
}

export interface DatabaseInterface {
  users?: {
    get: (userId: string) => Promise<User | null>;
    set: (userId: string, data: User) => Promise<void>;
    delete: (userId: string) => Promise<void>;
  };
  worlds?: {
    get: (worldId: string) => Promise<unknown>;
    set: (worldId: string, data: unknown) => Promise<void>;
  };
}

export interface User {
  id: string;
  name?: string;
  avatar?: string;
  lastSeen?: Date;
  [key: string]: unknown;
}

// Network entity interface
export interface NetworkEntity {
  id: string;
  owner: string;
  data: Record<string, unknown>;
  lastUpdate: number;
}

// Terrain validation interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface TerrainChunk {
  x: number;
  z: number;
  heightMap?: Float32Array;
  mesh?: THREE.Mesh;
  lastUpdate?: number;
}

// Curve manager interfaces
export interface CurveManagerOptions {
  divisions?: number;
  closed?: boolean;
  tension?: number;
}

// Camera interpolation interfaces
export interface CameraTarget {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  zoom: number;
}

export interface Camera {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  zoom: number;
}

// BufferedLerpQuaternion interfaces
export interface Sample {
  time: number;
  value: THREE.Quaternion;
}

// Layers interfaces
export interface Layer {
  group: number;
  mask: number;
}

export interface LayersType {
  camera?: Layer;
  player?: Layer;
  environment?: Layer;
  prop?: Layer;
  tool?: Layer;
  [key: string]: Layer | undefined;
}

// LooseOctree interfaces
export interface OctreeItem {
  sphere?: THREE.Sphere;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  matrix: THREE.Matrix4;
  getEntity: () => unknown;
  node?: unknown;
  _node?: {
    canContain?: (item: OctreeItem) => boolean;
    checkCollapse?: () => void;
    remove?: (item: OctreeItem) => void;
  };
}

export interface RenderHelperItem {
  idx: number;
  matrix: THREE.Matrix4;
}

export interface OctreeHelper {
  init: () => void;
  insert: (node: unknown) => void;
  remove: (node: unknown) => void;
  destroy: () => void;
}

export interface ExtendedIntersection extends THREE.Intersection {
  getEntity?: () => unknown;
  node?: unknown;
}

export interface ShaderModifier {
  vertexShader: string;
}

export interface LooseOctreeOptions {
  maxDepth?: number;
  maxItemsPerNode?: number;
  looseness?: number;
  bounds?: { min: THREE.Vector3; max: THREE.Vector3 };
}

export interface HelperItem {
  position: THREE.Vector3;
  radius: number;
}

// Player proxy interfaces
export interface PlayerEffect {
  anchorId?: string;
  emote?: string;
  snare?: number;
  freeze?: boolean;
  turn?: boolean;
  duration?: number;
  cancellable?: boolean;
}

export interface EffectOptions {
  anchor?: { anchorId: string };
  emote?: string;
  snare?: number;
  freeze?: boolean;
  turn?: boolean;
  duration?: number;
  cancellable?: boolean;
  onEnd?: () => void;
}

// Player touch interfaces
export interface PlayerTouch {
  id: number;
  x: number;
  y: number;
  pressure: number;
  position?: { x: number; y: number };
  delta?: { x: number; y: number };
}

export interface StickState {
  active: boolean;
  angle: number;
  distance: number;
}

export interface PlayerStickState {
  touch: PlayerTouch;
  center: { x: number; y: number };
}

export interface NodeDataFromGLB {
  type: string;
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  [key: string]: unknown;
}

// Physics system types from Physics.ts
// PhysX type aliases
export type PxActor = PhysX.PxActor
export type PxRigidDynamic = PhysX.PxRigidDynamic
export type PxRigidStatic = PhysX.PxRigidStatic
export type PxTransform = PhysX.PxTransform
export type PxShape = PhysX.PxShape
export type PxMaterial = PhysX.PxMaterial
export type PxScene = PhysX.PxScene
export type PxController = PhysX.PxController
export type PxControllerManager = PhysX.PxControllerManager
export type PxPhysics = PhysX.PxPhysics
export type PxGeometry = PhysX.PxGeometry
export type PxSphereGeometry = PhysX.PxSphereGeometry
export type PxFoundation = PhysX.PxFoundation
export type PxTolerancesScale = PhysX.PxTolerancesScale
export type PxCookingParams = PhysX.PxCookingParams
export type PxControllerFilters = PhysX.PxControllerFilters
export type PxQueryFilterData = PhysX.PxQueryFilterData
export type PxRaycastResult = PhysX.PxRaycastResult
export type PxSweepResult = PhysX.PxSweepResult
export type PxOverlapResult = PhysX.PxOverlapResult
export type PxVec3 = PhysX.PxVec3

// Contact/Trigger events
export interface ContactEvent {
  tag: string | null;
  playerId: string | null;
  contacts?: Array<{
    position: THREE.Vector3;
    normal: THREE.Vector3;
    impulse: THREE.Vector3;
  }>;
}

export interface TriggerEvent {
  tag: string | null;
  playerId: string | null;
}

// Physics handles
export interface InterpolationData {
  prev: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  next: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  curr: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  skip?: boolean;
}

export interface BasePhysicsHandle {
  actor?: PxActor | PxRigidDynamic;
  tag?: string;
  playerId?: string;
  controller?: boolean;
  node?: unknown;
  onContactStart?: (event: ContactEvent) => void;
  onContactEnd?: (event: ContactEvent) => void;
  onTriggerEnter?: (event: TriggerEvent) => void;
  onTriggerLeave?: (event: TriggerEvent) => void;
  contactedHandles: Set<PhysicsHandle>;
  triggeredHandles: Set<PhysicsHandle>;
}

export interface InterpolatedPhysicsHandle extends BasePhysicsHandle {
  onInterpolate: (position: THREE.Vector3, quaternion: THREE.Quaternion) => void;
  interpolation: InterpolationData;
}

export interface NonInterpolatedPhysicsHandle extends BasePhysicsHandle {
  onInterpolate?: undefined;
  interpolation?: undefined;
}

export type PhysicsHandle = InterpolatedPhysicsHandle | NonInterpolatedPhysicsHandle;

// Raycast/Sweep hits
export interface PhysicsRaycastHit {
  handle?: PhysicsHandle;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: Collider;
  entity?: Entity;
}

export interface PhysicsSweepHit {
  actor: PxActor | PxRigidDynamic;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: Collider;
  entity?: Entity;
  handle?: unknown;
}

export interface PhysicsOverlapHit {
  actor: PxActor | PxRigidDynamic;
  handle: PhysicsHandle | null;
  proxy?: {
    get tag(): string | null;
    get playerId(): string | null;
  };
}

// Actor handle
export interface ActorHandle {
  move: (matrix: THREE.Matrix4) => void;
  snap: (pose: PxTransform) => void;
  destroy: () => void;
}

// Contact/Trigger info
export interface ContactInfo {
  handle0: PhysicsHandle;
  handle1: PhysicsHandle;
  positions: THREE.Vector3[];
  normals: THREE.Vector3[];
  impulses: number[];
}

export interface TriggerInfo {
  handle0: PhysicsHandle;
  handle1: PhysicsHandle;
}

// Additional ground checking interfaces for GroundCheckingSystem
export interface GroundCheckingSystemResult {
  groundHeight: number
  isValid: boolean
  correction: THREE.Vector3
}

export interface GroundCheckingSystemEntity {
  id: string
  position: THREE.Vector3
  needsGroundCheck: boolean
  lastGroundCheck: number
  groundOffset: number
}

// Utility interfaces for polymorphic THREE.js objects
export interface Vector3Like {
  x: number;
  y: number;
  z: number;
  copy?(v: THREE.Vector3): void;
}

export interface QuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
  copy?(q: THREE.Quaternion): void;
}

// System capability interfaces
export interface HotReloadable {
  hotReload?(): void;
}

export interface CameraSystem {
  target?: unknown;
  setTarget(player: unknown): void;
  removeTarget(player: unknown): void;
  getCamera(): THREE.PerspectiveCamera;
  update(delta: number): void;
}

export interface XRSystem {
  session?: unknown;
  camera?: THREE.Camera;
}

// VRM factory interfaces
export interface VRMHooks {
  scene: THREE.Scene;
  octree?: {
    insert: (item: unknown) => void;
    move?: (item: unknown) => void;
    remove?: (item: unknown) => void;
  };
  camera?: unknown;
  loader?: unknown;
}

// Global THREE.js interface
export interface GlobalWithTHREE {
  THREE?: typeof THREE;
  __THREE_DEVTOOLS__?: unknown;
}

// Material extensions for texture access
export interface MaterialWithTextures extends THREE.Material {
  alphaMap?: THREE.Texture;
  aoMap?: THREE.Texture;
  bumpMap?: THREE.Texture;
  displacementMap?: THREE.Texture;
  emissiveMap?: THREE.Texture;
  envMap?: THREE.Texture;
  lightMap?: THREE.Texture;
  map?: THREE.Texture;
  metalnessMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
}