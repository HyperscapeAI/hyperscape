import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
  composePromptFromState,
  parseKeyValueXml,
  ModelType,
} from '@elizaos/core'
import { HyperscapeService } from '../service'

/**
 * Type guard for player inventory data
 */
interface PlayerInventoryData {
  inventory?: {
    items?: Array<{ itemId: string; quantity: number }>
    maxSlots?: number
  }
  position?: { x: number; y: number; z: number }
}

function isPlayerInventoryData(data: unknown): data is PlayerInventoryData {
  if (!data || typeof data !== 'object') {
    return false
  }

  const obj = data as Record<string, unknown>

  // Check optional inventory field
  if (obj.inventory !== undefined) {
    if (typeof obj.inventory !== 'object' || obj.inventory === null) {
      return false
    }
    const inv = obj.inventory as Record<string, unknown>

    // Check optional items array
    if (inv.items !== undefined && !Array.isArray(inv.items)) {
      return false
    }

    // Check optional maxSlots number
    if (inv.maxSlots !== undefined && typeof inv.maxSlots !== 'number') {
      return false
    }
  }

  // Check optional position field
  if (obj.position !== undefined) {
    if (typeof obj.position !== 'object' || obj.position === null) {
      return false
    }
    const pos = obj.position as Record<string, unknown>
    if (
      (pos.x !== undefined && typeof pos.x !== 'number') ||
      (pos.y !== undefined && typeof pos.y !== 'number') ||
      (pos.z !== undefined && typeof pos.z !== 'number')
    ) {
      return false
    }
  }

  return true
}

/**
 * Generic helper to safely extract and validate metadata from Memory objects
 */
function getActionMetadata<T extends Record<string, unknown>>(
  memory: Memory,
  expectedKeys: (keyof T)[]
): Partial<T> | undefined {
  if (!memory.metadata || typeof memory.metadata !== 'object') {
    return undefined
  }

  const result: Partial<T> = {}
  for (const key of expectedKeys) {
    const value = (memory.metadata as Record<string, unknown>)[key as string]
    if (value !== undefined) {
      result[key] = value as T[keyof T]
    }
  }

  return result
}

/**
 * Template for evaluating resource management efficiency
 */
const resourceEvaluationTemplate = `# Task: Evaluate resource management efficiency

Analyze the agent's inventory management and banking behavior to identify inefficiencies.

Recent gathering actions:
{{recentGatheringActions}}

Current inventory status:
{{inventoryStatus}}

Banking history:
{{bankingHistory}}

Analyze:
1. Is the agent banking efficiently? (full inventory vs banking too early)
2. Are there wasted gathering attempts with full inventory?
3. Is the banking distance reasonable for the items deposited?
4. What patterns suggest inefficiency?

Output format (XML):
<resource_analysis>
  <inventory_efficiency>0-100</inventory_efficiency>
  <banking_efficiency>0-100</banking_efficiency>
  <wasted_actions>number of wasted gathering attempts</wasted_actions>
  <issues>List of efficiency issues detected</issues>
  <recommendations>Suggestions for improvement</recommendations>
</resource_analysis>`

/**
 * Resource Management Evaluator - Monitors inventory and banking efficiency
 *
 * This evaluator analyzes resource management patterns to detect:
 * - Inventory fullness when gathering resources
 * - Banking efficiency (distance vs items deposited)
 * - Banking frequency patterns
 * - Wasted actions (gathering with full inventory)
 * - Resource optimization opportunities
 *
 * Helps improve agent resource management by identifying inefficiencies
 * and providing actionable recommendations.
 */
export const resourceManagementEvaluator: Evaluator = {
  name: 'RESOURCE_EFFICIENCY_MONITOR',
  similes: ['INVENTORY_TRACKER', 'BANKING_OPTIMIZER', 'RESOURCE_ANALYZER'],
  description:
    'Tracks inventory management, banking efficiency, and resource gathering patterns. Helps optimize resource collection and banking behavior.',

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    // Only evaluate if there's actual content
    if (!message.content || typeof message.content !== 'object') {
      return false
    }

    const content = message.content as Record<string, unknown>

    // Extract and validate contentAction
    const contentAction = content.action
    const contentText = content.text

    // Run when inventory or banking actions occur
    const isRelevant =
      (typeof contentAction === 'string' &&
        (contentAction.includes('bank') ||
          contentAction.includes('chop') ||
          contentAction.includes('fish') ||
          contentAction.includes('cook') ||
          contentAction.includes('mine'))) ||
      (typeof contentText === 'string' &&
        (contentText.toLowerCase().includes('inventory') ||
          contentText.toLowerCase().includes('bank')))

    return isRelevant
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    logger.info('[RESOURCE_EVALUATOR] Analyzing resource management')

    try {
      const service = runtime.getService<HyperscapeService>('hyperscape')
      const world = service?.getWorld()
      const player = world?.entities?.player

      // Validate player.data structure with runtime type guard
      let inventory: Array<{ itemId: string; quantity: number }> = []
      let maxSlots = 28
      let usedSlots = 0
      let freeSlots = 28
      let inventoryFullness = 0

      if (player?.data && isPlayerInventoryData(player.data)) {
        const playerData = player.data
        // 1. Get current inventory state
        inventory = playerData.inventory?.items || []
        maxSlots = playerData.inventory?.maxSlots || 28
        usedSlots = inventory.length
        freeSlots = maxSlots - usedSlots
        inventoryFullness = (usedSlots / maxSlots) * 100
      } else {
        logger.debug('[RESOURCE_EVALUATOR] Player data not available or invalid structure, using defaults')
      }

      // 2. Get recent banking events from memory
      const bankingHistory = await runtime.getMemories({
        roomId: message.roomId,
        count: 10,
        unique: false,
        tableName: 'memories', // Use default memories table
      })

      const bankingEvents = bankingHistory.filter(m => {
        const content = m.content as { action?: string; text?: string }
        return (
          content.action?.includes('bank') ||
          content.text?.toLowerCase().includes('deposited') ||
          content.text?.toLowerCase().includes('banking')
        )
      })

      // 3. Get recent gathering actions
      const recentActions = await runtime.getMemories({
        roomId: message.roomId,
        count: 20,
        unique: false,
        tableName: 'memories',
      })

      const gatheringActions = recentActions.filter(a => {
        const content = a.content as { action?: string; text?: string }
        return ['chop', 'fish', 'cook', 'mine'].some(type =>
          content.action?.toLowerCase().includes(type) ||
          content.text?.toLowerCase().includes(type)
        )
      })

      // 4. Detect wasted actions (gathering with full inventory)
      let wastedActions = 0
      for (const action of gatheringActions) {
        const metadata = getActionMetadata<{ inventoryFullness: number }>(action, ['inventoryFullness'])
        if (metadata && metadata.inventoryFullness !== undefined && metadata.inventoryFullness >= 90) {
          wastedActions++
        }
      }

      // 5. Analyze banking efficiency
      let totalBankingDistance = 0
      let totalItemsDeposited = 0
      for (const bank of bankingEvents) {
        const metadata = getActionMetadata<{ distance: number; itemsDeposited: number }>(
          bank,
          ['distance', 'itemsDeposited']
        )
        const distance = metadata?.distance ?? 0
        const itemCount = metadata?.itemsDeposited ?? 0
        totalBankingDistance += distance
        totalItemsDeposited += itemCount
      }
      const avgDistancePerItem = totalItemsDeposited > 0
        ? totalBankingDistance / totalItemsDeposited
        : 0

      // 6. Compose state for LLM analysis
      const evaluationState = state || await runtime.composeState(message, [
        'RECENT_MESSAGES',
      ])

      // Add resource management data to state
      const stateData = evaluationState.data || {}
      Object.assign(stateData, {
        inventoryStatus: `${usedSlots}/${maxSlots} slots (${inventoryFullness.toFixed(1)}% full)`,
        bankingHistory: bankingEvents.map(b => {
          const content = b.content as { text?: string }
          return content.text || ''
        }).join('\n') || 'No recent banking activity',
        recentGatheringActions: gatheringActions.map(a => {
          const content = a.content as { text?: string }
          return content.text || ''
        }).join('\n') || 'No recent gathering actions',
      })
      evaluationState.data = stateData

      const prompt = composePromptFromState({
        state: evaluationState,
        template: resourceEvaluationTemplate,
      })

      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
      })

      const parsed = parseKeyValueXml(response)

      if (!parsed) {
        logger.debug('[RESOURCE_EVALUATOR] Could not parse resource analysis response')
        return
      }

      // 7. Calculate efficiency scores
      const inventoryEfficiency = typeof parsed.inventory_efficiency === 'number'
        ? parsed.inventory_efficiency
        : parseInt(String(parsed.inventory_efficiency || 50))
      const bankingEfficiency = typeof parsed.banking_efficiency === 'number'
        ? parsed.banking_efficiency
        : parseInt(String(parsed.banking_efficiency || 50))
      const wastedActionsFromLLM = typeof parsed.wasted_actions === 'number'
        ? parsed.wasted_actions
        : parseInt(String(parsed.wasted_actions || 0))
      const issues = String(parsed.issues || '')
      const recommendations = String(parsed.recommendations || '')

      // 8. Store resource management evaluation
      const resourceMemory: Memory = {
        id: crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        entityId: message.entityId,
        agentId: runtime.agentId,
        content: {
          text: `Resource efficiency: Inventory ${inventoryEfficiency}%, Banking ${bankingEfficiency}%`,
          source: 'resource_evaluation',
          inventoryFullness,
          inventoryEfficiency,
          bankingEfficiency,
          wastedActions: Math.max(wastedActions, wastedActionsFromLLM),
          avgDistancePerItem,
          issues,
          recommendations,
        },
        roomId: message.roomId,
        createdAt: Date.now(),
        metadata: {
          type: 'resource_management',
          usedSlots,
          freeSlots,
          evaluatedFrom: message.id,
        },
      }

      await runtime.createMemory(resourceMemory, 'resources')

      // 9. Log and emit events for inefficiencies
      if (inventoryEfficiency < 50 || bankingEfficiency < 50 || wastedActions > 2) {
        logger.warn(
          `[RESOURCE_EVALUATOR] Inefficiency detected: ${wastedActions} wasted actions, Inventory: ${inventoryEfficiency}%, Banking: ${bankingEfficiency}%`
        )
        logger.warn(`[RESOURCE_EVALUATOR] Issues: ${issues}`)
        logger.info(`[RESOURCE_EVALUATOR] Recommendations: ${recommendations}`)

        // Emit event for other systems to react
        try {
          await runtime.emitEvent('RESOURCE_INEFFICIENCY', {
            runtime,
            roomId: message.roomId,
            inventoryEfficiency,
            bankingEfficiency,
            wastedActions,
            recommendations,
          })
        } catch (emitError) {
          // Event emission is optional, don't fail if it errors
          logger.debug('[RESOURCE_EVALUATOR] Could not emit resource inefficiency event')
        }
      } else if (inventoryEfficiency > 80 && bankingEfficiency > 80) {
        logger.info(
          `[RESOURCE_EVALUATOR] High efficiency: Inventory ${inventoryEfficiency}%, Banking ${bankingEfficiency}%`
        )
      } else {
        logger.debug(
          `[RESOURCE_EVALUATOR] Resource efficiency: Inventory ${inventoryEfficiency}%, Banking ${bankingEfficiency}%`
        )
      }

      logger.info('[RESOURCE_EVALUATOR] Analysis complete')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('[RESOURCE_EVALUATOR] Error evaluating resources:', errorMsg)
    }
  },

  examples: [],
}
