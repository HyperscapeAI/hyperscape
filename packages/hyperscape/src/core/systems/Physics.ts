import type { Collider, Entity, Physics as IPhysics, RaycastHit as IRaycastHit, PhysicsMaterial, Quaternion, RigidBody, Vector3, World } from '../../types/index';

import { Layers } from '../extras/Layers';
import * as THREE from '../extras/three';
import { getPhysX, waitForPhysX } from '../PhysXManager';
import {
  createCpuDispatcher,
  getActorAddress,
  getActorsFromHeader
} from '../physics/physx-helpers';
import {
  cleanupPxVec3,
  vector3ToPxVec3
} from '../physics/vector-conversions';
import { System, SystemDependencies } from './System';


// Import PhysX types
import type PhysX from '@hyperscape/physx-js-webidl';
// Use physx-js-webidl types directly to avoid conflicts
import type {
  PxActor,
  PxContactPair,
  PxController,
  PxControllerFilters,
  PxControllerManager,
  PxCookingParams,
  PxFoundation,
  PxGeometry,
  PxHitFlags,
  PxMaterial,
  PxOverlapResult,
  PxPhysics,
  PxQueryFilterData,
  PxRaycastResult,
  PxRigidBody,
  PxRigidDynamic,
  PxRigidStatic,
  PxScene,
  PxShape,
  PxSphereGeometry,
  PxSweepResult,
  PxTolerancesScale,
  PxTransform,
  PxTriggerPair,
  PxVec3
} from '../../types/physx';

// All PhysX type extensions are now imported from physx-runtime.d.ts

// All types now imported from physx-webidl.d.ts which uses physx-js-webidl as the source

// Import proper PxVec3 type from physx types - no need for any
// PxVec3 is properly defined in the physx.d.ts file

// Re-export PhysX types with PhysX prefix for backward compatibility
export type PhysXActor = PxActor;
export type PhysXTransform = PxTransform;
export type PhysXShape = PxShape;
export type PhysXMaterial = PxMaterial;
export type PhysXRigidActor = PxActor;
export type PhysXRigidBody = PxRigidBody;
export type PhysXRigidDynamic = PxRigidDynamic;
export type PhysXRigidStatic = PxRigidStatic;
export type PhysXScene = PxScene;
export type PhysXController = PxController;
export type PhysXControllerManager = PxControllerManager;
export type PhysXPhysics = PxPhysics;
export type PhysXGeometry = PxGeometry;
export type PhysXSphereGeometry = PxSphereGeometry;

// Actor with address property for handle lookup
interface PxActorWithAddress extends PxActor {
  _address: number | bigint;
}

// PhysX module type for runtime features
// This interface represents the actual physx-js-webidl module with extensions
type PhysXModule = typeof PhysX & {
  // Additional runtime properties that may be available
  wrapPointer?<T>(ptr: number, type: new (...args: unknown[]) => T): T;
  NativeArrayHelpers?: {
    prototype: {
      getContactPairAt?(pairs: PxContactPair, index: number): PxContactPair;
    };
  };
  SupportFunctions?: {
    prototype: {
      PxScene_getActiveActors?(scene: PxScene): unknown;
    };
  };
};

// Simple hit result conversion function
function convertHitResult(hit: PhysX.PxRaycastHit | PhysX.PxSweepHit): {
  actor: PxActor;
  position: PhysX.PxVec3;
  normal: PhysX.PxVec3;
  distance: number;
} {
  return {
    actor: hit.actor,
    position: hit.position,
    normal: hit.normal,
    distance: hit.distance
  };
}

// Import additional types

// Internal types for callback pool objects
interface InternalContactCallback {
  start: boolean;
  fn0: ((event: ContactEvent) => void) | null;
  event0: ContactEvent;
  fn1: ((event: ContactEvent) => void) | null;
  event1: ContactEvent;
  addContact(position: THREE.Vector3, normal: THREE.Vector3, impulse: THREE.Vector3): void;
  init(start: boolean): this;
  exec(): void;
  release(): void;
}

interface InternalTriggerCallback {
  fn: ((event: TriggerEvent) => void) | null;
  event: TriggerEvent;
  exec(): void;
  release(): void;
}

export interface PhysicsRaycastHit {
  handle?: PhysicsHandle;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: Collider;
  entity?: import('../../types/index').Entity;
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

// Interpolation data structure
export interface InterpolationData {
  prev: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  next: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  curr: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  skip?: boolean;
}

// Base physics handle without interpolation
export interface BasePhysicsHandle {
  actor?: PxActor | PxRigidDynamic;
  tag?: string;
  playerId?: string;
  controller?: boolean;
  node?: unknown; // Reference to the associated node/controller
  onContactStart?: (event: ContactEvent) => void;
  onContactEnd?: (event: ContactEvent) => void;
  onTriggerEnter?: (event: TriggerEvent) => void;
  onTriggerLeave?: (event: TriggerEvent) => void;
  contactedHandles: Set<PhysicsHandle>;
  triggeredHandles: Set<PhysicsHandle>;
}

// Physics handle with interpolation (requires onInterpolate)
export interface InterpolatedPhysicsHandle extends BasePhysicsHandle {
  onInterpolate: (position: THREE.Vector3, quaternion: THREE.Quaternion) => void;
  interpolation: InterpolationData;
}

// Physics handle without interpolation
export interface NonInterpolatedPhysicsHandle extends BasePhysicsHandle {
  onInterpolate?: undefined;
  interpolation?: undefined;
}

// Union type for all physics handles
export type PhysicsHandle = InterpolatedPhysicsHandle | NonInterpolatedPhysicsHandle;

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

// Contact and trigger info for callbacks
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

// Actor handle interface for physics actors
export interface ActorHandle {
  move: (matrix: THREE.Matrix4) => void;
  snap: (pose: PxTransform) => void;
  destroy: () => void;
}

// Internal type aliases for this file
type OverlapHit = PhysicsOverlapHit;

// Static hit objects - initialized with null values for proper error handling
const _raycastHit: PhysicsRaycastHit = {
  handle: undefined,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  distance: 0,
  collider: null as unknown as Collider, // Will be populated on actual hits
};

const _sweepHit: PhysicsSweepHit = {
  actor: null as unknown as PhysX.PxActor, // Will be populated on actual hits
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  distance: 0,
  collider: null as unknown as Collider, // Will be populated on actual hits
};

const overlapHitPool: OverlapHit[] = [];
const overlapHits: OverlapHit[] = [];

/**
 * Physics System
 *
 * - Runs on both the server and client.
 * - Allows inserting colliders etc into the world.
 * - Simulates physics and handles fixed timestep interpolation.
 *
 */
export class Physics extends System implements IPhysics {
  scene: PxScene | null = null;
  version: number = 0;
  allocator: unknown;
  errorCb: unknown;
  foundation: PxFoundation | null = null;
  tolerances: PxTolerancesScale | null = null;
  cookingParams: PxCookingParams | null = null;
  physics!: PxPhysics;
  defaultMaterial: PxMaterial | null = null;
  callbackQueue: Array<() => void> = [];
  getContactCallback: (() => InternalContactCallback) | null = null;
  contactCallbacks: InternalContactCallback[] = [];
  queueContactCallback: ((cb: InternalContactCallback) => void) | null = null;
  processContactCallbacks: (() => void) | null = null;
  getTriggerCallback: (() => InternalTriggerCallback) | null = null;
  triggerCallbacks: InternalTriggerCallback[] = [];
  queueTriggerCallback: ((cb: InternalTriggerCallback) => void) | null = null;
  processTriggerCallbacks: (() => void) | null = null;
  handles: Map<number | bigint, PhysicsHandle> = new Map();
  active: Set<PhysicsHandle> = new Set();
  materials: Record<string, PxMaterial> = {};
  raycastResult: PxRaycastResult | null = null;
  sweepPose!: PxTransform;
  sweepResult: PxSweepResult | null = null;
  overlapPose!: PxTransform;
  overlapResult: PxOverlapResult | null = null;
  queryFilterData: PxQueryFilterData | null = null;
  _pv1: PxVec3 | null = null;
  _pv2: PxVec3 | null = null;
  transform!: PxTransform;
  public controllerManager: PxControllerManager | null = null;
  controllerFilters: PxControllerFilters | null = null;
  ignoreSetGlobalPose = false;

  constructor(world: World) {
    super(world);
  }

  getDependencies(): SystemDependencies {
    // Physics has no dependencies on other systems
    return {};
  }

  async init(): Promise<void> {
    try {
      // Use waitForPhysX to ensure PhysX is loaded
      const info = await waitForPhysX('Physics', 30000); // 30 second timeout
      this.version = info.version;
      this.allocator = info.allocator;
      this.errorCb = info.errorCb;
      this.foundation = info.foundation;

      // Get the global PHYSX object
      const PHYSX = getPhysX() as PhysXModule | null;
      if (!PHYSX) {
        throw new Error('[Physics] PHYSX global not available after loading');
      }

      // Create physics-specific objects (not shared with other systems)
      this.tolerances = new PHYSX.PxTolerancesScale();
      // PxCookingParams might not be available in all PhysX builds
      if (PHYSX.PxCookingParams) {
        this.cookingParams = new PHYSX.PxCookingParams(this.tolerances!);
      }
      
      // Use the physics instance from PhysXManager if available
      this.physics = info.physics;
      this.defaultMaterial = this.physics.createMaterial(0.2, 0.2, 0.2);

      this.setupCallbacks();
      this.setupScene();
      this.setupQueryObjects();
      this.setupControllerManager();
      
      // Mark physics as initialized
      this.initialized = true;
      
      // Emit ready event for other systems
      this.world.emit('physics:ready', {});
      
      console.log('[Physics] System initialized successfully with PhysX');
    } catch (error) {
      console.error('[Physics] Failed to initialize PhysX:', error);
      // PhysX is now required on both client and server
      throw error;
    }
  }

  private setupCallbacks(): void {
    // Contact callbacks
    this.getContactCallback = createPool<InternalContactCallback>(() => {
      const contactPool: Array<{ position: THREE.Vector3; normal: THREE.Vector3; impulse: THREE.Vector3 }> = [];
      const contacts: Array<{ position: THREE.Vector3; normal: THREE.Vector3; impulse: THREE.Vector3 }> = [];
      let idx = 0;
      return {
        start: false,
        fn0: null as ((event: ContactEvent) => void) | null,
        event0: {
          tag: null,
          playerId: null,
          contacts,
        },
        fn1: null as ((event: ContactEvent) => void) | null,
        event1: {
          tag: null,
          playerId: null,
          contacts,
        },
        addContact(position: THREE.Vector3, normal: THREE.Vector3, impulse: THREE.Vector3) {
          if (!contactPool[idx]) {
            contactPool[idx] = {
              position: new THREE.Vector3(),
              normal: new THREE.Vector3(),
              impulse: new THREE.Vector3(),
            };
          }
          const contact = contactPool[idx];
          contact.position.copy(position);
          contact.normal.copy(normal);
          contact.impulse.copy(impulse);
          contacts.push(contact);
          idx++;
        },
        init(start: boolean) {
          this.start = start;
          this.fn0 = null;
          this.fn1 = null;
          contacts.length = 0;
          idx = 0;
          return this;
        },
        exec() {
          if (this.fn0) {
            try {
              this.fn0(this.event0);
            } catch (_err) {
              console.error(_err);
            }
          }
          if (this.fn1) {
            try {
              this.fn1(this.event1);
            } catch (_err) {
              console.error(_err);
            }
          }
          this.release();
        },
        release: () => {}, // Set by pool
      };
    });

    this.queueContactCallback = (cb: InternalContactCallback) => {
      this.contactCallbacks.push(cb);
    };

    this.processContactCallbacks = () => {
      for (const cb of this.contactCallbacks) {
        cb.exec();
      }
      this.contactCallbacks.length = 0;
    };

    // Trigger callbacks
    this.getTriggerCallback = createPool<InternalTriggerCallback>(() => {
      return {
        fn: null as ((event: TriggerEvent) => void) | null,
        event: {
          tag: null as string | null,
          playerId: null as string | null,
        } as TriggerEvent,
        exec() {
          try {
            if (this.fn) this.fn(this.event);
          } catch (_err) {
            console.error(_err);
          }
          this.release();
        },
        release: () => {}, // Set by pool
      };
    });

    this.queueTriggerCallback = (cb: InternalTriggerCallback) => {
      this.triggerCallbacks.push(cb);
    };

    this.processTriggerCallbacks = () => {
      for (const cb of this.triggerCallbacks) {
        cb.exec();
      }
      this.triggerCallbacks.length = 0;
    };
  }

  private setupScene(): void {
    const PHYSX = getPhysX();
    if (!PHYSX) {
      throw new Error('[Physics] Cannot setup scene - PHYSX not loaded');
    }
    
    const contactPoints = new PHYSX.PxArray_PxContactPairPoint(64);
    const simulationEventCallback = new PHYSX.PxSimulationEventCallbackImpl();
    
        // Contact callback
    simulationEventCallback.onContact = (pairHeaderPtr: unknown, pairs: PxContactPair, count: number) => {
      const physxModule = PHYSX as PhysXModule;
      const pairHeader = physxModule.wrapPointer!(pairHeaderPtr as number, physxModule.PxContactPairHeader);
      const [actor0, actor1] = getActorsFromHeader(pairHeader);
      if (!actor0 || !actor1) return;
      const actor0Address = getActorAddress(actor0);
      const actor1Address = getActorAddress(actor1);
      if (actor0Address === undefined || actor1Address === undefined) return;
      
      const handle0 = this.handles.get(actor0Address);
      const handle1 = this.handles.get(actor1Address);
      if (!handle0 || !handle1) return;
      
      for (let i = 0; i < count; i++) {
        const pair = (PHYSX as PhysXModule).NativeArrayHelpers.prototype.getContactPairAt(pairs, i);
        if (pair.events.isSet(PHYSX.PxPairFlagEnum.eNOTIFY_TOUCH_FOUND)) {
          const getCallback = this.getContactCallback;
          if (!getCallback) continue;
          const contactCallback = getCallback().init(true);
          this.contactCallbacks.push(contactCallback);
          const pxContactPoints = pair.extractContacts(contactPoints.begin(), 64);
          if (pxContactPoints > 0) {
            for (let j = 0; j < pxContactPoints; j++) {
              const contact = contactPoints.get(j);
              contactCallback.addContact(
                new THREE.Vector3(contact.position.x, contact.position.y, contact.position.z),
                new THREE.Vector3(contact.normal.x, contact.normal.y, contact.normal.z),
                new THREE.Vector3(contact.impulse.x, contact.impulse.y, contact.impulse.z)
              );
            }
          }
          if (!handle0.contactedHandles.has(handle1)) {
            if (handle0.onContactStart) {
              contactCallback.fn0 = handle0.onContactStart;
              contactCallback.event0.tag = handle1.tag ?? null;
              contactCallback.event0.playerId = handle1.playerId ?? null;
            }
            handle0.contactedHandles.add(handle1);
          }
          if (!handle1.contactedHandles.has(handle0)) {
            if (handle1.onContactStart) {
              contactCallback.fn1 = handle1.onContactStart;
              contactCallback.event1.tag = handle0.tag ?? null;
              contactCallback.event1.playerId = handle0.playerId ?? null;
            }
            handle1.contactedHandles.add(handle0);
          }
        } else if (pair.events.isSet((PHYSX as PhysXModule).PxPairFlagEnum.eNOTIFY_TOUCH_LOST)) {
          const getCallback = this.getContactCallback;
          if (!getCallback) continue;
          const contactCallback = getCallback().init(false);
          this.contactCallbacks.push(contactCallback);
          if (handle0.contactedHandles.has(handle1)) {
            if (handle0.onContactEnd) {
              contactCallback.fn0 = handle0.onContactEnd;
              contactCallback.event0.tag = handle1.tag ?? null;
              contactCallback.event0.playerId = handle1.playerId ?? null;
            }
            handle0.contactedHandles.delete(handle1);
          }
          if (handle1.contactedHandles.has(handle0)) {
            if (handle1.onContactEnd) {
              contactCallback.fn1 = handle1.onContactEnd;
              contactCallback.event1.tag = handle0.tag ?? null;
              contactCallback.event1.playerId = handle0.playerId ?? null;
            }
            handle1.contactedHandles.delete(handle0);
          }
        }
      }
    };

    // Trigger callback
    simulationEventCallback.onTrigger = (pairs: unknown, count: number) => {
      const physxModule = getPhysX()!;
      pairs = (physxModule as PhysXModule).wrapPointer?.(pairs as number, PHYSX.PxTriggerPair);
      for (let i = 0; i < count; i++) {
        const pair = pairs as PxTriggerPair;
        // Ignore pairs if a shape was deleted
        if (
          pair.flags.isSet((PHYSX as PhysXModule).PxTriggerPairFlagEnum.eREMOVED_SHAPE_TRIGGER) ||
          pair.flags.isSet((PHYSX as PhysXModule).PxTriggerPairFlagEnum.eREMOVED_SHAPE_OTHER)
        ) {
          continue;
        }
        const triggerActor = pair.triggerShape.getActor();
        const otherActor = pair.otherShape.getActor();
        const triggerAddress = triggerActor ? getActorAddress(triggerActor) : undefined;
        const otherAddress = otherActor ? getActorAddress(otherActor) : undefined;
        if (!triggerAddress || !otherAddress) continue;
        const triggerHandle = this.handles.get(triggerAddress);
        const otherHandle = this.handles.get(otherAddress);
        if (!triggerHandle || !otherHandle) continue;
        
        if (pair.status === (PHYSX as PhysXModule).PxPairFlagEnum.eNOTIFY_TOUCH_FOUND) {
          if (!otherHandle.triggeredHandles.has(triggerHandle)) {
            if (triggerHandle.onTriggerEnter) {
              const getCallback = this.getTriggerCallback;
              if (!getCallback) continue;
              const cb = getCallback();
              cb.fn = triggerHandle.onTriggerEnter ;
              cb.event.tag = otherHandle.tag ?? null;
              cb.event.playerId = otherHandle.playerId ?? null;
              this.triggerCallbacks.push(cb);
            }
            otherHandle.triggeredHandles.add(triggerHandle);
          }
        } else if (pair.status === (PHYSX as PhysXModule).PxPairFlagEnum.eNOTIFY_TOUCH_LOST) {
          if (otherHandle.triggeredHandles.has(triggerHandle)) {
            if (triggerHandle.onTriggerLeave) {
              const getCallback = this.getTriggerCallback;
              if (!getCallback) continue;
              const cb = getCallback();
              cb.fn = triggerHandle.onTriggerLeave ;
              cb.event.tag = otherHandle.tag ?? null;
              cb.event.playerId = otherHandle.playerId ?? null;
              this.triggerCallbacks.push(cb);
            }
            otherHandle.triggeredHandles.delete(triggerHandle);
          }
        }
      }
    };

          simulationEventCallback.onConstraintBreak = (_constraint: unknown, _flags: unknown) => {
      // Constraint break events are not currently handled
      // This callback can be implemented when constraint physics are added
    };

    // Create scene
    const sceneDesc = new PHYSX.PxSceneDesc(this.tolerances!);
    sceneDesc.gravity = new PHYSX.PxVec3(0, -9.81, 0);
    const physxModule = getPhysX()!;
    sceneDesc.cpuDispatcher = createCpuDispatcher(physxModule, 0);
    const physxWithTopLevel = PHYSX as typeof PhysX & { DefaultFilterShader(): PhysX.PxSimulationFilterShader };
    sceneDesc.filterShader = physxWithTopLevel.DefaultFilterShader();
    (sceneDesc.flags as { raise: (flag: number, value: boolean) => void }).raise(PHYSX.PxSceneFlagEnum.eENABLE_CCD, true);
        (sceneDesc.flags as { raise: (flag: number, value: boolean) => void }).raise(PHYSX.PxSceneFlagEnum.eENABLE_ACTIVE_ACTORS, true);
    sceneDesc.solverType = PHYSX.PxSolverTypeEnum.eTGS;
    sceneDesc.simulationEventCallback = simulationEventCallback;
    sceneDesc.broadPhaseType = PHYSX.PxBroadPhaseTypeEnum.eGPU;
    this.scene = this.physics.createScene(sceneDesc);
  }

  private setupQueryObjects(): void {
    const PHYSX = getPhysX();
    if (!PHYSX) {
      throw new Error('[Physics] Cannot setup query objects - PHYSX not loaded');
    }
    
    this.raycastResult = new PHYSX.PxRaycastResult();
    this.sweepPose = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity) as PxTransform;
    this.sweepResult = new PHYSX.PxSweepResult();
    this.overlapPose = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity) as PxTransform;
    this.overlapResult = new PHYSX.PxOverlapResult();
    this.queryFilterData = new PHYSX.PxQueryFilterData();

    this._pv1 = new PHYSX.PxVec3() as PxVec3;
    this._pv2 = new PHYSX.PxVec3() as PxVec3;
    this.transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity) as PxTransform;
  }

  private setupControllerManager(): void {
    const PHYSX = getPhysX();
    if (!PHYSX) {
      throw new Error('[Physics] Cannot setup controller manager - PHYSX not loaded');
    }
    
    // Top-level functions are exposed directly on the PHYSX module in WebIDL bindings
    const physxWithFunctions = PHYSX as PhysXModule & {
      CreateControllerManager: (scene: PxScene, lockingEnabled?: boolean) => PxControllerManager;
    };
    
    this.controllerManager = physxWithFunctions.CreateControllerManager(this.scene!);
    this.controllerFilters = new PHYSX.PxControllerFilters();
    if (this.controllerFilters) {
      const filterData = new PHYSX.PxFilterData(Layers.player!.group, Layers.player!.mask, 0, 0);
      this.controllerFilters.mFilterData = filterData;
      
      const filterCallback = {
        simplePreFilter: (filterDataPtr: unknown, shapePtr: unknown, _actor: unknown) => {
          const physxModule = getPhysX()!;
          const filterData = (physxModule as PhysXModule).wrapPointer?.(filterDataPtr as number, PHYSX.PxFilterData);
          const shape = (physxModule as PhysXModule).wrapPointer?.(shapePtr as number, PHYSX.PxShape);
          if (!shape || !filterData) return PHYSX.PxQueryHitType.eNONE;
          const shapeFilterData = shape.getQueryFilterData();
          if (filterData.word0 & shapeFilterData.word1 && shapeFilterData.word0 & filterData.word1) {
            return PHYSX.PxQueryHitType.eBLOCK;
          }
          return PHYSX.PxQueryHitType.eNONE;
        }
      };
      
      const cctFilterCallback = new PHYSX.PxControllerFilterCallbackImpl();
            cctFilterCallback.filter = (_aPtr: unknown, _bPtr: unknown) => {
        return true; // For now ALL CCTs collide
      };
      
      this.controllerFilters.mFilterCallback = filterCallback;
      this.controllerFilters.mCCTFilterCallback = cctFilterCallback;
    }
  }

  override start(): void {
    const PHYSX = getPhysX();
    // Check if PhysX is loaded before attempting to use it
    if (!PHYSX || !this.physics || !this.scene) {
      console.log('[Physics] Skipping ground plane creation - PhysX not loaded');
      return;
    }

    // Create ground plane
    const size = 1000;
    const halfExtents = new PHYSX.PxVec3(size / 2, 1 / 2, size / 2);
    const geometry = new PHYSX.PxBoxGeometry(halfExtents.x, halfExtents.y, halfExtents.z);
    const material = this.physics.createMaterial(0.6, 0.6, 0);
    const _flags = new PHYSX.PxShapeFlags(PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE);
    const shape = this.physics.createShape(geometry, material, true);
    const layer = Layers.environment!;
    const filterData = new PHYSX.PxFilterData(layer.group, layer.mask, 0, 0);
    shape.setQueryFilterData(filterData);
    shape.setSimulationFilterData(filterData);
    const transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity);
    transform.p.y = -0.5;
    const body = this.physics.createRigidStatic(transform);
    body.attachShape(shape);
    this.scene.addActor(body);
  }

  addActor(actor: PxActor | PxRigidDynamic, handle: PhysicsHandle): ActorHandle | null {
    if (!this.scene) {
      console.warn('[Physics] Cannot add actor - Physics not initialized');
      return null;
    }
    
    handle.actor = actor;
    handle.contactedHandles = new Set();
    handle.triggeredHandles = new Set();
    
    // Type guard to ensure interpolation is only set up when onInterpolate exists
    if (handle.onInterpolate) {
      // TypeScript now knows this is an InterpolatedPhysicsHandle
      const interpolatedHandle = handle as InterpolatedPhysicsHandle;
      interpolatedHandle.interpolation = {
        prev: {
          position: new THREE.Vector3(),
          quaternion: new THREE.Quaternion(),
        },
        next: {
          position: new THREE.Vector3(),
          quaternion: new THREE.Quaternion(),
        },
        curr: {
          position: new THREE.Vector3(),
          quaternion: new THREE.Quaternion(),
        },
      };
      const pose = 'getGlobalPose' in actor ? (actor as PxRigidDynamic).getGlobalPose() : null;
      if (pose && pose.p && pose.q) {
        interpolatedHandle.interpolation.prev.position.copy(pose.p);
        interpolatedHandle.interpolation.prev.quaternion.copy(pose.q);
        interpolatedHandle.interpolation.next.position.copy(pose.p);
        interpolatedHandle.interpolation.next.quaternion.copy(pose.q);
        interpolatedHandle.interpolation.curr.position.copy(pose.p);
        interpolatedHandle.interpolation.curr.quaternion.copy(pose.q);
      } else {
        console.warn('[Physics] Actor pose not available during interpolation setup');
      }
    }
    
    const actorAddress = getActorAddress(actor);
    if (actorAddress !== undefined) {
      this.handles.set(actorAddress, handle);
    }
    if (!handle.controller) {
      this.scene.addActor(actor);
    }
    
    return {
      move: (matrix: THREE.Matrix4) => {
        if (this.ignoreSetGlobalPose) {
          // Check if it's a dynamic body (not kinematic)
          const dynamicActor = actor as PxRigidDynamic;
          if (dynamicActor.getRigidBodyFlags) {
            const PHYSX = getPhysX();
            if (PHYSX) {
              const isDynamic = !dynamicActor.getRigidBodyFlags().isSet((PHYSX as unknown as { PxRigidBodyFlagEnum: { eKINEMATIC: number } }).PxRigidBodyFlagEnum.eKINEMATIC);
              if (isDynamic) return;
            }
          }
          return;
        }
        // Assume toPxTransform extension is available
        matrix.toPxTransform!(this.transform);
        if ('setGlobalPose' in actor) {
          (actor as PxRigidDynamic).setGlobalPose(this.transform);
        }
      },
      snap: (pose: PxTransform) => {
        if (!pose || !pose.p || !pose.q) {
          console.warn('[Physics] Invalid pose provided to snap function');
          return;
        }
        if ('setGlobalPose' in actor) {
          (actor as PxRigidDynamic).setGlobalPose(pose);
        }
        // Type guard: if handle has onInterpolate, it must have interpolation
        if (handle.onInterpolate) {
          const interpolatedHandle = handle as InterpolatedPhysicsHandle;
          interpolatedHandle.interpolation.prev.position.copy(pose.p);
          interpolatedHandle.interpolation.prev.quaternion.copy(pose.q);
          interpolatedHandle.interpolation.next.position.copy(pose.p);
          interpolatedHandle.interpolation.next.quaternion.copy(pose.q);
          interpolatedHandle.interpolation.curr.position.copy(pose.p);
          interpolatedHandle.interpolation.curr.quaternion.copy(pose.q);
          interpolatedHandle.interpolation.skip = true;
        }
      },
      destroy: () => {
        // End any contacts
        if (handle.contactedHandles.size) {
          const getCallback = this.getContactCallback;
          if (!getCallback) return { move: () => {}, snap: () => {}, destroy: () => {} };
          const cb = getCallback().init(false);
          for (const otherHandle of handle.contactedHandles) {
            if (otherHandle.onContactEnd) {
              cb.fn0 = otherHandle.onContactEnd;
              cb.event0.tag = handle.tag ?? null;
              cb.event0.playerId = handle.playerId ?? null;
              cb.exec();
            }
            otherHandle.contactedHandles.delete(handle);
          }
        }
        // End any triggers
        if (handle.triggeredHandles.size) {
          const getCallback = this.getTriggerCallback;
          if (getCallback) {
            const cb = getCallback();
            for (const triggerHandle of handle.triggeredHandles) {
              if (triggerHandle.onTriggerLeave) {
                cb.fn = triggerHandle.onTriggerLeave ;
                cb.event.tag = handle.tag ?? null;
                cb.event.playerId = handle.playerId ?? null;
                cb.exec();
              }
            }
          }
        }
        // Remove from scene
        if (!handle.controller) {
          this.scene?.removeActor(actor);
        }
        // Delete data
        this.handles.delete((actor as unknown as { _address: number | bigint })._address);
      },
    };
  }

  override preFixedUpdate(willFixedUpdate: boolean): void {
    if (willFixedUpdate) {
      // If physics will step, clear active actors so we can repopulate
      this.active.clear();
    }
  }

  override postFixedUpdate(delta: number): void {
    if (!this.scene) return; // Skip if physics not initialized
    this.scene.simulate(delta);
    this.scene.fetchResults(true);
    if (this.processContactCallbacks) this.processContactCallbacks();
    if (this.processTriggerCallbacks) this.processTriggerCallbacks();
    
    const PHYSX = getPhysX();
    if (!this.scene || !PHYSX) return; // Skip if physics not initialized
    
    const supportFunctions = (PHYSX as unknown as PhysXModule).SupportFunctions;
    if (!supportFunctions?.prototype?.PxScene_getActiveActors) return;
    
    const activeActors = supportFunctions.prototype.PxScene_getActiveActors(this.scene) as unknown as {
      size(): number;
      get(index: number): { _address: number | bigint };
    };
    const size = activeActors.size();
    for (let i = 0; i < size; i++) {
      const actorPtr = activeActors.get(i)._address;
      const handle = this.handles.get(actorPtr);
      if (!handle || !handle.onInterpolate) {
        continue;
      }
      // TypeScript knows this is an InterpolatedPhysicsHandle
      const interpolatedHandle = handle as InterpolatedPhysicsHandle;
      const lerp = interpolatedHandle.interpolation;
      
      // No need for runtime checks - TypeScript guarantees these exist
      lerp.prev.position.copy(lerp.next.position);
      lerp.prev.quaternion.copy(lerp.next.quaternion);
      const pose = interpolatedHandle.actor && 'getGlobalPose' in interpolatedHandle.actor 
        ? (interpolatedHandle.actor as PxRigidDynamic).getGlobalPose() 
        : null;
      if (pose && pose.p && pose.q) {
        lerp.next.position.copy(pose.p);
        lerp.next.quaternion.copy(pose.q);
        this.active.add(interpolatedHandle);
      } else {
        console.warn('[Physics] Actor pose not available in postFixedUpdate');
      }
    }
  }

  override preUpdate(alpha: number): void {
    for (const handle of this.active) {
      // Type guard: only handles with onInterpolate have interpolation
      if (!handle.onInterpolate) continue;
      
      // TypeScript now knows this is an InterpolatedPhysicsHandle
      const interpolatedHandle = handle as InterpolatedPhysicsHandle;
      const lerp = interpolatedHandle.interpolation;
      
      if (lerp.skip) {
        lerp.skip = false;
        continue;
      }
      
      // No need for runtime checks - TypeScript guarantees these exist
      lerp.curr.position.lerpVectors(lerp.prev.position, lerp.next.position, alpha);
      lerp.curr.quaternion.slerpQuaternions(lerp.prev.quaternion, lerp.next.quaternion, alpha);
      interpolatedHandle.onInterpolate(lerp.curr.position, lerp.curr.quaternion);
    }
    // Finalize any physics updates immediately
    // but don't listen to any loopback commits from those actor moves
    this.ignoreSetGlobalPose = true;
    // Assume stage exists and has clean method
    this.world.stage.clean();
    this.ignoreSetGlobalPose = false;
  }

  // Internal raycast method with layer mask support
  private _raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number = Infinity, layerMask: number = 0xFFFFFFFF): PhysicsRaycastHit | null {
    // Early return if PhysX is not available
    if (!this.initialized || !this.scene) {
      return null;
    }
    
    if (this.queryFilterData) {
      // Strong type assumption - queryFilterData has data property with layer mask fields
      const filterData = this.queryFilterData as { data: { word0: number; word1: number } };
      if (filterData.data) {
        filterData.data.word0 = layerMask;
        filterData.data.word1 = 0;
      }
    }
    
    // Try to use enhanced Vector3 methods first
    let pxOrigin: PxVec3 | undefined = origin.toPxVec3?.(this._pv1 || undefined) as unknown as PxVec3 | undefined;
    let pxDirection: PxVec3 | undefined = direction.toPxVec3?.(this._pv2 || undefined) as unknown as PxVec3 | undefined;
    
    // If the enhanced method didn't work, create PxVec3 manually
    if (!pxOrigin) {
      const PHYSX = getPhysX();
      if (PHYSX) {
        // Strong type assumption - cast through unknown for complex PhysX types
        const vec = new (PHYSX as unknown as { PxVec3: new (x: number, y: number, z: number) => PxVec3 }).PxVec3(origin.x, origin.y, origin.z);
        pxOrigin = vec;
      }
    }
    if (!pxDirection) {
      const PHYSX = getPhysX();
      if (PHYSX) {
        // Strong type assumption - cast through unknown for complex PhysX types
        const vec = new (PHYSX as unknown as { PxVec3: new (x: number, y: number, z: number) => PxVec3 }).PxVec3(direction.x, direction.y, direction.z);
        pxDirection = vec;
      }
    }
    
    if (!pxOrigin || !pxDirection) {
      return null;
    }

    const PHYSX = getPhysX();
    if (!PHYSX) return null;
    
    const didHit = this.scene?.raycast(
      pxOrigin,
      pxDirection,
      maxDistance,
      this.raycastResult!,
      PHYSX.PxHitFlagEnum.eNORMAL as unknown as PxHitFlags,
      this.queryFilterData || undefined
    ) || false;
    
    // Clean up only if we created them manually
    // Note: In Node.js environment, the delete method might not be available
    // The garbage collector should handle cleanup of these objects
    if (pxOrigin && !origin.toPxVec3) {
      try {
        // Try to delete if method exists
        const deletableOrigin = pxOrigin as PxVec3 & { delete?: () => void };
        if (deletableOrigin.delete) {
          deletableOrigin.delete();
        }
      } catch (_e) {
        // Ignore - let garbage collector handle it
      }
    }
    if (pxDirection && !direction.toPxVec3) {
      try {
        // Try to delete if method exists
        const deletableDirection = pxDirection as PxVec3 & { delete?: () => void };
        if (deletableDirection.delete) {
          deletableDirection.delete();
        }
      } catch (_e) {
        // Ignore - let garbage collector handle it
      }
    }
    
    if (didHit && this.raycastResult) {
      const numHits = (this.raycastResult as PxRaycastResult & { getNbAnyHits: () => number }).getNbAnyHits();
      let hit: { actor: PxActor; position: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; distance: number } | null = null;
      for (let n = 0; n < numHits; n++) {
        const nHit = (this.raycastResult as PxRaycastResult & { getAnyHit: (index: number) => PhysX.PxRaycastHit }).getAnyHit(n);
        const convertedHit = convertHitResult(nHit) as { actor: PxActor; position: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; distance: number };
        if (!hit || hit.distance > convertedHit.distance) {
          hit = convertedHit;
        }
      }
      if (hit) {
        const actorAddress = getActorAddress(hit.actor);
        _raycastHit.handle = actorAddress !== undefined ? this.handles.get(actorAddress) : undefined;
        _raycastHit.point.set(hit.position.x, hit.position.y, hit.position.z);
        _raycastHit.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        _raycastHit.distance = hit.distance;
      }
      return _raycastHit;
    }
    return null;
  }

  // Interface-compliant raycast method
  raycast(origin: Vector3, direction: Vector3, maxDistance?: number, _layerMask?: number): IRaycastHit | null {
    const hit = this._raycast(origin, direction, maxDistance || Infinity);
    if (!hit) return null;
    
    // Convert internal RaycastHit to interface-compliant RaycastHit
    return {
      point: hit.point,
      normal: hit.normal,
      distance: hit.distance || 0,
      collider: {} as Collider, // Placeholder as we don't have proper Collider objects
      handle: hit.handle,
    };
  }

  // raycast with layer mask (not in interface)
  raycastWithMask(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number, layerMask: number): PhysicsRaycastHit | null {
    return this._raycast(origin, direction, maxDistance, layerMask);
  }

  sweep(geometry: unknown, origin: Vector3, direction: Vector3, maxDistance?: number, layerMask?: number): IRaycastHit | null {
    const PHYSX = getPhysX();
    if (!PHYSX) return null; // Early return if PhysX is not available
    
    const maxDist = maxDistance !== undefined ? maxDistance : 1000; // Use finite default instead of Infinity
    const mask = layerMask !== undefined ? layerMask : 0xFFFFFFFF;
    
    // Set sweep position
    if (this.sweepPose.p) {
      const pxOrigin = vector3ToPxVec3(origin as THREE.Vector3, this.sweepPose.p as PxVec3);
      if (!pxOrigin) return null; // Return null if conversion failed
    }
    const sweepDirection = vector3ToPxVec3(direction as THREE.Vector3, this._pv2 || undefined);
    if (!sweepDirection) return null; // Return null if conversion failed
    
    if (this.queryFilterData) {
      this.queryFilterData.data.word0 = mask;
    }
    
    const didHit = this.scene?.sweep(
      geometry as PxGeometry,
      this.sweepPose,
      sweepDirection,
      maxDist,
      this.sweepResult as PxSweepResult,
      PHYSX.PxHitFlagEnum.eDEFAULT as unknown as PxHitFlags,
      this.queryFilterData || undefined
    ) || false;
    
    if (didHit && this.sweepResult) {
      const numHits = (this.sweepResult as PxSweepResult & { getNbAnyHits: () => number }).getNbAnyHits();
      let hit: { actor: PxActor; position: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; distance: number } | null = null;
      for (let n = 0; n < numHits; n++) {
        const nHit = (this.sweepResult as PxSweepResult & { getAnyHit: (index: number) => PhysX.PxSweepHit }).getAnyHit(n);
        const convertedHit = convertHitResult(nHit) as { actor: PxActor; position: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; distance: number };
        if (!hit || hit.distance > convertedHit.distance) {
          hit = convertedHit;
        }
      }
      if (hit) {
        _sweepHit.actor = hit.actor;
        _sweepHit.point.set(hit.position.x, hit.position.y, hit.position.z);
        _sweepHit.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        _sweepHit.distance = hit.distance;
        _sweepHit.collider = {} as Collider; // Placeholder collider
        
        // Convert to RaycastHit format
        return {
          point: _sweepHit.point,
          normal: _sweepHit.normal,
          distance: _sweepHit.distance || 0,
          collider: _sweepHit.collider,
          handle: _sweepHit.actor,
        };
      }
    }
    return null;
  }

  // Internal overlap sphere method with layer mask support
  private _overlapSphere(radius: number, origin: THREE.Vector3, layerMask: number = 0xFFFFFFFF): OverlapHit[] {
    // Use the enhanced Vector3 method if available, otherwise set position manually
    if (origin.toPxVec3 && this.overlapPose.p) {
      // Cast to any to avoid delete method type conflict
      const pxVec = this.overlapPose.p as unknown as { x: number; y: number; z: number };
      origin.toPxVec3(pxVec as PxVec3);
    } else if (this.overlapPose.p) {
      this.overlapPose.p.x = origin.x;
      this.overlapPose.p.y = origin.y;
      this.overlapPose.p.z = origin.z;
    }
    
    const geometry = getSphereGeometry(radius);
    if (this.queryFilterData) {
      if (this.queryFilterData && 'data' in this.queryFilterData) {
        (this.queryFilterData as unknown as { data: { word0: number; word1: number } }).data.word0 = layerMask;
        (this.queryFilterData as unknown as { data: { word0: number; word1: number } }).data.word1 = 0;
      }
    }
    
    const didHit = this.scene?.overlap(geometry, this.overlapPose, this.overlapResult!, this.queryFilterData || undefined) || false;
    if (!didHit || !this.overlapResult) return [];
    
    overlapHits.length = 0;
    const numHits = (this.overlapResult as unknown as { getNbAnyHits: () => number }).getNbAnyHits();
    for (let n = 0; n < numHits; n++) {
      const nHit = (this.overlapResult as PxOverlapResult & { getAnyHit: (index: number) => { actor: PxActor } }).getAnyHit(n);
      const hit = getOrCreateOverlapHit(n);
      hit.actor = nHit.actor;
      hit.handle = this.handles.get((nHit.actor as unknown as PxActorWithAddress)._address) || null;
      overlapHits.push(hit);
    }
    return overlapHits;
  }

  // Interface-compliant overlapSphere method
  overlapSphere(_position: Vector3, _radius: number): Collider[] {
    // Note: This returns empty array as we don't have Collider objects in this implementation
    // The actual physics implementation uses OverlapHit objects instead
    return [];
  }

  // overlap sphere with layer mask (not in interface)
  overlapSphereWithMask(radius: number, origin: THREE.Vector3, layerMask: number): OverlapHit[] {
    return this._overlapSphere(radius, origin, layerMask);
  }

  getMaterial(staticFriction: number, dynamicFriction: number, restitution: number): PxMaterial | null {
    if (!this.physics) {
      console.warn('[Physics] Cannot create material - Physics not initialized');
      return null;
    }
    
    // Cache and re-use materials as PhysX has a limit of 64k
    const id = `${staticFriction}${dynamicFriction}${restitution}`;
    let material = this.materials[id];
    if (!material) {
      material = this.physics.createMaterial(staticFriction, dynamicFriction, restitution);
      this.materials[id] = material;
    }
    return material;
  }

  // IPhysics interface methods
  createRigidBody(_type: 'static' | 'dynamic' | 'kinematic', _position?: Vector3, _rotation?: Quaternion): RigidBody {
    throw new Error('Not implemented - use addActor instead');
  }

  createCollider(_geometry: PxGeometry, _material?: PhysicsMaterial, _isTrigger?: boolean): PxShape | null {
    throw new Error('Not implemented - use PhysX geometry directly');
  }

  createMaterial(staticFriction?: number, dynamicFriction?: number, restitution?: number): PhysicsMaterial {
    const _material = this.getMaterial(staticFriction || 0.5, dynamicFriction || 0.5, restitution || 0.5);
    // Convert PhysXMaterial to PhysicsMaterial interface
    return {
      friction: staticFriction || 0.5,
      restitution: restitution || 0.5
    };
  }

  sphereCast(origin: Vector3, radius: number, direction: Vector3, maxDistance?: number, layerMask?: number): import('../../types/index.js').RaycastHit | null {
    const geometry = getSphereGeometry(radius);
    const hit = this.sweep(geometry, origin, direction, maxDistance || 1000, layerMask || 0xFFFFFFFF);
    if (!hit) return null;
    
    // Convert SweepHit to RaycastHit interface
    return {
      point: hit.point,
      normal: hit.normal,
      distance: hit.distance || 0,
      collider: null as unknown as import('../../types/index.js').Collider, // Will be populated when proper Collider objects are available
      entity: undefined, // Optional entity
    };
  }

  simulate(_deltaTime: number): void {
    // Handled in postFixedUpdate
  }

  // Add missing methods referenced in World.ts
  createLayerMask(...layers: string[]): number {
    // Create a layer mask based on the provided layer names
    let mask = 0;
    for (const layerName of layers) {
      const layer = Layers[layerName];
      if (layer) {
        mask |= layer.group;
      } else {
        console.warn(`[Physics] Unknown layer: ${layerName}`);
      }
    }
    return mask;
  }

  // Add removeCollider method referenced in ColliderComponent.ts
  removeCollider(_collider: PxShape): void {
    // Note: In PhysX, shapes don't have direct references to actors
    // The ColliderComponent should manage the actor removal
    console.warn('[Physics] removeCollider called but shapes do not have actor references - use removeActor instead');
  }

  // Add missing methods from IPhysics interface
  removeActor(actor: PxActor | PxRigidDynamic): void {
    if (actor) {
      const actorAddress = getActorAddress(actor);
      if (actorAddress === undefined) return;
      
      const handle = this.handles.get(actorAddress);
      if (handle) {
        this.scene?.removeActor(actor);
        this.handles.delete(actorAddress);
      }
    }
  }

  setLinearVelocity(actor: PxRigidDynamic, velocity: Vector3): void {
    if (actor && actor.setLinearVelocity) {
      const pxVelocity = vector3ToPxVec3(velocity as THREE.Vector3);
      if (pxVelocity) {
        actor.setLinearVelocity(pxVelocity);
        cleanupPxVec3(pxVelocity);
      }
    }
  }
  
  // Missing lifecycle methods
  preTick(): void {}
  fixedUpdate(_dt: number): void {}
  postUpdate(): void {}
  lateUpdate(): void {}
  postLateUpdate(): void {}
  commit(): void {}
  postTick(): void {}
}

// Helper functions
function createPool<T>(factory: () => T & { release: () => void }): () => T {
  const pool: T[] = [];
  return () => {
    if (pool.length) {
      return pool.pop()!;
    }
    const item = factory();
    item.release = () => pool.push(item);
    return item;
  };
}

const spheres = new Map<number, PxSphereGeometry>();
function getSphereGeometry(radius: number): PxSphereGeometry {
  let sphere = spheres.get(radius);
  if (!sphere) {
    const PHYSX = getPhysX()!; // Assert PhysX is available
    sphere = new PHYSX.PxSphereGeometry(radius);
    spheres.set(radius, sphere);
  }
  return sphere;
}

function getOrCreateOverlapHit(idx: number): OverlapHit {
  let hit = overlapHitPool[idx];
  if (!hit) {
    hit = {
      actor: {} as PhysX.PxActor,
      handle: null,
      proxy: {
        get tag() {
          return hit.handle?.tag || null;
        },
        get playerId() {
          return hit.handle?.playerId || null;
        },
      },
    };
    overlapHitPool.push(hit);
  }
  return hit;
}
