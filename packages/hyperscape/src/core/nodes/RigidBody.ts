
import type { PhysXActor, PhysXActorHandle, RigidBodyData } from '../../types/nodes';
import type {
  PxShape,
  PxTransform,
  PxVec3,
  PxQuat,
  PxRigidBody
} from '../../types/physx';
import * as THREE from '../extras/three';
import { Node } from './Node';
import { vector3ToPxVec3 } from '../extras/vector3-utils';

// Global PHYSX declaration with required methods
declare const PHYSX: {
  PxTransform: new (identity: unknown) => PxTransform;
  PxVec3: new (x: number, y: number, z: number) => PxVec3;
  PxQuat: new (x: number, y: number, z: number, w: number) => PxQuat;
  PxIDENTITYEnum: { PxIdentity: unknown };
  PxRigidBodyExt?: {
    setMassAndUpdateInertia: (actor: unknown, mass: number) => void;
    addForceAtPos: (actor: unknown, force: PxVec3, pos: PxVec3, mode: number, wakeup: boolean) => void;
    addForceAtLocalPos: (actor: unknown, force: PxVec3, pos: PxVec3, mode: number, wakeup: boolean) => void;
    getVelocityAtPos: (actor: PxRigidBody, pos: PxVec3) => PxVec3;
    getLocalVelocityAtLocalPos: (actor: PxRigidBody, pos: PxVec3) => PxVec3;
  };
};

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()
const _m1 = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _m3 = new THREE.Matrix4()
const _defaultScale = new THREE.Vector3(1, 1, 1)

const types = ['static', 'kinematic', 'dynamic']

const defaults = {
  type: 'static',
  mass: 1,
  linearDamping: 0, // physx default
  angularDamping: 0.05, // phyx default  
  tag: null,
  onContactStart: null,
  onContactEnd: null,
  onTriggerEnter: null,
  onTriggerLeave: null,
}

let forceModes
function getForceMode(mode) {
  if (!PHYSX) {
    console.warn('[rigidbody] PHYSX not initialized, cannot get force mode');
    return null;
  }
  if (!forceModes) {
    forceModes = {
      force: 0, // PxForceMode.eFORCE
      impulse: 1, // PxForceMode.eIMPULSE
      acceleration: 3, // PxForceMode.eACCELERATION
      velocityChange: 2, // PxForceMode.eVELOCITY_CHANGE
    }
  }
  return forceModes[mode] || forceModes.force
}

export class RigidBody extends Node {
  shapes: Set<unknown>
  _tm: PxTransform | null = null
  tempVec3: THREE.Vector3
  tempQuat: THREE.Quaternion
  needsRebuild: boolean = false
  transform: PxTransform | null = null
  _type: string = defaults.type
  actor: PhysXActor | null = null
  _centerOfMass: THREE.Vector3 | null = null
  actorHandle: PhysXActorHandle | null = null
  _tag: string | null = null
  _onContactStart: Function | null = null
  _onContactEnd: Function | null = null
  _onTriggerEnter: Function | null = null
  _onTriggerLeave: Function | null = null
  _pv1!: THREE.Vector3
  _pv2!: THREE.Vector3
  _mass: number = defaults.mass
  _linearDamping: number = defaults.linearDamping
  _angularDamping: number = defaults.angularDamping
  
  constructor(data: RigidBodyData = {}) {
    super(data)
    this.name = 'rigidbody'

    this.shapes = new Set()

    this.type = data.type ?? defaults.type
    this.mass = data.mass ?? defaults.mass
    this.linearDamping = data.linearDamping ?? defaults.linearDamping
    this.angularDamping = data.angularDamping ?? defaults.angularDamping
    this.tag = data.tag ?? null
    this.onContactStart = data.onContactStart ?? null
    this.onContactEnd = data.onContactEnd ?? null
    this.onTriggerEnter = data.onTriggerEnter ?? null
    this.onTriggerLeave = data.onTriggerLeave ?? null

    // Initialize PhysX objects only when PhysX is available
    this._tm = null // Will be initialized in mount()

    this.tempVec3 = new THREE.Vector3()
    this.tempQuat = new THREE.Quaternion()
  }

  mount() {
    this.needsRebuild = false
    if (this.ctx!.moving) return // physics ignored when moving apps around
    if (typeof PHYSX === 'undefined' || !PHYSX) {
      console.warn('[rigidbody] PHYSX not initialized yet, skipping physics setup');
      return;
    }
    
    // Initialize PhysX objects now that PHYSX is available
    if (!this._tm) {
      this._tm = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity) as PxTransform
    }
    
    // Force decompose using temporary plain vectors
    const plainPos = new THREE.Vector3();
    const plainQuat = new THREE.Quaternion();
    const plainScale = new THREE.Vector3();
    const plainMatrix = new THREE.Matrix4().copy(this.matrixWorld);
    plainMatrix.decompose(plainPos, plainQuat, plainScale);
    _v1.copy(plainPos);
    _q1.copy(plainQuat);
    _v2.copy(plainScale);
    
    // Create transform and set position/rotation
    this.transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity) as PxTransform;
    // Set position
    if (this.transform.p) {
      this.transform.p.x = _v1.x;
      this.transform.p.y = _v1.y;
      this.transform.p.z = _v1.z;
    }
    // Set rotation
    if (this.transform.q) {
      this.transform.q.x = _q1.x;
      this.transform.q.y = _q1.y;
      this.transform.q.z = _q1.z;
      this.transform.q.w = _q1.w;
    }
    
    if (this._type === 'static') {
      this.actor = this.ctx!.physics.physics.createRigidStatic(this.transform) as PhysXActor;
    } else if (this._type === 'kinematic') {
      const dynamicActor = this.ctx!.physics.physics.createRigidDynamic(this.transform);
      this.actor = dynamicActor as unknown as PhysXActor;
      if (this.actor.setRigidBodyFlag) {
        this.actor.setRigidBodyFlag(1, true) // PxRigidBodyFlag.eKINEMATIC
      }
      if (PHYSX?.PxRigidBodyExt?.setMassAndUpdateInertia) {
        PHYSX.PxRigidBodyExt.setMassAndUpdateInertia(dynamicActor, this._mass)
      }
    } else if (this._type === 'dynamic') {
      const dynamicActor = this.ctx!.physics.physics.createRigidDynamic(this.transform);
      this.actor = dynamicActor as unknown as PhysXActor;
      if (PHYSX?.PxRigidBodyExt?.setMassAndUpdateInertia) {
        PHYSX.PxRigidBodyExt.setMassAndUpdateInertia(dynamicActor, this._mass)
      }
      if (this._centerOfMass) {
        const pose = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity) as PxTransform
        // Set center of mass position
        if (pose.p) {
          pose.p.x = this._centerOfMass.x;
          pose.p.y = this._centerOfMass.y;
          pose.p.z = this._centerOfMass.z;
        }
        if (this.actor.setCMassLocalPose) {
          this.actor.setCMassLocalPose(pose)
        }
      }
      if (this.actor.setLinearDamping) {
        this.actor.setLinearDamping(this._linearDamping)
      }
      if (this.actor.setAngularDamping) {
        this.actor.setAngularDamping(this._angularDamping)
      }
    }
    
    // Convert Set to Array for compatibility with older TypeScript targets
    const shapesArray = Array.from(this.shapes);
    for (const shape of shapesArray) {
      if (this.actor && this.actor.attachShape) {
        this.actor.attachShape(shape as PxShape)
      }
    }
    
    const entity = this.ctx!.entity;
    const playerId = entity?.isPlayer && entity.data && typeof entity.data === 'object' && entity.data !== null && 'id' in entity.data ? entity.data.id as string : null
    const physicsSystem = this.ctx!.physics as unknown as { addActor: (actor: unknown, options: unknown) => PhysXActorHandle };
    const handleOptions = {
      onInterpolate: this._type === 'kinematic' || this._type === 'dynamic' ? this.onInterpolate : null,
      node: this,
      tag: this._tag,
      playerId: playerId,
      onContactStart: this._onContactStart,
      onContactEnd: this._onContactEnd,
      onTriggerEnter: this._onTriggerEnter,
      onTriggerLeave: this._onTriggerLeave,
    };
    this.actorHandle = physicsSystem.addActor(this.actor, handleOptions) as PhysXActorHandle;
  }

  commit(didMove: boolean) {
    if (this.needsRebuild) {
      this.unmount()
      this.mount()
      return
    }
    if (didMove && this.actorHandle) {
      const handle = this.actorHandle as PhysXActorHandle;
      if ('move' in handle && typeof handle.move === 'function') {
        handle.move(this.matrixWorld)
      }
    }
  }

  onInterpolate = (position, quaternion) => {
    if (this.parent) {
      const composePos = new THREE.Vector3().copy(position);
      const composeQuat = new THREE.Quaternion().copy(quaternion);
      const composeScale = new THREE.Vector3().copy(_defaultScale);
      (_m1 as unknown as { compose: (pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3) => void }).compose(composePos, composeQuat, composeScale);
      _m2.copy(this.parent.matrixWorld).invert()
      _m3.multiplyMatrices(_m2, _m1)
      const decomposePos = new THREE.Vector3();
      const decomposeQuat = new THREE.Quaternion();
      const decomposeScale = new THREE.Vector3();
      (_m3 as unknown as { decompose: (pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3) => void }).decompose(decomposePos, decomposeQuat, decomposeScale);
      this.position.copy(decomposePos);
      this.quaternion.copy(decomposeQuat);
      _v1.copy(decomposeScale);
      // this.matrix.copy(_m3)
      // this.matrixWorld.copy(_m1)
    } else {
      this.position.copy(position)
      this.quaternion.copy(quaternion)
      // this.matrix.compose(this.position, this.quaternion, this.scale)
      // this.matrixWorld.copy(this.matrix)
    }
  }

  unmount() {
    if (this.actor) {
      // this.untrack()
      // this.untrack = null
      if (this.actorHandle && 'destroy' in this.actorHandle && typeof this.actorHandle.destroy === 'function') {
        this.actorHandle.destroy()
      }
      this.actorHandle = null
      this.actor.release()
      this.actor = null
    }
  }

  addShape(shape: unknown) {
    if (!shape) return
    this.shapes.add(shape)
    if (this.actor) {
      this.actor.attachShape!(shape as PxShape)
    }
  }

  removeShape(shape: unknown) {
    if (!shape) return
    this.shapes.delete(shape)
    if (this.actor) {
      this.actor.detachShape!(shape as PxShape)
    }
  }

  copy(source: RigidBody, recursive: boolean) {
    super.copy(source, recursive)
    this._type = source._type
    this._mass = source._mass
    this._tag = source._tag
    this._onContactStart = source._onContactStart
    this._onContactEnd = source._onContactEnd
    this._onTriggerEnter = source._onTriggerEnter
    this._onTriggerLeave = source._onTriggerLeave
    return this
  }

  get type() {
    return this._type
  }

  set type(value: string) {
    if (this._type === value) return
    this._type = value
    this.needsRebuild = true
    this.setDirty()
  }

  get mass() {
    return this._mass
  }

  set mass(value: number) {
    this._mass = value
    this.needsRebuild = true
    this.setDirty()
  }

  get linearDamping() {
    return this._linearDamping
  }

  set linearDamping(value: number) {
    this._linearDamping = value
    this.needsRebuild = true
    this.setDirty()
  }

  get angularDamping() {
    return this._angularDamping
  }

  set angularDamping(value: number) {
    this._angularDamping = value
    this.needsRebuild = true
    this.setDirty()
  }

  get tag() {
    return this._tag
  }

  set tag(value: string | null) {
    this._tag = value
  }

  get onContactStart() {
    return this._onContactStart
  }

  set onContactStart(value: Function | null) {
    this._onContactStart = value
  }

  get onContactEnd() {
    return this._onContactEnd
  }

  set onContactEnd(value: Function | null) {
    this._onContactEnd = value
  }

  get onTriggerEnter() {
    return this._onTriggerEnter
  }

  set onTriggerEnter(value: Function | null) {
    this._onTriggerEnter = value
  }

  get onTriggerLeave() {
    return this._onTriggerLeave
  }

  set onTriggerLeave(value: Function | null) {
    this._onTriggerLeave = value
  }

  get sleeping() {
    if (!this.actor) return false
    return this.actor.isSleeping ? this.actor.isSleeping() : false
  }

  addForce(force: THREE.Vector3, mode: string | number) {
    if (!this.actor?.addForce || !PHYSX) return
    const pxForce = new PHYSX.PxVec3(force.x, force.y, force.z)
    const forceMode = getForceMode(mode) || 0
    if ('addForce' in this.actor && typeof this.actor.addForce === 'function') {
      this.actor.addForce(pxForce, forceMode)
    }
  }

  addForceAtPos(force: THREE.Vector3, pos: THREE.Vector3, mode: string | number) {
    if (!this.actor || !PHYSX) return
    const pxForce = new PHYSX.PxVec3(force.x, force.y, force.z)
    const pxPos = new PHYSX.PxVec3(pos.x, pos.y, pos.z)
    const forceMode = getForceMode(mode) || 0
    if (PHYSX?.PxRigidBodyExt?.addForceAtPos) {
      PHYSX.PxRigidBodyExt.addForceAtPos(
        this.actor as unknown as PxRigidBody,
        pxForce,
        pxPos,
        forceMode,
        true
      )
    }
  }

  addForceAtLocalPos(force: THREE.Vector3, pos: THREE.Vector3, mode: string | number) {
    if (!this.actor || !PHYSX) return
    const pxForce = new PHYSX.PxVec3(force.x, force.y, force.z)
    const pxPos = new PHYSX.PxVec3(pos.x, pos.y, pos.z)
    const forceMode = getForceMode(mode) || 0
    if (PHYSX?.PxRigidBodyExt?.addForceAtLocalPos) {
      PHYSX.PxRigidBodyExt.addForceAtLocalPos(
        this.actor as unknown as PxRigidBody,
        pxForce,
        pxPos,
        forceMode,
        true
      )
    }
  }

  addTorque(torque: THREE.Vector3, mode: string | number) {
    if (!this.actor?.addTorque || !PHYSX) return
    const pxTorque = new PHYSX.PxVec3(torque.x, torque.y, torque.z)
    const forceMode = getForceMode(mode) || 0
    if ('addTorque' in this.actor && typeof this.actor.addTorque === 'function') {
      this.actor.addTorque(pxTorque, forceMode)
    }
  }

  getPosition(vec3?: THREE.Vector3) {
    if (!vec3) vec3 = this.tempVec3
    if (!this.actor) return vec3.set(0, 0, 0)
    const pose = this.actor.getGlobalPose()
    vec3.copy(pose.p) // Strong type assumption
    return vec3
  }

  setPosition(vec3: THREE.Vector3) {
    if (!this.actor) return
    const pose = this.actor.getGlobalPose()
    if (vec3.toPxTransform) {
      vec3.toPxTransform(pose);
    } else {
      // Manually set position if toPxTransform is not available
      if (pose.p) {
        pose.p.x = vec3.x;
        pose.p.y = vec3.y;
        pose.p.z = vec3.z;
      }
    }
    this.actor.setGlobalPose!(pose)
    this.position.copy(vec3)
  }

  getQuaternion(quat?: THREE.Quaternion) {
    if (!quat) quat = this.tempQuat
    if (!this.actor) return quat.set(0, 0, 0, 1) // Fix quaternion set call
    const pose = this.actor.getGlobalPose()
    quat.copy(pose.q) // Strong type assumption
    return quat
  }

  setQuaternion(quat: THREE.Quaternion) {
    if (!this.actor) return
    const pose = this.actor.getGlobalPose()
    // Manually set quaternion using direct property access
    const poseAny = pose as { q?: { x: number; y: number; z: number; w: number } };
    if (poseAny.q) {
      poseAny.q.x = quat.x;
      poseAny.q.y = quat.y;
      poseAny.q.z = quat.z;
      poseAny.q.w = quat.w;
    }
    this.actor.setGlobalPose(pose)
    this.quaternion.copy(quat)
  }

  getLinearVelocity(vec3?: THREE.Vector3) {
    if (!vec3) vec3 = this.tempVec3
    if (!this.actor) return vec3.set(0, 0, 0)
    const pxVelocity = this.actor.getLinearVelocity ? this.actor.getLinearVelocity() : undefined;
    if (pxVelocity && typeof pxVelocity === 'object') {
      const vel = pxVelocity as { x: number; y: number; z: number };
      vec3.set(vel.x || 0, vel.y || 0, vel.z || 0);
    } else {
      vec3.set(0, 0, 0);
    }
    return vec3;
  }

  setLinearVelocity(vec3: THREE.Vector3) {
    if (this.actor?.setLinearVelocity && PHYSX) {
      const pxVec = vector3ToPxVec3(vec3);
      if (pxVec) {
        this.actor.setLinearVelocity(vec3);
      }
    }
  }

  getAngularVelocity(vec3?: THREE.Vector3) {
    if (!vec3) vec3 = this.tempVec3
    if (!this.actor) return vec3.set(0, 0, 0)
    const pxVelocity = this.actor.getAngularVelocity ? this.actor.getAngularVelocity() : undefined;
    if (pxVelocity && typeof pxVelocity === 'object') {
      const vel = pxVelocity as { x: number; y: number; z: number };
      vec3.set(vel.x || 0, vel.y || 0, vel.z || 0);
    } else {
      vec3.set(0, 0, 0);
    }
    return vec3;
  }

  setAngularVelocity(vec3: THREE.Vector3) {
    if (this.actor?.setAngularVelocity && PHYSX) {
      const pxVec = vector3ToPxVec3(vec3);
      if (pxVec) {
        this.actor.setAngularVelocity(vec3);
      }
    }
  }

  getVelocityAtPos(pos: THREE.Vector3, vec3: THREE.Vector3) {
    if (!this.actor || !PHYSX) return vec3.set(0, 0, 0)
    const pxPos = new PHYSX.PxVec3(pos.x, pos.y, pos.z);
    const result = PHYSX?.PxRigidBodyExt?.getVelocityAtPos(this.actor as unknown as PxRigidBody, pxPos);
    if (result && typeof result === 'object') {
      const vel = result as { x: number; y: number; z: number };
      vec3.set(vel.x || 0, vel.y || 0, vel.z || 0);
    }
    return vec3;
  }

  getLocalVelocityAtLocalPos(pos: THREE.Vector3, vec3: THREE.Vector3) {
    if (!this.actor || !PHYSX) return vec3.set(0, 0, 0)
    const pxPos = new PHYSX.PxVec3(pos.x, pos.y, pos.z);
    const result = PHYSX?.PxRigidBodyExt?.getLocalVelocityAtLocalPos(this.actor as unknown as PxRigidBody, pxPos);
    if (result && typeof result === 'object') {
      const vel = result as { x: number; y: number; z: number };
      vec3.set(vel.x || 0, vel.y || 0, vel.z || 0);
    }
    return vec3;
  }

  setCenterOfMass(pos: THREE.Vector3) {
    this._centerOfMass = pos.clone()
    this.needsRebuild = true
    this.setDirty()
  }

  setKinematicTarget(position: THREE.Vector3, quaternion: THREE.Quaternion) {
    if (this._type !== 'kinematic' || !PHYSX) {
      return // Early return for non-kinematic bodies
    }
    if(!this._tm) {
      this._tm = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity) as PxTransform
    }
    if ((position as unknown as { toPxTransform?: (tm: PxTransform) => void }).toPxTransform) {
      (position as unknown as { toPxTransform: (tm: PxTransform) => void }).toPxTransform(this._tm)
    }
    if ((quaternion as unknown as { toPxTransform?: (tm: PxTransform) => void }).toPxTransform) {
      (quaternion as unknown as { toPxTransform: (tm: PxTransform) => void }).toPxTransform(this._tm)
    }
    if (this.actor && this.actor.setKinematicTarget) {
      this.actor.setKinematicTarget(this._tm!)
    }
  }

  getProxy(): Record<string, unknown> {
    if (!this.proxy) {
      const self = this
      let proxy = {
        get type() {
          return self.type
        },
        set type(value) {
          self.type = value
        },
        get mass() {
          return self.mass
        },
        set mass(value) {
          self.mass = value
        },
        set linearDamping(value) {
          self.linearDamping = value
        },
        set angularDamping(value) {
          self.angularDamping = value
        },
        get tag() {
          return self.tag
        },
        set tag(value) {
          self.tag = value
        },
        get onContactStart() {
          return self.onContactStart
        },
        set onContactStart(value) {
          self.onContactStart = value
        },
        get onContactEnd() {
          return self.onContactEnd
        },
        set onContactEnd(value) {
          self.onContactEnd = value
        },
        get onTriggerEnter() {
          return self.onTriggerEnter
        },
        set onTriggerEnter(value) {
          self.onTriggerEnter = value
        },
        get onTriggerLeave() {
          return self.onTriggerLeave
        },
        set onTriggerLeave(value) {
          self.onTriggerLeave = value
        },
        get sleeping() {
          return self.sleeping
        },
        addForce(force, mode) {
          self.addForce(force, mode)
        },
        addForceAtPos(force, pos, mode) {
          self.addForceAtPos(force, pos, mode)
        },
        addForceAtLocalPos(force, pos, mode) {
          self.addForceAtLocalPos(force, pos, mode)
        },
        addTorque(torque, mode) {
          self.addTorque(torque, mode)
        },
        getPosition(vec3) {
          return self.getPosition(vec3)
        },
        setPosition(vec3) {
          self.setPosition(vec3)
        },
        getQuaternion(quat) {
          return self.getQuaternion(quat)
        },
        setQuaternion(quat) {
          self.setQuaternion(quat)
        },
        getLinearVelocity(vec3) {
          return self.getLinearVelocity(vec3)
        },
        setLinearVelocity(vec3) {
          self.setLinearVelocity(vec3)
        },
        getAngularVelocity(vec3) {
          self.getAngularVelocity(vec3)
        },
        setAngularVelocity(vec3) {
          self.setAngularVelocity(vec3)
        },
        getVelocityAtPos(pos, vec3) {
          return self.getVelocityAtPos(pos, vec3)
        },
        getLocalVelocityAtLocalPos(pos, vec3) {
          return self.getLocalVelocityAtLocalPos(pos, vec3)
        },
        setCenterOfMass(pos) {
          self.setCenterOfMass(pos)
        },
        setKinematicTarget(position, quaternion) {
          self.setKinematicTarget(position, quaternion)
        },
      }
      proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(super.getProxy())) // inherit Node properties
      this.proxy = proxy
    }
    return this.proxy
  }
}

function _isType(value: string) {
  return types.includes(value)
}
