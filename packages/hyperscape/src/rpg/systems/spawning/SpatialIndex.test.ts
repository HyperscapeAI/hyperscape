/**
 * Unit tests for SpatialIndex
 * Tests spatial indexing, range queries, and grid-based lookups
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SpatialIndex } from './SpatialIndex'
import type { Vector3D as Vector3 } from '../../types'

// Test item interface
interface TestItem {
  id: string
  position: Vector3
  data?: {
    type?: string
    level?: number
    health?: number
  }
}

describe('SpatialIndex', () => {
  let spatialIndex: SpatialIndex<TestItem>

  beforeEach(() => {
    spatialIndex = new SpatialIndex<TestItem>(50) // 50 unit cell size
  })

  describe('constructor', () => {
    it('should initialize with default cell size', () => {
      const index = new SpatialIndex<TestItem>()
      expect(index).toBeDefined()
      expect(index.size).toBe(0)
    })

    it('should initialize with custom cell size', () => {
      const index = new SpatialIndex<TestItem>(100)
      expect(index).toBeDefined()
      expect(index.size).toBe(0)
    })
  })

  describe('add', () => {
    it('should add item to spatial index', () => {
      const item: TestItem = {
        id: 'test1',
        position: { x: 10, y: 0, z: 15 }
      }

      spatialIndex.add(item)

      expect(spatialIndex.size).toBe(1)
    })

    it('should add multiple items to same cell', () => {
      const item1: TestItem = {
        id: 'test1',
        position: { x: 10, y: 0, z: 15 }
      }

      const item2: TestItem = {
        id: 'test2',
        position: { x: 12, y: 0, z: 18 } // Same cell as item1 with cell size 50
      }

      spatialIndex.add(item1)
      spatialIndex.add(item2)

      expect(spatialIndex.size).toBe(2)
    })

    it('should add items to different cells', () => {
      const item1: TestItem = {
        id: 'test1',
        position: { x: 10, y: 0, z: 15 }
      }

      const item2: TestItem = {
        id: 'test2',
        position: { x: 100, y: 0, z: 100 } // Different cell
      }

      spatialIndex.add(item1)
      spatialIndex.add(item2)

      expect(spatialIndex.size).toBe(2)
    })

    it('should handle negative coordinates', () => {
      const item: TestItem = {
        id: 'negative',
        position: { x: -25, y: 0, z: -30 }
      }

      spatialIndex.add(item)

      expect(spatialIndex.size).toBe(1)
    })

    it('should add same item multiple times', () => {
      const item: TestItem = {
        id: 'duplicate',
        position: { x: 10, y: 0, z: 15 }
      }

      spatialIndex.add(item)
      spatialIndex.add(item)
      spatialIndex.add(item)

      expect(spatialIndex.size).toBe(1) // Set deduplicates items
    })
  })

  describe('remove', () => {
    it('should remove item from spatial index', () => {
      const item: TestItem = {
        id: 'test1',
        position: { x: 10, y: 0, z: 15 }
      }

      spatialIndex.add(item)
      expect(spatialIndex.size).toBe(1)

      spatialIndex.remove(item)
      expect(spatialIndex.size).toBe(0)
    })

    it('should handle removing non-existent item gracefully', () => {
      const item: TestItem = {
        id: 'nonexistent',
        position: { x: 10, y: 0, z: 15 }
      }

      spatialIndex.remove(item)
      expect(spatialIndex.size).toBe(0)
    })

    it('should remove correct item from cell with multiple items', () => {
      const item1: TestItem = {
        id: 'test1',
        position: { x: 10, y: 0, z: 15 }
      }

      const item2: TestItem = {
        id: 'test2',
        position: { x: 12, y: 0, z: 18 } // Same cell as item1
      }

      spatialIndex.add(item1)
      spatialIndex.add(item2)
      expect(spatialIndex.size).toBe(2)

      spatialIndex.remove(item1)
      expect(spatialIndex.size).toBe(1)

      const remaining = spatialIndex.getInRange({ x: 11, y: 0, z: 16 }, 10)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe('test2')
    })

    it('should clean up empty cells after removal', () => {
      const item: TestItem = {
        id: 'cleanup_test',
        position: { x: 10, y: 0, z: 15 }
      }

      spatialIndex.add(item)
      spatialIndex.remove(item)

      expect(spatialIndex.size).toBe(0)

      // Adding new item should work correctly
      const newItem: TestItem = {
        id: 'new_item',
        position: { x: 10, y: 0, z: 15 }
      }

      spatialIndex.add(newItem)
      expect(spatialIndex.size).toBe(1)
    })

    it('should handle removing item with negative coordinates', () => {
      const item: TestItem = {
        id: 'negative',
        position: { x: -25, y: 0, z: -30 }
      }

      spatialIndex.add(item)
      expect(spatialIndex.size).toBe(1)

      spatialIndex.remove(item)
      expect(spatialIndex.size).toBe(0)
    })
  })

  describe('getInRange', () => {
    beforeEach(() => {
      // Add some test items
      const items: TestItem[] = [
        { id: 'close1', position: { x: 10, y: 0, z: 10 } },
        { id: 'close2', position: { x: 15, y: 0, z: 12 } },
        { id: 'medium', position: { x: 30, y: 0, z: 25 } },
        { id: 'far1', position: { x: 100, y: 0, z: 100 } },
        { id: 'far2', position: { x: -50, y: 0, z: -50 } },
        { id: 'origin', position: { x: 0, y: 0, z: 0 } }
      ]

      items.forEach(item => spatialIndex.add(item))
    })

    it('should find items within range', () => {
      const results = spatialIndex.getInRange({ x: 10, y: 0, z: 10 }, 10)

      expect(results.length).toBeGreaterThan(0)
      
      // Should include items within 10 units
      const ids = results.map(item => item.id)
      expect(ids).toContain('close1') // Exact match
      expect(ids).toContain('close2') // Within range
    })

    it('should return empty array when no items in range', () => {
      const results = spatialIndex.getInRange({ x: 1000, y: 0, z: 1000 }, 5)

      expect(results).toEqual([])
    })

    it('should find items with exact distance match', () => {
      // Add item at exact distance
      const exactItem: TestItem = {
        id: 'exact',
        position: { x: 20, y: 0, z: 10 } // Exactly 10 units from (10, 0, 10)
      }

      spatialIndex.add(exactItem)

      const results = spatialIndex.getInRange({ x: 10, y: 0, z: 10 }, 10)
      const ids = results.map(item => item.id)

      expect(ids).toContain('exact')
    })

    it('should handle range query at origin', () => {
      const results = spatialIndex.getInRange({ x: 0, y: 0, z: 0 }, 20)

      const ids = results.map(item => item.id)
      expect(ids).toContain('origin')
      expect(ids).toContain('close1') // Distance ~14.14
      expect(ids).toContain('close2') // Distance ~19.21
    })

    it('should handle large range queries', () => {
      const results = spatialIndex.getInRange({ x: 0, y: 0, z: 0 }, 1000)

      // Should find all items
      expect(results).toHaveLength(6)
    })

    it('should handle zero range', () => {
      const results = spatialIndex.getInRange({ x: 10, y: 0, z: 10 }, 0)

      // Should only find items at exact position
      const ids = results.map(item => item.id)
      expect(ids).toContain('close1')
      expect(results).toHaveLength(1)
    })

    it('should handle negative coordinates in query', () => {
      const results = spatialIndex.getInRange({ x: -50, y: 0, z: -50 }, 10)

      const ids = results.map(item => item.id)
      expect(ids).toContain('far2')
    })

    it('should return items in deterministic order', () => {
      const results1 = spatialIndex.getInRange({ x: 10, y: 0, z: 10 }, 50)
      const results2 = spatialIndex.getInRange({ x: 10, y: 0, z: 10 }, 50)

      expect(results1.map(r => r.id)).toEqual(results2.map(r => r.id))
    })
  })

  describe('clear', () => {
    it('should remove all items', () => {
      const items: TestItem[] = [
        { id: 'item1', position: { x: 10, y: 0, z: 10 } },
        { id: 'item2', position: { x: 20, y: 0, z: 20 } },
        { id: 'item3', position: { x: 30, y: 0, z: 30 } }
      ]

      items.forEach(item => spatialIndex.add(item))
      expect(spatialIndex.size).toBe(3)

      spatialIndex.clear()
      expect(spatialIndex.size).toBe(0)

      const results = spatialIndex.getInRange({ x: 0, y: 0, z: 0 }, 1000)
      expect(results).toEqual([])
    })

    it('should allow adding items after clear', () => {
      // Add and clear
      spatialIndex.add({ id: 'temp', position: { x: 0, y: 0, z: 0 } })
      spatialIndex.clear()

      // Add new item
      const newItem: TestItem = {
        id: 'new',
        position: { x: 5, y: 0, z: 5 }
      }

      spatialIndex.add(newItem)
      expect(spatialIndex.size).toBe(1)

      const results = spatialIndex.getInRange({ x: 5, y: 0, z: 5 }, 1)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('new')
    })
  })

  describe('size', () => {
    it('should return 0 for empty index', () => {
      expect(spatialIndex.size).toBe(0)
    })

    it('should track size as items are added', () => {
      expect(spatialIndex.size).toBe(0)

      spatialIndex.add({ id: '1', position: { x: 0, y: 0, z: 0 } })
      expect(spatialIndex.size).toBe(1)

      spatialIndex.add({ id: '2', position: { x: 10, y: 0, z: 10 } })
      expect(spatialIndex.size).toBe(2)

      spatialIndex.add({ id: '3', position: { x: 20, y: 0, z: 20 } })
      expect(spatialIndex.size).toBe(3)
    })

    it('should track size as items are removed', () => {
      const item1 = { id: '1', position: { x: 0, y: 0, z: 0 } }
      const item2 = { id: '2', position: { x: 10, y: 0, z: 10 } }

      spatialIndex.add(item1)
      spatialIndex.add(item2)
      expect(spatialIndex.size).toBe(2)

      spatialIndex.remove(item1)
      expect(spatialIndex.size).toBe(1)

      spatialIndex.remove(item2)
      expect(spatialIndex.size).toBe(0)
    })

    it('should reset to 0 after clear', () => {
      spatialIndex.add({ id: '1', position: { x: 0, y: 0, z: 0 } })
      spatialIndex.add({ id: '2', position: { x: 10, y: 0, z: 10 } })
      expect(spatialIndex.size).toBe(2)

      spatialIndex.clear()
      expect(spatialIndex.size).toBe(0)
    })
  })

  describe('cell coordinate calculation', () => {
    it('should place items in correct cells', () => {
      const index = new SpatialIndex<TestItem>(100) // 100 unit cells

      const items: TestItem[] = [
        { id: 'cell_0_0', position: { x: 50, y: 0, z: 50 } },   // Cell (0, 0)
        { id: 'cell_1_0', position: { x: 150, y: 0, z: 50 } },  // Cell (1, 0)
        { id: 'cell_0_1', position: { x: 50, y: 0, z: 150 } },  // Cell (0, 1)
        { id: 'cell_1_1', position: { x: 150, y: 0, z: 150 } }  // Cell (1, 1)
      ]

      items.forEach(item => index.add(item))

      // Query center of each cell
      const cell_0_0 = index.getInRange({ x: 50, y: 0, z: 50 }, 10)
      const cell_1_0 = index.getInRange({ x: 150, y: 0, z: 50 }, 10)
      const cell_0_1 = index.getInRange({ x: 50, y: 0, z: 150 }, 10)
      const cell_1_1 = index.getInRange({ x: 150, y: 0, z: 150 }, 10)

      expect(cell_0_0.some(item => item.id === 'cell_0_0')).toBe(true)
      expect(cell_1_0.some(item => item.id === 'cell_1_0')).toBe(true)
      expect(cell_0_1.some(item => item.id === 'cell_0_1')).toBe(true)
      expect(cell_1_1.some(item => item.id === 'cell_1_1')).toBe(true)
    })

    it('should handle boundary conditions', () => {
      const index = new SpatialIndex<TestItem>(50)

      const items: TestItem[] = [
        { id: 'boundary1', position: { x: 0, y: 0, z: 0 } },      // Exactly on boundary
        { id: 'boundary2', position: { x: 50, y: 0, z: 50 } },    // Next cell boundary
        { id: 'boundary3', position: { x: -0.1, y: 0, z: -0.1 } } // Just negative
      ]

      items.forEach(item => index.add(item))

      const results = index.getInRange({ x: 0, y: 0, z: 0 }, 100)
      expect(results).toHaveLength(3)
    })
  })

  describe('performance characteristics', () => {
    it('should handle large numbers of items efficiently', () => {
      const startTime = performance.now()

      // Add 1000 items
      for (let i = 0; i < 1000; i++) {
        spatialIndex.add({
          id: `item_${i}`,
          position: {
            x: Math.random() * 1000,
            y: 0,
            z: Math.random() * 1000
          }
        })
      }

      const addTime = performance.now() - startTime

      // Query should be fast
      const queryStart = performance.now()
      const results = spatialIndex.getInRange({ x: 500, y: 0, z: 500 }, 100)
      const queryTime = performance.now() - queryStart

      expect(spatialIndex.size).toBe(1000)
      expect(addTime).toBeLessThan(1000) // Should complete in under 1 second
      expect(queryTime).toBeLessThan(100) // Query should be very fast
      expect(results.length).toBeGreaterThan(0) // Should find some items
    })

    it('should maintain performance with clustered items', () => {
      // Add many items in same area (worst case for spatial indexing)
      for (let i = 0; i < 100; i++) {
        spatialIndex.add({
          id: `clustered_${i}`,
          position: {
            x: 10 + Math.random() * 5, // Clustered around (10, 0, 10)
            y: 0,
            z: 10 + Math.random() * 5
          }
        })
      }

      const results = spatialIndex.getInRange({ x: 12, y: 0, z: 12 }, 10)
      expect(results.length).toBeGreaterThan(0)
      expect(results.length).toBeLessThanOrEqual(100)
    })
  })

  describe('edge cases', () => {
    it('should handle very large coordinates', () => {
      const item: TestItem = {
        id: 'large_coords',
        position: { x: 1000000, y: 0, z: 1000000 }
      }

      spatialIndex.add(item)

      const results = spatialIndex.getInRange({ x: 1000000, y: 0, z: 1000000 }, 10)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('large_coords')
    })

    it('should handle very small cell sizes', () => {
      const smallIndex = new SpatialIndex<TestItem>(0.1)

      const item: TestItem = {
        id: 'small_cell',
        position: { x: 0.05, y: 0, z: 0.05 }
      }

      smallIndex.add(item)

      const results = smallIndex.getInRange({ x: 0.05, y: 0, z: 0.05 }, 0.1)
      expect(results).toHaveLength(1)
    })

    it('should handle floating point precision issues', () => {
      const item1: TestItem = {
        id: 'float1',
        position: { x: 0.1 + 0.2, y: 0, z: 0.1 + 0.2 } // 0.30000000000000004
      }

      const item2: TestItem = {
        id: 'float2',
        position: { x: 0.3, y: 0, z: 0.3 }
      }

      spatialIndex.add(item1)
      spatialIndex.add(item2)

      const results = spatialIndex.getInRange({ x: 0.3, y: 0, z: 0.3 }, 0.01)
      expect(results.length).toBeGreaterThan(0)
    })

    it('should handle items with additional data', () => {
      const item: TestItem = {
        id: 'with_data',
        position: { x: 10, y: 0, z: 10 },
        data: {
          type: 'enemy',
          level: 5,
          health: 100
        }
      }

      spatialIndex.add(item)

      const results = spatialIndex.getInRange({ x: 10, y: 0, z: 10 }, 1)
      expect(results).toHaveLength(1)
      expect(results[0]).toBeDefined()
      
      const firstResult = results[0]!
      expect(firstResult.data).toBeDefined()
      expect(firstResult.data!.type).toBe('enemy')
      expect(firstResult.data!.level).toBe(5)
    })

    it('should handle y-coordinate in distance calculations', () => {
      const item1: TestItem = {
        id: 'ground',
        position: { x: 0, y: 0, z: 0 }
      }

      const item2: TestItem = {
        id: 'elevated',
        position: { x: 0, y: 10, z: 0 } // 10 units up
      }

      spatialIndex.add(item1)
      spatialIndex.add(item2)

      // Query from ground level with range that includes elevated item
      const results = spatialIndex.getInRange({ x: 0, y: 0, z: 0 }, 15)
      expect(results).toHaveLength(2)

      // Query with range that excludes elevated item
      const groundOnly = spatialIndex.getInRange({ x: 0, y: 0, z: 0 }, 5)
      expect(groundOnly).toHaveLength(1)
      expect(groundOnly[0].id).toBe('ground')
    })
  })
})