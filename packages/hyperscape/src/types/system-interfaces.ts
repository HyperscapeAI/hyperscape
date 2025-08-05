/**
 * Strong type definitions for all systems in Hyperscape
 * These interfaces define the expected structure of each system
 * to enable strong type assumptions throughout the codebase
 */

import PhysX from '@hyperscape/physx-js-webidl'
import * as THREE from '../core/extras/three'
import type { CombatData } from '../rpg/systems/RPGCombatSystem'
import type { RPGItem, PlayerData, Town } from '../rpg/types/core'
import type { Player, System, World } from './index'
import { RPGEntity } from '../rpg'
import { Settings as _Settings } from '../core/systems/Settings'

// Core System Interfaces

export interface PhysicsSystem extends System {
  scene: PhysX.PxScene
  createLayerMask(...layers: string[]): number
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance?: number, layerMask?: number): unknown
  addActor(actor: unknown, handle: unknown): unknown
  clean(): void
}

export interface StageSystem extends System {
  scene: THREE.Scene
  THREE: typeof THREE
  clean(): void
}

export interface ChatSystem extends System {
  add(message: { from: string; body: string }, broadcast?: boolean): void
  subscribe(callback: (messages: unknown[]) => void): () => void
  send(text: string): unknown
}

export interface ClientControlsSystem extends System {
  setEnabled(enabled: boolean): void
  keyX?: { pressed: boolean; released: boolean; onPress?: () => void; onRelease?: () => void }
  setKey(key: string, value: boolean): void
}

export interface ClientUISystem extends System {
  registerCameraSystem(cameraSystem: unknown): void
  unregisterCameraSystem(cameraSystem: unknown): void
  toggleVisible(): void
}

export interface NetworkSystem extends System {
  isClient: boolean
  isServer: boolean
  send(event: string, data: unknown): void
  disconnect(): void
}

export interface EntitiesSystem extends System {
  player: Player
  get(id: string): unknown
  modify(id: string, data: unknown): void
}

export interface TerrainSystem extends System {
  getHeightAt(x: number, z: number): number
  getHeightAtPosition(x: number, z: number): number
  isPositionWalkable(x: number, z: number): { walkable: boolean; reason?: string }
  getBiomeAt(x: number, z: number): string
  findWaterAreas(tile: unknown): unknown[]
}

export interface DatabaseSystem extends System {
  saveWorldChunk(chunkData: unknown): void
  getWorldChunk(x: number, z: number): unknown
  getInactiveChunks(minutes: number): unknown[]
  close(): void
}

export interface LoaderSystem extends System {
  preload(url: string): void
  execPreload(): Promise<void>
}

export interface ActionsSystem extends System {
  btnDown: boolean
  execute(actionName: string, params?: unknown): Promise<unknown>
  getAvailable(): string[]
  register(action: unknown): void
  unregister(name: string): void
}

export interface XRSystem extends System {
  session?: unknown
  supportsVR: boolean
  enter(): void
}

// RPG System Interfaces

export interface RPGPlayerSystem extends System {
  initializePlayer(playerId: string): void
  savePlayerToDatabase(playerId: string): void
  onPlayerEnter(event: { playerId: string }): void
  getPlayer(playerId: string): PlayerData | null
}

export interface RPGMobSystem extends System {
  getMob(mobId: string): RPGEntity | null
  spawnMob(config: unknown): Promise<unknown>
  getMobCount(): number
  getActiveMobs(): RPGEntity[]
  getSpawnedMobs(): Map<string, unknown>
}

export interface RPGCombatSystem extends System {
  startCombat(attackerId: string, targetId: string, options?: unknown): boolean
  isInCombat(entityId: string): boolean
  getCombatData(entityId: string): CombatData | null
  forceEndCombat(entityId: string): void
  getActiveCombats(): Map<string, CombatData>
}

export interface RPGInventorySystem extends System {
  addItem(playerId: string, itemId: string, quantity: number): boolean
  removeItem(playerId: string, itemId: string, quantity: number): boolean
  getPlayerInventory(playerId: string): unknown[]
  initializeTestPlayerInventory(playerId: string): void
  playerInventories: Map<string, unknown>
}

export interface RPGEquipmentSystem extends System {
  equipItem(data: { playerId: string; itemId: string | number; slot: string; inventorySlot?: number }): void
  unequipItem(data: { playerId: string; slot: string }): void
  consumeArrow(playerId: string): boolean
  playerEquipment: Map<string, unknown>
}

export interface RPGStoreSystem extends System {
  purchaseItem(playerId: string, itemId: string, quantity: number, expectedPrice: number): Promise<boolean>
  sellItem(playerId: string, itemId: string, quantity: number, expectedPrice: number): Promise<boolean>
  stores: Map<string, unknown>
}

export interface RPGBankingSystem extends System {
  playerBanks: Map<string, unknown>
}

export interface RPGXPSystem extends System {
  getSkillLevel(playerId: string, skill: string): number
  getSkillData(playerId: string, skill: string): unknown
  getCombatLevel(playerId: string): number
}

export interface RPGMovementSystem extends System {
  startPlayerMovement(playerId: string, target: unknown): void
  teleportPlayer(playerId: string, position: unknown): void
  movePlayer(playerId: string, destination: unknown, options?: unknown): void
}

export interface RPGPathfindingSystem extends System {
  findPath(start: unknown, end: unknown): unknown[]
}

export interface RPGWorldGenerationSystem extends System {
  getTowns(): Town[]
}

export interface RPGEntityManager extends System {
  getEntity(entityId: string): RPGEntity | undefined
  getEntityCounts(): Record<string, number>
}

export interface RPGItemRegistrySystem extends System {
  get(itemId: string): RPGItem | null
}

// Augment the World interface to include typed system retrieval
// Note: Commenting out this interface augmentation due to conflicts with existing World interface
// declare module './index' {
//   interface World {
//     // Core systems
//     physics: PhysicsSystem
//     stage: StageSystem
//     chat: ChatSystem
//     settings: Settings
//     entities: EntitiesSystem
//     network?: NetworkSystem
//     controls?: ClientControlsSystem
//     ui?: ClientUISystem
//     loader?: LoaderSystem
//     actions?: ActionsSystem
//     xr?: XRSystem
//     terrain?: TerrainSystem
//     
//     // RPG systems
//     rpg?: {
//       player?: RPGPlayerSystem
//       mob?: RPGMobSystem
//       combat?: RPGCombatSystem
//       inventory?: RPGInventorySystem
//       equipment?: RPGEquipmentSystem
//       store?: RPGStoreSystem
//       banking?: RPGBankingSystem
//       xp?: RPGXPSystem
//       movement?: RPGMovementSystem
//       pathfinding?: RPGPathfindingSystem
//       worldGeneration?: RPGWorldGenerationSystem
//       entityManager?: RPGEntityManager
//       itemRegistry?: RPGItemRegistrySystem
//     }
//     
//     // Typed system retrieval
//     getSystem<T extends System = System>(systemKey: string): T
//     findSystem<T extends System = System>(nameOrConstructor: string): T
//   }
// }

// Type guard helpers (these should eventually be removed)
export function isPhysicsSystem(system: System): system is PhysicsSystem {
  return 'scene' in system && 'createLayerMask' in system
}

export function isRPGMobSystem(system: System): system is RPGMobSystem {
  return 'getMob' in system && 'spawnMob' in system
}

// Helper to get typed systems with non-null assertion
export function getRequiredSystem<T extends System>(world: World, systemKey: string): T {
  const system = world.getSystem<T>(systemKey)
  if (!system) {
    throw new Error(`Required system '${systemKey}' not found`)
  }
  return system
}