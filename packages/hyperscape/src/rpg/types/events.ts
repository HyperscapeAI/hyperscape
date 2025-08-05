/**
 * RPG Event Types
 * Defines all event types used in the RPG system
 */

import type { Position3D } from './core';

// Banking Events
export interface BankDepositEvent {
  playerId: string;
  itemId: string;
  quantity: number;
}

export interface BankWithdrawEvent {
  playerId: string;
  itemId: string;
  quantity: number;
  slotIndex: number;
}

export interface RPGBankDepositSuccessEvent {
  playerId: string;
  itemId: string;
  quantity: number;
  bankId: string;
}

// Store Events
export interface StoreTransactionEvent {
  playerId: string;
  storeId: string;
  itemId: string;
  quantity: number;
  totalCost: number;
  transactionType: 'buy' | 'sell';
}

export interface RPGStoreOpenEvent {
  playerId: string;
  storeId: string;
  playerPosition: Position3D;
}

export interface RPGStoreCloseEvent {
  playerId: string;
  storeId: string;
}

export interface RPGStoreBuyEvent {
  playerId: string;
  storeId: string;
  itemId: string;
  quantity: number;
}

export interface RPGStoreSellEvent {
  playerId: string;
  storeId: string;
  itemId: string;
  quantity: number;
}

// Inventory Events
export interface InventoryUpdateEvent {
  playerId: string;
  itemId: string;
  previousQuantity: number;
  newQuantity: number;
  action: 'add' | 'remove' | 'update';
}

export interface RPGInventoryAddEvent {
  playerId: string;
  itemId: string;
  quantity: number;
}

export interface RPGInventoryCanAddEvent {
  playerId: string;
  item: {
    id: string;
    name: string;
    quantity: number;
    stackable: boolean;
  };
  callback: (canAdd: boolean) => void;
}

export interface RPGInventoryCheckEvent {
  playerId: string;
  itemId: string;
  quantity: number;
  callback: (hasItem: boolean, inventorySlot: RPGInventoryItemInfo | null) => void;
}

// Using InventoryItemInfo without the slot property for the callback
export type RPGInventoryItemInfo = Omit<InventoryItemInfo, 'slot'>;

export interface RPGInventoryGetCoinsEvent {
  playerId: string;
  callback: (coins: number) => void;
}

export interface RPGInventoryHasEquippedEvent {
  playerId: string;
  slot: string;
  itemType: string;
  callback: (hasEquipped: boolean) => void;
}

export interface RPGInventoryRemoveCoinsEvent {
  playerId: string;
  amount: number;
}

export interface RPGInventoryRemoveEvent {
  playerId: string;
  itemId: string;
  quantity: number;
}

export interface InventoryItemInfo {
  id: string;
  name: string;
  quantity: number;
  stackable: boolean;
  slot: string | null;
}

// Player Events
export interface PlayerInitEvent {
  playerId: string;
  position: Position3D;
  isNewPlayer: boolean;
}

export interface PlayerEnterEvent {
  playerId: string;
}

export interface PlayerLeaveEvent {
  playerId: string;
}

export interface PlayerLevelUpEvent {
  playerId: string;
  previousLevel: number;
  newLevel: number;
  skill: string;
}

export interface PlayerXPGainEvent {
  playerId: string;
  skill: string;
  xpGained: number;
  currentXP: number;
  currentLevel: number;
}

export interface HealthUpdateEvent {
  entityId: string;
  previousHealth: number;
  currentHealth: number;
  maxHealth: number;
}

export interface PlayerDeathEvent {
  playerId: string;
  deathLocation: Position3D;
  cause: string;
}

export interface PlayerRespawnRequestEvent {
  playerId: string;
  requestTime: number;
}

// UI Events
export interface RPGUIMessageEvent {
  playerId: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  duration: number; // 0 for permanent
}

// All RPG event types - comprehensive list
export type RPGEventType = 
  // Banking
  | 'rpg:bank:deposit'
  | 'rpg:bank:withdraw'
  | 'rpg:bank:deposit:success'
  // Store
  | 'rpg:store:open'
  | 'rpg:store:close'
  | 'rpg:store:buy'
  | 'rpg:store:sell'
  | 'rpg:store:transaction'
  // Inventory
  | 'rpg:inventory:update'
  | 'rpg:inventory:add'
  | 'rpg:inventory:remove'
  | 'rpg:inventory:remove-coins'
  | 'rpg:inventory:check'
  | 'rpg:inventory:can-add'
  | 'rpg:inventory:get-coins'
  | 'rpg:inventory:has-equipped'
  // Player
  | 'rpg:player:init'
  | 'rpg:player:enter'
  | 'rpg:player:leave'
  | 'rpg:player:levelup'
  | 'rpg:player:xpgain'
  | 'rpg:player:death'
  | 'rpg:player:respawn-request'
  // Health
  | 'rpg:health:update'
  // UI
  | 'rpg:ui:message';

export interface RPGEventData<T = Record<string, unknown>> {
  type: RPGEventType;
  data: T;
  timestamp: number;
  source: string | null;
}