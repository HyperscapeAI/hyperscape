/**
 * Physics-related type definitions (non-PhysX specific)
 */

import * as THREE from '../core/extras/three';
import type { System } from '../core/systems/System';

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
  quaternion?: THREE.Quaternion;
  fov?: number;
}

export interface Camera {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fov?: number;
}

// BufferedLerpQuaternion interfaces
export interface Sample {
  time: number;
  quaternion: THREE.Quaternion;
}

// Layers interfaces
export interface Layer {
  id: number;
  name: string;
}

export interface LayersType {
  [key: string]: Layer;
}

// LooseOctree interfaces
export interface OctreeItem {
  id: string;
  position: THREE.Vector3;
  radius: number;
  object?: unknown;
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
  type: string;
  duration?: number;
  intensity?: number;
  color?: string | number;
  [key: string]: unknown;
}

export interface EffectOptions {
  duration?: number;
  intensity?: number;
  color?: string | number;
  fadeIn?: number;
  fadeOut?: number;
  loop?: boolean;
  cancellable?: boolean;
  onEnd?: () => void;
}

// Player touch interfaces
export interface PlayerTouch {
  id: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
  startTime: number;
}

export interface StickState {
  active: boolean;
  angle: number;
  distance: number;
}

export interface NodeDataFromGLB {
  type: string;
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  [key: string]: unknown;
}