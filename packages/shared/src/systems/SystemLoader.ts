/**
 * SystemLoader.ts - RPG Game Systems Registration
 * 
 * Central registration point for all RPG gameplay systems. This module is responsible
 * for loading and configuring all game systems into a World instance in the correct order.
 * 
 * Systems Registered:
 * 
 * **Core Game Systems:**
 * - ActionRegistry: Registers all available player actions
 * - PersistenceSystem: Database save/load for player data
 * - PlayerSystem: Player lifecycle, stats, health, stamina
 * - InventorySystem: Item storage and management (28 slots)
 * - EquipmentSystem: Worn items and equipment bonuses
 * - SkillsSystem: Experience, levels, and skill progression
 * - BankingSystem: Bank storage across multiple locations
 * 
 * **Combat Systems:**
 * - CombatSystem: Melee, ranged, and magic combat mechanics
 * - DeathSystem: Handles player/mob death and respawning
 * - AggroSystem: Enemy threat and aggression management
 * 
 * **World Systems:**
 * - MobSystem: Enemy creature lifecycle and behavior
 * - NPCSystem: Non-hostile character management
 * - MobSpawnerSystem: Dynamic mob population control
 * - ResourceSystem: Gathering nodes (trees, rocks, ore)
 * - ItemSpawnerSystem: Ground item management
 * - PathfindingSystem: A* pathfinding for AI movement
 * 
 * **Interaction Systems:**
 * - InteractionSystem: Player-entity interaction handling
 * - InventoryInteractionSystem: Item usage and consumption
 * - LootSystem: Item drops and loot tables
 * - StoreSystem: Shop management and trading
 * 
 * **Processing:**
 * - ProcessingSystem: Background jobs and async tasks
 * - EntityManager: Entity spawning and management utilities
 * 
 * API Flattening:
 * This module also "flattens" system APIs onto the World instance for easier access:
 * - world.getRPGPlayer() instead of world.getSystem('player')?.getPlayer()
 * - world.getInventory() instead of world.getSystem('inventory')?.getInventory()
 * - world.startCombat() instead of world.getSystem('combat')?.startCombat()
 * 
 * This makes the API more discoverable and reduces boilerplate in game code.
 * 
 * Usage:
 * Called by createClientWorld() and createServerWorld() during world initialization:
 * ```typescript
 * await registerSystems(world);
 * // All RPG systems are now registered and ready
 * ```
 * 
 * Used by: createClientWorld.ts, createServerWorld.ts
 * References: All RPG system implementations
 */
import { Component, ComponentConstructor } from '../components'
import { CombatComponent } from '../components/CombatComponent'
import { DataComponent } from '../components/DataComponent'
import { registerComponent } from '../components/index'
import { InteractionComponent } from '../components/InteractionComponent'
import { StatsComponent } from '../components/StatsComponent'
import { UsageComponent } from '../components/UsageComponent'
import { VisualComponent } from '../components/VisualComponent'
import { dataManager } from '../data/DataManager'
import { Entity } from '../entities/Entity'
import THREE from '../extras/three'
import type {
  Inventory,
  InventorySlotItem,
  Item,
  Position3D,
  Skills
} from '../types/core'
import type { PlayerRow } from '../types/database'
import type { EntityConfig } from '../types/entities'
import { EventType } from '../types/events'
import type { AppConfig, TerrainConfig } from '../types/settings'
import { getSystem } from '../utils/SystemUtils'
import type { World } from '../World'

// Helper function to check truthy values
function isTruthy(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}


// Import systems
import { AggroSystem } from './AggroSystem'
import { BankingSystem } from './BankingSystem'
import { CombatSystem } from './CombatSystem'
import type { DatabaseSystem } from '../types/system-interfaces'
import { DeathSystem } from './DeathSystem'
import { EntityManager } from './EntityManager'
import { EquipmentSystem } from './EquipmentSystem'
import { InventoryInteractionSystem } from './InventoryInteractionSystem'
import { InventorySystem } from './InventorySystem'
import { ItemSpawnerSystem } from './ItemSpawnerSystem'
import { MobSpawnerSystem } from './MobSpawnerSystem'
import { MobSystem } from './MobSystem'
import { PathfindingSystem } from './PathfindingSystem'
import { PersistenceSystem } from './PersistenceSystem'
import { PlayerSystem } from './PlayerSystem'
import { ProcessingSystem } from './ProcessingSystem'
import { ResourceSystem } from './ResourceSystem'
import { StoreSystem } from './StoreSystem'

// New MMO-style Systems
import { InteractionSystem } from './InteractionSystem'
import { LootSystem } from './LootSystem'
// Movement now handled by physics in PlayerLocal
// CameraSystem is ClientCameraSystem
// UI components are React-based in the client package

// World Content Systems
import { NPCSystem } from './NPCSystem'

import type { CameraSystem as CameraSystemInterface } from '../types/physics'
import { ActionRegistry } from './ActionRegistry'
import { SkillsSystem } from './SkillsSystem'



// Interface for the systems collection
export interface Systems {
  actionRegistry?: ActionRegistry
  database?: DatabaseSystem
  player?: PlayerSystem
  inventory?: InventorySystem
  combat?: CombatSystem
  skills?: SkillsSystem
  banking?: BankingSystem
  interaction?: InteractionSystem
  mob?: MobSystem
  store?: StoreSystem
  resource?: ResourceSystem
  pathfinding?: PathfindingSystem
  aggro?: AggroSystem
  equipment?: EquipmentSystem
  processing?: ProcessingSystem
  entityManager?: EntityManager
  death?: DeathSystem
  inventoryInteraction?: InventoryInteractionSystem
  loot?: LootSystem
  cameraSystem?: CameraSystemInterface
  movementSystem?: unknown
  npc?: NPCSystem
  mobSpawner?: MobSpawnerSystem
  itemSpawner?: ItemSpawnerSystem
}

/**
 * Register all systems with a Hyperscape world
 * This is the main entry point called by the bootstrap
 */
export async function registerSystems(world: World): Promise<void> {
  // Use a centralized logger
  const _logger = (world as { logger?: { system: (msg: string) => void } }).logger;
  
  // Allow disabling all RPG registrations via env flag to debug core systems only
  // Supports both server-side (process.env) and client-side (globalThis.env) flags
  const disableRPGViaProcess = (typeof process !== 'undefined' && typeof process.env !== 'undefined')
    ? (process.env.DISABLE_RPG === '1' || process.env.DISABLE_RPG === 'true' || process.env.DISABLE_RPG === 'yes' || process.env.DISABLE_RPG === 'on')
    : false;
  const globalEnv = (typeof globalThis !== 'undefined'
    ? (globalThis as unknown as { env?: Record<string, string> }).env
    : undefined);
  const disableRPGViaGlobal = globalEnv ? (isTruthy(globalEnv.DISABLE_RPG) || isTruthy(globalEnv.PUBLIC_DISABLE_RPG)) : false;
  const disableRPG = disableRPGViaProcess || disableRPGViaGlobal;
  
  // Register -specific components FIRST, before any systems
  registerComponent(
    'combat',
    CombatComponent as ComponentConstructor
  )
  registerComponent(
    'visual',
    VisualComponent as ComponentConstructor
  )
  registerComponent(
    'interaction',
    InteractionComponent as ComponentConstructor
  )
  registerComponent('usage', UsageComponent as ComponentConstructor)

  // Register data components using the generic DataComponent class
  // Include commonly used pure-data components so entity construction never fails
  const dataComponents = [
    'stats',
    'inventory',
    'equipment',
    'movement',
    'stamina',
    'ai',
    'respawn'
  ]
  for (const componentType of dataComponents) {
    registerComponent(
      componentType,
      DataComponent as ComponentConstructor
    )
  }

  // Initialize centralized data manager
  const dataValidation = await dataManager.initialize()

  if (!dataValidation.isValid) {
    throw new Error('Failed to initialize game data: ' + dataValidation.errors.join(', '))
  }

  const systems: Systems = {}

  // === FOUNDATIONAL SYSTEMS ===
  // These must be registered first as other systems depend on them

  // 1. Action Registry - Creates world.actionRegistry for action discovery
  world.register('action-registry', ActionRegistry)

  // 2. Entity Manager - Core entity management system
  world.register('entity-manager', EntityManager)

  // 3. Database system - For persistence (server only)
  // DatabaseSystem is now registered in createServerWorld(), so skip here
  // This prevents duplicate registration

  // 4. Persistence system - Core data management
  world.register('persistence', PersistenceSystem)

  // === CORE ENTITY SYSTEMS ===
  // These systems manage the primary game entities

  // 5. Player system - Core player management (depends on database & persistence)
  world.register('player', PlayerSystem)

  // 22. Pathfinding system - AI movement (depends on mob system)
  world.register('pathfinding', PathfindingSystem)

  // 23. Player spawn system - Player spawning logic (depends on player & world systems)
  
  systems.player = getSystem(world, 'player') as PlayerSystem
  systems.pathfinding = getSystem(world, 'pathfinding') as PathfindingSystem
  systems.entityManager = getSystem(world, 'entity-manager') as EntityManager

  if (world.isClient) {
    world.register('interaction', InteractionSystem)
    // CameraSystem is ClientCameraSystem
    // UI components are React-based in the client package
    systems.interaction = getSystem(world, 'interaction') as InteractionSystem
    // Camera system API is accessed through world events, not direct system reference
    systems.cameraSystem = undefined
    systems.movementSystem = getSystem(world, 'client-movement-system')
  }

  if (disableRPG) {
    // Skip registering any RPG systems/components/APIs
    return;
  }

  // 6. Mob system - Core mob management
  world.register('mob', MobSystem)

  // === INTERACTION SYSTEMS ===
  // These systems handle player-world interactions

  // 8. Combat system - Core combat mechanics (depends on player & mob systems)
  world.register('combat', CombatSystem)

  // 9. Inventory system - Item management (depends on player system)
    world.register('inventory', InventorySystem)

    // 11. Equipment system - Item equipping (depends on inventory system)
    world.register('equipment', EquipmentSystem)

    // 12. XP system - Experience and leveling (depends on player system)
    world.register('skills', SkillsSystem)

    // 12a. XP system alias for backward compatibility with test framework
    world.register('xp', SkillsSystem)

    // === SPECIALIZED SYSTEMS ===
    // These systems provide specific game features

    // 13. Banking system - Item storage (depends on inventory system)
    world.register('banking', BankingSystem)

    // 14. Store system - Item trading (depends on inventory system)
    world.register('store', StoreSystem)

    // 15. Resource system - Gathering mechanics (depends on inventory system)
    world.register('resource', ResourceSystem)

  // 18. Processing system - Crafting and item processing (depends on inventory system)
  world.register('processing', ProcessingSystem)

  // === GAMEPLAY SYSTEMS ===
  // These systems provide advanced gameplay mechanics

  // 19. Death system - Death and respawn mechanics (depends on player system)
  world.register('death', DeathSystem)

  // 20. Aggro system - AI aggression management (depends on mob & combat systems)
  world.register('aggro', AggroSystem)

  // Client-only inventory drag & drop
  if (world.isClient) {
    world.register('inventory-interaction', InventoryInteractionSystem)
  }

  // New MMO-style Systems
  world.register('loot', LootSystem)

  // World Content Systems (server only for world management)
  if (world.isServer) {
    world.register('npc', NPCSystem)
  }

  // DYNAMIC WORLD CONTENT SYSTEMS - FULL THREE.JS ACCESS, NO SANDBOX
  world.register('mob-spawner', MobSpawnerSystem)
  world.register('item-spawner', ItemSpawnerSystem)

  // Get system instances after world initialization
  // Systems are directly available as properties on the world object after registration
  // Database system is only available on server
  systems.database = getSystem(world, 'database') as DatabaseSystem
  systems.combat = getSystem(world, 'combat') as CombatSystem
  systems.inventory = getSystem(world, 'inventory') as InventorySystem
  systems.skills = getSystem(world, 'skills') as SkillsSystem
  systems.mob = getSystem(world, 'mob') as MobSystem
  systems.banking = getSystem(world, 'banking') as BankingSystem
  systems.store = getSystem(world, 'store') as StoreSystem
  systems.resource = getSystem(world, 'resource') as ResourceSystem

  systems.aggro = getSystem(world, 'aggro') as AggroSystem
  systems.equipment = getSystem(world, 'equipment') as EquipmentSystem
  systems.processing = getSystem(world, 'processing') as ProcessingSystem
  systems.death = getSystem(world, 'death') as DeathSystem

  // Client-only systems
  if (world.isClient) {
    systems.inventoryInteraction = getSystem(world, 'inventory-interaction') as InventoryInteractionSystem
  }

  // New MMO-style Systems
  systems.loot = getSystem(world, 'loot') as LootSystem

  // World Content Systems
  if (world.isServer) {
    systems.npc = getSystem(world, 'npc') as NPCSystem
  }

  // DYNAMIC WORLD CONTENT SYSTEMS
  systems.mobSpawner = getSystem(world, 'mob-spawner') as MobSpawnerSystem
  systems.itemSpawner = getSystem(world, 'item-spawner') as ItemSpawnerSystem

  // Set up API for apps to access functionality
  setupAPI(world, systems)
}

/**
 * Set up global API for apps to use
 */
function setupAPI(world: World, systems: Systems): void {
  // Set up comprehensive API for apps
  const rpgAPI = {
    // Actions - convert to Record format expected by World interface
    rpgActions: (() => {
      const actionsRecord: Record<
        string,
        { name: string; execute: (params: Record<string, unknown>) => Promise<unknown>; [key: string]: unknown }
      > = {}

      // Basic actions for compatibility
      actionsRecord['attack'] = {
        name: 'attack',
        requiresAmmunition: false,
        execute: async _params => {
          return { success: true }
        },
      }

      actionsRecord['attack_ranged'] = {
        name: 'attack',
        requiresAmmunition: true,
        execute: async _params => {
          return { success: true }
        },
      }

      actionsRecord['chop'] = {
        name: 'chop',
        skillRequired: 'woodcutting',
        execute: async _params => {
          return { success: true }
        },
      }

      actionsRecord['fish'] = {
        name: 'fish',
        skillRequired: 'fishing',
        execute: async _params => {
          return { success: true }
        },
      }

      return actionsRecord
    })(),

    // Database API
    getRPGPlayer: (playerId: string) => systems.database?.getPlayer(playerId),
    savePlayer: (playerId: string, data: Partial<PlayerRow>) => systems.database?.savePlayer(playerId, data),

    getAllPlayers: () => systems.player?.getAllPlayers(),
    healPlayer: (playerId: string, amount: number) => systems.player?.healPlayer(playerId, amount),
    damagePlayer: (playerId: string, amount: number) => systems.player?.damagePlayer(playerId, amount),
    isPlayerAlive: (playerId: string) => systems.player?.isPlayerAlive(playerId),
    getPlayerHealth: (playerId: string) => {
      return systems.player?.getPlayerHealth(playerId) ?? { current: 100, max: 100 }
    },
    teleportPlayer: (playerId: string, position: Position3D) =>
      (systems.movementSystem as unknown as { teleportPlayer?: (id: string, pos: Position3D) => boolean | Promise<boolean> })?.teleportPlayer?.(playerId, position),

    // Combat API
    startCombat: (attackerId: string, targetId: string) => systems.combat?.startCombat(attackerId, targetId),
    stopCombat: (attackerId: string) => systems.combat?.forceEndCombat(attackerId),
    canAttack: (_attackerId: string, _targetId: string) => true, // Combat system doesn't have canAttack method
    isInCombat: (entityId: string) => systems.combat?.isInCombat(entityId),

    // Inventory API
    getInventory: (playerId: string) => {
      const inventory = systems.inventory?.getInventory(playerId)
      if (!inventory) return []
      return inventory.items.map(item => ({
        itemId: item.itemId,
        quantity: item.quantity,
        slot: item.slot,
        name: item.item?.name || item.itemId,
        stackable: item.item?.stackable || false,
      }))
    },
    getEquipment: (playerId: string) => {
      const equipment = systems.equipment?.getEquipmentData(playerId)
      if (!equipment) return {}
      // Convert equipment data to expected format
      const result: Record<string, { itemId: string; [key: string]: unknown }> = {}
      for (const [slot, item] of Object.entries(equipment)) {
        if (item && typeof item === 'object') {
          const itemObj = item as { id: unknown; name?: unknown; count?: unknown }
          result[slot] = {
            itemId: String(itemObj.id),
            name: itemObj.name as string | undefined,
            count: (itemObj.count as number) || 1,
          }
        }
      }
      return result
    },
    hasItem: (playerId: string, itemId: string | number, quantity?: number) =>
      systems.inventory?.hasItem(playerId, String(itemId), quantity),
    getArrowCount: (playerId: string) => {
      const inventory = systems.inventory?.getInventory(playerId)
      if (!inventory) return 0
      const arrows = inventory.items.find(
        (item: InventorySlotItem) => item.itemId === 'bronze_arrows' || item.itemId === 'arrows'
      )
      return arrows?.quantity || 0
    },
    canAddItem: (playerId: string, _item: Item | InventorySlotItem) => {
      const inventory = systems.inventory?.getInventory(playerId)
      return inventory ? inventory.items.length < 28 : false // Default inventory capacity
    },

    getSkills: (playerId: string) => {
      // Get all skills for a player by getting the entity's stats component
      const entity = world.entities.get(playerId)
      if (!entity) return {}
      const stats = (entity as Entity).getComponent<Component>('stats') as Skills | null
      return stats || {}
    },
    getSkillLevel: (playerId: string, skill: string) => {
      const skillData = systems.skills?.getSkillData(playerId, skill as keyof Skills)
      return skillData?.level || 1
    },
    getSkillXP: (playerId: string, skill: string) => {
      const skillData = systems.skills?.getSkillData(playerId, skill as keyof Skills)
      return skillData?.xp || 0
    },
    getCombatLevel: (playerId: string) => {
      const entity = world.entities.get(playerId)
      if (!entity) return 1
      const stats = (entity as Entity).getComponent<Component>('stats') as StatsComponent | null
      if (!stats) return 1
      return systems.skills?.getCombatLevel(stats) ?? 1
    },
    getXPToNextLevel: (playerId: string, skill: string) => {
      const skillData = systems.skills?.getSkillData(playerId, skill as keyof Skills)
      if (!skillData) return 0
      return systems.skills?.getXPToNextLevel(skillData) ?? 0
    },

    // UI API (handled via events, no UISystem)
    getPlayerUIState: (_playerId: string) => null,
    forceUIRefresh: (playerId: string) => {
      world.emit(EventType.UI_UPDATE, { playerId, force: true })
    },
    sendUIMessage: (playerId: string, message: string, type?: 'info' | 'warning' | 'error') => {
      world.emit(EventType.UI_MESSAGE, { playerId, message, type: type || 'info' })
    },

    // Mob API
    getMob: (mobId: string) => systems.mob?.getMob(mobId),
    getAllMobs: () => systems.mob?.getAllMobs(),
    getMobsInArea: (center: Position3D, radius: number) => systems.mob?.getMobsInArea(center, radius),
    spawnMob: (type: string, position: Position3D) =>
      systems.mob && world.emit(EventType.MOB_SPAWN_REQUEST, { mobType: type, position }),

    // Banking API
    getBankData: (_playerId: string, _bankId: string) => null, // Banking system doesn't expose public methods
    getAllPlayerBanks: (_playerId: string) => [], // Banking system doesn't expose public methods
    getBankLocations: () => [], // Banking system doesn't expose public methods
    getItemCountInBank: (_playerId: string, _bankId: string, _itemId: number) => 0,
    getTotalItemCountInBanks: (_playerId: string, _itemId: number) => 0,

    // Store API
    getStore: (storeId: string) => systems.store?.getStore(storeId),
    getAllStores: () => systems.store?.getAllStores(),
    getStoreLocations: () => systems.store?.getStoreLocations(),
    getItemPrice: (_storeId: string, _itemId: number) => 0, // Store system doesn't expose this method
    isItemAvailable: (_storeId: string, _itemId: number, _quantity?: number) => false, // Store system doesn't expose this method

    // Resource API
    getResource: (resourceId: string) => systems.resource?.getResource(resourceId),
    getAllResources: () => systems.resource?.getAllResources(),
    getResourcesByType: (type: 'tree' | 'fishing_spot' | 'ore') => systems.resource?.getResourcesByType(type),
    getResourcesInArea: (_center: Position3D, _radius: number) => [], // Resource system doesn't expose this method
    isPlayerGathering: (_playerId: string) => false, // Resource system doesn't expose this method

    // Movement API (Physics-based in PlayerLocal)
    isPlayerMoving: (playerId: string) =>
      (systems.movementSystem as unknown as { isMoving?: (id: string) => boolean })?.isMoving?.(playerId),
    getPlayerStamina: (_playerId: string) => ({ current: 100, max: 100, regenerating: true }), // MovementSystem doesn't have stamina
    movePlayer: (playerId: string, targetPosition: Position3D) =>
      (systems.movementSystem as unknown as { movePlayer?: (id: string, pos: Position3D) => void })?.movePlayer?.(playerId, targetPosition),

    // Death API
    getDeathLocation: (playerId: string) => systems.death?.getDeathLocation(playerId),
    getAllDeathLocations: () => systems.death?.getAllDeathLocations(),
    isPlayerDead: (playerId: string) => systems.death?.isPlayerDead(playerId),
    getRemainingRespawnTime: (playerId: string) => systems.death?.getRemainingRespawnTime(playerId),
    getRemainingDespawnTime: (playerId: string) => systems.death?.getRemainingDespawnTime(playerId),
    forceRespawn: (playerId: string) => systems.death?.forceRespawn(playerId),

    // Terrain API (Terrain System)
    getHeightAtPosition: (_worldX: number, _worldZ: number) => 0, // Terrain system doesn't expose this method
    getBiomeAtPosition: (_worldX: number, _worldZ: number) => 'plains', // Terrain system doesn't expose this method
    getTerrainStats: () => ({}), // Terrain system doesn't expose this method
    getHeightAtWorldPosition: (_x: number, _z: number) => 0, // Terrain system doesn't expose this method

    // Dynamic World Content API (Full THREE.js Access)
    getSpawnedMobs: () => systems.mobSpawner?.getSpawnedMobs(),
    getMobCount: () => systems.mobSpawner?.getMobCount(),
    getMobsByType: (mobType: string) => systems.mobSpawner?.getMobsByType(mobType),
    getMobStats: () => systems.mobSpawner?.getMobStats(),
    getSpawnedItems: () => systems.itemSpawner?.getSpawnedItems(),
    getItemCount: () => systems.itemSpawner?.getItemCount(),
    getItemsByType: (itemType: string) => systems.itemSpawner?.getItemsByType(itemType),
    getShopItems: () => systems.itemSpawner?.getShopItems(),
    getChestItems: () => systems.itemSpawner?.getChestItems(),
    getItemStats: () => systems.itemSpawner?.getItemStats(),

    // Loot API
    spawnLoot: (_mobType: string, _position: Position3D, _killerId?: string) => null, // Loot system doesn't expose this method
    getLootTable: (_mobType: string) => [], // Loot system doesn't expose this method
    getDroppedItems: () => [], // Loot system doesn't expose this method

    // Equipment API
    getPlayerEquipment: (playerId: string) => systems.equipment?.getPlayerEquipment(playerId),
    getEquipmentData: (playerId: string) => systems.equipment?.getEquipmentData(playerId),
    getEquipmentStats: (playerId: string) => systems.equipment?.getEquipmentStats(playerId),
    isItemEquipped: (playerId: string, itemId: number) => systems.equipment?.isItemEquipped(playerId, itemId),
    canEquipItem: (playerId: string, itemId: number) => systems.equipment?.canEquipItem(playerId, itemId),
    consumeArrow: (playerId: string) => systems.equipment?.consumeArrow(playerId),

    // Item Drop API (via Loot System)
    dropItem: (item: Item, position: Position3D, droppedBy?: string) => {
      world.emit(EventType.ITEM_SPAWN, { 
        itemId: item.id, 
        quantity: item.quantity || 1,
        position,
        droppedBy
      })
    },
    getItemsInRange: (_position: Position3D, _range?: number) => [], // Not exposed by current systems
    getGroundItem: (_itemId: string) => null, // Not exposed by current systems
    getAllGroundItems: () => [], // Not exposed by current systems
    clearAllItems: () => {}, // Not exposed by current systems

    // Item Actions API
    // registerItemAction removed - ItemActionSystem not available

    // Inventory Interaction API (client only)
    isDragging: () => systems.inventoryInteraction?.getSystemInfo()?.isDragging || false,
    getDropTargetsCount: () => systems.inventoryInteraction?.getSystemInfo()?.dropTargetsCount || 0,

    // Processing API
    getActiveFires: () => systems.processing?.getActiveFires(),
    getPlayerFires: (playerId: string) => systems.processing?.getPlayerFires(playerId),
    isPlayerProcessing: (playerId: string) => systems.processing?.isPlayerProcessing(playerId),
    getFiresInRange: (position: Position3D, range?: number) =>
      systems.processing?.getFiresInRange(position, range || 5),

    // Attack Style API (now handled by PlayerSystem)
    getPlayerAttackStyle: (playerId: string) => systems.player?.getPlayerAttackStyle(playerId),
    getAllAttackStyles: () => systems.player?.getAllAttackStyles(),
    canPlayerChangeStyle: (playerId: string) => systems.player?.canPlayerChangeStyle(playerId),
    getRemainingStyleCooldown: (playerId: string) => systems.player?.getRemainingStyleCooldown(playerId),
    forceChangeAttackStyle: (playerId: string, styleId: string) =>
      systems.player?.forceChangeAttackStyle(playerId, styleId),
    getPlayerStyleHistory: (playerId: string) => systems.player?.getPlayerStyleHistory(playerId),
    getAttackStyleSystemInfo: () => systems.player?.getAttackStyleSystemInfo(),

    // App Manager API
    createApp: (_appType: string, _config: AppConfig) => null,
    destroyApp: (_appId: string) => {},
    getApp: (_appId: string) => null,
    getAllApps: () => [],
    getAppsByType: (_type: string) => [],
    getAppCount: () => 0,

    // Entity Manager API (Server-authoritative)
    spawnEntity: (config: EntityConfig) => systems.entityManager?.spawnEntity(config),
    destroyEntity: (entityId: string) => systems.entityManager?.destroyEntity(entityId),
    getEntity: (entityId: string) => systems.entityManager?.getEntity(entityId),
    getEntitiesByType: (type: string) => systems.entityManager?.getEntitiesByType(type),
    getEntitiesInRange: (center: Position3D, range: number, type?: string) =>
      systems.entityManager?.getEntitiesInRange(center, range, type),
    getAllEntities: () => [], // Entity manager doesn't expose this method
    getEntityCount: () => 0, // Entity manager doesn't expose this method
    getEntityDebugInfo: () => systems.entityManager?.getDebugInfo(),

    // Player Spawn API (handled by PlayerSystem)
    hasPlayerCompletedSpawn: (_playerId: string) => true, // Handled by PlayerSystem
    getPlayerSpawnData: (_playerId: string) => null, // Handled by PlayerSystem
    forceTriggerAggro: (_playerId: string) => {}, // Handled by AggroSystem
    getAllSpawnedPlayers: () => systems.player?.getAllPlayers() || [],

    // Interaction API (Client only)
    registerInteractable: (data: Record<string, unknown>) =>
      systems.interaction && world.emit(EventType.INTERACTION_REGISTER, data),
    unregisterInteractable: (appId: string) =>
      systems.interaction && world.emit(EventType.INTERACTION_UNREGISTER, { appId }),

    // Camera API (Core ClientCameraSystem)
    getCameraInfo: () => {
      const cameraSystem = world.getSystem('client-camera-system') as { getCameraInfo?: () => unknown } | undefined;
      return cameraSystem?.getCameraInfo?.();
    },
    setCameraTarget: (_target: THREE.Object3D | null) => {}, // setTarget is private
    setCameraEnabled: (_enabled: boolean) => undefined,
    resetCamera: () => {}, // resetCamera is private

    // UI Components API (Client only)
    updateHealthBar: (data: { health: number; maxHealth: number }) =>
      world.emit(EventType.UI_UPDATE, { component: 'health', data }),
    updateInventory: (data: Inventory) => world.emit(EventType.UI_UPDATE, { component: 'inventory', data }),
    addChatMessage: (message: string, type?: string) => world.emit(EventType.UI_MESSAGE, { 
      playerId: 'system', 
      message, 
      type: (type || 'info') as 'info' | 'warning' | 'error' | 'success' 
    }),

    // World Content API (Server only)
    getWorldAreas: () => [], // World content system doesn't expose getAllWorldAreas method

    // NPC API (Server only)
    getPlayerBankContents: (playerId: string) => systems.npc?.getPlayerBankContents(playerId),
    getStoreInventory: () => systems.npc?.getStoreInventory(),
    getTransactionHistory: (playerId?: string) => systems.npc?.getTransactionHistory(playerId),
    getNPCSystemInfo: () => systems.npc?.getSystemInfo(),

    // System references for advanced usage - convert to Record format
    rpgSystems: Object.entries(systems).reduce(
      (acc, [key, system]) => {
        if (system) {
          acc[key] = {
            name: key,
            ...system,
          }
        }
        return acc
      },
      {} as Record<string, { name: string; [key: string]: unknown }>
    ),

    // Action methods for apps to trigger
    actionMethods: {
      // Player actions
      updatePlayer: (playerId: string, data: Partial<PlayerRow>) => {
        systems.database?.savePlayer(playerId, data)
        world.emit(EventType.PLAYER_UPDATED, { playerId, data })
      },

      // Combat actions
      startAttack: (attackerId: string, targetId: string, attackStyle?: string) => {
        world.emit(EventType.COMBAT_START_ATTACK, { attackerId, targetId, attackStyle })
      },

      stopAttack: (attackerId: string) => {
        world.emit(EventType.COMBAT_STOP_ATTACK, { attackerId })
      },

      // XP actions
      grantXP: (playerId: string, skill: string, amount: number) => {
        world.emit(EventType.SKILLS_XP_GAINED, { playerId, skill, amount })
      },

      // Inventory actions
      giveItem: (playerId: string, item: Item | { itemId: string; quantity: number }) => {
        const inventoryItem = {
          id: `${playerId}_${'itemId' in item ? item.itemId : item.id}_${Date.now()}`,
          itemId: 'itemId' in item ? item.itemId : item.id,
          quantity: 'quantity' in item ? item.quantity : 1,
          slot: -1, // Let inventory system assign slot
          metadata: null
        }
        world.emit(EventType.INVENTORY_ITEM_ADDED, { playerId, item: inventoryItem })
      },

      equipItem: (playerId: string, itemId: number, slot: string) => {
        world.emit(EventType.EQUIPMENT_TRY_EQUIP, { playerId, itemId, slot })
      },

      unequipItem: (playerId: string, slot: string) => {
        world.emit(EventType.EQUIPMENT_UNEQUIP, { playerId, slot })
      },

      // Item pickup actions
      dropItemAtPosition: (item: Item, position: Position3D, _playerId?: string) => {
        // Emit ITEM_SPAWN directly instead of ITEM_DROP (which is for inventory operations)
        world.emit(EventType.ITEM_SPAWN, { 
          itemId: item.id, 
          quantity: item.quantity || 1,
          position 
        })
      },

      pickupItem: (playerId: string, itemId: string) => {
        world.emit(EventType.ITEM_PICKUP_REQUEST, { playerId, itemId })
      },

      // Item action triggers
      triggerItemAction: (playerId: string, actionId: string, _itemId: string, _slot?: number) => {
        world.emit(EventType.ITEM_ACTION_SELECTED, { playerId, actionId })
      },

      showItemContextMenu: (playerId: string, itemId: string, position: { x: number; y: number }, slot?: number) => {
        world.emit(EventType.ITEM_RIGHT_CLICK, { playerId, itemId, position, slot })
      },

      // Processing actions
      useItemOnItem: (
        playerId: string,
        primaryItemId: number,
        primarySlot: number,
        targetItemId: number,
        targetSlot: number
      ) => {
        world.emit(EventType.ITEM_USE_ON_ITEM, { playerId, primaryItemId, primarySlot, targetItemId, targetSlot })
      },

      useItemOnFire: (playerId: string, itemId: number, itemSlot: number, fireId: string) => {
        world.emit(EventType.ITEM_USE_ON_FIRE, { playerId, itemId, itemSlot, fireId })
      },

      startFiremaking: (playerId: string, logsSlot: number, tinderboxSlot: number) => {
        world.emit(EventType.PROCESSING_FIREMAKING_REQUEST, { playerId, logsSlot, tinderboxSlot })
      },

      startCooking: (playerId: string, fishSlot: number, fireId: string) => {
        world.emit(EventType.PROCESSING_COOKING_REQUEST, { playerId, fishSlot, fireId })
      },

      // Attack style actions
      changeAttackStyle: (playerId: string, newStyle: string) => {
        world.emit(EventType.COMBAT_ATTACK_STYLE_CHANGE, { playerId, newStyle })
      },

      getAttackStyleInfo: (playerId: string, callback: (info: { style: string; cooldown?: number }) => void) => {
        world.emit(EventType.UI_ATTACK_STYLE_GET, { playerId, callback })
      },

      // Player spawn actions
      respawnPlayerWithStarter: (playerId: string) => {
        world.emit(EventType.PLAYER_SPAWN_COMPLETE, { playerId })
      },

      forceAggroSpawn: (playerId: string) => {
        world.emit(EventType.AGGRO_FORCE_TRIGGER, { playerId })
      },

      // Mob actions
      spawnMobAtLocation: (type: string, position: Position3D) => {
        world.emit(EventType.MOB_SPAWN_REQUEST, { mobType: type, position })
      },

      spawnGDDMob: (mobType: string, position: Position3D) => {
        world.emit(EventType.MOB_SPAWN_REQUEST, { mobType, position })
      },

      despawnMob: (mobId: string) => {
        world.emit(EventType.MOB_DESPAWN, mobId)
      },

      respawnAllMobs: () => {
        world.emit(EventType.MOB_RESPAWN_ALL)
      },

      // Item actions
      spawnItemAtLocation: (itemId: string, position: Position3D) => {
        world.emit(EventType.ITEM_SPAWN_REQUEST, { itemId, position })
      },

      spawnGDDItem: (itemId: string, position: Position3D, quantity?: number) => {
        world.emit(EventType.ITEM_SPAWN_REQUEST, { itemId, position, quantity })
      },

      despawnItem: (itemId: string) => {
        world.emit(EventType.ITEM_DESPAWN, itemId)
      },

      respawnShopItems: () => {
        world.emit(EventType.ITEM_RESPAWN_SHOPS)
      },

      spawnLootItems: (position: Position3D, lootTable: string[]) => {
        world.emit(EventType.ITEM_SPAWN_LOOT, { position, lootTable })
      },

      // Banking actions
      openBank: (playerId: string, bankId: string, position: Position3D) => {
        world.emit(EventType.BANK_OPEN, { playerId, bankId, position })
      },

      closeBank: (playerId: string, bankId: string) => {
        world.emit(EventType.BANK_CLOSE, { playerId, bankId })
      },

      depositItem: (playerId: string, bankId: string, itemId: string, quantity: number) => {
        world.emit(EventType.BANK_DEPOSIT, { playerId, bankId, itemId, quantity })
      },

      withdrawItem: (playerId: string, bankId: string, itemId: string, quantity: number) => {
        world.emit(EventType.BANK_WITHDRAW, { playerId, bankId, itemId, quantity })
      },

      // Store actions
      openStore: (playerId: string, storeId: string, playerPosition: Position3D) => {
        world.emit(EventType.STORE_OPEN, { playerId, storeId, playerPosition })
      },

      buyItem: (playerId: string, storeId: string, itemId: number, quantity: number) => {
        world.emit(EventType.STORE_BUY, { playerId, storeId, itemId, quantity })
      },

      // Resource actions
      startGathering: (playerId: string, resourceId: string, playerPosition: Position3D) => {
        world.emit(EventType.RESOURCE_GATHER, { playerId, resourceId, playerPosition })
      },

      stopGathering: (playerId: string) => {
        world.emit(EventType.RESOURCE_GATHERING_STOPPED, { playerId })
      },

      // Movement actions (Physics-based in PlayerLocal)
      clickToMove: (
        playerId: string,
        targetPosition: Position3D,
        _currentPosition: Position3D,
        _isRunning?: boolean
      ) => {
        (systems.movementSystem as unknown as { movePlayer?: (id: string, pos: Position3D) => void })?.movePlayer?.(
          playerId,
          targetPosition
        )
      },

      stopMovement: (playerId: string) => {
        world.emit(EventType.MOVEMENT_STOP, { playerId })
      },

      toggleRunning: (playerId: string, isRunning: boolean) => {
        world.emit(EventType.MOVEMENT_TOGGLE_RUN, { playerId, isRunning })
      },

      // Combat click-to-attack action
      clickToAttack: (attackerId: string, targetId: string) => {
        world.emit(EventType.COMBAT_START_ATTACK, { attackerId, targetId })
      },

      // Terrain actions
      configureTerrain: (config: TerrainConfig) => {
        world.emit(EventType.TERRAIN_CONFIGURE, config)
      },

      generateTerrain: (centerX: number, centerZ: number, radius: number) => {
        world.emit(EventType.TERRAIN_GENERATE_INITIAL, { centerX, centerZ, radius })
      },

      spawnResource: (type: string, subType: string, position: Position3D, requestedBy: string) => {
        world.emit(EventType.TERRAIN_SPAWN_RESOURCE, { type, subType, position, requestedBy })
      },

      // World Content actions
      loadWorldArea: (areaId: string) => {
        world.emit(EventType.WORLD_LOAD_AREA, { areaId })
      },

      unloadWorldArea: (areaId: string) => {
        world.emit(EventType.WORLD_UNLOAD_AREA, { areaId })
      },

      // NPC actions
      interactWithNPC: (playerId: string, npcId: string) => {
        world.emit(EventType.NPC_INTERACTION, { playerId, npcId })
      },

      bankDeposit: (playerId: string, itemId: string, quantity: number) => {
        world.emit(EventType.BANK_DEPOSIT, { playerId, itemId, quantity })
      },

      bankWithdraw: (playerId: string, itemId: string, quantity: number) => {
        world.emit(EventType.BANK_WITHDRAW, { playerId, itemId, quantity })
      },

      storeBuy: (playerId: string, itemId: string, quantity: number) => {
        world.emit(EventType.STORE_BUY, { playerId, itemId, quantity })
      },

      storeSell: (playerId: string, itemId: string, quantity: number) => {
        world.emit(EventType.STORE_SELL, { playerId, itemId, quantity })
      },

      // Mob AI actions
      attackMob: (playerId: string, mobId: string, damage: number) => {
        world.emit(EventType.MOB_DAMAGED, { mobId, damage, attackerId: playerId })
      },

      killMob: (mobId: string, killerId: string) => {
        world.emit(EventType.MOB_DIED, { mobId, killerId })
      },

      // App management actions
      createPlayerApp: (playerId: string, config: AppConfig) => {
        world.emit(EventType.PLAYER_CREATE, { playerId, config })
      },

      createMobApp: (mobId: string, mobType: string, config: AppConfig) => {
        world.emit(EventType.MOB_SPAWN_REQUEST, { mobId, mobType, config })
      },

      destroyPlayerApp: (playerId: string) => {
        world.emit(EventType.PLAYER_DESTROY, { playerId })
      },

      destroyMobApp: (mobId: string) => {
        world.emit(EventType.MOB_DESTROY, { mobId })
      },

      // Entity management actions (Server-authoritative)
      spawnEntityAtLocation: (type: string, config: EntityConfig) => {
        world.emit(EventType.ENTITY_SPAWNED, { type, config })
      },

      spawnItemEntity: (itemId: string, position: Position3D, quantity?: number) => {
        world.emit(EventType.ITEM_SPAWN, { itemId, position, quantity })
      },

      spawnMobEntity: (mobType: string, position: Position3D, _level?: number) => {
        world.emit(EventType.MOB_SPAWN_REQUEST, { mobType, position })
      },

      destroyEntityById: (entityId: string) => {
        world.emit(EventType.ENTITY_DEATH, { entityId })
      },

      interactWithEntity: (playerId: string, entityId: string, interactionType: string) => {
        world.emit(EventType.ENTITY_INTERACT_REQUEST, {
          playerId,
          entityId,
          interactionType,
          playerPosition: world.getPlayer?.(playerId)?.position,
        })
      },

      // Test helper functions for gameplay testing framework
      spawnTestPlayer: (x: number, z: number, color = '#FF0000') => {
        // Only work on client side where THREE.js scene is available
        if (world.isServer) {
          return null
        }

        const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6)
        const material = new THREE.MeshBasicMaterial({ color })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.name = `TestPlayer_${Date.now()}`
        mesh.position.set(x, 0.9, z)
        mesh.userData = {
          type: 'player',
          health: 100,
          maxHealth: 100,
          level: 1,
          inventory: [],
          equipment: {},
        }
        world.stage.scene.add(mesh)
        return mesh
      },

      spawnTestGoblin: (x: number, z: number, color = '#00FF00') => {
        // Only work on client side where THREE.js scene is available
        if (world.isServer) {
          return null
        }

        const geometry = new THREE.BoxGeometry(0.8, 1.6, 0.8)
        const material = new THREE.MeshBasicMaterial({ color })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.name = `TestGoblin_${Date.now()}`
        mesh.position.set(x, 0.8, z)
        mesh.userData = {
          type: 'mob',
          mobType: 'goblin',
          health: 50,
          maxHealth: 50,
          level: 1,
        }
        world.stage.scene.add(mesh)
        return mesh
      },

      spawnTestItem: (x: number, z: number, itemType = 'bronze_sword', color = '#0000FF') => {
        // Only work on client side where THREE.js scene is available
        if (world.isServer) {
          return null
        }

        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5)
        const material = new THREE.MeshBasicMaterial({ color })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.name = `TestItem_${itemType}_${Date.now()}`
        mesh.position.set(x, 0.25, z)
        mesh.userData = {
          type: 'item',
          itemType: itemType,
          quantity: 1,
        }
        world.stage.scene.add(mesh)
        return mesh
      },

      simulateCombat: (attacker: THREE.Object3D, target: THREE.Object3D) => {
        if (!attacker || !target) {
          throw new Error('Invalid attacker or target')
        }

        const damage = Math.floor(Math.random() * 10) + 5

        const targetEntity = target as THREE.Object3D & { userData: { health: number } }

        targetEntity.userData.health -= damage

        if (targetEntity.userData.health <= 0) {
          // Target dies - remove from scene
          world.stage.scene.remove(target)
          return { killed: true, damage: damage }
        }

        return { killed: false, damage: damage }
      },
    },
  }

  // Attach all RPG API methods directly to the world object
  Object.assign(world, rpgAPI)
}
