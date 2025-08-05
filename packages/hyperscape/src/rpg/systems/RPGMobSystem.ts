
import type { Player, World } from '../../types/index';
import { AnyEvent, EventType } from '../../types/events';
import type { RPGItem } from '../types/core';
import { ItemType, WeaponType, AttackType, EquipmentSlotName } from '../types/core';
import { ItemRarity } from '../types/entities';
import { RPGSystemBase } from './RPGSystemBase';
// World eliminated - using base World instead
import { ALL_MOBS, MOB_SPAWN_CONSTANTS } from '../data/mobs';
import { ALL_WORLD_AREAS } from '../data/world-areas';
import { MobSpawnConfig, RPGMobData } from '../types/core';
import { calculateDistance } from '../utils/EntityUtils';
import { RPGEntityManager } from './RPGEntityManager';

/**
 * RPG Mob System - GDD Compliant
 * Handles mob spawning, AI behavior, and lifecycle management per GDD specifications:
 * - 15-minute global respawn cycle
 * - Fixed spawn locations with biome-appropriate mobs
 * - Aggressive vs non-aggressive behavior based on mob type
 * - Level-based aggro (high-level players ignored by low-level aggressive mobs)
 * - Combat integration with player combat system
 */
export class RPGMobSystem extends RPGSystemBase {
  private mobs = new Map<string, RPGMobData>();
  private spawnPoints = new Map<string, { config: MobSpawnConfig, position: { x: number; y: number; z: number } }>();
  private respawnTimers = new Map<string, number>(); // Changed to store respawn times instead of timers
  private lastAIUpdate = 0;
  private entityManager?: RPGEntityManager;
  private mobIdCounter = 0;
  
  private readonly GLOBAL_RESPAWN_TIME = MOB_SPAWN_CONSTANTS.GLOBAL_RESPAWN_TIME;
  private readonly AI_UPDATE_INTERVAL = 1000; // 1 second AI updates
  private readonly MAX_CHASE_DISTANCE = 20; // Maximum chase distance before returning home
  
  // Mob configurations loaded from externalized data
  private readonly MOB_CONFIGS: Record<string, MobSpawnConfig> = this.createMobConfigs();
  /**
   * Convert externalized MobData to MobSpawnConfig format
   */
  private createMobConfigs(): Record<string, MobSpawnConfig> {
    const configs: Record<string, MobSpawnConfig> = {};
    
    for (const [mobId, mobData] of Object.entries(ALL_MOBS)) {
      configs[mobId] = {
        type: mobId as RPGMobData['type'],
        name: mobData.name,
        level: mobData.stats.level,
        stats: {
          attack: mobData.stats.attack,
          strength: mobData.stats.strength,
          defense: mobData.stats.defense,
          constitution: mobData.stats.constitution,
          ranged: mobData.stats.ranged
        },
        equipment: {
        weapon: null,
        armor: null
      }, // Equipment can be added later if needed
        lootTable: `${mobId}_drops`,
        isAggressive: mobData.behavior.aggressive,
        aggroRange: mobData.behavior.aggroRange,
        respawnTime: mobData.respawnTime || this.GLOBAL_RESPAWN_TIME
      };
    }
    
    return configs;
  }

  constructor(world: World) {
    super(world, {
      name: 'rpg-mob',
      dependencies: {
        required: ['rpg-entity-manager'], // Needs entity manager to spawn/manage mobs
        optional: ['rpg-player', 'rpg-combat'] // Better with player and combat systems
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    // Set up type-safe event subscriptions
    this.subscribe<{ entityId: string; killedBy: string; entityType: 'player' | 'mob' }>(EventType.ENTITY_DEATH, (event) => this.handleMobDeath(event.data));
    this.subscribe<{ entityId: string; damage: number; damageSource: string; entityType: 'player' | 'mob' }>(EventType.ENTITY_DAMAGE_TAKEN, (event) => this.handleMobDamage(event.data));
    this.subscribe<{ playerId: string }>(EventType.PLAYER_REGISTERED, (_event) => this.onPlayerEnter());
    this.subscribe<{ mobType: string; position: { x: number; y: number; z: number } }>(EventType.MOB_SPAWN_REQUEST, (event) => this.spawnMobAtLocation(event.data));
    
    // Initialize spawn points (these would normally be loaded from world data)
    this.initializeSpawnPoints();
    
    // Initialize AI update timing for frame-based updates
    this.lastAIUpdate = Date.now();
  }

  start(): void {

    
    // Get reference to EntityManager
    this.entityManager = this.world.getSystem<RPGEntityManager>('rpg-entity-manager');
    if (this.entityManager) {
      // Spawn initial mobs if EntityManager is available
      this.spawnAllMobs();
    }
  }

  private initializeSpawnPoints(): void {
    // Load spawn points from externalized world areas data
    let spawnId = 1;
    
    for (const [areaId, area] of Object.entries(ALL_WORLD_AREAS)) {
      if (area.mobSpawns && area.mobSpawns.length > 0) {
        for (const mobSpawn of area.mobSpawns) {
          const config = this.MOB_CONFIGS[mobSpawn.mobId];
          if (config) {
            // Generate multiple spawn points within the spawn radius
            for (let i = 0; i < mobSpawn.maxCount; i++) {
              // Generate random position within spawn radius
              const angle = Math.random() * Math.PI * 2;
              const distance = Math.random() * mobSpawn.spawnRadius;
              const position = {
                x: mobSpawn.position.x + Math.cos(angle) * distance,
                y: mobSpawn.position.y || 2, // Use specified Y or default to 2
                z: mobSpawn.position.z + Math.sin(angle) * distance
              };

              this.spawnPoints.set(`${areaId}_spawn_${spawnId}`, { config, position });
              spawnId++;
            }
          }
        }
      }
    }
  }

  private spawnAllMobs(): void {
    for (const [spawnId, spawnData] of this.spawnPoints.entries()) {
      this.spawnMobInternal(spawnId, spawnData.config, spawnData.position);
    }
  }

  private async spawnMobInternal(spawnId: string, config: MobSpawnConfig, position: { x: number; y: number; z: number }): Promise<string | null> {
    if (!this.entityManager) {
      return null;
    }
    
    const mobId = `mob_${spawnId}_${Date.now()}`;
    
    const mobData: RPGMobData = {
      id: mobId,
      type: config.type,
      name: config.name,
      level: config.level,
      health: (config.stats?.constitution || 10) * 10, // Health = Constitution * 10 per GDD
      maxHealth: (config.stats?.constitution || 10) * 10,
      position: { x: position.x, y: position.y, z: position.z },
      isAlive: true,
      isAggressive: config.isAggressive,
      aggroRange: config.aggroRange,
      respawnTime: config.respawnTime,
      aiState: 'idle',
      homePosition: { x: position.x, y: position.y, z: position.z },
      spawnLocation: { x: position.x, y: position.y, z: position.z },
      equipment: config.equipment || {
        weapon: null,
        armor: null
      },
      lootTable: config.lootTable,
      lastAI: Date.now(),
      stats: config.stats ?? { attack: 1, strength: 1, defense: 1, constitution: 10, ranged: 1 },
      wanderRadius: 5,
      target: null
    };

    this.mobs.set(mobId, mobData);
    
    // Register mob with combat system and AI system
    this.emitTypedEvent(EventType.MOB_SPAWNED, { 
      id: mobId,
      type: config.type,
      level: config.level,
      position: { x: position.x, y: position.y, z: position.z },
      name: config.name,
      health: mobData.health,
      maxHealth: mobData.maxHealth,
      mobType: config.type,
      customId: mobId,
      // Additional data that some systems might need
      mob: {
        id: mobId,
        mobData: config,
        currentHealth: mobData.health,
        isAlive: true,
        homePosition: { x: position.x, y: position.y, z: position.z },
        spawnPoint: {
          respawnTime: config.respawnTime,
          spawnRadius: config.aggroRange
        },
        mesh: null // Will be set by the mob app
      }
    } as unknown as AnyEvent);
    
    // Wait for entity to be created by EntityManager
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const entity = this.world.entities.get(mobId);
        if (entity) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 10);
      
      // Timeout after 2 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 2000);
    });
    
    return mobId;
  }

  private spawnMobAtLocation(data: { mobType: string; position: { x: number; y: number; z: number } }): void {
    const config = this.MOB_CONFIGS[data.mobType];
    if (!config) {
      return;
    }

    const spawnId = `custom_${Date.now()}_${++this.mobIdCounter}`;
    this.spawnMobInternal(spawnId, config, data.position);
  }

  private handleMobDamage(data: { entityId: string; damage: number; damageSource: string; entityType: 'player' | 'mob' }): void {
    if (data.entityType !== 'mob') return;
    
    // Validate entityId is defined
    if (!data.entityId) {
      console.warn('[RPGMobSystem] handleMobDamage called with undefined entityId');
      return;
    }
    
    const mob = this.mobs.get(data.entityId);
    if (!mob || !mob.isAlive) return;

    // Apply damage
    mob.health = Math.max(0, mob.health - data.damage);
    
    // Emit damage event for AI system
    this.emitTypedEvent(EventType.MOB_ATTACKED, {
      mobId: data.entityId,
      damage: data.damage,
      attackerId: data.damageSource
    });
    
    // Check if mob died from damage
    if (mob.health <= 0) {
      // Let handleMobDeath emit the proper event with all data
      this.handleMobDeath({
        entityId: data.entityId,
        killedBy: data.damageSource,
        entityType: 'mob'
      });
    }
  }

  private onPlayerEnter(): void {
    // Handle player entering world - update mob AI awareness
    // This allows mobs to detect and potentially aggro on the new player
    
    // Notify all aggressive mobs about player presence
    for (const mob of this.mobs.values()) {
      if (mob.isAlive && mob.isAggressive && mob.aiState === 'idle') {
        // Check if player is in aggro range (this would be done in AI update loop)
        // For now, just log player entry
      }
    }
  }

  private handleMobDeath(data: { entityId: string; killedBy: string; entityType: 'player' | 'mob' }): void {
    if (data.entityType !== 'mob') return;
    
    const mob = this.mobs.get(data.entityId);
    if (!mob) return;

    mob.isAlive = false;
    mob.aiState = 'dead';
    mob.health = 0;
    
    // Loot generation is now handled by RPGLootSystem via rpg:mob:died event
            // this.generateLoot(mob);
    
    // Schedule respawn per GDD (15-minute global cycle)
    const respawnTime = Date.now() + mob.respawnTime;
    this.respawnTimers.set(data.entityId, respawnTime);
    
    // Emit mob death event with all necessary data for RPGLootSystem
    this.emitTypedEvent(EventType.MOB_DIED, {
      mobId: data.entityId,
      mobType: mob.type,
      level: mob.level,
      killedBy: data.killedBy,
      position: { x: mob.position.x, y: mob.position.y, z: mob.position.z }
    });
  }

  private respawnMob(mobId: string): void {
    const mob = this.mobs.get(mobId);
    if (!mob) return;

    // Reset mob to spawn state
    mob.isAlive = true;
    mob.health = mob.maxHealth;
    mob.position = { ...mob.spawnLocation };
    mob.homePosition = { ...mob.spawnLocation };
    mob.aiState = 'idle';
    mob.target = null;
    mob.lastAI = Date.now();

    // Clear respawn timer
    this.respawnTimers.delete(mobId);
    
    // Create mob entity via EntityManager
    if (this.entityManager) {
      const config = this.MOB_CONFIGS[mob.type];
      if (config) {
        this.emitTypedEvent(EventType.MOB_SPAWNED, {
          mobType: config.type,
          level: config.level,
          position: { x: mob.position.x, y: mob.position.y, z: mob.position.z }
        });
      }
    }
    
    // Re-register with combat system and AI system
    const mobConfig = this.MOB_CONFIGS[mob.type];
    this.emitTypedEvent(EventType.MOB_SPAWNED, { 
      id: mobId,
      type: mob.type,
      level: mob.level,
      position: { x: mob.homePosition.x, y: mob.homePosition.y, z: mob.homePosition.z },
      name: mobConfig?.name || mob.name,
      health: mob.health,
      maxHealth: mob.maxHealth,
      mobType: mob.type,
      customId: mobId,
      // Additional data that some systems might need
      mob: {
        id: mobId,
        mobData: mobConfig,
        currentHealth: mob.health,
        isAlive: true,
        homePosition: { x: mob.homePosition.x, y: mob.homePosition.y, z: mob.homePosition.z },
        spawnPoint: {
          respawnTime: mob.respawnTime,
          spawnRadius: mob.aggroRange
        }
      }
    });
  }

  private generateLoot(mob: RPGMobData): void {
    // Generate loot based on mob's loot table per GDD
    const loot = this.rollLootTable(mob.lootTable, mob.level);
    
    if (loot.length > 0) {
      // Create loot drop at mob's death location
      this.emitTypedEvent(EventType.ITEM_SPAWN_LOOT, {
        lootTable: mob.type,
        position: { x: mob.position.x, y: mob.position.y, z: mob.position.z }
      });
    }
  }

  private rollLootTable(lootTable: string, mobLevel: number): Array<{ item: RPGItem; quantity: number }> {
    // Simplified loot generation - in full implementation would use proper loot tables
    const loot: Array<{ item: RPGItem; quantity: number }> = [];
    
    // Always drop coins per GDD
    const coinAmount = Math.floor(mobLevel * (5 + Math.random() * 10));
    loot.push({ 
      item: { 
        id: '1000', 
        name: 'Coins', 
        type: ItemType.CURRENCY,
        quantity: coinAmount,
        stackable: true,
        maxStackSize: 999,
        value: 1,
        weight: 0,
        equipSlot: null,
                    weaponType: WeaponType.NONE,
        equipable: false,
        attackType: null,
        description: 'Gold coins used as currency',
        examine: 'Gleaming gold coins',
        tradeable: true,
        rarity: ItemRarity.COMMON,
        modelPath: 'items/coins.glb',
        iconPath: 'icons/coins.png',
        healAmount: 0,
        stats: { attack: 0, defense: 0, strength: 0 },
        bonuses: { attack: 0, defense: 0, strength: 0 },
        requirements: { level: 1, skills: {} }
      },
      quantity: coinAmount
    });
    
    // Chance for equipment drops based on mob level
    const equipmentChance = Math.min(0.1 + (mobLevel * 0.01), 0.3); // 10-30% chance
    if (Math.random() < equipmentChance) {
      // Generate appropriate tier equipment
      if (mobLevel <= 5) {
        loot.push({ 
          item: {
            id: '2001', 
            name: 'Bronze sword', 
            type: ItemType.WEAPON,
            quantity: 1,
            stackable: false,
            maxStackSize: 1,
            value: 10,
            weight: 5,
            equipSlot: EquipmentSlotName.WEAPON,
            weaponType: WeaponType.SWORD,
            equipable: true,
            attackType: AttackType.MELEE,
            description: 'A basic bronze sword',
            examine: 'A well-crafted bronze blade',
            tradeable: true,
            rarity: ItemRarity.COMMON,
            modelPath: 'items/bronze_sword.glb',
            iconPath: 'icons/bronze_sword.png',
            healAmount: 0,
            stats: { attack: 5, defense: 0, strength: 2 },
            bonuses: { attack: 5, defense: 0, strength: 2 },
            requirements: { level: 1, skills: {} }
          },
          quantity: 1
        });
      } else if (mobLevel <= 15) {
        loot.push({ 
          item: {
            id: '2002', 
            name: 'Steel sword', 
            type: ItemType.WEAPON,
            quantity: 1,
            stackable: false,
            maxStackSize: 1,
            value: 50,
            weight: 6,
            equipSlot: EquipmentSlotName.WEAPON,
            weaponType: WeaponType.SWORD,
            equipable: true,
            attackType: AttackType.MELEE,
            description: 'A sturdy steel sword',
            examine: 'A well-forged steel blade',
            tradeable: true,
            rarity: ItemRarity.UNCOMMON,
            modelPath: 'items/steel_sword.glb',
            iconPath: 'icons/steel_sword.png',
            healAmount: 0,
            stats: { attack: 12, defense: 0, strength: 5 },
            bonuses: { attack: 12, defense: 0, strength: 5 },
            requirements: { level: 10, skills: {} }
          },
          quantity: 1
        });
      } else {
        loot.push({ 
          item: {
            id: '2003', 
            name: 'Mithril sword', 
            type: ItemType.WEAPON,
            quantity: 1,
            stackable: false,
            maxStackSize: 1,
            value: 250,
            weight: 4,
            equipSlot: EquipmentSlotName.WEAPON,
            weaponType: WeaponType.SWORD,
            equipable: true,
            attackType: AttackType.MELEE,
            description: 'A masterfully crafted mithril sword',
            examine: 'A gleaming blade of pure mithril',
            tradeable: true,
            rarity: ItemRarity.RARE,
            modelPath: 'items/mithril_sword.glb',
            iconPath: 'icons/mithril_sword.png',
            healAmount: 0,
            stats: { attack: 25, defense: 0, strength: 10 },
            bonuses: { attack: 25, defense: 0, strength: 10 },
            requirements: { level: 20, skills: {} }
          },
          quantity: 1
        });
      }
    }
    
    // Dark Rangers drop arrows commonly per GDD
    if (lootTable === 'dark_ranger_drops') {
      loot.push({ 
        item: {
          id: '3001', 
          name: 'Arrows', 
          type: ItemType.AMMUNITION,
          quantity: 10 + Math.floor(Math.random() * 20),
          stackable: true,
          maxStackSize: 100,
          value: 1,
          weight: 0.1,
          equipSlot: EquipmentSlotName.ARROWS,
                      weaponType: WeaponType.NONE,
          equipable: true,
          attackType: AttackType.RANGED,
          description: 'Sharp arrows for ranged combat',
          examine: 'Well-crafted arrows with steel tips',
          tradeable: true,
          rarity: ItemRarity.COMMON,
          modelPath: 'items/arrows.glb',
          iconPath: 'icons/arrows.png',
          healAmount: 0,
          stats: { attack: 0, defense: 0, strength: 0 },
          bonuses: { attack: 0, ranged: 2, strength: 2 },
          requirements: { level: 1, skills: {} }
        },
        quantity: 10 + Math.floor(Math.random() * 20)
      });
    }
    
    return loot;
  }

  // Public API methods for integration tests
  public getAllMobs(): RPGMobData[] {
    return Array.from(this.mobs.values());
  }

  public getMob(mobId: string): RPGMobData | undefined {
    return this.mobs.get(mobId);
  }

  public getMobsInArea(center: { x: number; y: number; z: number }, radius: number): RPGMobData[] {
    return Array.from(this.mobs.values()).filter(mob => {
      if (!mob.isAlive) return false;
      const distance = calculateDistance(mob.position, center);
      return distance <= radius;
    });
  }

  /**
   * Public method to spawn a mob for testing/dynamic purposes
   */
  public async spawnMob(config: MobSpawnConfig, position: { x: number; y: number; z: number }): Promise<string | null> {


    // Convert the config to the internal MobSpawnConfig format
    const mobConfig: MobSpawnConfig = {
      type: config.type,
      name: config.name,
      level: config.level,
      stats: config.stats ?? {
        attack: config.level,
        strength: config.level,
        defense: config.level,
        constitution: 30,
        ranged: 1
      },
      equipment: {
        weapon: null,
        armor: null
      },
      lootTable: 'default',
      isAggressive: config.isAggressive !== false, // Default to true if not specified
      aggroRange: config.aggroRange ?? 5,
      respawnTime: config.respawnTime ?? 0
    };

    const timestamp = Date.now();
    const spawnId = `test_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    
    // spawnMobInternal now returns the actual mob ID
    const mobId = await this.spawnMobInternal(spawnId, mobConfig, position);
    
    return mobId;
  }

  private updateAllMobAI(): void {
    const now = Date.now();
    
    for (const mob of this.mobs.values()) {
      if (!mob.isAlive) continue;
      
      // Update mob AI
      this.updateMobAI(mob, now);
    }
  }

  private updateMobAI(mob: RPGMobData, now: number): void {
    // Simple AI state machine
    switch (mob.aiState) {
      case 'idle':
        this.handleIdleAI(mob);
        break;
      case 'patrolling':
        this.handlePatrolAI(mob, now); 
        break;
      case 'chasing':
        this.handleChaseAI(mob);
        break;
      case 'attacking':
        this.handleAttackAI(mob);
        break;
      case 'returning':
        this.handleReturnAI(mob);
        break;
    }
    
    mob.lastAI = now;
  }

  private handleIdleAI(mob: RPGMobData): void {
    if (!mob.isAggressive) return;
    
    // Look for nearby players to aggro
    const nearbyPlayer = this.findNearbyPlayer(mob);
    if (nearbyPlayer) {
       
      mob.target = nearbyPlayer.id;
      mob.aiState = 'chasing';
    }
  }

  private handlePatrolAI(mob: RPGMobData, now: number): void {
    // Simple patrol behavior - move randomly around home position
    if (now - mob.lastAI > 3000) { // Change direction every 3 seconds
      const angle = Math.random() * Math.PI * 2;
      const distance = 2 + Math.random() * 5;
      
      mob.position.x = mob.homePosition.x + Math.cos(angle) * distance;
      mob.position.z = mob.homePosition.z + Math.sin(angle) * distance;
      
      // Update position in world
      this.emitTypedEvent(EventType.MOB_POSITION_UPDATED, {
        entityId: mob.id,
        position: { x: mob.position.x, y: mob.position.y, z: mob.position.z }
      });
    }
    
    // Check for aggro while patrolling
    if (mob.isAggressive) {
      const nearbyPlayer = this.findNearbyPlayer(mob);
      if (nearbyPlayer) {
         
        mob.target = nearbyPlayer.id;
        mob.aiState = 'chasing';
      }
    }
  }

  private handleChaseAI(mob: RPGMobData): void {
    if (!mob.target) {
      mob.aiState = 'returning';
      return;
    }
    
    const targetPlayer = this.getPlayer(mob.target);
    if (!targetPlayer) {
      mob.target = null;
      mob.aiState = 'returning';
      return;
    }
    
     
    const distance = calculateDistance(mob.position, targetPlayer.position);
    
    // Check if too far from home - return if so
    const homeDistance = calculateDistance(mob.position, mob.homePosition);
    if (homeDistance > this.MAX_CHASE_DISTANCE) {
      mob.target = null;
      mob.aiState = 'returning';
      return;
    }
    
    // If in attack range, start attacking
    const attackRange = mob.equipment.weapon?.type === 'ranged' ? 8 : 2;
    if (distance <= attackRange) {
      mob.aiState = 'attacking';
      // Start combat with player
      this.emitTypedEvent(EventType.COMBAT_START_ATTACK, {
        attackerId: mob.id,
        targetId: mob.target
      });
      return;
    }
    
    // Move towards target
     
    this.moveTowardsTarget(mob, targetPlayer.position);
  }

  private handleAttackAI(mob: RPGMobData): void {
    if (!mob.target) {
      mob.aiState = 'idle';
      return;
    }
    
    const targetPlayer = this.getPlayer(mob.target);
    
    if (!targetPlayer || (targetPlayer.health !== undefined && targetPlayer.health.current <= 0)) {
      mob.target = null;
      mob.aiState = 'idle';
      return;
    }
    
     
    const distance = calculateDistance(mob.position, targetPlayer.position);
    const attackRange = mob.equipment.weapon?.type === 'ranged' ? 8 : 2;
    
    // If target moved out of range, chase again
    if (distance > attackRange * 1.5) {
      mob.aiState = 'chasing';
      return;
    }
    
    // Combat system handles the actual attacking
  }

  private handleReturnAI(mob: RPGMobData): void {
    const homeDistance = calculateDistance(mob.position, mob.homePosition);
    
    if (homeDistance <= 1) {
      mob.aiState = 'idle';
      return;
    }
    
    // Move towards home
    this.moveTowardsTarget(mob, mob.homePosition);
  }

  private findNearbyPlayer(mob: RPGMobData): Player | null {
    const players = this.world.entities.getPlayers();
    
    for (const player of players) {
      const distance = calculateDistance(mob.position, player.node.position);
      if (distance <= mob.aggroRange) {
        // Get player combat level for level-based aggro checks
        // Get player combat level through the RPG API
         
        const playerCombatLevel = this.world.rpg?.getCombatLevel(player.id) || 1;
        
        // GDD: High-level players ignored by low-level aggressive mobs (except special cases)
        if (mob.level < 15 && playerCombatLevel > mob.level * 2) {
          continue; // Skip high-level players for low-level mobs
        }
        
        // Special cases: Dark Warriors and higher always aggressive per GDD
        if (mob.type === 'dark_warrior' || mob.type === 'black_knight' || 
            mob.type === 'ice_warrior' || mob.type === 'dark_ranger') {
          return player; // Always aggressive regardless of player level
        }
        
        return player;
      }
    }
    
    return null;
  }

  private getPlayer(playerId: string): Player | null {
    // Get specific player from player system
    return this.world.getPlayer(playerId);
  }

  /**
   * Despawn a mob immediately
   * Used by test systems and cleanup operations
   */
  public despawnMob(mobId: string): boolean {
    if (!mobId) {
      return false;
    }

    const mob = this.mobs.get(mobId);
    if (!mob) {
      return false;
    }

    // Mark as dead and remove from active mobs
    mob.isAlive = false;
    mob.aiState = 'dead';
    
    // Clear any respawn timer
    const respawnTimer = this.respawnTimers.get(mobId);
    if (respawnTimer) {
      this.respawnTimers.delete(mobId);
    }

    // Remove from mobs collection
    this.mobs.delete(mobId);

    // Emit despawn event for cleanup
    this.emitTypedEvent(EventType.MOB_DESPAWN, {
      mobId,
      mobType: mob.type,
      position: { x: mob.position.x, y: mob.position.y, z: mob.position.z }
    });

    return true;
  }

  /**
   * Despawn all mobs (used for cleanup)
   */
  public despawnAllMobs(): number {
    const mobIds = Array.from(this.mobs.keys());
    let despawnedCount = 0;

    for (const mobId of mobIds) {
      if (this.despawnMob(mobId)) {
        despawnedCount++;
      }
    }

    return despawnedCount;
  }

  /**
   * Force kill a mob without loot or respawn
   */
  public killMob(mobId: string): boolean {
    const mob = this.mobs.get(mobId);
    if (!mob) {
      return false;
    }
    
    if (!mob.isAlive) {
      return false;
    }

    // Trigger death without loot
    this.emitTypedEvent(EventType.MOB_DIED, {
      entityId: mobId,
      killedBy: 'system',
      entityType: 'mob'
    });

    return true;
  }

  /**
   * Move mob towards target position
   */
  private moveTowardsTarget(mob: RPGMobData, targetPosition: { x: number; y: number; z: number }): void {
    if (!targetPosition) return;

    const mobPosition = mob.position;
    const distance = Math.sqrt(
      (targetPosition.x - mobPosition.x) ** 2 + 
      (targetPosition.z - mobPosition.z) ** 2
    );

    if (distance > 0.5) { // Don't move if very close
      const moveSpeed = 2; // units per second
      const deltaTime = 0.016; // Assuming 60 FPS
      const moveDistance = moveSpeed * deltaTime;
      
      const normalizedX = (targetPosition.x - mobPosition.x) / distance;
      const normalizedZ = (targetPosition.z - mobPosition.z) / distance;
      
      mob.position.x += normalizedX * moveDistance;
      mob.position.z += normalizedZ * moveDistance;
    }
  }

  /**
   * Main update loop - preserve AI and respawn logic
   */
  update(_dt: number): void {
    const now = Date.now();
    
    // Update AI at fixed intervals
    if (now - this.lastAIUpdate >= this.AI_UPDATE_INTERVAL) {
      this.lastAIUpdate = now;
      this.updateAllMobAI();
    }
    
    // Check respawn timers
    for (const [mobId, respawnTime] of this.respawnTimers.entries()) {
      if (now >= respawnTime) {
        this.respawnTimers.delete(mobId);
        this.respawnMob(mobId);
      }
    }
  }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all respawn timers
    this.respawnTimers.clear();
    
    // Despawn all mobs
    this.despawnAllMobs();
    
    // Clear all mob data
    this.mobs.clear();
    this.spawnPoints.clear();
    // Clear system references
    this.entityManager = undefined;
    
    // Reset timing
    this.lastAIUpdate = 0;
    

    
    // Call parent cleanup
    super.destroy();
  }
}