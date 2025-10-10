import { Entity } from '../entities/Entity';
import { PlayerLocal } from '../entities/PlayerLocal';
import { PlayerRemote } from '../entities/PlayerRemote';
import { PlayerEntity } from '../entities/PlayerEntity';
import type { ComponentDefinition, EntityConstructor, EntityData, Entities as IEntities, Player, World } from '../types/index';
import { SystemBase } from './SystemBase';
import { ServerNetwork } from './ServerNetwork';

// ComponentDefinition interface moved to shared types



// EntityConstructor interface moved to shared types

// Simple entity implementation that uses the base Entity class directly
class GenericEntity extends Entity {
  constructor(world: World, data: EntityData, local?: boolean) {
    super(world, data, local);
  }
}

// Entity type registry
const EntityTypes: Record<string, EntityConstructor> = {
  entity: GenericEntity,
  player: PlayerEntity as any,  // Base player entity for server (cast due to PlayerEntityData requirements)
  playerLocal: PlayerLocal,  // Client-only: local player
  playerRemote: PlayerRemote,  // Client-only: remote players
};

/**
 * Entities System
 *
 * - Runs on both the server and client.
 * - Supports inserting entities into the world
 * - Executes entity scripts
 *
 */
export class Entities extends SystemBase implements IEntities {
  items: Map<string, Entity>;
  players: Map<string, Player>;
  player?: Player;
  apps: Map<string, Entity>;
  private hot: Set<Entity>;
  private removed: string[];
  private componentRegistry = new Map<string, ComponentDefinition>();

  constructor(world: World) {
    super(world, { name: 'entities', dependencies: { required: [], optional: [] }, autoCleanup: true });
    this.items = new Map();
    this.players = new Map();
    this.player = undefined;
    this.apps = new Map();
    this.hot = new Set();
    this.removed = [];
  }

  get(id: string): Entity | null {
    return this.items.get(id) || null;
  }

  values(): IterableIterator<Entity> {
    return this.items.values();
  }

  getPlayer(entityId: string): Player | null {
    const player = this.players.get(entityId);
    if (!player) {
      // Don't throw - return null for disconnected players
      // This allows systems to gracefully handle missing players
      return null;
    }
    return player;
  }

  registerComponentType(definition: ComponentDefinition): void {
    this.componentRegistry.set(definition.type, definition);
  }
  
  getComponentDefinition(type: string): ComponentDefinition | undefined {
    return this.componentRegistry.get(type);
  }
  
  // TypeScript-specific methods for interface compliance
  has(entityId: string): boolean {
    return this.items.has(entityId);
  }

  set(entityId: string, entity: Entity): void {
    this.items.set(entityId, entity);
    if (entity.isPlayer) {
      this.players.set(entityId, entity as Player);
    }
  }

  create(name: string, options?: Partial<EntityData> & { type?: string }): Entity {
    const data: EntityData = {
      id: `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: options?.type || 'entity',
      name,
      ...options
    };
    return this.add(data, true);
  }

  add(data: EntityData, local?: boolean): Entity {
    // Check if entity already exists to prevent duplicates
    const existingEntity = this.items.get(data.id);
    if (existingEntity) {
      console.warn(`[Entities] Entity ${data.id} already exists, skipping duplicate creation`);
      return existingEntity;
    }

    let EntityClass: EntityConstructor;
    
    if (data.type === 'player') {
      // CRITICAL: Server should NEVER use PlayerLocal or PlayerRemote - those are client-only!
      // Check if we're on the server by looking for ServerNetwork system
      const serverNetwork = this.world.getSystem<ServerNetwork>('network');
      const isServerWorld = serverNetwork?.isServer === true;
      
      
      if (isServerWorld) {
        // On server, always use the base player entity type
        EntityClass = EntityTypes['player'] || EntityTypes.entity;
        console.log(`[Entities] Creating server player entity: ${data.id}`);
      } else {
        // On client, determine if local or remote
        const networkId = this.world.network?.id || (this.world.getSystem('network') as any)?.id;
        const isLocal = data.owner === networkId;
        EntityClass = EntityTypes[isLocal ? 'playerLocal' : 'playerRemote'];
        console.log(`[Entities] Creating ${isLocal ? 'LOCAL' : 'REMOTE'} player entity: ${data.id}, owner: ${data.owner}, networkId: ${networkId}`);
      }
    } else if (data.type in EntityTypes) {
      EntityClass = EntityTypes[data.type];
    } else {
      EntityClass = EntityTypes.entity;
    }

    // Cast data to appropriate type for player entities
    const entity = data.type === 'player' 
      ? new EntityClass(this.world, data as any, local)
      : new EntityClass(this.world, data, local);
    this.items.set(entity.id, entity);

    if (data.type === 'player') {
      this.players.set(entity.id, entity as Player);
      
      // On the client, remote players emit enter events here.
      // On the server, enter events are delayed for players entering until after their snapshot is sent
      // so they can respond correctly to follow-through events.
      const network = this.world.network || this.world.getSystem('network');
      if (network?.isClient) {
        const netId = network.id || (network as any)?.id;
        if (data.owner !== netId) {
          this.emitTypedEvent('PLAYER_JOINED', { playerId: entity.id, player: entity as PlayerLocal });
        }
      }
    }

    // Strong type assumption - world has network system when dealing with owned entities
    const currentNetworkId = this.world.network?.id || (this.world.getSystem('network') as any)?.id;
    if (data.owner === currentNetworkId) {
      console.log(`[Entities] Setting LOCAL PLAYER: ${entity.id} (was: ${this.player?.id || 'none'})`);
      if (this.player) {
        console.warn(`[Entities] WARNING: Replacing existing local player ${this.player.id} with ${entity.id}!`);
      }
      this.player = entity as Player;
      this.emitTypedEvent('PLAYER_REGISTERED', { playerId: entity.id });
    }

    // Initialize the entity if it has an init method
    if (entity.init) {
      (entity.init() as Promise<void>)?.catch(err => this.logger.error(`Entity ${entity.id} async init failed`, err));
    }

    return entity;
  }

  remove(id: string): boolean {
    const entity = this.items.get(id);
    if (!entity) {
      this.logger.warn(`Tried to remove entity that did not exist: ${id}`);
      return false;
    }
    
    if (entity.isPlayer) {
      this.players.delete(entity.id);
      this.emitTypedEvent('PLAYER_LEFT', { playerId: entity.id });
    }
    
    entity.destroy(true);
    this.items.delete(id);
    this.removed.push(id);
    return true;
  }

  // TypeScript interface compliance method
  destroyEntity(entityId: string): boolean {
    return this.remove(entityId);
  }

  setHot(entity: Entity, hot: boolean): void {
    if (hot) {
      this.hot.add(entity);
    } else {
      this.hot.delete(entity);
    }
  }

  override fixedUpdate(delta: number): void {
    const hotEntities = Array.from(this.hot);
    for (const entity of hotEntities) {
      entity.fixedUpdate?.(delta);
    }
  }

  override update(delta: number): void {
    const hotEntities = Array.from(this.hot);
    for (const entity of hotEntities) {
      try {
        entity.update?.(delta);
      } catch (error) {
        // Strong type assumption - error is Error type
        const err = error as Error;
        this.logger.error(`Error updating entity ${entity.id || 'unknown'}: ${err.message || String(error)}`);
        throw error;
      }
    }
  }

  override lateUpdate(delta: number): void {
    const hotEntities = Array.from(this.hot);
    for (const entity of hotEntities) {
      entity.lateUpdate?.(delta);
    }
  }

  serialize(): EntityData[] {
    const data: EntityData[] = [];
    this.items.forEach(entity => {
      data.push(entity.serialize());
    });
    return data;
  }

  async deserialize(datas: EntityData[]): Promise<void> {
    for (const data of datas) {
      this.add(data);
    }
  }

  override destroy(): void {
    // Create array of IDs to avoid modifying map while iterating
    const entityIds = Array.from(this.items.keys());
    for (const id of entityIds) {
      this.remove(id);
    }
    
    this.items.clear();
    this.players.clear();
    this.hot.clear();
    this.removed = [];
  }

  // TypeScript interface compliance methods
  getLocalPlayer(): Player | null {
    return this.player || null;
  }

  getAll(): Entity[] {
    return Array.from(this.items.values());
  }

  getAllPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  // Alias for World.ts compatibility
  getPlayers(): Player[] {
    return this.getAllPlayers();
  }

  getRemovedIds(): string[] {
    const ids = [...new Set(this.removed)]; // Remove duplicates
    this.removed = [];
    return ids;
  }
  
  // Missing lifecycle methods
  postFixedUpdate(): void {
    // Add postLateUpdate calls for entities
    const hotEntities = Array.from(this.hot);
    for (const entity of hotEntities) {
      entity.postLateUpdate?.(0);
    }
  }
} 