/**
 * Test system type definitions
 * 
 * These interfaces define test data structures used by the RPG testing framework.
 * All test interfaces use strongly typed properties to ensure test reliability.
 */

import { Player as BasePlayer } from '../../types/index';
import type { AttackType, EquipmentSlotName, PlayerEquipment, PlayerSkills, Position3D, Inventory, RPGItem } from './core';

// Test Player interface for visual testing framework
// DO NOT alter -- instead alter the BasePlayer if you need more properties
// But if you need position and rotation, try .node.position and .node.rotation
export type Player = BasePlayer

// Type alias for skill names
export type RPGSkillName = keyof PlayerSkills;

// Type alias for skills
export type RPGSkills = PlayerSkills;

// Common test types
export type TestAction = 'woodcutting' | 'fishing' | 'combat' | 'firemaking' | 'cooking';

// Visual test framework interfaces
export interface TestStationConfig {
  position: Position3D;
  name: string;
  description: string;
}

// Resource test interfaces
export interface ResourceTestData {
  player: Player;
  resourcePosition: Position3D;
  resourceType: 'tree' | 'rock' | 'ore' | 'herb' | 'fish';
  gatheringStarted: boolean;
  gatheringProgress: number;
  gatheringComplete: boolean;
  resourceRemoved: boolean;
  itemReceived: boolean;
  xpGained: number;
  startTime: number;
}

// Fishing test interfaces
export interface FishingTestData {
  player: Player;
  fishingSpot: Position3D;
  startTime: number;
  initialFishingXP: number;
  finalFishingXP: number;
  fishCaught: number;
  attemptsMade: number;
  successRate: number;
  expectedSuccessRate: number;
  hasRodEquipped: boolean;
  nearWater: boolean;
  inventorySpace: number;
}

// Combat test interfaces
export interface CombatTestData {
  player: Player;
  mobId: string;
  weaponType: AttackType;
  startTime: number;
  damageDealt: number;
  hitCount: number;
  missCount: number;
  expectedKillTime: number;
  arrowsUsed: number;
  initialArrows: number;
  attackInterval: NodeJS.Timeout | null;
  goblinId: string;
  goblinHealth: number;
  playerHealth: number;
  combatStarted: boolean;
  combatEnded: boolean;
  damageReceived: number;
  xpGained: number;
  lootDropped: boolean;
}

// Movement test interfaces
export interface MovementTestData {
  player: Player;
  testType: 'basic_movement' | 'pathfinding' | 'collision' | 'teleportation' | 'comprehensive';
  startTime: number;
  startPosition: Position3D;
  targetPosition: Position3D;
  currentPosition: Position3D;
  waypoints: Array<Position3D & { reached: boolean }>;
  distanceTraveled: number;
  movementSpeed: number;
  staminaUsed: number;
  obstaclesAvoided: number;
  teleportationsAttempted: number;
  teleportationsSuccessful: number;
  collisionDetected: boolean;
  pathfindingWorked: boolean;
  boundariesRespected: boolean;
  movementEffectsTested: boolean;
  timeoutIds: NodeJS.Timeout[];
  movementStarted: boolean;
  movementCompleted: boolean;
  pathFound: boolean;
  pathNodes: Position3D[];
  currentPathIndex: number;
}

// Position3D is imported from core.ts

// XP test interfaces
export interface XPTestData {
  player: Player;
  startTime: number;
  initialSkills: RPGSkills;
  finalSkills: RPGSkills;
  xpGained: Record<RPGSkillName, number>;
  levelsGained: Record<RPGSkillName, number>;
  levelUpsDetected: number;
  combatLevelInitial: number;
  combatLevelFinal: number;
  expectedXPPerAction: Record<TestAction, number>;
  actionsPerformed: Record<TestAction, number>;
  expectedSkillsPerAction: Record<TestAction, RPGSkillName[]>;
  initialXP: Record<RPGSkillName, { level: number; xp: number }>;
  currentXP: Record<RPGSkillName, { level: number; xp: number }>;
}

// Inventory test interfaces
export interface InventoryTestData {
  player: Player;
  testItems: string[];
  droppedItems: Array<{ itemId: string; position: Position3D; quantity: number }>;
  startTime: number;
  initialInventorySize: number;
  itemsPickedUp: number;
  itemsDropped: number;
  itemsUsed: number;
  stackingTested: boolean;
  spaceLimit_tested: boolean;
  maxSlotsTested: boolean;
  itemsAdded: number;
  itemsRemoved: number;
  testType: 'basic_pickup' | 'item_stacking' | 'inventory_limit' | 'item_movement' | 'item_use';
  initialInventory: Inventory;
  currentInventory: Inventory;
  itemsAddedArray: Array<{ item: RPGItem; quantity: number }>;
  itemsRemovedArray: Array<{ item: RPGItem; quantity: number }>;
  itemsMoved: Array<{ from: number; to: number }>;
  coinsGained: number;
  coinsSpent: number;
}

// Equipment test interfaces
export interface TestItem {
  id: string;
  name: string;
  slot: EquipmentSlotName;
  stats: { attack: number; defense: number; strength: number; ranged: number };
}

export interface EquipmentTestData {
  player: Player;
  testItems: TestItem[];
  equipmentSlots: Array<EquipmentSlotName>;
  currentEquipment: {
    weapon: TestItem | null;
    shield: TestItem | null;
    helmet: TestItem | null;
    body: TestItem | null;
    legs: TestItem | null;
    arrows: TestItem | null;
  };
  equipmentChanges: Array<{ slot: EquipmentSlotName; item: TestItem | null; timestamp: number }>;
  startTime: number;
}

// Cooking test interfaces
export interface CookingTestData {
  player: Player;
  fireId: string;
  startTime: number;
  initialCookingXP: number;
  finalCookingXP: number;
  rawFishUsed: number;
  cookedFishCreated: number;
  burntFishCreated: number;
  successfulCooks: number;
  burnedCooks: number;
  attemptsMade: number;
  expectedSuccessRate: number;
  listeners: Array<{ event: string; handler: Function }>;
  firePosition: Position3D;
  cookingStarted: boolean;
  cookingProgress: number;
  cookingComplete: boolean;
  itemCooked: boolean;
  xpGained: number;
  hasFire: boolean;
  hasRawFish: boolean;
  inventorySpace: number;
}

// Banking test interfaces
export interface BankingTestData {
  player: Player;
  bankPosition: Position3D;
  bankOpen: boolean;
  itemsDeposited: Array<{ item: RPGItem; quantity: number }>;
  itemsWithdrawn: Array<{ item: RPGItem; quantity: number }>;
  startTime: number;
}

// Store test interfaces
export interface StoreTestData {
  player: Player;
  storePosition: Position3D;
  storeOpen: boolean;
  itemsBought: Array<{ item: RPGItem; quantity: number; price: number }>;
  itemsSold: Array<{ item: RPGItem; quantity: number; price: number }>;
  startingCoins: number;
  currentCoins: number;
  startTime: number;
}

// Death test interfaces
export interface DeathTestData {
  player: Player;
  deathLocation: Position3D;
  respawnLocation: Position3D;
  deathTime: number;
  respawnTime: number;
  itemsDropped: Array<{ item: RPGItem; quantity: number }>;
  xpLost: Record<RPGSkillName, number>;
  deathCause: 'combat' | 'fall' | 'drowning' | 'poison' | 'fire' | 'other';
  respawned: boolean;
}

// Persistence test interfaces
export interface PersistenceTestData {
  player: Player;
  saveTime: number;
  loadTime: number;
  savedData: {
    skills: RPGSkills;
    inventory: Inventory;
    equipment: Array<{ slot: EquipmentSlotName; item: RPGItem }>;
    bankStorage: Array<{ item: RPGItem; quantity: number }>;
    position: Position3D;
    health: number;
    coins: number;
  } | null;
  loadedData: {
    skills: RPGSkills;
    inventory: Inventory;
    equipment: Array<{ slot: EquipmentSlotName; item: RPGItem }>;
    bankStorage: Array<{ item: RPGItem; quantity: number }>;
    position: Position3D;
    health: number;
    coins: number;
  } | null;
  dataMatches: boolean;
  saveSuccessful: boolean;
  loadSuccessful: boolean;
}

// UI test interfaces
export interface UITestData {
  player: Player;
  uiOpen: boolean;
  uiType: 'inventory' | 'equipment' | 'skills' | 'bank' | 'store' | 'combat';
  uiData: {
    inventory: Inventory | null;
    equipment: PlayerEquipment | null;
    skills: RPGSkills | null;
    bank: Array<{ item: RPGItem; quantity: number }> | null;
    store: { storeId: string; items: Array<{ item: RPGItem; price: number }> } | null;
  };
  uiInteractions: Array<{ 
    action: 'click' | 'drag' | 'drop' | 'equip' | 'unequip' | 'buy' | 'sell'; 
    timestamp: number; 
    data: {
      itemId: string;
      slot: string;
      quantity: number;
      targetSlot: string;
    };
  }>;
  startTime: number;
}

// Aggro test interfaces
export interface AggroTestData {
  player: Player;
  mobId: string;
  mobPosition: Position3D;
  aggroTriggered: boolean;
  aggroDistance: number;
  combatStarted: boolean;
  playerDetected: boolean;
  startTime: number;
}

// Loot drop test interfaces
export interface LootTestData {
  player: Player;
  mobId: string;
  lootDropped: boolean;
  lootItems: Array<{ item: RPGItem; quantity: number }>;
  lootCollected: boolean;
  corpseCreated: boolean;
  startTime: number;
}

// Corpse test interfaces
export interface CorpseTestData {
  player: Player;
  corpseId: string;
  corpsePosition: Position3D;
  lootItems: Array<{ item: RPGItem; quantity: number }>;
  lootTaken: boolean;
  corpseDecayed: boolean;
  startTime: number;
}

// Firemaking test interfaces
export interface FiremakingTestData {
  player: Player;
  firePosition: Position3D;
  fireCreated: boolean;
  logsUsed: number;
  xpGained: number;
  fireDecayed: boolean;
  startTime: number;
  hasLogs: boolean;
  inventorySpace: number;
}

// Woodcutting test interfaces
export interface WoodcuttingTestSession {
  player: Player;
  treePosition: Position3D;
  treeId: string;
  startTime: number;
  chopStarted: boolean;
  chopComplete: boolean;
  logsReceived: number;
  xpGained: number;
  treeRespawned: boolean;
  respawnTime: number;
}

// Action test interfaces
export interface ActionTestData {
  player: Player;
  actionName: 'attack' | 'pickup' | 'drop' | 'equip' | 'unequip' | 'use' | 'move' | 'gather' | 'cook' | 'fish';
  actionParams: {
    targetId: string | null;
    itemId: string | null;
    quantity: number | null;
    position: Position3D | null;
    slot: string | null;
  };
  actionStarted: boolean;
  actionCompleted: boolean;
  actionResult: {
    success: boolean;
    message: string;
    data: Record<string, string | number | boolean>;
    error: string | null;
  } | null;
  startTime: number;
}

// System validation interfaces
export interface SystemValidationData {
  systemName: string;
  initialized: boolean;
  dependencies: string[];
  missingDependencies: string[];
  methods: string[];
  missingMethods: string[];
  validationPassed: boolean;
  errors: string[];
}

export interface SystemValidationResult {
  systemName: string;
  exists: boolean;
  initialized: boolean;
  hasRequiredMethods: boolean;
  missingMethods: string[];
  errors: string[];
}

export interface ValidationResults {
  totalSystems: number;
  passedSystems: number;
  failedSystems: number;
  missingDependencies: Set<string>;
  errors: string[];
  allPassed: boolean;
}