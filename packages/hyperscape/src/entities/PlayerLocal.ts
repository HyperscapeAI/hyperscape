import type PhysX from '@hyperscape/physx-js-webidl'
import { EventType } from '../types/events'
import { ControlBinding, NetworkData } from '../types/index'
import type { PxCapsuleGeometry, PxMaterial, PxRigidDynamic, PxShape, PxSphereGeometry } from '../types/physx'
import type { PhysicsHandle } from '../systems/Physics'
import type {
  ActorHandle,
  Vector3Like,
  QuaternionLike,
  HotReloadable,
  CameraSystem,
  XRSystem,
  PlayerTouch,
  PlayerStickState
} from '../types/physics'
import { createNode } from '../extras/createNode'
import { simpleCamLerp } from '../extras/simpleCamLerp'
import * as THREE from '../extras/three'
import { Avatar, Group, Nametag, UI, UIText, UIView } from '../nodes'
import { getPhysX, waitForPhysX } from '../PhysXManager'

import { vector3ToPxVec3 } from '../extras/vector3-utils'
import { cleanupPxVec3 } from '../physics/vector-conversions'
import { TerrainSystem } from '../systems/TerrainSystem'
import { getSystem } from '../utils/SystemUtils'
import type { World } from '../World'
import { Entity } from './Entity'

// Camera system accessor with strong type assumption
function getCameraSystem(world: World): CameraSystem | null {
  const system = getSystem(world, 'camera-system')
  // Type assertion based on system registration - camera-system is guaranteed to be CameraSystem
  return system as CameraSystem | null
}

// Hyperscape-specific object types using the imported interface

// PhysX is available via getPhysX() from PhysXManager

const UP = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)
const FORWARD = new THREE.Vector3(0, 0, -1)
// Removed unused constant: BACKWARD
const SCALE_IDENTITY = new THREE.Vector3(1, 1, 1)
// Removed unused constant: POINTER_LOOK_SPEED
// Removed unused constant: PAN_LOOK_SPEED
// Removed unused constant: ZOOM_SPEED
// Removed unused constant: MIN_ZOOM
// Removed unused constant: MAX_ZOOM
// Removed unused constant: STICK_MAX_DISTANCE
const DEFAULT_CAM_HEIGHT = 1.2

// Utility function for roles check
function hasRole(roles: string[] | undefined, role: string): boolean {
  return roles ? roles.includes(role) : false
}

// Constants for common game values
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

// Constants for control priorities
const ControlPriorities = {
  PLAYER: 1000,
}

// Removed unused constant: Emotes

// Physics layers utility
function getPhysicsLayers() {
  return {
    environment: { group: 1, mask: 0xffffffff },
    player: { group: 2, mask: 0xffffffff },
    prop: { group: 4, mask: 0xffffffff },
  }
}

// Utility functions for PhysX transform operations
function safePhysXTransform(vector: THREE.Vector3 | THREE.Quaternion, transform: PhysX.PxTransform): void {
  if (vector instanceof THREE.Vector3) {
    if (transform && typeof transform === 'object' && 'p' in transform) {
      const p = transform.p
      p.x = vector.x
      p.y = vector.y
      p.z = vector.z
    }
  } else if (vector instanceof THREE.Quaternion) {
    if (transform && typeof transform === 'object' && 'q' in transform) {
      const q = transform.q
      q.x = vector.x
      q.y = vector.y
      q.z = vector.z
      q.w = vector.w
    }
  }
}

// Matrix composition utility
function safeMatrixCompose(
  matrix: THREE.Matrix4,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  scale: THREE.Vector3
): void {
  const pos = new THREE.Vector3(position.x, position.y, position.z)
  const quat = new THREE.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
  const scl = new THREE.Vector3(scale.x, scale.y, scale.z)

  // Use proper THREE.js method
  matrix.compose(pos, quat, scl)
}



// Matrix decomposition utility
function safeMatrixDecompose(
  matrix: THREE.Matrix4,
  position: Vector3Like,
  quaternion: QuaternionLike,
  scale: Vector3Like
): void {
  // Create temporary objects for decomposition
  const tempPos = new THREE.Vector3()
  const tempQuat = new THREE.Quaternion()
  const tempScale = new THREE.Vector3()

  // Use proper THREE.js method
  matrix.decompose(tempPos, tempQuat, tempScale)

  // Copy values back
  if (position.copy) {
    position.copy(tempPos)
  } else {
    position.x = tempPos.x
    position.y = tempPos.y
    position.z = tempPos.z
  }

  if (quaternion.copy) {
    quaternion.copy(tempQuat)
  } else {
    quaternion.x = tempQuat.x
    quaternion.y = tempQuat.y
    quaternion.z = tempQuat.z
    quaternion.w = tempQuat.w
  }

  if (scale.copy) {
    scale.copy(tempScale)
  } else {
    scale.x = tempScale.x
    scale.y = tempScale.y
    scale.z = tempScale.z
  }
}

// Removed unused function: clamp

// Rotation binding utility
function bindRotations(quaternion: THREE.Quaternion, euler: THREE.Euler): void {
  // THREE.Euler doesn't have _onChange, sync manually when needed
  quaternion.setFromEuler(euler)
}

// Removed unused interface: Camera

// Removed unused interface: CapsuleHandle

const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()
const v3 = new THREE.Vector3()
const v4 = new THREE.Vector3()
const v5 = new THREE.Vector3()
const v6 = new THREE.Vector3()
const e1 = new THREE.Euler(0, 0, 0, 'YXZ')
const q1 = new THREE.Quaternion()
const q2 = new THREE.Quaternion()
const q3 = new THREE.Quaternion()
const q4 = new THREE.Quaternion()
const m1 = new THREE.Matrix4()
const m2 = new THREE.Matrix4()
const m3 = new THREE.Matrix4()

// Removed unused interface: PlayerState

export class PlayerLocal extends Entity implements HotReloadable {
  // Implement HotReloadable interface
  hotReload?(): void {
    // Implementation for hot reload functionality
  }
  isPlayer: boolean
  mass: number = 1
  gravity: number = 20
  effectiveGravity: number = 20
  jumpHeight: number = 1.5
  capsuleRadius: number = 0.3
  capsuleHeight: number = 1.6
  grounded: boolean = false
  groundAngle: number = 0
  groundNormal: THREE.Vector3 = new THREE.Vector3().copy(UP)
  groundSweepRadius: number = 0.29
  groundSweepGeometry: PxSphereGeometry | PxCapsuleGeometry | PxShape | null = null
  pushForce: THREE.Vector3 | null = null
  pushForceInit: boolean = false
  slipping: boolean = false
  jumped: boolean = false
  jumping: boolean = false
  justLeftGround: boolean = false
  fallTimer: number = 0
  falling: boolean = false
  moveDir: THREE.Vector3 = new THREE.Vector3()
  moving: boolean = false
  lastJumpAt: number = 0
  flying: boolean = false
  flyForce: number = 100
  flyDrag: number = 300
  flyDir: THREE.Vector3 = new THREE.Vector3()
  platform: {
    actor: Record<string, unknown> | null
    prevTransform: THREE.Matrix4
  } = {
    actor: null,
    prevTransform: new THREE.Matrix4(),
  }
  speaking: boolean = false
  lastSendAt: number = 0
  base: Group | null = null
  aura: Group | null = null
  nametag: Nametag | null = null
  bubble: UI | null = null
  bubbleBox: UIView | null = null
  bubbleText: UIText | null = null
  camHeight: number = DEFAULT_CAM_HEIGHT
  cam: {
    position: THREE.Vector3
    quaternion: THREE.Quaternion
    rotation: THREE.Euler
    zoom: number
  } = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
    zoom: 1.5,
  }
  avatarUrl?: string
  avatar?: Avatar
  material: PxMaterial | null = null
  capsule: PxRigidDynamic | null = null
  capsuleHandle: ActorHandle | null = null // Physics handle for the capsule
  control: ControlBinding | undefined
  stick?: PlayerStickState
  pan?: PlayerTouch
  capsuleDisabled?: boolean
  materialMax?: boolean
  airJumping?: boolean
  airJumped?: boolean
  fallStartY?: number
  fallDistance?: number
  jumpDown?: boolean
  jumpPressed?: boolean
  onEffectEnd?: () => void
  lastState: {
    p?: THREE.Vector3
    q?: THREE.Quaternion
    e?: string
  } = {}
  emote?: string
  effect?: string
  running: boolean = false
  rotSpeed: number = 5
  _terrainSpawnPosition?: THREE.Vector3

  constructor(
    world: World,
    data: NetworkData & { position?: [number, number, number]; avatarUrl?: string },
    local?: boolean
  ) {
    super(world, { ...data, type: 'player' }, local)
    this.isPlayer = true
  }

  async init(): Promise<void> {
    console.log('[PlayerLocal] Starting init...')

    this.mass = 1
    this.gravity = 20
    this.effectiveGravity = this.gravity * this.mass
    this.jumpHeight = 1.5

    this.capsuleRadius = 0.3
    this.capsuleHeight = 1.6

    this.grounded = false
    this.groundAngle = 0
    this.groundNormal = new THREE.Vector3().copy(UP)
    this.groundSweepRadius = this.capsuleRadius - 0.01 // slighty smaller than player
    // groundSweepGeometry will be created later when PhysX is available

    this.pushForce = null
    this.pushForceInit = false

    this.slipping = false

    this.jumped = false
    this.jumping = false
    this.justLeftGround = false

    this.fallTimer = 0
    this.falling = false

    this.moveDir = new THREE.Vector3()
    this.moving = false

    this.lastJumpAt = 0
    this.flying = false
    this.flyForce = 100
    this.flyDrag = 300
    this.flyDir = new THREE.Vector3()

    this.platform = {
      actor: null,
      prevTransform: new THREE.Matrix4(),
    }

    this.speaking = false

    this.lastSendAt = 0

    this.base = createNode('group') as Group
    if (!this.base) {
      throw new Error('Failed to create base node for PlayerLocal')
    }

    // Get spawn position from world settings with terrain height checking
    const terrainSystem = this.world.systems.find(s => s.constructor.name === 'TerrainSystem') as
      | TerrainSystem
      | undefined
    let spawnX = 0
    let spawnY = 2
    let spawnZ = 0

    if ('spawn' in this.world.settings && Array.isArray(this.world.settings.spawn)) {
      const spawn = this.world.settings.spawn as number[]
      // Ensure spawn coordinates are valid numbers, not NaN
      spawnX = (typeof spawn[0] === 'number' && !isNaN(spawn[0])) ? spawn[0] : 0
      spawnY = (typeof spawn[1] === 'number' && !isNaN(spawn[1])) ? spawn[1] : 2
      spawnZ = (typeof spawn[2] === 'number' && !isNaN(spawn[2])) ? spawn[2] : 0
    }

    if (terrainSystem && terrainSystem.getHeightAt) {
      try {
        const terrainHeight = terrainSystem.getHeightAt(spawnX, spawnZ)
        if (typeof terrainHeight === 'number' && !isNaN(terrainHeight)) {
          spawnY = terrainHeight + 0.1 // Slight offset above terrain
          console.log('[PlayerLocal] Spawning player on terrain at height:', spawnY)
        }
      } catch (_error) {
        console.warn('[PlayerLocal] Could not get terrain height:', _error)
      }
    }

    this.position.set(spawnX, spawnY, spawnZ)
    if ('visible' in this.base) {
      Object.defineProperty(this.base, 'visible', { value: true, writable: true })
    }
    this.active = true

    // Store the calculated terrain position for physics initialization
    this._terrainSpawnPosition = new THREE.Vector3(spawnX, spawnY, spawnZ)

    this.aura = createNode('group') as Group
    if (!this.aura) {
      throw new Error('Failed to create aura node for PlayerLocal')
    }

    this.nametag = createNode('nametag', { label: '', health: this.data.health, active: false }) as Nametag
    if (!this.nametag) {
      throw new Error('Failed to create nametag node for PlayerLocal')
    }
    this.aura.add(this.nametag)

    this.bubble = createNode('ui', {
      id: 'bubble',
      // space: 'screen',
      width: 300,
      height: 512,
      // size: 0.01,
      pivot: 'bottom-center',
      // pivot: 'top-left',
      billboard: 'full',
      scaler: [3, 30],
      justifyContent: 'flex-end',
      alignItems: 'center',
      active: false,
    }) as UI
    if (!this.bubble) {
      throw new Error('Failed to create bubble node for PlayerLocal')
    }
    this.bubbleBox = createNode('uiview', {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderRadius: 10,
      padding: 10,
    }) as UIView
    if (!this.bubbleBox) {
      throw new Error('Failed to create bubbleBox node for PlayerLocal')
    }
    this.bubbleText = createNode('uitext', {
      color: 'white',
      fontWeight: 100,
      lineHeight: 1.4,
      fontSize: 16,
    }) as UIText
    if (!this.bubbleText) {
      throw new Error('Failed to create bubbleText node for PlayerLocal')
    }
    this.bubble.add(this.bubbleBox)
    this.bubbleBox.add(this.bubbleText)
    this.aura.add(this.bubble)

    if (this.aura.activate) {
      this.aura.activate(this.world)
    }
    if (this.base.activate) {
      this.base.activate(this.world)
    }

    this.camHeight = DEFAULT_CAM_HEIGHT

    this.cam = {
      position: new THREE.Vector3().copy(this.position),
      quaternion: new THREE.Quaternion(),
      rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
      zoom: 3.0, // Set reasonable default zoom instead of 1.5
    }
    this.cam.position.y += this.camHeight
    bindRotations(this.cam.quaternion, this.cam.rotation)
    this.cam.quaternion.copy(this.rotation)
    this.cam.rotation.x += -15 * DEG2RAD

    if (this.world.loader?.preloader) {
      await this.world.loader.preloader
    }

    this.applyAvatar()
    // initCapsule is now async, but we don't await it to avoid blocking init
    this.initCapsule().catch(err => {
      console.warn('[PlayerLocal] Failed to initialize capsule:', err)
    })
    this.initControl()

    // Initialize unified camera and movement systems
    this.initUnifiedSystems()

    this.world.setHot(this, true)

    // Register with systems and establish integration
    this.world.emit(EventType.PLAYER_REGISTERED, {
      id: this.data.id,
      entity: this,
      // Provide access to core player capabilities
      capabilities: {
        teleport: this.teleport.bind(this),
        setEffect: this.setEffect.bind(this),
        push: this.push.bind(this),
        getPosition: () => this.position,
        getQuaternion: () => this.base!.quaternion,
        getAvatar: () => this.avatar,
        getCamHeight: () => this.camHeight,
      },
    })

    // Listen for system events to maintain integration
    this.world.on(EventType.PLAYER_HEALTH_UPDATED, this.handleHealthChange.bind(this))
    this.world.on(EventType.PLAYER_TELEPORT_REQUEST, this.handleTeleport.bind(this))

    console.log('[PlayerLocal] Init completed successfully')
  }

  getAvatarUrl(): string {
    return this.data.sessionAvatar || this.data.avatar || 'asset://avatar.vrm'
  }

  applyAvatar(): void {
    const avatarUrl = this.getAvatarUrl()
    if (this.avatarUrl === avatarUrl) return

    this.world.loader
      ?.load('avatar', avatarUrl)
      .then((src: unknown) => {
        if (this.avatar && this.avatar.deactivate) {
          this.avatar.deactivate()
        }

        this.avatar = (src as ArrayBuffer & { toNodes(): Map<string, Avatar> }).toNodes().get('avatar') as Avatar
        if (!this.avatar) {
          throw new Error('Avatar node not found in loaded asset')
        }

        if (this.avatar.disableRateCheck) {
          this.avatar.disableRateCheck() // max fps for local player
        }
        this.base!.add(this.avatar)

        // Set up nametag and bubble positioning
        const headHeight = this.avatar.getHeadToHeight ? this.avatar.getHeadToHeight() : 1.8
        const safeHeadHeight = headHeight ?? 1.8
        if (this.nametag) {
          this.nametag.position.y = safeHeadHeight + 0.2
        }
        if (this.bubble) {
          this.bubble.position.y = safeHeadHeight + 0.2
          if (!this.bubble.active && this.nametag) {
            this.nametag.active = true
          }
        }

        // Set camera height with fallback
        const avatarHeight = this.avatar.height
        this.camHeight = avatarHeight ? avatarHeight * 0.9 : DEFAULT_CAM_HEIGHT

        // Make avatar visible and ensure proper positioning
        if (this.avatar && 'visible' in this.avatar) {
          ;(this.avatar as { visible: boolean }).visible = true
        }
        this.avatar.position.set(0, 0, 0)

        this.avatarUrl = avatarUrl

        // Emit avatar ready event for camera system
        this.world.emit(EventType.PLAYER_AVATAR_READY, {
          playerId: this.data.id,
          avatar: this.avatar,
          camHeight: this.camHeight,
        })

        // Emit camera follow event using core camera system
        const cameraSystem = getCameraSystem(this.world)
        if (cameraSystem) {
          this.world.emit(EventType.CAMERA_FOLLOW_PLAYER, {
            playerId: this.data.id,
            entity: this,
            camHeight: this.camHeight,
          })
        }
      })
      .catch((err: Error) => {
        console.error('[PlayerLocal] Failed to load avatar:', err)
      })
  }

  private createFallbackAvatar(): void {
    try {
      // Create a minimal fallback avatar that implements the required Avatar interface
      // This is a temporary object used until the real avatar loads
      // Create a fallback avatar - go back to the simpler approach with proper typing
      const fallbackAvatar = {
        height: 1.8,
        visible: true,
        position: { set: (_x: number, _y: number, _z: number) => {} },
        disableRateCheck: () => {},
        deactivate: () => {},
        getHeadToHeight: () => 1.7,
        setEmote: (_emote: string) => {},
      }

      // Cast through unknown first as recommended by TypeScript for intentional type conversions
      // This is a temporary fallback avatar until the real one loads
      this.avatar = fallbackAvatar as unknown as Avatar
      this.camHeight = DEFAULT_CAM_HEIGHT
      this.avatarUrl = this.getAvatarUrl()

      // Set up nametag and bubble positioning
      if (this.nametag) {
        this.nametag.position.y = 1.9
      }
      if (this.bubble) {
        this.bubble.position.y = 1.9
        if (!this.bubble.active && this.nametag) {
          this.nametag.active = true
        }
      }

      // Emit avatar ready event even for fallback
      this.world.emit(EventType.PLAYER_AVATAR_READY, {
        playerId: this.data.id,
        avatar: this.avatar,
        camHeight: this.camHeight,
        isFallback: true,
      })

      // Emit camera follow event using core camera system
      const cameraSystem = getCameraSystem(this.world)
      if (cameraSystem) {
        this.world.emit(EventType.CAMERA_FOLLOW_PLAYER, {
          player: this,
        })
      }
    } catch (fallbackError) {
      console.error('[PlayerLocal] ❌ Even fallback avatar creation failed:', fallbackError)
      // Set minimal defaults
      this.camHeight = DEFAULT_CAM_HEIGHT
    }
  }

  async initCapsule(): Promise<void> {
    console.log('[PlayerLocal] Initializing physics capsule...')

    // Validation: Ensure we have a valid terrain spawn position
    if (!this._terrainSpawnPosition) {
      console.warn('[PlayerLocal] Cannot initialize physics capsule: No terrain spawn position available')
      return
    }

    // Validation: Ensure terrain spawn position is valid
    if (
      isNaN(this._terrainSpawnPosition.x) ||
      isNaN(this._terrainSpawnPosition.y) ||
      isNaN(this._terrainSpawnPosition.z)
    ) {
      console.warn(
        `[PlayerLocal] Invalid terrain spawn position: ${this._terrainSpawnPosition.x}, ${this._terrainSpawnPosition.y}, ${this._terrainSpawnPosition.z}`
      )
      return
    }

    // Validation: Ensure base exists
    if (!this.base) {
      console.warn('[PlayerLocal] Cannot initialize physics capsule: Base object is null')
      return
    }

    // Wait for PhysX to be ready - required for player physics
    console.log('[PlayerLocal] Waiting for PhysX...')
    await waitForPhysX('PlayerLocal', 10000) // 10 second timeout
    console.log('[PlayerLocal] PhysX ready')

    // Get the global PHYSX object - required
    const PHYSX = getPhysX()
    if (!PHYSX) {
      throw new Error('[PlayerLocal] PHYSX global not available - PlayerLocal requires PhysX for physics simulation')
    }

    // Assert physics system is ready - required for player movement
    if (!this.world.physics) {
      throw new Error('[PlayerLocal] Physics system not found - PlayerLocal requires physics system')
    }

    if (!this.world.physics.scene) {
      throw new Error('[PlayerLocal] Physics scene not initialized - PlayerLocal requires active physics scene')
    }

    // Create ground sweep geometry now that PhysX is available
    // PHYSX already declared above
    this.groundSweepGeometry = new PHYSX.PxSphereGeometry(this.groundSweepRadius)

    console.log(
      '[PlayerLocal] Using terrain spawn position:',
      this._terrainSpawnPosition.x,
      this._terrainSpawnPosition.y,
      this._terrainSpawnPosition.z
    )

    // Create physics material using the physics system - required for capsule
    this.material = this.world.physics.physics.createMaterial(0.4, 0.4, 0.1)
    if (!this.material) {
      throw new Error('[PlayerLocal] Failed to create physics material - required for player capsule')
    }

    // Create capsule geometry using PhysX API
    const geometry = new PHYSX.PxCapsuleGeometry(this.capsuleRadius, this.capsuleHeight * 0.5)

    // Create rigid dynamic body using the physics system's method
    const transform = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    this.capsule = this.world.physics.physics.createRigidDynamic(transform)
    if (!this.capsule) {
      throw new Error('[PlayerLocal] Failed to create rigid dynamic body')
    }

    // Set mass first
    this.capsule.setMass(this.mass)

    // Configure physics flags
    this.capsule.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eENABLE_CCD, true)
    this.capsule.setRigidDynamicLockFlag(PHYSX.PxRigidDynamicLockFlagEnum.eLOCK_ANGULAR_X, true)
    this.capsule.setRigidDynamicLockFlag(PHYSX.PxRigidDynamicLockFlagEnum.eLOCK_ANGULAR_Z, true)
    this.capsule.setActorFlag(PHYSX.PxActorFlagEnum.eDISABLE_GRAVITY, true)

    // Create and attach shape to actor using the physics system's createShape method
    const shape = this.world.physics.physics.createShape(geometry, this.material!, false)
    if (!shape) {
      throw new Error('[PlayerLocal] Failed to create capsule shape')
    }

    this.capsule.attachShape(shape)

    // CRITICAL: Initialize physics capsule with correct terrain position from the start
    // This prevents race conditions with physics interpolation
    const initialPose = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    initialPose.p.x = this._terrainSpawnPosition.x
    initialPose.p.y = this._terrainSpawnPosition.y
    initialPose.p.z = this._terrainSpawnPosition.z

    // Apply the corrected pose to the physics capsule
    this.capsule.setGlobalPose(initialPose)

    // Register the capsule with the physics system
    const capsuleHandle = {
      tag: 'player',
      playerId: this.data?.id || 'unknown',
      onInterpolate: (position: THREE.Vector3, _quaternion: THREE.Quaternion) => {
        // Update the base position with interpolated physics position
        if (this.base) {
          this.position.copy(position)
          // Note: We don't update quaternion from physics for player capsule
          // as player rotation is controlled by input/camera
        }
      },
      interpolation: {
        enabled: true,
        smoothing: 0.1,
        prev: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
        next: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
        curr: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
      },
      contactedHandles: new Set<PhysicsHandle>(),
      triggeredHandles: new Set<PhysicsHandle>(),
    }
    const physics = this.world.physics
    if (!physics) {
      throw new Error('[PlayerLocal] Physics system is not available')
    }

    this.capsuleHandle = physics.addActor(this.capsule, capsuleHandle) as ActorHandle | null

    // Validate capsule handle exists
    if (!this.capsuleHandle) {
      throw new Error('[PlayerLocal] Capsule handle is not available')
    }

    // Snap the capsule handle to the correct position
    // Note: snap expects an object with p and q properties
    if (this.capsuleHandle && this.capsuleHandle.snap) {
      this.capsuleHandle.snap(initialPose)
    } else {
      console.warn('[PlayerLocal] Capsule handle snap method not available')
    }

    // Sync the base position with the terrain spawn position
    // This ensures the Three.js object and physics object are in sync from the start
    this.position.copy(this._terrainSpawnPosition)

    // Validate final positions
    const finalPose = this.capsule.getGlobalPose()
    const finalPosition = finalPose.p

    console.log('[PlayerLocal] Physics capsule initialized successfully')
    console.log('[PlayerLocal] Physics position:', finalPosition.x, finalPosition.y, finalPosition.z)
    console.log('[PlayerLocal] Base position:', this.position.x, this.position.y, this.position.z)

    // Verify positions match
    const positionDelta = new THREE.Vector3(
      Math.abs(finalPosition.x - this.position.x),
      Math.abs(finalPosition.y - this.position.y),
      Math.abs(finalPosition.z - this.position.z)
    )

    if (positionDelta.length() > 0.001) {
      console.warn('[PlayerLocal] Position mismatch between physics and base:', positionDelta.length())
    } else {
      console.log('[PlayerLocal] Physics and base positions are synchronized')
    }
  }

  initControl() {
    this.control = this.world.controls?.bind({
      priority: ControlPriorities.PLAYER,
      onTouch: (touch: unknown) => {
        const playerTouch = touch as PlayerTouch
        if (!this.stick && playerTouch.position && playerTouch.position.x < (this.control?.screen?.width || 0) / 2) {
          this.stick = {
            center: { x: playerTouch.position.x, y: playerTouch.position.y },
            touch: playerTouch,
          }
        } else if (!this.pan) {
          this.pan = playerTouch
        }
        return true
      },
      onTouchEnd: (touch: unknown) => {
        const playerTouch = touch as PlayerTouch
        if (this.stick?.touch === playerTouch) {
          this.stick = undefined
        }
        if (this.pan === playerTouch) {
          this.pan = undefined
        }
        return true
      },
    }) as ControlBinding

    // Check if unified camera system is active
    const cameraSystem = getSystem(this.world, 'client-camera-system')
    if (!cameraSystem) {
      // Fall back to traditional camera control if unified system not available
      if (this.control?.camera) {
        this.control.camera.write = (camera: THREE.Camera) => {
          camera.position.copy(this.cam.position)
          camera.quaternion.copy(this.cam.quaternion)
        }
        this.control.camera.position.copy(this.cam.position)
        this.control.camera.quaternion.copy(this.cam.quaternion)
        this.control.camera.zoom = this.cam.zoom
      }
    }
  }

  initUnifiedSystems(): void {
    // Register with unified camera system if available
    const cameraSystem = getSystem(this.world, 'client-camera-system')
    if (cameraSystem) {
      console.log('[PlayerLocal] Registering with unified camera system')
      this.world.emit(EventType.CAMERA_SET_TARGET, { target: this })
    }

    // Register with unified movement system if available
    const movementSystem = getSystem(this.world, 'client-movement-system')
    if (movementSystem) {
      console.log('[PlayerLocal] Registering with unified movement system')
      this.world.emit(EventType.PLAYER_REGISTERED, { playerId: this.data.id })
    }

    // Emit avatar ready event for camera height adjustment
    if (this.avatar) {
      this.world.emit(EventType.PLAYER_AVATAR_READY, {
        playerId: this.data.id,
        avatar: this.avatar,
        camHeight: this.camHeight,
      })
    }
  }

  toggleFlying() {
    const canFly = this.world.settings.public || hasRole(this.data.roles, 'admin')
    if (!canFly) return
    this.flying = !this.flying
    if (this.flying && this.capsule) {
      // zero out vertical velocity when entering fly mode
      const velocity = this.capsule.getLinearVelocity()
      if (velocity) {
        velocity.y = 0
        this.capsule.setLinearVelocity(velocity)
      }
    } else {
      // ...
    }
    this.lastJumpAt = -999
  }

  getAnchorMatrix() {
    if (this.data.effect?.anchorId) {
      return this.world.anchors.get(this.data.effect.anchorId)
    }
    return null
  }

  fixedUpdate(delta: number): void {
    // Skip physics updates if PhysX isn't ready
    const PHYSX = getPhysX()
    if (!PHYSX || !this.capsule) {
      return
    }

    const anchor = this.getAnchorMatrix()
    const snare = this.data.effect?.snare || 0

    if (anchor && !this.capsuleDisabled) {
      const PHYSX = getPhysX()
      if (PHYSX) {
        this.capsule!.setActorFlag(PHYSX.PxActorFlagEnum.eDISABLE_SIMULATION, true)
      }
      this.capsuleDisabled = true
    }
    if (!anchor && this.capsuleDisabled) {
      const PHYSX = getPhysX()
      if (PHYSX) {
        this.capsule!.setActorFlag(PHYSX.PxActorFlagEnum.eDISABLE_SIMULATION, false)
      }
      this.capsuleDisabled = false
    }

    if (anchor) {
      /**
       *
       * ZERO MODE
       *
       */
      // Player is anchored, no physics updates needed
    } else if (!this.flying) {
      /**
       *
       * STANDARD MODE
       *
       */

      // if grounded last update, check for moving platforms and move with them
      if (this.grounded && this.capsule) {
        // find any potentially moving platform
        const pose = this.capsule.getGlobalPose()
        if (!pose || !pose.p) {
          // Skip platform detection if physics pose is not available
          return
        }
        const origin = v1.copy(pose.p!)
        origin.y += 0.2
        const layers = getPhysicsLayers()
        const hitMask = (layers.environment?.group || 0) | (layers.prop?.group || 0)
        const hit = this.world.physics.raycast(origin, DOWN, 2, hitMask)
        const actor = (hit?.handle as PhysicsHandle)?.actor || null
        // if we found a new platform, set it up for tracking
        if (this.platform.actor !== actor) {
          // Only assign if actor is a rigid dynamic (can be moved/affected by forces)
          if (actor && 'setGlobalPose' in actor && 'getGlobalPose' in actor && 'addForce' in actor) {
            this.platform.actor = actor as Record<string, unknown>
          } else {
            this.platform.actor = null
          }
          if (
            actor &&
            this.platform.actor &&
            'getGlobalPose' in this.platform.actor &&
            typeof this.platform.actor.getGlobalPose === 'function'
          ) {
            const platformPose = this.platform.actor.getGlobalPose()
            if (platformPose && typeof platformPose === 'object' && 'p' in platformPose && 'q' in platformPose) {
              const p = platformPose.p
              const q = platformPose.q
              if (
                p &&
                typeof p === 'object' &&
                'x' in p &&
                'y' in p &&
                'z' in p &&
                q &&
                typeof q === 'object' &&
                'x' in q &&
                'y' in q &&
                'z' in q &&
                'w' in q
              ) {
                v1.set(Number(p.x), Number(p.y), Number(p.z))
                q1.set(Number(q.x), Number(q.y), Number(q.z), Number(q.w))
                safeMatrixCompose(this.platform.prevTransform, v1, q1, SCALE_IDENTITY)
              }
            }
          }
        }
        // move with platform
        if (
          this.platform.actor &&
          'getGlobalPose' in this.platform.actor &&
          typeof this.platform.actor.getGlobalPose === 'function'
        ) {
          // get current platform transform
          const currTransform = m1
          const platformPose = this.platform.actor.getGlobalPose()
          if (platformPose && typeof platformPose === 'object' && 'p' in platformPose && 'q' in platformPose) {
            const p = platformPose.p
            const q = platformPose.q
            if (
              p &&
              typeof p === 'object' &&
              'x' in p &&
              'y' in p &&
              'z' in p &&
              q &&
              typeof q === 'object' &&
              'x' in q &&
              'y' in q &&
              'z' in q &&
              'w' in q
            ) {
              v1.set(Number(p.x), Number(p.y), Number(p.z))
              q1.set(Number(q.x), Number(q.y), Number(q.z), Number(q.w))
              safeMatrixCompose(currTransform, v1, q1, SCALE_IDENTITY)
              // get delta transform
              const deltaTransform = m2.multiplyMatrices(currTransform, this.platform.prevTransform.clone().invert())
              // extract delta position and quaternion
              const deltaPosition = v2
              const deltaQuaternion = q2
              const deltaScale = v3
              safeMatrixDecompose(deltaTransform, deltaPosition, deltaQuaternion, deltaScale)
              // apply delta to player
              if (!this.capsule) return
              const playerPose = this.capsule.getGlobalPose()
              if (!playerPose || !playerPose.p || !playerPose.q) return
              v4.copy(playerPose.p)
              q3.copy(playerPose.q)
              const playerTransform = m3
              safeMatrixCompose(playerTransform, v4, q3, SCALE_IDENTITY)
              playerTransform.premultiply(deltaTransform)
              const newPosition = v5
              const newQuaternion = q4
              safeMatrixDecompose(playerTransform, newPosition, newQuaternion, v6)
              const newPose = this.capsule.getGlobalPose()
              if (!newPose || !newPose.p || !newPose.q) return
              safePhysXTransform(newPosition, newPose)
              // newQuaternion.toPxTransform(newPose) // capsule doesn't rotate
              this.capsule!.setGlobalPose(newPose)
              // rotate ghost by Y only
              e1.setFromQuaternion(deltaQuaternion).reorder('YXZ')
              e1.x = 0
              e1.z = 0
              q1.setFromEuler(e1)
              this.base!.quaternion.multiply(q1)
              // Update transform if method exists on base node
              if ('updateTransform' in this.base! && typeof this.base!.updateTransform === 'function') {
                this.base!.updateTransform()
              }
              // store current transform for next frame
              this.platform.prevTransform.copy(currTransform)
            }
          }
        }
      } else {
        this.platform.actor = null
      }

      // sweep down to see if we hit ground
      let sweepHit
      if (this.capsule) {
        const geometry = this.groundSweepGeometry
        const pose = this.capsule.getGlobalPose()
        if (pose && pose.p) {
          const origin = v1.copy(pose.p /*this.ghost.position*/)
          origin.y += this.groundSweepRadius + 0.12 // move up inside player + a bit
          const direction = DOWN
          const maxDistance = 0.12 + 0.1 // outside player + a bit more
          const layers = getPhysicsLayers()
          const hitMask = (layers.environment?.group || 0) | (layers.prop?.group || 0)
          sweepHit = this.world.physics.sweep(geometry, origin, direction, maxDistance, hitMask)
        }
      }

      // update grounded info
      if (sweepHit) {
        this.justLeftGround = false
        this.grounded = true
        this.groundNormal.copy(sweepHit.normal)
        this.groundAngle = UP.angleTo(this.groundNormal) * RAD2DEG
      } else {
        this.justLeftGround = !!this.grounded
        this.grounded = false
        this.groundNormal.copy(UP)
        this.groundAngle = 0
      }

      // if on a steep slope, unground and track slipping
      if (this.grounded && this.groundAngle > 60) {
        this.justLeftGround = false
        this.grounded = false
        this.groundNormal.copy(UP)
        this.groundAngle = 0
        this.slipping = true
      } else {
        this.slipping = false
      }

      // our capsule material has 0 friction
      // we use eMIN when in the air so that we don't stick to walls etc (zero friction)
      // and eMAX on the ground so that we don't constantly slip off physics objects we're pushing (absorb objects friction)
      if (this.grounded) {
        if (this.materialMax !== true) {
          if (this.material?.setFrictionCombineMode && this.material?.setRestitutionCombineMode) {
            const PHYSX = getPhysX()
            if (PHYSX) {
              this.material.setFrictionCombineMode!(PHYSX.PxCombineModeEnum.eMAX)
              this.material.setRestitutionCombineMode!(PHYSX.PxCombineModeEnum.eMAX)
            }
          }
          this.materialMax = true
        }
      } else {
        if (this.materialMax !== false) {
          if (this.material?.setFrictionCombineMode && this.material?.setRestitutionCombineMode) {
            const PHYSX = getPhysX()
            if (PHYSX) {
              this.material.setFrictionCombineMode!(PHYSX.PxCombineModeEnum.eMIN)
              this.material.setRestitutionCombineMode!(PHYSX.PxCombineModeEnum.eMIN)
            }
          }
          this.materialMax = false
        }
      }

      // if we jumped and have now left the ground, progress to jumping
      if (this.jumped && !this.grounded) {
        this.jumped = false
        this.jumping = true
      }

      // if not grounded and our velocity is downward, start timing our falling
      if (!this.grounded && this.capsule) {
        const velocity = this.capsule.getLinearVelocity()
        if (velocity && velocity.y < 0) {
          this.fallTimer += delta
        }
      } else {
        this.fallTimer = 0
      }
      // if we've been falling for a bit then progress to actual falling
      // this is to prevent animation jitter when only falling for a very small amount of time
      if (this.fallTimer > 0.1 && !this.falling) {
        this.jumping = false
        this.airJumping = false
        this.falling = true
        this.fallStartY = this.position.y
      }

      // if falling track distance
      if (this.falling && this.fallStartY !== undefined) {
        this.fallDistance = this.fallStartY - this.position.y
      }

      // if falling and we're now on the ground, clear it
      if (this.falling && this.grounded) {
        this.falling = false
      }

      // if jumping and we're now on the ground, clear it
      if (this.jumping && this.grounded) {
        this.jumping = false
      }

      // if airJumping and we're now on the ground, clear it
      if (this.airJumped && this.grounded) {
        this.airJumped = false
        this.airJumping = false
      }

      // if we're grounded we don't need gravity.
      // more importantly we disable it so that we don't slowly slide down ramps while standing still.
      // even more importantly, if the platform we are on is dynamic we apply a force to it to compensate for our gravity being off.
      // this allows things like see-saws to move down when we stand on them etc.
      if (this.grounded) {
        // gravity is disabled but we need to check our platform
        if (this.platform.actor) {
          const PHYSX = getPhysX()
          const isStatic = PHYSX ? this.platform.actor instanceof PHYSX.PxRigidStatic : false
          const actor = this.platform.actor
          const isKinematic =
            PHYSX && actor && 'getRigidBodyFlags' in actor && typeof actor.getRigidBodyFlags === 'function'
              ? (() => {
                  const flags = actor.getRigidBodyFlags()
                  return flags && typeof flags === 'object' && 'isSet' in flags && typeof flags.isSet === 'function'
                    ? flags.isSet(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC)
                    : false
                })()
              : false
          // if its dynamic apply downward force!
          if (!isKinematic && !isStatic) {
            // this feels like the right amount of force but no idea why 0.2
            const amount = -9.81 * 0.2
            const force = v1.set(0, amount, 0)
            // Use a safe approach for adding force at position
            if (this.platform.actor && this.capsule) {
              const pose = this.capsule.getGlobalPose()
              if (pose && pose.p) {
                const pxForce = vector3ToPxVec3(force)
                const pxPos = vector3ToPxVec3(v2.copy(pose.p))
                if (pxForce && pxPos && this.platform.actor) {
                  if (
                    'addForceAtPos' in this.platform.actor &&
                    typeof this.platform.actor.addForceAtPos === 'function'
                  ) {
                    ;(this.platform.actor.addForceAtPos as (force: unknown, pos: unknown, mode?: unknown) => void)(
                      pxForce,
                      pxPos,
                      getPhysX()?.PxForceModeEnum?.eFORCE
                    )
                  } else if ('addForce' in this.platform.actor && typeof this.platform.actor.addForce === 'function') {
                    // Fallback to regular addForce
                    ;(this.platform.actor.addForce as (force: unknown, mode?: unknown, autocwake?: boolean) => void)(
                      pxForce,
                      getPhysX()?.PxForceModeEnum?.eFORCE,
                      true
                    )
                  }
                  // Clean up PhysX vectors
                  cleanupPxVec3(pxForce)
                  cleanupPxVec3(pxPos)
                }
              }
            }
          }
        }
      } else if (this.capsule) {
        const force = v1.set(0, -this.effectiveGravity, 0)
        const pxForce = vector3ToPxVec3(force)
        if (pxForce) {
          this.capsule.addForce(pxForce, getPhysX()?.PxForceModeEnum?.eFORCE || 0, true)
        }
      }

      // update velocity
      if (!this.capsule) return
      const capsuleVelocity = this.capsule.getLinearVelocity()
      if (!capsuleVelocity) return
      const velocity = v1.copy(capsuleVelocity)
      // apply drag, orientated to ground normal
      // this prevents ice-skating & yeeting us upward when going up ramps
      const dragCoeff = 10 * delta
      const perpComponent = v2.copy(this.groundNormal).multiplyScalar(velocity.dot(this.groundNormal))
      const parallelComponent = v3.copy(velocity).sub(perpComponent)
      parallelComponent.multiplyScalar(1 - dragCoeff)
      velocity.copy(parallelComponent.add(perpComponent))
      // cancel out velocity in ground normal direction (up oriented to ground normal)
      // this helps us stick to elevators
      if (this.grounded && !this.jumping) {
        const projectedLength = velocity.dot(this.groundNormal)
        const projectedVector = v2.copy(this.groundNormal).multiplyScalar(projectedLength)
        velocity.sub(projectedVector)
      }
      // when walking off an edge or over the top of a ramp, attempt to snap down to a surface
      if (this.justLeftGround && !this.jumping) {
        velocity.y = -5
      }
      // if slipping ensure we can't gain upward velocity
      if (this.slipping) {
        // increase downward velocity to prevent sliding upward when walking at a slope
        velocity.y -= 0.5
      }

      // apply additional push force
      if (this.pushForce) {
        if (!this.pushForceInit) {
          this.pushForceInit = true
          // if we're pushing up, act like a jump so we don't stick to the ground
          if (this.pushForce.y) {
            this.jumped = true
            // ensure other stuff is reset
            this.jumping = false
            this.falling = false
            this.airJumped = false
            this.airJumping = false
          }
        }
        velocity.add(this.pushForce)
        const drag = 20
        const decayFactor = 1 - drag * delta
        if (decayFactor < 0) {
          // if drag * delta > 1, just set to zero
          this.pushForce.set(0, 0, 0)
        } else {
          this.pushForce.multiplyScalar(Math.max(decayFactor, 0))
        }
        if (this.pushForce.length() < 0.01) {
          this.pushForce = null
        }
      }

      // Set the updated velocity on the capsule
      const pxVelocity = vector3ToPxVec3(velocity)
      if (pxVelocity) {
        this.capsule!.setLinearVelocity(pxVelocity)
      }

      // apply move force, projected onto ground normal
      if (this.moving) {
        let moveSpeed = (this.running ? 8 : 4) * this.mass // run
        moveSpeed *= 1 - snare
        const upVec = new THREE.Vector3(0, 1, 0)
        const groundVec = new THREE.Vector3(this.groundNormal.x, this.groundNormal.y, this.groundNormal.z)
        const slopeRotation = q1.setFromUnitVectors(upVec, groundVec)
        const moveForce = v1.copy(this.moveDir).multiplyScalar(moveSpeed * 10).applyQuaternion(slopeRotation) // prettier-ignore
        const PHYSX = getPhysX()
        const pxMoveForce = vector3ToPxVec3(moveForce)
        if (pxMoveForce) {
          this.capsule!.addForce(pxMoveForce, PHYSX?.PxForceModeEnum?.eFORCE || 0, true)
        }
        // alternative (slightly different projection)
        // let moveSpeed = 10
        // const slopeMoveDir = v1.copy(this.moveDir).projectOnPlane(this.groundNormal).normalize()
        // const moveForce = v2.copy(slopeMoveDir).multiplyScalar(moveSpeed * 10)
        // this.capsule!.addForce(vector3ToPxVec3(moveForce), PHYSX?.PxForceModeEnum?.eFORCE || 0, true)
      }

      // ground/air jump
      const shouldJump =
        this.grounded && !this.jumping && this.jumpDown && !this.data.effect?.snare && !this.data.effect?.freeze
      const shouldAirJump = !this.grounded && !this.airJumped && this.jumpPressed && !this.world.builder?.enabled
      if (shouldJump || shouldAirJump) {
        // calc velocity needed to reach jump height
        let jumpVelocity = Math.sqrt(2 * this.effectiveGravity * this.jumpHeight)
        jumpVelocity = jumpVelocity * (1 / Math.sqrt(this.mass))
        // update velocity
        if (this.capsule) {
          const velocity = this.capsule.getLinearVelocity()
          if (velocity) {
            velocity.y = jumpVelocity
            this.capsule.setLinearVelocity(velocity)
          }
        }
        // ground jump init (we haven't left the ground yet)
        if (shouldJump) {
          this.jumped = true
        }
        // air jump init
        if (shouldAirJump) {
          this.falling = false
          this.fallTimer = 0
          this.jumping = true
          this.airJumped = true
          this.airJumping = true
        }
      }
    } else {
      /**
       *
       * FLYING MODE
       *
       */

      // apply force in the direction we want to go
      if (this.moving || this.jumpDown || this.control?.keyC?.down) {
        const flySpeed = this.flyForce * (this.running ? 2 : 1)
        const force = v1.copy(this.flyDir).multiplyScalar(flySpeed)
        // handle vertical movement
        if (this.jumpDown) {
          force.y = flySpeed
        } else if (this.control?.keyC?.down) {
          force.y = -flySpeed
        }
        if (this.capsule) {
          const pxForce = vector3ToPxVec3(force)
          if (pxForce) {
            this.capsule.addForce(pxForce, getPhysX()?.PxForceModeEnum?.eFORCE || 0, true)
          }
        }
      }

      // add drag to prevent excessive speeds
      if (this.capsule) {
        const capsuleVelocity = this.capsule.getLinearVelocity()
        if (capsuleVelocity) {
          const velocity = v2.copy(capsuleVelocity)
          const dragForce = v3.copy(velocity).multiplyScalar(-this.flyDrag * delta)
          const PHYSX = getPhysX()
          const pxDragForce = vector3ToPxVec3(dragForce)
          if (pxDragForce) {
            this.capsule.addForce(pxDragForce, PHYSX?.PxForceModeEnum?.eFORCE || 0, true)
          }

          // zero out any rotational velocity
          const zeroAngular = v4.set(0, 0, 0)
          const pxZeroAngular = vector3ToPxVec3(zeroAngular)
          if (pxZeroAngular) {
            this.capsule.setAngularVelocity(pxZeroAngular)
          }
        }
      }

      // if not in build mode, cancel flying
      if (!this.world.builder?.enabled) {
        this.toggleFlying()
      }
    }

    // double jump in build, mode toggle flying
    if (this.jumpPressed && this.world.builder?.enabled) {
      const now = this.world.frame
      if (now - this.lastJumpAt < 15 && now - this.lastJumpAt > 1) {
        this.toggleFlying()
      }
      this.lastJumpAt = now
    }

    // consume jump press so we dont run it across multiple fixedUpdates in one frame
    this.jumpPressed = false
  }

  update(delta: number): void {
    // Keep the player grounded by updating the move direction based on input
    this.moveDir.set(0, 0, 0)
    if (this.control?.keyW?.down || this.control?.arrowUp?.down) this.moveDir.z -= 1
    if (this.control?.keyS?.down || this.control?.arrowDown?.down) this.moveDir.z += 1
    if (this.control?.keyA?.down || this.control?.arrowLeft?.down) this.moveDir.x -= 1
    if (this.control?.keyD?.down || this.control?.arrowRight?.down) this.moveDir.x += 1

    if (this.moveDir.length() > 0) {
      this.moveDir.normalize()
      this.moving = true
    } else {
      this.moving = false
    }

    // Handle running input
    this.running = this.moving && (this.control?.shiftLeft?.down || false || this.control?.shiftRight?.down || false)

    // Apply movement and rotation logic
    if (this.moving) {
      // Rotate player toward movement direction
      const angle = Math.atan2(this.moveDir.x, this.moveDir.z)
      const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(UP, angle)
      const alpha = 1 - Math.pow(0.000001, delta)
      this.base!.quaternion.slerp(targetQuaternion, alpha)
    }

    // Handle emote animation
    if (this.avatar && this.avatar.setEmote && this.emote) {
      this.avatar.setEmote(this.emote)
    }

    // Send network updates if needed
    this.sendNetworkUpdate()
  }

  sendNetworkUpdate(): void {
    // Create network data object with proper type
    const data: Partial<NetworkData> = {
      id: this.data.id,
    }

    let hasChanges = false

    // Check for position changes
    if (!this.lastState.p?.equals(this.position)) {
      data.p = this.position.toArray() as [number, number, number]
      this.lastState.p?.copy(this.position)
      hasChanges = true
    }

    // Check for quaternion changes
    if (!this.lastState.q?.equals(this.base!.quaternion)) {
      data.q = this.base!.quaternion.toArray() as [number, number, number, number]
      this.lastState.q?.copy(this.base!.quaternion)
      hasChanges = true
    }

    // Check for emote changes
    if (this.lastState.e !== this.emote) {
      data.e = this.emote
      this.lastState.e = this.emote!
      hasChanges = true
    }

    if (hasChanges) {
      this.world.network.send('entityModified', data)
    }
  }

  lateUpdate(delta: number): void {
    const isXR = (this.world.xr as XRSystem)?.session
    const anchor = this.getAnchorMatrix()
    // if we're anchored, force into that pose
    if (anchor && this.capsule) {
      this.position.setFromMatrixPosition(anchor)
      this.base!.quaternion.setFromRotationMatrix(anchor)
      const pose = this.capsule.getGlobalPose()
      if (pose && pose.p) {
        // Manually set position to avoid type casting issues
        pose.p.x = this.position.x
        pose.p.y = this.position.y
        pose.p.z = this.position.z
        this.capsuleHandle?.snap(pose)
      }
    }
    // make camera follow our position horizontally
    this.cam.position.copy(this.position)
    if (isXR) {
      // ...
    } else {
      // and vertically at our vrm model height
      this.cam.position.y += this.camHeight
      // and slightly to the right over the avatars shoulder, when not in XR
      const forward = v1.copy(FORWARD).applyQuaternion(this.cam.quaternion)
      const right = v2.crossVectors(forward, UP).normalize()
      this.cam.position.add(right.multiplyScalar(0.3))
    }
    if ((this.world.xr as XRSystem)?.session) {
      // in vr snap camera
      if (this.control?.camera) {
        this.control.camera.position.copy(this.cam.position)
        this.control.camera.quaternion.copy(this.cam.quaternion)
      }
    } else {
      // otherwise interpolate camera towards target
      if (this.control?.camera) {
        // simpleCamLerp expects a Camera interface, but control.camera is a different type
        // Create an adapter object that matches the expected interface
        const cameraAdapter = {
          position: this.control.camera.position,
          quaternion: this.control.camera.quaternion,
          zoom: this.control.camera.zoom,
        }
        simpleCamLerp(this.world, cameraAdapter, this.cam, delta)
      }
    }
    if (this.avatar) {
      if (this.avatar.getBoneTransform) {
        const matrix = this.avatar.getBoneTransform('head')
        if (matrix && this.aura) {
          this.aura.position.setFromMatrixPosition(matrix)
        }
      }
    }
  }

  postLateUpdate(_delta: number): void {
    // Implement postLateUpdate as required by HotReloadable interface
    // This method is called after all other update methods
    // Currently no specific implementation needed
  }

  teleport(position: THREE.Vector3, rotationY?: number): void {
    const hasRotation = !isNaN(rotationY!)
    // snap to position
    if (!this.capsule) return
    const pose = this.capsule.getGlobalPose()
    if (!pose || !pose.p) return
    // Manually set position to avoid type casting issues
    pose.p.x = position.x
    pose.p.y = position.y
    pose.p.z = position.z
    this.capsuleHandle?.snap(pose)
    this.position.copy(position)
    if (hasRotation) this.rotation.y = rotationY!
    // send network update
    this.world.network.send('entityModified', {
      id: this.data.id,
      p: this.position.toArray(),
      q: this.base!.quaternion.toArray(),
      t: true,
    })
    // snap camera
    this.cam.position.copy(this.position)
    this.cam.position.y += this.camHeight
    if (hasRotation) this.cam.rotation.y = rotationY!
  }

  setEffect(effect: string, onEnd?: () => void) {
    if (this.data.effect === effect) return
    if (this.data.effect) {
      this.data.effect = undefined
      this.onEffectEnd?.()
      this.onEffectEnd = undefined
    }
    this.data.effect = { emote: effect }
    this.onEffectEnd = onEnd
    // send network update
    this.world.network.send('entityModified', {
      id: this.data.id,
      ef: effect,
    })
  }

  setSpeaking(speaking: boolean) {
    if (this.speaking === speaking) return
    this.speaking = speaking
  }

  push(force: THREE.Vector3) {
    if (this.capsule) {
      const pxForce = vector3ToPxVec3(force)
      if (pxForce) {
        this.capsule.addForce(pxForce, getPhysX()?.PxForceModeEnum?.eFORCE || 0, true)
      }
    }
  }

  setName(name: string) {
    this.modify({ name })
    this.world.network.send('entityModified', { id: this.data.id, name })
  }

  setSessionAvatar(avatar: string) {
    this.data.sessionAvatar = avatar
    this.applyAvatar()
    this.world.network.send('entityModified', {
      id: this.data.id,
      sessionAvatar: avatar,
    })
  }

  say(msg: string): void {
    this.nametag!.active = false
    this.bubbleText!.value = msg
    this.bubble!.active = true
    setTimeout(() => {
      this.bubble!.active = false
      this.nametag!.active = true
    }, 5000)
  }

  onNetworkData(data: Partial<NetworkData>): void {
    if (data.name) {
      this.nametag!.label = (data.name as string) || ''
    }

    if (data.health !== undefined) {
      this.nametag!.health = data.health as number
    }
  }

  // Handle system integration
  handleHealthChange(event: { playerId: string; health: number; maxHealth: number }): void {
    if (event.playerId === this.data.id) {
      this.nametag!.health = event.health
    }
  }

  handleTeleport(event: {
    playerId: string
    position: { x: number; y: number; z: number }
    rotationY?: number
  }): void {
    if (event.playerId === this.data.id) {
      const pos = new THREE.Vector3(event.position.x, event.position.y, event.position.z)
      this.teleport(pos, event.rotationY || 0)
    }
  }

  // Required System lifecycle methods
  override destroy(): void {
    if (this.capsule) {
      // Clean up physics
      if (this.capsuleHandle) {
        this.world.physics?.removeActor(this.capsule)
      }
    }

    if (this.avatar && this.avatar.deactivate) {
      this.avatar.deactivate()
    }

    if (this.base && this.base.deactivate) {
      this.base.deactivate()
    }

    super.destroy()
  }
}
