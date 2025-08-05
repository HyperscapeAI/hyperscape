/**
 * RPG Plugin - Registers all RPG systems with Hyperscape worlds
 * This replaces the World class with a plugin-based approach
 */

import type { World } from '../core/World'
import { registerComponent } from '../core/components/index'
import { CombatComponent } from './components/CombatComponent'
import { VisualComponent } from './components/VisualComponent'
import {
  RPGBankingSystem,
  RPGCombatSystem,
  // RPGDatabaseSystem is imported dynamically on server only
  RPGEntityManager,
  RPGEquipmentSystem,
  RPGInteractionSystem,
  RPGInventorySystem,
  RPGMobAISystem,
  RPGMobSystem,
  RPGMovementSystem,
  RPGNPCSystem,
  RPGPersistenceSystem,
  RPGPlayerSystem,
  RPGResourceSystem,
  RPGSkillsSystem,
  RPGUISystem,
  RPGWorldGenerationSystem
} from './systems'
import type { RPGItem } from './types/core'
import { RPGLogger } from './utils/RPGLogger'

export { World } from '../core/World'

/**
 * Register RPG systems with a world instance
 * This should be called by the RPG plugin during initialization
 */
export function registerRPGSystems(world: World): void {
  world.register('rpg-entity-manager', RPGEntityManager)
  world.register('rpg-player', RPGPlayerSystem)
  world.register('rpg-mob', RPGMobSystem)
  // RPGDatabaseSystem is registered dynamically on server only in RPGSystemLoader
  world.register('rpg-world-generation', RPGWorldGenerationSystem)
  world.register('rpg-combat', RPGCombatSystem)
  world.register('rpg-ui', RPGUISystem)
  world.register('rpg-inventory', RPGInventorySystem)
  world.register('rpg-equipment', RPGEquipmentSystem)
  world.register('rpg-interaction', RPGInteractionSystem)
  world.register('rpg-skills', RPGSkillsSystem)
  world.register('rpg-persistence', RPGPersistenceSystem)
  world.register('rpg-movement', RPGMovementSystem)
  world.register('rpg-npc-ai', RPGMobAISystem)
  // Quest system not implemented - not in current GDD scope
  world.register('rpg-bank', RPGBankingSystem)
  world.register('rpg-resource', RPGResourceSystem)
  world.register('rpg-npc', RPGNPCSystem)
} 

export interface RPGPluginConfig {
  // Plugin configuration options
  enableDatabase?: boolean
  enableCombat?: boolean
  enablePvP?: boolean
  autoSave?: boolean
  autoSaveInterval?: number
}

export const RPGPlugin = {
  name: 'rpg',
  version: '1.0.0',
  
  /**
   * Initialize the RPG plugin with a world instance
   */
  init: async (world: World, _config: RPGPluginConfig = {}) => {
    RPGLogger.system('RPG Plugin', 'Initializing RPG systems...')
    
    // Register RPG-specific components
    registerComponent('combat', CombatComponent as unknown as import('../core/components/index').ComponentConstructor)
    registerComponent('visual', VisualComponent as unknown as import('../core/components/index').ComponentConstructor)
    RPGLogger.system('RPG Plugin', 'Registered RPG components: combat, visual')
    
    // Register all RPG systems with the world
    registerRPGSystems(world)
    
    // Set up RPG API on the world for backward compatibility
    world.rpg = {
      systems: {},
      actions: {},
      getCombatLevel: (playerId: string) => {
        const playerSystem = world.getSystem<RPGPlayerSystem>('rpg-player')
        const skillsSystem = world.getSystem<RPGSkillsSystem>('rpg-skills')
        const player = playerSystem?.getPlayer(playerId)
        if (!player || !skillsSystem) return 1
        
        // Get player stats to calculate combat level
        const stats = player.skills || {}
        return skillsSystem.getCombatLevel(stats as import('./types/core').PlayerSkills) || 1
      },
      getPlayer: (playerId: string): { id: string; [key: string]: unknown } => {
        const playerSystem = world.getSystem<RPGPlayerSystem>('rpg-player')
        const player = playerSystem?.getPlayer(playerId)
        if (!player) return { id: playerId }
        
        // Return player data as generic object
        return {
          ...player,
          id: playerId
        }
      },
      getSkills: (playerId: string): Record<string, { level: number; xp: number }> => {
        const playerSystem = world.getSystem<RPGPlayerSystem>('rpg-player')
        const stats = playerSystem?.getPlayerStats(playerId)
        return (stats && typeof stats === 'object' && 'skills' in stats) 
          ? stats.skills as unknown as Record<string, { level: number; xp: number }> 
          : {}
      },
      getInventory: (playerId: string): Array<{ itemId: string; quantity: number; [key: string]: unknown }> => {
        const inventorySystem = world.getSystem<RPGInventorySystem>('rpg-inventory')
        const inventory = inventorySystem?.getInventory(playerId)
        const items = inventory?.items || []
        
        // Convert inventory items to expected format
        return items.map(item => {
          return {
            itemId: item.itemId,
            quantity: item.quantity,
            slot: item.slot,
            // Include any additional properties from the item data
            ...(item.item ? { name: item.item.name, stackable: item.item.stackable } : {})
          };
        })
      },
      getEquipment: (playerId: string): Record<string, { itemId: string; [key: string]: unknown }> => {
        const equipmentSystem = world.getSystem<RPGEquipmentSystem>('rpg-equipment')
        const equipment = equipmentSystem?.getEquipmentData(playerId) || {}
        
        // Convert equipment to expected format
        const result: Record<string, { itemId: string; [key: string]: unknown }> = {}
        for (const [slot, item] of Object.entries(equipment)) {
          if (item) {
            const rpgItem = item as RPGItem;
            result[slot] = {
              itemId: rpgItem.id || '',
              ...rpgItem
            }
          }
        }
        return result
      },
      getPlayerHealth: (playerId: string): { current: number; max: number } => {
        const playerSystem = world.getSystem<RPGPlayerSystem>('rpg-player')
        const health = playerSystem?.getPlayerHealth(playerId)
        
        // Return default health if not found
        if (!health) {
          return { current: 100, max: 100 }
        }
        
        // Convert to expected format
        return {
          current: health.health || 100,
          max: health.maxHealth || 100
        }
      },
      getPlayerStamina: (_playerId: string): { current: number; max: number } => {
        // Stamina system not implemented yet, return default values
        return { current: 100, max: 100 }
      }
    }
    
    RPGLogger.system('RPG Plugin', 'All RPG systems registered successfully')
  },
  
  /**
   * Cleanup the RPG plugin
   */
  destroy: async (world: World) => {
    RPGLogger.system('RPG Plugin', 'Cleaning up RPG systems...')
    
    // Remove RPG API
    if (world.rpg) {
      delete world.rpg
    }
    
    RPGLogger.system('RPG Plugin', 'RPG plugin cleanup complete')
  }
}

export default RPGPlugin