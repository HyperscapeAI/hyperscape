
import type { HotReloadable } from '../types'
import type { AvatarFactory, AvatarHooks, AvatarData, VRMAvatarInstance } from '../types/nodes'
import * as THREE from '../extras/three'
import { Node } from './Node'

const defaults = {
  src: null,
  emote: null,
  onLoad: null,
}

export class Avatar extends Node {
  factory: AvatarFactory | null = null
  hooks: AvatarHooks | null = null
  instance: VRMAvatarInstance | null = null
  n: number
  needsRebuild: boolean = false
  private _src: string | null = null
  private _emote: string | null = null
  private _onLoad: Function | null = null
  private _disableRateCheck: boolean = false
  
  constructor(data: AvatarData = {}) {
    super(data)
    this.name = 'avatar'

    this._src = data.src ?? defaults.src
    this._emote = data.emote ?? defaults.emote
    this._onLoad = data.onLoad ?? defaults.onLoad

    this.factory = data.factory ?? null
    this.hooks = data.hooks ?? null
    this.n = 0
  }

  async mount() {
    this.needsRebuild = false
    if (this._src && this.ctx?.loader) {
      const n = ++this.n
      let avatar = this.ctx.loader.get('avatar', this._src)
      if (!avatar) avatar = await this.ctx.loader.load('avatar', this._src)
      if (this.n !== n) return
      // Avatar loaded from loader is a different type - use type assertion based on context
      const avatarData = avatar as { factory?: AvatarFactory; hooks?: AvatarHooks }
      this.factory = avatarData?.factory ?? null
      this.hooks = avatarData?.hooks ?? null
    }
    if (this.factory) {
      // Factory create method signature based on actual implementation context
      this.instance = (this.factory as unknown as { create: (matrix: THREE.Matrix4, hooks?: AvatarHooks, node?: Avatar) => VRMAvatarInstance }).create(this.matrixWorld, this.hooks ?? undefined, this)
      this.instance?.setEmote(this._emote)
      if (this._disableRateCheck && this.instance) {
        this.instance.disableRateCheck()
        this._disableRateCheck = false
      }
      if (this.ctx && this.instance && this.instance.update) {
        this.ctx.setHot(this.instance as unknown as HotReloadable, true)
      }
      this._onLoad?.()
    }
  }

  commit(didMove: boolean) {
    if (this.needsRebuild) {
      this.unmount()
      this.mount()
    }
    if (didMove) {
      this.instance?.move(this.matrixWorld)
    }
  }

  unmount() {
    this.n++
    if (this.instance) {
      if (this.ctx && this.instance.update) {
        this.ctx.setHot(this.instance as unknown as HotReloadable, false)
      }
      this.instance.destroy()
      this.instance = null
    }
  }

  applyStats(stats: { meshes?: number; materials?: number; textures?: number }) {
    // Factory may have applyStats method - using type assertion based on usage context
    const factoryWithStats = this.factory as { applyStats?: (stats: unknown) => void }
    if (factoryWithStats?.applyStats) {
      factoryWithStats.applyStats(stats)
    }
  }

  get src() {
    return this._src
  }

  set src(value: string | null) {
    if (!value) value = defaults.src
    
    if (this._src === value) return
    this._src = value
    this.needsRebuild = true
    this.setDirty()
  }

  get emote() {
    return this._emote
  }

  set emote(value: string | null) {
    if (!value) value = defaults.emote
    
    if (this._emote === value) return
    this._emote = value
    this.instance?.setEmote(value)
  }

  get onLoad() {
    return this._onLoad
  }

  set onLoad(value: Function | null) {
    this._onLoad = value
  }

  getHeight(): number | null {
    return this.instance?.height ?? null
  }

  getHeadToHeight(): number | null {
    return this.instance?.headToHeight ?? null
  }

  getBoneTransform(boneName: string): THREE.Matrix4 | null {
    return this.instance?.getBoneTransform(boneName) ?? null
  }

  disableRateCheck() {
    if (this.instance) {
      this.instance.disableRateCheck()
    } else {
      this._disableRateCheck = true
    }
  }

  setEmote(url: string | null) {
    // DEPRECATED: use .emote
    this.emote = url
  }

  get height() {
    // DEPRECATED: use .getHeight()
    return this.getHeight()
  }

  copy(source: Avatar, recursive?: boolean) {
    super.copy(source, recursive)
    this._src = source._src
    this._emote = source._emote
    this._onLoad = source._onLoad

    this.factory = source.factory
    this.hooks = source.hooks
    return this
  }

  getProxy() {
    if (!this.proxy) {
      const self = this
      let proxy = {
        get src() {
          return self.src
        },
        set src(value: string | null) {
          self.src = value
        },
        get emote() {
          return self.emote
        },
        set emote(value: string | null) {
          self.emote = value
        },
        get onLoad() {
          return self.onLoad
        },
        set onLoad(value: Function | null) {
          self.onLoad = value
        },
        getHeight() {
          return self.getHeight()
        },
        getHeadToHeight() {
          return self.getHeadToHeight()
        },
        getBoneTransform(boneName: string) {
          return self.getBoneTransform(boneName)
        },
        setEmote(url: string | null) {
          // DEPRECATED: use .emote
          return self.setEmote(url)
        },
        get height() {
          // DEPRECATED: use .getHeight()
          return self.height
        },
      }
      proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(super.getProxy())) // inherit Node properties
      this.proxy = proxy
    }
    return this.proxy
  }
}
