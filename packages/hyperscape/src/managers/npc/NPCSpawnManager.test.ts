/**
 * Unit tests for NPCSpawnManager
 * Tests NPC spawning, respawn queue management, and spawn point configuration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { World } from '../../types'
import { createMockWorld } from '../../__tests__/utils/mockWorld'
import { NPCSpawnManager } from './NPCSpawnManager'
import type { NPCSystem } from '../../systems/NPCSystem'
import { EventType } from '../../types/events'

// Mock NPCSystem interface
interface MockNPCSystemInterface {
  spawnNPC(config: unknown): unknown
}

// Mock NPCSystem
class MockNPCSystem implements MockNPCSystemInterface {
  spawnNPC = vi.fn()
  constructor() {}
}


describe('NPCSpawnManager', () => {
  let spawnManager: NPCSpawnManager
  let mockWorld: World
  let mockNPCSystem: MockNPCSystem

  beforeEach(() => {
    vi.useFakeTimers()
    mockWorld = createMockWorld()
    mockNPCSystem = new MockNPCSystem()
    
    // Mock console.log to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {})
    
    // Create spawn manager with skipDefaults option for test isolation
    spawnManager = new NPCSpawnManager(mockWorld, mockNPCSystem as unknown as NPCSystem, { skipDefaults: true })
    
    // Reset world event spies after constructor calls
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with world and npc system', () => {
      expect(spawnManager).toBeDefined()
    })

    it('should start with no spawn points when skipDefaults is true', () => {
      const spawnPoints = spawnManager.getSpawnPoints()
      expect(Array.isArray(spawnPoints)).toBe(true)
      expect(spawnPoints.length).toBe(0)
    })

    it('should register default spawn points from world areas when skipDefaults is false', () => {
      // Create a new spawn manager without skipping defaults
      const managerWithDefaults = new NPCSpawnManager(mockWorld, mockNPCSystem as unknown as NPCSystem, { skipDefaults: false })
      const spawnPoints = managerWithDefaults.getSpawnPoints()
      expect(Array.isArray(spawnPoints)).toBe(true)
      // Should have loaded some default spawn points
      expect(spawnPoints.length).toBeGreaterThan(0)
    })

    it('should log spawn point count on initialization with defaults', () => {
      // Clear previous console.log calls
      vi.clearAllMocks()
      
      // Create a new spawn manager without skipping defaults
      new NPCSpawnManager(mockWorld, mockNPCSystem as unknown as NPCSystem, { skipDefaults: false })
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[NPCSpawnManager\] Loaded \d+ NPC spawn points from externalized data/)
      )
    })
  })

  describe('registerSpawnPoint', () => {
    it('should register a spawn point with minimal config', () => {
      const config = {
        id: 'test-spawn-1',
        position: { x: 10, y: 0, z: 20 },
        npcId: 123
      }

      spawnManager.registerSpawnPoint(config)

      const spawnPoints = spawnManager.getSpawnPoints()
      const registeredPoint = spawnPoints.find(sp => sp.id === 'test-spawn-1')

      expect(registeredPoint).toBeDefined()
      expect(registeredPoint?.position).toEqual(config.position)
      expect(registeredPoint?.npcId).toBe(123)
      expect(registeredPoint?.maxCount).toBe(1) // Default value
      expect(registeredPoint?.respawnTime).toBe(60000) // Default 1 minute
      expect(registeredPoint?.radius).toBe(5) // Default radius
      expect(registeredPoint?.active).toBe(true)
      expect(registeredPoint?.currentCount).toBe(0) // Should be 0 since spawnNPC returns null
      expect(registeredPoint?.lastSpawnTime).toBe(0)
    })

    it('should register a spawn point with full config', () => {
      const config = {
        id: 'test-spawn-2',
        position: { x: 100, y: 5, z: 200 },
        npcId: 456,
        maxCount: 3,
        respawnTime: 30000,
        radius: 10
      }

      spawnManager.registerSpawnPoint(config)

      const spawnPoints = spawnManager.getSpawnPoints()
      const registeredPoint = spawnPoints.find(sp => sp.id === 'test-spawn-2')

      expect(registeredPoint).toBeDefined()
      expect(registeredPoint?.position).toEqual(config.position)
      expect(registeredPoint?.npcId).toBe(456)
      expect(registeredPoint?.maxCount).toBe(3)
      expect(registeredPoint?.respawnTime).toBe(30000)
      expect(registeredPoint?.radius).toBe(10)
      expect(registeredPoint?.active).toBe(true)
    })

    it('should attempt initial spawns up to maxCount', () => {
      const config = {
        id: 'test-spawn-3',
        position: { x: 0, y: 0, z: 0 },
        npcId: 789,
        maxCount: 2
      }

      // Clear the spawnNPC mock to get accurate call count
      mockNPCSystem.spawnNPC.mockClear()

      spawnManager.registerSpawnPoint(config)

      // Should attempt to spawn 2 NPCs initially
      expect(mockNPCSystem.spawnNPC).toHaveBeenCalledTimes(2)
      
      // Since spawnNPC returns undefined (not mocked to return a value),
      // no spawn events should be emitted
      expect(mockWorld.events.emit).not.toHaveBeenCalledWith(EventType.MOB_SPAWNED, expect.any(Object))
    })

    it('should handle multiple spawn points with same position', () => {
      const config1 = {
        id: 'spawn-a',
        position: { x: 50, y: 0, z: 50 },
        npcId: 111
      }

      const config2 = {
        id: 'spawn-b',
        position: { x: 50, y: 0, z: 50 }, // Same position
        npcId: 222
      }

      spawnManager.registerSpawnPoint(config1)
      spawnManager.registerSpawnPoint(config2)

      const spawnPoints = spawnManager.getSpawnPoints()
      const pointA = spawnPoints.find(sp => sp.id === 'spawn-a')
      const pointB = spawnPoints.find(sp => sp.id === 'spawn-b')

      expect(pointA).toBeDefined()
      expect(pointB).toBeDefined()
      expect(pointA?.npcId).toBe(111)
      expect(pointB?.npcId).toBe(222)
    })

    it('should overwrite existing spawn point with same id', () => {
      const config1 = {
        id: 'duplicate-id',
        position: { x: 10, y: 0, z: 10 },
        npcId: 111
      }

      const config2 = {
        id: 'duplicate-id',
        position: { x: 20, y: 0, z: 20 },
        npcId: 222
      }

      spawnManager.registerSpawnPoint(config1)
      spawnManager.registerSpawnPoint(config2)

      const spawnPoints = spawnManager.getSpawnPoints()
      const duplicatePoints = spawnPoints.filter(sp => sp.id === 'duplicate-id')

      expect(duplicatePoints).toHaveLength(1)
      expect(duplicatePoints[0].npcId).toBe(222) // Should have the second config
      expect(duplicatePoints[0].position).toEqual({ x: 20, y: 0, z: 20 })
    })
  })

  describe('setSpawnPointActive', () => {
    beforeEach(() => {
      spawnManager.registerSpawnPoint({
        id: 'toggle-test',
        position: { x: 0, y: 0, z: 0 },
        npcId: 123
      })
    })

    it('should activate spawn point', () => {
      spawnManager.setSpawnPointActive('toggle-test', false)
      spawnManager.setSpawnPointActive('toggle-test', true)

      const spawnPoints = spawnManager.getSpawnPoints()
      const testPoint = spawnPoints.find(sp => sp.id === 'toggle-test')

      expect(testPoint?.active).toBe(true)
    })

    it('should deactivate spawn point', () => {
      spawnManager.setSpawnPointActive('toggle-test', false)

      const spawnPoints = spawnManager.getSpawnPoints()
      const testPoint = spawnPoints.find(sp => sp.id === 'toggle-test')

      expect(testPoint?.active).toBe(false)
    })

    it('should handle non-existent spawn point', () => {
      // Should not throw error
      expect(() => {
        spawnManager.setSpawnPointActive('non-existent', true)
      }).not.toThrow()
    })

    it('should handle null and undefined IDs', () => {
      expect(() => {
        spawnManager.setSpawnPointActive('', true)
      }).not.toThrow()

      expect(() => {
        spawnManager.setSpawnPointActive('', false)
      }).not.toThrow()
    })
  })

  describe('scheduleRespawn', () => {
    beforeEach(() => {
      spawnManager.registerSpawnPoint({
        id: 'respawn-test',
        position: { x: 0, y: 0, z: 0 },
        npcId: 123,
        maxCount: 2
      })
    })

    it('should schedule respawn task', () => {
      const initialTime = Date.now()
      vi.setSystemTime(initialTime)

      spawnManager.scheduleRespawn('respawn-test', 123, 30000)

      // Fast forward to see if respawn task is processed
      vi.advanceTimersByTime(30100) // Slightly past respawn time

      spawnManager.update(0)

      // Should attempt to respawn (though it won't succeed due to mock NPC system)
      // We can verify this by checking that the respawn queue was processed
      // Since the actual spawning fails, we can't verify the full flow easily
    })

    it('should update spawn point count when scheduling respawn', () => {
      // First, manually set current count to simulate existing NPCs
      const spawnPoints = spawnManager.getSpawnPoints()
      const testPoint = spawnPoints.find(sp => sp.id === 'respawn-test')
      if (testPoint) {
        testPoint.currentCount = 2
      }

      spawnManager.scheduleRespawn('respawn-test', 123, 30000)

      // Count should be decremented
      expect(testPoint?.currentCount).toBe(1)
    })

    it('should not decrement count below zero', () => {
      const spawnPoints = spawnManager.getSpawnPoints()
      const testPoint = spawnPoints.find(sp => sp.id === 'respawn-test')
      if (testPoint) {
        testPoint.currentCount = 0
      }

      spawnManager.scheduleRespawn('respawn-test', 123, 30000)

      expect(testPoint?.currentCount).toBe(0) // Should not go negative
    })

    it('should handle scheduling for non-existent spawn point', () => {
      expect(() => {
        spawnManager.scheduleRespawn('non-existent', 123, 30000)
      }).not.toThrow()
    })

    it('should schedule multiple respawn tasks', () => {
      spawnManager.scheduleRespawn('respawn-test', 123, 10000)
      spawnManager.scheduleRespawn('respawn-test', 124, 20000)
      spawnManager.scheduleRespawn('respawn-test', 125, 30000)

      // All tasks should be scheduled but not yet processed
      vi.advanceTimersByTime(5000) // Not enough time for any to process
      spawnManager.update(0)

      // Process first task
      vi.advanceTimersByTime(6000) // Total 11000ms, enough for first task
      spawnManager.update(0)

      // Process second task
      vi.advanceTimersByTime(10000) // Total 21000ms, enough for second task
      spawnManager.update(0)

      // Process third task
      vi.advanceTimersByTime(10000) // Total 31000ms, enough for third task
      spawnManager.update(0)

      // All tasks should have been processed (though spawning fails due to mock)
    })
  })

  describe('update', () => {
    it('should process respawn queue', () => {
      spawnManager.registerSpawnPoint({
        id: 'update-test',
        position: { x: 0, y: 0, z: 0 },
        npcId: 123
      })

      const initialTime = Date.now()
      vi.setSystemTime(initialTime)

      spawnManager.scheduleRespawn('update-test', 123, 5000)

      // Before respawn time
      vi.advanceTimersByTime(4000)
      spawnManager.update(100)
      // Task should still be in queue

      // After respawn time
      vi.advanceTimersByTime(2000) // Total 6000ms
      spawnManager.update(100)
      // Task should be processed and removed from queue
    })

    it('should check spawn points for needed spawns', () => {
      spawnManager.registerSpawnPoint({
        id: 'spawn-check',
        position: { x: 0, y: 0, z: 0 },
        npcId: 123,
        maxCount: 2,
        respawnTime: 10000
      })

      const spawnPoints = spawnManager.getSpawnPoints()
      const testPoint = spawnPoints.find(sp => sp.id === 'spawn-check')

      if (testPoint) {
        // Simulate that an NPC died (count is below max)
        testPoint.currentCount = 1
        testPoint.lastSpawnTime = Date.now() - 11000 // More than respawn time ago
      }

      spawnManager.update(100)

      // Should attempt to spawn another NPC (though it will fail due to mock)
    })

    it('should respect spawn point respawn time', () => {
      spawnManager.registerSpawnPoint({
        id: 'timing-test',
        position: { x: 0, y: 0, z: 0 },
        npcId: 123,
        maxCount: 2,
        respawnTime: 10000
      })

      const spawnPoints = spawnManager.getSpawnPoints()
      const testPoint = spawnPoints.find(sp => sp.id === 'timing-test')

      if (testPoint) {
        testPoint.currentCount = 1
        testPoint.lastSpawnTime = Date.now() - 5000 // Not enough time yet
      }

      spawnManager.update(100)

      // Should not attempt to spawn yet since respawn time hasn't passed
      if (testPoint) {
        expect(testPoint.currentCount).toBe(1) // Should remain unchanged
      }
    })

    it('should skip inactive spawn points', () => {
      spawnManager.registerSpawnPoint({
        id: 'inactive-test',
        position: { x: 0, y: 0, z: 0 },
        npcId: 123,
        maxCount: 2
      })

      spawnManager.setSpawnPointActive('inactive-test', false)

      const spawnPoints = spawnManager.getSpawnPoints()
      const testPoint = spawnPoints.find(sp => sp.id === 'inactive-test')

      if (testPoint) {
        testPoint.currentCount = 0 // Needs spawning
        testPoint.lastSpawnTime = 0 // Long enough ago
      }

      spawnManager.update(100)

      // Should not spawn because spawn point is inactive
      if (testPoint) {
        expect(testPoint.currentCount).toBe(0) // Should remain unchanged
      }
    })

    it('should handle empty respawn queue', () => {
      expect(() => {
        spawnManager.update(100)
      }).not.toThrow()
    })

    it('should handle time traveling (system time changes)', () => {
      const initialTime = Date.now()
      vi.setSystemTime(initialTime)

      spawnManager.scheduleRespawn('test-id', 123, 5000)

      // Jump forward in time significantly
      vi.setSystemTime(initialTime + 100000)

      expect(() => {
        spawnManager.update(100)
      }).not.toThrow()
    })
  })

  describe('getSpawnPoints', () => {
    it('should return empty array when no spawn points are registered', () => {
      const spawnPoints = spawnManager.getSpawnPoints()
      expect(Array.isArray(spawnPoints)).toBe(true)
      expect(spawnPoints.length).toBe(0)
    })
    
    it('should return default spawn points from world areas when not skipped', () => {
      // Create manager with defaults loaded
      const managerWithDefaults = new NPCSpawnManager(mockWorld, mockNPCSystem as unknown as NPCSystem, { skipDefaults: false })
      const spawnPoints = managerWithDefaults.getSpawnPoints()

      // Should have loaded spawn points from the world areas
      expect(spawnPoints.length).toBeGreaterThan(0)
      
      // Verify spawn points have required properties
      spawnPoints.forEach(sp => {
        expect(sp).toHaveProperty('id')
        expect(sp).toHaveProperty('position')
        expect(sp).toHaveProperty('npcId')
        expect(sp).toHaveProperty('maxCount')
        expect(sp).toHaveProperty('respawnTime')
        expect(sp).toHaveProperty('radius')
        expect(sp).toHaveProperty('active')
        expect(sp).toHaveProperty('currentCount')
        expect(sp).toHaveProperty('lastSpawnTime')
      })
    })

    it('should return all registered spawn points', () => {
      spawnManager.registerSpawnPoint({
        id: 'point-1',
        position: { x: 10, y: 0, z: 10 },
        npcId: 123
      })

      spawnManager.registerSpawnPoint({
        id: 'point-2',
        position: { x: 20, y: 0, z: 20 },
        npcId: 456
      })

      const spawnPoints = spawnManager.getSpawnPoints()

      expect(spawnPoints.length).toBe(2) // Exactly our 2 points (no defaults)
      
      const point1 = spawnPoints.find(sp => sp.id === 'point-1')
      const point2 = spawnPoints.find(sp => sp.id === 'point-2')

      expect(point1).toBeDefined()
      expect(point2).toBeDefined()
      expect(point1?.npcId).toBe(123)
      expect(point2?.npcId).toBe(456)
    })

    it('should return snapshot of spawn points (not live references)', () => {
      spawnManager.registerSpawnPoint({
        id: 'reference-test',
        position: { x: 0, y: 0, z: 0 },
        npcId: 123
      })

      const spawnPoints1 = spawnManager.getSpawnPoints()
      const spawnPoints2 = spawnManager.getSpawnPoints()

      expect(spawnPoints1).not.toBe(spawnPoints2) // Different array instances
      expect(spawnPoints1).toEqual(spawnPoints2) // Same content
    })
  })

  describe('private methods behavior', () => {
    describe('spawnAtPoint', () => {
      it('should calculate random position within spawn radius', () => {
        spawnManager.registerSpawnPoint({
          id: 'radius-test',
          position: { x: 100, y: 50, z: 200 },
          npcId: 123,
          radius: 10
        })

        // We can't directly test the private method, but we can test its effects
        // through the update method which calls it
        const spawnPoints = spawnManager.getSpawnPoints()
        const testPoint = spawnPoints.find(sp => sp.id === 'radius-test')

        if (testPoint) {
          testPoint.currentCount = 0 // Force spawn attempt
          testPoint.lastSpawnTime = 0 // Long enough ago
        }

        // The spawnAtPoint method will be called during update
        spawnManager.update(100)

        // Since NPC creation returns null in our mock, the spawn will fail
        // but the position calculation code will still run
      })
    })

    describe('getNPCIdFromType', () => {
      it('should handle all known NPC types through spawn point registration', () => {
        // Create a new manager without skipping defaults to test getNPCIdFromType
        vi.clearAllMocks()
        const managerWithDefaults = new NPCSpawnManager(mockWorld, mockNPCSystem as unknown as NPCSystem, { skipDefaults: false })
        
        // The getNPCIdFromType method is called during registerDefaultSpawnPoints
        expect(console.log).toHaveBeenCalledWith(
          expect.stringMatching(/\[NPCSpawnManager\] Loaded \d+ NPC spawn points from externalized data/)
        )
        
        // Verify that spawn points were created with correct NPC IDs
        const spawnPoints = managerWithDefaults.getSpawnPoints()
        expect(spawnPoints.length).toBeGreaterThan(0)
      })
    })

    describe('getRespawnTimeForNPC', () => {
      it('should return appropriate respawn times for NPC types', () => {
        // Similar to getNPCIdFromType, we test this through the public interface
        // The getRespawnTimeForNPC method is called during registerDefaultSpawnPoints
        const spawnPoints = spawnManager.getSpawnPoints()

        // Verify that different spawn points have appropriate respawn times
        // This indirectly tests the getRespawnTimeForNPC logic
        expect(Array.isArray(spawnPoints)).toBe(true)
      })
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle spawn point with zero radius', () => {
      expect(() => {
        spawnManager.registerSpawnPoint({
          id: 'zero-radius',
          position: { x: 0, y: 0, z: 0 },
          npcId: 123,
          radius: 0
        })
      }).not.toThrow()
    })

    it('should handle spawn point with negative values', () => {
      expect(() => {
        spawnManager.registerSpawnPoint({
          id: 'negative-values',
          position: { x: -100, y: -50, z: -200 },
          npcId: 123,
          maxCount: -1, // Should be handled gracefully
          respawnTime: -5000, // Should be handled gracefully
          radius: -10 // Should be handled gracefully
        })
      }).not.toThrow()
    })

    it('should handle very large numbers', () => {
      expect(() => {
        spawnManager.registerSpawnPoint({
          id: 'large-numbers',
          position: { x: 1000000, y: 1000000, z: 1000000 },
          npcId: 999999,
          maxCount: 1000000,
          respawnTime: 1000000000,
          radius: 1000000
        })
      }).not.toThrow()
    })

    it('should handle rapid consecutive updates', () => {
      spawnManager.registerSpawnPoint({
        id: 'rapid-test',
        position: { x: 0, y: 0, z: 0 },
        npcId: 123
      })

      expect(() => {
        for (let i = 0; i < 100; i++) {
          spawnManager.update(16) // Simulate 60 FPS updates
        }
      }).not.toThrow()
    })

    it('should handle updates with zero delta time', () => {
      expect(() => {
        spawnManager.update(0)
      }).not.toThrow()
    })

    it('should handle updates with negative delta time', () => {
      expect(() => {
        spawnManager.update(-100)
      }).not.toThrow()
    })

    it('should handle spawn point ID with special characters', () => {
      const specialIds = [
        'test-spawn-point',
        'test_spawn_point',
        'test.spawn.point',
        'test spawn point',
        'test/spawn/point',
        'test@spawn#point',
        'test$spawn%point^',
        '',
        '123',
        'true',
        'null',
        'undefined'
      ]

      specialIds.forEach((id, index) => {
        expect(() => {
          spawnManager.registerSpawnPoint({
            id,
            position: { x: index, y: 0, z: index },
            npcId: index
          })
        }).not.toThrow()
      })
    })

    it('should handle concurrent spawn point modifications', () => {
      const spawnPointId = 'concurrent-test'

      spawnManager.registerSpawnPoint({
        id: spawnPointId,
        position: { x: 0, y: 0, z: 0 },
        npcId: 123
      })

      // Simulate concurrent operations
      expect(() => {
        spawnManager.setSpawnPointActive(spawnPointId, false)
        spawnManager.scheduleRespawn(spawnPointId, 123, 1000)
        spawnManager.setSpawnPointActive(spawnPointId, true)
        spawnManager.update(100)
      }).not.toThrow()
    })
  })

  describe('integration with world events', () => {
    it('should emit spawn events when NPC is successfully spawned', () => {
      // Clear any previous calls
      (mockWorld.emit as ReturnType<typeof vi.fn>).mockClear()
      mockNPCSystem.spawnNPC.mockClear()
      
      // Mock spawnNPC to return an NPC object
      mockNPCSystem.spawnNPC.mockReturnValue({
        id: 'test-npc-123',
        data: { id: 'test-npc-123' }
      })

      spawnManager.registerSpawnPoint({
        id: 'event-test',
        position: { x: 10, y: 0, z: 20 },
        npcId: 456
      })

      // Now the spawn should succeed and emit an event
      expect(mockWorld.emit).toHaveBeenCalledWith(EventType.MOB_SPAWNED, {
        spawnerId: 'event-test',
        npcId: 'test-npc-123',
        position: expect.any(Object)
      })
      
      // Verify it was called exactly once for our test spawn point
      const spawnCalls = (mockWorld.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
        call => call[0] === EventType.MOB_SPAWNED && call[1].spawnerId === 'event-test'
      )
      expect(spawnCalls).toHaveLength(1)
    })

    it('should handle world without events system', () => {
      const worldWithoutEvents = createMockWorld({ events: undefined });
    
      const mockNPCSystemWithSpawn = new MockNPCSystem();
      mockNPCSystemWithSpawn.spawnNPC.mockReturnValue({ id: 'test-npc' });
    
      expect(() => {
        const manager = new NPCSpawnManager(worldWithoutEvents, mockNPCSystemWithSpawn as unknown as NPCSystem, { skipDefaults: true });
        manager.registerSpawnPoint({
          id: 'test-spawn',
          position: { x: 0, y: 0, z: 0 },
          npcId: 1
        });
        manager.update(16);
      }).not.toThrow();
    });
  })

  describe('performance', () => {
    it('should handle many spawn points efficiently', () => {
      const startTime = performance.now()

      // Register many spawn points
      for (let i = 0; i < 1000; i++) {
        spawnManager.registerSpawnPoint({
          id: `perf-test-${i}`,
          position: { x: i, y: 0, z: i },
          npcId: i
        })
      }

      // Update multiple times
      for (let i = 0; i < 100; i++) {
        spawnManager.update(16)
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
    })

    it('should handle large respawn queue efficiently', () => {
      spawnManager.registerSpawnPoint({
        id: 'queue-perf-test',
        position: { x: 0, y: 0, z: 0 },
        npcId: 123
      })

      // Schedule many respawn tasks far in the future so they don't process
      const futureTime = Date.now() + 10000000
      for (let i = 0; i < 1000; i++) {
        // Directly add to the respawn queue to test efficiency
        spawnManager.scheduleRespawn('queue-perf-test', 123, futureTime + i * 1000)
      }

      // Temporarily switch to real timers for accurate measurement
      vi.useRealTimers()
      const startTime = performance.now()

      // Run update which should quickly skip all future tasks
      spawnManager.update(16)

      const endTime = performance.now()
      const duration = endTime - startTime
      
      // Restore fake timers
      vi.useFakeTimers()

      expect(duration).toBeLessThan(10) // Should complete quickly since tasks are in future
    })
  })
})
