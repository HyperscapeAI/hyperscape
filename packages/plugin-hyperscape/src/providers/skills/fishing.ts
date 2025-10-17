/**
 * CLAUDE.md Compliance: Strong typing enforced
 * - ✅ No `any` types - uses ResourceSystem and ResourceItem interfaces
 * - ✅ Type-safe resource filtering and distance calculations
 * - ✅ Explicit function parameter types
 * - ✅ Non-null assertions where context guarantees non-null
 */
import type {
  IAgentRuntime,
  Memory,
  Provider,
  State,
} from '@elizaos/core'
import { HyperscapeService } from '../../service'
import type {
  ResourceSystem,
  ResourceItem,
  ResourceSpotWithState,
  PlayerData,
  InventoryItem,
} from '../../types/resource-types'
import type { Vector3 } from 'three'

export const fishingSkillProvider: Provider = {
  name: 'FISHING_INFO',
  description: 'Provides fishing skill level, nearby fishing spots with availability status, fishing tool availability, and fishing tips. Enhanced with real-time spot state tracking.',
  dynamic: true, // Only loaded when explicitly requested by fishing actions
  position: 2, // Contextual skills come after world state, before actions
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    const service: HyperscapeService | null = runtime.getService<HyperscapeService>(HyperscapeService.serviceName)

    if (!service || !service.isConnected()) {
      return {
        text: '# Fishing Skill\nStatus: Not connected to world',
        values: {
          fishing_available: false,
        },
        data: {},
      }
    }

    const world = service.getWorld()
    const player = world?.entities?.player
    const playerData: Partial<PlayerData> = (player?.data || {}) as Partial<PlayerData>

    // Get fishing skill info
    const fishingSkill = playerData.skills?.fishing
    const fishingLevel: number = fishingSkill?.level ?? 1
    const fishingXP: number = fishingSkill?.xp ?? 0

    // Check for fishing tools in inventory
    const inventory: InventoryItem[] = playerData.inventory?.items ?? []
    const hasFishingRod: boolean = inventory.some((item: InventoryItem) =>
      item.itemId.includes('fishing_rod') ||
      item.itemId.includes('rod')
    )
    const hasNet: boolean = inventory.some((item: InventoryItem) =>
      item.itemId.includes('net')
    )
    const fishingToolItem: InventoryItem | undefined = inventory.find((item: InventoryItem) =>
      item.itemId.includes('fishing_rod') ||
      item.itemId.includes('rod') ||
      item.itemId.includes('net')
    )
    const fishingTool: string = fishingToolItem?.itemId ?? 'none'

    // Get resource event handler for real-time fishing spot state
    const resourceEventHandler = service.getResourceEventHandler()

    // Get nearby fishing spots
    const systems: Record<string, unknown> = (world?.systems ?? {}) as Record<string, unknown>
    const resourceSystem: ResourceSystem | null = (systems.resource ?? null) as ResourceSystem | null
    const allResources: ResourceItem[] = resourceSystem?.getAllResources() ?? []
    const playerPos: Vector3 | undefined = player?.position

    // Filter fishing spots and enrich with state from event handler
    const nearbySpotsWithState: ResourceSpotWithState[] = allResources
      .filter((resource: ResourceItem): boolean => {
        if (!resource.type.startsWith('fishing_')) return false
        if (!playerPos || !resource.position) return false

        const dx: number = resource.position.x - playerPos.x
        const dz: number = resource.position.z - playerPos.z
        const distance: number = Math.sqrt(dx * dx + dz * dz)
        return distance <= 15 // Within 15 units
      })
      .map((spot: ResourceItem): ResourceSpotWithState => {
        const dx: number = spot.position.x - playerPos!.x
        const dz: number = spot.position.z - playerPos!.z
        const distance: number = Math.sqrt(dx * dx + dz * dz)

        // Get state from resource event handler
        const spotState = resourceEventHandler?.getResourceById(spot.id)

        return {
          ...spot,
          distance,
          state: spotState?.state ?? 'available',
          depletedAt: spotState?.depletedAt,
          respawnAt: spotState?.respawnAt,
          gatheringStartedAt: spotState?.gatheringStartedAt,
        }
      })
      .sort((a: ResourceSpotWithState, b: ResourceSpotWithState) => a.distance - b.distance)

    // Categorize spots by state
    const availableSpots: ResourceSpotWithState[] = nearbySpotsWithState.filter((s: ResourceSpotWithState) => s.state === 'available')
    const depletedSpots: ResourceSpotWithState[] = nearbySpotsWithState.filter((s: ResourceSpotWithState) => s.state === 'depleted')
    const beingFishedSpots: ResourceSpotWithState[] = nearbySpotsWithState.filter((s: ResourceSpotWithState) => s.state === 'gathering')

    // Format spot lists
    const availableSpotList: string = availableSpots.map((spot: ResourceSpotWithState) =>
      `- ${spot.type} (${spot.distance.toFixed(1)}m away) - Ready to fish`
    ).join('\n')

    const depletedSpotList: string = depletedSpots.map((spot: ResourceSpotWithState) => {
      const respawnIn: number | null = spot.respawnAt ? Math.max(0, Math.floor((spot.respawnAt - Date.now()) / 1000)) : null
      const respawnText: string = respawnIn !== null ? ` - Respawn in ${respawnIn}s` : ' - Respawn time unknown'
      return `- ${spot.type} (${spot.distance.toFixed(1)}m away)${respawnText}`
    }).join('\n')

    const beingFishedList: string = beingFishedSpots.map((spot: ResourceSpotWithState) =>
      `- ${spot.type} (${spot.distance.toFixed(1)}m away) - Being fished by someone else`
    ).join('\n')

    // Build comprehensive status text
    const statusText: string = `# Fishing Skill

## Current Status
- Level: ${fishingLevel}
- XP: ${fishingXP}
- Has Fishing Tool: ${hasFishingRod || hasNet ? `Yes (${fishingTool})` : 'No'}

## Nearby Fishing Spots Summary
- Available: ${availableSpots.length}
- Depleted: ${depletedSpots.length}
- Being fished: ${beingFishedSpots.length}
- Total: ${nearbySpotsWithState.length}

${availableSpots.length > 0 ? `## Available Fishing Spots\n${availableSpotList}` : ''}

${depletedSpots.length > 0 ? `\n## Depleted Spots (Will Respawn)\n${depletedSpotList}` : ''}

${beingFishedSpots.length > 0 ? `\n## Spots Being Fished\n${beingFishedList}` : ''}

${nearbySpotsWithState.length === 0 ? '\n⚠️ No fishing spots nearby. Walk to find water or fishing areas.' : ''}

## Fishing Tips
- Walk near available fishing spots and use CATCH_FISH action
- Fishing rods work on most water
- Small net for shrimp
- Avoid depleted spots - wait for respawn or find others
- Raw fish can be cooked for food`

    return {
      text: statusText,
      values: {
        fishing_level: fishingLevel,
        fishing_xp: fishingXP,
        has_fishing_tool: hasFishingRod || hasNet,
        fishing_tool: fishingTool,
        nearby_fishing_spots_count: nearbySpotsWithState.length,
        available_spots_count: availableSpots.length,
        depleted_spots_count: depletedSpots.length,
        fishing_available: availableSpots.length > 0,
      },
      data: {
        skill: fishingSkill,
        nearbyFishingSpots: nearbySpotsWithState,
        availableSpots,
        depletedSpots,
        beingFishedSpots,
      },
    }
  },
}
