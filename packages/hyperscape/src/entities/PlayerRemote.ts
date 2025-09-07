import type { EntityData, HotReloadable, NetworkData } from '../types/index'
import { Emotes } from '../extras/playerEmotes'
import type { World } from '../World'
import { createNode } from '../extras/createNode'
import { LerpQuaternion } from '../extras/LerpQuaternion'
import { LerpVector3 } from '../extras/LerpVector3'
import THREE from '../extras/three'
import { Entity } from './Entity'
import { Avatar, Nametag, Group, Mesh, UI, UIView, UIText } from '../nodes'
import { EventType } from '../types/events'

let capsuleGeometry: THREE.CapsuleGeometry
{
  const radius = 0.3
  const inner = 1.2
  const height = radius + inner + radius
  capsuleGeometry = new THREE.CapsuleGeometry(radius, inner) // matches PlayerLocal capsule size
  capsuleGeometry.translate(0, height / 2, 0)
}

export class PlayerRemote extends Entity implements HotReloadable {
  isPlayer: boolean;
  base!: Group;
  body!: Mesh;
  collider!: Mesh;
  aura!: Group;
  nametag!: Nametag;
  bubble!: UI;
  bubbleBox!: UIView;
  bubbleText!: UIText;
  avatarUrl?: string;
  avatar?: Avatar;
  lerpPosition: LerpVector3;
  lerpQuaternion: LerpQuaternion;
  teleport: number = 0;
  speaking?: boolean;
  onEffectEnd?: () => void;
  chatTimer?: NodeJS.Timeout;
  destroyed: boolean = false;
  private lastEmote?: string;
  private prevPosition: THREE.Vector3 = new THREE.Vector3();
  
  constructor(world: World, data: EntityData, local?: boolean) {
    super(world, data, local)
    this.isPlayer = true
    this.lerpPosition = new LerpVector3(new THREE.Vector3(), 0)
    this.lerpQuaternion = new LerpQuaternion(new THREE.Quaternion(), 0)
    this.init()
  }

  async init(): Promise<void> {
    this.base = createNode('group') as Group
    // Position and rotation are now handled by Entity base class
    // Use entity's position/rotation properties instead of data

    this.body = createNode('rigidbody', { type: 'kinematic' }) as Mesh
    this.body.active = this.data.effect?.anchorId ? false : true
    this.base.add(this.body)
    this.collider = createNode('collider', {
      type: 'geometry',
      convex: true,
      geometry: capsuleGeometry,
      layer: 'player',
    }) as Mesh
    this.body.add(this.collider)

    // this.caps = createNode('mesh', {
    //   type: 'geometry',
    //   geometry: capsuleGeometry,
    //   material: new THREE.MeshStandardMaterial({ color: 'white' }),
    // })
    // this.base.add(this.caps)

    this.aura = createNode('group') as Group
    this.nametag = createNode('nametag', { label: this.data.name || '', health: this.data.health, active: false }) as Nametag
    this.aura?.add(this.nametag)

    this.bubble = createNode('ui', {
      width: 300,
      height: 512,
      pivot: 'bottom-center',
      billboard: 'full',
      scaler: [3, 30],
      justifyContent: 'flex-end',
      alignItems: 'center',
      active: false,
    }) as UI
    this.bubbleBox = createNode('uiview', {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderRadius: 10,
      padding: 10,
    }) as UIView
    this.bubbleText = createNode('uitext', {
      color: 'white',
      fontWeight: 100,
      lineHeight: 1.4,
      fontSize: 16,
    }) as UIText
    this.bubble.add(this.bubbleBox)
    this.bubbleBox.add(this.bubbleText)
    this.aura?.add(this.bubble)

    this.aura?.activate(this.world)
    this.base.activate(this.world)

    // Ensure base node starts aligned with the entity transform so the avatar follows
    this.base.position.copy(this.position)
    this.base.quaternion.copy(this.node.quaternion)

    // Start avatar loading but don't await it - let it complete asynchronously
    this.applyAvatar().catch(err => {
      console.error('[PlayerRemote] Failed to apply avatar in init:', err)
    })

    this.lerpPosition = new LerpVector3(this.position, this.world.networkRate)
    // IMPORTANT: Use the entity's actual quaternion, not the cloned getter
    this.lerpQuaternion = new LerpQuaternion(this.node.quaternion, this.world.networkRate)
    this.teleport = 0

    this.world.setHot(this, true)
    // Initialize previous position for speed-based emote calculation
    this.prevPosition.copy(this.position)
  }

  async applyAvatar() {
    const avatarUrl = this.data.sessionAvatar || this.data.avatar || 'asset://avatar.vrm'
    if (this.avatarUrl === avatarUrl) return
    
    console.log('[PlayerRemote] Loading avatar:', avatarUrl)
    
    // Ensure loader is available
    if (!this.world.loader) {
      console.warn('[PlayerRemote] Loader not available yet')
      return
    }
    
    try {
      const src = await this.world.loader.load('avatar', avatarUrl)
      
      // Clean up previous avatar
      if (this.avatar) {
        if (this.avatar.deactivate) {
          this.avatar.deactivate()
        }
        // If avatar has an instance, destroy it to clean up VRM scene
        if ((this.avatar as any).instance && (this.avatar as any).instance.destroy) {
          (this.avatar as any).instance.destroy()
        }
      }
      
      // Use the same pattern as PlayerLocal
      const isAvatarNodeMap = (v: unknown): v is { toNodes: () => Map<string, Avatar> } =>
        typeof v === 'object' && v !== null && 'toNodes' in v && typeof (v as { toNodes: unknown }).toNodes === 'function'
      
      if (!isAvatarNodeMap(src)) {
        console.error('[PlayerRemote] Avatar loader did not return expected node map, got:', src)
        return
      }
      
      // Pass VRM hooks so the avatar can add itself to the scene
      const vrmHooks = {
        scene: this.world.stage.scene,
        octree: this.world.stage.octree,
        camera: this.world.camera,
        loader: this.world.loader
      }
      const nodeMap = (src as { toNodes: (hooks?: unknown) => Map<string, Avatar> }).toNodes(vrmHooks)
      console.log('[PlayerRemote] NodeMap type:', nodeMap?.constructor?.name, 'keys:', nodeMap instanceof Map ? Array.from(nodeMap.keys()) : 'not a map')
      
      // Check if nodeMap is actually a Map
      if (!(nodeMap instanceof Map)) {
        console.error('[PlayerRemote] toNodes() did not return a Map, got:', nodeMap)
        return
      }
      
      const rootNode = nodeMap.get('root')
      if (!rootNode) {
        console.error('[PlayerRemote] No root node found in loaded avatar. Available keys:', Array.from(nodeMap.keys()))
        return
      }
      
      // The avatar node is a child of the root node or in the map directly
      const avatarNode = nodeMap.get('avatar') || ((rootNode as any).get ? (rootNode as any).get('avatar') : null)
      console.log('[PlayerRemote] Root node:', rootNode, 'Avatar node:', avatarNode)
      
      // Use the avatar node if we found it, otherwise try root
      const nodeToUse = avatarNode || rootNode
      
      if (!nodeToUse) {
        console.error('[PlayerRemote] No avatar node found')
        return
      }
      
      this.avatar = nodeToUse as Avatar
      console.log('[PlayerRemote] Using node:', nodeToUse)
      
      // Set up the avatar node properly
      if ((nodeToUse as any).ctx !== this.world) {
        (nodeToUse as any).ctx = this.world
      }
      
      // Set the parent to base's matrix so it follows the remote player
      (nodeToUse as any).parent = { matrixWorld: this.base.matrixWorld }
      
      // Activate and mount the avatar node
      if ((nodeToUse as any).activate) {
        (nodeToUse as any).activate(this.world)
      }
      
      if ((nodeToUse as any).mount) {
        await (nodeToUse as any).mount()
      }
      
      // The avatar instance will be managed by the VRM factory
      // Don't add anything to base - the VRM scene is added to world.stage.scene
      
      // Set up positioning
      if (this.avatar && this.avatar.getHeadToHeight) {
        const headHeight = this.avatar.getHeadToHeight();
        if (headHeight != null) {
          this.nametag.position.y = headHeight + 0.2;
          this.bubble.position.y = headHeight + 0.2;
        }
      }
      
      if (!this.bubble.active) {
        this.nametag.active = true
      }
      this.avatarUrl = avatarUrl
      
      console.log('[PlayerRemote] Avatar loaded and mounted successfully')
      // Ensure a default idle emote after mount so avatar isn't frozen
      if (this.avatar) {
        if ('emote' in this.avatar) {
          ;(this.avatar as unknown as { emote: string | null }).emote = Emotes.IDLE
        } else if (typeof (this.avatar as any).setEmote === 'function') {
          ;(this.avatar as any).setEmote(Emotes.IDLE)
        }
        this.lastEmote = Emotes.IDLE
      }
    } catch (err) {
      console.error('[PlayerRemote] Failed to load avatar:', err)
    }
  }

  getAnchorMatrix() {
    if (this.data.effect?.anchorId) {
      return this.world.anchors.get(this.data.effect.anchorId)
    }
    return null
  }

  fixedUpdate(_delta: number): void {
    // Implement fixedUpdate as required by HotReloadable interface
    // This method is called at fixed intervals for physics updates
    // Currently no specific implementation needed
  }

  update(delta: number): void {
    const anchor = this.getAnchorMatrix()
    if (!anchor) {
      this.lerpPosition.update(delta)
      this.lerpQuaternion.update(delta)
    }

    // Mirror entity transform into base node so the avatar follows correctly
    if (this.base) {
      this.base.position.copy(this.position)
      this.base.quaternion.copy(this.node.quaternion)
    }
    
    // Drive avatar instance from base transform (like PlayerLocal does)
    if (this.avatar && (this.avatar as any).instance) {
      const instance = (this.avatar as any).instance
      if (instance && typeof instance.move === 'function' && this.base) {
        // Drive the avatar instance with the base's matrix if available
        const baseAny = this.base as unknown as { updateTransform?: () => void; matrixWorld?: THREE.Matrix4 };
        if (typeof baseAny.updateTransform === 'function') {
          baseAny.updateTransform()
        }
        if (baseAny.matrixWorld) {
          instance.move(baseAny.matrixWorld)
        }
      }
      // Call update for animation updates (mixer, skeleton, etc)
      if (instance && typeof instance.update === 'function') {
        instance.update(delta)
      }
    }

    // Use server-provided emote state directly - no inference
    // The server/PlayerLocal sends the correct animation state
    if (this.avatar) {
      const serverEmote = this.data.emote as string | undefined
      let desiredUrl: string
      
      if (serverEmote) {
        // Map symbolic emote to asset URL
        if (serverEmote.startsWith('asset://')) {
          desiredUrl = serverEmote
        } else {
          const emoteMap: Record<string, string> = {
            idle: Emotes.IDLE,
            walk: Emotes.WALK,
            run: Emotes.RUN,
            float: Emotes.FLOAT,
            fall: Emotes.FALL,
            flip: Emotes.FLIP,
            talk: Emotes.TALK,
          }
          desiredUrl = emoteMap[serverEmote] || Emotes.IDLE
        }
      } else {
        // Default to idle if no emote data
        desiredUrl = Emotes.IDLE
      }

      // Update animation if changed
      if (desiredUrl !== this.lastEmote) {
        if ('emote' in this.avatar) {
          ;(this.avatar as unknown as { emote: string | null }).emote = desiredUrl
        } else if (typeof (this.avatar as any).setEmote === 'function') {
          ;(this.avatar as any).setEmote(desiredUrl)
        }
        this.lastEmote = desiredUrl
      }
    }

    // Update prev position at end of frame
    this.prevPosition.copy(this.position)
  }

  lateUpdate(_delta: number): void {
    const anchor = this.getAnchorMatrix()
    if (anchor) {
      this.lerpPosition.snap()
      this.lerpQuaternion.snap()
      this.position.setFromMatrixPosition(anchor)
      this.rotation.setFromRotationMatrix(anchor)
      this.base.clean()
    }
    if (this.avatar) {
      const matrix = this.avatar.getBoneTransform('head')
      if (matrix) this.aura.position.setFromMatrixPosition(matrix)
    }
  }

  postLateUpdate(_delta: number): void {
    // Implement postLateUpdate as required by HotReloadable interface
    // This method is called after all other update methods
    // Currently no specific implementation needed
  }

  setEffect(effect: string, onEnd?: () => void) {
    if (this.data.effect) {
      this.data.effect = undefined
      this.onEffectEnd?.()
      this.onEffectEnd = undefined
    }
    this.data.effect = { emote: effect }
    this.onEffectEnd = onEnd
    this.body.active = effect && typeof effect === 'object' && 'anchorId' in effect ? false : true
  }

  setSpeaking(speaking: boolean) {
    if (this.speaking === speaking) return
    this.speaking = speaking
    const name = this.data.name || ''
    this.nametag.label = speaking ? `» ${name} «` : name
  }

  override modify(data: Partial<NetworkData>) {
    let avatarChanged
    if (Object.prototype.hasOwnProperty.call(data, 't')) {
      this.teleport++
    }
    if (Object.prototype.hasOwnProperty.call(data, 'p')) {
      // Position is no longer stored in EntityData, apply directly to entity transform
      this.lerpPosition.pushArray(data.p!, this.teleport || null)
    }
    if (Object.prototype.hasOwnProperty.call(data, 'q')) {
      // Rotation is no longer stored in EntityData, apply directly to entity transform
      this.lerpQuaternion.pushArray(data.q!, this.teleport || null)
      // When explicit rotation update arrives, clear any movement-facing override to avoid fighting network
      this.lastEmote = this.lastEmote // no-op, kept for clarity
    }
    if (Object.prototype.hasOwnProperty.call(data, 'e')) {
      this.data.emote = data.e
    }
    if (Object.prototype.hasOwnProperty.call(data, 'ef')) {
      this.setEffect(data.ef as string)
    }
    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
      this.data.name = data.name as string
      this.nametag.label = (data.name as string) || ''
    }
    if (Object.prototype.hasOwnProperty.call(data, 'health')) {
      this.data.health = data.health as number
      this.nametag.health = data.health as number
      this.world.emit(EventType.PLAYER_HEALTH_UPDATED, { playerId: this.data.id, health: data.health as number })
    }
    if (Object.prototype.hasOwnProperty.call(data, 'avatar')) {
      this.data.avatar = data.avatar as string
      avatarChanged = true
    }
    if (Object.prototype.hasOwnProperty.call(data, 'sessionAvatar')) {
      this.data.sessionAvatar = data.sessionAvatar as string
      avatarChanged = true
    }
    if (Object.prototype.hasOwnProperty.call(data, 'roles')) {
      this.data.roles = data.roles as string[]
    }
    if (avatarChanged) {
      this.applyAvatar().catch(err => {
        console.error('[PlayerRemote] Failed to apply avatar in modify:', err)
      })
    }
  }

  chat(msg: string) {
    this.nametag.active = false
    this.bubbleText.value = msg
    this.bubble.active = true
    if (this.chatTimer) clearTimeout(this.chatTimer)
    this.chatTimer = setTimeout(() => {
      this.bubble.active = false
      this.nametag.active = true
    }, 5000)
  }

  override destroy(local?: boolean) {
    if (this.destroyed) return
    this.destroyed = true

    if (this.chatTimer) clearTimeout(this.chatTimer)
    this.base.deactivate()
    this.avatar = undefined
    this.world.setHot(this, false)
    this.world.emit(EventType.PLAYER_LEFT, { playerId: this.data.id })
    this.aura.deactivate()

    this.world.entities.remove(this.data.id)
    // if removed locally we need to broadcast to server/clients
    if (local) {
      this.world.network.send('entityRemoved', this.data.id)
    }
  }
}
