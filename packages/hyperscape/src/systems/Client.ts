import { System } from './System'

import * as THREE from '../extras/three'
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
    
    // Create a proxy for the world object that includes Apps system methods
    const worldProxy = new Proxy(world, {
      get: (target, prop) => {
        // Only handle string properties
        if (typeof prop !== 'string') {
          return undefined;
        }
        
        // First check if the property exists on the world object itself
        if (prop in target) {
          // Strong type assumption - cast through unknown for complex World type
          return (target as unknown as Record<string, unknown>)[prop]
        }
        
        return undefined
      }
    })
    
          Object.defineProperty(window, 'world', { value: worldProxy, writable: true, configurable: true });
      Object.defineProperty(window, 'THREE', { value: THREE, writable: true, configurable: true });
  }

  async init(options: WorldOptions & { loadYoga?: Promise<void> }): Promise<void> {
    if (options.loadYoga) {
      await options.loadYoga
    }
    initYoga()
  }

  start() {
    if (this.world.graphics && 'renderer' in this.world.graphics) {
      this.world.graphics?.renderer.setAnimationLoop(this.world.tick);
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange)

    if ('on' in this.world.settings) {
      // Assume on method exists on settings
      (this.world.settings as { on: (event: string, handler: (changes: { title?: { value?: string } }) => void) => void }).on('change', this.onSettingsChange);
    }
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
        if ('tick' in this.world) {
          // Assume tick method exists on world
          (this.world as { tick: (time: number) => void }).tick(time);
        }
      }
    }
    if (document.hidden) {
      // stop rAF
      if (this.world.graphics && 'renderer' in this.world.graphics) {
        this.world.graphics?.renderer.setAnimationLoop(null);
      }
      // tell the worker to start
      worker.postMessage('start')
    } else {
      // tell the worker to stop
      worker.postMessage('stop')
      // resume rAF
      if (this.world.graphics && 'renderer' in this.world.graphics) {
        this.world.graphics?.renderer.setAnimationLoop(this.world.tick);
      }
    }
  }

  destroy() {
    if (this.world.graphics && 'renderer' in this.world.graphics) {
      this.world.graphics?.renderer.setAnimationLoop(null);
    }
    worker?.postMessage('stop')
    worker = null
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
  }
}
