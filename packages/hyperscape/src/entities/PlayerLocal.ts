import type PhysX from '@hyperscape/physx-js-webidl'
import { Emotes } from '../extras/playerEmotes'
import { Layers } from '../extras/Layers'
import type { Player, PlayerHealth, PlayerStamina, Skills, PlayerEquipmentItems, PlayerCombatData, PlayerDeathData } from '../types/core'
import { createNode } from '../extras/createNode'
import THREE from '../extras/three'
import { Avatar, Nametag, UI, UIText, UIView } from '../nodes'
import { getPhysX, waitForPhysX } from '../PhysXManager'
import type { PhysicsHandle } from '../systems/Physics'
import { EventType } from '../types/events'
import { ClientLoader, ControlBinding, NetworkData } from '../types/index'
import type {
  ActorHandle,
  CameraSystem,
  HotReloadable,
  PlayerStickState,
  PlayerTouch,
  QuaternionLike,
  Vector3Like,
  XRSystem
} from '../types/physics'
import type { PxCapsuleGeometry, PxMaterial, PxRigidDynamic, PxShape, PxSphereGeometry } from '../types/physics'

import { vector3ToPxVec3 } from '../extras/vector3-utils'
import { cleanupPxVec3 } from '../physics/vector-conversions'
import { TerrainSystem } from '../systems/TerrainSystem'
import { getSystem } from '../utils/SystemUtils'
import type { World } from '../World'
import { Entity } from './Entity'

// Camera system accessor with strong type assumption
function getCameraSystem(world: World): CameraSystem | null {
  // Use unified client camera system only
  const sys = getSystem(world, 'client-camera-system')
  return (sys as unknown as CameraSystem) || null
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
  
  // Player interface implementation
  hyperscapePlayerId: string = '';
  alive: boolean = true;
  // Player interface properties (separate from Entity properties to avoid conflicts)
  private _playerHealth: PlayerHealth = { current: 100, max: 100 };
  stamina: PlayerStamina = { current: 100, max: 100 };
  skills: Skills = { 
    attack: { level: 1, xp: 0 }, 
    strength: { level: 1, xp: 0 }, 
    defense: { level: 1, xp: 0 }, 
    constitution: { level: 1, xp: 0 }, 
    ranged: { level: 1, xp: 0 },
    woodcutting: { level: 1, xp: 0 },
    fishing: { level: 1, xp: 0 },
    firemaking: { level: 1, xp: 0 },
    cooking: { level: 1, xp: 0 }
  };
  equipment: PlayerEquipmentItems = { weapon: null, shield: null, helmet: null, body: null, legs: null, arrows: null };
  inventory?: { items?: unknown[] } = { items: [] };
  coins: number = 0;
  combat: PlayerCombatData = { combatLevel: 1, combatStyle: 'attack', inCombat: false, combatTarget: null };
  stats?: { attack: number; strength: number; defense: number; constitution: number };
  death: PlayerDeathData = { respawnTime: 0, deathLocation: { x: 0, y: 0, z: 0 } };
  lastAction: string | null = null;
  lastSaveTime: number = Date.now();
  sessionId: string | null = null;
  
  /**
   * Get Player interface representation for compatibility with systems that expect Player
   */
  getPlayerData(): Player {
    return {
      id: this.id,
      hyperscapePlayerId: this.hyperscapePlayerId,
      name: this.data.name || 'Unknown Player',
      health: this._playerHealth,
      alive: this.alive,
      stamina: this.stamina,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      skills: this.skills,
      equipment: this.equipment,
      inventory: this.inventory,
      coins: this.coins,
      combat: this.combat,
      stats: this.stats,
      death: this.death,
      lastAction: this.lastAction,
      lastSaveTime: this.lastSaveTime,
      sessionId: this.sessionId,
      node: {
        position: this.position,
        quaternion: this.rotation
      },
      data: {
        id: this.data.id,
        name: this.data.name || 'Unknown Player',
        health: this.health,
        roles: this.data.roles,
        owner: this.data.owner,
        effect: this.data.effect
      },
      avatar: this.avatar,
      setPosition: this.setPosition.bind(this)
    };
  }
  
  // Bridge avatar between Entity (Avatar class) and Player interface
  get avatar(): { getHeight?: () => number; getHeadToHeight?: () => number; setEmote?: (emote: string) => void; getBoneTransform?: (boneName: string) => THREE.Matrix4 | null; } | undefined {
    if (!this._avatar) return undefined;
    
    return {
      getHeight: () => this._avatar?.getHeight() || 1.8,
      getHeadToHeight: () => this._avatar?.getHeadToHeight() || 1.6,
      setEmote: (emote: string) => this._avatar?.setEmote(emote),
      getBoneTransform: (boneName: string) => this._avatar?.getBoneTransform(boneName) || null
    };
  }
  
  // Internal avatar reference (rename existing avatar property)
  private _avatar?: Avatar;
  
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
  base: THREE.Group | null = null
  aura: THREE.Group | null = null
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
  private loadingAvatarUrl?: string

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
  clickMoveTarget: THREE.Vector3 | null = null

  constructor(
    world: World,
    data: NetworkData & { position?: [number, number, number]; avatarUrl?: string },
    local?: boolean
  ) {
    super(world, { ...data, type: 'player' }, local)
    this.isPlayer = true
    
    // Initialize Player interface properties
    this._playerHealth = { current: 100, max: 100 };
    this.hyperscapePlayerId = data.id || '';
  }

  async init(): Promise<void> {
    console.log('[PlayerLocal] Starting init...')
    
    // Make sure we're added to the world's entities
    if (!this.world.entities.has(this.id)) {
      console.warn('[PlayerLocal] Not in world entities, adding now...')
      this.world.entities.items.set(this.id, this)
    }
    
    // Register for physics updates
    this.world.setHot(this, true)
    console.log('[PlayerLocal] Registered for physics updates')
    
    // Verify we're actually in the hot set
    if ((this.world as any).hot?.has(this)) {
      console.log('[PlayerLocal] ✅ Confirmed in hot set for fixedUpdate')
    } else {
      console.error('[PlayerLocal] ❌ NOT in hot set - fixedUpdate will not be called!')
    }

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

    // Create a proper THREE.Group for the base (not a custom Node)
    // This ensures compatibility with Three.js scene graph
    this.base = new THREE.Group() as any
    if (this.base) {
      (this.base as any).name = 'player-base'
    }
    if (!this.base) {
      throw new Error('Failed to create base node for PlayerLocal')
    }

    // Base node starts at player's position to avoid initial camera looking underground

    // Get spawn position from world settings with terrain height checking
    const terrainSystem = this.world.systems.find(s => s.constructor.name === 'TerrainSystem') as
      | TerrainSystem
      | undefined
    let spawnX = 0
    let spawnY = 0.1
    let spawnZ = 0

    if ('spawn' in this.world.settings && Array.isArray(this.world.settings.spawn)) {
      const spawn = this.world.settings.spawn as number[]
      // Ensure spawn coordinates are valid numbers, not NaN
      spawnX = (typeof spawn[0] === 'number' && !isNaN(spawn[0])) ? spawn[0] : 0
      spawnY = (typeof spawn[1] === 'number' && !isNaN(spawn[1])) ? spawn[1] : 0.1
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
    // Ensure base node starts at player's position to avoid initial camera looking underground
    if (this.base) {
      this.base.position.set(spawnX, spawnY, spawnZ)
    }
    // Debug: blue cube above player for avatar/visual debugging, using Hyperscape Mesh node (not raw THREE)
    try {
      const debugCube = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshBasicMaterial({ color: 0x0000ff })
      )
      debugCube.position.set(0, 3, 0)
      this.base?.add(debugCube)
    } catch (_err) {
      // Non-fatal: debug cube is optional
    }
    if ('visible' in this.base) {
      Object.defineProperty(this.base, 'visible', { value: true, writable: true })
    }
    this.active = true

    // Store the calculated terrain position for physics initialization, ensure above ground plane
    const minY = 0.1
    this._terrainSpawnPosition = new THREE.Vector3(spawnX, Math.max(spawnY, minY), spawnZ)

    // Create a proper THREE.Group for the aura
    this.aura = new THREE.Group() as any
    if (this.aura) {
      (this.aura as any).name = 'player-aura'
    }
    if (!this.aura) {
      throw new Error('Failed to create aura node for PlayerLocal')
    }

    this.nametag = createNode('nametag', { label: '', health: this.data.health, active: false }) as Nametag
    if (!this.nametag) {
      throw new Error('Failed to create nametag node for PlayerLocal')
    }
    // Activate the nametag to create its THREE.js representation
    if (this.nametag.activate) {
      this.nametag.activate(this.world)
    }
    // Add the nametag's THREE.js object if it exists
    if ((this.nametag as any).instance && (this.nametag as any).instance.isObject3D) {
      this.aura.add((this.nametag as any).instance)
    }

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
    // Activate the bubble UI to create its THREE.js representation
    if (this.bubble.activate) {
      this.bubble.activate(this.world)
    }
    // Add the bubble's THREE.js object if it exists
    if ((this.bubble as any).instance && (this.bubble as any).instance.isObject3D) {
      this.aura.add((this.bubble as any).instance)
    }

    // THREE.Groups don't need activation, they're just containers
    // The custom nodes inside them (nametag, bubble) will activate themselves
    
    // CRITICAL: Add base to the scene so it's visible
    if (this.world.stage?.scene && this.base) {
      this.world.stage.scene.add(this.base)
      console.log('[PlayerLocal] Base added to scene')
      
      // Also add aura to base for nametag/bubble
      this.base.add(this.aura)
      console.log('[PlayerLocal] Aura added to base')
    } else {
      console.warn('[PlayerLocal] Could not add base to scene - stage not ready')
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

    await this.applyAvatar().catch(err => console.error('[PlayerLocal] Failed to apply avatar:', err))
    // initCapsule is now async, but we don't await it to avoid blocking init
    this.initCapsule().catch(err => {
      console.warn('[PlayerLocal] Failed to initialize capsule:', err)
    })
    this.initControl()

    // Initialize unified camera and movement systems
    this.initUnifiedSystems()

    // Ensure player starts clamped to ground when RPG is disabled and only core systems are active
    try {
      // Movement now handled by physics directly
      const movementSystem = null
      if (movementSystem) {
        // Trigger a small downward clamp by asking movement system to compute ground y
        const current = new THREE.Vector3(this.position.x, this.position.y, this.position.z)
        // Use camera system ground helper indirectly by emitting a fake click directly below
        // or simply adjust y slightly; movement system will later keep clamped during movement
        // Prefer PhysX raycast to clamp to ground; fall back to y=0 if needed
        const origin = new THREE.Vector3(current.x, current.y + 50, current.z)
        const direction = new THREE.Vector3(0, -1, 0)
        const mask = this.world.createLayerMask('environment')
        const hit = this.world.raycast(origin, direction, 200, mask)
        if (hit) {
          const y = hit.point.y + 0.1
          this.setPosition(current.x, y, current.z)
        } else {
          // Last resort: clamp to ground plane at y=0 just to avoid 0,0,0 collapses
          if (!Number.isFinite(this.position.y) || this.position.y < -1000 || this.position.y > 10000) {
            this.setPosition(current.x, 0.1, current.z)
          }
        }
      }
    } catch {}

    this.world.setHot(this, true)

    // Register with systems and establish integration
    this.world.emit(EventType.PLAYER_REGISTERED, { playerId: this.data.id })

    // Listen for system events to maintain integration
    this.world.on(EventType.PLAYER_HEALTH_UPDATED, this.handleHealthChange.bind(this))
    this.world.on(EventType.PLAYER_TELEPORT_REQUEST, this.handleTeleport.bind(this))

    console.log('[PlayerLocal] Init completed successfully')

    // Signal to UI that the world is ready
    this.world.emit(EventType.READY)
  }

  getAvatarUrl(): string {
    return this.data.sessionAvatar || this.data.avatar || 'asset://avatar.vrm'
  }

  async applyAvatar(): Promise<void> {
    const avatarUrl = this.getAvatarUrl()
    console.log(`[PlayerLocal] applyAvatar called - URL: ${avatarUrl}, current: ${this.avatarUrl}, hasAvatar: ${!!this._avatar}`)
    
    // If we already have the correct avatar loaded, just reuse it
    if (this.avatarUrl === avatarUrl && this._avatar) {
      console.log('[PlayerLocal] Avatar already loaded for URL:', avatarUrl)
      return
    }
    
    // Prevent concurrent loads for the same URL
    if (this.loadingAvatarUrl === avatarUrl) {
      console.log('[PlayerLocal] Avatar load already in progress for', avatarUrl)
      return
    }
    this.loadingAvatarUrl = avatarUrl
    
    // Only destroy if we're loading a different avatar
    if (this._avatar && this.avatarUrl !== avatarUrl) {
      const oldInstance = (this._avatar as any).instance
      console.log('[PlayerLocal] Destroying previous avatar instance for new URL')
      if (oldInstance && oldInstance.destroy) {
        oldInstance.destroy() // This calls hooks.scene.remove(vrm.scene)
      }
      this._avatar = undefined
    }
    
    // Only clear cache if we're loading a different avatar URL
    if (this.avatarUrl !== avatarUrl) {
    const loader = this.world.loader as ClientLoader
    if (loader) {
        // Clear cache for the old avatar URL only
        const oldKey = `avatar/${this.avatarUrl}`
        if (loader.promises.has(oldKey)) {
          console.log('[PlayerLocal] Clearing old avatar cache:', oldKey)
          loader.promises.delete(oldKey)
          loader.results.delete(oldKey)
        }
      }
    }

    await this.world.loader
      ?.load('avatar', avatarUrl)
      .then(async (src) => {
        // src is LoaderResult, which may be a Texture or an object with toNodes
        // We expect avatar loader to return an object with toNodes(): Map<string, Avatar>
        const isAvatarNodeMap = (v: unknown): v is { toNodes: () => Map<string, Avatar> } =>
          typeof v === 'object' && v !== null && 'toNodes' in v && typeof (v as { toNodes: unknown }).toNodes === 'function'
        if (!isAvatarNodeMap(src)) {
          throw new Error('Avatar loader did not return expected node map')
        }
        const avatarSrc = src
        console.log('[PlayerLocal] Avatar loaded, src type:', typeof avatarSrc, 'src:', avatarSrc)
        if (this._avatar && this._avatar.deactivate) {
          this._avatar.deactivate()
        }

        // Pass VRM hooks so the avatar can add itself to the scene
        const vrmHooks = {
          scene: this.world.stage.scene,
          octree: this.world.stage.octree,
          camera: this.world.camera,
          loader: this.world.loader
        }
        const nodeMap = (avatarSrc as { toNodes: (hooks?: unknown) => Map<string, Avatar> }).toNodes(vrmHooks)
        console.log('[PlayerLocal] NodeMap type:', nodeMap?.constructor?.name, 'keys:', nodeMap instanceof Map ? Array.from(nodeMap.keys()) : 'not a map')
        
        // Check if nodeMap is actually a Map
        if (!(nodeMap instanceof Map)) {
          throw new Error(`NodeMap is not a Map, got: ${nodeMap}`)
        }
        
        // Get the root node (which contains the avatar as a child)
        const rootNode = nodeMap.get('root')
        if (!rootNode) {
          throw new Error(`No root node found in loaded asset. Available keys: ${Array.from(nodeMap.keys())}`)
        }
        
        // The avatar node is a child of the root node or in the map directly
        const avatarNode = nodeMap.get('avatar') || ((rootNode as any).get ? (rootNode as any).get('avatar') : null)
        console.log('[PlayerLocal] Root node:', rootNode, 'Avatar node:', avatarNode)
        
        // Use the avatar node if we found it, otherwise try root
        const nodeToUse = avatarNode || rootNode
        if (!nodeToUse) {
          throw new Error('No avatar or root node found in loaded asset')
        }
        
        // Store the node - it's an Avatar node that needs mounting
        this._avatar = nodeToUse as any
        
        // IMPORTANT: For Avatar nodes to work, they need their context set and to be mounted
        if (this.base && nodeToUse) {
          // Set the context for the avatar node
          if ((nodeToUse as any).ctx !== this.world) {
            (nodeToUse as any).ctx = this.world
          }
          
          // Set the parent so the node knows where it belongs in the hierarchy
          (nodeToUse as any).parent = { matrixWorld: this.base.matrixWorld }
          
          // Activate the node (this creates the Three.js representation)
          if ((nodeToUse as any).activate) {
            (nodeToUse as any).activate(this.world)
            console.log('[PlayerLocal] Avatar node activated')
          }
          
          // Mount the avatar node to create its instance
          if ((nodeToUse as any).mount) {
            console.log('[PlayerLocal] Mounting avatar node...')
            await (nodeToUse as any).mount()
            console.log('[PlayerLocal] Avatar node mounted')
          }
          
          // After mounting, the avatar instance should be available
          // The instance manages its own scene internally - do NOT add raw.scene to base
          if ((nodeToUse as any).instance) {
            const instance = (nodeToUse as any).instance
            console.log('[PlayerLocal] Avatar instance structure:', {
              hasRaw: !!instance.raw,
              hasScene: !!(instance.raw && instance.raw.scene),
              rawKeys: instance.raw ? Object.keys(instance.raw) : []
            })
            
            // IMPORTANT: Do NOT add instance.raw.scene to base!
            // The instance manages its own scene and adding it creates a duplicate.
            // The instance.move() method will update the avatar's position.
            // The VRM factory handles adding/removing from world.stage.scene automatically.
          }
        }
        
        // Now the instance should be available
        if ((nodeToUse as any).instance) {
          const instance = (nodeToUse as any).instance
          console.log('[PlayerLocal] Avatar has instance after mounting:', instance)
          
          // The Avatar node handles its own Three.js representation
          // We don't need to manually add anything since the node is already added to base
          // Just ensure visibility and disable rate check
          
          // Disable rate check if available
          if (instance.disableRateCheck) {
            instance.disableRateCheck()
            console.log('[PlayerLocal] Avatar rate check disabled')
          }
          
          // Log instance properties for debugging
          if (instance.height) {
            console.log('[PlayerLocal] Avatar height:', instance.height)
          }
          if (instance.setEmote) {
            console.log('[PlayerLocal] Avatar has setEmote method')
          }
        } else {
          console.warn('[PlayerLocal] Avatar node has no instance after mounting')
        }
        // Avatar might be a custom Node, not a THREE.Object3D, so visibility might not exist
        const avatarVisible = (this._avatar as any).visible !== undefined ? (this._avatar as any).visible : 'N/A'
        console.log('[PlayerLocal] Avatar visible:', avatarVisible)
        console.log('[PlayerLocal] Base children count:', this.base && (this.base as any).children ? (this.base as any).children.length : 0)

        // Set up nametag and bubble positioning
        const headHeight = this._avatar && this._avatar.getHeadToHeight ? this._avatar.getHeadToHeight() : 1.8
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
        const avatarHeight = (this._avatar as { height?: number }).height
        this.camHeight = avatarHeight && !isNaN(avatarHeight) ? Math.max(1.2, avatarHeight * 0.9) : DEFAULT_CAM_HEIGHT

        // Make avatar visible and ensure proper positioning
        if (this._avatar) {
          if ('visible' in this._avatar) {
            ;(this._avatar as { visible: boolean }).visible = true
            console.log('[PlayerLocal] Avatar visibility set to true')
          }
          if (this._avatar && (this._avatar as any).position) {
            (this._avatar as any).position.set(0, 0, 0)
            console.log('[PlayerLocal] Avatar position reset to origin')
          }
          
          // Verify avatar instance is actually in the scene graph
          if (this._avatar && (this._avatar as any).instance) {
            const instance = (this._avatar as any).instance
            if (instance.raw && instance.raw.scene) {
              // The VRM scene is added directly to world.stage.scene by the factory
              let parent = instance.raw.scene.parent
              let depth = 0
              while (parent && depth < 10) {
                if (parent === this.world.stage?.scene) {
                  console.log(`[PlayerLocal] Avatar VRM scene IS in world scene at depth ${depth}`)
                  break
                }
                parent = parent.parent
                depth++
              }
              if (!parent || parent !== this.world.stage?.scene) {
                console.warn('[PlayerLocal] Avatar VRM scene NOT in world scene graph!')
              }
            }
          }
        }

        this.avatarUrl = avatarUrl

        // Emit avatar ready event for camera system
        this.world.emit(EventType.PLAYER_AVATAR_READY, {
          playerId: this.data.id,
          avatar: this._avatar,
          camHeight: this.camHeight,
        })
        // Ensure avatar starts at ground height (0) if terrain height is unavailable
        if (this._avatar && (this._avatar as any).position && isFinite((this._avatar as any).position.y)) {
          if ((this._avatar as any).position.y < 0) (this._avatar as any).position.y = 0
        }
        
        // Ensure a default idle animation is playing
        try {
          this.emote = this.emote || 'idle'
          if (this._avatar && (this._avatar as any).setEmote) (this._avatar as any).setEmote('idle')
        } catch {}

        // Emit camera follow event using core camera system
        const cameraSystem = getCameraSystem(this.world)
        if (cameraSystem) {
          this.world.emit(EventType.CAMERA_FOLLOW_PLAYER, {
            playerId: this.data.id,
            entity: this,
            camHeight: this.camHeight,
          })
          // Also set as camera target for immediate orbit control readiness
          this.world.emit(EventType.CAMERA_SET_TARGET, { target: this })
        }
      })
      .catch((err: Error) => {
        console.error('[PlayerLocal] Failed to load avatar:', err)
      })
      .finally(() => {
        this.loadingAvatarUrl = undefined
      })
  }

  private createFallbackAvatar(): void {
    try {
      // Create a minimal fallback avatar that implements the required Avatar interface
      // This is a temporary object used until the real avatar loads
      // Create a fallback avatar - go back to the simpler approach with proper typing
      const fallbackAvatar = new Avatar()

      this._avatar = fallbackAvatar
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
        avatar: this._avatar,
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
    
    // Set the player to the 'player' layer so it doesn't interfere with environment raycasts
    const playerLayer = Layers.player || { group: 0x4, mask: 0x6 }; // Default to bit 2 for player
    // word0 = player group, word1 = what can query the player (everything)
    const filterData = new PHYSX.PxFilterData(playerLayer.group, 0xFFFFFFFF, 0, 0);
    shape.setQueryFilterData(filterData);
    shape.setSimulationFilterData(filterData);
    
    console.log('[PlayerLocal] Capsule filter data - group:', playerLayer.group, 'mask:', playerLayer.mask);

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
        // Update both the entity position AND the base node position
        // This ensures the avatar (child of base) moves with physics
        const prevPos = this.position.clone()
        const moved = prevPos.distanceTo(position)
        if (moved > 0.01) {
          console.log(`[PlayerLocal] onInterpolate: Moved ${moved.toFixed(3)} from (${prevPos.x.toFixed(2)}, ${prevPos.z.toFixed(2)}) to (${position.x.toFixed(2)}, ${position.z.toFixed(2)})`)
        }
        if (this.base) {
          this.position.copy(position)
          this.base.position.copy(position)
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

    // Final ground clamp using PhysX raycast to prevent initial floating
    try {
      const origin = new THREE.Vector3(this.position.x, this.position.y + 100, this.position.z)
      const direction = new THREE.Vector3(0, -1, 0)
      const mask = this.world.createLayerMask('environment')
      const hit = this.world.raycast(origin, direction, 1000, mask)
      if (hit) {
        const desiredY = hit.point.y + 0.1
        // Update physics pose
        const pose = this.capsule.getGlobalPose()
        if (pose && pose.p) {
          pose.p.y = desiredY
          this.capsuleHandle?.snap(pose)
        }
        // Update visual/base position
        this.position.set(this.position.x, desiredY, this.position.z)
      }
    } catch {}
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
      // The camera target expects an object with a THREE.Vector3 position; the Entity already has node.position
      this.world.emit(EventType.CAMERA_SET_TARGET, { target: this })
    }

    // Movement now handled by physics directly in this class

    // Emit avatar ready event for camera height adjustment
    if (this._avatar) {
      this.world.emit(EventType.PLAYER_AVATAR_READY, {
        playerId: this.data.id,
        avatar: this._avatar,
        camHeight: this.camHeight,
      })
    }
  }

  // RuneScape-style run mode toggle (persists across movements)
  public runMode: boolean = true
  
  // Toggle between walk and run mode
  public toggleRunMode(): void {
    this.runMode = !this.runMode
    console.log(`[PlayerLocal] Run mode: ${this.runMode ? 'ON' : 'OFF'}`)
    // Update current movement if active
    if (this.moving) {
      this.running = this.runMode
    }
    // TODO: Update UI to show run/walk state
  }

  // Set click-to-move target and let physics handle the actual movement
  public setClickMoveTarget(target: { x: number; y: number; z: number } | null): void {
    console.log('[PlayerLocal] === setClickMoveTarget called ===')
    if (target) {
      // Always replace previous target immediately to avoid any alternation
      this.clickMoveTarget = null
      this.moving = false
      this.moveDir.set(0, 0, 0)

      // Ignore if target is effectively identical to current target
      // Now set new target directly
      console.log(`[PlayerLocal] Target: x=${target.x.toFixed(2)}, y=${target.y.toFixed(2)}, z=${target.z.toFixed(2)}`)
      console.log(`[PlayerLocal] Current position: x=${this.position.x.toFixed(2)}, y=${this.position.y.toFixed(2)}, z=${this.position.z.toFixed(2)}`)
      console.log(`[PlayerLocal] Base position: x=${this.base?.position.x.toFixed(2)}, y=${this.base?.position.y.toFixed(2)}, z=${this.base?.position.z.toFixed(2)}`)
      this.clickMoveTarget = new THREE.Vector3(target.x, target.y, target.z)
      // Use the current run mode setting
      this.running = this.runMode
      console.log(`[PlayerLocal] Mode: ${this.runMode ? 'RUN' : 'WALK'}`)
      console.log(`[PlayerLocal] Target set successfully`)
    } else {
      console.log('[PlayerLocal] Clearing target')
      this.clickMoveTarget = null
      this.moveDir.set(0, 0, 0)
      this.moving = false
      // Don't reset running - it follows runMode
    }
  }

  // Ensure external position updates keep physics capsule in sync
  public override setPosition(posOrX: { x: number; y: number; z: number } | number, y?: number, z?: number): void {
    const newX = typeof posOrX === 'object' ? posOrX.x : (posOrX as number)
    const newY = typeof posOrX === 'object' ? posOrX.y : (y as number)
    const newZ = typeof posOrX === 'object' ? posOrX.z : (z as number)

    // Apply to entity position
    super.setPosition(newX, newY, newZ)
    
    // CRITICAL: Also update base node position so avatar follows
    if (this.base) {
      this.base.position.set(newX, newY, newZ)
    }

    // Snap physics capsule to match to avoid interpolation snapping back
    if (this.capsule) {
      const pose = this.capsule.getGlobalPose()
      if (pose && pose.p) {
        pose.p.x = newX
        pose.p.y = newY
        pose.p.z = newZ
        if (this.capsuleHandle && 'snap' in this.capsuleHandle && typeof this.capsuleHandle.snap === 'function') {
          this.capsuleHandle.snap(pose)
        } else {
          this.capsule.setGlobalPose(pose)
        }
      }
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
      // Don't warn every frame, it's normal during initialization
      return
    }
    
    // Sync base position with entity position at start of physics update
    // This ensures avatar stays attached to player
    if (this.base && !this.position.equals(this.base.position)) {
      this.base.position.copy(this.position)
    }

    const anchor = this.getAnchorMatrix()
    const snare = this.data.effect?.snare || 0

    if (anchor && !this.capsuleDisabled) {
      const PHYSX = getPhysX()
      if (PHYSX) {
        this.capsule!.setActorFlag(PHYSX.PxActorFlagEnum.eDISABLE_SIMULATION, true)
        console.warn('[PlayerLocal] Capsule DISABLED due to anchor effect')
      }
      this.capsuleDisabled = true
    }
    if (!anchor && this.capsuleDisabled) {
      const PHYSX = getPhysX()
      if (PHYSX) {
        this.capsule!.setActorFlag(PHYSX.PxActorFlagEnum.eDISABLE_SIMULATION, false)
        console.log('[PlayerLocal] Capsule RE-ENABLED')
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
        // origin.y += 0.2
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
        // move with platform, only when kinematic/dynamic (not static ground)
        if (
          this.platform.actor &&
          'getGlobalPose' in this.platform.actor &&
          typeof this.platform.actor.getGlobalPose === 'function'
        ) {
          const PHYSX = getPhysX()
          const actor = this.platform.actor
          const isStatic = PHYSX && actor instanceof PHYSX.PxRigidStatic
          const isKinematic = PHYSX && actor && 'getRigidBodyFlags' in actor && typeof actor.getRigidBodyFlags === 'function'
            ? (() => {
                const flags = actor.getRigidBodyFlags()
                return flags && typeof flags === 'object' && 'isSet' in flags && typeof flags.isSet === 'function'
                  ? flags.isSet(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC)
                  : false
              })()
            : false
          // CRITICAL FIX: Only apply platform movement for actual moving platforms (kinematic)
          // Static ground should NOT apply any rotation transforms
          if (!isStatic && isKinematic) {
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
      // Increase drag when we're close to target for better stopping
      const baseDrag = this.clickMoveTarget && this.position.distanceTo(this.clickMoveTarget) < 2.0 ? 15 : 10
      const dragCoeff = baseDrag * delta
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
        let moveSpeed = (this.running ? 10 : 6) * this.mass // tuned speed
        moveSpeed *= 1 - snare
        const upVec = new THREE.Vector3(0, 1, 0)
        const groundVec = new THREE.Vector3(this.groundNormal.x, this.groundNormal.y, this.groundNormal.z)
        const slopeRotation = q1.setFromUnitVectors(upVec, groundVec)
        const moveForce = v1.copy(this.moveDir).multiplyScalar(moveSpeed * 10).applyQuaternion(slopeRotation) // prettier-ignore
        
        // Clamp to terrain if not grounded
        const terrainSystem = this.world.getSystem('terrain') as { getHeightAt?: (x: number, z: number) => number };
        if (!this.grounded && terrainSystem?.getHeightAt && this.capsule) {
          const terrainHeight = terrainSystem.getHeightAt(this.position.x, this.position.z);
          const playerGroundY = this.position.y - 1.8; // Account for player height
          
          // If player is below terrain, apply upward force
          if (playerGroundY < terrainHeight - 0.5) {
            const upwardForce = (terrainHeight - playerGroundY) * 50;
            moveForce.y += upwardForce;
            console.log(`[PlayerLocal] Applying terrain clamping force: ${upwardForce.toFixed(2)}`);
          }
        }
        
        // Log force application periodically
        if (Math.random() < 0.05) { // Log ~5% of physics frames
          console.log(`[PlayerLocal] Physics Force: dir=(${this.moveDir.x.toFixed(2)}, ${this.moveDir.z.toFixed(2)}), force=(${moveForce.x.toFixed(1)}, ${moveForce.z.toFixed(1)}), grounded=${this.grounded}`)
          const velocity = this.capsule!.getLinearVelocity()
          if (velocity) {
            console.log(`[PlayerLocal] Velocity: (${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)})`)
          }
        }
        
        const PHYSX = getPhysX()
        const pxMoveForce = vector3ToPxVec3(moveForce)
        if (pxMoveForce) {
          this.capsule!.addForce(pxMoveForce, PHYSX?.PxForceModeEnum?.eFORCE || 0, true)
        } else {
          console.warn('[PlayerLocal] Failed to convert move force to PhysX vector!')
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
    if(!this.capsule) return;
    
    // Rotation validation - track rotation at start of update
    const rotationBefore = this.base ? this.base.quaternion.clone() : null;
      const pose = this.capsule.getGlobalPose()
      if (pose && pose.p) {
        const physicsPos = new THREE.Vector3(pose.p.x, pose.p.y, pose.p.z)
        const prevPos = this.position.clone()
        const moved = prevPos.distanceTo(physicsPos)
        
        // Update entity position from physics
        this.position.copy(physicsPos)
        
        // Also update base position so avatar follows
        if (this.base) {
          this.base.position.copy(physicsPos)
        }
        
        // Log significant movement
        if (moved > 0.01) {
          console.log(`[PlayerLocal] Position updated from physics: moved ${moved.toFixed(3)} to (${physicsPos.x.toFixed(2)}, ${physicsPos.y.toFixed(2)}, ${physicsPos.z.toFixed(2)})`)
        }
        
        // Update avatar instance position from base transform
        // NOTE: This is required because the VRM factory doesn't automatically track the base node
        const avatarNode = this._avatar as any
        if (avatarNode && avatarNode.instance) {
          const instance = avatarNode.instance
          if (instance && typeof instance.move === 'function' && this.base) {
            // Ensure base matrices are up-to-date
            this.base.updateMatrix()
            this.base.updateMatrixWorld(true)
            // Move the avatar to match the base transform
            instance.move(this.base.matrixWorld)
          }
          // Call update for animation updates (mixer, skeleton, etc)
          if (instance && typeof instance.update === 'function') {
            instance.update(delta)
          }
        }
      }
    
        // RuneScape-style point-and-click movement only
    if (this.clickMoveTarget) {
      // Update target Y to match terrain height at target position (strict: no fallback)
      const terrainSystem = this.world.getSystem('terrain') as { getHeightAt?: (x: number, z: number) => number };
      if (!terrainSystem || typeof terrainSystem.getHeightAt !== 'function') {
        throw new Error('[PlayerLocal] TerrainSystem.getHeightAt unavailable when setting clickMoveTarget');
      }
      const targetHeight = terrainSystem.getHeightAt(this.clickMoveTarget.x, this.clickMoveTarget.z);
      if (!Number.isFinite(targetHeight)) {
        throw new Error(`[PlayerLocal] Invalid terrain height for target (${this.clickMoveTarget.x.toFixed(2)}, ${this.clickMoveTarget.z.toFixed(2)})`);
      }
      this.clickMoveTarget.y = (targetHeight as number) + 0.1;
      
      // Use horizontal (XZ) distance to determine arrival to avoid Y mismatches
      const dx = this.position.x - this.clickMoveTarget.x;
      const dz = this.position.z - this.clickMoveTarget.z;
      const distanceXZ = Math.sqrt(dx * dx + dz * dz);
      
      // Check if we've reached the target
      const velocity = this.capsule?.getLinearVelocity()
      const speed = velocity ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) : 0
      
      // Stop if we're very close
      // OR if we're somewhat close AND we've been moving but are now slow (to avoid oscillation)
      // Don't stop if we haven't started moving yet (speed near 0 but not at target)
      if (distanceXZ < 0.3 || (distanceXZ < 0.8 && speed < 0.2 && this.moving)) {
        console.log('[PlayerLocal] === REACHED DESTINATION ===')
        console.log(`[PlayerLocal] Final position: (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)})`)
        console.log(`[PlayerLocal] Target was: (${this.clickMoveTarget.x.toFixed(2)}, ${this.clickMoveTarget.y.toFixed(2)}, ${this.clickMoveTarget.z.toFixed(2)})`)
        console.log(`[PlayerLocal] DistanceXZ: ${distanceXZ.toFixed(2)}, Speed: ${speed.toFixed(2)}`)
        
        // IMPORTANT: Preserve the final rotation before clearing movement state
        // This prevents the avatar from rotating back after movement completes
        if (this.base && this.lastState.q) {
          this.lastState.q.copy(this.base.quaternion)
          // Also ensure node quaternion stays aligned
          this.node.quaternion.copy(this.base.quaternion)
        }
        
        this.clickMoveTarget = null
        this.moving = false
        this.moveDir.set(0, 0, 0) // Clear move direction to prevent residual rotation
        
        // Zero out horizontal velocity AND lock rotation until next movement target
        if (velocity && this.capsule) {
          velocity.x = 0
          velocity.z = 0
          this.capsule.setLinearVelocity(velocity)
        }
        // Clear moveDir to prevent any residual facing updates
        this.moveDir.set(0, 0, 0)
      } else if (distanceXZ < 1.0) {
        // Getting close - apply proportional braking
        const direction = new THREE.Vector3()
          .subVectors(this.clickMoveTarget, this.position)
        direction.y = 0
        direction.normalize()
        
        // Scale movement force based on distance (closer = less force)
        const scaleFactor = Math.max(0.1, distanceXZ / 2.0)
        direction.multiplyScalar(scaleFactor)
        this.moveDir.copy(direction)
        this.moving = true
        this.running = false  // Walk when close
      } else {
        // Calculate movement direction toward target
        const direction = new THREE.Vector3()
          .subVectors(this.clickMoveTarget, this.position)
        direction.y = 0 // Keep movement horizontal
        direction.normalize()
        
        // Set move direction for physics to use in fixedUpdate
        this.moveDir.copy(direction)
        this.moving = true
        // Always use the persistent runMode setting
        this.running = this.runMode
        
        // Clamp player strictly to terrain height while moving (no fallback)
        if (this.capsule) {
          const terrainSystemMove = this.world.getSystem('terrain') as { getHeightAt?: (x: number, z: number) => number };
          if (!terrainSystemMove || typeof terrainSystemMove.getHeightAt !== 'function') {
            throw new Error('[PlayerLocal] TerrainSystem.getHeightAt unavailable during movement');
          }
          const h = terrainSystemMove.getHeightAt(this.position.x, this.position.z);
          if (!Number.isFinite(h)) {
            throw new Error(`[PlayerLocal] Invalid terrain height during movement at (${this.position.x.toFixed(2)}, ${this.position.z.toFixed(2)})`);
          }
          const desiredY = (h as number) + 0.1;
          const yDelta = desiredY - this.position.y;
          if (Math.abs(yDelta) > 0.2) {
            const pose = this.capsule.getGlobalPose();
            if (pose && pose.p) {
              pose.p.y = desiredY;
              this.capsuleHandle?.snap(pose);
              this.position.y = desiredY;
            }
            const vel = this.capsule.getLinearVelocity();
            if (vel) {
              vel.y = 0;
              this.capsule.setLinearVelocity(vel);
            }
          }
        }
        
        // Log movement state (but not every frame)
        if (Math.random() < 0.02) { // Log ~2% of frames
          console.log(`[PlayerLocal] Moving: distanceXZ=${distanceXZ.toFixed(2)}, target=(${this.clickMoveTarget.x.toFixed(2)}, ${this.clickMoveTarget.z.toFixed(2)}), pos=(${this.position.x.toFixed(2)}, ${this.position.z.toFixed(2)}), dir=(${direction.x.toFixed(2)}, ${direction.z.toFixed(2)})`)
        }
      }
    } // End of clickMoveTarget check


    // Update animation state based on movement (RuneScape style - no jump/fall)
    let newEmote = 'idle'; // Default to idle
    
    if (this.moving) {
      // We're moving - choose walk or run animation
      newEmote = this.running ? 'run' : 'walk';
      console.log(`[PlayerLocal] Moving detected - setting emote to: ${newEmote}`)
      
      // Rotate base (and thus avatar) to face movement direction ONLY while actively moving
      // Important: Check this.moving instead of moveDir.length() to prevent rotation after stopping
      if (this.base && this.moving && this.moveDir.length() > 0) {
        const forward = new THREE.Vector3(0, 0, -1)
        const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(forward, this.moveDir.normalize())
        
        // Only rotate if angle delta is meaningful to reduce tiny jitter
        const dot = this.base.quaternion.clone().dot(targetQuaternion)
        const angle = 2 * Math.acos(Math.min(1, Math.max(-1, Math.abs(dot))))
        
        // Increased threshold to 0.02 radians (~1 degree) to reduce micro-jitter
        if (angle > 0.02) {
          // Smoother rotation with reduced speed to prevent shaking
          // Using 0.03 for very smooth turns (was 0.06)
          this.base.quaternion.slerp(targetQuaternion, 0.03)
          
          // Sync lastState and node quaternion to prevent fighting
          this.lastState.q?.copy(this.base.quaternion)
          this.node.quaternion.copy(this.base.quaternion)
        }
      }
    } else {
      // Not moving - use idle animation
      newEmote = 'idle';
      // Do not enforce any rotation while idle to avoid fighting other systems
    }
    
    // Only update emote if it changed to avoid animation restarts
    if (this.emote !== newEmote) {
      this.emote = newEmote;
      console.log(`[PlayerLocal] Animation state changed to: ${newEmote}`);
    }

    // Apply emote animation to avatar
    if (this._avatar) {
      // Check if it's an Avatar node with emote property
      if ((this._avatar as any).emote !== undefined) {
        // Map emote state names to Emotes URLs
        const emoteMap: Record<string, string> = {
          'idle': Emotes.IDLE,
          'walk': Emotes.WALK,
          'run': Emotes.RUN,
          'float': Emotes.FLOAT,
          'fall': Emotes.FALL,
          'flip': Emotes.FLIP,
          'talk': Emotes.TALK
        };
        
        const emoteUrl = emoteMap[this.emote] || Emotes.IDLE;
        // Set the emote on the Avatar node (it will pass it to its instance)
        (this._avatar as any).emote = emoteUrl;
      } else if ((this._avatar as any).setEmote) {
        // Fallback for direct setEmote method
        const emoteMap: Record<string, string> = {
          'idle': Emotes.IDLE,
          'walk': Emotes.WALK,
          'run': Emotes.RUN,
          'float': Emotes.FLOAT,
          'fall': Emotes.FALL,
          'flip': Emotes.FLIP,
          'talk': Emotes.TALK
        };
        
        const emoteUrl = emoteMap[this.emote] || Emotes.IDLE;
        (this._avatar as any).setEmote(emoteUrl);
      }
    }
    
    // Ensure player remains grounded while idle
    if (!this.moving && this.capsule) {
      const terrainSystemIdle = this.world.getSystem('terrain') as { getHeightAt?: (x: number, z: number) => number };
      if (!terrainSystemIdle || typeof terrainSystemIdle.getHeightAt !== 'function') {
        throw new Error('[PlayerLocal] TerrainSystem.getHeightAt unavailable while idle');
      }
      const hIdle = terrainSystemIdle.getHeightAt(this.position.x, this.position.z);
      if (!Number.isFinite(hIdle)) {
        throw new Error(`[PlayerLocal] Invalid terrain height while idle at (${this.position.x.toFixed(2)}, ${this.position.z.toFixed(2)})`);
      }
      const groundY = (hIdle as number) + 0.1;
      if (Math.abs(this.position.y - groundY) > 0.2) {
        const pose = this.capsule.getGlobalPose();
        if (pose && pose.p) {
          pose.p.y = groundY;
          this.capsuleHandle?.snap(pose);
          this.position.y = groundY;
        }
      }
    }

    // Skip rotation validation/forcing to avoid fighting legitimate updates while idle

    // Send network updates if needed
    this.sendNetworkUpdate()
  }

  sendNetworkUpdate(): void {
    // Initialize lastState if needed
    if (!this.lastState.p) {
      this.lastState.p = new THREE.Vector3().copy(this.position)
    }
    if (!this.lastState.q) {
      this.lastState.q = new THREE.Quaternion().copy(this.base?.quaternion || this.rotation)
    }
    if (!this.lastState.e) {
      this.lastState.e = this.emote || 'idle'
    }

    // Create network data object with proper type
    const data: Partial<NetworkData> = {
      id: this.data.id,
    }

    let hasChanges = false

    // Check for position changes
    if (!this.lastState.p.equals(this.position)) {
      data.p = this.position.toArray() as [number, number, number]
      this.lastState.p.copy(this.position)
      hasChanges = true
    }

    // Check for quaternion changes
    if (this.base && !this.lastState.q.equals(this.base.quaternion)) {
      data.q = this.base.quaternion.toArray() as [number, number, number, number]
      this.lastState.q.copy(this.base.quaternion)
      hasChanges = true
    }

    // Check for emote changes
    if (this.lastState.e !== this.emote) {
      data.e = this.emote
      this.lastState.e = this.emote || 'idle'
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
      // Only apply anchor in XR mode - in normal gameplay, anchor should not override rotation
      if (isXR) {
        console.warn('[PlayerLocal] XR Anchor is overriding rotation in lateUpdate!')
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
    }
    if (this._avatar) {
      if (this._avatar.getBoneTransform) {
        const matrix = this._avatar.getBoneTransform('head')
        if (matrix && this.aura) {
          this.aura.position.setFromMatrixPosition(matrix)
        }
      }
    }
  }

  postLateUpdate(_delta: number): void {
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
    if (hasRotation && this.base) {
      // Apply yaw in quaternion space to base and keep node aligned
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY!)
      this.base.quaternion.copy(yawQuat)
      this.node.quaternion.copy(this.base.quaternion)
    }
    // send network update
    this.world.network.send('entityModified', {
      id: this.data.id,
      p: this.position.toArray(),
      q: this.base!.quaternion.toArray(),
      t: true,
    })
    // Camera is owned by the ClientCameraSystem; avoid direct camera snapping here to prevent jitter
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
    this.applyAvatar().catch(err => console.error('[PlayerLocal] Failed to apply avatar:', err))
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

    if (this._avatar && this._avatar.deactivate) {
      this._avatar.deactivate()
    }

    if (this.base && this.base.deactivate) {
      this.base.deactivate()
    }

    super.destroy()
  }
}
