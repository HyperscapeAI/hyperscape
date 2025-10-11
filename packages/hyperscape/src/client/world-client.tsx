import { useEffect, useMemo, useRef, useState } from 'react'
import THREE from '../extras/three'

import { createClientWorld } from '../createClientWorld'
import type { World } from '../types'
import { EventType } from '../types/events'
import { CoreUI } from './components/CoreUI'
import type { ClientProps } from '../types/client-types'

export { System } from '../systems/System'

export function Client({ wsUrl, onSetup }: ClientProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const uiRef = useRef<HTMLDivElement>(null)
  // Create world immediately so network can connect and deliver characterList
  const world = useMemo(() => {
    console.log('[Client] Creating new world instance')
    const w = createClientWorld()
    console.log('[Client] World instance created')
    return w
  }, [])
  const defaultUI = { visible: true, active: false, app: null, pane: null }
  const [ui, setUI] = useState(defaultUI)
  useEffect(() => {
    const handleUI = (data: unknown) => {
      if (data && typeof data === 'object') setUI(data as typeof ui)
    }
    world.on(EventType.UI_UPDATE, handleUI)
    return () => {
      world.off(EventType.UI_UPDATE, handleUI)
    }
  }, [world])

  // Handle window resize to update Three.js canvas
  useEffect(() => {
    const handleResize = () => {
      const viewport = viewportRef.current
      if (viewport && world.graphics) {
        const width = viewport.offsetWidth
        const height = viewport.offsetHeight
        world.graphics.resize(width, height)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [world])

  useEffect(() => {
    const init = async () => {
      console.log('[Client] Init useEffect triggered')
      const viewport = viewportRef.current
      const ui = uiRef.current
      
      if (!viewport || !ui) {
        console.log('[Client] Waiting for viewport/ui refs...')
        return
      }
      console.log('[Client] Starting world initialization...')
            
      const baseEnvironment = {
        model: '/base-environment.glb',
        bg: '/day2-2k.jpg',
        hdr: '/day2.hdr',
        sunDirection: new THREE.Vector3(-1, -2, -2).normalize(),
        sunIntensity: 1,
        sunColor: 0xffffff,
        fogNear: null,
        fogFar: null,
        fogColor: null,
      }
      
      // Use wsUrl prop if provided (already resolved by parent App component)
      // The App component handles environment variables, so we should prioritize the prop
      let finalWsUrl: string
      if (wsUrl) {
        finalWsUrl = wsUrl as string
      } else {
        // Fallback if no prop provided
        finalWsUrl = window.env?.PUBLIC_WS_URL || 
          `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
      }
      
      console.log('[Client] WebSocket URL:', finalWsUrl)
      
      // Set assetsUrl from environment variable for asset:// URL resolution
      const assetsUrl =
        window.env?.PUBLIC_ASSETS_URL ||
        `${window.location.protocol}//${window.location.host}/world-assets/`

      const config = {
        viewport,
        ui,
        wsUrl: finalWsUrl,
        baseEnvironment,
        assetsUrl,
      }
      
      // Call onSetup if provided
      if (onSetup) {
        onSetup(world, config)
      }
      
      
      // Ensure RPG systems are registered before initializing the world
      const maybeWorld = world as unknown as World & { systemsLoadedPromise?: Promise<void> }
      if (maybeWorld.systemsLoadedPromise) {
        try {
          await maybeWorld.systemsLoadedPromise
                  } catch (e) {
          console.warn('[Client] Proceeding without awaiting systemsLoadedPromise due to error:', e)
        }
      }
      
      try {
        console.log('[Client] Calling world.init()...')
        await world.init(config)
        console.log('[Client] World.init() complete')
              } catch (error) {
        console.error('[Client] Failed to initialize world:', error)
      }
    }
    
    init()
  }, [world, wsUrl, onSetup])
  
    
  return (
    <div
      className='App absolute top-0 left-0 right-0 h-screen'
    >
      <style>{`
        .App__viewport {
          position: fixed;
          overflow: hidden;
          width: 100%;
          height: 100%;
          inset: 0;
        }
        .App__ui {
          position: absolute;
          inset: 0;
          pointer-events: none;
          user-select: none;
          display: ${ui.visible ? 'block' : 'block'};
          overflow: hidden;
          z-index: 10;
        }
      `}</style>
      <div className='App__viewport' ref={viewportRef} data-component="viewport">
        <div className='App__ui' ref={uiRef} data-component="ui">
          <CoreUI world={world} />
        </div>
      </div>
    </div>
  )
}
