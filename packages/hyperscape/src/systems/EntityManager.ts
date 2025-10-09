/**
 * EntityManager - Manages all entities in the world
 * 
 * This system is responsible for:
 * - Creating and destroying entities
 * - Managing entity lifecycle
 * - Network synchronization
 * - Entity queries and lookups
 */

import { World } from '../World';
import { Entity, EntityConfig } from '../entities/Entity';
import { ItemEntity } from '../entities/ItemEntity';
import { MobEntity } from '../entities/MobEntity';
import { NPCEntity } from '../entities/NPCEntity';
import { ResourceEntity } from '../entities/ResourceEntity';
import type { 
  ItemEntityConfig, 
  ItemEntityProperties, 
  ItemSpawnData, 
  MobEntityConfig, 
  MobSpawnData, 
  NPCEntityConfig, 
  NPCEntityProperties as _NPCEntityProperties, 
  NPCSpawnData as _NPCSpawnData, 
  ResourceEntityConfig, 
  ResourceEntityProperties as _ResourceEntityProperties, 
  ResourceSpawnData as _ResourceSpawnData 
} from '../types/entities';
import { EntityType, InteractionType, ItemRarity, MobAIState, MobType, NPCType, ResourceType } from '../types/entities';
import { EventType } from '../types/events';
import type { EntitySpawnedEvent } from '../types/systems';
import { Logger } from '../utils/Logger';
import { TerrainSystem } from './TerrainSystem';
import { SystemBase } from './SystemBase';

export class EntityManager extends SystemBase {
  private entities = new Map<string, Entity>();
  private entitiesNeedingUpdate = new Set<string>();
  private networkDirtyEntities = new Set<string>();
  private nextEntityId = 1;

  constructor(world: World) {
    super(world, {
      name: 'rpg-entity-manager',
      dependencies: {
        required: [], // Entity manager is foundational and can work independently
        optional: ['client-graphics', 'rpg-database'] // Better with graphics and persistence
      },
      autoCleanup: false
    });
  }

  async init(): Promise<void> {
    
    // The World.register method already registers this system on the world object
    // No need for manual registration
    
    // Set up type-safe event subscriptions for entity management (16+ listeners!)
    // NOTE: We don't subscribe to ENTITY_SPAWNED here as that would create a circular loop
    // ENTITY_SPAWNED is emitted BY this system after spawning, not TO request spawning
    this.subscribe(EventType.ENTITY_DEATH, (data) => this.handleEntityDestroy(data));
    this.subscribe(EventType.ENTITY_INTERACT, (data) => this.handleInteractionRequest({ entityId: data.entityId, playerId: data.playerId, interactionType: data.action }));
    this.subscribe(EventType.ENTITY_MOVE_REQUEST, (data) => this.handleMoveRequest(data));
    this.subscribe(EventType.ENTITY_PROPERTY_REQUEST, (data) => this.handlePropertyRequest({ entityId: data.entityId, propertyName: data.property, value: data.value }));
    
    // Listen for specific entity type spawn requests
    this.subscribe(EventType.ITEM_SPAWNED, (data) => this.handleItemSpawn({ 
      id: data.itemId, 
      customId: `item_${data.itemId}`, 
      name: 'item', 
      position: data.position, 
      model: null,
      quantity: 1,
      stackable: true,
      value: 1
    }));
    this.subscribe(EventType.ITEM_PICKUP, (data) => this.handleItemPickup({ entityId: data.itemId, playerId: data.playerId }));
    // EntityManager should handle spawn REQUESTS, not completed spawns
    this.subscribe(EventType.MOB_SPAWN_REQUEST, (data) => this.handleMobSpawn({
      mobType: data.mobType,
      position: data.position,
      level: 1,  // MOB_SPAWN_REQUEST doesn't have level in EventMap
      customId: `mob_${Date.now()}`,
      name: data.mobType
    }));
    this.subscribe(EventType.MOB_ATTACKED, (data) => this.handleMobAttacked({ entityId: data.mobId, damage: data.damage, attackerId: data.attackerId }));
        this.subscribe(EventType.COMBAT_MOB_ATTACK, (data) => this.handleMobAttack({ mobId: data.mobId, targetId: data.targetId, damage: 0 }));
    // RESOURCE_GATHERED has different structure in EventMap
    // Map the string resourceType to the enum value
    this.subscribe(EventType.RESOURCE_GATHERED, (data) => {
      const resourceTypeMap: Record<string, ResourceType> = {
        'tree': ResourceType.TREE,
        'rock': ResourceType.MINING_ROCK,
        'ore': ResourceType.MINING_ROCK,
        'herb': ResourceType.TREE,  // Map herb to tree for now
        'fish': ResourceType.FISHING_SPOT
      };
      this.handleResourceSpawn({ 
        resourceId: `resource_${Date.now()}`,
        resourceType: resourceTypeMap[data.resourceType] || 'tree', 
        position: { x: 0, y: 0, z: 0 }
      });
    });
    this.subscribe(EventType.RESOURCE_HARVEST, (data) => this.handleResourceHarvest({ entityId: data.resourceId, playerId: data.playerId, amount: data.success ? 1 : 0 }));
    // NPC_INTERACTION has different structure in EventMap
    this.subscribe(EventType.NPC_INTERACTION, (data) => this.handleNPCSpawn({ 
      customId: data.npcId, 
      name: 'NPC',
      npcType: NPCType.QUEST_GIVER,  // Default to quest giver
      position: { x: 0, y: 0, z: 0 },
      model: null,
      dialogues: [],
      questGiver: true,
      shopkeeper: false,
      bankTeller: false
    }));
    this.subscribe(EventType.NPC_DIALOGUE, (data) => this.handleNPCDialogue({ entityId: data.npcId, playerId: data.playerId, dialogueId: data.dialogueId }));
    
    // Network sync for clients
    if (this.world.isClient) {
      this.subscribe(EventType.CLIENT_CONNECT, (data) => this.handleClientConnect({ playerId: data.clientId }));
      this.subscribe(EventType.CLIENT_DISCONNECT, (data) => this.handleClientDisconnect({ playerId: data.clientId }));
    }
    
  }

  update(deltaTime: number): void {
    // Update all entities that need updates
    this.entitiesNeedingUpdate.forEach(entityId => {
      const entity = this.entities.get(entityId);
      if (entity) {
        entity.update(deltaTime);
      }
    });
    
    // Send network updates
    if (this.world.isServer && this.networkDirtyEntities.size > 0) {
      this.sendNetworkUpdates();
    }
  }

  fixedUpdate(deltaTime: number): void {
    // Fixed update for physics
    this.entities.forEach(entity => {
      entity.fixedUpdate(deltaTime);
    });
  }

  async spawnEntity(config: EntityConfig): Promise<Entity | null> {
    // Generate entity ID if not provided
    if (!config.id) {
      config.id = `entity_${this.nextEntityId++}`;
    }
    
    
    let entity: Entity;
    
    // Create appropriate entity type
    switch (config.type) {
      case 'item':
        entity = new ItemEntity(this.world, config as ItemEntityConfig);
        break;
      case 'mob':
        entity = new MobEntity(this.world, config as MobEntityConfig);
        break;
      case 'resource':
        entity = new ResourceEntity(this.world, config as ResourceEntityConfig);
        break;
      case 'npc':
        entity = new NPCEntity(this.world, config as NPCEntityConfig);
        break;
      default:
        throw new Error(`[EntityManager] Unknown entity type: ${config.type}`);
    }
    
    // Initialize entity
    await entity.init();
    
    // Store entity
    this.entities.set(config.id, entity);
    this.entitiesNeedingUpdate.add(config.id);
    
    // Register with world entities system so other systems can find it
        this.world.entities.set(config.id, entity);
        
    // Mark for network sync
    if (this.world.isServer) {
      this.networkDirtyEntities.add(config.id);
    }
    
    // Emit spawn event
    this.emitTypedEvent(EventType.ENTITY_SPAWNED, {
      entityId: config.id,
      entityType: config.type,
      position: config.position,
      entityData: entity.getNetworkData()
    } as EntitySpawnedEvent);
    
    return entity;
  }

  destroyEntity(entityId: string): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;
    
    
    // Call entity destroy method
    entity.destroy();
    
    // Remove from tracking
    this.entities.delete(entityId);
    this.entitiesNeedingUpdate.delete(entityId);
    this.networkDirtyEntities.delete(entityId);
    
    // Remove from world entities system
    this.world.entities.remove(entityId);
    
    // Emit destroy event
    this.emitTypedEvent(EventType.ENTITY_DEATH, {
      entityId,
      entityType: entity.type
    });
    
    return true;
  }

  getEntity(entityId: string): Entity | undefined {
    return this.entities.get(entityId);
  }

  /**
   * Get all entities of a specific type
   */
  getEntitiesByType(type: string): Entity[] {
    return Array.from(this.entities.values()).filter(entity => entity.type === type);
  }

  /**
   * Get entities within range of a position
   */
  getEntitiesInRange(center: { x: number; y: number; z: number }, range: number, type?: string): Entity[] {
    return Array.from(this.entities.values()).filter(entity => {
      if (type && entity.type !== type) return false;
      const distance = entity.getDistanceTo(center);
      return distance <= range;
    });
  }

  private handleEntityDestroy(data: { entityId: string }): void {
    this.destroyEntity(data.entityId);
  }

  private async handleInteractionRequest(data: { entityId: string; playerId: string; interactionType: string }): Promise<void> {
    const entity = this.entities.get(data.entityId);
    if (!entity) {
            return;
    }
    await entity.handleInteraction({
      ...data,
      position: entity.getPosition(),
      playerPosition: { x: 0, y: 0, z: 0 } // Default player position - would be provided by actual system
    });
  }

  private handleMoveRequest(data: { entityId: string; position: { x: number; y: number; z: number } }): void {
    const entity = this.entities.get(data.entityId);
    if (!entity) {
            return;
    }
    // Do not override local player physics-driven movement. Let PlayerLocal handle motion.
    const isLocalPlayer = entity.isPlayer && this.world.entities.player && entity.id === this.world.entities.player.id;
    if (isLocalPlayer) {
      return;
    }
    entity.setPosition(data.position.x, data.position.y, data.position.z);
  }

  private handlePropertyRequest(data: { entityId: string; propertyName: string; value: unknown }): void {
    const entity = this.entities.get(data.entityId);
    if (!entity) {
            return;
    }
    entity.setProperty(data.propertyName, data.value);
  }

  private async handleItemSpawn(data: ItemSpawnData): Promise<void> {
    const config: EntityConfig<ItemEntityProperties> = {
      id: data.customId || `item_${this.nextEntityId++}`,
      name: data.name || 'Item',
      type: EntityType.ITEM,
      position: data.position || { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      interactable: true,
      interactionType: InteractionType.PICKUP,
      interactionDistance: 2,
      description: data.name || 'Item',
      model: data.model,
      properties: {
        movementComponent: null,
        combatComponent: null,
        healthComponent: null,
        visualComponent: null,
        health: {
          current: 1,
          max: 1
        },
        level: 1,
        harvestable: false,
        dialogue: [],
        weight: this.getItemWeight(data.id || ''),
        rarity: ItemRarity.COMMON,
        ...data,
        itemId: data.id,
        quantity: data.quantity || 1,
        stackable: data.stackable !== false,
        value: data.value || 0
      }
    };
    
    await this.spawnEntity(config);
  }

  private handleItemPickup(data: { entityId: string; playerId: string }): void {
    const entity = this.entities.get(data.entityId);
    if (!entity) {
            return;
    }
    
    // Get properties before destroying
    const itemId = entity.getProperty('itemId');
    const quantity = entity.getProperty('quantity');
    
    this.destroyEntity(data.entityId);
    
    this.emitTypedEvent(EventType.ITEM_PICKUP, {
      playerId: data.playerId,
      item: itemId,
      quantity: quantity
    });
  }

  private async handleMobSpawn(data: MobSpawnData): Promise<void> {
        
    // Validate required data
    let position = data.position;
    if (!position) {
      throw new Error('[EntityManager] Mob spawn position is required');
    }
    
    // Validate position has valid x, y, z coordinates
    if (typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
      console.error('[EntityManager] Invalid mob spawn position - missing or non-numeric coordinates:', position);
      // Create a valid position object with default coordinates
      position = {
        x: typeof position.x === 'number' ? position.x : 0,
        y: typeof position.y === 'number' ? position.y : 0,  
        z: typeof position.z === 'number' ? position.z : 0
      };
      console.warn('[EntityManager] Using default coordinates for missing values:', position);
    }
    
    const mobType = data.mobType;
    if (!mobType) {
      throw new Error('[EntityManager] Mob type is required');
    }
    
    const level = data.level || 1;

    // Ground to terrain height map explicitly for server/client authoritative spawn
    try {
      const terrain = this.world.getSystem<TerrainSystem>('terrain');
      if (terrain && typeof position.x === 'number' && typeof position.z === 'number') {
        const th = terrain.getHeightAt(position.x, position.z);
        if (Number.isFinite(th)) {
          position = { x: position.x, y: (th as number) + 0.1, z: position.z };
        }
      }
    } catch (_e) {
      // If terrain not available, keep provided Y
    }
    
    const config: MobEntityConfig = {
      id: data.customId || `mob_${this.nextEntityId++}`,
      name: data.name || mobType || 'Mob',
      type: EntityType.MOB,
      position: position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      interactable: true,
      interactionType: InteractionType.ATTACK,
      interactionDistance: 5,
      description: `${mobType} (Level ${level})`,
      model: null,
      // MobEntity specific fields
      mobType: mobType as MobType,
      level: level,
      currentHealth: this.getMobMaxHealth(mobType, level),
      maxHealth: this.getMobMaxHealth(mobType, level),
      attackPower: this.getMobAttackPower(mobType, level),
      defense: this.getMobDefense(mobType, level),
      attackSpeed: this.getMobAttackSpeed(mobType),
      moveSpeed: this.getMobMoveSpeed(mobType),
      aggroRange: this.getMobAggroRange(mobType),
      combatRange: this.getMobCombatRange(mobType),
      xpReward: this.getMobXPReward(mobType, level),
      lootTable: this.getMobLootTable(mobType),
      respawnTime: 300000, // 5 minutes default
      spawnPoint: position,
      aiState: MobAIState.IDLE,
      lastAttackTime: 0,
      properties: {
        movementComponent: null,
        combatComponent: null,
        healthComponent: null,
        visualComponent: null,
        health: {
          current: this.getMobMaxHealth(mobType, level),
          max: this.getMobMaxHealth(mobType, level)
        },
        level: level,
      },
      targetPlayerId: null,
      deathTime: null
    };
    
    const entity = await this.spawnEntity(config);
                
    // Emit MOB_SPAWNED event to notify other systems (like AggroSystem)
    // that a mob has been successfully spawned
    if (entity) {
      this.emitTypedEvent(EventType.MOB_SPAWNED, {
        mobId: config.id,
        mobType: mobType,
        position: position
      });
    }
  }

  private handleMobAttacked(data: { entityId: string; damage: number; attackerId: string }): void {
    const mob = this.entities.get(data.entityId);
    if (!mob) {
            return;
    }
    
    const healthData = mob.getProperty('health');
    // Strong type assumption - health is either a number or { current, max }
    const currentHealth = (healthData as { current: number }).current || (healthData as number) || 0;
    
    const newHealth = Math.max(0, currentHealth - data.damage);
    
    // Strong type assumption - maintain structure if it's an object, otherwise use number
    const isHealthObject = healthData && (healthData as { current?: number }).current !== undefined;
    if (isHealthObject) {
      mob.setProperty('health', { ...healthData as { current: number; max: number }, current: newHealth });
    } else {
      mob.setProperty('health', newHealth);
    }
    
    if (newHealth <= 0) {
      this.emitTypedEvent(EventType.MOB_DIED, {
        entityId: data.entityId,
        killedBy: data.attackerId,
        position: mob.getPosition()
      });
      
      this.destroyEntity(data.entityId);
    }
  }

  private handleMobAttack(data: { mobId: string; targetId: string; damage: number }): void {
    const mob = this.entities.get(data.mobId);
    if (!mob) {
            return;
    }
    
    const damage = mob.getProperty('attackPower');
    
    this.emitTypedEvent(EventType.PLAYER_DAMAGE, {
      playerId: data.targetId,
      damage,
      source: data.mobId,
      sourceType: 'mob'
    });
  }

  private handleClientConnect(data: { playerId: string }): void {
    // Send all current entities to new client
    const entityData = Array.from(this.entities.values()).map(entity => ({
      type: entity.type,
      data: entity.getNetworkData()
    }));
    
    this.emitTypedEvent(EventType.CLIENT_ENTITY_SYNC, {
      playerId: data.playerId,
      entities: entityData
    });
  }

  private handleClientDisconnect(data: { playerId: string }): void {
    // Clean up any player-specific entity data
    this.entities.forEach((entity, entityId) => {
      if (entity.getProperty('ownerId') === data.playerId) {
        this.destroyEntity(entityId);
      }
    });
  }

  private sendNetworkUpdates(): void {
    const updates: Array<{ entityId: string; data: unknown }> = [];
    
    this.networkDirtyEntities.forEach(entityId => {
      const entity = this.entities.get(entityId);
      if (entity) {
        updates.push({
          entityId,
          data: entity.getNetworkData()
        });
      }
    });
    
    this.emitTypedEvent(EventType.NETWORK_ENTITY_UPDATES, { updates });
    
    // Clear dirty entities
    this.networkDirtyEntities.clear();
  }

  getDebugInfo(): {
    totalEntities: number;
    entitiesByType: Record<string, number>;
    entitiesNeedingUpdate: number;
    networkDirtyEntities: number;
  } {
    return {
      totalEntities: this.entities.size,
      entitiesByType: this.getEntityTypeCount(),
      entitiesNeedingUpdate: this.entitiesNeedingUpdate.size,
      networkDirtyEntities: this.networkDirtyEntities.size
    };
  }

  private getEntityTypeCount(): Record<string, number> {
    const counts: Record<string, number> = {};
    
    this.entities.forEach(entity => {
      counts[entity.type] = (counts[entity.type] || 0) + 1;
    });
    
    return counts;
  }



  /**
   * Helper method to create a simple test item entity with minimal configuration
   */
  async createTestItem(config: {
    id?: string
    name: string
    position: { x: number; y: number; z: number }
    itemId?: string
    quantity?: number
  }): Promise<Entity | null> {
    const itemConfig: ItemEntityConfig = {
      id: config.id || `test_item_${this.nextEntityId++}`,
      type: EntityType.ITEM,
      name: config.name,
      position: config.position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      interactable: true,
      interactionType: InteractionType.PICKUP,
      interactionDistance: 2,
      description: `Test item: ${config.name}`,
      model: null,
      // ItemEntityConfig-specific fields
      itemType: config.itemId || 'test-item',
      itemId: config.itemId || 'test-item',
      quantity: config.quantity || 1,
      stackable: false,
      value: 0,
      weight: 0,
      rarity: ItemRarity.COMMON,
      stats: {},
      requirements: {},
      effects: [],
      armorSlot: null,
      // Properties field  
      properties: {
        movementComponent: null,
        combatComponent: null,
        healthComponent: null,
        visualComponent: null,
        health: {
          current: 1,
          max: 1
        },
        level: 1,
        itemId: config.itemId || 'test-item',
        harvestable: false,
        dialogue: [],
        quantity: config.quantity || 1,
        stackable: false,
        value: 0,
        weight: 0,
        rarity: ItemRarity.COMMON
      }
    }

    return this.spawnEntity(itemConfig)
  }

  // Helper methods for mob stats calculation
  private getMobMaxHealth(mobType: string, level: number): number {
    const baseHealth: Record<string, number> = {
      'goblin': 50,
      'wolf': 80,
      'bandit': 100,
      'skeleton': 60,
      'zombie': 120,
      'spider': 40,
      'orc': 150,
      'troll': 200,
      'dragon': 500
    };
    return (baseHealth[mobType] || 100) + (level - 1) * 10;
  }

  private getMobAttackPower(mobType: string, level: number): number {
    const baseAttack: Record<string, number> = {
      'goblin': 5,
      'wolf': 8,
      'bandit': 10,
      'skeleton': 6,
      'zombie': 7,
      'spider': 4,
      'orc': 12,
      'troll': 15,
      'dragon': 30
    };
    return (baseAttack[mobType] || 5) + (level - 1) * 2;
  }

  private getMobDefense(mobType: string, level: number): number {
    const baseDefense: Record<string, number> = {
      'goblin': 2,
      'wolf': 3,
      'bandit': 5,
      'skeleton': 3,
      'zombie': 8,
      'spider': 1,
      'orc': 6,
      'troll': 10,
      'dragon': 15
    };
    return (baseDefense[mobType] || 2) + (level - 1);
  }

  private getMobAttackSpeed(mobType: string): number {
    const attackSpeed: Record<string, number> = {
      'goblin': 1.5,
      'wolf': 1.0,
      'bandit': 1.2,
      'skeleton': 1.8,
      'zombie': 2.5,
      'spider': 0.8,
      'orc': 1.5,
      'troll': 2.0,
      'dragon': 3.0
    };
    return attackSpeed[mobType] || 1.5;
  }

  private getMobMoveSpeed(mobType: string): number {
    const moveSpeed: Record<string, number> = {
      'goblin': 5,
      'wolf': 8,
      'bandit': 5,
      'skeleton': 4,
      'zombie': 3,
      'spider': 7,
      'orc': 4,
      'troll': 3,
      'dragon': 6
    };
    return moveSpeed[mobType] || 5;
  }

  private getMobAggroRange(mobType: string): number {
    const aggroRange: Record<string, number> = {
      'goblin': 10,
      'wolf': 15,
      'bandit': 12,
      'skeleton': 10,
      'zombie': 8,
      'spider': 12,
      'orc': 10,
      'troll': 8,
      'dragon': 20
    };
    return aggroRange[mobType] || 10;
  }

  private getMobCombatRange(mobType: string): number {
    const combatRange: Record<string, number> = {
      'goblin': 2,
      'wolf': 2,
      'bandit': 2,
      'skeleton': 2,
      'zombie': 2,
      'spider': 2,
      'orc': 2,
      'troll': 3,
      'dragon': 5
    };
    return combatRange[mobType] || 2;
  }

  private getMobXPReward(mobType: string, level: number): number {
    const baseXP: Record<string, number> = {
      'goblin': 10,
      'wolf': 15,
      'bandit': 20,
      'skeleton': 12,
      'zombie': 18,
      'spider': 8,
      'orc': 25,
      'troll': 35,
      'dragon': 100
    };
    return (baseXP[mobType] || 10) * level;
  }

  private getMobLootTable(mobType: string): Array<{ itemId: string; chance: number; minQuantity: number; maxQuantity: number }> {
    const lootTables: Record<string, Array<{ itemId: string; chance: number; minQuantity: number; maxQuantity: number }>> = {
      'goblin': [
        { itemId: 'coins', chance: 0.8, minQuantity: 1, maxQuantity: 10 },
        { itemId: 'goblin_ear', chance: 0.3, minQuantity: 1, maxQuantity: 2 }
      ],
      'wolf': [
        { itemId: 'wolf_pelt', chance: 0.5, minQuantity: 1, maxQuantity: 1 },
        { itemId: 'wolf_fang', chance: 0.4, minQuantity: 1, maxQuantity: 2 }
      ],
      'bandit': [
        { itemId: 'coins', chance: 0.9, minQuantity: 5, maxQuantity: 20 },
        { itemId: 'iron_sword', chance: 0.2, minQuantity: 1, maxQuantity: 1 },
        { itemId: 'leather_armor', chance: 0.15, minQuantity: 1, maxQuantity: 1 }
      ],
      'skeleton': [
        { itemId: 'bone', chance: 0.7, minQuantity: 1, maxQuantity: 3 },
        { itemId: 'arrow', chance: 0.4, minQuantity: 1, maxQuantity: 5 }
      ],
      'zombie': [
        { itemId: 'rotten_flesh', chance: 0.8, minQuantity: 1, maxQuantity: 2 }
      ],
      'spider': [
        { itemId: 'spider_silk', chance: 0.6, minQuantity: 1, maxQuantity: 3 },
        { itemId: 'spider_eye', chance: 0.3, minQuantity: 1, maxQuantity: 1 }
      ],
      'orc': [
        { itemId: 'coins', chance: 0.8, minQuantity: 10, maxQuantity: 30 },
        { itemId: 'orc_tusk', chance: 0.4, minQuantity: 1, maxQuantity: 2 },
        { itemId: 'iron_axe', chance: 0.1, minQuantity: 1, maxQuantity: 1 }
      ],
      'troll': [
        { itemId: 'troll_hide', chance: 0.5, minQuantity: 1, maxQuantity: 1 },
        { itemId: 'coins', chance: 0.7, minQuantity: 20, maxQuantity: 50 }
      ],
      'dragon': [
        { itemId: 'dragon_scale', chance: 0.8, minQuantity: 1, maxQuantity: 3 },
        { itemId: 'dragon_claw', chance: 0.6, minQuantity: 1, maxQuantity: 2 },
        { itemId: 'coins', chance: 1.0, minQuantity: 100, maxQuantity: 500 }
      ]
    };
    return lootTables[mobType] || [{ itemId: 'coins', chance: 0.5, minQuantity: 1, maxQuantity: 5 }];
  }

  private getItemWeight(_itemId: string): number {
    // Default weight for items - could be expanded with item data
    return 1;
  }

  private handleResourceSpawn(data: { resourceId: string, position: { x: number, y: number, z: number }, resourceType: string }): void {
    // Resource spawn logic
    this.spawnResource(data.resourceId, data.position, data.resourceType);
  }

  private async spawnResource(resourceId: string, position: { x: number, y: number, z: number }, resourceType: string): Promise<Entity | null> {
    const config: ResourceEntityConfig = {
      id: resourceId,
      type: EntityType.RESOURCE,
      name: `Resource_${resourceType}`,
      position: position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      interactable: true,
      interactionType: InteractionType.GATHER,
      interactionDistance: 3,
      description: `A ${resourceType} resource`,
      model: null,
      resourceType: resourceType as ResourceType,
      resourceId: resourceId,
      harvestSkill: 'woodcutting',
      requiredLevel: 1,
      harvestTime: 3000,  // 3 seconds to harvest
      respawnTime: 60000,
      harvestYield: [
        { itemId: 'wood', quantity: 1, chance: 1.0 }
      ],
      depleted: false,
      lastHarvestTime: 0,
      properties: {
        health: {
          current: 1,
          max: 1
        },
        resourceType: resourceType as ResourceType,
        harvestable: true,
        respawnTime: 60000,
        toolRequired: 'none',
        skillRequired: 'none',
        xpReward: 10,
        movementComponent: null,
        combatComponent: null,
        healthComponent: null,
        visualComponent: null,
        level: 1,
      }
    };
    
    return this.spawnEntity(config);
  }

  private async handleResourceHarvest(_data: { entityId: string, playerId: string, amount: number }): Promise<void> {
    // Resource harvest logic would go here
    // For now, just log it
      }

  private handleNPCSpawn(data: { 
    customId: string,
    name: string,
    npcType: NPCType,
    position: { x: number, y: number, z: number },
    model: unknown,
    dialogues: string[],
    questGiver: boolean,
    shopkeeper: boolean,
    bankTeller: boolean
  }): void {
    // NPC spawn logic
      }

  private handleNPCDialogue(_data: { entityId: string, playerId: string, dialogueId: string }): void {
    // NPC dialogue logic
      }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clean up all entities
    for (const entity of this.entities.values()) {
      if (entity) {
        // Assume destroy method exists on entities
        entity.destroy();
      }
    }
    this.entities.clear();
    
    // Clear tracking sets
    this.entitiesNeedingUpdate.clear();
    this.networkDirtyEntities.clear();
    
    // Reset entity ID counter
    this.nextEntityId = 1;
    
        
    // Call parent cleanup
    super.destroy();
  }
}