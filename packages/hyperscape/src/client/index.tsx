import React from 'react'
import ReactDOM from 'react-dom/client'
import { Client } from './world-client'
import { ErrorBoundary } from './ErrorBoundary'
import { errorReporting } from './error-reporting'
import { playerTokenManager } from './PlayerTokenManager'
import * as THREE from '../extras/three'
import { installThreeJSExtensions } from '../physics/vector-conversions'

// Set global environment flags
(globalThis as typeof globalThis & { isBrowser?: boolean; isServer?: boolean }).isBrowser = true;
(globalThis as typeof globalThis & { isBrowser?: boolean; isServer?: boolean }).isServer = false;

// Declare global env type
declare global {
  interface Window {
    env?: Record<string, string>
    THREE?: typeof THREE
  }
}

installThreeJSExtensions()

console.log('[App] Starting Hyperscape client...')

// Initialize error reporting as early as possible
console.log('[App] Initializing error reporting system...')

function App() {
  console.log('[App Component] Rendering App component')
  
  // Initialize player token for persistent identity
  React.useEffect(() => {
    console.log('[App Component] useEffect running')
    const token = playerTokenManager.getOrCreatePlayerToken('Player');
    const session = playerTokenManager.startSession();
    
    console.log('[App] Player token initialized:', {
      playerId: token.playerId,
      sessionId: session.sessionId,
      playerName: token.playerName
    });

    return () => {
      playerTokenManager.endSession();
    };
  }, []);

  // Try global env first (from env.js), then import.meta.env (build time), then fallback to relative WebSocket
  const wsUrl = 
    window.env?.PUBLIC_WS_URL || 
    import.meta.env.PUBLIC_WS_URL || 
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
  
  console.log('[App] WebSocket URL:', wsUrl)
  
  // Add a ref to verify the component is mounting
  const appRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (appRef.current) {
      console.log('[App Component] App div mounted in DOM:', appRef.current)
    }
  }, [])
  
  return (
    <div ref={appRef} data-component="app-root">
      <ErrorBoundary>
        <Client wsUrl={wsUrl} onSetup={() => {
          console.log('[App] Client onSetup called')
        }} />
      </ErrorBoundary>
    </div>
  )
}

function mountApp() {
  try {
    console.log('[App] mountApp called, document.readyState:', document.readyState)
    console.log('[App] Looking for root element...')
    
    const rootElement = document.getElementById('root')
    console.log('[App] Root element found:', !!rootElement)
    
    if (rootElement) {
      console.log('[App] Root element details:', {
        id: rootElement.id,
        className: rootElement.className,
        innerHTML: rootElement.innerHTML,
        tagName: rootElement.tagName
      })
      
      console.log('[App] Creating React root...')
      const root = ReactDOM.createRoot(rootElement)
      
      console.log('[App] Rendering App component...')
      root.render(<App />)
      
      console.log('[App] React app mounted successfully!')
      
      // Use React's callback to verify render completion
      // React 18's createRoot renders are async and may take multiple frames
      const verifyRender = (attempts = 0) => {
        const maxAttempts = 10
        const hasContent = rootElement.innerHTML.length > 0
        
        if (hasContent) {
          console.log('[App] SUCCESS: Content rendered in root element')
          console.log('[App] Rendered content length:', rootElement.innerHTML.length)
          console.log('[App] First child:', rootElement.firstElementChild?.tagName)
        } else if (attempts < maxAttempts) {
          // Try again in the next frame
          console.log(`[App] Waiting for React to render... (attempt ${attempts + 1}/${maxAttempts})`)
          requestAnimationFrame(() => verifyRender(attempts + 1))
        } else {
          console.error('[App] WARNING: Root element is still empty after multiple attempts!')
          console.error('[App] Root element state:', {
            innerHTML: rootElement.innerHTML,
            childNodes: rootElement.childNodes.length,
            textContent: rootElement.textContent
          })
          
          // Check if React root was created successfully
          const reactRootKey = Object.keys(rootElement).find(key => key.startsWith('_reactRoot'))
          console.error('[App] React root found:', !!reactRootKey)
          
          errorReporting.reportCustomError(
            'React app mounted but no content rendered after multiple attempts',
            {
              phase: 'post-mount',
              rootElementFound: true,
              innerHTML: rootElement.innerHTML,
              attempts: attempts,
              hasReactRoot: !!reactRootKey
            }
          )
        }
      }
      
      // Start verification process
      // Use setTimeout with 0 delay to ensure React has a chance to start rendering
      setTimeout(() => {
        requestAnimationFrame(() => verifyRender(0))
      }, 0)
      
    } else {
      console.error('[App] Root element not found!')
      console.log('[App] Available elements:', Array.from(document.querySelectorAll('*')).map(el => el.tagName + (el.id ? '#' + el.id : '')))
    }
  } catch (error) {
    console.error('[App] Error during mounting:', error)
    if (error instanceof Error) {
      console.error('[App] Error stack:', error.stack)
      
      // Report mounting error to backend
      errorReporting.reportCustomError(
        `App mounting failed: ${error.message}`, 
        {
          phase: 'mounting',
          stack: error.stack,
          rootElementFound: !!document.getElementById('root')
        }
      )
    }
  }
}

// Ensure DOM is ready before mounting
console.log('[App] Initial setup, document.readyState:', document.readyState)
if (document.readyState === 'loading') {
  console.log('[App] DOM still loading, adding DOMContentLoaded listener')
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[App] DOMContentLoaded event fired')
    mountApp()
  })
} else {
  console.log('[App] DOM already ready, mounting immediately')
  mountApp()
}
