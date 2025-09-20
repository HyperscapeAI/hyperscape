import type PhysX from '@hyperscape/physx-js-webidl'
import { createNode } from '../extras/createNode'
import { Layers } from '../extras/Layers'
import { Emotes } from '../extras/playerEmotes'
import THREE from '../extras/three'
import { Avatar, Nametag, UI, UIText, UIView } from '../nodes'
import { getPhysX, waitForPhysX } from '../PhysXManager'
import type { PhysicsHandle } from '../systems/Physics'
import type { TerrainSystem } from '../systems/TerrainSystem'
import type { Player, PlayerCombatData, PlayerDeathData, PlayerEquipmentItems, PlayerHealth, PlayerStamina, Skills } from '../types/core'
import { EventType } from '../types/events'
import { ClientLoader, ControlBinding, NetworkData } from '../types/index'
import type {
  ActorHandle,
  CameraSystem,
  HotReloadable,
  PlayerStickState,
  PlayerTouch,
  PxCapsuleGeometry, PxMaterial, PxRigidDynamic, PxShape, PxSphereGeometry,
  QuaternionLike,
  Vector3Like,
  XRSystem
} from '../types/physics'

import { vector3ToPxVec3 } from '../extras/vector3-utils'
import { getSystem } from '../utils/SystemUtils'
import type { World } from '../World'
import { Entity } from './Entity'

const UP = new THREE.Vector3(0, 1, 0)

interface NodeWithInstance extends THREE.Object3D {
  instance?: THREE.Object3D
  activate?: (world: World) => void
}

interface GroupNode extends THREE.Group {
  children: THREE.Object3D[]
}

interface AvatarInstance {
  destroy(): void
  move(matrix: THREE.Matrix4): void
  update(delta: number): void
  raw: {
    scene: THREE.Object3D
  }
  disableRateCheck?: () => void
  height?: number
  setEmote?: (emote: string) => void
}

interface AvatarNode {
  instance: AvatarInstance | null
  mount?: () => Promise<void>
  position: THREE.Vector3
  visible: boolean
  emote?: string
  setEmote?: (emote: string) => void
  ctx: World
  parent: { matrixWorld: THREE.Matrix4 }
  activate(world: World): void
  getHeight?: () => number
  getHeadToHeight?: () => number
  getBoneTransform?: (boneName: string) => THREE.Matrix4 | null
  deactivate?: () => void
}

// Camera system accessor with strong type assumption
function getCameraSystem(world: World): CameraSystem | null {
  // Use unified client camera system only
  const sys = getSystem(world, 'client-camera-system')
  return (sys as unknown as CameraSystem) || null
}

// Hyperscape-specific object types using the imported interface

// PhysX is available via getPhysX() from PhysXManager

const _UP = new THREE.Vector3(0, 1, 0)
const _DOWN = new THREE.Vector3(0, -1, 0)
const _FORWARD = new THREE.Vector3(0, 0, -1)
// Removed unused constant: BACKWARD
const _SCALE_IDENTITY = new THREE.Vector3(1, 1, 1)
// Removed unused constant: POINTER_LOOK_SPEED
// Removed unused constant: PAN_LOOK_SPEED
// Removed unused constant: ZOOM_SPEED
// Removed unused constant: MIN_ZOOM
// Removed unused constant: MAX_ZOOM
// Removed unused constant: STICK_MAX_DISTANCE
const DEFAULT_CAM_HEIGHT = 1.2

// Utility function for roles check
function hasRole(roles: unknown, role: string): boolean {
  if (!Array.isArray(roles)) return false
  return roles.includes(role)
}

// Constants for common game values
const DEG2RAD = Math.PI / 180
const _RAD2DEG = 180 / Math.PI

// Constants for control priorities
const ControlPriorities = {
  PLAYER: 1000,
}

// Removed unused constant: Emotes

// Physics layers utility
function _getPhysicsLayers() {
  return {
    environment: { group: 1, mask: 0xffffffff },
    player: { group: 2, mask: 0xffffffff },
    prop: { group: 4, mask: 0xffffffff },
  }
}

// Utility functions for PhysX transform operations
function _safePhysXTransform(vector: THREE.Vector3 | THREE.Quaternion, transform: PhysX.PxTransform): void {
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
function _safeMatrixCompose(
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
function _safeMatrixDecompose(
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
const _v2 = new THREE.Vector3()
const v3 = new THREE.Vector3()
const _v4 = new THREE.Vector3()
const _v5 = new THREE.Vector3()
const _v6 = new THREE.Vector3()
const _e1 = new THREE.Euler(0, 0, 0, 'YXZ')
const q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _q3 = new THREE.Quaternion()
const _q4 = new THREE.Quaternion()
const _m1 = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _m3 = new THREE.Matrix4()

// Removed unused interface: PlayerState

export class PlayerLocal extends Entity implements HotReloadable {
  private avatarDebugLogged: boolean = false;
  // RS3-style run energy
  public stamina: number = 100
  // Tunable RS-style stamina rates (percent per second). Adjust to match desired feel exactly.
  private readonly staminaDrainPerSecond: number = 2   // drain while running
  private readonly staminaRegenWhileWalkingPerSecond: number = 2 // regen while walking
  private readonly staminaRegenPerSecond: number = 4  // regen while idle
  // Implement HotReloadable interface
  hotReload?(): void {
    // Implementation for hot reload functionality
  }
  
  // Player interface implementation
  hyperscapePlayerId: string = '';
  alive: boolean = true;
  // Player interface properties (separate from Entity properties to avoid conflicts)
  private _playerHealth: PlayerHealth = { current: 100, max: 100 };
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
      stamina: { current: this.stamina, max: 100 },
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
        id: this.data.id as string,
        name: (this.data.name as string) || 'Unknown Player',
        health: this.health,
        roles: this.data.roles as string[] | undefined,
        owner: this.data.owner as string | undefined,
        effect: this.data.effect,
      },
      avatar: this.avatar,
      setPosition: this.setPosition.bind(this)
    };
  }
  
  // Bridge avatar between Entity (Avatar class) and Player interface
  get avatar(): { getHeight?: () => number; getHeadToHeight?: () => number; setEmote?: (emote: string) => void; getBoneTransform?: (boneName: string) => THREE.Matrix4 | null; } | undefined {
    if (!this._avatar) return undefined;
    
    return {
      getHeight: () => (this._avatar && this._avatar.getHeight) ? this._avatar.getHeight() : 1.8,
      getHeadToHeight: () => (this._avatar && this._avatar.getHeadToHeight) ? this._avatar.getHeadToHeight() : 1.6,
      setEmote: (emote: string) => { if (this._avatar && this._avatar.setEmote) this._avatar.setEmote(emote); },
      getBoneTransform: (boneName: string) => (this._avatar && this._avatar.getBoneTransform) ? this._avatar.getBoneTransform(boneName) : null
    };
  }
  
  // Internal avatar reference (rename existing avatar property)
  private _avatar?: AvatarNode;
  
  isPlayer: boolean
  // Explicit local flag for tests and systems that distinguish local vs remote
  isLocal: boolean = true
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
  onEffectEnd?: () => void
  lastState: {
    p?: THREE.Vector3
    q?: THREE.Quaternion
    e?: string
  } = {}
  // Track last interpolation frame to avoid duplicate transform writes per frame
  private lastInterpolatedFrame: number = -1
  emote?: string
  effect?: string
  running: boolean = false
  rotSpeed: number = 5
  clickMoveTarget: THREE.Vector3 | null = null
  serverPosition: THREE.Vector3  // Track server's authoritative position - NEVER undefined
  lastServerUpdate: number = 0    // Time of last server position update
  private positionValidationInterval?: NodeJS.Timeout
  // Add pendingMoves array
  private pendingMoves: { seq: number; pos: THREE.Vector3 }[] = [];
  private _tempVec3 = new THREE.Vector3();
  
  // Avatar retry mechanism
  private avatarRetryInterval: NodeJS.Timeout | null = null;
  // Add predictedStates array
  // In update: predict physics, push to predictedStates
  // On server correction: pop matched, smooth to correct if mismatch > threshold

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
    
    // CRITICAL: Initialize server position BEFORE anything else
    // Server position is ABSOLUTE TRUTH - use it or crash
    if (data.position && Array.isArray(data.position) && data.position.length === 3) {
      this.serverPosition = new THREE.Vector3(data.position[0], data.position[1], data.position[2]);
      // IMMEDIATELY set our position to server position
      this.position.set(data.position[0], data.position[1], data.position[2]);
      this.node.position.set(data.position[0], data.position[1], data.position[2]);
      
      // CRASH if Y position is invalid at spawn
      if (data.position[1] < -5) {
        throw new Error(`[PlayerLocal] FATAL: Spawning below terrain at Y=${data.position[1]}! Server sent invalid spawn position.`);
      }
      if (data.position[1] > 200) {
        throw new Error(`[PlayerLocal] FATAL: Spawning too high at Y=${data.position[1]}! Server sent invalid spawn position.`);
      }
      
      // Warn for suspicious but not fatal positions
      if (data.position[1] < 0 || data.position[1] > 100) {
        console.warn(`[PlayerLocal] WARNING: Starting with unusual Y position: ${data.position[1]}`);
      }
    } else {
      // NO DEFAULT Y=0 ALLOWED - crash if no position
      throw new Error('[PlayerLocal] FATAL: No server position provided in constructor! This will cause Y=0 spawn bug.');
    }
    
    this.lastServerUpdate = performance.now();
    console.log('[PlayerLocal] ✅ Initialized at server position:', this.serverPosition);
    
    // Start aggressive position validation
    this.startPositionValidation();
  }
  
  private startPositionValidation(): void {
    // Validate position every 100ms initially, then slower
    let checkCount = 0;
    this.positionValidationInterval = setInterval(() => {
      checkCount++;
      
      // Call terrain validation more frequently in first 5 seconds
      if (checkCount < 50) { // 50 * 100ms = 5 seconds
        this.validateTerrainPosition();
      } else if (checkCount % 5 === 0) { // Then every 500ms
        this.validateTerrainPosition();
      }
      // HARD CRASH if player is falling (Y position too low)
      if (this.position.y < -10) {
        const errorDetails = {
          clientPosition: {
            x: this.position.x.toFixed(2),
            y: this.position.y.toFixed(2),
            z: this.position.z.toFixed(2)
          },
          serverPosition: this.serverPosition ? {
            x: this.serverPosition.x.toFixed(2),
            y: this.serverPosition.y.toFixed(2),
            z: this.serverPosition.z.toFixed(2)
          } : 'null',
          basePosition: this.base ? {
            x: this.base.position.x.toFixed(2),
            y: this.base.position.y.toFixed(2),
            z: this.base.position.z.toFixed(2)
          } : 'null',
          hasCapsule: !!this.capsule,
          playerId: this.id,
          timestamp: new Date().toISOString()
        };
        
        console.error('[PlayerLocal] FATAL: PLAYER HAS FALLEN BELOW TERRAIN!');
        console.error('[PlayerLocal] Error details:', errorDetails);
        
        // Clear the interval before throwing
        clearInterval(this.positionValidationInterval);
        
        // CRASH THE APPLICATION
        throw new Error(`[PlayerLocal] FATAL: Player has fallen below terrain at Y=${this.position.y.toFixed(2)}! This indicates a critical movement system failure.\n\nDebug info:\n${JSON.stringify(errorDetails, null, 2)}`);
      }
      
      // Also crash if Y is unreasonably high
      if (this.position.y > 200) {
        const errorDetails = {
          clientY: this.position.y.toFixed(2),
          serverY: this.serverPosition?.y?.toFixed(2) || 'N/A',
          playerId: this.id
        };
        
        clearInterval(this.positionValidationInterval);
        throw new Error(`[PlayerLocal] FATAL: Player is too high at Y=${this.position.y.toFixed(2)}!\n\nDebug: ${JSON.stringify(errorDetails)}`);
      }
      
      // Log Y position periodically for debugging
      // Commented out verbose Y position logging
      // if (Math.abs(this.position.y) > 5) {
      //   console.log(`[PlayerLocal] Y position check: ${this.position.y.toFixed(2)} (server: ${this.serverPosition?.y?.toFixed(2) || 'N/A'})`);
      // }
      
      // Check for large divergence from server
      if (this.serverPosition) {
        const dist = this.position.distanceTo(this.serverPosition);
        if (dist > 100) {
          console.warn('[PlayerLocal] WARNING: Very large divergence detected, snapping to server.', {
            client: this.position,
            server: this.serverPosition,
            distance: dist
          });
          // Snap to server position
          this.position.copy(this.serverPosition);
          // Don't set base.position since it's a child of node (relative position should be 0,0,0)
          if (this.capsule && getPhysX()) {
            const PHYSX = getPhysX()!;
            const pose = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity);
            pose.p.x = this.serverPosition.x;
            pose.p.y = this.serverPosition.y;
            pose.p.z = this.serverPosition.z;
            this.capsule.setGlobalPose(pose);
          }
        }
      }
    }, 100); // Check every 100ms for better responsiveness
  }

  private validateTerrainPosition(): void {
    // Follow terrain height
    const terrain = this.world.getSystem('terrain') as TerrainSystem;
    const terrainHeight = terrain.getHeightAt(this.position.x, this.position.z);
    const targetY = terrainHeight + 0.1; // Small offset above terrain
    const diff = targetY - this.position.y;
    
    // Snap up if below terrain, lerp down if above
    if (diff > 0.1) {
      // Below terrain - snap up
      this.position.y = targetY;
    } else if (diff < -0.5) {
      // Above terrain - interpolate down
      this.position.y += diff * 0.15;
    }
  }

  /**
   * Override initializeVisuals to skip UIRenderer-based UI elements
   * PlayerLocal uses its own Nametag node system instead
   */
  protected initializeVisuals(): void {
    // Skip UIRenderer - we use Nametag nodes instead
    // Do not call super.initializeVisuals()
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
    if (this.world.hot?.has(this)) {
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
    this.groundNormal.copy(UP)
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
    this.base = new THREE.Group()
    if (this.base) {
      this.base.name = 'player-base'
    }
    if (!this.base) {
      throw new Error('Failed to create base node for PlayerLocal')
    }
    
    // CRITICAL: Add base to the entity's node so it's part of the scene graph!
    this.node.add(this.base)
    
    // Attach the camera rig to the player's base so it follows the player
    if (this.world.rig && this.base) {
      this.base.add(this.world.rig)
      console.log('[PlayerLocal] Camera rig attached to player base')
    }

    // Base node starts at player's position to avoid initial camera looking underground

    // CRITICAL FIX: The Entity constructor already parsed position from data and set it on this.node.position
    // We should use this.position (which is this.node.position) NOT this.data.position!
    // The server has already calculated the correct terrain height and sent it to us.
    
    console.log('[PlayerLocal] Current position from Entity constructor:', {
      x: this.position.x,
      y: this.position.y, 
      z: this.position.z
    })
    console.log('[PlayerLocal] Raw data.position:', this.data.position)
    
    // The Entity constructor has already set our position from the server snapshot
    // We just need to use it!
    let spawnX = this.position.x
    let spawnY = this.position.y
    let spawnZ = this.position.z
    
    // Only use fallback if we truly have no position (0,0,0)
    if (spawnX === 0 && spawnY === 0 && spawnZ === 0) {
      console.warn('[PlayerLocal] Position is 0,0,0, checking for fallback options...')
      
      // Try world settings as fallback
      if ('spawn' in this.world.settings && Array.isArray(this.world.settings.spawn)) {
        const spawn = this.world.settings.spawn as number[]
        spawnX = (typeof spawn[0] === 'number' && !isNaN(spawn[0])) ? spawn[0] : 0
        spawnY = (typeof spawn[1] === 'number' && !isNaN(spawn[1])) ? spawn[1] : 0.1
        spawnZ = (typeof spawn[2] === 'number' && !isNaN(spawn[2])) ? spawn[2] : 0
        console.log('[PlayerLocal] Using world settings spawn as fallback:', { spawnX, spawnY, spawnZ })
        
        // Update our position with the fallback
        this.position.set(spawnX, spawnY, spawnZ)
      }
    } else {
      console.log('[PlayerLocal] Using server-provided position:', { spawnX, spawnY, spawnZ })
    }
    
    // Ensure base node matches the entity's current position (from server)
    if (this.base) {
      // If we have a server position, use that instead of potentially incorrect local position
      if (this.serverPosition) {
        this.position.copy(this.serverPosition);
        // Base is a child of node, so it should stay at relative (0,0,0)
        console.log('[PlayerLocal] Node position set to serverPosition:', this.serverPosition.x, this.serverPosition.y, this.serverPosition.z);
      } else {
        // Base is a child of node, so it should stay at relative (0,0,0)
        console.log('[PlayerLocal] Node already at entity position:', this.position.x, this.position.y, this.position.z);
      }
      
      // CRITICAL: Validate player is on terrain after spawn
      this.validateTerrainPosition()
    }
    // Debug: blue cube above player for avatar/visual debugging
    const debugCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x0000ff })
    )
    debugCube.position.set(0, 3, 0)
    this.base?.add(debugCube)
    if ('visible' in this.base) {
      Object.defineProperty(this.base, 'visible', { value: true, writable: true })
    }
    this.active = true

    // Create a proper THREE.Group for the aura
    this.aura = new THREE.Group()
    if (this.aura) {
      this.aura.name = 'player-aura'
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
    const nametagInstance = (this.nametag as NodeWithInstance).instance
    if (nametagInstance && nametagInstance.isObject3D) {
      this.aura.add(nametagInstance)
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
    const bubbleInstance = (this.bubble as NodeWithInstance).instance
    if (bubbleInstance && bubbleInstance.isObject3D) {
      this.aura.add(bubbleInstance)
    }

    // THREE.Groups don't need activation, they're just containers
    // The custom nodes inside them (nametag, bubble) will activate themselves
    
    // Note: Group nodes don't have Three.js representations - their children handle their own scene addition
    if (this.base) {
      console.log('[PlayerLocal] Base activated')
      
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
    
    // Initialize physics capsule
    await this.initCapsule()
    console.log('[PlayerLocal] Capsule initialized successfully')
    this.initControl()

    // Initialize camera system
    this.initCameraSystem()
    
    // Retry camera initialization after a delay in case systems aren't ready yet
    setTimeout(() => {
      const cameraSystem = getSystem(this.world, 'client-camera-system')
      if (cameraSystem) {
        console.log('[PlayerLocal] Re-emitting camera target event')
        this.world.emit(EventType.CAMERA_SET_TARGET, { target: this })
      }
    }, 1000)

    // Movement is handled by physics directly
    // Don't clamp to terrain on init - trust the server position
    // The server has already calculated the correct terrain height

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
    return (this.data.sessionAvatar as string) || (this.data.avatar as string) || 'asset://avatar.vrm'
  }

  async applyAvatar(): Promise<void> {
    const avatarUrl = this.getAvatarUrl()
    console.log(`[PlayerLocal] applyAvatar called - URL: ${avatarUrl}, current: ${this.avatarUrl}, hasAvatar: ${!!this._avatar}`)
    
    // If we already have the correct avatar loaded, just reuse it
    if (this.avatarUrl === avatarUrl && this._avatar) {
      console.log('[PlayerLocal] Avatar already loaded for URL:', avatarUrl)
      return
    }
    
    // Check if loader is available - if not, we'll retry later
    if (!this.world.loader) {
      console.log('[PlayerLocal] Loader not available yet, will retry avatar loading...')
      // Set up a retry mechanism
      if (!this.avatarRetryInterval) {
        this.avatarRetryInterval = setInterval(async () => {
          if (this.world.loader) {
            console.log('[PlayerLocal] Loader now available, retrying avatar load...')
            clearInterval(this.avatarRetryInterval as unknown as number)
            this.avatarRetryInterval = null
            await this.applyAvatar()
          }
        }, 500) // Check every 500ms
      }
      return
    }
    
    // Clear retry interval if it exists since loader is now available
    if (this.avatarRetryInterval) {
      clearInterval(this.avatarRetryInterval)
      this.avatarRetryInterval = null
    }
    
    // Prevent concurrent loads for the same URL
    if (this.loadingAvatarUrl === avatarUrl) {
      console.log('[PlayerLocal] Avatar load already in progress for', avatarUrl)
      return
    }
    this.loadingAvatarUrl = avatarUrl
    console.log('[PlayerLocal] Set loadingAvatarUrl to:', avatarUrl)
    
    // Only destroy if we're loading a different avatar
    if (this._avatar && this.avatarUrl !== avatarUrl) {
      const oldInstance = (this._avatar as AvatarNode).instance
      console.log('[PlayerLocal] Destroying previous avatar instance for new URL')
      if (oldInstance && oldInstance.destroy) {
        oldInstance.destroy() // This calls hooks.scene.remove(vrm.scene)
      }
      this._avatar = undefined
    }
    
    // Only clear cache if we're loading a different avatar URL
    if (this.avatarUrl !== avatarUrl) {
      console.log('[PlayerLocal] Different avatar URL detected, clearing cache...')
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

    console.log('[PlayerLocal] About to load avatar from:', avatarUrl)
    console.log('[PlayerLocal] world.loader exists?', !!this.world.loader)

    await this.world.loader
      ?.load('avatar', avatarUrl)
      .then(async (src) => {
        // src is LoaderResult, which may be a Texture or an object with toNodes
        // Avatar loader should return an object with toNodes(): Map<string, Avatar>
        const avatarSrc = src as { toNodes: () => Map<string, Avatar> }
        console.log('[PlayerLocal] Avatar loaded, src type:', typeof avatarSrc, 'src:', avatarSrc)
        if (this._avatar && this._avatar.deactivate) {
          this._avatar.deactivate()
        }

        // Pass VRM hooks so the avatar can add itself to the scene
        // Use world.stage.scene and manually update position
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
        const avatarNode = nodeMap.get('avatar') || rootNode
        console.log('[PlayerLocal] Root node:', rootNode, 'Avatar node:', avatarNode)
        
        // Use the avatar node if we found it, otherwise try root
        const nodeToUse = avatarNode || rootNode
        if (!nodeToUse) {
          throw new Error('No avatar or root node found in loaded asset')
        }
        
        // Store the node - it's an Avatar node that needs mounting
        this._avatar = nodeToUse as unknown as AvatarNode
        
        // IMPORTANT: For Avatar nodes to work, they need their context set and to be mounted
        if (this.base && nodeToUse) {
          const avatarNode = nodeToUse as unknown as AvatarNode
          // Set the context for the avatar node
          const avatarAsNode = avatarNode as unknown as AvatarNode & { ctx?: World; hooks?: unknown };
          if (avatarAsNode.ctx !== this.world) {
            avatarAsNode.ctx = this.world
          }
          
          // Check current hooks
          console.log('[PlayerLocal] Current avatar hooks:', avatarAsNode.hooks ? Object.keys(avatarAsNode.hooks) : 'none')
          
          // CRITICAL: ALWAYS update the hooks on the avatar node BEFORE mounting
          // The avatar was created with ClientLoader's hooks, but we need to use
          // the world's stage scene for proper rendering
          console.log('[PlayerLocal] Force updating avatar hooks to use world.stage.scene')
          console.log('[PlayerLocal] vrmHooks.scene exists?', !!vrmHooks.scene)
          avatarAsNode.hooks = vrmHooks
          console.log('[PlayerLocal] New hooks set:', Object.keys(vrmHooks))
          
          // CRITICAL: Verify hooks are properly set
          if (!avatarAsNode.hooks) {
            console.error('[PlayerLocal] CRITICAL: Hooks not set after assignment!')
            avatarAsNode.hooks = vrmHooks // Force set again
          }
          const hooksAsVRM = avatarAsNode.hooks as unknown as { scene?: unknown; octree?: unknown }
          if (!hooksAsVRM?.scene) {
            console.error('[PlayerLocal] CRITICAL: Hooks.scene not set after assignment! Forcing...')
            avatarAsNode.hooks = vrmHooks // Force set again
          }
          
          // CRITICAL: Update base matrix BEFORE setting as parent
          // The avatar needs the correct world position when created
          if (this.base) {
            this.base.updateMatrix()
            this.base.updateMatrixWorld(true)
            console.log('[PlayerLocal] Base matrixWorld updated before avatar mount, position:', 
              this.base.position.x, this.base.position.y, this.base.position.z)
          }
          
          // Set the parent so the node knows where it belongs in the hierarchy
          avatarAsNode.parent = { matrixWorld: this.base.matrixWorld }
          
          // CRITICAL: Avatar node position should be at origin (0,0,0)
          // The instance.move() method will position it at the base's world position
          if (avatarAsNode.position) {
            avatarAsNode.position.set(0, 0, 0)
            console.log('[PlayerLocal] Avatar node position set to origin (0,0,0) - will be positioned by instance.move()')
          }
          
          // Activate the node (this creates the Three.js representation)
          if (avatarAsNode.activate) {
            avatarAsNode.activate(this.world)
            console.log('[PlayerLocal] Avatar node activated')
          }
          
          // Mount the avatar node to create its instance
          if (avatarAsNode.mount) {
            console.log('[PlayerLocal] Mounting avatar node...')
            await avatarAsNode.mount()
            console.log('[PlayerLocal] Avatar node mounted')
          }
          
          // After mounting, the avatar instance should be available
          // The instance manages its own scene internally - do NOT add raw.scene to base
          if (avatarAsNode.instance) {
            const instance = avatarAsNode.instance
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
        if ((nodeToUse as unknown as AvatarNode).instance) {
          const instance = (nodeToUse as unknown as AvatarNode).instance
          console.log('[PlayerLocal] Avatar has instance after mounting:', instance)
          
          // The Avatar node handles its own Three.js representation
          // We don't need to manually add anything since the node is already added to base
          // Just ensure visibility and disable rate check
          
          // Disable rate check if available
          if (instance && instance.disableRateCheck) {
            instance.disableRateCheck()
            console.log('[PlayerLocal] Avatar rate check disabled')
          }
          
          // Log instance properties for debugging
          if (instance && instance.height) {
            console.log('[PlayerLocal] Avatar height:', instance.height)
          }
          if (instance && instance.setEmote) {
            console.log('[PlayerLocal] Avatar has setEmote method')
          }
        } else {
          console.warn('[PlayerLocal] Avatar node has no instance after mounting')
        }
        // Avatar might be a custom Node, not a THREE.Object3D, so visibility might not exist
        const avatarVisible = (this._avatar as AvatarNode).visible !== undefined ? (this._avatar as AvatarNode).visible : 'N/A'
        console.log('[PlayerLocal] Avatar visible:', avatarVisible)
        console.log('[PlayerLocal] Base children count:', this.base && (this.base as GroupNode).children ? (this.base as GroupNode).children.length : 0)

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
          if (this._avatar && (this._avatar as AvatarNode).position) {
            ;(this._avatar as AvatarNode).position.set(0, 0, 0)
            console.log('[PlayerLocal] Avatar position reset to origin')
          }
          
          // Verify avatar instance is actually in the scene graph
          if (this._avatar && (this._avatar as AvatarNode).instance) {
            const instance = (this._avatar as AvatarNode).instance
            if (instance && instance.raw && instance.raw.scene) {
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
        if (this._avatar && (this._avatar as AvatarNode).position && isFinite((this._avatar as AvatarNode).position.y)) {
          if ((this._avatar as AvatarNode).position.y < 0) (this._avatar as AvatarNode).position.y = 0
        }
        
        // Ensure a default idle animation is playing
        this.emote = this.emote || 'idle'
        if (this._avatar && (this._avatar as AvatarNode).setEmote) {
          (this._avatar as AvatarNode).setEmote!('idle')
        }

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

        // In applyAvatar, after successful load:
        this.world.emit(EventType.AVATAR_LOAD_COMPLETE, { playerId: this.id, success: true });
      })
      .catch((err: Error) => {
        console.error('[PlayerLocal] Failed to load avatar:', err)
        // On failure (in catch block):
        this.world.emit(EventType.AVATAR_LOAD_COMPLETE, { playerId: this.id, success: false });
      })
      .finally(() => {
        this.loadingAvatarUrl = undefined
      })
  }

  async initCapsule(): Promise<void> {
    console.log('[PlayerLocal] Initializing physics capsule...')

    // Validation: Ensure we have a valid position from server
    if (
      isNaN(this.position.x) ||
      isNaN(this.position.y) ||
      isNaN(this.position.z)
    ) {
      console.warn(
        `[PlayerLocal] Invalid position from server: ${this.position.x}, ${this.position.y}, ${this.position.z}`
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

    // CRITICAL: Force position to server position before creating physics
    this.position.copy(this.serverPosition);
    // Base is a child of node, no need to set its position separately
    if (this.node) {
      this.node.position.copy(this.serverPosition);
    }
    
    console.log(
      '[PlayerLocal] Creating capsule at EXACT server position:',
      this.serverPosition.x,
      this.serverPosition.y,
      this.serverPosition.z
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

    // Configure physics as KINEMATIC - position-driven, not force-driven
    // This prevents falling and makes physics follow our position
    this.capsule.setRigidBodyFlag(PHYSX.PxRigidBodyFlagEnum.eKINEMATIC, true)
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

    // CRITICAL: Initialize physics capsule at SERVER position, not local position
    // Server position is the ONLY truth
    const initialPose = new PHYSX.PxTransform(PHYSX.PxIDENTITYEnum.PxIdentity)
    initialPose.p.x = this.serverPosition.x
    initialPose.p.y = this.serverPosition.y
    initialPose.p.z = this.serverPosition.z
    
    console.log('[PlayerLocal] Initializing physics capsule at SERVER position:', {
      x: this.serverPosition.x,
      y: this.serverPosition.y,
      z: this.serverPosition.z
    })

    // Apply the corrected pose to the physics capsule
    this.capsule.setGlobalPose(initialPose)

    // Register the capsule with the physics system
    const capsuleHandle = {
      tag: 'player',
      playerId: this.data?.id || 'unknown',
      onInterpolate: (_position: THREE.Vector3, _quaternion: THREE.Quaternion) => {
        // DO NOT UPDATE POSITION FROM PHYSICS - Server is authoritative
        // Physics is ONLY for collision detection, not movement
        this.lastInterpolatedFrame = this.world.frame;
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

    // The base position is already synced with the server's authoritative position

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

    // Don't force terrain clamp on init - trust server position
    // Server reconciliation will handle position updates
  }

  initControl() {
    // Initialize control binding for input handling
    if (this.world.controls) {
      this.control = this.world.controls.bind({
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
    }

    // Initialize camera controls
    const cameraSystem = getSystem(this.world, 'client-camera-system')
    if (cameraSystem) {
      // Using unified camera system - just set ourselves as target
      console.log('[PlayerLocal] Using unified camera system')
      this.world.emit(EventType.CAMERA_SET_TARGET, { target: this })
    } else {
      // Fall back to traditional camera control
      console.log('[PlayerLocal] Using fallback camera control')
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

  initCameraSystem(): void {
    // Register with camera system if available
    const cameraSystem = getSystem(this.world, 'client-camera-system')
    if (cameraSystem) {
      console.log('[PlayerLocal] Registering with camera system')
      // The camera target expects an object with a THREE.Vector3 position; the Entity already has node.position
      this.world.emit(EventType.CAMERA_SET_TARGET, { target: this })
      
      // Debug camera system state
      const camSys = cameraSystem as any
      console.log('[PlayerLocal] Camera system debug:', {
        hasCamera: !!camSys.camera,
        hasCanvas: !!camSys.canvas,
        hasTarget: !!camSys.target,
        cameraMode: camSys.mode,
        initialized: camSys.initialized
      })
    } else {
      console.warn('[PlayerLocal] No camera system found - camera controls may not work')
    }

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
  private clientPredictMovement: boolean = true
  
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

  // Update server authoritative position for reconciliation
  public updateServerPosition(x: number, y: number, z: number): void {
    if (!this.serverPosition) {
      this.serverPosition = new THREE.Vector3();
    }
    
    // CRITICAL: Reject obviously invalid positions from server
    // The server should never send positions below terrain
    if (y < -5) {
      console.error(`[PlayerLocal] REJECTING invalid server position! Y=${y} is below terrain!`);
      console.error(`[PlayerLocal] Server tried to set position to: (${x}, ${y}, ${z})`);
      
      // Get terrain height at this position as safety fallback
      const terrain = this.world.getSystem('terrain') as { getHeightAt?: (x: number, z: number) => number } | null;
      if (terrain?.getHeightAt) {
        const terrainHeight = terrain.getHeightAt(x, z);
        if (Number.isFinite(terrainHeight)) {
          const safeY = (terrainHeight as number) + 0.1; // 10cm above terrain to prevent clipping
          console.warn(`[PlayerLocal] Correcting to safe height: Y=${safeY} (terrain=${terrainHeight})`);
          this.serverPosition.set(x, safeY, z);
        } else {
          // Fallback to a reasonable height
          console.warn(`[PlayerLocal] No terrain data, using fallback Y=50`);
          this.serverPosition.set(x, 50, z);
        }
      } else {
        // No terrain system, use safe default
        console.warn(`[PlayerLocal] No terrain system, using fallback Y=50`);
        this.serverPosition.set(x, 50, z);
      }
    } else {
      // Valid position from server
      this.serverPosition.set(x, y, z);
    }
    
    this.lastServerUpdate = performance.now();
    
    // Log if we receive other questionable positions
    if (!Number.isFinite(y) || y > 1000) {
      console.error(`[PlayerLocal] WARNING: Received questionable Y position from server: ${y}`);
    }
    
    // ALWAYS sync base position with server position to prevent desync
    // The node already has the authoritative position
    // Base is a child of node, so it inherits the transform
    if (this.base) {
      this.base.updateMatrix();
      this.base.updateMatrixWorld(true);
    }
    
    // If no capsule yet, also directly sync entity position
    if (!this.capsule) {
      this.position.copy(this.serverPosition);
    }
    // Otherwise position interpolation is handled in update() method
  }
  
  public updateServerVelocity(x: number, y: number, z: number): void {
    // Store server velocity for prediction
    // This helps with smoother client-side prediction
    if (!this.velocity) {
      this.velocity = new THREE.Vector3();
    }
    this.velocity.set(x, y, z);
  }
  
  // Set click-to-move target and let physics handle the actual movement
  public setClickMoveTarget(target: { x: number; y: number; z: number } | null): void {
    if (target) {
      this.clickMoveTarget = new THREE.Vector3(target.x, target.y, target.z)
      // Use the current run mode setting, but only if stamina is available
      this.running = this.runMode && this.stamina > 0
    } else {
      this.clickMoveTarget = null
      this.moveDir.set(0, 0, 0)
      this.moving = false
    }
  }

  // Ensure external position updates keep physics capsule in sync
  public override setPosition(posOrX: { x: number; y: number; z: number } | number, y?: number, z?: number): void {
    const newX = typeof posOrX === 'object' ? posOrX.x : (posOrX as number)
    const newY = typeof posOrX === 'object' ? posOrX.y : (y as number)
    const newZ = typeof posOrX === 'object' ? posOrX.z : (z as number)

    // Apply to entity position
    super.setPosition(newX, newY, newZ)
    
    // Base is a child of node and will follow automatically

    // Snap physics capsule to match to avoid interpolation snapping back
    if (this.capsule) {
      const pose = this.capsule.getGlobalPose()
      if (pose && pose.p) {
        pose.p.x = newX
        pose.p.y = newY
        pose.p.z = newZ
        if (this.capsuleHandle) {
          this.capsuleHandle.snap(pose)
        } else {
          this.capsule.setGlobalPose(pose)
        }
      }
    }
  }

  toggleFlying() {
    const canFly = this.world.settings.public || hasRole(this.data.roles as string[], 'admin')
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
    const effect = this.data.effect as { anchorId?: string } | undefined
    if (effect?.anchorId) {
      return this.world.anchors.get(effect.anchorId)
    }
    return null
  }

  update(delta: number): void {
    if(!this.capsule) return;
    
    // 1. MOVEMENT CALCULATION FIRST - Calculate where we want to be
    // RuneScape-style point-and-click movement only
    if (this.clickMoveTarget) {
      const speed = this.runMode ? 8 : 4
      v1.subVectors(this.clickMoveTarget, this.position)
      v1.y = 0
      const distanceXZ = v1.length()
      if (distanceXZ < 0.3) {
        this.clickMoveTarget = null
        this.moving = false
        this.moveDir.set(0, 0, 0)
      } else {
        v1.normalize()
        this.moveDir.copy(v1)
        if (this.clientPredictMovement) {
          const step = speed * delta
          this.position.x += v1.x * step
          this.position.z += v1.z * step
        }
        this.moving = true
        this.running = this.runMode
      }
    } else {
      // No target - ensure we're not moving
      this.moving = false
      this.moveDir.set(0, 0, 0)
    }
    
    // 2. SERVER RECONCILIATION - Always reconcile if we have server position
    if (this.serverPosition) {
      const errorDistance = this.position.distanceTo(this.serverPosition);
      if (errorDistance > 5.0) {
        // Large error: snap immediately
        console.log(`[PlayerLocal] Large position error (${errorDistance.toFixed(2)}), snapping to server position`);
        this.position.copy(this.serverPosition);
        this.clickMoveTarget = null; // Cancel movement on large correction
      } else if (errorDistance > 0.1) {
        // Small error: smooth interpolation
        const lerpSpeed = errorDistance > 1.0 ? 10.0 : 5.0;
        const alpha = Math.min(1, delta * lerpSpeed);
        this.position.lerp(this.serverPosition, alpha);
      }
    }
    
    // 3. TERRAIN FOLLOWING - Smooth terrain height adjustment every frame
    this.validateTerrainPosition();
    
    // 4. SAFETY CHECK - Don't wait for validation interval  
    if (this.position.y < -5) {
      const errorMsg = `[PlayerLocal] FATAL: Player falling in update()! Y=${this.position.y.toFixed(2)}, ServerY=${this.serverPosition?.y?.toFixed(2) || 'N/A'}`;
      console.error(errorMsg);
      throw new Error(errorMsg + '\n\nThis crash is intentional to identify movement system failures.');
    }
    
    // 5. UPDATE PHYSICS CAPSULE - Sync kinematic body with our calculated position
    if (this.capsule) {
      const pose = this.capsule.getGlobalPose()
      if (pose?.p) {
        pose.p.x = this.position.x
        pose.p.y = this.position.y
        pose.p.z = this.position.z
        this.capsule.setGlobalPose(pose, true) // true = wake up touching actors
      }
    }
    
    // 6. UPDATE VISUAL REPRESENTATION
    // Update node position to match our calculated position
    this.node.position.copy(this.position)
    this.node.updateMatrix()
    this.node.updateMatrixWorld(true)
    
    // Base is a child of node, keep it at origin relative to node
    if (this.base) {
      this.base.position.set(0, 0, 0)
      this.base.updateMatrix()
      this.base.updateMatrixWorld(true)
    }
    
    // 7. UPDATE AVATAR INSTANCE
    // Update avatar instance position from base transform
    const avatarNode = this._avatar as any
    if (avatarNode?.instance) {
      const instance = avatarNode.instance
      if (instance.move && this.base) {
        instance.move(this.base.matrixWorld)
      }
      if (instance.update) {
        instance.update(delta)
      }
    }
    
    // 5. ROTATION AND ANIMATION
    let newEmote = 'idle'
    if (this.moving) {
      // Honor run toggle immediately while moving (and stamina availability)
      this.running = this.runMode && this.stamina > 0
      // We're moving - choose walk or run animation
      newEmote = this.running ? 'run' : 'walk';
      // RS3-style stamina: drain while running; regen otherwise handled when idle below
      const deltaSeconds = delta
      if (this.running) {
        this.stamina = THREE.MathUtils.clamp(this.stamina - this.staminaDrainPerSecond * deltaSeconds, 0, 100)
        if (this.stamina <= 0) {
          // When energy depletes, force walk and turn off the run toggle (RS3-like behavior)
          this.running = false
          this.runMode = false
          newEmote = 'walk'
        }
      } else {
        // Walking: regenerate stamina
        this.stamina = THREE.MathUtils.clamp(this.stamina + this.staminaRegenWhileWalkingPerSecond * deltaSeconds, 0, 100)
      }
      
      // Rotate base (and thus avatar) to face movement direction ONLY while actively moving
      if (this.base && this.moveDir.lengthSq() > 0.01) {
        // Use v3 for forward, moveDir is already normalized from movement calc
        v3.set(0, 0, -1)  // forward direction
        q1.setFromUnitVectors(v3, this.moveDir)  // target quaternion

        // Only rotate if angle delta is meaningful to reduce tiny jitter
        const dot = Math.min(1, Math.max(-1, this.base.quaternion.dot(q1)))
        const angle = 2 * Math.acos(Math.abs(dot))

        // Threshold to avoid micro-jitter
        if (angle > 0.02) {
          // Angle-based slerp factor for brisk, RS3-like turning
          let factor = (angle / Math.PI) * 0.3 + 0.08
          if (angle > 2.1) { // ~120° or more: accelerate turn-in
            factor = Math.min(0.35, factor + 0.1)
          }

          this.base.quaternion.slerp(q1, factor)
          // Sync node quaternion
          this.node.quaternion.copy(this.base.quaternion)
        }
      }
    } else {
      // Not moving - use idle animation
      newEmote = 'idle';
      // Idle: regenerate faster
      const deltaSeconds = delta
      this.stamina = THREE.MathUtils.clamp(this.stamina + this.staminaRegenPerSecond * deltaSeconds, 0, 100)
      // Do not enforce any rotation while idle to avoid fighting other systems
    }
    
    if (this.emote !== newEmote) {
      this.emote = newEmote
      if (this._avatar) {
        const avatarNode = this._avatar as AvatarNode
        if (avatarNode.emote !== undefined) {
          const emoteMap: Record<string, string> = {
            'idle': Emotes.IDLE,
            'walk': Emotes.WALK,
            'run': Emotes.RUN,
          };
          const emoteUrl = emoteMap[this.emote] || Emotes.IDLE;
          avatarNode.emote = emoteUrl;
        } else if (avatarNode.setEmote) {
          avatarNode.setEmote(this.emote);
        }
      }
    }

    // Avatar position update is already handled above in section 7
    
    this.sendNetworkUpdate()
  }

  sendNetworkUpdate(): void {
    // Server-authoritative movement: only send lightweight emote/name updates here (no p/q)
    if (!this.lastState.e) this.lastState.e = this.emote || 'idle'
    if (this.lastState.e !== this.emote) {
      this.world.network.send('entityModified', { id: this.data.id, e: this.emote })
      this.lastState.e = this.emote || 'idle'
    }
  }

  lateUpdate(_delta: number): void {
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
      // Use pre-allocated temporary vectors
      const v1 = this._tempVec3.set(0, 1, 0)  // up vector
      q1.setFromAxisAngle(v1, rotationY!)
      this.base.quaternion.copy(q1)
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
      id: this.data.id as string,
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
      // Use pre-allocated temporary vector
      v1.set(event.position.x, event.position.y, event.position.z)
      this.teleport(v1, event.rotationY || 0)
    }
  }

  // Required System lifecycle methods
  override destroy(): void {
    // Clean up validation interval
    if (this.positionValidationInterval) {
      clearInterval(this.positionValidationInterval);
      this.positionValidationInterval = undefined;
    }
    
    // Clean up avatar retry interval
    if (this.avatarRetryInterval) {
      clearInterval(this.avatarRetryInterval);
      this.avatarRetryInterval = null;
    }
    
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
