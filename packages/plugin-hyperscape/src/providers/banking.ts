import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
} from '@elizaos/core'
import { HyperscapeService } from '../service'

/**
 * CLAUDE.md Compliance: Strong typing enforced
 * - ✅ No `any` types - uses PlayerEventHandler integration
 * - ✅ Type-safe inventory pattern analysis
 * - ✅ Enhanced with banking efficiency recommendations
 */
export const bankingProvider: Provider = {
  name: 'BANKING_INFO',
  description: 'Provides nearby bank locations, inventory status, banking availability, and banking pattern analysis',
  dynamic: true, // Only loaded when explicitly requested by banking actions
  position: 2, // Contextual skills come after world state, before actions
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<ProviderResult> => {
    const service = runtime.getService<HyperscapeService>(HyperscapeService.serviceName)

    if (!service || !service.isConnected()) {
      return {
        text: '# Banking\nStatus: Not connected to world',
        values: {
          banking_available: false,
        },
        data: {},
      }
    }

    const world = service.getWorld()
    const player = world?.entities?.player
    const playerData = player?.data as {
      inventory?: { items?: Array<{ itemId: string, quantity: number }>, maxSlots?: number }
    } | undefined

    // Get player event handler for banking pattern analysis
    const playerEventHandler = service.getPlayerEventHandler()

    // Get inventory status
    const inventory = playerData?.inventory?.items || []
    const maxSlots = playerData?.inventory?.maxSlots || 28
    const usedSlots = inventory.length
    const freeSlots = maxSlots - usedSlots
    const capacityPercent = Math.round((usedSlots / maxSlots) * 100)

    // Get cached inventory for pattern analysis
    const playerId = player?.data?.id as string | undefined
    const cachedInventory = playerId && playerEventHandler ? playerEventHandler.getInventory(playerId) : []

    // Find nearby banks
    const entities = world?.entities?.items
    const playerPos = player?.position
    const nearbyBanks: Array<{ id: string, name: string, distance: number }> = []

    if (entities && playerPos) {
      for (const [id, entity] of entities.entries()) {
        const entityType = entity?.type as string
        const entityName = entity?.name || 'Unnamed'

        if (
          entityType?.includes('bank') ||
          entityName?.toLowerCase().includes('bank') ||
          entityName?.toLowerCase().includes('banker')
        ) {
          const entityPos = entity?.position
          if (entityPos) {
            const dx = entityPos.x - playerPos.x
            const dz = entityPos.z - playerPos.z
            const distance = Math.sqrt(dx * dx + dz * dz)

            if (distance <= 15) {
              nearbyBanks.push({ id, name: entityName, distance })
            }
          }
        }
      }
    }

    // Analyze banking patterns
    let bankingRecommendation = ""
    if (cachedInventory.length > 0) {
      const currentItemCount = inventory.reduce((sum, item) => sum + item.quantity, 0)
      const previousItemCount = cachedInventory.reduce((sum, item) => sum + item.quantity, 0)

      if (currentItemCount < previousItemCount && usedSlots < cachedInventory.length) {
        const itemsDeposited = previousItemCount - currentItemCount
        bankingRecommendation = `\n\n✅ Recent Banking: Deposited items (${itemsDeposited} total count)`
      }
    }

    // Determine if banking is recommended
    let bankingAdvice = ""
    if (capacityPercent >= 90 && nearbyBanks.length > 0) {
      bankingAdvice = "\n\n💼 RECOMMENDATION: Inventory nearly full. Consider banking now."
    } else if (capacityPercent >= 70 && nearbyBanks.length > 0) {
      bankingAdvice = "\n\n💡 TIP: Inventory getting full. Bank nearby if needed."
    }

    const bankList = nearbyBanks.map(bank =>
      `- ${bank.name} (${bank.distance.toFixed(1)}m away)`
    ).join('\n')

    const inventoryList = inventory.slice(0, 10).map(item =>
      `- ${item.itemId} x${item.quantity}`
    ).join('\n')

    const text = `# Banking

## Inventory Status
- Used Slots: ${usedSlots}/${maxSlots} (${capacityPercent}%)
- Free Slots: ${freeSlots}${bankingRecommendation}${bankingAdvice}

## Current Inventory (showing first 10)
${inventory.length > 0 ? inventoryList : 'Inventory is empty'}
${inventory.length > 10 ? `... and ${inventory.length - 10} more items` : ''}

## Nearby Banks (${nearbyBanks.length})
${nearbyBanks.length > 0 ? bankList : 'No banks nearby'}

## Banking Tips
- Use BANK_ITEMS action when near a bank
- Banks are located in towns
- Each town has its own bank storage
- Unlimited bank storage per town`

    return {
      text,
      values: {
        inventory_slots_used: usedSlots,
        inventory_slots_free: freeSlots,
        inventory_slots_total: maxSlots,
        capacity_percent: capacityPercent,
        nearby_banks_count: nearbyBanks.length,
        banking_available: nearbyBanks.length > 0,
        banking_recommended: capacityPercent >= 70 && nearbyBanks.length > 0,
      },
      data: {
        inventory,
        nearbyBanks,
        capacityPercent,
      },
    }
  },
}
