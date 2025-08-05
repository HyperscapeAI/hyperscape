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
import { EventType } from '../types/events';
import { getMobById } from '../data/mobs';
import { ItemEntity } from '../entities/ItemEntity';
import { MobEntity } from '../entities/MobEntity';
import { NPCEntity } from '../entities/NPCEntity';
import { ResourceEntity } from '../entities/ResourceEntity';
import { Entity, EntityConfig } from '../entities/Entity';
import { NPCBehavior, NPCState, Position3D } from '../types/core';
import type { ItemEntityConfig, ItemEntityProperties, ItemSpawnData, MobEntityConfig, MobSpawnData, NPCEntityConfig, NPCEntityProperties, NPCSpawnData, ResourceEntityConfig, ResourceEntityProperties, ResourceSpawnData } from '../types/entities';
import { EntityType, InteractionType, ItemRarity, MobAIState, MobType } from '../types/entities';
import type { EntitySpawnedEvent } from '../types/systems';
import { SystemBase } from './SystemBase';
import { Logger } from '../utils/Logger';

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
    this.subscribe<{ entityId: string }>(EventType.ENTITY_DEATH, (event) => this.handleEntityDestroy(event.data));
    this.subscribe<{ entityId: string; playerId: string; interactionType: string }>(EventType.ENTITY_INTERACT, (event) => this.handleInteractionRequest(event.data));
    this.subscribe<{ entityId: string; position: Position3D }>(EventType.ENTITY_MOVE_REQUEST, (event) => this.handleMoveRequest(event.data));
    this.subscribe<{ entityId: string; propertyName: string; value: unknown }>(EventType.ENTITY_PROPERTY_REQUEST, (event) => this.handlePropertyRequest(event.data));
    
    // Listen for specific entity type spawn requests
    this.subscribe<ItemSpawnData>(EventType.ITEM_SPAWNED, (event) => this.handleItemSpawn(event.data));
    this.subscribe<{ entityId: string; playerId: string }>(EventType.ITEM_PICKUP, (event) => this.handleItemPickup(event.data));
    this.subscribe<MobSpawnData>(EventType.MOB_SPAWNED, (event) => this.handleMobSpawn(event.data));
    this.subscribe<{ entityId: string; damage: number; attackerId: string }>(EventType.MOB_ATTACKED, (event) => this.handleMobAttacked(event.data));
    Logger.system('EntityManager', '✅ Event listeners registered, ready to handle mob spawns');
    this.subscribe<{ mobId: string; targetId: string; damage: number }>(EventType.COMBAT_MOB_ATTACK, (event) => this.handleMobAttack(event.data));
    this.subscribe<ResourceSpawnData>(EventType.RESOURCE_GATHERED, (event) => this.handleResourceSpawn(event.data));
    this.subscribe<{ entityId: string; playerId: string; amount: number }>(EventType.RESOURCE_HARVEST, (event) => this.handleResourceHarvest(event.data));
    this.subscribe<NPCSpawnData>(EventType.NPC_INTERACTION, (event) => this.handleNPCSpawn(event.data));
    this.subscribe<{ entityId: string; playerId: string; dialogueId: string }>(EventType.NPC_DIALOGUE, (event) => this.handleNPCDialogue(event.data));
    
    // Network sync for clients
    if (this.world.isClient) {
      this.subscribe<{ clientId: string }>(EventType.CLIENT_CONNECT, (event) => this.handleClientConnect({ playerId: event.data.clientId }));
      this.subscribe<{ clientId: string }>(EventType.CLIENT_DISCONNECT, (event) => this.handleClientDisconnect({ playerId: event.data.clientId }));
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
    Logger.system('EntityManager', `Adding entity ${config.id} to world.entities`);
    this.world.entities.set(config.id, entity);
    Logger.system('EntityManager', `Entity ${config.id} added to world.entities`);
    
    // Mark for network sync
    if (this.world.isServer) {
      this.networkDirtyEntities.add(config.id);
    }
    
    // Emit spawn event
    this.world.emit(EventType.ENTITY_SPAWNED, {
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
    this.world.emit(EventType.ENTITY_DEATH, {
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
      Logger.system('EntityManager', ` Entity not found: ${data.entityId}`);
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
      Logger.system('EntityManager', ` Entity not found: ${data.entityId}`);
      return;
    }
    entity.setPosition(data.position.x, data.position.y, data.position.z);
  }

  private handlePropertyRequest(data: { entityId: string; propertyName: string; value: unknown }): void {
    const entity = this.entities.get(data.entityId);
    if (!entity) {
      Logger.system('EntityManager', ` Entity not found: ${data.entityId}`);
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
      rotation: { x: 0, y: 0, z: 0 },
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
        health: 1,
        maxHealth: 1,
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
      Logger.system('EntityManager', ` Cannot pickup entity ${data.entityId} - not found`);
      return;
    }
    
    // Get properties before destroying
    const itemId = entity.getProperty('itemId');
    const quantity = entity.getProperty('quantity');
    
    this.destroyEntity(data.entityId);
    
    this.world.emit(EventType.ITEM_PICKUP, {
      playerId: data.playerId,
      item: itemId,
      quantity: quantity
    });
  }

  private async handleMobSpawn(data: MobSpawnData): Promise<void> {
    Logger.system('EntityManager', 'Handling mob spawn request', { data });
    
    // Validate required data
    const position = data.position;
    if (!position) {
      throw new Error('[EntityManager] Mob spawn position is required');
    }
    
    const mobType = data.mobType;
    if (!mobType) {
      throw new Error('[EntityManager] Mob type is required');
    }
    
    const level = data.level || 1;
    
    const config: MobEntityConfig = {
      id: data.customId || `mob_${this.nextEntityId++}`,
      name: data.name || mobType || 'Mob',
      type: EntityType.MOB,
      position: position,
      rotation: { x: 0, y: 0, z: 0 },
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
        health: this.getMobMaxHealth(mobType, level),
        maxHealth: this.getMobMaxHealth(mobType, level),
        level: level,
      },
      targetPlayerId: null,
      deathTime: null
    };
    
    const entity = await this.spawnEntity(config);
    Logger.system('EntityManager', `✅ Mob entity spawned: ${entity?.id} (${mobType})`);
    Logger.system('EntityManager', `Entity exists in world.entities: ${this.world.entities.has(config.id)}`);
    Logger.system('EntityManager', 'Entity spawned successfully');
  }

  private handleMobAttacked(data: { entityId: string; damage: number; attackerId: string }): void {
    const mob = this.entities.get(data.entityId);
    if (!mob) {
      Logger.system('EntityManager', ` Cannot handle mob attacked - entity ${data.entityId} not found`);
      return;
    }
    
    const currentHealth = mob.getProperty('health');
    if (typeof currentHealth !== 'number') {
      Logger.systemError('EntityManager', `Invalid health value for mob ${data.entityId}`);
      return;
    }
    const newHealth = Math.max(0, currentHealth - data.damage);
    
    mob.setProperty('health', newHealth);
    
    if (newHealth <= 0) {
      this.world.emit(EventType.MOB_DIED, {
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
      Logger.system('EntityManager', ` Cannot handle mob attack - entity ${data.mobId} not found`);
      return;
    }
    
    const damage = mob.getProperty('attackPower');
    
    this.world.emit(EventType.PLAYER_DAMAGE, {
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
    
    this.world.emit(EventType.CLIENT_ENTITY_SYNC, {
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
    
    this.world.emit(EventType.NETWORK_ENTITY_UPDATES, { updates });
    
    // Clear dirty entities
    this.networkDirtyEntities.clear();
  }

  private getItemType(_itemId: string): string {
    // Get item type from data
    return 'misc';
  }

  private isItemStackable(_itemId: string): boolean {
    // Check if item is stackable
    return true;
  }

  private getItemValue(_itemId: string): number {
    // Get item value
    return 1;
  }

  /**
   * Get item weight - simplified without defensive checks
   */
  private getItemWeight(_itemId: string): number {
    // Weight calculation based on item type
    return 1;
  }

  private getItemRarity(_itemId: string): string {
    // Get item rarity
    return 'common';
  }

  private getMobMaxHealth(mobType: string, level: number): number {
    // Get health from externalized mob data
    const mobData = getMobById(mobType);
    if (mobData) {
      // Use the health from mob data, with level scaling
      return mobData.stats.health + (level * 10);
    }
    
    // Fallback for unknown mob types
    Logger.system('EntityManager', ` Unknown mob type: ${mobType}`);
    return 50 + (level * 10);
  }

  private getMobAttackPower(mobType: string, level: number): number {
    // Get attack power from externalized mob data
    const mobData = getMobById(mobType);
    if (mobData) {
      // Use the attack from mob data, with level scaling
      return mobData.stats.attack + (level * 2);
    }
    
    // Fallback for unknown mob types
    Logger.system('EntityManager', ` Unknown mob type: ${mobType}`);
    return 10 + (level * 2);
  }

  private getMobDefense(mobType: string, level: number): number {
    // Get defense from externalized mob data
    const mobData = getMobById(mobType);
    if (mobData) {
      // Use the defense from mob data, with level scaling
      return mobData.stats.defense + level;
    }
    
    // Fallback for unknown mob types
    Logger.system('EntityManager', ` Unknown mob type: ${mobType}`);
    return 5 + level;
  }

  private getMobAttackSpeed(_mobType: string): number {
    // Attack speed in attacks per second
    return 1.0;
  }

  private getMobMoveSpeed(mobType: string): number {
    // Movement speed
    const speeds = {
      goblin: 4,
      bandit: 5,
      barbarian: 3,
      hobgoblin: 4,
      guard: 3,
      dark_warrior: 4,
      black_knight: 2.5,
      ice_warrior: 3,
      dark_ranger: 6
    };
    
    return speeds[mobType];
  }

  private getMobAggroRange(_mobType: string): number {
    // Aggro detection range
    return 10;
  }

  private getMobCombatRange(_mobType: string): number {
    // Combat engagement range
    return 2;
  }

  private getMobXPReward(mobType: string, level: number): number {
    // XP reward calculation
    const baseXP = {
      goblin: 15,
      bandit: 20,
      barbarian: 25,
      hobgoblin: 30,
      guard: 40,
      dark_warrior: 50,
      black_knight: 80,
      ice_warrior: 60,
      dark_ranger: 70
    };
    
    return baseXP[mobType] * level;
  }

  private getMobLootTable(mobType: string): Array<{ itemId: string; chance: number; minQuantity: number; maxQuantity: number }> {
    // Simplified loot tables
    const tables = {
      goblin: [
        { itemId: 'coins', chance: 1.0, minQuantity: 1, maxQuantity: 5 },
        { itemId: 'bronze_sword', chance: 0.1, minQuantity: 1, maxQuantity: 1 }
      ],
      bandit: [
        { itemId: 'coins', chance: 1.0, minQuantity: 5, maxQuantity: 15 },
        { itemId: 'bronze_shield', chance: 0.15, minQuantity: 1, maxQuantity: 1 }
      ],
      barbarian: [
        { itemId: 'coins', chance: 1.0, minQuantity: 8, maxQuantity: 20 },
        { itemId: 'bronze_body', chance: 0.1, minQuantity: 1, maxQuantity: 1 }
      ]
    };
    
    return tables[mobType] || [];
  }

  private async handleResourceSpawn(data: ResourceSpawnData): Promise<void> {
    const config: EntityConfig<ResourceEntityProperties> = {
      id: data.customId || `resource_${this.nextEntityId++}`,
      name: data.name || 'Resource',
      type: EntityType.RESOURCE,
      position: data.position || { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      interactable: true,
      interactionType: InteractionType.GATHER,
      interactionDistance: 3,
      description: data.name || 'Resource',
      model: null,
      properties: {
        movementComponent: null,
        combatComponent: null,
        healthComponent: null,
        visualComponent: null,
        health: 1,
        maxHealth: 1,
        level: 1,
        resourceType: data.resourceType,
        harvestable: true,
        respawnTime: data.respawnTime || 60000,
        toolRequired: data.toolRequired,
        skillRequired: data.skillRequired,
        xpReward: data.xpReward || 10
      }
    };
    
    await this.spawnEntity(config);
  }

  private handleResourceHarvest(data: { entityId: string; playerId: string; amount: number }): void {
    const resource = this.entities.get(data.entityId);
    if (!resource) {
      Logger.system('EntityManager', ` Cannot harvest resource - entity ${data.entityId} not found`);
      return;
    }
    
    resource.setProperty('harvestable', false);
    
    // Schedule respawn
    setTimeout(() => {
      if (this.entities.has(data.entityId)) {
        resource.setProperty('harvestable', true);
      }
    }, resource.getProperty('respawnTime'));
  }

  private async handleNPCSpawn(data: NPCSpawnData): Promise<void> {
    const config: EntityConfig<NPCEntityProperties> = {
      id: data.customId || `npc_${this.nextEntityId++}`,
      name: data.name || 'NPC',
      type: EntityType.NPC,
      position: data.position || { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      interactable: true,
      interactionType: InteractionType.TALK,
      interactionDistance: 3,
      description: data.name || 'NPC',
      model: null,
      properties: {
        dialogue: data.dialogues ? data.dialogues.map(d => d.text) : [],
        shopInventory: data.shopkeeper ? [] : [],
        questGiver: data.questGiver || false,
        npcComponent: { 
          behavior: NPCBehavior.PASSIVE,
          state: NPCState.IDLE,
          currentTarget: null,
          spawnPoint: data.position || { x: 0, y: 0, z: 0 },
          wanderRadius: 0,
          aggroRange: 0,
          isHostile: false,
          combatLevel: 1,
          aggressionLevel: 0,
          dialogueLines: data.dialogues ? data.dialogues.map(d => d.text) : [],
          dialogue: (data.dialogues ? data.dialogues.map(d => d.text) : []).join('\n'),
          services: []
        },
        movementComponent: null,
        combatComponent: null,
        healthComponent: null,
        visualComponent: null,
        health: 1,
        maxHealth: 1,
        level: 1
      }
    };
    
    await this.spawnEntity(config);
  }

  private handleNPCDialogue(data: { entityId: string; playerId: string; dialogueId: string }): void {
    const npc = this.entities.get(data.entityId);
    if (!npc) {
      Logger.system('EntityManager', ` Cannot start NPC dialogue - entity ${data.entityId} not found`);
      return;
    }
    
    this.world.emit(EventType.NPC_DIALOGUE, {
      playerId: data.playerId,
      npcId: data.entityId,
      dialogue: npc.getProperty('dialogue')
    });
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
      rotation: { x: 0, y: 0, z: 0 },
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
        health: 1,
        maxHealth: 1,
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
    
    Logger.system('EntityManager', 'Entity manager destroyed and cleaned up');
    
    // Call parent cleanup
    super.destroy();
  }
}