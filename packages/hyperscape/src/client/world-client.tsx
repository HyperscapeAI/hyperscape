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
  const world = useMemo(() => {
        const world = createClientWorld()
    return world
  }, [])
  const [ui, setUI] = useState(world.ui?.state || { visible: true, active: false, app: null, pane: null })
  useEffect(() => {
    const handleUI = (data: unknown) => {
      // Handle UI state update - expecting full UI state
      if (data && typeof data === 'object') {
        setUI(data as typeof ui)
      }
    }
    world.on(EventType.UI_UPDATE, handleUI)
    return () => {
      world.off(EventType.UI_UPDATE, handleUI)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const viewport = viewportRef.current
      const ui = uiRef.current
      
      if (!viewport || !ui) {
                return
      }
      
            
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
        await world.init(config)
              } catch (error) {
        console.error('[Client] Failed to initialize world:', error)
      }
    }
    
    init()
  }, [world, wsUrl, onSetup])
  
    
  return (
    <div
      className='App'
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '100vh',
      }}
    >
      <style>{`
        .App__viewport {
          position: absolute;
          inset: 0;
        }
        .App__ui {
          position: absolute;
          inset: 0;
          pointer-events: none;
          user-select: none;
          display: ${ui.visible ? 'block' : 'none'};
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
