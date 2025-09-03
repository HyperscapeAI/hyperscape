/**
 * Wrapper for loading PhysX module
 * This handles the CommonJS/ESM compatibility issues
 */

import type PhysX from '@hyperscape/physx-js-webidl'
import type { PhysXModule } from './types/physics'

type PhysXInitOptions = Parameters<typeof PhysX>[0]
interface PhysXWindow extends Window {
  PhysX?: typeof PhysX
}

// Loader function reference (set once via require() or dynamic import fallback)
let PhysXLoader: ((options?: PhysXInitOptions) => Promise<PhysXModule>) | undefined

// Try different import methods
{
  const nodeRequire = (globalThis as { require?: (id: string) => unknown }).require
  if (!PhysXLoader && typeof nodeRequire === 'function') {
    try {
      // Try CommonJS require
      const physxModule = nodeRequire('@hyperscape/physx-js-webidl') as
        | typeof PhysX
        | { default: typeof PhysX }
      const candidate = (physxModule as { default?: typeof PhysX }).default ||
        (physxModule as typeof PhysX)
      PhysXLoader = candidate as (options?: PhysXInitOptions) => Promise<PhysXModule>
      console.log('[physx-loader] Loaded via require, type:', typeof candidate)
    } catch (e) {
      console.log('[physx-loader] Require failed:', e)
    }
  }
}

// If require didn't work, use dynamic import as fallback
if (!PhysXLoader) {
  // Use a function that returns a promise for the loader
  PhysXLoader = async (options?: PhysXInitOptions): Promise<PhysXModule> => {
    const physxModule = await import('@hyperscape/physx-js-webidl')
    console.log('[physx-loader] Dynamic import result:', physxModule)
    console.log('[physx-loader] Keys:', Object.keys(physxModule))
    
    // The actual loader might be nested
    const candidate = (physxModule as { default?: unknown }).default ?? (physxModule as unknown)
    
    // If we still don't have a function, try to load the script directly
    if (typeof candidate !== 'function') {
      console.log('[physx-loader] Fallback: loading script directly')
      
      // Create a promise that loads the script
      return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        // Use the file served from the public directory
        script.src = '/physx-js-webidl.js'
        script.onload = () => {
          // The script should define a global PhysX function
          const w = window as PhysXWindow
          if (typeof w.PhysX === 'function') {
            console.log('[physx-loader] Found global PhysX function')
            const PhysXFn = w.PhysX!
            PhysXFn(options).then(resolve).catch(reject)
          } else {
            reject(new Error('PhysX global function not found after script load'))
          }
        }
        script.onerror = () => reject(new Error('Failed to load PhysX script'))
        document.head.appendChild(script)
      })
    }
    
    // If it's a function, call it
    return (candidate as (options?: PhysXInitOptions) => Promise<PhysXModule>)(options)
  }
}

export default PhysXLoader
export { PhysXLoader }
