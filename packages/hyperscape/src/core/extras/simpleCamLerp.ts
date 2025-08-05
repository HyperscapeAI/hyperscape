import * as THREE from './three'
import { Layers } from './Layers'
import type { World } from '../World'
import { getPhysX } from '../PhysXManager'
import type { PxSphereGeometry } from '../../types/physx'

const BACKWARD = new THREE.Vector3(0, 0, 1)

const v1 = new THREE.Vector3()
const _v2= new THREE.Vector3()

let sweepGeometry: PxSphereGeometry | undefined

const smoothing = 20

interface CameraTarget {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  zoom: number;
}

interface Camera {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  zoom: number;
}

export function simpleCamLerp(world: World, camera: Camera, target: CameraTarget, delta: number) {
  // interpolate camera rotation
  const alpha = 1.0 - Math.exp(-smoothing * delta)
  camera.quaternion.slerp(target.quaternion, alpha)

  // interpolate camera position
  // camera.position.lerp(target.position, alpha)
  // const distToTarget = camera.position.distanceTo(target.position)
  // if (distToTarget > MAX_CAM_DISTANCE) {
  //   // Pull the camera closer so it's exactly MAX_CAM_DISTANCE away
  //   const direction = v1.copy(camera.position).sub(target.position).normalize()
  //   camera.position.copy(target.position).addScaledVector(direction, MAX_CAM_DISTANCE)
  // }

  // Snap camera position - strong type assumption
  camera.position.copy(target.position)

  // raycast backward to check for zoom collision
  const PHYSX = getPhysX()!
  if (!sweepGeometry) sweepGeometry = new PHYSX.PxSphereGeometry(0.2)
  const origin = camera.position
  const direction = v1.copy(BACKWARD).applyQuaternion(camera.quaternion)
  const layerMask = Layers.camera!.mask // strong type assumption - camera layer exists
  const hit = world.physics.sweep(sweepGeometry, origin, direction, 200, layerMask)

  // lerp to target zoom distance
  const distance = target.zoom
  // but if we hit something snap it in so we don't end up in the wall
  if (hit && hit.distance < distance) {
    camera.zoom = hit.distance
  } else {
    const alpha = 6 * delta
    camera.zoom += (distance - camera.zoom) * alpha // regular lerp
  }
}
