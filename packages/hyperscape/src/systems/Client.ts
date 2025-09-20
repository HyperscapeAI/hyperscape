import { System } from './System'

import THREE from '../extras/three'
import { initYoga } from '../extras/yoga'
import type { World, WorldOptions } from '../types'

let worker: Worker | null = null

/**
 * Client System
 *
 * - Runs on the client
 *
 *
 */
export class Client extends System {
  constructor(world: World) {
    super(world)
    
    // Only set window properties if they don't exist or in development
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      (window as any).world = world;
      (window as any).THREE = THREE;
    }
  }

  async init(options: WorldOptions & { loadYoga?: Promise<void> }): Promise<void> {
    if (options.loadYoga) {
      await options.loadYoga
    }
    initYoga()
  }

  start() {
    if (this.world.graphics) {
      (this.world.graphics.renderer as { setAnimationLoop: (fn: (time?: number) => void | null) => void }).setAnimationLoop((time?: number) => this.world.tick(time ?? performance.now()));
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange)

    this.world.settings.on('change', this.onSettingsChange)
  }

  onSettingsChange = (changes: { title?: { value?: string } }) => {
    if (changes.title) {
      document.title = changes.title.value || 'World'
    }
  }

  onVisibilityChange = () => {
    // if the tab is no longer active, browsers stop triggering requestAnimationFrame.
    // this is obviously bad because physics stop running and we stop processing websocket messages etc.
    // instead, we stop using requestAnimationFrame and get a worker to tick at a slower rate using setInterval
    // and notify us.
    // this allows us to keep everything running smoothly.
    // See: https://gamedev.stackexchange.com/a/200503 (kinda fucking genius)
    //
    // spawn worker if we haven't yet
    if (!worker) {
      const script = `
        const rate = 1000 / 5 // 5 FPS
        let intervalId = null;
        self.onmessage = (e) => {
          if (e.data === 'start' && !intervalId) {
            intervalId = setInterval(() => {
              self.postMessage(1);
            }, rate);
          }
          if (e.data === 'stop' && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      `
      const blob = new Blob([script], { type: 'application/javascript' })
      worker = new Worker(URL.createObjectURL(blob))
      worker.onmessage = () => {
        const time = performance.now()
        ;(this.world as { tick: (time: number) => void }).tick(time)
      }
    }
    if (document.hidden) {
      // stop rAF
      if (this.world.graphics) {
        (this.world.graphics.renderer as { setAnimationLoop: (fn: ((time?: number) => void) | null) => void }).setAnimationLoop(null)
      }
      // tell the worker to start
      worker.postMessage('start')
    } else {
      // tell the worker to stop
      worker.postMessage('stop')
      // resume rAF
      if (this.world.graphics) {
        (this.world.graphics.renderer as { setAnimationLoop: (fn: (time?: number) => void) => void }).setAnimationLoop((time?: number) => this.world.tick(time ?? performance.now()))
      }
    }
  }

  destroy() {
    if (this.world.graphics) {
      (this.world.graphics.renderer as { setAnimationLoop: (fn: ((time?: number) => void) | null) => void }).setAnimationLoop(null)
    }
    worker?.postMessage('stop')
    worker = null
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
  }
}
