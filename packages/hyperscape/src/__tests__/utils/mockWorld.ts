/**
 * Mock world utilities for testing
 * This file contains test-specific utilities that should not be included in production builds
 */

import { vi } from 'vitest';
import type { EntityData, System, World } from '../../types';

/**
 * Consolidated createMockWorld function for all tests
 * This replaces the multiple scattered createMockWorld implementations
 */
export function createMockWorld(overrides: Partial<World> = {}): World {
  const mockWorld = {
    // Core World properties
    id: 'mock-world-' + Date.now(),
    frame: 0,
    time: 0,
    accumulator: 0,
    networkRate: 20,
    assetsUrl: null,
    assetsDir: null,
    hot: new Set(),
    systems: [],
    systemsByName: new Map(),
    maxDeltaTime: 1/60,
    fixedDeltaTime: 1/60,
    
    // Three.js objects
    rig: {
      add: vi.fn(),
      remove: vi.fn(),
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    camera: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      fov: 70,
      near: 0.1,
      far: 1000
    },
    
    // Network system
    network: {
      isServer: false,
      isClient: true,
      send: vi.fn(),
      broadcast: vi.fn(),
      id: 'mock-network'
    },
    
    // Events system
    events: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      listeners: new Map()
    },
    
    // Entities system
    entities: {
      add: vi.fn((data: EntityData) => ({
        id: data.id || 'mock-entity', 
        data,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      })),
      get: vi.fn(),
      remove: vi.fn(),
      has: vi.fn(),
      values: vi.fn(() => []),
      player: null,
      items: new Map(),
      players: new Map(),
      getPlayer: vi.fn(),
      getLocalPlayer: vi.fn(),
      getPlayers: vi.fn(() => [])
    },
    
    // Chat system
    chat: {
      add: vi.fn((message) => {
        const chatMessage = {
          id: message.id || `msg-${Date.now()}`,
          from: message.from,
          body: message.body,
          text: message.text || message.body,
          timestamp: message.timestamp || Date.now()
        };
        return chatMessage;
      }),
      subscribe: vi.fn(() => () => {}),
      listeners: []
    },
    
    // Physics system
    physics: {
      enabled: true,
      gravity: { x: 0, y: -9.81, z: 0 },
      timeStep: 1 / 60,
      substeps: 1,
      world: {},
      controllers: new Map(),
      rigidBodies: new Map(),
      createRigidBody: vi.fn(() => ({})),
      createCharacterController: vi.fn(() => ({})),
      createMaterial: vi.fn(() => ({})),
      raycast: vi.fn(() => []),
      step: vi.fn()
    },
    
    // Stage system
    stage: {
      scene: {
        add: vi.fn(),
        remove: vi.fn(),
        children: [],
        traverse: vi.fn(),
        getObjectByName: vi.fn()
      },
      raycastPointer: vi.fn(() => [])
    },
    
    // Settings system
    settings: {
      get: vi.fn(),
      set: vi.fn(),
      data: {}
    },
    
    // Anchors system
    anchors: {
      create: vi.fn(),
      destroy: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => [])
    },
    
    // Optional client systems
    loader: {
      get: vi.fn(),
      load: vi.fn(() => Promise.resolve(null)),
      insert: vi.fn(),
      uploads: []
    },
    
    graphics: {
      renderer: {
        domElement: typeof document !== 'undefined' ? document.createElement('canvas') : null,
        render: vi.fn(),
        setSize: vi.fn()
      }
    },
    
    controls: {
      bind: vi.fn(() => ({
        release: vi.fn(),
        options: {},
        entries: {},
        actions: null,
        api: {
          setActions: vi.fn(),
          release: vi.fn()
        }
      })),
      lockPointer: vi.fn(),
      unlockPointer: vi.fn(),
      pointer: { position: { x: 0, y: 0, z: 0 } },
      enabled: true
    },
    
    environment: {
      csm: {
        setupMaterial: vi.fn()
      }
    },
    
    // Terrain system (optional)
    terrain: {
      getHeightAt: vi.fn((x: number, z: number) => Math.sin(x * 0.1) * Math.cos(z * 0.1) * 5),
      query: vi.fn((position) => ({
        height: Math.sin(position.x * 0.1) * Math.cos(position.z * 0.1) * 5,
        normal: { x: 0, y: 1, z: 0 }
      }))
    },
    
    // Camera system (or client)
    'rpg-camera': {
      currentTarget: null,
      setTarget: vi.fn((data) => {
        mockWorld['rpg-camera'].currentTarget = data.target;
      })
    },
    
    'client-camera': {
      currentTarget: null,
      setTarget: vi.fn((data) => {
        mockWorld['client-camera'].currentTarget = data.target;
      })
    },
    
    // World methods
    getSystem: vi.fn(<T extends System = System>(systemKey: string): T | undefined => {
      return mockWorld.systemsByName.get(systemKey) as T | undefined;
    }),
    
    addSystem: vi.fn((key: string, system: System) => {
      mockWorld.systems.push(system);
      mockWorld.systemsByName.set(key, system);
      // Set system on world object dynamically
      Object.assign(mockWorld, { [key]: system });
    }),
    
    register: vi.fn((key: string, SystemClass: new (world: World) => System) => {
      const system = new SystemClass(mockWorld);
      mockWorld.systems.push(system);
      mockWorld.systemsByName.set(key, system);
      // Set system on world object dynamically
      Object.assign(mockWorld, { [key]: system });
      return system;
    }),
    
    // Server/client detection
    get isServer() { return mockWorld.network.isServer || false; },
    get isClient() { return mockWorld.network.isClient || true; },
    
    // EventEmitter methods
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    
    // Lifecycle methods
    init: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    update: vi.fn(),
    fixedUpdate: vi.fn(),
    lateUpdate: vi.fn(),
    
    ...overrides
  } as unknown as World;
  
  return mockWorld;
}