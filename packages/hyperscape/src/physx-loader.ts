/**
 * Wrapper for loading PhysX module
 * This handles the CommonJS/ESM compatibility issues
 */

import type PhysX from '@hyperscape/physx-js-webidl'
import type { PhysXModule } from './types/physics'

type PhysXInitOptions = Parameters<typeof PhysX>[0]

// Loader function reference (set once via require() or dynamic import fallback)
let PhysXLoader: ((options?: PhysXInitOptions) => Promise<PhysXModule>) | undefined

// Try different import methods
{
  const nodeRequire = (globalThis as { require?: (id: string) => unknown }).require
  if (!PhysXLoader && nodeRequire) {
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
    
    // Strong type assumption - candidate is the loader function
    return (candidate as (options?: PhysXInitOptions) => Promise<PhysXModule>)(options)
  }
}

export default PhysXLoader
export { PhysXLoader }
