/**
 * Database row types for the RPG persistence layer
 * These types represent the structure of data as stored in the database
 */

import { EquipmentSlotName } from './core';

// SQLite type aliases for clarity
type SQLiteBoolean = 0 | 1;

// SQLite Database interface
type SQLiteParam = string | number | boolean | null | Buffer
export interface SQLiteStatement {
  get<T = Record<string, unknown>>(...params: SQLiteParam[]): T | undefined;
  all<T = Record<string, unknown>>(...params: SQLiteParam[]): T[];
  run(...params: SQLiteParam[]): { changes: number; lastInsertRowid: number };
}

export interface SQLiteDatabase {
  prepare(sql: string): SQLiteStatement;
  exec(sql: string): void;
  close(): void;
  pragma<T = unknown>(name: string, value?: string | number | boolean): T;
}

// Types for database method parameters
export interface InventorySaveItem {
  itemId: string;
  quantity: number;
  slotIndex: number;
  metadata: Record<string, string | number | boolean> | null;
}

export interface EquipmentSaveItem {
  slotType: string;
  itemId: string;
  quantity: number;
}

export interface WorldChunkData {
  chunkX: number;
  chunkZ: number;
  data: string; // JSON-serialized chunk data
  lastActive: number;
  playerCount: number;
  version: number;
}

// Player data row
export interface RPGPlayerRow {
  id: number
  playerId: string
  name: string
  combatLevel: number
  attackLevel: number
  strengthLevel: number
  defenseLevel: number
  constitutionLevel: number
  rangedLevel: number
  attackXp: number
  strengthXp: number
  defenseXp: number
  constitutionXp: number
  rangedXp: number
  health: number
  maxHealth: number
  coins: number
  positionX: number
  positionY: number
  positionZ: number
  lastLogin: number
  createdAt: number
  woodcuttingLevel: number
  woodcuttingXp: number
  fishingLevel: number
  fishingXp: number
  firemakingLevel: number
  firemakingXp: number
  cookingLevel: number
  cookingXp: number
}

// Item definition row
export interface RPGItemRow {
  id: number
  name: string
  type: string
  description: string
  value: number
  weight: number
  stackable: SQLiteBoolean
  tradeable: SQLiteBoolean
  attackLevel: number | null
  strengthLevel: number | null
  defenseLevel: number | null
  rangedLevel: number | null
  attackBonus: number
  strengthBonus: number
  defenseBonus: number
  rangedBonus: number
  heals: number | null
  maxStackSize: number
  equipSlot: string | null
}

// Player inventory row
export interface RPGInventoryRow {
  id: number
  playerId: string
  itemId: string
  quantity: number
  slotIndex: number
  metadata: string | null // JSON string for additional item data
}

// Player equipment row
export interface RPGEquipmentRow {
  id: number
  playerId: string
  slotType: EquipmentSlotName
  itemId: string | null
  quantity: number
}

// Bank storage row
export interface RPGBankRow {
  id: number
  playerId: string
  bankId: string
  itemId: string
  quantity: number
  slotIndex: number
  metadata: string | null
}

// Store inventory row
export interface RPGStoreRow {
  id: number
  storeId: string
  itemId: string
  price: number
  stock: number
  maxStock: number
  restockTime: number
  lastRestock: number
}

// Player session row
export interface RPGSessionRow {
  id: number
  sessionId: string
  playerId: string
  startTime: number
  endTime: number | null
  isActive: SQLiteBoolean
  lastActivity: number
  ipAddress: string | null
  userAgent: string | null
}

// Combat log row
export interface RPGCombatLogRow {
  id: number
  attackerId: string
  attackerType: 'player' | 'mob'
  targetId: string
  targetType: 'player' | 'mob'
  damage: number
  weaponType: string // TODO: Use AttackType union
  combatStyle: string // TODO: Use CombatStyle union
  timestamp: number
  sessionId: string
}

// Death log row
export interface RPGDeathLogRow {
  id: number
  playerId: string
  killedBy: string
  killerType: 'player' | 'mob' | 'environment'
  deathLocation: string // JSON string with x, y, z
  itemsLost: string | null // JSON array of item IDs
  timestamp: number
  sessionId: string
}

// Resource respawn row
export interface RPGResourceRespawnRow {
  id: number
  resourceId: string
  resourceType: 'tree' | 'rock' | 'fishing_spot'
  position: string // JSON string with x, y, z
  respawnTime: number
  lastHarvested: number
  harvestedBy: string
}

// NPC state row
export interface RPGNPCStateRow {
  id: number
  npcId: string
  npcType: string
  position: string // JSON string with x, y, z
  health: number
  maxHealth: number
  state: 'idle' | 'combat' | 'fleeing' | 'dead'
  lastUpdate: number
}

// Quest progress row
export interface RPGQuestProgressRow {
  id: number
  playerId: string
  questId: string
  status: 'not_started' | 'in_progress' | 'completed' | 'failed'
  progress: string // JSON string with quest-specific progress data
  startTime: number | null
  completionTime: number | null
}

// Trade log row
export interface RPGTradeLogRow {
  id: number
  player1Id: string
  player2Id: string
  player1Items: string // JSON array of items traded
  player2Items: string // JSON array of items traded
  timestamp: number
  sessionId: string
}

// Helper type for JSON columns with type safety
export type JSONString<T> = string & { __json: T }

// Helper functions for JSON serialization
export function toJSONString<T>(data: T): JSONString<T> {
  return JSON.stringify(data) as JSONString<T>
}

export function fromJSONString<T>(json: JSONString<T> | string | null): T | null {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

// Database System types
export interface RPGWorldChunkRow extends WorldChunkData {
  needsReset: SQLiteBoolean;
}

export interface RPGPlayerSessionRow {
  id: string;
  sessionId: string; // Alias for id to maintain compatibility
  playerId: string;
  sessionStart: number;
  sessionEnd: number | null;
  playtimeMinutes: number;
  reason: string | null;
  lastActivity: number;
}