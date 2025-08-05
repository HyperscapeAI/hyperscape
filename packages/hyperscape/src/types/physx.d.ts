/**
 * Clean PhysX Type Definitions
 * 
 * Single source of truth for all PhysX types used throughout the project.
 * Uses strong type assumptions and avoids unnecessary casting/polymorphism.
 */

import type PhysX from '@hyperscape/physx-js-webidl'
import * as THREE from '../core/extras/three'

// Re-export the PhysX namespace for direct access
export type { default as PhysX } from '@hyperscape/physx-js-webidl'

// Helper type for the loaded PhysX module
export type PhysXModule = Awaited<ReturnType<typeof PhysX>>

// Extend the global scope to include typed PHYSX
declare global {
  const PHYSX: PhysXModule | undefined
}

// Core PhysX types - direct aliases to avoid duplication
export type PxVec3 = PhysX.PxVec3
export type PxQuat = PhysX.PxQuat  
export type PxTransform = PhysX.PxTransform

// Actor types
export type PxActor = PhysX.PxActor
export type PxRigidActor = PhysX.PxRigidActor
export type PxRigidBody = PhysX.PxRigidBody
export type PxRigidDynamic = PhysX.PxRigidDynamic
export type PxRigidStatic = PhysX.PxRigidStatic

// Core PhysX objects
export type PxPhysics = PhysX.PxPhysics
export type PxScene = PhysX.PxScene
export type PxFoundation = PhysX.PxFoundation
export type PxTolerancesScale = PhysX.PxTolerancesScale
export type PxCookingParams = PhysX.PxCookingParams
export type PxDefaultAllocator = PhysX.PxDefaultAllocator
export type PxDefaultErrorCallback = PhysX.PxDefaultErrorCallback

// Shape and material types
export type PxShape = PhysX.PxShape
export type PxMaterial = PhysX.PxMaterial
export type PxFilterData = PhysX.PxFilterData
export type PxQueryFilterData = PhysX.PxQueryFilterData

// Geometry types
export type PxGeometry = PhysX.PxGeometry
export type PxBoxGeometry = PhysX.PxBoxGeometry
export type PxSphereGeometry = PhysX.PxSphereGeometry
export type PxCapsuleGeometry = PhysX.PxCapsuleGeometry
export type PxPlaneGeometry = PhysX.PxPlaneGeometry
export type PxConvexMeshGeometry = PhysX.PxConvexMeshGeometry
export type PxTriangleMeshGeometry = PhysX.PxTriangleMeshGeometry
export type PxHeightFieldGeometry = PhysX.PxHeightFieldGeometry

// Controller types
export type PxController = PhysX.PxController
export type PxControllerManager = PhysX.PxControllerManager
export type PxControllerDesc = PhysX.PxControllerDesc
export type PxCapsuleControllerDesc = PhysX.PxCapsuleControllerDesc
export type PxBoxControllerDesc = PhysX.PxBoxControllerDesc
export type PxControllerFilters = PhysX.PxControllerFilters
export type PxControllerCollisionFlags = PhysX.PxControllerCollisionFlags

// Hit result types
export type PxRaycastHit = PhysX.PxRaycastHit
export type PxSweepHit = PhysX.PxSweepHit
export type PxOverlapHit = PhysX.PxOverlapHit
export type PxRaycastResult = PhysX.PxRaycastResult
export type PxSweepResult = PhysX.PxSweepResult
export type PxOverlapResult = PhysX.PxOverlapResult

// Event callback types
export type PxSimulationEventCallback = PhysX.PxSimulationEventCallback
export type PxContactPair = PhysX.PxContactPair
export type PxContactPairHeader = PhysX.PxContactPairHeader
export type PxTriggerPair = PhysX.PxTriggerPair
export type PxContactPairPoint = PhysX.PxContactPairPoint

// Scene description types
export type PxSceneDesc = PhysX.PxSceneDesc
export type PxSceneFlags = PhysX.PxSceneFlags

// Enum types
export type PxForceModeEnum = PhysX.PxForceModeEnum
export type PxRigidBodyFlagEnum = PhysX.PxRigidBodyFlagEnum
export type PxShapeFlagEnum = PhysX.PxShapeFlagEnum
export type PxActorFlagEnum = PhysX.PxActorFlagEnum
export type PxHitFlags = PhysX.PxHitFlags

// PhysX factory result interface
export interface PhysXInfo {
  version: number
  allocator: PxDefaultAllocator
  errorCb: PxDefaultErrorCallback
  foundation: PxFoundation
  physics: PxPhysics
}

// Strong type assertions for PhysX components
export interface PhysXRigidBodyActor extends PxRigidDynamic {
  setGlobalPose(pose: PxTransform): void
  getGlobalPose(): PxTransform
}

export interface PhysXController extends PxController {
  getActor(): PxActor
  setFootPosition(position: PxVec3): void
  move(disp: PxVec3, minDist: number, elapsedTime: number, filters?: PxControllerFilters): PxControllerCollisionFlags
}

// Collision callback interfaces - strongly typed
export interface ContactEvent {
  bodyA: PxActor
  bodyB: PxActor
  shapeA: PxShape
  shapeB: PxShape
  contactPoints: PxContactPairPoint[]
  eventType: 'contact_found' | 'contact_lost' | 'contact_persist'
}

export interface TriggerEvent {
  triggerShape: PxShape
  otherShape: PxShape
  triggerActor: PxActor
  otherActor: PxActor
  eventType: 'trigger_enter' | 'trigger_exit'
}

// Additional collision callback types with Three.js integration
export interface ContactCallbackObject {
  bodyA: PxActor
  bodyB: PxActor
  shapeA: PxShape
  shapeB: PxShape
  contactPoints: Array<{
    position: THREE.Vector3
    normal: THREE.Vector3
    impulse: THREE.Vector3
    separation: number
  }>
  pairFlags: number
  eventType: string
}

export interface TriggerCallbackObject {
  triggerShape: PxShape
  otherShape: PxShape
  triggerActor: PxActor
  otherActor: PxActor
  eventType: string
}