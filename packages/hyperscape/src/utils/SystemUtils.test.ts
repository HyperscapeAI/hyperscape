/**
 * Unit tests for SystemUtils
 * Tests type-safe system access utilities for World objects
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, EntityData, World } from '../types';
import { System } from '../systems/System';
import { createMockWorld } from '../__tests__/utils/mockWorld';
import type * as THREE from '../extras/three';
import {
  type EntitiesSystem,
  type ChatSystem,
  type LoaderSystem,
  type GraphicsSystem,
  type StageSystem,
  type CameraSystem,
  type TerrainSystem,
  getCameraSystem,
  getChatSystem,
  getEntitiesSystem,
  getGraphicsSystem,
  getLoaderSystem,
  getNetworkSystem,
  getStageSystem,
  getSystem,
  getTerrainSystem,
  getWorldNetwork,
  hasSystem,
  isClient,
  isServer,
  requireSystem
} from './SystemUtils';

// Mock system classes for testing
class MockSystem extends System {
  name: string;
  
  constructor(name: string = 'mock-system') {
    // Create a minimal mock world to avoid circular dependency
    const mockWorld = {
      id: 'mock-world',
      getSystem: vi.fn(() => null),
      systemsByName: new Map(),
      systems: [],
      events: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
    } as unknown as World;
    
    super(mockWorld);
    this.name = name;
  }
}

class MockEntitiesSystem extends MockSystem implements EntitiesSystem {
  private entities = new Map<string, Entity>()

  add(data: EntityData, _local?: boolean): Entity | null {
    const entity = { 
      id: data.id || 'test-entity', 
      data,
      type: data.type || 'test'
    } as Entity
    this.entities.set(entity.id, entity)
    return entity
  }

  get(entityId: string): Entity | null {
    return this.entities.get(entityId) || null
  }
}

// MockSnapsSystem removed - Snaps system no longer exists in World

class MockChatSystem extends MockSystem implements ChatSystem {
  messages: Array<{ id?: string; from: string; body: string; text?: string; timestamp?: number }> = []

  add(message: { id?: string; from: string; body: string; text?: string; timestamp?: number }): void {
    this.messages.push({
      ...message,
      id: message.id || `msg-${Date.now()}`,
      timestamp: message.timestamp || Date.now()
    })
  }
}

class MockLoaderSystem extends MockSystem implements LoaderSystem {
  uploads: Array<{ type: string; url: string; data: File }> = []

  insert(type: string, url: string, data: File): void {
    this.uploads.push({ type, url, data })
  }
}

class MockGraphicsSystem extends MockSystem implements GraphicsSystem {
  renderer = {
    domElement: typeof document !== 'undefined' ? document.createElement('canvas') : (null as unknown as HTMLCanvasElement),
    render: vi.fn(),
    setSize: vi.fn()
  } as unknown as THREE.WebGLRenderer
}

class MockStageSystem extends MockSystem implements StageSystem {
  scene = {
    add: vi.fn(),
    remove: vi.fn(),
    children: []
  } as unknown as THREE.Scene

  raycastPointer(_position: { x: number; y: number }): Entity[] {
    return [] // Mock empty results
  }
}

class MockCameraSystem extends MockSystem implements CameraSystem {
  currentTarget: Entity | null = null

  setTarget(data: { target: Entity | THREE.Object3D }): void {
    this.currentTarget = data.target as Entity
  }
}

class MockTerrainSystem extends MockSystem implements TerrainSystem {
  getHeightAt(x: number, z: number): number {
    return Math.sin(x * 0.1) * Math.cos(z * 0.1) * 5 // Mock terrain height
  }

  query(position: { x: number; y: number; z: number }) {
    return {
      height: this.getHeightAt(position.x, position.z),
      normal: { x: 0, y: 1, z: 0 } // Mock normal vector
    }
  }
}



describe('SystemUtils', () => {
  let mockWorld: World
  let mockSystem: MockSystem

  beforeEach(() => {
    mockWorld = createMockWorld()
    mockSystem = new MockSystem('test-system')
  })

  describe('getSystem', () => {
    it('should return system when it exists', () => {
      mockWorld.systemsByName.set('test-system', mockSystem as unknown as System)
      
      const result = getSystem(mockWorld, 'test-system')
      
      expect(result).toBe(mockSystem)
    })

    it('should return null when system does not exist', () => {
      const result = getSystem(mockWorld, 'nonexistent-system')
      
      expect(result).toBeNull()
    })

    it('should throw error when world is null', () => {
      expect(() => getSystem(null as unknown as World, 'test-system')).toThrow('World is required')
    })

    it('should throw error when world is undefined', () => {
      expect(() => getSystem(undefined as unknown as World, 'test-system')).toThrow('World is required')
    })

    it('should preserve generic type information', () => {
      const specificSystem = new MockEntitiesSystem('entities')
      mockWorld.systemsByName.set('entities', specificSystem as unknown as System)
      
      const result = getSystem<EntitiesSystem>(mockWorld, 'entities')
      
      expect(result).toBe(specificSystem)
      expect(result?.add).toBeDefined()
      expect(result?.get).toBeDefined()
    })
  })

  describe('requireSystem', () => {
    it('should return system when it exists', () => {
      mockWorld.systemsByName.set('test-system', mockSystem as unknown as System)
      
      const result = requireSystem(mockWorld, 'test-system')
      
      expect(result).toBe(mockSystem)
    })

    it('should throw error when system does not exist', () => {
      expect(() => requireSystem(mockWorld, 'nonexistent-system'))
        .toThrow("Required system 'nonexistent-system' not found in world")
    })

    it('should throw error when getSystem returns null', () => {
      vi.mocked(mockWorld.getSystem).mockReturnValue(undefined)
      
      expect(() => requireSystem(mockWorld, 'test-system'))
        .toThrow("Required system 'test-system' not found in world")
    })

    it('should preserve generic type information', () => {
      const specificSystem = new MockEntitiesSystem('entities')
      mockWorld.systemsByName.set('entities', specificSystem as unknown as System)
      
      const result = requireSystem<EntitiesSystem>(mockWorld, 'entities')
      
      expect(result).toBe(specificSystem)
      expect(result.add).toBeDefined()
      expect(result.get).toBeDefined()
    })
  })

  describe('hasSystem', () => {
    it('should return true when system exists', () => {
      mockWorld.systemsByName.set('test-system', mockSystem as unknown as System)
      
      const result = hasSystem(mockWorld, 'test-system')
      
      expect(result).toBe(true)
    })

    it('should return false when system does not exist', () => {
      const result = hasSystem(mockWorld, 'nonexistent-system')
      
      expect(result).toBe(false)
    })

    it('should not throw error for null world', () => {
      expect(() => hasSystem(null as unknown as World, 'test-system')).toThrow('World is required')
    })
  })

  describe('getWorldNetwork', () => {
    it('should return network when world has network', () => {
      const result = getWorldNetwork(mockWorld)
      
      expect(result).toBe(mockWorld.network)
      expect(result?.send).toBeDefined()
    })

    it('should return null when world is null', () => {
      const result = getWorldNetwork(null as unknown as World)
      
      expect(result).toBeNull()
    })
  })

  describe('isServer', () => {
    it('should return true when world.isServer is true', () => {
      const serverWorld = createMockWorld({ isServer: true })
      
      const result = isServer(serverWorld)
      
      expect(result).toBe(true)
    })

    it('should return false when neither world.isServer nor network.isServer are true', () => {
      const result = isServer(mockWorld)
      
      expect(result).toBe(false)
    })
  })

  describe('isClient', () => {
    it('should return true when world.isClient is true', () => {
      const result = isClient(mockWorld)
      
      expect(result).toBe(true)
    })
  })

  describe('getNetworkSystem', () => {
    it('should return network system when network exists', () => {
      const result = getNetworkSystem(mockWorld)
      
      expect(result).toBe(mockWorld.network)
    })
  })

  describe('getEntitiesSystem', () => {
    it('should return entities system when it exists', () => {
      const entitiesSystem = new MockEntitiesSystem('entities')
      mockWorld.systemsByName.set('entities', entitiesSystem as unknown as System)
      
      const result = getEntitiesSystem(mockWorld)
      
      expect(result).toBe(entitiesSystem)
      expect(result?.add).toBeDefined()
      expect(result?.get).toBeDefined()
    })

    it('should return null when entities system does not exist', () => {
      const mockWorld = createMockWorld({ entities: undefined });
      
      // No system registered, should return null
      const result = getEntitiesSystem(mockWorld);
      expect(result).toBeNull();
    });

    it('should work with entity operations', () => {
      const entitiesSystem = new MockEntitiesSystem('entities')
      mockWorld.systemsByName.set('entities', entitiesSystem as unknown as System)
      
      const result = getEntitiesSystem(mockWorld)
      
      expect(result).toBeDefined()
      if (result?.add) {
        const entity = result.add({ id: 'test-entity', type: 'test' })
        expect(entity?.id).toBe('test-entity')
        
        if (result.get) {
          const retrieved = result.get('test-entity')
          expect(retrieved).toBe(entity)
        }
      }
    })
  })

  describe('getChatSystem', () => {
    it('should return chat system when it exists', () => {
      const chatSystem = new MockChatSystem('chat')
      mockWorld.systemsByName.set('chat', chatSystem as unknown as System)
      
      const result = getChatSystem(mockWorld)
      
      expect(result).toBe(chatSystem)
      expect(result?.add).toBeDefined()
    })

    it('should return null when chat system does not exist', () => {
      const mockWorld = createMockWorld({ chat: undefined });
      const result = getChatSystem(mockWorld)
      
      expect(result).toBeNull()
    })

    it('should work with message operations', () => {
      const chatSystem = new MockChatSystem('chat')
      mockWorld.systemsByName.set('chat', chatSystem as unknown as System)
      
      const result = getChatSystem(mockWorld)
      expect(result).not.toBeNull()
      
      result!.add({ from: 'user1', body: 'Hello world!' })
      
      expect(chatSystem.messages).toHaveLength(1)
      expect(chatSystem.messages[0].from).toBe('user1')
      expect(chatSystem.messages[0].body).toBe('Hello world!')
      expect(chatSystem.messages[0].id).toBeDefined()
      expect(chatSystem.messages[0].timestamp).toBeDefined()
    })
  })

  describe('getLoaderSystem', () => {
    it('should return loader system when it exists', () => {
      const loaderSystem = new MockLoaderSystem('loader')
      mockWorld.systemsByName.set('loader', loaderSystem as unknown as System)
      
      const result = getLoaderSystem(mockWorld)
      
      expect(result).toBe(loaderSystem)
      expect(result?.insert).toBeDefined()
    })

    it('should return null when loader system does not exist', () => {
      const mockWorld = createMockWorld({ loader: undefined });
      const result = getLoaderSystem(mockWorld);
      expect(result).toBeNull();
    });

    it('should work with file operations', () => {
      const loaderSystem = new MockLoaderSystem('loader')
      mockWorld.systemsByName.set('loader', loaderSystem as unknown as System)
      
      const result = getLoaderSystem(mockWorld)
      expect(result).not.toBeNull()
      
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      result!.insert('text', 'test.txt', mockFile)
      
      expect(loaderSystem.uploads).toHaveLength(1)
      expect(loaderSystem.uploads[0].type).toBe('text')
      expect(loaderSystem.uploads[0].url).toBe('test.txt')
      expect(loaderSystem.uploads[0].data).toBe(mockFile)
    })
  })

  describe('getGraphicsSystem', () => {
    it('should return graphics system when it exists', () => {
      const graphicsSystem = new MockGraphicsSystem('graphics')
      mockWorld.systemsByName.set('graphics', graphicsSystem as unknown as System)
      
      const result = getGraphicsSystem(mockWorld)
      
      expect(result).toBe(graphicsSystem)
      expect(result?.renderer).toBeDefined()
    })

    it('should return null when graphics system does not exist', () => {
      const mockWorld = createMockWorld({ graphics: undefined });
      const result = getGraphicsSystem(mockWorld);
      expect(result).toBeNull();
    });

    it('should provide access to renderer', () => {
      const graphicsSystem = new MockGraphicsSystem('graphics');
      mockWorld.systemsByName.set('graphics', graphicsSystem as unknown as System);
      const result = getGraphicsSystem(mockWorld);
      if (typeof document !== 'undefined') {
        expect(result?.renderer?.domElement).toBeInstanceOf(HTMLCanvasElement);
      }
    });
  })

  describe('getStageSystem', () => {
    it('should return stage system when it exists', () => {
      const stageSystem = new MockStageSystem('stage')
      mockWorld.systemsByName.set('stage', stageSystem as unknown as System)
      
      const result = getStageSystem(mockWorld)
      
      expect(result).toBe(stageSystem)
      expect(result?.scene).toBeDefined()
      expect(result?.raycastPointer).toBeDefined()
    })

    it('should return null when stage system does not exist', () => {
      const mockWorld = createMockWorld({ stage: undefined });
      const result = getStageSystem(mockWorld);
      expect(result).toBeNull();
    });

    it('should work with scene and raycasting', () => {
      const stageSystem = new MockStageSystem('stage')
      mockWorld.systemsByName.set('stage', stageSystem as unknown as System)
      
      const result = getStageSystem(mockWorld)
      expect(result).not.toBeNull()
      
      const raycastResult = result!.raycastPointer({ x: 100, y: 200 })
      expect(raycastResult).toEqual([])
      
      expect(result?.scene?.add).toBeDefined()
      expect(result?.scene?.remove).toBeDefined()
    })
  })

  describe('getCameraSystem', () => {
    it('should return rpg-camera system when it exists', () => {
      const cameraSystem = new MockCameraSystem('rpg-camera')
      mockWorld.systemsByName.set('rpg-camera', cameraSystem as unknown as System)
      
      const result = getCameraSystem(mockWorld)
      
      expect(result).toBe(cameraSystem)
    })

    it('should fallback to client-camera system', () => {
      const cameraSystem = new MockCameraSystem('client-camera');
      const mockWorld = createMockWorld({});
      mockWorld.systemsByName.set('client-camera', cameraSystem as unknown as System);
      const result = getCameraSystem(mockWorld);
      expect(result).toBe(cameraSystem);
    });

    it('should prefer rpg-camera over client-camera', () => {
      const rpgCameraSystem = new MockCameraSystem('rpg-camera')
      const clientCameraSystem = new MockCameraSystem('client-camera')
      
      mockWorld.systemsByName.set('rpg-camera', rpgCameraSystem)
      mockWorld.systemsByName.set('client-camera', clientCameraSystem)
      
      const result = getCameraSystem(mockWorld)
      
      expect(result).toBe(rpgCameraSystem)
    })

    it('should return null when no camera system exists', () => {
      const mockWorld = createMockWorld({});
      const result = getCameraSystem(mockWorld);
      expect(result).toBeNull();
    });

    it('should work with camera target operations', () => {
      const cameraSystem = new MockCameraSystem('rpg-camera')
      mockWorld.systemsByName.set('rpg-camera', cameraSystem as unknown as System)
      
      const result = getCameraSystem(mockWorld)
      expect(result).not.toBeNull()
      
      const mockTarget = { id: 'target-entity' } as Entity
      result!.setTarget({ target: mockTarget })
      
      expect(cameraSystem.currentTarget).toBe(mockTarget)
    })
  })

  describe('getTerrainSystem', () => {
    it('should return terrain system when it exists', () => {
      const terrainSystem = new MockTerrainSystem('terrain');
      mockWorld.systemsByName.set('terrain', terrainSystem);
      const result = getTerrainSystem(mockWorld);
      expect(result).toBe(terrainSystem);
    });

    it('should return null when terrain system does not exist', () => {
      const mockWorld = createMockWorld({ terrain: undefined });
      const result = getTerrainSystem(mockWorld);
      expect(result).toBeNull();
    });

    it('should work with terrain height queries', () => {
      const terrainSystem = new MockTerrainSystem('terrain');
      mockWorld.systemsByName.set('terrain', terrainSystem);
      const result = getTerrainSystem(mockWorld);
      expect(result).not.toBeNull();
      const height = result!.getHeightAt(10, 20);
      expect(typeof height).toBe('number');
    });

    it('should handle terrain queries with realistic values', () => {
      const terrainSystem = new MockTerrainSystem('terrain');
      mockWorld.systemsByName.set('terrain', terrainSystem);
      const result = getTerrainSystem(mockWorld);
      expect(result).not.toBeNull();
      const positions = [
        { x: 0, z: 0 },
        { x: 10, z: 10 },
        { x: -5, z: 15 }
      ];
      positions.forEach(pos => {
        const height = result!.getHeightAt(pos.x, pos.z);
        expect(typeof height).toBe('number');
        expect(height).toBeGreaterThanOrEqual(-5);
        expect(height).toBeLessThanOrEqual(5);
      });
    });
  })

  describe('edge cases and error handling', () => {
    it('should handle world with partial system implementations', () => {
      const partialWorld = {
        getSystem: vi.fn(() => ({
          // System with no specific interface methods
        }))
      } as unknown as World
      
      expect(() => getSystem(partialWorld, 'test')).not.toThrow()
      expect(getSystem(partialWorld, 'test')).toBeDefined()
    })

    it('should handle systems with missing optional methods', () => {
      const partialEntitiesSystem = new MockSystem('entities')
      mockWorld.systemsByName.set('entities', partialEntitiesSystem)
      
      const result = getEntitiesSystem(mockWorld)
      
      expect(result).toBe(partialEntitiesSystem)
      // Should not have add/get methods since it's just MockSystem
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any)?.add).toBeUndefined()
    })

    it('should handle concurrent system access', () => {
      mockWorld.systemsByName.set('concurrent-system', mockSystem)
      
      const results = Array.from({ length: 10 }, () => 
        getSystem(mockWorld, 'concurrent-system')
      )
      
      results.forEach(result => {
        expect(result).toBe(mockSystem)
      })
    })

    it('should handle system key variations', () => {
      mockWorld.systemsByName.set('test-system', mockSystem as unknown as System)
      
      expect(getSystem(mockWorld, 'test-system')).toBe(mockSystem)
      expect(getSystem(mockWorld, 'test-System')).toBeNull() // Case sensitive
      expect(getSystem(mockWorld, 'test_system')).toBeNull() // Different separator
      expect(getSystem(mockWorld, '')).toBeNull() // Empty string
    })
  })

  describe('type safety', () => {
    it('should maintain type safety with generic constraints', () => {
      const typedSystem = new MockEntitiesSystem('entities')
      mockWorld.systemsByName.set('entities', typedSystem as unknown as System)
      
      // TypeScript should infer correct types
      const result = getSystem<EntitiesSystem>(mockWorld, 'entities')
      
      if (result) {
        // These should all be properly typed
        const entity = typedSystem.add({ id: 'test', type: 'test' })
        const found = typedSystem.get('test')
        
        expect(entity?.id).toBe('test')
        expect(found).toBe(entity)
      }
    })


  })
})