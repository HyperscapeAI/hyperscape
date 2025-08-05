import type { EntityData, HotReloadable, NetworkData } from '../types/index'
import type { World } from '../World'
import { createNode } from '../extras/createNode'
import { LerpQuaternion } from '../extras/LerpQuaternion'
import { LerpVector3 } from '../extras/LerpVector3'
import * as THREE from '../extras/three'
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

    this.applyAvatar()

    this.lerpPosition = new LerpVector3(this.position, this.world.networkRate)
    this.lerpQuaternion = new LerpQuaternion(this.rotation, this.world.networkRate)
    this.teleport = 0

    this.world.setHot(this, true)
  }

  applyAvatar() {
    const avatarUrl = this.data.sessionAvatar || this.data.avatar || 'asset://avatar.vrm'
    if (this.avatarUrl === avatarUrl) return
    this.world.loader?.load('avatar', avatarUrl).then((src: unknown) => {
      if (this.avatar) this.avatar.deactivate()
      this.avatar = (src as ArrayBuffer & { toNodes(): Map<string, Avatar> }).toNodes().get('avatar')
      if (this.avatar) {
        this.base.add(this.avatar)
      }
      
      // Add null check for avatar before accessing methods
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
    })
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
    // Use null coalescing for emote - convert undefined to null
    if (this.avatar && this.avatar.setEmote) {
      this.avatar.setEmote(this.data.emote ?? null);
    }
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
      this.applyAvatar()
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
