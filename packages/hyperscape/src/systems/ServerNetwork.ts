import { isNumber } from 'lodash-es';
import moment from 'moment';

import type { Entity } from '../entities/Entity';
import { writePacket } from '../packets';
import { Socket } from '../Socket';
import type { SystemDatabase } from '../types/database-types';
import { dbHelpers, isDatabaseInstance } from '../types/database-types';
import type { World, WorldOptions } from '../types/index';
import type {
  ChatMessage,
  ConnectionParams,
  NetworkWithSocket,
  NodeWebSocket,
  ServerStats,
  SpawnData,
  User
} from '../types/network-types';
import { addRole, hasRole, removeRole, serializeRoles, uuid } from '../utils';
import { createJWT, verifyJWT } from '../utils-server';
import { System } from './System';
import { EventType } from '../types/events';
import type { TerrainSystem } from './TerrainSystem';
import THREE from '../extras/three';

// Entity already has velocity property

const SAVE_INTERVAL = parseInt(process.env.SAVE_INTERVAL || '60'); // seconds
const PING_RATE = 1; // seconds
const defaultSpawn = '{ "position": [0, 50, 0], "quaternion": [0, 0, 0, 1] }';  // Safe default height

const HEALTH_MAX = 100;

// Re-export shared network types for backward compatibility
export type { ChatMessage, ConnectionParams, ServerStats, SpawnData, User } from '../types/network-types';

type QueueItem = [Socket, string, unknown];

// Handler data types for network messages

interface EntityEventData {
  id: string;
  event: string;
  payload?: unknown;
}

interface EntityRemovedData {
  id: string;
}

// Base handler function type - allows any data type for flexibility
type NetworkHandler = (socket: Socket, data: unknown) => void | Promise<void>;

/**
 * Server Network System
 *
 * - runs on the server
 * - provides abstract network methods matching ClientNetwork
 *
 */
export class ServerNetwork extends System implements NetworkWithSocket {
  id: number;
  ids: number;
  sockets: Map<string, Socket>;
  socketIntervalId: NodeJS.Timeout;
  saveTimerId: NodeJS.Timeout | null;
  isServer: boolean;
  isClient: boolean;
  queue: QueueItem[];
  db!: SystemDatabase; // Database instance (Knex) - initialized in init()
  spawn: SpawnData;
  maxUploadSize: number;

  // Handler method registry - using NetworkHandler type for flexibility
  private handlers: Record<string, NetworkHandler> = {};
  // Server-authoritative movement with physics simulation
  private moveTargets: Map<string, { 
    target: THREE.Vector3; 
    velocity: THREE.Vector3; // Current velocity
    maxSpeed: number; // Max movement speed
    currentRotation?: THREE.Quaternion; // Track current rotation for smooth turning
    lastBroadcast?: number; // Track last broadcast time to throttle updates
  }> = new Map();
  private _tempVec3_1 = new THREE.Vector3();
  private _tempVec3_2 = new THREE.Vector3();
  private _tempVec3_3 = new THREE.Vector3();
  private _tempVec3_4 = new THREE.Vector3();
  private _tempQuat = new THREE.Quaternion();

  // Add lastQuaternion per entity
  private lastStates = new Map(); // Add quaternion to lastState
  // In broadcast, for q:
  // const last = this.lastStates.get(entity.id) || {q: [0,0,0,1]};
  // const qDelta = quatSubtract(currentQuaternion, last.q);
  // Quantize and send qDelta, update last

  constructor(world: World) {
    super(world);
    this.id = 0;
    this.ids = -1;
    this.sockets = new Map();
    this.socketIntervalId = setInterval(() => this.checkSockets(), PING_RATE * 1000);
    this.saveTimerId = null;
    this.isServer = true;
    this.isClient = false;
    this.queue = [];
    this.spawn = JSON.parse(defaultSpawn);
    this.maxUploadSize = 50; // Default 50MB upload limit
    
    // Register handler methods with proper signatures (packet system adds 'on' prefix)
    this.handlers['onChatAdded'] = this.onChatAdded.bind(this);
    this.handlers['onCommand'] = this.onCommand.bind(this);
    this.handlers['onEntityModified'] = this.onEntityModified.bind(this);
    this.handlers['onEntityEvent'] = this.onEntityEvent.bind(this);
    this.handlers['onEntityRemoved'] = this.onEntityRemoved.bind(this);
    this.handlers['onSettings'] = this.onSettings.bind(this);
    this.handlers['onMoveRequest'] = this.onMoveRequest.bind(this);
    this.handlers['onInput'] = this.onInput.bind(this);
  }

  async init(options: WorldOptions): Promise<void> {
    // Validate that db exists and has the expected shape
    if (!options.db || !isDatabaseInstance(options.db)) {
      throw new Error('[ServerNetwork] Valid database instance not provided in options');
    }
    
    // Database is properly typed now, no casting needed
    this.db = options.db;
  }

  async start(): Promise<void> {
    if (!this.db) {
      throw new Error('[ServerNetwork] Database not available in start method');
    }
    // get spawn
    const spawnRow = await this.db('config').where('key', 'spawn').first();
    const spawnValue = spawnRow?.value || defaultSpawn;
    this.spawn = JSON.parse(spawnValue);
    
    // We'll ground the spawn position to terrain when players connect, not here
    // The terrain system might not be ready yet during startup
    console.log('[ServerNetwork] Default spawn loaded:', this.spawn.position);
    
    
    // hydrate entities
    const entities = await this.db('entities');
    if (entities && Array.isArray(entities)) {
      for (const entity of entities) {
        const entityWithData = entity as { data: string };
        const data = JSON.parse(entityWithData.data);
        data.state = {};
        // Add entity if method exists
        if (this.world.entities.add) {
          this.world.entities.add(data, true);
        }
      }
    }
    
    // hydrate settings
    const settingsRow = await this.db('config').where('key', 'settings').first();
    try {
      const settings = JSON.parse(settingsRow?.value || '{}');
      // Deserialize settings if the method exists
      if (this.world.settings.deserialize) {
        this.world.settings.deserialize(settings);
      }
    } catch (_err) {
      console.error(_err);
    }
    
    // watch settings changes
    // Listen for settings changes if the method exists
    if (this.world.settings.on) {
      this.world.settings.on('change', this.saveSettings);
    }
    
    // queue first save
    if (SAVE_INTERVAL) {
      this.saveTimerId = setTimeout(this.save, SAVE_INTERVAL * 1000);
    }
    
    // Environment model loading is handled by ServerEnvironment.start()
  }

  override preFixedUpdate(): void {
    this.flush();
  }

  override update(dt: number): void {
    // Advance server-authoritative player movement with physics simulation
    if (this.moveTargets.size === 0) return;
    
    // Process all move targets
    
    // Tune movement so clients observe noticeable displacement within a few network ticks
    const ACCELERATION = 120.0; // Units per second squared (fast ramp-up to max speed)
    const DRAG = 2.0; // Deceleration factor (gentle drag to avoid sluggish starts)
    const BRAKE_DISTANCE = 2.0; // Start braking this far from target
    const ARRIVAL_THRESHOLD = 0.2; // Consider arrived within this distance
    
    const toDelete: string[] = [];
    this.moveTargets.forEach((info, playerId) => {
      const entity = this.world.entities.get(playerId);
      if (!entity) {
        // Only log if debugging network issues
        // console.warn(`[ServerNetwork] No entity found for player ${playerId}, removing from move targets`);
        toDelete.push(playerId);
        return;
      }
      
      
      // Get current position - handle both entity.position and entity.node.position
      let current;
      if (entity.position) {
        current = entity.position;
      } else if (entity.node && entity.node.position) {
        current = entity.node.position;
      } else {
        console.error(`[ServerNetwork] Entity ${playerId} has no position property!`);
        toDelete.push(playerId);
        return;
      }
      const target = info.target;
      
      // Calculate direction to target (XZ plane only)
      const dx = target.x - current.x;
      const dz = target.z - current.z;
      const distXZ = Math.sqrt(dx * dx + dz * dz);
      
      // Check if arrived
      if (distXZ < ARRIVAL_THRESHOLD) {
        // Stop and snap to target
        info.velocity.set(0, 0, 0);
        
        // Get final terrain height
        const terrain = this.world.getSystem('terrain') as TerrainSystem | null;
        let finalY = target.y;
        if (terrain) {
          const th = terrain.getHeightAt(target.x, target.z);
          if (Number.isFinite(th)) {
            finalY = (th as number) + 0.1;
          }
        }
        
        entity.position.set(target.x, finalY, target.z);
        if (entity.data) {
          entity.data.position = [target.x, finalY, target.z];
          // Store velocity in data for network sync
          if (!entity.data.velocity) {
            entity.data.velocity = [0, 0, 0];
          } else {
            entity.data.velocity = [0, 0, 0];
          }
        }
        
        toDelete.push(playerId);
        // Broadcast final state
        this.send('entityModified', { 
          id: playerId, 
          changes: { 
            p: [target.x, finalY, target.z],
            v: [0, 0, 0], // Velocity
            e: 'idle' 
          } 
        });
        return;
      }
      
      // Calculate desired velocity
      const direction = this._tempVec3_1.set(dx / distXZ, 0, dz / distXZ);
      const desiredVelocity = this._tempVec3_2.copy(direction).multiplyScalar(info.maxSpeed);
      
      // Apply acceleration toward desired velocity
      const velocityDiff = this._tempVec3_3.subVectors(desiredVelocity, info.velocity);
      const acceleration = this._tempVec3_4.copy(velocityDiff).normalize().multiplyScalar(ACCELERATION * dt);
      info.velocity.add(acceleration);
      
      // Apply braking when close to target
      if (distXZ < BRAKE_DISTANCE) {
        const brakeFactor = distXZ / BRAKE_DISTANCE;
        info.velocity.multiplyScalar(brakeFactor);
      }
      
      // Apply drag
      info.velocity.multiplyScalar(1 - DRAG * dt);
      
      // Limit to max speed
      const speed = info.velocity.length();
      if (speed > info.maxSpeed) {
        info.velocity.normalize().multiplyScalar(info.maxSpeed);
      }
      
      // Update position
      const nx = current.x + info.velocity.x * dt;
      const nz = current.z + info.velocity.z * dt;
      
      // Movement calculation completed
      
      // Clamp to terrain with proper offset
      const terrain = this.world.getSystem('terrain') as TerrainSystem | null;
      let ny = current.y;
      
      // ALWAYS ensure minimum height first
      if (ny < 0) {
        console.error(`[ServerNetwork] WARNING: Player ${playerId} has fallen to Y=${ny.toFixed(2)}! Emergency correction to Y=10`);
        ny = 10; // Emergency height
      }
      
      if (terrain) {
        const th = terrain.getHeightAt(nx, nz);
        if (Number.isFinite(th) && th > -100 && th < 1000) {
          // Keep player slightly above terrain (10cm) to prevent clipping
          ny = (th as number) + 0.1;
        } else {
          // Invalid terrain height - use safe default
          console.warn(`[ServerNetwork] Invalid terrain height at (${nx.toFixed(1)}, ${nz.toFixed(1)}): ${th}, using safe height Y=10`);
          ny = 10; // Safe default height
        }
      } else {
        // No terrain system - use safe default
        console.warn('[ServerNetwork] No terrain system available for movement clamping, using Y=10');
        ny = 10;
      }
      
      // Apply position update - handle both entity.position and entity.node.position
      if (entity.position && entity.position.set) {
        entity.position.set(nx, ny, nz);
        // Commented out verbose position logging
        // console.log(`[ServerNetwork] Updated entity ${playerId} position to (${nx.toFixed(1)}, ${ny.toFixed(1)}, ${nz.toFixed(1)})`);
      } else if (entity.node && entity.node.position && entity.node.position.set) {
        entity.node.position.set(nx, ny, nz);
        // console.log(`[ServerNetwork] Updated entity ${playerId} node.position to (${nx.toFixed(1)}, ${ny.toFixed(1)}, ${nz.toFixed(1)})`);
      } else {
        console.error(`[ServerNetwork] Cannot set position for entity ${playerId} - no position property!`);
      }

      // Update entity data for serialization
      if (entity.data) {
        entity.data.position = [nx, ny, nz];
        // Store velocity in data for network sync
        if (!entity.data.velocity) {
          entity.data.velocity = [info.velocity.x, info.velocity.y, info.velocity.z];
        } else {
          entity.data.velocity = [info.velocity.x, info.velocity.y, info.velocity.z];
        }
      }
      
      // Smooth rotation: compute target rotation and interpolate
      let qArr: [number, number, number, number] | undefined;
      const moveDir = this._tempVec3_1.set(dx, 0, dz);
      if (moveDir.lengthSq() > 1e-6) {
        moveDir.normalize();
        const forward = this._tempVec3_2.set(0, 0, -1);
        const targetRotation = this._tempQuat.setFromUnitVectors(forward, moveDir);
        
        // Initialize current rotation if not set
        if (!info.currentRotation) {
          // Try to get from entity's current rotation
          if (entity.node && entity.node.quaternion) {
            info.currentRotation = entity.node.quaternion.clone();
          } else {
            info.currentRotation = new THREE.Quaternion();
          }
        }
        
        // Smoothly interpolate rotation with wider turn radius
        // Using 0.02 for server-side rotation (slower = wider turns)
        const rotationSpeed = 0.02;
        info.currentRotation.slerp(targetRotation, rotationSpeed);
        
        // Update entity's quaternion
        if (entity.node) {
          entity.node.quaternion.copy(info.currentRotation);
        }
        
        // Also update entity.data.quaternion for serialization
        if (entity.data) {
          entity.data.quaternion = [info.currentRotation.x, info.currentRotation.y, info.currentRotation.z, info.currentRotation.w];
        }
        
        qArr = [info.currentRotation.x, info.currentRotation.y, info.currentRotation.z, info.currentRotation.w];
      }
      
      
      // Throttle broadcasts to reduce network traffic
      const now = Date.now();
      // In update, change BROADCAST_INTERVAL to 33 for moving entities
      const BROADCAST_INTERVAL = info.velocity.length() > 0 ? 33 : 50;
      const shouldBroadcast = !info.lastBroadcast || (now - info.lastBroadcast) >= BROADCAST_INTERVAL;
      
      if (shouldBroadcast) {
        info.lastBroadcast = now;
        
        // Determine animation state based on speed
        const speed = info.velocity.length();
        const emote = speed > 4 ? 'run' : speed > 0.1 ? 'walk' : 'idle';
        
        const payload = {
          id: playerId,
          changes: {
            p: [nx, ny, nz],
            q: qArr || [0,0,0,1], // Always include
            s: entity.scale ? [entity.scale.x, entity.scale.y, entity.scale.z] : undefined,
            v: [info.velocity.x, info.velocity.y, info.velocity.z], // Include velocity
            e: emote,
          },
        };
        
        // Send to all clients (including originator for server authority)
        this.send('entityModified', payload);
      }
    });
    toDelete.forEach(id => this.moveTargets.delete(id));
  }

  send<T = unknown>(name: string, data: T, ignoreSocketId?: string): void {
    const packet = writePacket(name, data);
    // Only log non-entityModified packets to reduce spam
    // Keep logs quiet in production unless debugging a specific packet
    this.sockets.forEach(socket => {
      if (socket.id === ignoreSocketId) {
        return;
      }
      socket.sendPacket(packet);
    });
  }

  sendTo<T = unknown>(socketId: string, name: string, data: T): void {
    const socket = this.sockets.get(socketId);
    socket?.send(name, data);
  }

  checkSockets(): void {
    // see: https://www.npmjs.com/package/ws#how-to-detect-and-close-broken-connections
    const dead: Socket[] = [];
    this.sockets.forEach(socket => {
      if (!socket.alive) {
        dead.push(socket);
      } else {
        socket.ping();
      }
    });
    dead.forEach(socket => socket.disconnect());
  }

  enqueue(socket: Socket, method: string, data: unknown): void {
    this.queue.push([socket, method, data]);
  }

  onDisconnect(socket: Socket, code?: number | string): void {
    // Handle socket disconnection
      // Only log disconnects if debugging connection issues
      // console.log(`[ServerNetwork] Socket ${socket.id} disconnected with code:`, code);
    
    // Remove socket from our tracking
    this.sockets.delete(socket.id);
    
    // Clean up any socket-specific resources
    if (socket.player) {
    // Emit typed player left event
    this.world.emit(EventType.PLAYER_LEFT, {
      playerId: socket.player.id,
      reason: code ? `disconnect_${code}` : 'disconnect'
    });
      
      // Remove player entity from world
      if (this.world.entities?.remove) {
        this.world.entities.remove(socket.player.id);
      }
      // Broadcast entity removal to all remaining clients
      try {
        this.send('entityRemoved', socket.player.id);
      } catch (_err) {
        console.error('[ServerNetwork] Failed to broadcast entityRemoved for player:', _err);
      }
    }
  }

  flush(): void {
    if (this.queue.length > 0) {
      // console.debug(`[ServerNetwork] Flushing ${this.queue.length} packets`)
    }
    while (this.queue.length) {
      try {
        const [socket, method, data] = this.queue.shift()!;
        const handler = this.handlers[method];
        if (handler) {
          handler.call(this, socket, data);
        } else {
          console.warn(`[ServerNetwork] No handler for packet: ${method}`);
        }
      } catch (_err) {
        console.error(_err);
      }
    }
  }

  getTime(): number {
    return performance.now() / 1000; // seconds
  }

  save = async (): Promise<void> => {
    // queue again
    this.saveTimerId = setTimeout(this.save, SAVE_INTERVAL * 1000);
  };

  saveSettings = async (): Promise<void> => {
    // Serialize settings if the method exists
    const data = this.world.settings.serialize ? this.world.settings.serialize() : {};
    const value = JSON.stringify(data);
    await dbHelpers.setConfig(this.db, 'settings', value);
  };

  isAdmin(player: Entity | { data?: { roles?: string[] } }): boolean {
    return hasRole(player.data?.roles, 'admin');
  }

  isBuilder(player: Entity | { data?: { roles?: string[] } }): boolean {
    return this.world.settings.public || this.isAdmin(player);
  }

  async onConnection(ws: NodeWebSocket, params: ConnectionParams): Promise<void> {
    try {
      // check player limit
      // Check player limit setting
      const playerLimit = this.world.settings.playerLimit;
      if (isNumber(playerLimit) && playerLimit > 0 && this.sockets.size >= playerLimit) {
        const packet = writePacket('kick', 'player_limit');
        ws.send(packet);
        ws.close();
        return;
      }

      // check connection params
      let authToken = params.authToken;
      const name = params.name;
      const avatar = params.avatar;

      // get or create user
      let user: User | undefined;
      if (authToken) {
        try {
          const jwtPayload = await verifyJWT(authToken);
          if (jwtPayload && typeof jwtPayload.userId === 'string') {
            const dbResult = await this.db('users').where('id', jwtPayload.userId).first();
            if (dbResult) {
              // Strong type assumption - dbResult has user properties
              user = dbResult as User;
            }
          }
        } catch (err) {
          console.error('failed to read authToken:', authToken, err);
        }
      }
      if (!user) {
        user = {
          id: uuid(),
          name: 'Anonymous',
          avatar: null,
          roles: '',
          createdAt: moment().toISOString(),
        };
        await this.db('users').insert({
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          roles: Array.isArray(user.roles) ? user.roles.join(',') : user.roles,
          createdAt: user.createdAt
        });
        authToken = await createJWT({ userId: user.id });
      }
      
      // Convert roles string to array
      if (typeof user.roles === 'string') {
        user.roles = user.roles.split(',').filter(r => r);
      }

      // Allow multiple sessions per user for development/testing; do not kick duplicates

      // Only grant admin in development mode when no admin code is set
      // This prevents accidental admin access in production
      if (!process.env.ADMIN_CODE && process.env.NODE_ENV === 'development') {
        console.warn('[ServerNetwork] No ADMIN_CODE set in development mode - granting temporary admin access');
        // user.roles is already a string[] at this point after conversion
        if (Array.isArray(user.roles)) {
          user.roles.push('~admin');
        }
      }

      // livekit options
      // Get LiveKit options if available
      const livekit = await this.world.livekit?.getPlayerOpts?.(user.id);

      // create unique socket id per connection
      const socketId = uuid();
      const socket = new Socket({ 
        id: socketId, 
        ws, 
        network: this 
      });

      // Wait for terrain system to be ready before spawning players
      const terrain = this.world.getSystem<TerrainSystem>('terrain');
      if (terrain) {
        // Wait for terrain to be ready
        let terrainReady = false;
        for (let i = 0; i < 100; i++) {  // Wait up to 10 seconds
          if (terrain.isReady && terrain.isReady()) {
            terrainReady = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
          if (i % 10 === 0) {
            console.log(`[ServerNetwork] Waiting for terrain to be ready... (${i/10}s)`);
          }
        }
        
        if (!terrainReady) {
          console.error('[ServerNetwork] Terrain system not ready after 10 seconds!');
          ws.close(1001, 'Server terrain not ready');
          return;
        }
      }
      
      // Check if player has saved position in database
      let spawnPosition: [number, number, number];
      let playerRow: import('../types/database').PlayerRow | null = null;
      
      // Try to load player position from DatabaseSystem if available
      const databaseSystem = this.world.getSystem('rpg-database') as import('./DatabaseSystem').DatabaseSystem | undefined;
      if (databaseSystem) {
        try {
          playerRow = databaseSystem.getPlayer(socketId);
          if (playerRow && playerRow.positionX !== undefined) {
            const savedY = playerRow.positionY !== undefined && playerRow.positionY !== null 
              ? Number(playerRow.positionY) 
              : 50;  // Use safe default if undefined/null
            
            // NEVER trust saved Y if it's invalid
            if (savedY < -5 || savedY > 200) {
              console.error(`[ServerNetwork] REJECTED invalid saved Y position: ${savedY}, using default spawn`);
              spawnPosition = Array.isArray(this.spawn.position)
                ? [
                    Number(this.spawn.position[0]) || 0, 
                    Number(this.spawn.position[1] ?? 50),  // Safe Y fallback
                    Number(this.spawn.position[2]) || 0
                  ]
                : [0, 50, 0];  // Safe default height
            } else {
              spawnPosition = [
                Number(playerRow.positionX) || 0,
                savedY,
                Number(playerRow.positionZ) || 0
              ];
              console.log('[ServerNetwork] Loaded saved player position:', { x: spawnPosition[0], y: spawnPosition[1], z: spawnPosition[2] });
            }
          } else {
            // Use default spawn for new players
            spawnPosition = Array.isArray(this.spawn.position)
              ? [
                  Number(this.spawn.position[0]) || 0, 
                  Number(this.spawn.position[1] ?? 50),  // Use 50 as fallback, not 0
                  Number(this.spawn.position[2]) || 0
                ]
              : [0, 50, 0];  // Safe default with proper Y height
            console.log('[ServerNetwork] Using default spawn for new player:', { x: spawnPosition[0], y: spawnPosition[1], z: spawnPosition[2] });
          }
        } catch (_err: unknown) {
          // If DatabaseSystem is not ready yet, use default spawn without error
          console.log('[ServerNetwork] DatabaseSystem not ready yet, using default spawn');
          spawnPosition = Array.isArray(this.spawn.position)
            ? [
                Number(this.spawn.position[0]) || 0, 
                Number(this.spawn.position[1] ?? 50),  // Safe Y fallback
                Number(this.spawn.position[2]) || 0
              ]
            : [0, 50, 0];  // Safe default height
        }
      } else {
        // DatabaseSystem not available, use default spawn
        console.log('[ServerNetwork] DatabaseSystem not available, using default spawn');
        spawnPosition = Array.isArray(this.spawn.position)
          ? [
              Number(this.spawn.position[0]) || 0, 
              Number(this.spawn.position[1] ?? 50),  // Safe Y fallback
              Number(this.spawn.position[2]) || 0
            ]
          : [0, 50, 0];  // Safe default height
      }
      
      // Ground spawn position to terrain height
      const terrainSystem = this.world.getSystem('terrain') as TerrainSystem | null;
      
      // Check if terrain system is ready using its isReady() method
      if (terrainSystem && terrainSystem.isReady && terrainSystem.isReady()) {
        const terrainHeight = terrainSystem.getHeightAt(spawnPosition[0], spawnPosition[2]);

        if (Number.isFinite(terrainHeight) && terrainHeight > -100 && terrainHeight < 1000) {
          // Always use terrain height, even for saved positions (in case terrain changed)
          spawnPosition[1] = terrainHeight + 0.1;
          console.log(`[ServerNetwork] Grounded spawn to Y=${spawnPosition[1]} (terrain=${terrainHeight})`);
        } else {
          // Invalid terrain height - use safe default
          console.error(`[ServerNetwork] TerrainSystem.getHeightAt returned invalid height: ${terrainHeight} at x=${spawnPosition[0]}, z=${spawnPosition[2]}`);
          console.error(`[ServerNetwork] Using safe spawn height Y=10`);
          spawnPosition[1] = 10; // Safe default height
        }
      } else {
        // Terrain not ready yet - use safe default height
        if (terrainSystem && !terrainSystem.isReady()) {
          console.warn('[ServerNetwork] Terrain system exists but is not ready yet (tiles still generating) - using safe spawn Y=10');
        } else if (!terrainSystem) {
          console.error('[ServerNetwork] WARNING: Terrain system not available for grounding! Using Y=10');
        }
        spawnPosition[1] = 10;
      }
      
      console.log('[ServerNetwork] FINAL spawn position:', { x: spawnPosition[0], y: spawnPosition[1], z: spawnPosition[2] });

      // DEBUG: Check if position is actually being passed correctly
      if (Math.abs(spawnPosition[1]) < 1) {
        console.error('[ServerNetwork] WARNING: Spawn Y is near ground level:', spawnPosition[1]);
      }

      console.log(`[ServerNetwork] Creating player entity for socket ${socketId}`);
      const addedEntity = this.world.entities.add ? this.world.entities.add(
        {
          id: socketId,
          type: 'player',
          position: spawnPosition,
          quaternion: Array.isArray(this.spawn.quaternion) ? [...this.spawn.quaternion] as [number, number, number, number] : [0,0,0,1],
          owner: socket.id, // owning session id
          userId: user.id, // account id
          name: name || user.name,
          health: HEALTH_MAX,
          avatar: user.avatar || this.world.settings.avatar?.url || 'asset://avatar.vrm',
          sessionAvatar: avatar || undefined,
          roles: user.roles,
        }
      ) : undefined;
      socket.player = addedEntity || undefined;

      // send snapshot
      const serializedEntities = this.world.entities.serialize() || [];
      
      // DEBUG: Check if player entity was serialized correctly
      const playerEntity = serializedEntities.find((e: { id: string }) => e.id === socketId);
      if (playerEntity) {
        console.log('[ServerNetwork] Serialized player position in snapshot:', playerEntity.position);
        if (Array.isArray(playerEntity.position) && Math.abs(playerEntity.position[1]) < 1) {
          console.error('[ServerNetwork] ERROR: Player Y in snapshot is near ground:', playerEntity.position[1]);
        }
      } else {
        console.error('[ServerNetwork] ERROR: Player entity not found in serialized entities!');
      }
      
      socket.send('snapshot', {
        id: socket.id,
        serverTime: performance.now(),
        assetsUrl: this.world.assetsUrl,  // Use the world's configured assetsUrl
        apiUrl: process.env.PUBLIC_API_URL,
        maxUploadSize: process.env.PUBLIC_MAX_UPLOAD_SIZE,
        settings: this.world.settings.serialize() || {},
        chat: this.world.chat.serialize() || [],
        entities: serializedEntities,
        livekit,
        authToken,
      });

      this.sockets.set(socket.id, socket);
      console.log(`[ServerNetwork] Socket added. Total sockets: ${this.sockets.size}`);

      // Emit typed player joined event (after snapshot)
      if (socket.player) {
        const playerId = socket.player.data.id as string;
      console.log('[ServerNetwork] Emitting typed PLAYER_JOINED for playerId:', playerId);
      this.world.emit(EventType.PLAYER_JOINED, { playerId });
      }

      // Broadcast new player entity to all existing clients except the new connection
      if (addedEntity) {
        try {
          this.send('entityAdded', addedEntity.serialize(), socket.id);
        } catch (err) {
          console.error('[ServerNetwork] Failed to broadcast entityAdded for new player:', err);
        }
      }
    } catch (_err) {
      console.error(_err);
    }
  }

  onChatAdded = (socket: Socket, data: unknown): void => {
    const msg = data as ChatMessage;
    // Add message to chat if method exists
    if (this.world.chat.add) {
      this.world.chat.add(msg, false);
    }
    this.send('chatAdded', msg, socket.id);
  };

  onCommand = async (socket: Socket, data: unknown): Promise<void> => {
    const args = data as string[];
    // TODO: check for spoofed messages, permissions/roles etc
    // handle slash commands
    const player = socket.player;
    if (!player) return;
    const [cmd, arg1] = args;
    
    // become admin command
    if (cmd === 'admin') {
      const code = arg1;
      if (process.env.ADMIN_CODE && process.env.ADMIN_CODE === code) {
        const id = player.data.id;
        const userId = player.data.userId;
        const roles = player.data.roles || [];
        const granting = !hasRole(roles, 'admin');
        if (granting) {
          addRole(roles, 'admin');
        } else {
          removeRole(roles, 'admin');
        }
        player.modify({ roles });
        this.send('entityModified', { id, changes: { roles } });
        socket.send('chatAdded', {
          id: uuid(),
          from: null,
          fromId: null,
          body: granting ? 'Admin granted!' : 'Admin revoked!',
          createdAt: moment().toISOString(),
        });
        if (userId) {
          const rolesString = serializeRoles(roles);
          await this.db('users')
            .where('id', userId)
            .update({ roles: rolesString });
        }
      }
    }
    
    if (cmd === 'name') {
      const name = arg1;
      if (name) {
        const id = player.data.id;
        const userId = player.data.userId;
        player.data.name = name;
        player.modify({ name });
        this.send('entityModified', { id, changes: { name } });
        socket.send('chatAdded', {
          id: uuid(),
          from: null,
          fromId: null,
          body: `Name set to ${name}!`,
          createdAt: moment().toISOString(),
        });
        if (userId) {
          await this.db('users').where('id', userId).update({ name });
        }
      }
    }

    // Server-driven movement: move this socket's player entity randomly and broadcast
    if (cmd === 'move') {
      const mode = arg1 || 'random'
      if (!player) return
      const entity = player
      const curr = entity.position
      let nx = curr.x
      const _ny = curr.y
      let nz = curr.z
      if (mode === 'random') {
        // Ensure movement is at least 1.5 units to pass test assertions
        const minRadius = 1.5
        const maxRadius = 3
        const angle = Math.random() * Math.PI * 2
        const radius = minRadius + Math.random() * (maxRadius - minRadius)
        const dx = Math.cos(angle) * radius
        const dz = Math.sin(angle) * radius
        nx = curr.x + dx
        nz = curr.z + dz
      } else if (mode === 'to' && args.length >= 4) {
        // move to specified coordinates: /move to x y z
        const x = parseFloat(args[2])
        const y = parseFloat(args[3])
        const z = parseFloat(args[4])
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          nx = x; const _ny = y; nz = z
        }
      }
      // Apply on server entity
      // Clamp Y to terrain height on all server-side position sets via command
      const terrain = this.world.getSystem('terrain') as TerrainSystem | null
      if (!terrain) {
        throw new Error('[ServerNetwork] Terrain system not available for chat move')
      }
      const th = terrain.getHeightAt(nx, nz)
      if (!Number.isFinite(th)) {
        throw new Error(`[ServerNetwork] Invalid terrain height for chat move at x=${nx}, z=${nz}`)
      }
      const gy = th + 0.1
      entity.position.set(nx, gy, nz)
      // Broadcast to all clients, including the origin, using normalized shape
      this.send('entityModified', { id: entity.id, changes: { p: [nx, gy, nz] } })
    }
    
    if (cmd === 'spawn') {
      const op = arg1;
      // TODO: Parse spawn operation properly
      console.log('[ServerNetwork] Spawn command:', op);
    }
    
    if (cmd === 'chat') {
      const op = arg1;
      if (op === 'clear' && socket.player && this.isBuilder(socket.player)) {
        // Clear chat if method exists
        if (this.world.chat.clear) {
          this.world.chat.clear(true);
        }
      }
    }
    
    if (cmd === 'server') {
      const op = arg1;
      if (op === 'stats') {
        const send = (body: string) => {
          socket.send('chatAdded', {
            id: uuid(),
            from: null,
            fromId: null,
            body,
            createdAt: moment().toISOString(),
          });
        };
        // Get server stats if monitor exists
        const statsResult = this.world.monitor?.getStats?.()
        const stats = statsResult && 'then' in statsResult
          ? await statsResult
          : (statsResult || { currentCPU: 0, currentMemory: 0, maxMemory: 0 }) as ServerStats
        send(`CPU: ${stats.currentCPU.toFixed(3)}%`);
        send(`Memory: ${stats.currentMemory}MB / ${stats.maxMemory}MB`);
      }
    }
  }

  onEntityModified(socket: Socket, data: unknown): void {
    // Accept either { id, changes: {...} } or a flat payload { id, ...changes }
    const incoming = data as { id: string; changes?: Record<string, unknown> } & Record<string, unknown>;
    const id = incoming.id;
    const changes = incoming.changes ?? Object.fromEntries(Object.entries(incoming).filter(([k]) => k !== 'id'));

    // Apply to local entity if present
    const entity = this.world.entities.get(id);
    if (entity && changes) {
      // Reject client position/rotation authority for players
      if (entity.type === 'player') {
        const filtered: Record<string, unknown> = { ...changes };
        delete (filtered as { p?: unknown }).p;
        delete (filtered as { q?: unknown }).q;
        // Allow cosmetic/state updates like name, avatar, effect, roles
        entity.modify(filtered);
      } else {
        entity.modify(changes);
      }
    }

    // Broadcast normalized shape
    this.send('entityModified', { id, changes }, socket.id);
  }

  private onMoveRequest(socket: Socket, data: unknown): void {
    // Only accept move requests for the authenticated player's own entity
    const playerEntity = socket.player;
    if (!playerEntity) {
      console.warn('[ServerNetwork] No player entity for socket', socket.id);
      return;
    }
    const payload = data as { target?: number[] | [number, number, number]; runMode?: boolean };
    const t = Array.isArray(payload?.target) && payload.target.length === 3 ? payload.target as [number, number, number] : null;
    if (!t || !t.every(v => Number.isFinite(v))) {
      console.warn('[ServerNetwork] Invalid move target:', payload?.target);
      return;
    }
    const maxSpeed = payload?.runMode ? 8 : 4; // units per second (faster to ensure visible replication)
    const target = this._tempVec3_1.set(t[0], t[1], t[2]);
    
    // Anchor Y to terrain height with proper offset
    const terrain = this.world.getSystem('terrain') as TerrainSystem | null;
    if (terrain) {
      const h = terrain.getHeightAt(target.x, target.z);
      if (Number.isFinite(h)) {
        // Use small offset to keep player close to terrain (better for slopes)
        target.y = (h as number) + 0.1;
      } else {
        // As a failsafe, use a safe default height
        target.y = 50;
        console.warn(`[ServerNetwork] Using default height for move target at (${target.x.toFixed(1)}, ${target.z.toFixed(1)})`);
      }
    }
    
    console.log(`[ServerNetwork] Setting move target for player ${playerEntity.id}: (${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}), maxSpeed=${maxSpeed}`);
    
    // Get or create movement info
    const existingInfo = this.moveTargets.get(playerEntity.id);
    const velocity = existingInfo?.velocity || new THREE.Vector3(0, 0, 0);
    const currentRotation = existingInfo?.currentRotation || 
      (playerEntity.node?.quaternion ? playerEntity.node.quaternion.clone() : undefined);
    
    this.moveTargets.set(playerEntity.id, { 
      target, 
      velocity,
      maxSpeed, 
      currentRotation 
    });
    // Immediately send a prime update so clients align to authoritative position and animation
    const curr = (playerEntity as Entity).position
    this.send('entityModified', { 
      id: playerEntity.id, 
      changes: { 
        p: [curr.x, curr.y, curr.z], 
        e: payload?.runMode ? 'run' : 'walk' 
      } 
    });
  }

  private onInput(socket: Socket, data: unknown): void {
    // This now exclusively handles click-to-move requests, routing them to the canonical handler.
    const playerEntity = socket.player;
    if (!playerEntity) {
      return;
    }
    
    // The payload from a modern client is a 'moveRequest' style object.
    const payload = data as { type?: string; target?: number[]; runMode?: boolean };
    if (payload.type === 'click' && Array.isArray(payload.target)) {
        this.onMoveRequest(socket, { target: payload.target, runMode: payload.runMode });
    }
  }

  onEntityEvent(socket: Socket, data: unknown): void {
    const eventData = data as EntityEventData;
    // Handle entity event
    console.log('[ServerNetwork] Entity event:', eventData);
  }

  onEntityRemoved(socket: Socket, data: unknown): void {
    const removedData = data as EntityRemovedData;
    // Handle entity removal
    console.log('[ServerNetwork] Entity removed:', removedData);
  }

  onSettings(socket: Socket, data: unknown): void {
    // Handle settings change
    console.log('[ServerNetwork] Settings changed:', data);
  }

  onSpawnModified(socket: Socket, data: SpawnData): void {
    // Handle spawn modification
    console.log('[ServerNetwork] Spawn modified:', data);
  }
}