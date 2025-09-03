import { SystemBase } from './SystemBase'
import StatsGL from '../libs/stats-gl'
import Panel from '../libs/stats-gl/panel'
import { isBoolean } from 'lodash-es'
import type { World, WorldOptions } from '../types'
import { EventType } from '../types/events'

const PING_RATE = 1 / 2

/**
 * Stats System
 *
 * - runs on the client
 * - attaches stats to the ui to see fps/cpu/gpu
 *
 */
export class ClientStats extends SystemBase {
  stats: { dom: HTMLElement; setMode?: (mode: number) => void; addPanel: (panel: { dom: HTMLElement }, index?: number) => { dom: HTMLElement }; begin: () => void; end: () => void; init?: (renderer: unknown, debug: boolean) => void; update?: () => void } | null = null
  ui: HTMLElement | null = null
  active: boolean = false
  lastPingAt: number = 0
  pingHistory: number[] = []
  pingHistorySize: number = 30
  maxPing: number = 0.01
  ping!: Panel
  uiHidden: boolean = false
  
  constructor(world: World) {
    super(world, { name: 'client-stats', dependencies: { required: [], optional: [] }, autoCleanup: true })
  }

  async init(options: WorldOptions & { ui?: HTMLElement }): Promise<void> {
    this.ui = options.ui || null
  }

  start() {
    this.world.prefs?.on('change', this.onPrefsChange)
    this.subscribe(EventType.READY, () => this.onReady())
  }

  onReady = () => {
    if (this.world.prefs?.stats) {
      this.toggle(true)
    }
  }

  toggle(value?: boolean) {
    value = isBoolean(value) ? value : !this.active
    if (this.active === value) return
    this.active = value
    if (this.active) {
      if (!this.stats) {
        this.stats = new StatsGL({
          logsPerSecond: 20,
          samplesLog: 100,
          samplesGraph: 10,
          precision: 2,
          horizontal: true,
          minimal: false,
          mode: 0,
        }) as { dom: HTMLElement; setMode?: (mode: number) => void; addPanel: (panel: { dom: HTMLElement }, index?: number) => { dom: HTMLElement }; begin: () => void; end: () => void; init?: (renderer: unknown, debug: boolean) => void; update?: () => void }
        this.stats.init?.(this.world.graphics?.renderer, false)
        this.ping = new Panel('PING', '#f00', '#200')
        this.stats.addPanel(this.ping, 3)
      }
      this.ui?.appendChild(this.stats.dom)
    } else {
      if (this.stats && this.ui) {
        this.ui.removeChild(this.stats.dom)
      }
    }
  }

  preTick() {
    if (this.active) {
      this.stats?.begin()
    }
  }

  update(delta: number) {
    if (!this.active) return
    this.lastPingAt += delta
    if (this.lastPingAt > PING_RATE) {
      const time = performance.now()
      this.world.network.send('ping', time)
      this.lastPingAt = 0
    }
  }

  postTick() {
    if (this.active) {
      this.stats?.end()
      this.stats?.update?.()
    }
  }

  onPong(time: number) {
    const rttMs = performance.now() - time
    if (this.active && this.ping) {
      this.pingHistory.push(rttMs)
      if (this.pingHistory.length > this.pingHistorySize) {
        this.pingHistory.shift()
      }
      let sum = 0
      let min = Infinity
      let max = 0
      for (let i = 0; i < this.pingHistory.length; i++) {
        const value = this.pingHistory[i]
        sum += value
        if (value < min) min = value
        if (value > max) max = value
      }
      const avg = sum / this.pingHistory.length
      if (max > this.maxPing) {
        this.maxPing = max
      }
      this.ping.update(
        avg, // current value (average)
        rttMs, // graph value (latest ping)
        max, // max value for text display
        this.maxPing, // max value for graph scaling
        0 // number of decimal places (0 for ping)
      )
    }
    // emit an event so other systems can use ping information
    // if (this.pingHistory.length > 0) {
    //   let sum = 0
    //   let min = Infinity
    //   let max = 0
    //   for (let i = 0; i < this.pingHistory.length; i++) {
    //     const value = this.pingHistory[i]
    //     sum += value
    //     if (value < min) min = value
    //     if (value > max) max = value
    //   }
    //   this.world.emit('ping-update', {
    //     current: rttMs,
    //     average: Math.round(sum / this.pingHistory.length),
    //     min: min,
    //     max: max,
    //   })
    // }
  }

  onPrefsChange = (changes: { stats?: { value: boolean } }) => {
    if (changes.stats) {
      this.toggle(changes.stats.value)
    }
  }

  destroy() {
    this.toggle(false)
  }
}
