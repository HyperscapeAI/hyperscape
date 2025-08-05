import EventEmitter from 'eventemitter3';

/**
 * Common test utilities and helpers
 */

/**
 * Test result interface
 */
export interface TestResult {
  testName?: string;
  section?: string;
  requirement?: string;
  passed: boolean;
  error?: string;
  details?: unknown;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  duration?: number;
}

/**
 * Mock World implementation for testing
 * Note: This creates a mock object that matches World interface
 * but doesn't extend the actual World class to avoid complexity
 */
export class MockWorld extends EventEmitter {
  // Required World properties
  id: string = 'mock_world_' + Date.now();
  audio: unknown = {};
  prefs: unknown = {};
  frame: number = 0;
  time: number = 0;
  accumulator: number = 0;
  networkRate: number = 20;
  assetsUrl: string | null = null;
  assetsDir: string | null = null;
  hot: Set<unknown> = new Set();
  rig: unknown = {};
  camera: unknown = {};
  maxDeltaTime: number = 1/60;
  fixedDeltaTime: number = 1/60;
  systems: unknown[] = [];
  systemsByName: Map<string, unknown> = new Map();

  constructor() {
    super();
  }
  
  // Event listeners map for testing
  private eventListeners: Map<string, Function[]> = new Map();
  
  // Required systems
  settings: unknown = {};
  anchors: unknown = {};
  events: unknown = {
    emit: (_name: string, _data: unknown) => {},
    on: (_name: string, _callback: Function) => {},
    off: (_name: string, _callback: Function) => {},
    once: (_name: string, _callback: Function) => {}
  };
  scripts: unknown = {};
  chat: unknown = {};
  entities: unknown = {
    spawn: () => null,
    despawn: () => {},
    getPlayer: () => null,
    getPlayers: () => [],
    getLocalPlayer: () => null,
    findByName: () => null,
    findByType: () => [],
    update: () => {},
    tick: () => {}
  };
  physics: unknown = {
    raycast: () => [],
    createMaterial: () => ({}),
    world: {}
  };
  stage: unknown = {};
  
  // RPG specific
  rpg?: unknown = {};
  
  // Additional properties
  builder?: unknown = { enabled: false };
  xr?: unknown;
  loader?: unknown = {
    get: (_type: string, _url: string) => null,
    load: (_url: string) => Promise.resolve(null)
  };
  network?: unknown = {
    isServer: true,
    isClient: false,
    send: () => {},
    broadcast: () => {}
  };
  environment?: unknown = {
    csm: {
      setupMaterial: () => {}
    }
  };
  graphics?: unknown = {};
  monitor?: unknown = {};
  livekit?: unknown = {};
  db?: unknown = {};
  server?: unknown = {};
  storage?: unknown = {};
  
  // Add controls with bind method for compatibility
  controls: unknown = {
    bind: (_options: unknown) => ({}),
    lockPointer: () => {},
    unlockPointer: () => {},
    pointer: { position: { x: 0, y: 0, z: 0 } },
    enabled: true
  };

  // World lifecycle methods (match exact World class signatures)
  topologicalSort(systems: unknown[]): unknown[] { return systems; }
  private preTick(): void {}
  private preFixedUpdate(_willFixedStep: boolean): void {}
  private fixedUpdate(_delta: number): void {}
  private postFixedUpdate(_delta: number): void {}
  private preUpdate(_alpha: number): void {}
  private update(_delta: number): void {}
  private postUpdate(_delta: number): void {}
  private lateUpdate(_delta: number, _alpha: number): void {}
  private postLateUpdate(_delta: number): void {}
  private commit(): void {}
  private postTick(): void {}
  
  // Public World interface methods
  start(): void {}
  destroy(): void {}
  getSystem<T = unknown>(systemKey: string): T | undefined {
    return this.systemsByName.get(systemKey) as T | undefined;
  }
  findSystem<T = unknown>(_nameOrConstructor: string): T | undefined {
    return undefined;
  }
  register(key: string, SystemClass: new(world: unknown) => unknown): unknown {
    const system = new SystemClass(this);
    this.systems.push(system);
    this.systemsByName.set(key, system);
    return system;
  }
  get isServer(): boolean { return false; }
  get isClient(): boolean { return true; }
  resolveURL(url: string, _allowLocal?: boolean): string { return url; }
  inject(_runtime: unknown): void {}
  raycast(_origin: unknown, _direction: unknown, _maxDistance?: number, _layerMask?: number): unknown { return null; }
  createLayerMask(..._layers: string[]): number { return 0; }
  queryState(_queryName: string, _context?: unknown): unknown { return null; }
  getAllStateQueries(): string[] { return []; }
  getTime(): number { return this.time; }
  setHot(_item: unknown, _hot: boolean): void {}
  setupMaterial = (_material: unknown): void => {}
  
  // Additional mock methods for testing
  getPlayer(_playerId?: string): unknown {
    return null;
  }  
  getPlayers(): unknown[] {
    return [];
  }
  
  // Add missing World interface methods
  async init(options?: { assetsUrl?: string; assetsDir?: string }): Promise<void> {
    // Mock initialization
    this.assetsUrl = options?.assetsUrl || null;
    this.assetsDir = options?.assetsDir || null;
  }
  
  tick = (time: number): void => {
    // Mock tick implementation
    this.time = time / 1000;
    this.frame++;
  }
}