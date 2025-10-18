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
 * Mapping of action keywords to skill names
 */
const ACTION_TO_SKILL_MAP: Record<string, string> = {
  CHOP: 'woodcutting',
  FISH: 'fishing',
  COOK: 'cooking',
  FIRE: 'firemaking',
  LIGHT: 'firemaking',
}

/**
 * Player skills data structure
 */
interface PlayerSkillsData {
  skills?: Record<string, { level: number; experience: number }>
}

/**
 * Template for analyzing skill training efficiency
 */
const skillProgressionTemplate = `# Task: Analyze skill training efficiency

Review the skill training session and identify efficiency patterns.

Skill training data:
{{skillData}}

Recent skill actions:
{{recentActions}}

Session metrics:
{{sessionMetrics}}

Analyze:
1. What is the XP gain rate compared to optimal rates?
2. What is the success rate for skill actions?
3. Are there patterns of inefficiency or failure?
4. What could improve training effectiveness?
5. Is the player using optimal methods for this skill level?

Output format (XML):
<skill_analysis>
  <skill_name>woodcutting|fishing|cooking|firemaking</skill_name>
  <xp_rate>estimated XP per hour (number)</xp_rate>
  <success_rate>0-100 percentage</success_rate>
  <efficiency_score>0-100 compared to optimal</efficiency_score>
  <issues>Problems detected or "none"</issues>
  <recommendations>How to improve or "continue current approach"</recommendations>
</skill_analysis>`

/**
 * Skill Progression Evaluator - Tracks skill training efficiency and progress
 *
 * This evaluator monitors skill training to detect:
 * - XP gain rates (XP per hour)
 * - Success rates for skill actions
 * - Level progression and level ups
 * - Training efficiency patterns
 * - Optimization opportunities
 *
 * Helps optimize skill training by identifying inefficiencies and
 * providing recommendations for improvement.
 */
export const skillProgressionEvaluator: Evaluator = {
  name: 'SKILL_PROGRESSION_TRACKER',
  similes: ['SKILL_ANALYZER', 'XP_TRACKER', 'TRAINING_MONITOR', 'SKILL_EFFICIENCY'],
  description:
    'Tracks skill training efficiency, XP rates, and level progression across all RPG skills',

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    // Only evaluate if there's skill-related content
    const content = message.content

    // Guard: ensure content is a non-null object
    if (!content || typeof content !== 'object') {
      return false
    }

    // Safely narrow action type
    const action = typeof content.action === 'string' ? content.action : undefined

    // Check xpGained with type safety
    const hasXpGained = typeof content.xpGained === 'number'

    // Check levelUp with type safety
    const hasLevelUp = content.levelUp === true

    // Check for skill actions
    const isSkillAction =
      action?.includes('CHOP') ||
      action?.includes('FISH') ||
      action?.includes('COOK') ||
      action?.includes('FIRE') ||
      action?.includes('LIGHT') ||
      hasXpGained ||
      hasLevelUp

    return isSkillAction
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    logger.info('[SKILL_EVALUATOR] Analyzing skill progression')

    try {
      const service = runtime.getService<HyperscapeService>(HyperscapeService.serviceName)

      if (!service || !service.isConnected()) {
        logger.warn('[SKILL_EVALUATOR] Not connected to Hyperscape service')
        return
      }

      const world = service.getWorld()
      const player = world?.entities?.player
      const playerData = player?.data as PlayerSkillsData | undefined

      // 1. Get current skills state
      const skills = playerData?.skills || {}

      // 2. Determine which skill this action relates to
      const actionContent = message.content
      const action = actionContent.action as string | undefined
      let skillName = 'unknown'

      // Use data-driven mapping to detect skill from action
      if (action) {
        for (const [actionKey, skill] of Object.entries(ACTION_TO_SKILL_MAP)) {
          if (action.includes(actionKey)) {
            skillName = skill
            break
          }
        }
      }

      if (skillName === 'unknown') {
        logger.debug('[SKILL_EVALUATOR] Could not determine skill from action')
        return
      }

      const currentSkill = skills[skillName]

      if (!currentSkill) {
        logger.debug(`[SKILL_EVALUATOR] No data for skill: ${skillName}`)
        return
      }

      // 3. Get recent skill actions for this skill
      const recentActions = await runtime.getMemories({
        roomId: message.roomId,
        count: 100,
        unique: false,
        tableName: 'actions',
      })

      // Filter for this specific skill
      const skillActions = recentActions.filter(a => {
        const action = a.content.action as string | undefined
        if (!action) return false

        if (skillName === 'woodcutting') return action.includes('CHOP')
        if (skillName === 'fishing') return action.includes('FISH')
        if (skillName === 'cooking') return action.includes('COOK')
        if (skillName === 'firemaking')
          return action.includes('FIRE') || action.includes('LIGHT')
        return false
      })

      // 4. Calculate session metrics
      const sessionStartTime =
        skillActions[skillActions.length - 1]?.createdAt || Date.now()
      const sessionDuration = (Date.now() - sessionStartTime) / 1000 / 60 // minutes

      let totalXpGained = 0
      let successfulActions = 0
      let failedActions = 0

      for (const action of skillActions) {
        const xp = action.content.xpGained as number | undefined
        if (xp) totalXpGained += xp

        const success = action.content.success as boolean | undefined
        if (success === true) successfulActions++
        else if (success === false) failedActions++
      }

      const successRate =
        successfulActions + failedActions > 0
          ? (successfulActions / (successfulActions + failedActions)) * 100
          : 100

      const xpPerHour = sessionDuration > 0 ? (totalXpGained / sessionDuration) * 60 : 0

      // 5. Get this action's XP gain
      const actionXpGained = (actionContent.xpGained as number | undefined) || 0
      const didLevelUp = (actionContent.levelUp as boolean | undefined) || false
      const newLevel =
        (actionContent.newLevel as number | undefined) || currentSkill.level

      // 6. Compose state for LLM analysis
      const evaluationState =
        state || (await runtime.composeState(message, ['RECENT_MESSAGES']))

      if (!evaluationState.data) {
        evaluationState.data = {}
      }

      Object.assign(evaluationState.data, {
        skillData: `${skillName}: Level ${currentSkill.level} (${currentSkill.experience} XP)`,
        recentActions: skillActions
          .slice(0, 10)
          .map(
            a =>
              `${a.content.action as string}: ${(a.content.success as boolean) ? 'Success' : 'Failed'}, XP: ${(a.content.xpGained as number) || 0}`
          )
          .join('\n'),
        sessionMetrics: `Actions: ${skillActions.length}, Duration: ${sessionDuration.toFixed(1)} min, XP/hr: ${xpPerHour.toFixed(0)}, Success rate: ${successRate.toFixed(1)}%`,
      })

      // Generate prompt for skill analysis
      const prompt = composePromptFromState({
        state: evaluationState,
        template: skillProgressionTemplate,
      })

      // Use LLM to evaluate skill progression
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
      })

      // Parse the XML response
      const parsed = parseKeyValueXml(response)

      if (!parsed || !parsed.skill_name) {
        logger.debug('[SKILL_EVALUATOR] Could not parse skill analysis response')
        // Still save basic metrics even if LLM fails
      }

      const efficiencyScore =
        typeof parsed.efficiency_score === 'number'
          ? parsed.efficiency_score
          : parseInt(String(parsed.efficiency_score || '50'))

      const issues = String(parsed.issues || 'none')
      const recommendations = String(
        parsed.recommendations || 'continue current approach'
      )

      // 7. Store skill progression evaluation
      const skillMemory: Memory = {
        id: crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        entityId: message.entityId,
        agentId: runtime.agentId,
        content: {
          text: `${skillName} training: ${xpPerHour.toFixed(0)} XP/hr, ${successRate.toFixed(1)}% success rate`,
          source: 'skill_evaluation',
          skill: skillName,
          level: currentSkill.level,
          experience: currentSkill.experience,
          xpGained: actionXpGained,
          totalXpGained,
          xpPerHour,
          successRate,
          levelUp: didLevelUp,
          newLevel,
          sessionDuration,
          actionsPerformed: skillActions.length,
          efficiencyScore,
          issues,
          recommendations,
        },
        roomId: message.roomId,
        createdAt: Date.now(),
        metadata: {
          type: 'skill_progression',
          skill: skillName,
          levelUp: didLevelUp,
          evaluatedFrom: message.id,
        },
      }

      await runtime.createMemory(skillMemory, 'skills')

      // 8. Emit events for level ups
      if (didLevelUp) {
        logger.info(
          `[SKILL_EVALUATOR] LEVEL UP! ${skillName} reached level ${newLevel}`
        )
        try {
          await runtime.emitEvent('SKILL_LEVEL_UP', {
            runtime,
            roomId: message.roomId,
            skill: skillName,
            newLevel,
            xpPerHour,
          })
        } catch (emitError) {
          const errorMsg = emitError instanceof Error ? emitError.message : String(emitError)
          const errorStack = emitError instanceof Error ? emitError.stack : ''
          logger.error(
            `[SKILL_EVALUATOR] Failed to emit level up event for ${skillName} level ${newLevel} in room ${message.roomId}: ${errorMsg}${errorStack ? '\n' + errorStack : ''}`
          )
          throw emitError
        }
      }

      // 9. Warn about low efficiency
      if (efficiencyScore < 50 || successRate < 70) {
        logger.warn(
          `[SKILL_EVALUATOR] Low efficiency: ${efficiencyScore}% (${successRate.toFixed(1)}% success)`
        )
        if (issues !== 'none') {
          logger.warn(`[SKILL_EVALUATOR] Issues: ${issues}`)
        }
        if (recommendations !== 'continue current approach') {
          logger.info(`[SKILL_EVALUATOR] Recommendations: ${recommendations}`)
        }
      } else {
        logger.info(
          `[SKILL_EVALUATOR] ${skillName}: ${xpPerHour.toFixed(0)} XP/hr (${efficiencyScore}% efficiency)`
        )
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('[SKILL_EVALUATOR] Error analyzing skill progression:', errorMsg)
    }
  },

  examples: [],
}
