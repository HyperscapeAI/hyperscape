/**
 * Node-related type definitions
 */

import type { NodeData, HotReloadable, Entity } from './index';
import type { Node } from '../core/nodes/Node';
import * as THREE from '../core/extras/three';
import type * as YogaTypes from 'yoga-layout';
import type { PxTransform, PxShape, PxRigidBodyFlagEnum } from './physx';

// Avatar interfaces
export interface NodeStats {
  bones: number;
  meshes: number;
  materials: number;
  textures: number;
}

export interface AvatarFactory {
  uid: string;
  create: (url?: string) => AvatarInstance;
}

export interface AvatarHooks {
  onFrame?: (delta: number) => void;
}

export interface AvatarInstance<T = Record<string, unknown>> extends HotReloadable {
  hooks?: AvatarHooks;
  destroy: () => void;
  set?: <K extends keyof T>(key: K, value: T[K]) => void;
  get?: <K extends keyof T>(key: K) => T[K] | undefined;
}

export interface LoadedAvatar {
  uid: string;
  factory: AvatarFactory;
}

export interface AvatarData extends NodeData {
  src?: string;
  skeleton?: string;
  emotes?: string[];
}

// Image interfaces
export interface ImageSceneItem {
  matrix: THREE.Matrix4;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  getEntity: () => Entity | null;
  node: Node;
}

export interface ImageData extends NodeData {
  src?: string;
  color?: string | number;
  emissive?: string | number;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  alphaTest?: number;
}

// Nametag interfaces
export interface NametagHandle {
  text: string;
  subtext?: string;
  subtextColor?: string;
  visible: boolean;
  offset: number;
  destroy: () => void;
}

export interface NametagData extends NodeData {
  text?: string;
  subtext?: string;
  subtextColor?: string;
  offset?: number;
}

// Joint interfaces
export interface PxSpring {
  stiffness: number;
  damping: number;
}

export interface PxJointLimitCone {
  yAngle: number;
  zAngle: number;
  contactDistance?: number;
}

export interface PxJointAngularLimitPair {
  lower: number;
  upper: number;
  contactDistance?: number;
}

export interface JointLimits {
  linear?: {
    x?: { lower: number; upper: number; };
    y?: { lower: number; upper: number; };
    z?: { lower: number; upper: number; };
  };
  angular?: {
    x?: { lower: number; upper: number; };
    y?: { lower: number; upper: number; };
    z?: { lower: number; upper: number; };
  };
  distance?: {
    min: number;
    max: number;
  };
  cone?: PxJointLimitCone;
}

export interface JointDrive {
  position?: { x?: number; y?: number; z?: number; };
  velocity?: { x?: number; y?: number; z?: number; };
  angularVelocity?: { x?: number; y?: number; z?: number; };
  stiffness?: number;
  damping?: number;
  forceLimit?: number;
}

// Joint flag enums
export enum PxConstraintFlag {
  eBROKEN = 1 << 0,
  ePROJECTION = 1 << 1,
  eCOLLISION_ENABLED = 1 << 2,
  eVISUALIZATION = 1 << 3,
  eDRIVE_LIMITS_ARE_FORCES = 1 << 4,
  eIMPROVED_SLERP = 1 << 7,
  eDISABLE_PREPROCESSING = 1 << 8,
  eENABLE_EXTENDED_LIMITS = 1 << 9,
  eGPU_COMPATIBLE = 1 << 10
}

export interface PhysXJoint {
  setBreakForce: (force: number, torque: number) => void;
  setConstraintFlag: (flag: PxConstraintFlag | number, value: boolean) => void;
  setDrivePosition?: (position: THREE.Vector3) => void;
  setDriveVelocity?: (velocity: THREE.Vector3) => void;
  setDistanceJointFlag?: (flag: number, value: boolean) => void;
  setLimit?: (limit: PxJointAngularLimitPair) => void;
  setLimitCone?: (limit: PxJointLimitCone) => void;
  setLinearLimit?: (axis: number, limit: PxJointAngularLimitPair) => void;
  setAngularLimit?: (axis: number, lower: number, upper: number) => void;
  setSphericalJointFlag?: (flag: number, value: boolean) => void;
  setRevoluteJointFlag?: (flag: number, value: boolean) => void;
  setPrismaticJointFlag?: (flag: number, value: boolean) => void;
  release: () => void;
}

export interface PhysXController {
  getPosition: () => THREE.Vector3;
}

export interface PhysXMoveFlags {
  eDOWN: number;
  eSIDES: number;
  eUP: number;
  eCOLLISION_SIDES: number;
  eCOLLISION_UP: number;
  eCOLLISION_DOWN: number;
  [key: string]: number;
}

export interface Vector3WithPxTransform extends THREE.Vector3 {
  toPxTransform?: (transform: PxTransform) => void;
}

export interface QuaternionWithPxTransform extends THREE.Quaternion {
  toPxTransform?: (transform: PxTransform) => void;
}

export interface JointData extends NodeData {
  type?: 'fixed' | 'distance' | 'spherical' | 'revolute' | 'prismatic' | 'd6';
  connectedBody?: string;
  breakForce?: number;
  breakTorque?: number;
  limits?: JointLimits;
  drive?: JointDrive;
  [key: string]: unknown;
}

// RigidBody flag enums
export enum PxRigidBodyFlag {
  eKINEMATIC = 1 << 0,
  eUSE_KINEMATIC_TARGET_FOR_SCENE_QUERIES = 1 << 1,
  eENABLE_CCD = 1 << 2,
  eENABLE_CCD_FRICTION = 1 << 3,
  eENABLE_POSE_INTEGRATION_PREVIEW = 1 << 4,
  eENABLE_SPECULATIVE_CCD = 1 << 5,
  eENABLE_CCD_MAX_CONTACT_IMPULSE = 1 << 6,
  eRETAIN_ACCELERATIONS = 1 << 7
}

// RigidBody interfaces
export interface PhysXActor<T = unknown> {
  getGlobalPose: () => PxTransform;
  setGlobalPose: (pose: PxTransform, wakeup?: boolean) => void;
  setRigidBodyFlag?: (flag: PxRigidBodyFlagEnum | number, value: boolean) => void;
  setLinearVelocity?: (velocity: THREE.Vector3, wakeup?: boolean) => void;
  getLinearVelocity?: () => THREE.Vector3;
  setAngularVelocity?: (velocity: THREE.Vector3, wakeup?: boolean) => void;
  getAngularVelocity?: () => THREE.Vector3;
  setMass?: (mass: number) => void;
  getMass?: () => number;
  userData?: T;
  release: () => void;
  // Additional methods used by RigidBody
  setCMassLocalPose?: (pose: PxTransform) => void;
  setLinearDamping?: (damping: number) => void;
  setAngularDamping?: (damping: number) => void;
  attachShape?: (shape: PxShape) => void;
  detachShape?: (shape: PxShape) => void;
  isSleeping?: () => boolean;
  addForce?: (force: unknown, mode?: number) => void;
  addTorque?: (torque: unknown, mode?: number) => void;
  setKinematicTarget?: (transform: PxTransform) => void;
}

export interface PhysXActorHandle {
  actor: PhysXActor;
  release: () => void;
  move?: (matrix: THREE.Matrix4) => void;
  destroy?: () => void;
}

// Physics contact/trigger event types
export interface PhysicsContactEvent {
  bodyA: PhysXActor;
  bodyB: PhysXActor;
  normal?: THREE.Vector3;
  impulse?: THREE.Vector3;
  contactPoint?: THREE.Vector3;
}

export interface PhysicsTriggerEvent {
  trigger: PhysXActor;
  other: PhysXActor;
  isEnter: boolean;
}

export interface RigidBodyData extends Record<string, unknown> {
  type?: 'static' | 'dynamic' | 'kinematic' | string;
  mass?: number;
  linearDamping?: number;
  angularDamping?: number;
  lockPosition?: { x?: boolean; y?: boolean; z?: boolean };
  lockRotation?: { x?: boolean; y?: boolean; z?: boolean };
  tag?: string | null;
  onContactStart?: ((event: PhysicsContactEvent) => void) | null;
  onContactEnd?: ((event: PhysicsContactEvent) => void) | null;
  onTriggerEnter?: ((event: PhysicsTriggerEvent) => void) | null;
  onTriggerLeave?: ((event: PhysicsTriggerEvent) => void) | null;
}

// UI interfaces
export interface UIYogaNode {
  setWidth(width: number): void;
  setHeight(height: number): void;
  setBorder(edge: number, value: number): void;
  setPadding(edge: number, value: number): void;
  setFlexDirection(direction: number): void;
  setJustifyContent(justifyContent: number): void;
  setAlignItems(alignItems: number): void;
  setAlignContent(alignContent: number): void;
  setFlexWrap(flexWrap: number): void;
  setGap(gutter: number, value: number): void;
  calculateLayout(width: number, height: number, direction: number): void;
  getComputedLeft(): number;
  getComputedTop(): number;
  getComputedWidth(): number;
  getComputedHeight(): number;
  free(): void;
}

export interface UISceneItem {
  matrix: THREE.Matrix4;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  getEntity: () => Entity | null;
  node: Node; // Node instance from UI class
  activate?: () => void;
  deactivate?: () => void;
  visible?: boolean;
}

export interface UIProxy {
  [key: string]: unknown;
}

// UI Event types
export interface UIPointerEvent {
  point: THREE.Vector3;
  localPoint?: THREE.Vector2;
  distance: number;
  face?: THREE.Face;
  coords?: { x: number; y: number };
  target?: Node;
  type: 'pointerenter' | 'pointerleave' | 'pointerdown' | 'pointerup' | 'pointerclick';
  button?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export interface UIWheelEvent extends UIPointerEvent {
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  deltaMode: number;
}

export interface UIRaycastHit {
  point: THREE.Vector3;
  distance: number;
  [key: string]: unknown;
}

export interface RaycastHit {
  point: THREE.Vector3;
  distance: number;
  face?: THREE.Face;
  object: THREE.Object3D;
  coords?: { x: number; y: number };
  localPoint?: THREE.Vector2;
}

export interface UIData extends NodeData {
  space?: string;
  width?: number;
  height?: number;
  size?: number;
  res?: number;
  
  lit?: boolean;
  doubleside?: boolean;
  billboard?: string;
  pivot?: string;
  offset?: number[];
  scaler?: number[] | null;
  pointerEvents?: boolean;
  
  transparent?: boolean;
  backgroundColor?: string | null;
  borderWidth?: number;
  borderColor?: string | null;
  borderRadius?: number | number[];
  padding?: number | number[];
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  alignContent?: string;
  flexWrap?: string;
  gap?: number;
  
  onPointerEnter?: (event: UIPointerEvent) => void;
  onPointerLeave?: (event: UIPointerEvent) => void;
  onPointerDown?: (event: UIPointerEvent) => void;
  onPointerUp?: (event: UIPointerEvent) => void;
  onPointerClick?: (event: UIPointerEvent) => void;
  onWheel?: (event: UIWheelEvent) => void;
  onContextMenu?: (event: UIPointerEvent) => void;
  
  [key: string]: unknown;
  
  // Alternative properties for compatibility
  pixelSize?: number;
  interactive?: boolean;
  renderOrder?: number;
}

// Mesh interfaces
export interface MeshSceneItem {
  matrix: THREE.Matrix4;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  getEntity: () => Entity | null;
  node: Node;
}

export interface MeshData extends NodeData {
  type?: string;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  geometry?: THREE.BufferGeometry | string;
  material?: THREE.Material | string;
  linked?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  visible?: boolean;
  frustumCulled?: boolean;
  [key: string]: unknown;
}

// LOD interfaces
export interface LODData extends NodeData {
  scaleAware?: boolean;
  distances?: number[];
  [key: string]: unknown;
}

export interface LODItem {
  node: Node;
  maxDistance: number;
  // Alternative properties for compatibility
  distance?: number;
  object?: THREE.Object3D;
}

// Controller interfaces
export interface ControllerData extends NodeData {
  type?: 'capsule' | 'box';
  height?: number;
  radius?: number;
  stepOffset?: number;
  slopeLimit?: number;
  skinWidth?: number;
  minMoveDistance?: number;
  gravity?: boolean;
  visible?: boolean;
  layer?: string;
  tag?: string | number | null;
  onContactStart?: ((event: PhysicsContactEvent) => void) | null;
  onContactEnd?: ((event: PhysicsContactEvent) => void) | null;
}

// SkinnedMesh interfaces
export interface SkinnedMeshData extends NodeData {
  geometry?: string;
  material?: string;
  skeleton?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
  frustumCulled?: boolean;
}

// Audio interfaces
export interface AudioData extends NodeData {
  src?: string;
  volume?: number;
  loop?: boolean;
  autoplay?: boolean;
  spatial?: boolean;
  refDistance?: number;
  rolloffFactor?: number;
  maxDistance?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
}

// Particles interfaces
export interface ParticleEmitter {
  // ... particle emitter properties
  [key: string]: unknown;
}

export interface ParticlesData extends NodeData {
  emitters?: ParticleEmitter[];
}

// UIImage interfaces
export interface YogaNode extends YogaTypes.Node {
  calculateLayout: (width?: number | 'auto', height?: number | 'auto', direction?: YogaTypes.Direction) => void;
}

export interface UINode {
  yoga: YogaNode;
  type: string;
  props: Record<string, unknown>;
  children: UINode[];
}

export interface UIImageNode {
  complete: boolean;
  width: number;
  height: number;
  [key: string]: unknown;
}

export interface UIBoxNode {
  width: number;
  height: number;
  color: string;
}

export interface UIImageData extends NodeData {
  src?: string;
  width?: number | string;
  height?: number | string;
  objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
}
