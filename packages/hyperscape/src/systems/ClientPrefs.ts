import { isBoolean, isNumber } from 'lodash-es'

import { SystemBase } from './SystemBase'
import { storage } from '../storage'
import { isTouch } from '../client/utils'
import type { World } from '../types'

// Type for client preferences
interface ClientPrefsData {
  ui?: number
  actions?: boolean
  stats?: boolean
  dpr?: number
  shadows?: string
  postprocessing?: boolean
  bloom?: boolean
  music?: number
  sfx?: number
  voice?: number
  v?: number
}

type PrefsKey = keyof ClientPrefsData
type PrefsValue = ClientPrefsData[PrefsKey]

/**
 * Client Prefs System
 *
 */
export class ClientPrefs extends SystemBase {
  public ui: number = 1
  public actions: boolean = true
  public stats: boolean = false
  public dpr: number = 1
  public shadows: string = 'med'
  public postprocessing: boolean = true
  public bloom: boolean = true
  public music: number = 1
  public sfx: number = 1
  public voice: number = 1
  public v: number = 0
  changes: Record<string, { prev: PrefsValue; value: PrefsValue }> | null = null
  
  constructor(world: World) {
    super(world, { name: 'client-prefs', dependencies: { required: [], optional: [] }, autoCleanup: true })

    const _isQuest = typeof navigator !== 'undefined' && navigator.userAgent ? /OculusBrowser/.test(navigator.userAgent) : false;

    let data: ClientPrefsData = {};
    try {
      data = storage?.get('prefs') || {};
    } catch (_e) {
      // Use default if key doesn't exist
      data = {};
    }

    // v2: reset ui scale for new mobile default (0.9)
    if (!data.v) {
      data.v = 2
      data.ui = undefined
    }
    // v3: reset shadows for new mobile default (med)
    if (data.v < 3) {
      data.v = 3
      data.shadows = undefined
    }
    // v4: reset shadows for new defaults (low or med)
    if (data.v < 4) {
      data.v = 4
      data.shadows = undefined
    }

    this.ui = isNumber(data.ui) ? data.ui : isTouch ? 0.9 : 1
    this.actions = isBoolean(data.actions) ? data.actions : true
    this.stats = isBoolean(data.stats) ? data.stats : false
    this.dpr = isNumber(data.dpr) ? data.dpr : 1
    this.shadows = data.shadows ? data.shadows : isTouch ? 'low' : 'med' // none, low=1, med=2048cascade, high=4096cascade
    this.postprocessing = isBoolean(data.postprocessing) ? data.postprocessing : true
    this.bloom = isBoolean(data.bloom) ? data.bloom : true
    this.music = isNumber(data.music) ? data.music : 1
    this.sfx = isNumber(data.sfx) ? data.sfx : 1
    this.voice = isNumber(data.voice) ? data.voice : 1
    this.v = data.v

    this.changes = null
  }

  preFixedUpdate() {
    if (!this.changes) return
    this.emit('change', this.changes)
    this.changes = null
  }

  modify(key: PrefsKey, value: PrefsValue) {
    const current = (this as Record<string, unknown>)[key] as PrefsValue
    if (current === value) return
    const prev = current
    ;(this as Record<string, unknown>)[key] = value
    if (!this.changes) this.changes = {}
    if (!this.changes[key]) this.changes[key] = { prev, value }
    else this.changes[key].value = value
    this.persist()
  }

  async persist() {
    // a small delay to ensure prefs that crash dont persist (eg old iOS with UHD shadows etc)
    await new Promise(resolve => setTimeout(resolve, 2000))
    storage?.set('prefs', {
      ui: this.ui,
      actions: this.actions,
      stats: this.stats,
      dpr: this.dpr,
      shadows: this.shadows,
      postprocessing: this.postprocessing,
      bloom: this.bloom,
      music: this.music,
      sfx: this.sfx,
      voice: this.voice,
      v: this.v,
    })
  }

  setUI(value: number) {
    this.modify('ui', value)
  }

  setActions(value: boolean) {
    this.modify('actions', value)
  }

  setStats(value: boolean) {
    this.modify('stats', value)
  }

  setDPR(value: number) {
    this.modify('dpr', value)
  }

  setShadows(value: string) {
    this.modify('shadows', value)
  }

  setPostprocessing(value: boolean) {
    this.modify('postprocessing', value)
  }

  setBloom(value: boolean) {
    this.modify('bloom', value)
  }

  setMusic(value: number) {
    this.modify('music', value)
  }

  setSFX(value: number) {
    this.modify('sfx', value)
  }

  setVoice(value: number) {
    this.modify('voice', value)
  }

  destroy() {
    // ...
  }
}
