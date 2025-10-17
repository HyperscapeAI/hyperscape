import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
} from '@elizaos/core'
import { HyperscapeService } from '../../service'

/**
 * CLAUDE.md Compliance: Strong typing enforced
 * - ✅ No `any` types - uses PlayerEventHandler integration
 * - ✅ Type-safe inventory tracking and efficiency calculation
 * - ✅ Enhanced with real-time cooking efficiency metrics
 */
export const cookingSkillProvider: Provider = {
  name: 'COOKING_INFO',
  description: 'Provides cooking skill level, nearby fires, raw food availability, and cooking efficiency tracking',
  dynamic: true, // Only loaded when explicitly requested by cooking actions
  position: 2, // Contextual skills come after world state, before actions
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<ProviderResult> => {
    const service = runtime.getService<HyperscapeService>(HyperscapeService.serviceName)

    if (!service || !service.isConnected()) {
      return {
        text: '# Cooking Skill\nStatus: Not connected to world',
        values: {
          cooking_available: false,
        },
        data: {},
      }
    }

    const world = service.getWorld()
    const player = world?.entities?.player
    const playerData = player?.data as {
      skills?: Record<string, {level: number, xp: number}>,
      inventory?: { items?: Array<{ itemId: string, quantity: number }> }
    } | undefined

    // Get player event handler for efficiency tracking
    const playerEventHandler = service.getPlayerEventHandler()

    // Get cooking skill info
    const cookingSkill = playerData?.skills?.cooking
    const cookingLevel = cookingSkill?.level ?? 1
    const cookingXP = cookingSkill?.xp ?? 0

    // Check for raw food in inventory
    const inventory = playerData?.inventory?.items || []
    const rawFood = inventory.filter(item =>
      item.itemId?.includes('raw_')
    )
    const hasRawFood = rawFood.length > 0
    const rawFoodList = rawFood.map(item =>
      `${item.itemId} (${item.quantity})`
    ).join(', ')

    // Check for cooked food in inventory
    const cookedFood = inventory.filter(item =>
      item.itemId?.includes('cooked_') ||
      (item.itemId?.includes('fish') && !item.itemId?.includes('raw_'))
    )
    const totalCookedCount = cookedFood.reduce((sum, item) => sum + item.quantity, 0)

    // Get cached inventory for cooking efficiency tracking
    const playerId = player?.data?.id as string | undefined
    const cachedInventory = playerId && playerEventHandler ? playerEventHandler.getInventory(playerId) : []

    let efficiencyText = ""
    if (cachedInventory.length > 0) {
      const previousRawCount = cachedInventory
        .filter(item => item.itemId.includes('raw_'))
        .reduce((sum, item) => sum + item.quantity, 0)
      const currentRawCount = rawFood.reduce((sum, item) => sum + item.quantity, 0)

      if (previousRawCount > currentRawCount) {
        const cooked = previousRawCount - currentRawCount
        efficiencyText = `\n\n📊 Recent Cooking: ${cooked} raw food processed`
      }
    }

    // Find nearby fires
    const entities = world?.entities?.items
    const playerPos = player?.position
    const nearbyFires: Array<{ id: string, name: string, distance: number }> = []

    if (entities && playerPos) {
      for (const [id, entity] of entities.entries()) {
        const entityType = entity?.type as string
        const entityName = entity?.name || 'Unnamed'

        if (entityType?.includes('fire') || entityName?.toLowerCase().includes('fire')) {
          const entityPos = entity?.position
          if (entityPos) {
            const dx = entityPos.x - playerPos.x
            const dz = entityPos.z - playerPos.z
            const distance = Math.sqrt(dx * dx + dz * dz)

            if (distance <= 15) {
              nearbyFires.push({ id, name: entityName, distance })
            }
          }
        }
      }
    }

    const fireList = nearbyFires.map(fire =>
      `- ${fire.name} (${fire.distance.toFixed(1)}m away)`
    ).join('\n')

    const text = `# Cooking Skill

## Current Status
- Level: ${cookingLevel}
- XP: ${cookingXP}
- Has Raw Food: ${hasRawFood ? `Yes (${rawFoodList})` : 'No'}
- Cooked Food: ${totalCookedCount} items${efficiencyText}

## Nearby Fires (${nearbyFires.length})
${nearbyFires.length > 0 ? fireList : 'No fires nearby'}

## Cooking Tips
- Use COOK_FOOD action when near a fire with raw food
- Cooked food heals more than raw food
- Higher level cooking reduces burn chance
- Fish from fishing or meat from combat`

    return {
      text,
      values: {
        cooking_level: cookingLevel,
        cooking_xp: cookingXP,
        has_raw_food: hasRawFood,
        raw_food_types: rawFood.length,
        nearby_fires_count: nearbyFires.length,
        cooked_food_count: totalCookedCount,
        cooking_available: hasRawFood && nearbyFires.length > 0,
      },
      data: {
        skill: cookingSkill,
        rawFood,
        cookedFood,
        nearbyFires,
      },
    }
  },
}
