import type { ComponentDefinition, EntityConstructor, EntityData, Entities as IEntities, Player, World } from '../types/index';
import { Entity } from '../entities/Entity';
import { PlayerLocal } from '../entities/PlayerLocal';
import { PlayerRemote } from '../entities/PlayerRemote';
import { System } from './System';

// ComponentDefinition interface moved to shared types



// EntityConstructor interface moved to shared types

// Simple entity implementation that uses the base Entity class directly
class BaseEntity extends Entity {
  constructor(world: World, data: EntityData, local?: boolean) {
    super(world, data, local);
  }
}

// Entity type registry
const EntityTypes: Record<string, EntityConstructor> = {
  entity: BaseEntity,
  playerLocal: PlayerLocal,
  playerRemote: PlayerRemote,
};

/**
 * Entities System
 *
 * - Runs on both the server and client.
 * - Supports inserting entities into the world
 * - Executes entity scripts
 *
 */
export class Entities extends System implements IEntities {
  items: Map<string, Entity>;
  players: Map<string, Player>;
  player?: Player;
  apps: Map<string, Entity>;
  private hot: Set<Entity>;
  private removed: string[];
  private componentRegistry = new Map<string, ComponentDefinition>();

  constructor(world: World) {
    super(world);
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

  getPlayer(entityId: string): Player {
    const player = this.players.get(entityId);
    if (!player) {
      throw new Error(`Player not found: ${entityId}`);
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
    let EntityClass: EntityConstructor;
    
    // Entity creation debug logging removed
    
    if (data.type === 'player') {
      // Strong type assumption - world has network system when dealing with players
      const isLocal = data.owner === this.world.network.id;
      EntityClass = EntityTypes[isLocal ? 'playerLocal' : 'playerRemote'];
    } else if (data.type in EntityTypes) {
      EntityClass = EntityTypes[data.type];
    } else {
      EntityClass = EntityTypes.entity;
    }

    const entity = new EntityClass(this.world, data, local);
    this.items.set(entity.id, entity);

    if (data.type === 'player') {
      this.players.set(entity.id, entity as Player);
      
      // On the client, remote players emit enter events here.
      // On the server, enter events are delayed for players entering until after their snapshot is sent
      // so they can respond correctly to follow-through events.
      if (this.world.network.isClient) {
        if (data.owner !== this.world.network.id) {
          this.world.emit('enter', { playerId: entity.id });
        }
      }
    }

    // Strong type assumption - world has network system when dealing with owned entities
    if (data.owner === this.world.network.id) {
      this.player = entity as Player;
      this.world.emit('player', entity);
    }

    // Initialize the entity if it has an init method
    if ('init' in entity && typeof entity.init === 'function') {
      entity.init();
    }

    return entity;
  }

  remove(id: string): boolean {
    const entity = this.items.get(id);
    if (!entity) {
      console.warn(`Tried to remove entity that did not exist: ${id}`);
      return false;
    }
    
    if (entity.isPlayer) {
      this.players.delete(entity.id);
      // Emit leave event for players
      this.world.emit('leave', { playerId: entity.id });
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
        console.error(`[Entities] Error updating entity:`, entity.id || entity, error);
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
  getLocalPlayer(): Player {
    if (!this.player) {
      // Return a dummy player object that satisfies the interface but indicates no player
      // This prevents errors during initialization before player is created
      return null as unknown as Player;
    }
    return this.player;
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
  preTick(): void {}
  preFixedUpdate(): void {}
  postFixedUpdate(): void {
    // Add postLateUpdate calls for entities
    const hotEntities = Array.from(this.hot);
    for (const entity of hotEntities) {
      entity.postLateUpdate?.(0);
    }
  }
  preUpdate(): void {}
  postUpdate(): void {}
  postLateUpdate(): void {}
  commit(): void {}
  postTick(): void {}
} 