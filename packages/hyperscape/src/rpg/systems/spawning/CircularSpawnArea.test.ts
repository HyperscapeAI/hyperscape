/**
 * Unit tests for CircularSpawnArea
 * Tests circular spawn area generation, position validation, and spawning logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CircularSpawnArea } from './CircularSpawnArea'
import type { Vector3D as Vector3, Position3D } from '../../types'

// Mock THREE.Vector3
vi.mock('../../../core/extras/three', () => ({
  Vector3: class MockVector3 {
    constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}
  }
}))

describe('CircularSpawnArea', () => {
  let spawnArea: CircularSpawnArea

  const center: Vector3 = { x: 100, y: 50, z: 200 }
  const radius = 25

  beforeEach(() => {
    // Reset random for predictable tests
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    spawnArea = new CircularSpawnArea(center, radius)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with basic parameters', () => {
      const area = new CircularSpawnArea(center, radius)
      
      expect(area.type).toBe('circular')
      expect(area.radius).toBe(radius)
      expect(area.avoidOverlap).toBe(true) // Default
      expect(area.minSpacing).toBe(1) // Default
      expect(area.maxHeight).toBe(0) // Default
    })

    it('should initialize with custom parameters', () => {
      const area = new CircularSpawnArea(center, radius, 5, false, 10)
      
      expect(area.type).toBe('circular')
      expect(area.radius).toBe(radius)
      expect(area.minSpacing).toBe(5)
      expect(area.avoidOverlap).toBe(false)
      expect(area.maxHeight).toBe(10)
    })

    it('should handle zero radius', () => {
      const area = new CircularSpawnArea(center, 0)
      
      expect(area.radius).toBe(0)
      expect(area.type).toBe('circular')
    })

    it('should handle negative spacing values', () => {
      const area = new CircularSpawnArea(center, radius, -5)
      
      expect(area.minSpacing).toBe(-5)
    })
  })

  describe('getRandomPosition', () => {
    it('should generate position within circle', () => {
      // Mock Math.random to return predictable values
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5) // Angle: π
        .mockReturnValueOnce(0.25) // Distance: sqrt(0.25) * radius = 0.5 * 25 = 12.5

      const position = spawnArea.getRandomPosition()

      // Expected: center + (cos(π) * 12.5, 0, sin(π) * 12.5)
      // cos(π) = -1, sin(π) ≈ 0
      expect(position.x).toBeCloseTo(center.x - 12.5, 2)
      expect(position.y).toBe(center.y) // No height variation with maxHeight = 0
      expect(position.z).toBeCloseTo(center.z, 2)
    })

    it('should generate position at center when random returns 0', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0) // Angle: 0
        .mockReturnValueOnce(0) // Distance: 0

      const position = spawnArea.getRandomPosition()

      expect(position.x).toBe(center.x)
      expect(position.y).toBe(center.y)
      expect(position.z).toBe(center.z)
    })

    it('should generate position at edge when random returns maximum', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0) // Angle: 0
        .mockReturnValueOnce(1) // Distance: sqrt(1) * radius = radius

      const position = spawnArea.getRandomPosition()

      // At angle 0: cos(0) = 1, sin(0) = 0
      expect(position.x).toBeCloseTo(center.x + radius, 2)
      expect(position.y).toBe(center.y)
      expect(position.z).toBeCloseTo(center.z, 2)
    })

    it('should apply height variation when maxHeight > 0', () => {
      const areaWithHeight = new CircularSpawnArea(center, radius, 1, true, 20)
      
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0) // Angle
        .mockReturnValueOnce(0) // Distance
        .mockReturnValueOnce(0.75) // Height: (0.75 - 0.5) * 20 * 2 = 10

      const position = areaWithHeight.getRandomPosition()

      expect(position.x).toBe(center.x)
      expect(position.y).toBe(center.y + 10)
      expect(position.z).toBe(center.z)
    })

    it('should apply negative height variation', () => {
      const areaWithHeight = new CircularSpawnArea(center, radius, 1, true, 10)
      
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0) // Angle
        .mockReturnValueOnce(0) // Distance  
        .mockReturnValueOnce(0.25) // Height: (0.25 - 0.5) * 10 * 2 = -5

      const position = areaWithHeight.getRandomPosition()

      expect(position.y).toBe(center.y - 5)
    })

    it('should use uniform distribution for distance (sqrt for correct distribution)', () => {
      // Test that distance calculation uses sqrt for uniform distribution
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0) // Angle: 0
        .mockReturnValueOnce(0.25) // Distance: sqrt(0.25) = 0.5

      const position = spawnArea.getRandomPosition()
      const expectedDistance = 0.5 * radius

      expect(position.x).toBeCloseTo(center.x + expectedDistance, 2)
    })
  })

  describe('generatePosition', () => {
    it('should return Position3D object', () => {
      const position = spawnArea.generatePosition()

      expect(position).toBeDefined()
      expect(position).toHaveProperty('x')
      expect(position).toHaveProperty('y')
      expect(position).toHaveProperty('z')
      expect(typeof position!.x).toBe('number')
      expect(typeof position!.y).toBe('number')
      expect(typeof position!.z).toBe('number')
    })

    it('should generate position within radius', () => {
      const position = spawnArea.generatePosition()!

      const distance = Math.sqrt(
        Math.pow(position.x - center.x, 2) +
        Math.pow(position.z - center.z, 2)
      )

      expect(distance).toBeLessThanOrEqual(radius)
    })

    it('should handle multiple generations', () => {
      const positions: Position3D[] = []

      for (let i = 0; i < 10; i++) {
        const pos = spawnArea.generatePosition()
        expect(pos).toBeDefined()
        positions.push(pos!)
      }

      expect(positions).toHaveLength(10)

      // All positions should be within radius
      positions.forEach(pos => {
        const distance = Math.sqrt(
          Math.pow(pos.x - center.x, 2) +
          Math.pow(pos.z - center.z, 2)
        )
        expect(distance).toBeLessThanOrEqual(radius)
      })
    })
  })

  describe('isValidPosition', () => {
    it('should return true for position at center', () => {
      const position: Position3D = { x: center.x, y: center.y, z: center.z }
      
      const isValid = spawnArea.isValidPosition(position)
      
      expect(isValid).toBe(true)
    })

    it('should return true for position within radius', () => {
      const position: Position3D = { 
        x: center.x + 10, 
        y: center.y, 
        z: center.z + 10 
      }
      
      const isValid = spawnArea.isValidPosition(position)
      
      expect(isValid).toBe(true)
    })

    it('should return false for position outside radius', () => {
      const position: Position3D = { 
        x: center.x + radius + 1, 
        y: center.y, 
        z: center.z 
      }
      
      const isValid = spawnArea.isValidPosition(position)
      
      expect(isValid).toBe(false)
    })

    it('should return true for position exactly on edge', () => {
      const position: Position3D = { 
        x: center.x + radius, 
        y: center.y, 
        z: center.z 
      }
      
      const isValid = spawnArea.isValidPosition(position)
      
      expect(isValid).toBe(true)
    })

    it('should ignore y-coordinate in distance calculation', () => {
      const position: Position3D = { 
        x: center.x + 10, 
        y: center.y + 1000, // Very high y
        z: center.z + 10 
      }
      
      const isValid = spawnArea.isValidPosition(position)
      
      expect(isValid).toBe(true) // Should still be valid despite high y
    })

    it('should handle negative coordinates', () => {
      const negativeCenter: Vector3 = { x: -50, y: 0, z: -75 }
      const negativeSpawnArea = new CircularSpawnArea(negativeCenter, 25)
      
      const position: Position3D = { 
        x: negativeCenter.x - 10, 
        y: negativeCenter.y, 
        z: negativeCenter.z + 15 
      }
      
      const isValid = negativeSpawnArea.isValidPosition(position)
      
      expect(isValid).toBe(true)
    })

    it('should handle floating point precision', () => {
      const position: Position3D = { 
        x: center.x + radius * 0.999999, 
        y: center.y, 
        z: center.z 
      }
      
      const isValid = spawnArea.isValidPosition(position)
      
      expect(isValid).toBe(true)
    })
  })

  describe('isWithinBounds', () => {
    it('should be alias for isValidPosition', () => {
      const position: Position3D = { 
        x: center.x + 10, 
        y: center.y, 
        z: center.z + 10 
      }
      
      const validResult = spawnArea.isValidPosition(position)
      const boundsResult = spawnArea.isWithinBounds(position)
      
      expect(boundsResult).toBe(validResult)
    })

    it('should return same result as isValidPosition for multiple positions', () => {
      const positions: Position3D[] = [
        { x: center.x, y: center.y, z: center.z }, // Center
        { x: center.x + radius, y: center.y, z: center.z }, // Edge
        { x: center.x + radius + 1, y: center.y, z: center.z }, // Outside
        { x: center.x - 5, y: center.y, z: center.z + 5 } // Inside
      ]

      positions.forEach(position => {
        const validResult = spawnArea.isValidPosition(position)
        const boundsResult = spawnArea.isWithinBounds(position)
        
        expect(boundsResult).toBe(validResult)
      })
    })
  })

  describe('distance calculation', () => {
    it('should calculate 2D distance correctly', () => {
      // Test internal distance method via isValidPosition
      const testCases = [
        { pos: { x: center.x + 5, y: center.y, z: center.z }, expected: 5 },
        { pos: { x: center.x, y: center.y, z: center.z + 5 }, expected: 5 },
        { pos: { x: center.x + 3, y: center.y, z: center.z + 4 }, expected: 5 }, // 3-4-5 triangle
        { pos: { x: center.x - 10, y: center.y, z: center.z - 10 }, expected: Math.sqrt(200) }
      ]

      testCases.forEach(({ pos, expected }) => {
        const shouldBeValid = expected <= radius
        const isValid = spawnArea.isValidPosition(pos)
        
        expect(isValid).toBe(shouldBeValid)
      })
    })

    it('should handle zero distance', () => {
      const centerPosition: Position3D = { x: center.x, y: center.y, z: center.z }
      
      const isValid = spawnArea.isValidPosition(centerPosition)
      
      expect(isValid).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle zero radius spawn area', () => {
      const zeroRadiusArea = new CircularSpawnArea(center, 0)
      
      // Only center should be valid
      expect(zeroRadiusArea.isValidPosition({ x: center.x, y: center.y, z: center.z })).toBe(true)
      expect(zeroRadiusArea.isValidPosition({ x: center.x + 1, y: center.y, z: center.z })).toBe(false)
      
      // Generation should work
      const position = zeroRadiusArea.generatePosition()
      expect(position).toBeDefined()
    })

    it('should handle very large radius', () => {
      const largeArea = new CircularSpawnArea(center, 10000)
      
      const farPosition: Position3D = { 
        x: center.x + 5000, 
        y: center.y, 
        z: center.z + 5000 
      }
      
      const isValid = largeArea.isValidPosition(farPosition)
      expect(isValid).toBe(true)
    })

    it('should handle very small radius', () => {
      const smallArea = new CircularSpawnArea(center, 0.001)
      
      const position = smallArea.generatePosition()
      expect(position).toBeDefined()
      
      const distance = Math.sqrt(
        Math.pow(position!.x - center.x, 2) +
        Math.pow(position!.z - center.z, 2)
      )
      
      expect(distance).toBeLessThanOrEqual(0.001)
    })

    it('should handle extreme coordinates', () => {
      const extremeCenter: Vector3 = { x: 1000000, y: -500000, z: 999999 }
      const extremeArea = new CircularSpawnArea(extremeCenter, 100)
      
      const position = extremeArea.generatePosition()
      expect(position).toBeDefined()
      
      const isValid = extremeArea.isValidPosition(position!)
      expect(isValid).toBe(true)
    })

    it('should handle negative radius gracefully', () => {
      // Negative radius should still work (absolute value used internally)
      const negativeRadiusArea = new CircularSpawnArea(center, -25)
      
      expect(negativeRadiusArea.radius).toBe(-25) // Constructor stores as-is
      
      // But functionality should still work logically
      const position = negativeRadiusArea.generatePosition()
      expect(position).toBeDefined()
    })

    it('should maintain type consistency', () => {
      expect(spawnArea.type).toBe('circular')
      
      // Type should be readonly
      const originalType = spawnArea.type
      expect(originalType).toBe('circular')
    })

    it('should handle rapid successive generations', () => {
      // Restore real Math.random for this test
      vi.restoreAllMocks()
      
      const positions: Position3D[] = []
      
      // Generate many positions quickly
      for (let i = 0; i < 1000; i++) {
        const pos = spawnArea.generatePosition()
        expect(pos).toBeDefined()
        positions.push(pos!)
      }
      
      // All should be valid
      positions.forEach(pos => {
        expect(spawnArea.isValidPosition(pos)).toBe(true)
      })
      
      // Should have variety (not all the same)
      // Round to 2 decimal places to avoid floating point precision issues
      const uniquePositions = new Set(positions.map(p => 
        `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`
      ))
      // With real randomness, we should get many unique positions
      expect(uniquePositions.size).toBeGreaterThan(100) // At least 100 unique positions out of 1000
    })
  })

  describe('mathematical correctness', () => {
    it('should use correct uniform distribution for disk sampling', () => {
      // Test that the sqrt is used for proper uniform distribution in disk
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0) // angle = 0
        .mockReturnValueOnce(0.25) // distance factor = 0.25

      const position = spawnArea.getRandomPosition()
      
      // Distance should be sqrt(0.25) * radius = 0.5 * radius
      const expectedDistance = 0.5 * radius
      const actualDistance = Math.sqrt(
        Math.pow(position.x - center.x, 2) +
        Math.pow(position.z - center.z, 2)
      )
      
      expect(actualDistance).toBeCloseTo(expectedDistance, 5)
    })

    it('should cover full 2π range for angles', () => {
      // Test various angle values
      const angleTests = [0, 0.25, 0.5, 0.75, 1.0]
      
      angleTests.forEach(angleRandom => {
        vi.spyOn(Math, 'random')
          .mockReturnValueOnce(angleRandom) // angle
          .mockReturnValueOnce(1) // max distance

        const position = spawnArea.getRandomPosition()
        const angle = angleRandom * Math.PI * 2
        
        const expectedX = center.x + Math.cos(angle) * radius
        const expectedZ = center.z + Math.sin(angle) * radius
        
        expect(position.x).toBeCloseTo(expectedX, 5)
        expect(position.z).toBeCloseTo(expectedZ, 5)
      })
    })
  })
})