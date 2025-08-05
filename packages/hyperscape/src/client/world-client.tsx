import { useEffect, useMemo, useState } from 'react'
import * as THREE from '../core/extras/three'

import { createClientWorld } from '../core/createClientWorld'
import { World } from '../core/World'
import { EventType } from '../types/events'
import { CoreUI } from './components/CoreUI'
import { errorReporting } from './error-reporting'

export { System } from '../core/systems/System'

interface ClientProps {
  wsUrl: string | (() => string | Promise<string>)
  onSetup: (world: World, config: Record<string, unknown>) => void
}

export function Client({ wsUrl, onSetup }: ClientProps) {
  console.log('[Client Component] Rendering Client component')
  
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [uiElement, setUiElement] = useState<HTMLDivElement | null>(null)
  const world = useMemo(() => {
    console.log('[Client Component] Creating client world')
    const world = createClientWorld()

    return world
  }, [])
  const [ui, setUI] = useState(world.ui?.state || { visible: true, active: false, app: null, pane: null })
  const [isInitialized, setIsInitialized] = useState(false)
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
    console.log('[Client] useEffect triggered, viewport:', !!viewport, 'uiElement:', !!uiElement)
    
    // Only initialize when both viewport and ui elements are available
    if (!viewport || !uiElement) {
      console.log('[Client] Waiting for elements - viewport:', !!viewport, 'uiElement:', !!uiElement)
      return
    }
    
    const init = async () => {
      console.log('[Client] Starting initialization with viewport and UI...')
      
      // Wait for plugins to load if they haven't already
      const worldWithPlugins = world as World & { pluginsLoadedPromise?: Promise<void> }
      if (worldWithPlugins.pluginsLoadedPromise) {
        console.log('[Client] Waiting for plugins to load...')
        await worldWithPlugins.pluginsLoadedPromise
        console.log('[Client] Plugins loaded successfully')
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
      let finalWsUrl: string
      if (typeof wsUrl === 'function') {
        const result = wsUrl()
        finalWsUrl = result instanceof Promise ? await result : result
      } else {
        // Use PUBLIC_WS_URL if available, otherwise construct from current host
        const publicWsUrl = process.env.PUBLIC_WS_URL
        if (publicWsUrl) {
          finalWsUrl = publicWsUrl
        } else {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          const defaultWsUrl = `${protocol}//${window.location.host}/ws`
          finalWsUrl = wsUrl || defaultWsUrl
        }
      }
      console.log('[Client] WebSocket URL:', finalWsUrl)

      // Set assetsUrl from environment variable for asset:// URL resolution
      const assetsUrl =
        process.env.PUBLIC_ASSETS_URL ||
        window.env?.PUBLIC_ASSETS_URL ||
        `${window.location.protocol}//${window.location.host}/assets/`

      const config = {
        viewport,
        ui: uiElement,
        wsUrl: finalWsUrl,
        baseEnvironment,
        assetsUrl,
      }
      onSetup(world, config)
      console.log('[Client] Initializing world with config:', config)

      // Set up error context with world information
      try {
        // Hook into world events to get player information for error reporting
        const handlePlayer = (data: unknown) => {
          const playerData = data as { id?: string }
          if (playerData && playerData.id) {
            console.log('[ErrorReporting] Setting user ID:', playerData.id)
            errorReporting.setUserId(playerData.id)
          }
        }
        world.on(EventType.UI_PLAYER_UPDATE, handlePlayer)

        // Log successful world initialization
        console.log('[World] Client initialized successfully', {
          wsUrl: finalWsUrl,
          assetsUrl: assetsUrl,
        })
      } catch (error) {
        console.warn('[ErrorReporting] Failed to set up world error context:', error)
      }

      try {
        await world.init(config)
        setIsInitialized(true)
        console.log('[Client] World initialized successfully')
      } catch (error) {
        console.error('[Client] Failed to initialize world:', error)
        if (error instanceof Error) {
          console.error('[Client] Error stack:', error.stack)
        }
        // Still set initialized to true to show error UI instead of loading screen
        setIsInitialized(true)
        // Could also show an error message to the user here
      }
    }
    init().catch(error => {
      console.error('[Client] Init function failed:', error)
    })
  }, [viewport, uiElement, world, wsUrl, onSetup]) // Dependencies for proper re-initialization
  
  console.log('[Client Component] Render state:', { isInitialized, uiVisible: ui.visible })
  
  // Add a loading indicator to ensure something is visible
  if (!isInitialized) {
    return (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'black',
        color: 'white',
        fontSize: '18px',
        fontFamily: 'Rubik, sans-serif'
      }}>
        <div>Loading Hyperscape...</div>
      </div>
    )
  }
  
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
      <div className='App__viewport' ref={(el) => {
        console.log('[Client] Setting viewport ref:', el)
        setViewport(el)
      }} data-component="viewport">
        <div className='App__ui' ref={(el) => {
          console.log('[Client] Setting uiElement ref:', el)
          setUiElement(el)
        }} data-component="ui">
          <CoreUI world={world} />
        </div>
      </div>
    </div>
  )
}
