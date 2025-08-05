/**
 * Central RPG Types Export
 * Single source of truth for all RPG type definitions
 * 
 * This file consolidates all RPG types to eliminate import inconsistencies.
 * Avoid duplicating types that exist in other files - import and re-export instead.
 * Use strongly typed interfaces without optional properties or unknown types.
 */

// Re-export core Hyperscape types
export { RPGSystemBase } from '../systems/RPGSystemBase';
export type { World } from '../../types/index';

// Import types needed for this file's interfaces
import type { Position3D } from './core';

// Re-export all RPG core types
export * from './core';
export * from './database';
export * from './entities';
export * from './events';
export * from './identifiers';
export * from './rpg-systems';

// Re-export test types (specific exports to avoid conflicts)
export type {
  ActionTestData, AggroTestData, BankingTestData, CookingTestData, CorpseTestData, DeathTestData, EquipmentTestData, Player, FiremakingTestData, FishingTestData, InventoryTestData, LootTestData, PersistenceTestData, ResourceTestData, StoreTestData, SystemValidationData,
  SystemValidationResult, TestAction, TestItem, TestStationConfig, UITestData, ValidationResults, WoodcuttingTestSession, XPTestData
} from './test';

// Re-export test skill type with alias to avoid conflict
export type { RPGSkillName } from './test';

// Re-export system-specific types
export type {
  ClientControlsSystem,
  ClientUISystem, RPGItemRegistrySystem
} from '../../types/system-interfaces';

// Re-export data types (specific exports to avoid conflicts)
export { RPG_ITEMS } from '../data/items';
export type { ItemRequirement as DataItemRequirement, RPGItem as DataRPGItem } from '../data/items'; // Alias to avoid conflict
export * from '../data/mobs';
export * from '../data/world-areas';

// Commonly used type aliases for convenience
export type {

  // Combat types
  CombatTarget, PlayerData, PlayerEquipment,
  PlayerSkills,
  // Position and movement
  Position3D,
  // Data structure types
  Inventory,
  InventoryItem, RPGItem, RPGMob, RPGNPC,
  // Core entity types
  RPGPlayer, RPGResource, MobEntity,
  // Database types (these are in database.ts, not core.ts)
  // RPGPlayerRow, RPGInventoryRow, RPGEquipmentRow are exported from ./database
  // System configuration
  RPGSystemConfig,
  // Test types
  TestResult,
  TestStation, Vector3D
} from './core';

// World type is already exported as 'World' above - use that instead of creating alias

// Common interfaces that are used across multiple systems
// Note: Use Position3D from core.ts instead of creating duplicates
export interface RPGEntityWithPosition {
  position: Position3D;
  rotation: Position3D;
}

export interface RPGEntityWithId {
  id: string;
}

// Event data interfaces - strongly typed versions
export interface RPGBaseEventData {
  timestamp: number;
  source: string;
}

export interface RPGPlayerEventData extends RPGBaseEventData {
  playerId: string;
}

export interface RPGItemEventData extends RPGBaseEventData {
  itemId: string;
  quantity: number;
}

export interface RPGCombatEventData extends RPGBaseEventData {
  attackerId: string;
  targetId: string;
  damage: number;
  attackType: 'melee' | 'ranged' | 'magic';
}

// System state interfaces
export interface RPGSystemState {
  isInitialized: boolean;
  isActive: boolean;
  lastUpdate: number;
  errorCount: number;
}

export interface RPGTestSystemState extends RPGSystemState {
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  currentTest: string | null;
}

// Utility types
export type RPGCallback<T = void> = (result: T) => void;
export type RPGAsyncCallback<T = void> = (result: T) => Promise<void>;
export type RPGEventCallback<T extends RPGBaseEventData = RPGBaseEventData> = (data: T) => void;

// Constants
export const RPG_CONSTANTS = {
  MAX_INVENTORY_SLOTS: 28,
  MAX_BANK_SLOTS: 500,
  DEFAULT_HEALTH: 100,
  DEFAULT_STAMINA: 100,
  COMBAT_TIMEOUT_MS: 10000,
  RESPAWN_TIME_MS: 30000,
  SAVE_INTERVAL_MS: 60000
} as const;

// Error codes for type safety
export const RPG_ERROR_CODES = {
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  PLAYER_ERROR: 'PLAYER_ERROR',
  ITEM_ERROR: 'ITEM_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR'
} as const;

export type RPGErrorCode = typeof RPG_ERROR_CODES[keyof typeof RPG_ERROR_CODES];

// Error types
export class RPGError extends Error {
  constructor(
    message: string,
    public readonly code: RPGErrorCode,
    public readonly context: Record<string, string | number | boolean> = {}
  ) {
    super(message);
    this.name = 'RPGError';
  }
}

export class RPGSystemError extends RPGError {
  constructor(
    systemName: string,
    message: string,
    context: Record<string, string | number | boolean> = {}
  ) {
    super(`[${systemName}] ${message}`, RPG_ERROR_CODES.SYSTEM_ERROR, { system: systemName, ...context });
    this.name = 'RPGSystemError';
  }
}

export class RPGPlayerError extends RPGError {
  constructor(
    playerId: string,
    message: string,
    context: Record<string, string | number | boolean> = {}
  ) {
    super(`Player ${playerId}: ${message}`, RPG_ERROR_CODES.PLAYER_ERROR, { playerId, ...context });
    this.name = 'RPGPlayerError';
  }
}

export class RPGItemError extends RPGError {
  constructor(
    itemId: string,
    message: string,
    context: Record<string, string | number | boolean> = {}
  ) {
    super(`Item ${itemId}: ${message}`, RPG_ERROR_CODES.ITEM_ERROR, { itemId, ...context });
    this.name = 'RPGItemError';
  }
}

// Logger interface
export interface RPGLogger {
  debug(message: string, context?: Record<string, string | number | boolean>): void;
  info(message: string, context?: Record<string, string | number | boolean>): void;
  warn(message: string, context?: Record<string, string | number | boolean>): void;
  error(message: string, error?: Error, context?: Record<string, string | number | boolean>): void;
  system(systemName: string, message: string, context?: Record<string, string | number | boolean>): void;
  player(playerId: string, message: string, context?: Record<string, string | number | boolean>): void;
  test(testName: string, message: string, context?: Record<string, string | number | boolean>): void;
}