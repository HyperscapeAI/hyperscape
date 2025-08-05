import EventEmitter from 'eventemitter3';
import type {
  HyperscapeObject3D
} from '../types/three-extensions';
import * as THREE from './extras/three';
// MaterialSetupFunction removed - unused import
import { ClientLiveKit } from './systems/ClientLiveKit';

/**
 * Plugin interface for extending Hyperscape worlds
 */
export interface WorldPlugin {
  name: string;
  version?: string;
  registerSystems: (world: World) => void | Promise<void>;
  setupAPI?: (world: World) => void | Promise<void>;
}

import { Anchors, Anchors as AnchorsSystem } from './systems/Anchors';
import { Chat, Chat as ChatSystem } from './systems/Chat';
import { Entities, Entities as EntitiesSystem } from './systems/Entities';
import { Events, Events as EventsSystem } from './systems/Events';
import { Physics, Physics as PhysicsSystem } from './systems/Physics';
import { Settings, Settings as SettingsSystem } from './systems/Settings';
import { Stage, Stage as StageSystem } from './systems/Stage';
import { System } from './systems/System';
import { ClientAudio, ClientControls, ClientEnvironment, ClientGraphics, ClientLoader, ClientMonitor, ClientNetwork, ClientPrefs, ClientStats, ClientUI, HotReloadable, Player, ServerDB, ServerServer, SystemConstructor, WorldOptions } from '../types';
import type { ServerNetwork } from './systems/ServerNetwork';
import { ClientActions } from './systems/ClientActions';
import { Particles } from './systems/Particles';
import { XR } from './systems/XR';

class MockNetwork extends System {
  // Common network properties
  ids = -1;
  id: string | null = null;
  isClient = true;
  isServer = false;
  queue: Array<[string, unknown]> = [];
  maxUploadSize = 0;
  
  // Client-specific properties
  ws: WebSocket | null = null;
  apiUrl: string | null = null;
  serverTimeOffset = 0;
  
  // Server-specific properties (for compatibility)
  sockets = new Map();
  socketIntervalId: NodeJS.Timeout | null = null;
  saveTimerId: NodeJS.Timeout | null = null;
  spawn = { position: [0, 0, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number] };
  handlers: { [method: string]: (socket: unknown, data: unknown) => void | Promise<void> } = {};
  
  constructor(world: World) {
    super(world);
  }

  async init(_options: WorldOptions): Promise<void> {
    // Mock network doesn't need initialization
  }

  send<T = unknown>(_name: string, _data?: T): void {
    // Mock implementation - does nothing
  }

  async upload(_file: File): Promise<void> {
    // Mock implementation - does nothing
  }

  enqueue(_method: string, _data: unknown): void {
    // Mock implementation - does nothing  
  }

  flush(): void {
    // Mock implementation - does nothing
  }

  preFixedUpdate(): void {
    // Mock network flush (does nothing)
  }
}

export class World extends EventEmitter {

  // Time management
  maxDeltaTime = 1 / 30; // 0.33333
  fixedDeltaTime = 1 / 50; // 0.01666
  frame = 0;
  time = 0;
  accumulator = 0;
  
  // Core properties
  id: string;
  systems: System[] = [];
  systemsByName = new Map<string, System>();
  networkRate = 1 / 8; // 8Hz
  assetsUrl!: string;
  assetsDir!: string;
  hot = new Set<HotReloadable>();
  
  // Builder/movement state
  moving?: boolean;
  
  // Three.js objects
  rig: HyperscapeObject3D;
  camera: THREE.PerspectiveCamera;
  
  // Systems
  settings!: Settings & {
    public?: boolean;
    playerLimit?: number;
    avatar?: { url: string };
    title?: string;
    desc?: string;
    image?: { url: string };
    model?: { url: string };
    serialize?: () => unknown;
    deserialize?: (data: unknown) => void;
    on?: (event: string, callback: () => void) => void;
  };
  anchors!: Anchors;
  events!: Events;
  chat!: Chat & {
    add?: (message: unknown, sync?: boolean) => void;
    clear?: (sync: boolean) => void;
    serialize?: () => unknown;
    messages?: Array<{ id?: string; from: string; body: string; text?: string; timestamp?: number }>;
  };
  entities!: Entities & {
    add?: (data: unknown, local?: boolean) => unknown;
    serialize?: () => unknown;
    getPlayer: (playerId: string) => Player;
    getLocalPlayer: () => Player;
    getPlayers: () => Player[];
    player: Player;
  };
  physics!: Physics;
  stage!: Stage & {
    scene?: {
      add?: (obj: unknown) => void;
      remove?: (obj: unknown) => void;
    };
    THREE?: typeof THREE;
  };
  particles?: Particles;
  
  // Optional client systems
  ui?: ClientUI & {
    active?: boolean;
    appendChild?: (element: HTMLElement) => void;
    removeChild?: (element: HTMLElement) => void;
    getBoundingClientRect?: () => DOMRect;
    applyTheme?: (theme: unknown) => void;
  };
  loader?: ClientLoader;
  network: ClientNetwork | ServerNetwork;
  environment?: ClientEnvironment;
  graphics?: ClientGraphics & {
    renderer?: {
      domElement: HTMLCanvasElement;
      render?: (scene: unknown, camera: unknown) => void;
      setSize?: (width: number, height: number) => void;
    };
  };
  controls?: ClientControls;
  prefs?: ClientPrefs;
  audio?: ClientAudio;
  monitor?: ClientMonitor & {
    getStats?: () => Promise<{ currentCPU: number; currentMemory: number; maxMemory: number }>;
  };
  livekit?: ClientLiveKit & {
    getPlayerOpts?: (id: string) => Promise<unknown>;
    on?: (event: string, callback: (data: unknown) => void) => void;
    setScreenShareTarget?: (targetId: string) => void;
  };
  stats?: ClientStats;
  
  // Optional server systems
  db?: ServerDB;
  server?: ServerServer;
  storage?: unknown; // Type not fully defined in interface
  
  // Client systems that might be dynamically added  
  builder?: {
    enabled: boolean;
    mode?: string;
    tool?: string;
  };
  actions?: ClientActions & {
    btnDown?: boolean;
    execute?: (actionName: string, params?: Record<string, unknown>) => Promise<unknown>;
    getAvailable?: () => string[];
  };
  xr?: XR;
  terrain?: {
    getHeightAt: (x: number, z: number) => number;
    generate: (params: Record<string, unknown>) => void;
  };
  
  // Move app state
  moveApp?: {
    enabled?: boolean;
  };
  
  // Legacy property access patterns
  entity?: {
    id?: string;
    position?: { x: number; y: number; z: number };
    [key: string]: unknown;
  };
  
  // Action registry (added by RPGActionRegistry system)
  actionRegistry?: {
    getAll(): Array<{ name: string; [key: string]: unknown }>;
    getAvailable(context: Record<string, unknown>): Array<{ name: string; [key: string]: unknown }>;
    execute(name: string, context: Record<string, unknown>, params: Record<string, unknown>): Promise<unknown>;
  };
  
  // RPG system (added by RPGSystemLoader)
  rpg?: {
    systems: Record<string, { name: string; [key: string]: unknown }>;
    actions: Record<string, { name: string; execute: (params: Record<string, unknown>) => Promise<unknown>; [key: string]: unknown }>;
    getCombatLevel(playerId: string): number;
    getPlayer(playerId: string): { id: string; [key: string]: unknown };
    getSkills(playerId: string): Record<string, { level: number; xp: number }>;
    getInventory(playerId: string): Array<{ itemId: string; quantity: number; [key: string]: unknown }>;
    getEquipment(playerId: string): Record<string, { itemId: string; [key: string]: unknown }>;
    getPlayerHealth(playerId: string): { current: number; max: number };
    getPlayerStamina(playerId: string): { current: number; max: number };
  };
  
  colorDetector?: {
    detectColor(x: number, y: number): { r: number; g: number; b: number; a: number };
    getPixels(): Uint8Array;
    registerEntityColor(entityType: string, config: { color: number | string; hex?: string; tolerance?: number }): void;
  };

  // Test-specific properties
  _testPlayers?: Map<string, unknown>;
  _allowMaterial?: boolean;

  // Asset loading
  assetLoader?: {
    loadModel?: (url: string) => void;
  };

  // Add getSystem method with proper type safety
  getSystem<T extends System = System>(systemKey: string): T | undefined {
    return this.systemsByName.get(systemKey) as T | undefined;
  }
  
  // System lifecycle methods are implemented later in the class

  // Helper method to find systems by name or constructor name
  findSystem<T extends System = System>(nameOrConstructor: string): T | undefined {
    const system = this.systems.find((s) => {
      return s.constructor.name === nameOrConstructor || 
             ('name' in s && (s as Record<string, unknown>).name === nameOrConstructor);
    });
    return system as T | undefined;
  }

  // Helper properties for common access patterns
  get isServer(): boolean {
    return this.network.isServer ?? false;
  }

  get isClient(): boolean {
    return this.network.isClient ?? true;
  }

  constructor() {
    super();

    // Generate unique world ID
    this.id = `world_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.rig = new THREE.Object3D() as HyperscapeObject3D;
    // NOTE: camera near is slightly smaller than spherecast. far is slightly more than skybox.
    // this gives us minimal z-fighting without needing logarithmic depth buffers
    this.camera = new THREE.PerspectiveCamera(70, 0, 0.2, 1200);
    this.rig.add(this.camera);

    // Register core systems
    this.register('settings', SettingsSystem);
    this.register('anchors', AnchorsSystem);
    this.register('events', EventsSystem);
    this.register('chat', ChatSystem);
    this.register('entities', EntitiesSystem);
    
    // Register Physics system on both client and server - now supported with Node.js-compatible PhysX
    this.register('physics', PhysicsSystem);
    
    this.register('stage', StageSystem);

    this.network = new MockNetwork(this) as unknown as ClientNetwork | ServerNetwork;
  }



  register(key: string, SystemClass: SystemConstructor): System {
    const system = new SystemClass(this);
    this.addSystem(key, system);
    return system;
  }

  addSystem(key: string, system: System): void {
    this.systems.push(system);
    this.systemsByName.set(key, system);
    // Dynamically assign system to world instance with type safety
    Object.defineProperty(this, key, {
      value: system,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }

  /**
   * Topologically sort systems based on their dependencies
   */
  topologicalSort(systems: System[]): System[] {
    const sorted: System[] = [];
    const visited = new Set<System>();
    const visiting = new Set<System>();
    
    const systemToName = new Map<System, string>();
    this.systemsByName.forEach((system, name) => {
      systemToName.set(system, name);
    });

    const visit = (system: System) => {
      if (visited.has(system)) return;
      if (visiting.has(system)) {
        const systemName = systemToName.get(system) || system.constructor.name;
        throw new Error(`Circular dependency detected involving system: ${systemName}`);
      }

      visiting.add(system);
      
      const deps = system.getDependencies();
      if (deps.required) {
        for (const depName of deps.required) {
          const depSystem = this.systemsByName.get(depName);
          if (!depSystem) {
            const systemName = systemToName.get(system) || system.constructor.name;
            throw new Error(`System ${systemName} requires ${depName}, but ${depName} is not registered`);
          }
          visit(depSystem);
        }
      }
      
      visiting.delete(system);
      visited.add(system);
      sorted.push(system);
    };

    for (const system of systems) {
      visit(system);
    }
    
    return sorted;
  }

  async init(options: WorldOptions): Promise<void> {
    this.storage = options.storage;
    this.assetsDir = options.assetsDir ?? '';
    this.assetsUrl = options.assetsUrl ?? '/assets/';
    
    // Sort systems based on dependencies
    const sortedSystems = this.topologicalSort(this.systems);
    
    // Initialize systems in dependency order
    for (const system of sortedSystems) {
      await system.init(options);
    }
    
    this.start();
  }

  start(): void {
    for (const system of this.systems) {
      system.start();
    }
  }

  tick = (time: number): void => {
    // begin any stats/performance monitors
    this.preTick();
    
    // update time, delta, frame and accumulator
    time /= 1000;
    let delta = time - this.time;
    if (delta < 0) delta = 0;
    if (delta > this.maxDeltaTime) {
      delta = this.maxDeltaTime;
    }
    
    this.frame++;
    this.time = time;
    this.accumulator += delta;
    
    // prepare physics
    const willFixedStep = this.accumulator >= this.fixedDeltaTime;
    this.preFixedUpdate(willFixedStep);
    
    // run as many fixed updates as we can for this ticks delta
    while (this.accumulator >= this.fixedDeltaTime) {
      // run all fixed updates
      this.fixedUpdate(this.fixedDeltaTime);
      // step physics
      this.postFixedUpdate(this.fixedDeltaTime);
      // decrement accumulator
      this.accumulator -= this.fixedDeltaTime;
    }
    
    // interpolate physics for remaining delta time
    const alpha = this.accumulator / this.fixedDeltaTime;
    this.preUpdate(alpha);
    
    // run all updates
    this.update(delta, alpha);
    
    // run post updates, eg cleaning all node matrices
    this.postUpdate(delta);
    
    // run all late updates
    this.lateUpdate(delta, alpha);
    
    // run post late updates, eg cleaning all node matrices
    this.postLateUpdate(delta);
    
    // commit all changes, eg render on the client
    this.commit();
    
    // end any stats/performance monitors
    this.postTick();
  }

  private preTick(): void {
    for (const system of this.systems) {
      system.preTick();
    }
  }

  private preFixedUpdate(willFixedStep: boolean): void {
    for (const system of this.systems) {
      system.preFixedUpdate(willFixedStep);
    }
  }

  private fixedUpdate(delta: number): void {
    for (const item of Array.from(this.hot)) {
      item.fixedUpdate(delta);
    }
    for (const system of this.systems) {
      system.fixedUpdate(delta);
    }
  }

  private postFixedUpdate(delta: number): void {
    for (const system of this.systems) {
      system.postFixedUpdate(delta);
    }
  }

  private preUpdate(alpha: number): void {
    for (const system of this.systems) {
      system.preUpdate(alpha);
    }
  }

  private update(delta: number, _alpha: number): void {
    for (const item of Array.from(this.hot)) {
      item.update(delta);
    }
    for (const system of this.systems) {
      try {
        system.update(delta);
      } catch (_error) {
        console.error(`[World] Error in system update:`, system.constructor.name, _error);
        throw _error;
      }
    }
  }

  private postUpdate(delta: number): void {
    for (const system of this.systems) {
      system.postUpdate(delta);
    }
  }

  private lateUpdate(delta: number, _alpha: number): void {
    for (const item of Array.from(this.hot)) {
      item.lateUpdate(delta);
    }
    for (const system of this.systems) {
      system.lateUpdate(delta);
    }
  }

  private postLateUpdate(delta: number): void {
    for (const item of Array.from(this.hot)) {
      item.postLateUpdate(delta);
    }
    for (const system of this.systems) {
      system.postLateUpdate(delta);
    }
  }

  private commit(): void {
    for (const system of this.systems) {
      system.commit();
    }
  }

  private postTick(): void {
    for (const system of this.systems) {
      system.postTick();
    }
  }

  setupMaterial = (material: THREE.Material): void => {
    // @ts-ignore - CSM is added by environment system
    this.environment?.csm?.setupMaterial(material);
  }

  setHot(item: HotReloadable, hot: boolean): void {
    if (hot) {
      this.hot.add(item);
    } else {
      this.hot.delete(item);
    }
  }

  resolveURL(url: string, allowLocal?: boolean): string {
    if (!url) return url;
    url = url.trim();
    
    if (url.startsWith('blob')) {
      return url;
    }
    
    if (url.startsWith('asset://')) {
      if (this.assetsDir && allowLocal) {
        // Ensure assetsDir has trailing slash for proper URL construction
        const assetsDir = this.assetsDir.endsWith('/') ? this.assetsDir : this.assetsDir + '/';
        return url.replace('asset://', assetsDir);
      } else if (this.assetsUrl) {
        // Ensure assetsUrl has trailing slash for proper URL construction
        const assetsUrl = this.assetsUrl.endsWith('/') ? this.assetsUrl : this.assetsUrl + '/';
        return url.replace('asset://', assetsUrl);
      } else {
        console.error('resolveURL: no assetsUrl or assetsDir defined');
        return url;
      }
    }
    
    if (url.match(/^https?:\/\//i)) {
      return url;
    }
    
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    
    if (url.startsWith('/')) {
      return url;
    }
    
    return `https://${url}`;
  }

  inject(_runtime: unknown): void {
    // This method is no longer needed as apps property is removed
    // this.apps.inject(runtime);
  }

  // Helper methods for common access patterns
  getPlayer(playerId?: string): Player {
    if (playerId) {
      return this.entities.getPlayer(playerId);
    }
    // If no playerId provided, try to get local player
    return this.entities.getLocalPlayer();
  }

  getPlayers(): Player[] {
    return this.entities?.getPlayers() || [];
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance?: number, layerMask?: number): import('../types').RaycastHit | null {
    return this.physics?.raycast(origin, direction, maxDistance, layerMask) || null;
  }

  createLayerMask(...layers: string[]): number {
    // Delegate to physics system - assume it exists
    return this.physics.createLayerMask(...layers);
  }

  queryState(_queryName: string, _context?: unknown): unknown {
    // This would need to be implemented for state queries
    console.warn('queryState not implemented yet');
    return null;
  }

  getAllStateQueries(): string[] {
    // This would need to be implemented for state queries
    console.warn('getAllStateQueries not implemented yet');
    return [];
  }

  getTime(): number {
    return this.time;
  }

  destroy(): void {
    for (const system of this.systems) {
      system.destroy();
    }
    
    this.systems = [];
    this.hot.clear();
    this.removeAllListeners();
  }


} 