import { isNumber } from 'lodash-es';
import moment from 'moment';

import type { Entity } from '../entities/Entity';
import { writePacket } from '../packets';
import { Socket } from '../Socket';
import type { SystemDatabase } from '../types/database-types';
import { isDatabaseInstance } from '../types/database-types';
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

const SAVE_INTERVAL = parseInt(process.env.SAVE_INTERVAL || '60'); // seconds
const PING_RATE = 1; // seconds
const defaultSpawn = '{ "position": [0, 0, 0], "quaternion": [0, 0, 0, 1] }';

const HEALTH_MAX = 100;

// Re-export shared network types for backward compatibility
export type { ChatMessage, ConnectionParams, ServerStats, SpawnData, User } from '../types/network-types';

type QueueItem = [Socket, string, unknown];

// Handler data types for network messages
interface EntityModifiedData {
  id: string;
  changes: unknown;
}

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
    
    // Register handler methods with proper signatures
    this.handlers['chatAdded'] = this.onChatAdded.bind(this);
    this.handlers['command'] = this.onCommand.bind(this);
    this.handlers['entityModified'] = this.onEntityModified.bind(this);
    this.handlers['entityEvent'] = this.onEntityEvent.bind(this);
    this.handlers['entityRemoved'] = this.onEntityRemoved.bind(this);
    this.handlers['settings'] = this.onSettings.bind(this);
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

  send<T = unknown>(name: string, data: T, ignoreSocketId?: string): void {
    const packet = writePacket(name, data);
    this.sockets.forEach(socket => {
      if (socket.id === ignoreSocketId) return;
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
      // Use world logger if available via SystemBase in future refactor; keep minimal console for server context
      console.log(`[ServerNetwork] Socket ${socket.id} disconnected with code:`, code);
    
    // Remove socket from our tracking
    this.sockets.delete(socket.id);
    
    // Clean up any socket-specific resources
    if (socket.player) {
      // Emit player leave event
      this.world.emit('player:leave', {
        playerId: socket.player.id,
        sessionId: socket.id,
        reason: code ? `disconnect_${code}` : 'disconnect'
      });
      
      // Remove player entity from world
      if (this.world.entities?.remove) {
        this.world.entities.remove(socket.player.id);
      }
    }
  }

  flush(): void {
    while (this.queue.length) {
      try {
        const [socket, method, data] = this.queue.shift()!;
        const handler = this.handlers[method];
        if (handler) {
          handler.call(this, socket, data);
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
    await this.db('config')
      .insert({
        key: 'settings',
        value,
      })
      .onConflict('key')
      .merge({
        value,
      });
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

      // disconnect if user already in this world
      if (this.sockets.has(user.id)) {
        const packet = writePacket('kick', 'duplicate_user');
        ws.send(packet);
        ws.close();
        return;
      }

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

      // create socket
      const socket = new Socket({ 
        id: user.id, 
        ws, 
        network: this 
      });

      // spawn player
      const addedEntity = this.world.entities.add ? this.world.entities.add(
        {
          id: user.id,
          type: 'player',
          position: [...this.spawn.position] as [number, number, number],
          quaternion: [...this.spawn.quaternion] as [number, number, number, number],
          owner: socket.id, // deprecated, same as userId
          userId: user.id, // deprecated, same as userId
          name: name || user.name,
          health: HEALTH_MAX,
          avatar: user.avatar || this.world.settings.avatar?.url || 'asset://avatar.vrm',
          sessionAvatar: avatar || undefined,
          roles: user.roles,
        },
        true
      ) : undefined;
      socket.player = addedEntity || undefined;

      // send snapshot
      socket.send('snapshot', {
        id: socket.id,
        serverTime: performance.now(),
        assetsUrl: this.world.assetsUrl,  // Use the world's configured assetsUrl
        apiUrl: process.env.PUBLIC_API_URL,
        maxUploadSize: process.env.PUBLIC_MAX_UPLOAD_SIZE,
        settings: this.world.settings.serialize() || {},
        chat: this.world.chat.serialize() || [],
        entities: this.world.entities.serialize() || [],
        livekit,
        authToken,
      });

      this.sockets.set(socket.id, socket);

      // enter events on the server are sent after the snapshot.
      // on the client these are sent during PlayerRemote.js entity instantiation!
      if (socket.player) {
        // Use the user.id which was used to create the player entity
        const playerId = user.id;
        console.log('[ServerNetwork] Emitting player events with playerId:', playerId, 'user.id:', user.id);
        if (!playerId) {
          console.error('[ServerNetwork] WARNING: playerId is undefined!', {
            userId: user?.id,
            userName: user?.name,
            socketId: socket.id,
            hasPlayer: !!socket.player
          });
        }
        // Emit both events for compatibility
        this.world.emit('enter', { playerId });
        // Emit the event that PlayerSpawnSystem expects
        this.world.emit('player:joined', { playerId });
      }
    } catch (_err) {
      console.error(_err);
    }
  }

  onChatAdded = async (socket: Socket, data: unknown): Promise<void> => {
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
      const entity = player as unknown as Entity
      const curr = entity.position
      let nx = curr.x
      let ny = curr.y
      let nz = curr.z
      if (mode === 'random') {
        const radius = 3
        const dx = (Math.random() * 2 - 1) * radius
        const dz = (Math.random() * 2 - 1) * radius
        nx = curr.x + dx
        nz = curr.z + dz
      } else if (mode === 'to' && args.length >= 4) {
        // move to specified coordinates: /move to x y z
        const x = parseFloat(args[2])
        const y = parseFloat(args[3])
        const z = parseFloat(args[4])
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          nx = x; ny = y; nz = z
        }
      }
      // Apply on server entity
      entity.position.set(nx, ny, nz)
      // Broadcast to all clients, including the origin, using normalized shape
      this.send('entityModified', { id: entity.id, changes: { p: [nx, ny, nz] } })
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
        const stats: ServerStats = await this.world.monitor?.getStats?.() || { currentCPU: 0, currentMemory: 0, maxMemory: 0 };
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
    const entity = this.world.entities.get(id) as Entity | null;
    if (entity && changes) {
      entity.modify(changes);
    }

    // Broadcast normalized shape
    this.send('entityModified', { id, changes }, socket.id);
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