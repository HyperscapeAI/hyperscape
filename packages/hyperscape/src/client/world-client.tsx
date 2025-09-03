import { useEffect, useMemo, useRef, useState } from 'react'
import THREE from '../extras/three'

import { createClientWorld } from '../createClientWorld'
import { EventType } from '../types/events'
import { CoreUI } from './components/CoreUI'
import type { ClientProps } from '../types/client-types'

export { System } from '../systems/System'

export function Client({ wsUrl, onSetup }: ClientProps) {
  console.log('[Client Component] Rendering Client component')
  
  const viewportRef = useRef<HTMLDivElement>(null)
  const uiRef = useRef<HTMLDivElement>(null)
  const world = useMemo(() => {
    console.log('[Client Component] Creating client world')
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
        console.log('[Client] Waiting for refs...')
        return
      }
      
      console.log('[Client] Starting initialization...')
      
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
      
      let finalWsUrl: string
      if (typeof wsUrl === 'function') {
        const result = wsUrl()
        finalWsUrl = result instanceof Promise ? await result : result
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const defaultWsUrl = `${protocol}//${window.location.host}/ws`
        finalWsUrl = wsUrl || defaultWsUrl
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
      
      console.log('[Client] Initializing world with config:', config)
      
      try {
        await world.init(config)
        console.log('[Client] World initialized successfully')
      } catch (error) {
        console.error('[Client] Failed to initialize world:', error)
      }
    }
    
    init()
  }, [world, wsUrl, onSetup])
  
  console.log('[Client Component] Rendering with ui visible:', ui.visible)
  
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
