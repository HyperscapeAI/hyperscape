/**
 * Core RPG World type extensions that reference actual system implementations
 * 
 * These interfaces define debug and monitoring information for various RPG systems.
 * Used for system introspection and performance monitoring.
 */

import type { Position3D, MobAIStateType } from './core';

// System-specific debug info interfaces
export interface MobAISystemInfo {
  activeMobs: number;
  mobStates: number;
  stateDistribution: Record<MobAIStateType, number>;
  totalCombatTargets: number;
}

export interface ItemPickupSystemInfo {
  totalGroundItems: number;
  itemsByType: Record<string, number>;
  oldestItem: {
    itemId: string;
    position: Position3D;
    droppedAt: number;
  } | null;
  newestItem: {
    itemId: string;
    position: Position3D;
    droppedAt: number;
  } | null;
}

export interface NPCSystemInfo {
  bankAccounts: number;
  totalTransactions: number;
  storeItems: number;
  recentTransactions: Array<{
    timestamp: number;
    type: 'buy' | 'sell' | 'bank_deposit' | 'bank_withdraw';
    playerId: string;
    itemId: string | null;
    quantity: number;
    amount: number;
  }>;
}

export interface PlayerSpawnSystemInfo {
  totalSpawnedPlayers: number;
  playersWithEquipment: number;
  playersWithAggro: number;
  starterEquipmentItems: number;
  playerSpawnData: Record<string, {
    hasStarterEquipment: boolean;
    aggroTriggered: boolean;
    spawnTime: number;
    position: Position3D;
  }>;
}

