/**
 * CLAUDE.md Compliance: Strong typing enforced
 * - ✅ No `any` types - uses ResourceSystem and ResourceItem interfaces
 * - ✅ Type-safe resource filtering and distance calculations
 */
import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
} from '@elizaos/core'
import { HyperscapeService } from '../../service'
import type { ResourceSystem, ResourceItem } from '../../types/resource-types'

export const woodcuttingSkillProvider: Provider = {
  name: 'WOODCUTTING_INFO',
  description: 'Provides woodcutting skill level, nearby trees with availability status, axe availability, and woodcutting tips. Enhanced with real-time tree state tracking.',
  dynamic: true, // Only loaded when explicitly requested by woodcutting actions
  position: 2, // Contextual skills come after world state, before actions
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    const service = runtime.getService<HyperscapeService>(HyperscapeService.serviceName)

    if (!service || !service.isConnected()) {
      return {
        text: '# Woodcutting Skill\nStatus: Not connected to world',
        values: {
          woodcutting_available: false,
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

    // Get woodcutting skill info
    const woodcuttingSkill = playerData?.skills?.woodcutting
    const woodcuttingLevel = woodcuttingSkill?.level ?? 1
    const woodcuttingXP = woodcuttingSkill?.xp ?? 0

    // Check for axe in inventory
    const inventory = playerData?.inventory?.items || []
    const hasAxe = inventory.some(item =>
      item.itemId?.includes('hatchet') ||
      item.itemId?.includes('axe')
    )
    const axeType = inventory.find(item =>
      item.itemId?.includes('hatchet') ||
      item.itemId?.includes('axe')
    )?.itemId || 'none'

    // Get resource event handler for real-time tree state
    const resourceEventHandler = service.getResourceEventHandler()

    // Get nearby trees
    const systems = world?.systems as Record<string, unknown> | undefined
    const resourceSystem = systems?.['resource'] as ResourceSystem | undefined
    const allResources: ResourceItem[] = resourceSystem?.getAllResources ? resourceSystem.getAllResources() : []
    const playerPos = player?.position

    // Filter trees and enrich with state from event handler
    const nearbyTreesWithState = allResources
      .filter((resource: ResourceItem) => {
        if (!resource.type?.startsWith('tree_')) return false
        if (!playerPos || !resource.position) return false

        const dx = resource.position.x - playerPos.x
        const dz = resource.position.z - playerPos.z
        const distance = Math.sqrt(dx * dx + dz * dz)
        return distance <= 15 // Within 15 units
      })
      .map((tree: ResourceItem) => {
        const dx = tree.position.x - playerPos!.x
        const dz = tree.position.z - playerPos!.z
        const distance = Math.sqrt(dx * dx + dz * dz)

        // Get state from resource event handler
        const treeState = resourceEventHandler?.getResourceById(tree.id)

        return {
          ...tree,
          distance,
          state: treeState?.state || 'available',
          depletedAt: treeState?.depletedAt,
          respawnAt: treeState?.respawnAt,
          gatheringStartedAt: treeState?.gatheringStartedAt,
        }
      })
      .sort((a, b) => a.distance - b.distance) // Sort by distance

    // Categorize trees by state
    const availableTrees = nearbyTreesWithState.filter(t => t.state === 'available')
    const depletedTrees = nearbyTreesWithState.filter(t => t.state === 'depleted')
    const beingChoppedTrees = nearbyTreesWithState.filter(t => t.state === 'gathering')

    // Format tree lists
    const availableTreeList = availableTrees.map(tree =>
      `- ${tree.type} (${tree.distance.toFixed(1)}m away) - Ready to chop`
    ).join('\n')

    const depletedTreeList = depletedTrees.map(tree => {
      const respawnIn = tree.respawnAt ? Math.max(0, Math.floor((tree.respawnAt - Date.now()) / 1000)) : null
      const respawnText = respawnIn !== null ? ` - Respawn in ${respawnIn}s` : ' - Respawn time unknown'
      return `- ${tree.type} (${tree.distance.toFixed(1)}m away)${respawnText}`
    }).join('\n')

    const beingChoppedList = beingChoppedTrees.map(tree =>
      `- ${tree.type} (${tree.distance.toFixed(1)}m away) - Being chopped by someone else`
    ).join('\n')

    // Build comprehensive status text
    const statusText = `# Woodcutting Skill

## Current Status
- Level: ${woodcuttingLevel}
- XP: ${woodcuttingXP}
- Has Axe: ${hasAxe ? `Yes (${axeType})` : 'No'}

## Nearby Trees Summary
- Available: ${availableTrees.length}
- Depleted: ${depletedTrees.length}
- Being chopped: ${beingChoppedTrees.length}
- Total: ${nearbyTreesWithState.length}

${availableTrees.length > 0 ? `## Available Trees\n${availableTreeList}` : ''}

${depletedTrees.length > 0 ? `\n## Depleted Trees (Will Respawn)\n${depletedTreeList}` : ''}

${beingChoppedTrees.length > 0 ? `\n## Trees Being Chopped\n${beingChoppedList}` : ''}

${nearbyTreesWithState.length === 0 ? '\n⚠️ No trees nearby. Walk around to find trees.' : ''}

## Woodcutting Tips
- Walk near available trees and use CHOP_TREE action
- Higher level trees give more XP
- Axes chop faster than bare hands
- Avoid depleted trees - wait for respawn or find others
- Logs can be used for firemaking`

    return {
      text: statusText,
      values: {
        woodcutting_level: woodcuttingLevel,
        woodcutting_xp: woodcuttingXP,
        has_axe: hasAxe,
        axe_type: axeType,
        nearby_trees_count: nearbyTreesWithState.length,
        available_trees_count: availableTrees.length,
        depleted_trees_count: depletedTrees.length,
        woodcutting_available: availableTrees.length > 0,
      },
      data: {
        skill: woodcuttingSkill,
        nearbyTrees: nearbyTreesWithState,
        availableTrees,
        depletedTrees,
        beingChoppedTrees,
      },
    }
  },
}
