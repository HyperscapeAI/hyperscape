/**
 * Direct script loader for PhysX
 * This loads PhysX by directly injecting the script tag
 */

import type PhysX from '@hyperscape/physx-js-webidl'
import type { PhysXModule } from './types/physics'

type PhysXInitOptions = Parameters<typeof PhysX>[0]
interface PhysXWindow extends Window {
  PhysX?: typeof PhysX
}

export async function loadPhysXScript(options?: PhysXInitOptions): Promise<PhysXModule> {
  // Check if PhysX is already loaded
  const w = window as PhysXWindow
  if (typeof w.PhysX === 'function') {
    console.log('[physx-script-loader] PhysX already loaded, using existing')
    return w.PhysX!(options)
  }

  return new Promise((resolve, reject) => {
    // Check again in case it was loaded while we were waiting
    if (typeof w.PhysX === 'function') {
      w.PhysX!(options).then(resolve).catch(reject)
      return
    }

    const script = document.createElement('script')
    script.src = '/physx-js-webidl.js'
    script.async = true
    
    script.onload = () => {
      console.log('[physx-script-loader] Script loaded successfully')
      
      // Give it a moment to initialize
      setTimeout(() => {
        const w2 = window as PhysXWindow
        if (typeof w2.PhysX === 'function') {
          console.log('[physx-script-loader] PhysX function found, initializing...')
          const PhysXFn = w2.PhysX!
          PhysXFn(options).then((physx) => {
            console.log('[physx-script-loader] PhysX initialized successfully')
            resolve(physx)
          }).catch((error) => {
            console.error('[physx-script-loader] PhysX initialization failed:', error)
            reject(error)
          })
        } else {
          console.error('[physx-script-loader] PhysX function not found after script load')
          console.log('[physx-script-loader] Window keys:', Object.keys(window))
          reject(new Error('PhysX global function not found after script load'))
        }
      }, 100)
    }
    
    script.onerror = (error) => {
      console.error('[physx-script-loader] Failed to load PhysX script:', error)
      reject(new Error('Failed to load PhysX script'))
    }
    
    console.log('[physx-script-loader] Appending script tag to load PhysX...')
    document.head.appendChild(script)
  })
}

export default loadPhysXScript
