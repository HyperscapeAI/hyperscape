/**
 * RPG System Loader
 * Entry point for Hyperscape to dynamically load all RPG systems
 */
import { Component, ComponentConstructor } from '../../core/components'
import { registerComponent } from '../../core/components/index'
import { Entity } from '../../core/entities/Entity'
import * as THREE from '../../core/extras/three'
import { getSystem } from '../../core/utils/SystemUtils'
import type { World } from '../../core/World'
import { EventType } from '../../types/events'
import { CombatComponent } from '../components/CombatComponent'
import { DataComponent } from '../components/DataComponent'
import { InteractionComponent } from '../components/InteractionComponent'
import { UsageComponent } from '../components/UsageComponent'
import { VisualComponent } from '../components/VisualComponent'
import { dataManager } from '../data/DataManager'
import type {
  Inventory,
  ItemAction,
  PlayerSkills,
  Position3D,
  RPGInventorySlotItem,
  RPGItem,
  StatsComponent
} from '../types/core'
import type { RPGPlayerRow } from '../types/database'
import type { RPGEntityConfig } from '../types/entities'


// Import systems
import { RPGBankingSystem } from './RPGBankingSystem'
import { RPGCombatSystem } from './RPGCombatSystem'
// RPGDatabaseSystem will be imported dynamically on server only
import type { RPGDatabaseSystem } from './RPGDatabaseSystem'
import { RPGInventorySystem } from './RPGInventorySystem'
import { RPGMobSystem } from './RPGMobSystem'
import { RPGPlayerSystem } from './RPGPlayerSystem'
import { RPGResourceSystem } from './RPGResourceSystem'
import { RPGStoreSystem } from './RPGStoreSystem'
// Movement and camera now handled by core systems (ClientMovementSystem and ClientCameraSystem)
import { RPGPathfindingSystem } from './RPGPathfindingSystem'
import { RPGPersistenceSystem } from './RPGPersistenceSystem'
import { RPGWorldGenerationSystem } from './RPGWorldGenerationSystem'
// UNIFIED TERRAIN SYSTEMS - USING PROCEDURAL TERRAIN
// DYNAMIC WORLD CONTENT SYSTEMS - FULL THREE.JS ACCESS
// import { DefaultWorldSystem } from './DefaultWorldSystem'
import { ItemSpawnerSystem } from './ItemSpawnerSystem'
import { MobSpawnerSystem } from './MobSpawnerSystem'
import { TestPhysicsCube } from './TestPhysicsCube'
import { TestUISystem } from './TestUISystem'
// RPGClientInteractionSystem removed - functionality merged into RPGInteractionSystem
import { EntityCullingSystem } from '../../core/systems/EntityCullingSystem'
import { RPGAggroSystem } from './RPGAggroSystem'
import { RPGAttackStyleSystem } from './RPGAttackStyleSystem'
import { RPGDeathSystem } from './RPGDeathSystem'
import { RPGEntityManager } from './RPGEntityManager'
import { RPGEquipmentSystem } from './RPGEquipmentSystem'
import { RPGInventoryInteractionSystem } from './RPGInventoryInteractionSystem'
import { RPGItemActionSystem } from './RPGItemActionSystem'
import { RPGItemPickupSystem } from './RPGItemPickupSystem'
import { RPGPlayerSpawnSystem } from './RPGPlayerSpawnSystem'
import { RPGProcessingSystem } from './RPGProcessingSystem'

// New MMORPG-style Systems
import { RPGInteractionSystem } from './RPGInteractionSystem'
import { RPGLootSystem } from './RPGLootSystem'
import { RPGMovementSystem } from './RPGMovementSystem'
// RPGCameraSystem moved to core ClientCameraSystem
// Removed RPGUIComponents - replaced with React components

// World Content Systems
import { RPGMobAISystem } from './RPGMobAISystem'
import { RPGNPCSystem } from './RPGNPCSystem'
import { RPGWorldContentSystem } from './RPGWorldContentSystem'

// TEST SYSTEMS - Visual Testing Framework
import { RPGAggroTestSystem } from './RPGAggroTestSystem'
import { RPGBankingTestSystem } from './RPGBankingTestSystem'
import { RPGEquipmentTestSystem } from './RPGEquipmentTestSystem'
import { RPGInventoryTestSystem } from './RPGInventoryTestSystem'
import { RPGMovementTestSystem } from './RPGMovementTestSystem'
import { RPGPhysicsTestSystem } from './RPGPhysicsTestSystem'
import { RPGResourceGatheringTestSystem } from './RPGResourceGatheringTestSystem'
import { RPGStoreTestSystem } from './RPGStoreTestSystem'
import { RPGTestRunner } from './RPGTestRunner'
import { RPGVisualTestSystem } from './RPGVisualTestSystem'

// NEW COMPREHENSIVE TEST SYSTEMS
import { RPGCookingTestSystem } from './RPGCookingTestSystem'
import { RPGCorpseTestSystem } from './RPGCorpseTestSystem'
import { RPGDatabaseTestSystem } from './RPGDatabaseTestSystem'
import { RPGDeathTestSystem } from './RPGDeathTestSystem'
import { RPGFiremakingTestSystem } from './RPGFiremakingTestSystem'
import { RPGFishingTestSystem } from './RPGFishingTestSystem'
import { RPGItemActionTestSystem } from './RPGItemActionTestSystem'
import { RPGPersistenceTestSystem } from './RPGPersistenceTestSystem'
import { RPGPlayerTestSystem } from './RPGPlayerTestSystem'
import { RPGSkillsTestSystem } from './RPGSkillsTestSystem'
import { RPGSystemValidationTestSystem } from './RPGSystemValidationTestSystem'
import { RPGUITestSystem } from './RPGUITestSystem'
import { RPGWoodcuttingTestSystem } from './RPGWoodcuttingTestSystem'

// PHYSICS INTEGRATION TEST SYSTEMS
import { RPGPhysicsIntegrationTestSystem } from './RPGPhysicsIntegrationTestSystem'
import { RPGPrecisionPhysicsTestSystem } from './RPGPrecisionPhysicsTestSystem'
import { RPGTerrainNaNTestSystem } from './RPGTerrainNaNTestSystem'

// PERFORMANCE MONITORING
import { RPGPerformanceMonitor } from './RPGPerformanceMonitor'

import { RPGCameraSystem } from '..'
import { ActionRegistry } from '../../core/ActionRegistry'
import { RPGActionRegistry } from './RPGActionRegistry'
import { RPGCombatTestSystem } from './RPGCombatTestSystem'
import { RPGLootDropTestSystem } from './RPGLootDropTestSystem'
import { RPGSkillsSystem } from './RPGSkillsSystem'
import { RPGUISystem } from './RPGUISystem'

// Interface for app configuration
interface AppConfig {
  [key: string]: unknown
}

// Interface for terrain configuration
interface TerrainConfig {
  [key: string]: unknown
}

// Interface for the RPG systems collection
export interface RPGSystems {
  actionRegistry?: ActionRegistry
  database?: RPGDatabaseSystem
  player?: RPGPlayerSystem
  inventory?: RPGInventorySystem
  combat?: RPGCombatSystem
  skills?: RPGSkillsSystem
  banking?: RPGBankingSystem
  interaction?: RPGInteractionSystem
  mob?: RPGMobSystem
  ui?: RPGUISystem
  store?: RPGStoreSystem
  resource?: RPGResourceSystem
  pathfinding?: RPGPathfindingSystem
  worldGeneration?: RPGWorldGenerationSystem
  aggro?: RPGAggroSystem
  equipment?: RPGEquipmentSystem
  itemPickup?: RPGItemPickupSystem
  itemActions?: RPGItemActionSystem
  playerSpawn?: RPGPlayerSpawnSystem
  processing?: RPGProcessingSystem
  attackStyle?: RPGAttackStyleSystem
  entityManager?: RPGEntityManager
  death?: RPGDeathSystem
  inventoryInteraction?: RPGInventoryInteractionSystem
  loot?: RPGLootSystem
  cameraSystem?: RPGCameraSystem
  movementSystem?: RPGMovementSystem
  worldContent?: RPGWorldContentSystem
  npc?: RPGNPCSystem
  mobAI?: RPGMobAISystem
  visualTest?: RPGVisualTestSystem
  testCombat?: RPGCombatTestSystem
  testAggro?: RPGAggroTestSystem
  testInventory?: RPGInventoryTestSystem
  testBanking?: RPGBankingTestSystem
  testStore?: RPGStoreTestSystem
  testResourceGathering?: RPGResourceGatheringTestSystem
  testEquipment?: RPGEquipmentTestSystem
  testMovement?: RPGMovementTestSystem
  testPhysics?: RPGPhysicsTestSystem
  testLootDrop?: RPGLootDropTestSystem
  testCorpse?: RPGCorpseTestSystem
  testItemAction?: RPGItemActionTestSystem
  testFishing?: RPGFishingTestSystem
  testCooking?: RPGCookingTestSystem
  testWoodcutting?: RPGWoodcuttingTestSystem
  testFiremaking?: RPGFiremakingTestSystem
  testDeath?: RPGDeathTestSystem
  testPersistence?: RPGPersistenceTestSystem
  testPhysicsIntegration?: RPGPhysicsIntegrationTestSystem
  testPrecisionPhysics?: RPGPrecisionPhysicsTestSystem
  testSkills?: RPGSkillsTestSystem
  testPlayer?: RPGPlayerTestSystem
  testDatabase?: RPGDatabaseTestSystem
  testRunner?: RPGTestRunner
  mobSpawner?: MobSpawnerSystem
  itemSpawner?: ItemSpawnerSystem
  testPhysicsCube?: TestPhysicsCube
  testUI?: RPGUITestSystem
  testTerrainNaN?: RPGTerrainNaNTestSystem
  worldVerification?: unknown
}

/**
 * Register all RPG systems with a Hyperscape world
 * This is the main entry point called by the bootstrap
 */
export async function registerRPGSystems(world: World): Promise<void> {
  const testsEnabled = process.env.NODE_ENV !== 'production';
  
  // Register RPG-specific components FIRST, before any systems
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
  const dataComponents = ['stats', 'inventory', 'equipment', 'movement', 'stamina']
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

  const systems: RPGSystems = {}

  // === FOUNDATIONAL SYSTEMS ===
  // These must be registered first as other systems depend on them

  // 1. Action Registry - Creates world.actionRegistry for action discovery
  world.register('rpg-action-registry', RPGActionRegistry)

  // 2. Entity Manager - Core entity management system
  world.register('rpg-entity-manager', RPGEntityManager)

  // 3. Database system - For persistence (server only)
  if (world.isServer) {
    // Dynamically import database system to avoid bundling it on client
    const { RPGDatabaseSystem } = await import('./RPGDatabaseSystem');
    world.register('rpg-database', RPGDatabaseSystem)
  }

  // 4. Persistence system - Core data management
  world.register('rpg-persistence', RPGPersistenceSystem)

  // === CORE ENTITY SYSTEMS ===
  // These systems manage the primary game entities

  // 5. Player system - Core player management (depends on database & persistence)
  world.register('rpg-player', RPGPlayerSystem)

  // 6. Mob system - Core mob management
  world.register('rpg-mob', RPGMobSystem)

  // 7. World generation - Terrain and world structure
  world.register('rpg-world-generation', RPGWorldGenerationSystem)

  // === INTERACTION SYSTEMS ===
  // These systems handle player-world interactions

  // 8. Combat system - Core combat mechanics (depends on player & mob systems)
  world.register('rpg-combat', RPGCombatSystem)

  // 9. Inventory system - Item management (depends on player system)
    world.register('rpg-inventory', RPGInventorySystem)

    // 11. Equipment system - Item equipping (depends on inventory system)
    world.register('rpg-equipment', RPGEquipmentSystem)

    // 12. XP system - Experience and leveling (depends on player system)
    world.register('rpg-skills', RPGSkillsSystem)

    // 12a. XP system alias for backward compatibility with test framework
    world.register('rpg-xp', RPGSkillsSystem)

    // === SPECIALIZED SYSTEMS ===
    // These systems provide specific game features

    // 13. Banking system - Item storage (depends on inventory system)
    world.register('rpg-banking', RPGBankingSystem)

    // 14. Store system - Item trading (depends on inventory system)
    world.register('rpg-store', RPGStoreSystem)

    // 15. Resource system - Gathering mechanics (depends on inventory system)
    world.register('rpg-resource', RPGResourceSystem)

    // 16. Item pickup system - Ground item management (depends on inventory system)
    world.register('rpg-item-pickup', RPGItemPickupSystem)

    // 17. Item actions system - Item usage mechanics (depends on inventory system)
    world.register('rpg-item-actions', RPGItemActionSystem)

    // 18. Processing system - Crafting and item processing (depends on inventory system)
    world.register('rpg-processing', RPGProcessingSystem)

    // === GAMEPLAY SYSTEMS ===
    // These systems provide advanced gameplay mechanics

    // 19. Death system - Death and respawn mechanics (depends on player system)
    world.register('rpg-death', RPGDeathSystem)

    // 20. Attack style system - Combat style management (depends on combat system)
    world.register('rpg-attack-style', RPGAttackStyleSystem)

    // 21. Aggro system - AI aggression management (depends on mob & combat systems)
    world.register('rpg-aggro', RPGAggroSystem)

    // 22. Pathfinding system - AI movement (depends on mob system)
    world.register('rpg-pathfinding', RPGPathfindingSystem)

    // 23. Player spawn system - Player spawning logic (depends on player & world systems)
    world.register('rpg-player-spawn', RPGPlayerSpawnSystem)

    // 24. Movement system - Player movement and click-to-move (depends on player system)
    // Note: Previously moved to core ClientMovementSystem, but we need RPG-specific movement
    world.register('rpg-movement', RPGMovementSystem)

    // Performance optimization systems
    world.register('entity-culling', EntityCullingSystem)

    // Client-only interaction systems
    if (world.isClient) {
      world.register('rpg-inventory-interaction', RPGInventoryInteractionSystem)
    }

    // New MMORPG-style Systems
    world.register('rpg-loot', RPGLootSystem)
    if (world.isClient) {
      world.register('rpg-interaction', RPGInteractionSystem)
      // RPGCameraSystem moved to core ClientCameraSystem
      // Removed RPGUIComponents - replaced with React components
    }

    // World Content Systems (server only for world management)
    if (world.isServer) {
      world.register('rpg-world-content', RPGWorldContentSystem)
      world.register('rpg-npc', RPGNPCSystem)
      world.register('rpg-mob-ai', RPGMobAISystem)
    }

    // VISUAL TEST SYSTEMS - Register for comprehensive testing (only when tests enabled)
    if (testsEnabled) {
      world.register('rpg-visual-test', RPGVisualTestSystem)
      world.register('rpg-performance-monitor', RPGPerformanceMonitor)
    }

    // Server-only systems
    if (world.isServer) {
      // Core validation test (only when tests enabled)
      if (testsEnabled) {
        world.register('rpg-system-validation-test', RPGSystemValidationTestSystem)
        
        // Register all test systems on server - PhysX is now supported
        world.register('rpg-database-test', RPGDatabaseTestSystem)
        world.register('rpg-terrain-nan-test', RPGTerrainNaNTestSystem)
      }
    }

    // UNIFIED TERRAIN SYSTEMS - USING PROCEDURAL TERRAIN
    // Note: Client terrain is registered in createClientWorld.ts as 'rpg-client-terrain'
    // Terrain system now unified and registered in createClientWorld/createServerWorld

    // DYNAMIC WORLD CONTENT SYSTEMS - FULL THREE.JS ACCESS, NO SANDBOX
    // world.register('default-world', DefaultWorldSystem)
    world.register('mob-spawner', MobSpawnerSystem)
    world.register('item-spawner', ItemSpawnerSystem)
    world.register('test-physics-cube', TestPhysicsCube)

    // Only register client-only systems on client side (they need DOM/canvas/browser APIs)
    const isClientEnvironment = world.isClient

    if (isClientEnvironment) {
      // Removed console.log('[RPGSystemLoader] Registering client-only systems')
      world.register('test-ui', TestUISystem)
      // RPGClientInteractionSystem removed - functionality merged into RPGInteractionSystem

      // Physics test systems - now supported on both client and server
      if (testsEnabled) {
        // Visual test systems that use PhysX
        world.register('rpg-test-combat', RPGCombatTestSystem)
        world.register('rpg-test-aggro', RPGAggroTestSystem)
        world.register('rpg-test-inventory', RPGInventoryTestSystem)
        world.register('rpg-test-banking', RPGBankingTestSystem)
        world.register('rpg-test-store', RPGStoreTestSystem)
        world.register('rpg-test-resource-gathering', RPGResourceGatheringTestSystem)
        world.register('rpg-test-equipment', RPGEquipmentTestSystem)
        world.register('rpg-test-movement', RPGMovementTestSystem)
        world.register('rpg-test-physics', RPGPhysicsTestSystem)

        // New comprehensive test systems
        world.register('rpg-loot-drop-test', RPGLootDropTestSystem)
        world.register('rpg-corpse-test', RPGCorpseTestSystem)
        world.register('rpg-item-action-test', RPGItemActionTestSystem)

        // All comprehensive test systems with 100% coverage
        world.register('rpg-fishing-test', RPGFishingTestSystem)
        world.register('rpg-cooking-test', RPGCookingTestSystem)
        world.register('rpg-woodcutting-test', RPGWoodcuttingTestSystem)
        world.register('rpg-firemaking-test', RPGFiremakingTestSystem)
        world.register('rpg-death-test', RPGDeathTestSystem)
        world.register('rpg-persistence-test', RPGPersistenceTestSystem)
        world.register('rpg-skills-test', RPGSkillsTestSystem)
        world.register('rpg-player-test', RPGPlayerTestSystem)
        
        // Physics integration tests
        world.register('rpg-physics-integration-test', RPGPhysicsIntegrationTestSystem)
        world.register('rpg-precision-physics-test', RPGPrecisionPhysicsTestSystem)
        world.register('rpg-test-runner', RPGTestRunner)
        world.register('rpg-ui-test', RPGUITestSystem)
      }
    } else {
      // Removed console.log('[RPGSystemLoader] Server mode - skipping client-only systems')
    }

    // Get system instances after world initialization
    // Systems are directly available as properties on the world object after registration
    // Database system is only available on server
    if (world.isServer) {
      systems.database = getSystem(world, 'rpg-database') as RPGDatabaseSystem
    }
    systems.player = getSystem(world, 'rpg-player') as RPGPlayerSystem
    systems.combat = getSystem(world, 'rpg-combat') as RPGCombatSystem
    systems.inventory = getSystem(world, 'rpg-inventory') as RPGInventorySystem
    systems.skills = getSystem(world, 'rpg-skills') as RPGSkillsSystem
    systems.mob = getSystem(world, 'rpg-mob') as RPGMobSystem
    systems.ui = getSystem(world, 'rpg-ui') as RPGUISystem
    systems.banking = getSystem(world, 'rpg-banking') as RPGBankingSystem
    systems.store = getSystem(world, 'rpg-store') as RPGStoreSystem
    systems.resource = getSystem(world, 'rpg-resource') as RPGResourceSystem
    // Movement now handled by core ClientMovementSystem
    systems.pathfinding = getSystem(world, 'rpg-pathfinding') as RPGPathfindingSystem
    systems.worldGeneration = getSystem(world, 'rpg-world-generation') as RPGWorldGenerationSystem
    systems.aggro = getSystem(world, 'rpg-aggro') as RPGAggroSystem
    systems.equipment = getSystem(world, 'rpg-equipment') as RPGEquipmentSystem
    systems.itemPickup = getSystem(world, 'rpg-item-pickup') as RPGItemPickupSystem
    systems.itemActions = getSystem(world, 'rpg-item-actions') as RPGItemActionSystem
    systems.playerSpawn = getSystem(world, 'rpg-player-spawn') as RPGPlayerSpawnSystem
    systems.processing = getSystem(world, 'rpg-processing') as RPGProcessingSystem
    systems.attackStyle = getSystem(world, 'rpg-attack-style') as RPGAttackStyleSystem
    systems.entityManager = getSystem(world, 'rpg-entity-manager') as RPGEntityManager
    systems.death = getSystem(world, 'rpg-death') as RPGDeathSystem

    // Client-only systems
    if (world.isClient) {
      systems.inventoryInteraction = getSystem(world, 'rpg-inventory-interaction') as unknown as RPGInventoryInteractionSystem
    }

    // New MMORPG-style Systems
    systems.loot = getSystem(world, 'rpg-loot') as RPGLootSystem
    if (world.isClient) {
      systems.interaction = getSystem(world, 'rpg-interaction') as RPGInteractionSystem
      // Camera and movement now handled by core systems (client-camera-system, client-movement-system)
      systems.cameraSystem = getSystem(world, 'client-camera-system') as RPGCameraSystem
      systems.movementSystem = getSystem(world, 'client-movement-system') as RPGMovementSystem
      // Removed uiComponents - replaced with React components
    }

    // World Content Systems
    if (world.isServer) {
      systems.worldContent = getSystem(world, 'rpg-world-content') as RPGWorldContentSystem
      systems.npc = getSystem(world, 'rpg-npc') as RPGNPCSystem
      systems.mobAI = getSystem(world, 'rpg-mob-ai') as RPGMobAISystem
    }

    // VISUAL TEST SYSTEMS - Get instances
    systems.visualTest = getSystem(world, 'rpg-visual-test') as RPGVisualTestSystem

    // Server-only test system instances
    if (world.isServer && testsEnabled) {
      systems.testDatabase = getSystem(world, 'rpg-database-test') as RPGDatabaseTestSystem
      systems.testTerrainNaN = getSystem(world, 'rpg-terrain-nan-test') as RPGTerrainNaNTestSystem
    }
    
    // Client-only test system instances (they require PhysX)
    if (world.isClient && testsEnabled) {
      systems.testCombat = getSystem(world, 'rpg-test-combat') as RPGCombatTestSystem
      systems.testAggro = getSystem(world, 'rpg-test-aggro') as RPGAggroTestSystem
      systems.testInventory = getSystem(world, 'rpg-test-inventory') as RPGInventoryTestSystem
      systems.testBanking = getSystem(world, 'rpg-test-banking') as RPGBankingTestSystem
      systems.testStore = getSystem(world, 'rpg-test-store') as RPGStoreTestSystem
      systems.testResourceGathering = getSystem(world, 'rpg-test-resource-gathering') as RPGResourceGatheringTestSystem
      systems.testEquipment = getSystem(world, 'rpg-test-equipment') as RPGEquipmentTestSystem
      systems.testMovement = getSystem(world, 'rpg-test-movement') as RPGMovementTestSystem
      systems.testPhysics = getSystem(world, 'rpg-test-physics') as RPGPhysicsTestSystem

      // New comprehensive test systems
      systems.testLootDrop = getSystem(world, 'rpg-loot-drop-test') as RPGLootDropTestSystem
      systems.testCorpse = getSystem(world, 'rpg-corpse-test') as RPGCorpseTestSystem
      systems.testItemAction = getSystem(world, 'rpg-item-action-test') as RPGItemActionTestSystem
      systems.testFishing = getSystem(world, 'rpg-fishing-test') as RPGFishingTestSystem
      systems.testCooking = getSystem(world, 'rpg-cooking-test') as RPGCookingTestSystem
      systems.testWoodcutting = getSystem(world, 'rpg-woodcutting-test') as RPGWoodcuttingTestSystem
      systems.testFiremaking = getSystem(world, 'rpg-firemaking-test') as RPGFiremakingTestSystem
      systems.testDeath = getSystem(world, 'rpg-death-test') as RPGDeathTestSystem
      systems.testPersistence = getSystem(world, 'rpg-persistence-test') as RPGPersistenceTestSystem
      systems.testSkills = getSystem(world, 'rpg-skills-test') as RPGSkillsTestSystem
      systems.testPlayer = getSystem(world, 'rpg-player-test') as RPGPlayerTestSystem
    }

    // DYNAMIC WORLD CONTENT SYSTEMS
    // World verification system removed
    systems.mobSpawner = getSystem(world, 'mob-spawner') as MobSpawnerSystem
    systems.itemSpawner = getSystem(world, 'item-spawner') as ItemSpawnerSystem
    systems.testPhysicsCube = getSystem(world, 'test-physics-cube') as TestPhysicsCube
    systems.testUI = getSystem(world, 'test-ui') as RPGUITestSystem // Will be undefined on server, which is fine
    // RPGClientInteractionSystem removed - functionality merged into RPGInteractionSystem

    // Get test system instances with proper casting
    if (
      world.isClient &&
      (testsEnabled)
    ) {
      systems.testPhysicsIntegration = getSystem(
        world,
        'rpg-physics-integration-test'
      ) as RPGPhysicsIntegrationTestSystem
      systems.testPrecisionPhysics = getSystem(world, 'rpg-precision-physics-test') as RPGPrecisionPhysicsTestSystem
      systems.testRunner = getSystem(world, 'rpg-test-runner') as RPGTestRunner
    }

  // Set up API for apps to access RPG functionality
  setupRPGAPI(world, systems)
}

/**
 * Set up global RPG API for apps to use
 */
function setupRPGAPI(world: World, systems: RPGSystems): void {
  // Set up comprehensive RPG API for apps
  const rpgAPI = {
    // Actions - convert to Record format expected by World interface
    actions: (() => {
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
    getPlayerData: (playerId: string) => systems.database?.getPlayerData(playerId),
    savePlayerData: (playerId: string, data: Partial<RPGPlayerRow>) => systems.database?.savePlayerData(playerId, data),

    // Player API
    getPlayer: (playerId: string) => {
      const player = systems.player?.getPlayer(playerId)
      if (!player) return { id: playerId }
      return {
        ...player,
        id: playerId, // Override id to ensure it's always the playerId
      }
    },
    getAllPlayers: () => systems.player?.getAllPlayers(),
    healPlayer: (playerId: string, amount: number) => systems.player?.healPlayer(playerId, amount),
    damagePlayer: (playerId: string, amount: number) => systems.player?.damagePlayer(playerId, amount),
    isPlayerAlive: (playerId: string) => systems.player?.isPlayerAlive(playerId),
    getPlayerHealth: (playerId: string) => {
      const health = systems.player?.getPlayerHealth(playerId)
      if (!health) return { current: 100, max: 100 } // Default health
      return { current: health.health, max: health.maxHealth }
    },
    teleportPlayer: (playerId: string, position: Position3D) =>
      systems.movementSystem?.teleportPlayer(playerId, position),

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
        (item: RPGInventorySlotItem) => item.itemId === 'bronze_arrows' || item.itemId === 'arrows'
      )
      return arrows?.quantity || 0
    },
    canAddItem: (playerId: string, _item: RPGItem | RPGInventorySlotItem) => {
      const inventory = systems.inventory?.getInventory(playerId)
      return inventory ? inventory.items.length < 28 : false // Default inventory capacity
    },

    getSkills: (playerId: string) => {
      // Get all skills for a player by getting the entity's stats component
      const entity = world.entities.get(playerId)
      if (!entity) return {}
      const stats = (entity as Entity).getComponent<Component>('stats') as PlayerSkills | null
      return stats || {}
    },
    getSkillLevel: (playerId: string, skill: string) => {
      const skillData = systems.skills?.getRPGSkillData(playerId, skill as keyof PlayerSkills)
      return skillData?.level || 1
    },
    getSkillXP: (playerId: string, skill: string) => {
      const skillData = systems.skills?.getRPGSkillData(playerId, skill as keyof PlayerSkills)
      return skillData?.xp || 0
    },
    getCombatLevel: (playerId: string) => {
      const entity = world.entities.get(playerId)
      if (!entity) return 1
      const stats = (entity as Entity).getComponent<Component>('stats') as StatsComponent | null
      if (!stats) return 1
      return (
        systems.skills?.getCombatLevel(
          stats as PlayerSkills & {
            hitpoints?: { level: number; xp: number; current: number; max: number }
            combatLevel?: number
          }
        ) ?? 1
      )
    },
    getXPToNextLevel: (playerId: string, skill: string) => {
      const skillData = systems.skills?.getRPGSkillData(playerId, skill as keyof PlayerSkills)
      if (!skillData) return 0
      return systems.skills?.getXPToNextLevel(skillData) ?? 0
    },

    // UI API
    getPlayerUIState: (playerId: string) => systems.ui?.getPlayerUIState(playerId),
    forceUIRefresh: (playerId: string) => systems.ui?.forceUIRefresh(playerId),
    sendUIMessage: (playerId: string, message: string, type?: 'info' | 'warning' | 'error') =>
      systems.ui?.sendUIMessage(playerId, message, type),

    // Mob API
    getMob: (mobId: string) => systems.mob?.getMob(mobId),
    getAllMobs: () => systems.mob?.getAllMobs(),
    getMobsInArea: (center: Position3D, radius: number) => systems.mob?.getMobsInArea(center, radius),
    spawnMob: (type: string, position: Position3D) =>
      systems.mob && world.emit(EventType.MOB_SPAWN_REQUEST, { type, position }),

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

    // Movement API (Core ClientMovementSystem)
    isPlayerMoving: (playerId: string) => systems.movementSystem?.isMoving(playerId),
    getPlayerStamina: (_playerId: string) => ({ current: 100, max: 100, regenerating: true }), // RPGMovementSystem doesn't have stamina
    movePlayer: (playerId: string, targetPosition: Position3D) =>
      systems.movementSystem?.movePlayer(playerId, targetPosition),

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
    getTestCubes: () => systems.testPhysicsCube?.getTestCubes(),
    getCubeCount: () => systems.testPhysicsCube?.getCubeCount(),
    spawnRandomCube: () => systems.testPhysicsCube?.spawnRandomCube(),
    testCubeInteraction: () => systems.testPhysicsCube?.testCubeInteraction(),
    getUIElements: () => new Map(), // TestUI system doesn't expose this method
    getUICount: () => 0, // TestUI system doesn't expose this method
    createRandomUI: () => null, // TestUI system doesn't expose this method

    // Visual Test Systems API
    getTestCombatResults: () => null, // Test systems don't expose getTestResults method
    getTestAggroResults: () => null, // Test systems don't expose getTestResults method
    getTestInventoryResults: () => null, // Test systems don't expose getTestResults method
    getTestBankingResults: () => null, // Test systems don't expose getTestResults method
    getTestStoreResults: () => null, // Test systems don't expose getTestResults method
    getTestResourceGatheringResults: () => null, // Test systems don't expose getTestResults method
    getTestEquipmentResults: () => null, // Test systems don't expose getTestResults method
    getTestMovementResults: () => null, // Test systems don't expose getTestResults method
    getTestPhysicsResults: () => null, // Test systems don't expose getTestResults method
    getTestRunnerResults: () => systems.testRunner?.getTestResults(),
    getAllTestResults: () => ({
      combat: null,
      aggro: null,
      inventory: null,
      banking: null,
      store: null,
      resourceGathering: null,
      equipment: null,
      movement: null,
      physics: null,
      physicsIntegration: systems.testPhysicsIntegration?.getTestResults(),
      precisionPhysics: null, // TODO: Fix syntax errors in RPGPrecisionPhysicsTestSystem
      runner: systems.testRunner?.getTestResults(),
    }),

    // Physics Integration Test API
    getPhysicsIntegrationResults: () => systems.testPhysicsIntegration?.getTestResults(),
    getPrecisionPhysicsResults: () => null, // TODO: Fix syntax errors in RPGPrecisionPhysicsTestSystem
    runPhysicsIntegrationTests: () => systems.testPhysicsIntegration && world.emit(EventType.PHYSICS_TEST_RUN_ALL),
    runPrecisionPhysicsTests: () => systems.testPrecisionPhysics && world.emit(EventType.PHYSICS_PRECISION_RUN_ALL),
    runBallRampTest: () => systems.testPhysicsIntegration && world.emit(EventType.PHYSICS_TEST_BALL_RAMP),
    runCubeDropTest: () => systems.testPhysicsIntegration && world.emit(EventType.PHYSICS_TEST_CUBE_DROP),
    runCharacterCollisionTest: () =>
      systems.testPhysicsIntegration && world.emit(EventType.PHYSICS_TEST_CHARACTER_COLLISION),
    runProjectileMotionTest: () => systems.testPrecisionPhysics && world.emit(EventType.PHYSICS_PRECISION_PROJECTILE),

    // Test Runner API
    runAllTests: () => systems.testRunner && world.emit(EventType.TEST_RUN_ALL),
    runSpecificTest: (testName: string) => systems.testRunner?.runSpecificSystem(testName),
    isTestRunning: () => systems.testRunner?.isTestRunning(),
    getErrorLog: () => systems.testRunner?.getErrorLog(),

    // Visual Test System API (Main cube-based testing system)
    getVisualTestReport: () => (systems.visualTest as RPGVisualTestSystem)?.getTestReport(),
    getVisualEntitiesByType: (type: string) => (systems.visualTest as RPGVisualTestSystem)?.getEntitiesByType(type),
    getVisualEntitiesByColor: (color: number) => (systems.visualTest as RPGVisualTestSystem)?.getEntitiesByColor(color),
    verifyEntityExists: (entityId: string, expectedType?: string) =>
      (systems.visualTest as RPGVisualTestSystem)?.verifyEntityExists(entityId, expectedType),
    verifyPlayerAtPosition: (playerId: string, position: Position3D, tolerance?: number) =>
      (systems.visualTest as RPGVisualTestSystem)?.verifyPlayerAtPosition(playerId, position, tolerance),
    getAllVisualEntities: () => (systems.visualTest as RPGVisualTestSystem)?.getAllEntities(),

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

    // Item Pickup API
    dropItem: (item: RPGItem, position: Position3D, droppedBy?: string) =>
      droppedBy
        ? systems.itemPickup?.dropItem(item, position, droppedBy)
        : systems.itemPickup?.dropItem(item, position, ''),
    getItemsInRange: (position: Position3D, range?: number) =>
      systems.itemPickup?.getItemsInRange(position, range || 5),
    getGroundItem: (itemId: string) => systems.itemPickup?.getGroundItem(itemId),
    getAllGroundItems: () => systems.itemPickup?.getAllGroundItems(),
    clearAllItems: () => systems.itemPickup?.clearAllItems(),

    // Item Actions API
    registerItemAction: (category: string, action: ItemAction) => systems.itemActions?.registerAction(category, action),

    // Inventory Interaction API (client only)
    isDragging: () => systems.inventoryInteraction?.getSystemInfo()?.isDragging || false,
    getDropTargetsCount: () => systems.inventoryInteraction?.getSystemInfo()?.dropTargetsCount || 0,

    // Processing API
    getActiveFires: () => systems.processing?.getActiveFires(),
    getPlayerFires: (playerId: string) => systems.processing?.getPlayerFires(playerId),
    isPlayerProcessing: (playerId: string) => systems.processing?.isPlayerProcessing(playerId),
    getFiresInRange: (position: Position3D, range?: number) =>
      systems.processing?.getFiresInRange(position, range || 5),

    // Attack Style API
    getPlayerAttackStyle: (playerId: string) => systems.attackStyle?.getPlayerAttackStyle(playerId),
    getAllAttackStyles: () => systems.attackStyle?.getAllAttackStyles(),
    canPlayerChangeStyle: (playerId: string) => systems.attackStyle?.canPlayerChangeStyle(playerId),
    getRemainingStyleCooldown: (playerId: string) => systems.attackStyle?.getRemainingCooldown(playerId),
    forceChangeAttackStyle: (playerId: string, styleId: string) =>
      systems.attackStyle?.forceChangeAttackStyle(playerId, styleId),
    getPlayerStyleHistory: (playerId: string) => systems.attackStyle?.getPlayerStyleHistory(playerId),
    getAttackStyleSystemInfo: () => systems.attackStyle?.getSystemInfo(),

    // App Manager API
    createApp: (_appType: string, _config: AppConfig) => null,
    destroyApp: (_appId: string) => {},
    getApp: (_appId: string) => null,
    getAllApps: () => [],
    getAppsByType: (_type: string) => [],
    getAppCount: () => 0,

    // Entity Manager API (Server-authoritative)
    spawnEntity: (config: RPGEntityConfig) => systems.entityManager?.spawnEntity(config),
    destroyEntity: (entityId: string) => systems.entityManager?.destroyEntity(entityId),
    getEntity: (entityId: string) => systems.entityManager?.getEntity(entityId),
    getEntitiesByType: (type: string) => systems.entityManager?.getEntitiesByType(type),
    getEntitiesInRange: (center: Position3D, range: number, type?: string) =>
      systems.entityManager?.getEntitiesInRange(center, range, type),
    getAllEntities: () => [], // Entity manager doesn't expose this method
    getEntityCount: () => 0, // Entity manager doesn't expose this method
    getEntityDebugInfo: () => systems.entityManager?.getDebugInfo(),

    // Player Spawn API
    hasPlayerCompletedSpawn: (playerId: string) => systems.playerSpawn?.hasPlayerCompletedSpawn(playerId),
    getPlayerSpawnData: (playerId: string) => systems.playerSpawn?.getPlayerSpawnData(playerId),
    forceReequipStarter: (playerId: string) => systems.playerSpawn?.forceReequipStarter(playerId),
    forceTriggerAggro: (playerId: string) => systems.playerSpawn?.forceTriggerAggro(playerId),
    getAllSpawnedPlayers: () => systems.playerSpawn?.getAllSpawnedPlayers(),

    // Interaction API (Client only)
    registerInteractable: (data: Record<string, unknown>) =>
      systems.interaction && world.emit(EventType.INTERACTION_REGISTER, data),
    unregisterInteractable: (appId: string) =>
      systems.interaction && world.emit(EventType.INTERACTION_UNREGISTER, { appId }),

    // Camera API (Core ClientCameraSystem)
    getCameraInfo: () => systems.cameraSystem?.getCameraInfo(),
    setCameraMode: (_mode: string) => {}, // Camera system doesn't expose setMode method
    setCameraTarget: (_target: THREE.Object3D | null) => {}, // setTarget is private
    setCameraEnabled: (enabled: boolean) => systems.cameraSystem?.setEnabled(enabled),
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
    getAreaAtPosition: (x: number, z: number) => systems.worldContent?.getAreaAtPosition(x, z),
    getLoadedNPCs: () => systems.worldContent?.getLoadedNPCs(),
    getLoadedMobs: () => systems.worldContent?.getLoadedMobs(),
    spawnPlayerAtRandomSpawn: (playerId: string) => systems.worldContent?.preparePlayerSpawnLocation(playerId),
    getWorldContentInfo: () => systems.worldContent?.getSystemInfo(),

    // NPC API (Server only)
    getPlayerBankContents: (playerId: string) => systems.npc?.getPlayerBankContents(playerId),
    getStoreInventory: () => systems.npc?.getStoreInventory(),
    getTransactionHistory: (playerId?: string) => systems.npc?.getTransactionHistory(playerId),
    getNPCSystemInfo: () => systems.npc?.getSystemInfo(),

    // Mob AI API (Server only)
    getMobAIInfo: () => systems.mobAI?.getSystemInfo(),

    // System references for advanced usage - convert to Record format
    systems: Object.entries(systems).reduce(
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
      updatePlayerData: (playerId: string, data: Partial<RPGPlayerRow>) => {
        systems.database?.savePlayerData(playerId, data)
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
      giveItem: (playerId: string, item: RPGItem | { itemId: string; quantity: number }) => {
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
      dropItemAtPosition: (item: RPGItem, position: Position3D, playerId?: string) => {
        world.emit(EventType.ITEM_DROP, { item, position, playerId })
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
        systems.playerSpawn?.forceTriggerAggro(playerId)
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
        world.emit(EventType.RESOURCE_GATHERING_STARTED, { playerId, resourceId, playerPosition })
      },

      stopGathering: (playerId: string) => {
        world.emit(EventType.RESOURCE_GATHERING_STOPPED, { playerId })
      },

      // Movement actions (Core ClientMovementSystem)
      clickToMove: (
        playerId: string,
        targetPosition: Position3D,
        _currentPosition: Position3D,
        _isRunning?: boolean
      ) => {
        world.emit(EventType.MOVEMENT_SET_MODE, { mode: 'click_to_move' })
        systems.movementSystem?.movePlayer(playerId, targetPosition)
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
        world.emit('terrain:generate-initial', { centerX, centerZ, radius })
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
      spawnEntityAtLocation: (type: string, config: RPGEntityConfig) => {
        world.emit(EventType.ENTITY_SPAWNED, { type, config })
      },

      spawnItemEntity: (itemId: string, position: Position3D, quantity?: number) => {
        world.emit(EventType.ITEM_SPAWN, { itemId, position, quantity })
      },

      spawnMobEntity: (mobType: string, position: Position3D, level?: number) => {
        world.emit(EventType.MOB_SPAWNED, { mobType, position, level })
      },

      destroyEntityById: (entityId: string) => {
        world.emit(EventType.ENTITY_DEATH, { entityId })
      },

      interactWithEntity: (playerId: string, entityId: string, interactionType: string) => {
        world.emit('entity:interact_request', {
          playerId,
          entityId,
          interactionType,
          playerPosition: world.getPlayer(playerId)?.position,
        })
      },

      // Test helper functions for gameplay testing framework
      spawnTestPlayer: (x: number, z: number, color = '#FF0000') => {
        try {
          // Only work on client side where THREE.js scene is available
          if (world.isServer) {
            // Removed console.log('[RPG API] spawnTestPlayer only works on client side')
            return null
          }

          if (!world.stage.scene) {
            throw new Error('World stage not available for spawnTestPlayer')
          }

          // Use global THREE or stage THREE
          if (!THREE) {
            throw new Error('THREE.js not available')
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
        } catch (_error) {
          return null
        }
      },

      spawnTestGoblin: (x: number, z: number, color = '#00FF00') => {
        try {
          // Only work on client side where THREE.js scene is available
          if (world.isServer) {
            // Removed console.log('[RPG API] spawnTestGoblin only works on client side')
            return null
          }

          if (!world.stage.scene) {
            throw new Error('World stage not available for spawnTestGoblin')
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
        } catch (_error) {
          // Removed console.error('[RPG API] Failed to spawn test goblin:', _error)
          return null
        }
      },

      spawnTestItem: (x: number, z: number, itemType = 'bronze_sword', color = '#0000FF') => {
        try {
          // Only work on client side where THREE.js scene is available
          if (world.isServer) {
            // Removed console.log('[RPG API] spawnTestItem only works on client side')
            return null
          }

          if (!world.stage.scene) {
            throw new Error('World stage not available for spawnTestItem')
          }
          
          if (!THREE) {
            throw new Error('THREE.js not available')
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
        } catch (_error) {
          // Removed console.error('[RPG API] Failed to spawn test item:', _error)
          return null
        }
      },

      simulateCombat: (attacker: THREE.Object3D, target: THREE.Object3D) => {
        try {
          if (!attacker || !target) {
            return { error: 'Invalid attacker or target' }
          }

          const damage = Math.floor(Math.random() * 10) + 5

          const targetEntity = target as THREE.Object3D & { userData?: { health?: number } }

          if (targetEntity.userData?.health !== undefined) {
            targetEntity.userData.health -= damage
          }

          // Removed console.log: [Test Combat] attack result

          if (targetEntity.userData?.health !== undefined && targetEntity.userData.health <= 0) {
            // Target dies - remove from scene and spawn loot
            // Strong type assumption - world has stage with scene
            const worldStage = world.stage as { scene?: { remove: (obj: THREE.Object3D) => void } } | undefined
            if (worldStage?.scene && targetEntity.parent === worldStage.scene) {
              worldStage.scene.remove(target)
            }
            // Removed console.log(`[Test Combat] ${targetEntity.name || 'Unknown'} died`)
            return { killed: true, damage: damage }
          }

          return { killed: false, damage: damage }
        } catch (error) {
          // Removed console.error('[RPG API] Combat simulation failed:', error)
          return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      },
    },
  }
  world.rpg = rpgAPI as typeof world.rpg
}
