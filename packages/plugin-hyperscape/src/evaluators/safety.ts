import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
  composePromptFromState,
  parseKeyValueXml,
  ModelType,
  type UUID,
} from '@elizaos/core'

/**
 * Helper function to parse score values from various input types
 * @param value - Unknown value to parse
 * @param defaultValue - Default value if parsing fails (default: 0)
 * @returns Numeric value or default
 */
function parseScoreValue(value: unknown, defaultValue = 0): number {
  if (typeof value === 'number') {
    return value
  }
  const parsed = parseInt(String(value || defaultValue), 10)
  return Number.isFinite(parsed) ? parsed : defaultValue
}

/**
 * Extract action type from action memory entry
 * Exported for testability
 */
export function extractActionType(entry: Memory): string | undefined {
  // Type guard: ensure content is a non-null object
  if (!entry.content || typeof entry.content !== 'object') {
    return undefined
  }

  const content = entry.content as { action?: unknown; type?: unknown }

  const action = content.action
  if (typeof action === 'string') return action

  const type = content.type
  if (typeof type === 'string') return type

  return undefined
}

/**
 * Template for evaluating content safety and compliance
 */
const safetyEvaluationTemplate = `# Task: Evaluate agent behavior for safety violations and compliance issues

Analyze the agent's recent behavior for potential violations in a multiplayer 3D game environment.

Recent messages from agent:
{{recentMessages}}

Recent actions by agent:
{{recentActions}}

Nearby players and interactions:
{{entities}}

## Analysis Requirements

### Message Content Analysis
- Check for inappropriate language, harassment, or spam
- Detect repetitive or duplicate messages
- Identify targeted harassment patterns
- Flag advertising or promotional content

### Action Pattern Analysis
- Detect action spam (rapid repetition)
- Identify griefing patterns (destructive build actions)
- Flag suspicious targeting of specific players
- Monitor for exploit attempts

### Safety Indicators to Check
1. **Message Spam**: >5 messages per minute
2. **Duplicate Messages**: Same message sent 3+ times
3. **Inappropriate Content**: Profanity, harassment, hate speech
4. **Action Spam**: Same action repeated 10+ times in a minute
5. **Player Targeting**: Repeated interactions with same player (harassment indicator)
6. **Build Griefing**: Excessive placement/removal actions near other players

## Output Format (XML)

<safety>
  <messageSpamScore>0-100 (0=normal, 100=severe spam)</messageSpamScore>
  <actionSpamScore>0-100 (0=normal, 100=severe spam)</actionSpamScore>
  <contentSafetyScore>0-100 (0=inappropriate, 100=safe)</contentSafetyScore>
  <harassmentScore>0-100 (0=no harassment, 100=severe harassment)</harassmentScore>
  <griefingScore>0-100 (0=normal, 100=griefing)</griefingScore>
  <violations>
    <violation>
      <type>message_spam|action_spam|inappropriate_content|harassment|griefing</type>
      <severity>low|medium|high|critical</severity>
      <description>Brief description of the violation</description>
    </violation>
  </violations>
  <recommendations>Suggested actions: continue|warn|throttle|escalate</recommendations>
  <evidence>Specific examples of problematic behavior</evidence>
</safety>

If no violations detected, respond with:
<safety>
  <messageSpamScore>0</messageSpamScore>
  <actionSpamScore>0</actionSpamScore>
  <contentSafetyScore>100</contentSafetyScore>
  <harassmentScore>0</harassmentScore>
  <griefingScore>0</griefingScore>
  <violations>
    <none>true</none>
  </violations>
</safety>`

/**
 * Safety & Compliance Evaluator - CRITICAL for multiplayer game integrity
 *
 * This evaluator monitors AI agent behavior in real-time to prevent:
 * - Message spam and flooding
 * - Action spam and griefing
 * - Inappropriate content and harassment
 * - Player targeting and bullying
 * - Build action abuse and griefing
 *
 * Prevents spam, harassment, and rule violations in multiplayer environments
 * where AI agents interact with real users.
 */
export const safetyEvaluator: Evaluator = {
  name: 'SAFETY_COMPLIANCE_MONITOR',
  similes: ['SAFETY_CHECKER', 'RULE_COMPLIANCE', 'SPAM_DETECTOR', 'HARASSMENT_MONITOR'],
  description:
    'Monitors agent behavior for spam, harassment, and rule violations in multiplayer environment. Critical for user safety.',

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    // ALWAYS run safety checks - this is critical for multiplayer integrity
    // Safety is not optional, evaluate every interaction
    return true
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    logger.info('[SAFETY_EVALUATOR] Analyzing behavior for compliance violations')

    try {
      // Get recent messages from the agent
      const recentMessages = await runtime.getMemories({
        roomId: message.roomId,
        count: 30,
        unique: false,
        tableName: 'messages',
      })

      // Filter to only agent's messages
      const agentMessages = recentMessages.filter(
        m => m.entityId === runtime.agentId
      )

      // Analyze message frequency (last minute)
      const oneMinuteAgo = Date.now() - 60000
      const fiveMinutesAgo = Date.now() - 300000

      const messagesLastMinute = agentMessages.filter(
        m => m.createdAt && m.createdAt > oneMinuteAgo
      )

      const messagesLastFiveMinutes = agentMessages.filter(
        m => m.createdAt && m.createdAt > fiveMinutesAgo
      )

      // Check for duplicate messages
      const messageTexts = messagesLastFiveMinutes.map(m => m.content.text || '')
      const duplicates = messageTexts.filter(
        (text, index) => text && messageTexts.indexOf(text) !== index
      )

      // Get recent actions from memory
      const recentActions = await runtime.getMemories({
        roomId: message.roomId,
        count: 50,
        unique: false,
        tableName: 'actions',
      })

      // Filter to only agent's actions
      const agentActions = recentActions.filter(
        a => a.entityId === runtime.agentId
      )

      const actionsLastMinute = agentActions.filter(
        a => a.createdAt && a.createdAt > oneMinuteAgo
      )

      // Analyze action patterns
      const actionTypes = actionsLastMinute
        .map(extractActionType)
        .filter((a): a is string => a !== undefined)
      const mostCommonAction = getMostCommon(actionTypes)
      const actionRepetitionCount = actionTypes.filter(
        a => a === mostCommonAction
      ).length

      // Check for player targeting
      const targetedPlayerIds = agentActions
        .filter(a => a.content.targetPlayerId || a.content.targetEntityId)
        .map(a => a.content.targetPlayerId || a.content.targetEntityId)

      const mostTargetedPlayer = getMostCommon(targetedPlayerIds)
      const targetingCount = targetedPlayerIds.filter(
        id => id === mostTargetedPlayer
      ).length

      // Check for build action patterns (griefing)
      const buildActions = actionsLastMinute.filter(
        a =>
          a.content.action === 'build' ||
          a.content.action === 'place' ||
          a.content.action === 'remove' ||
          a.content.action === 'destroy'
      )

      // Compose state for LLM analysis
      const evaluationState =
        state ||
        (await runtime.composeState(message, [
          'RECENT_MESSAGES',
          'ENTITIES',
        ]))

      // Add recent actions to state
      if (!evaluationState.data) {
        evaluationState.data = {}
      }
      Object.assign(evaluationState.data, {
        recentActions: agentActions
          .slice(0, 20)
          .map(
            a => {
              const timestamp = a.createdAt ? new Date(a.createdAt).toISOString() : 'unknown'
              return `[${timestamp}] ${a.content.action || a.content.type}: ${JSON.stringify(a.content)}`
            }
          )
          .join('\n'),
      })

      // Generate prompt for safety evaluation
      const prompt = composePromptFromState({
        state: evaluationState,
        template: safetyEvaluationTemplate,
      })

      // Use LLM to analyze content and patterns
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
      })

      // Parse the XML response
      const parsed = parseKeyValueXml(response)

      if (!parsed) {
        logger.debug('[SAFETY_EVALUATOR] Could not parse safety response')
        return
      }

      // Extract safety scores
      const messageSpamScore = parseScoreValue(parsed.messageSpamScore, 0)
      const actionSpamScore = parseScoreValue(parsed.actionSpamScore, 0)
      const contentSafetyScore = parseScoreValue(parsed.contentSafetyScore, 100)
      const harassmentScore = parseScoreValue(parsed.harassmentScore, 0)
      const griefingScore = parseScoreValue(parsed.griefingScore, 0)

      // Calculate frequency-based scores
      const messageFrequencyScore = calculateSpamScore(messagesLastMinute.length, 5)
      const actionFrequencyScore = calculateSpamScore(actionRepetitionCount, 10)
      const targetingFrequencyScore = calculateSpamScore(targetingCount, 7)
      const buildActionScore = calculateSpamScore(buildActions.length, 15)

      // Combine LLM and frequency scores
      const finalMessageSpamScore = Math.max(messageSpamScore, messageFrequencyScore)
      const finalActionSpamScore = Math.max(actionSpamScore, actionFrequencyScore)
      const finalHarassmentScore = Math.max(harassmentScore, targetingFrequencyScore)
      const finalGriefingScore = Math.max(griefingScore, buildActionScore)

      // Process violations
      const violations: Array<{
        type: string
        severity: string
        description: string
      }> = []

      // Parse violations from LLM response
      const parsedViolations = parsed.violations || {}
      if (parsedViolations.none !== 'true' && parsedViolations.none !== true) {
        const violationList = Array.isArray(parsedViolations.violation)
          ? parsedViolations.violation
          : parsedViolations.violation
            ? [parsedViolations.violation]
            : []

        for (const v of violationList) {
          if (typeof v === 'object') {
            const violation = v as {
              type?: string
              severity?: string
              description?: string
            }
            violations.push({
              type: violation.type || 'unknown',
              severity: violation.severity || 'low',
              description: violation.description || '',
            })
          }
        }
      }

      // Add frequency-based violations
      if (finalMessageSpamScore > 70) {
        violations.push({
          type: 'message_spam',
          severity: finalMessageSpamScore > 85 ? 'high' : 'medium',
          description: `${messagesLastMinute.length} messages in last minute (threshold: 5)`,
        })
      }

      if (finalActionSpamScore > 70) {
        violations.push({
          type: 'action_spam',
          severity: finalActionSpamScore > 85 ? 'high' : 'medium',
          description: `Action "${mostCommonAction}" repeated ${actionRepetitionCount} times in last minute`,
        })
      }

      if (duplicates.length > 2) {
        violations.push({
          type: 'duplicate_messages',
          severity: duplicates.length > 5 ? 'high' : 'medium',
          description: `${duplicates.length} duplicate messages detected`,
        })
      }

      if (finalHarassmentScore > 60) {
        violations.push({
          type: 'player_targeting',
          severity: finalHarassmentScore > 80 ? 'high' : 'medium',
          description: `Player ${mostTargetedPlayer} targeted ${targetingCount} times`,
        })
      }

      if (finalGriefingScore > 70) {
        violations.push({
          type: 'build_griefing',
          severity: finalGriefingScore > 85 ? 'high' : 'medium',
          description: `${buildActions.length} build actions in last minute (potential griefing)`,
        })
      }

      if (contentSafetyScore < 50) {
        violations.push({
          type: 'inappropriate_content',
          severity: contentSafetyScore < 30 ? 'critical' : 'high',
          description: 'Inappropriate content detected by LLM analysis',
        })
      }

      // Determine overall severity
      const hasCritical = violations.some(v => v.severity === 'critical')
      const hasHigh = violations.some(v => v.severity === 'high')
      const overallSeverity = hasCritical
        ? 'critical'
        : hasHigh
          ? 'high'
          : violations.length > 0
            ? 'medium'
            : 'low'

      // Store safety evaluation in memory
      const safetyMemory: Memory = {
        id: crypto.randomUUID() as UUID,
        entityId: message.entityId,
        agentId: runtime.agentId,
        content: {
          text: `Safety check: ${violations.length} violations detected (severity: ${overallSeverity})`,
          source: 'safety_evaluation',
          messageSpamScore: finalMessageSpamScore,
          actionSpamScore: finalActionSpamScore,
          contentSafetyScore,
          harassmentScore: finalHarassmentScore,
          griefingScore: finalGriefingScore,
          violations,
          messagesLastMinute: messagesLastMinute.length,
          actionsLastMinute: actionsLastMinute.length,
          duplicateCount: duplicates.length,
          targetingCount,
          buildActionCount: buildActions.length,
          recommendations: String(parsed.recommendations || 'continue'),
          evidence: String(parsed.evidence || ''),
        },
        roomId: message.roomId,
        createdAt: Date.now(),
        metadata: {
          type: 'safety',
          violationCount: violations.length,
          severity: overallSeverity,
          evaluatedFrom: message.id,
        },
      }

      await runtime.createMemory(safetyMemory, 'safety')

      // Log violations appropriately
      if (violations.length > 0) {
        const violationSummary = violations
          .map(v => `${v.type} (${v.severity}): ${v.description}`)
          .join('; ')

        if (hasCritical) {
          logger.error(
            `[SAFETY_EVALUATOR] CRITICAL VIOLATIONS: ${violationSummary}`
          )
        } else if (hasHigh) {
          logger.warn(`[SAFETY_EVALUATOR] High severity violations: ${violationSummary}`)
        } else {
          logger.info(`[SAFETY_EVALUATOR] Violations detected: ${violationSummary}`)
        }

        // Emit safety violation event for other systems to react
        try {
          await runtime.emitEvent('SAFETY_VIOLATION', {
            runtime,
            roomId: message.roomId,
            violations,
            severity: overallSeverity,
            scores: {
              messageSpam: finalMessageSpamScore,
              actionSpam: finalActionSpamScore,
              contentSafety: contentSafetyScore,
              harassment: finalHarassmentScore,
              griefing: finalGriefingScore,
            },
            recommendations: String(parsed.recommendations || 'continue'),
          })
        } catch (emitError) {
          // Event emission is optional, don't fail if it errors
          logger.debug('[SAFETY_EVALUATOR] Could not emit violation event')
        }
      } else {
        logger.debug(
          `[SAFETY_EVALUATOR] No violations detected (scores: msg=${finalMessageSpamScore}, action=${finalActionSpamScore}, content=${contentSafetyScore})`
        )
      }

      logger.info('[SAFETY_EVALUATOR] Analysis complete')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('[SAFETY_EVALUATOR] Error analyzing safety:', errorMsg)
    }
  },

  examples: [],
}

/**
 * Helper function to find the most common element in an array
 */
function getMostCommon<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined

  const counts = new Map<T, number>()
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1)
  }

  let max = 0
  let mostCommon: T | undefined

  counts.forEach((count, item) => {
    if (count > max) {
      max = count
      mostCommon = item
    }
  })

  return mostCommon
}

/**
 * Calculate spam score based on frequency and threshold
 * @param frequency - Number of occurrences
 * @param threshold - Normal threshold (above this is concerning)
 * @returns Score from 0-100 (0=normal, 100=severe spam)
 */
function calculateSpamScore(frequency: number, threshold: number): number {
  if (frequency <= threshold) return 0

  // Calculate how far over threshold we are
  const overThreshold = frequency - threshold
  const percentOver = (overThreshold / threshold) * 100

  // Cap at 100
  return Math.min(100, Math.round(percentOver))
}
