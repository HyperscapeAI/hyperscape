/**
 * Game-related type definitions
 * 
 * Shared types for game mechanics and data
 */

import * as THREE from '../extras/three'
import type { Item, Player } from './core'
import type { ItemRarity } from './entities'

// Loot and item spawning interfaces
export interface LootItem extends Item {
  quantity: number
  rarity: ItemRarity
}

export interface ItemSpawnerStats {
  totalItems: number
  shopItems: number
  treasureItems: number
  chestItems: number
  resourceItems: number
  lootItems: number
  byType: Record<string, number>
  byLocation?: Record<string, number>
  spawnedItems?: number
}

// Movement and testing interfaces
export interface PlayerWithProxy extends Player {
  visualProxy?: THREE.Object3D
}

// Network entity interface for multiplayer
export interface NetworkEntity {
  id?: string
  position?: unknown
  rotation?: unknown
  velocity?: unknown
  serialize?: () => Record<string, unknown>
}