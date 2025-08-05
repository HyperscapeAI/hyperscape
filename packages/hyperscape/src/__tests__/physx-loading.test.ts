import { describe, it, expect, beforeAll, vi } from 'vitest'
import { loadPhysX, isPhysXReady, getPhysX } from '../PhysXManager'
import type PhysX from '@hyperscape/physx-js-webidl'

describe('PhysX Loading', () => {
  let physxInfo: Awaited<ReturnType<typeof loadPhysX>>

  beforeAll(async () => {
    // Set timeout for PhysX loading
    vi.setConfig({ testTimeout: 30000 })
  })

  it('should load PhysX successfully', async () => {
    expect(isPhysXReady()).toBe(false)
    
    physxInfo = await loadPhysX()
    
    expect(physxInfo).toBeDefined()
    expect(physxInfo.version).toBeDefined()
    expect(physxInfo.physics).toBeDefined()
    expect(isPhysXReady()).toBe(true)
  })

  it('should provide access to PhysX types', async () => {
    const PHYSX = getPhysX()
    expect(PHYSX).toBeDefined()
    
    // Test creating basic PhysX objects
    const vec = new PHYSX!.PxVec3(1, 2, 3)
    expect(vec.x).toBe(1)
    expect(vec.y).toBe(2)
    expect(vec.z).toBe(3)
    
    // Test creating transform
    const quat = new PHYSX!.PxQuat(0, 0, 0, 1)
    const transform = new PHYSX!.PxTransform(vec, quat)
    expect(transform).toBeDefined()
  })

  it('should handle multiple load calls gracefully', async () => {
    // Should return the same instance
    const info1 = await loadPhysX()
    const info2 = await loadPhysX()
    
    expect(info1).toBe(info2)
    expect(isPhysXReady()).toBe(true)
  })

  it('should have proper TypeScript types from npm package', () => {
    // This test just verifies that types compile correctly
    const typeTest = (vec: PhysX.PxVec3) => {
      const x: number = vec.x
      const y: number = vec.y
      const z: number = vec.z
      return { x, y, z }
    }
    
    // If this compiles, our types are working
    expect(typeTest).toBeDefined()
  })
})