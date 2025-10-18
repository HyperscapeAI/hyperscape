/**
 * RPG-specific event data types for skills, banking, cooking, etc.
 */

import type { IAgentRuntime } from '@elizaos/core'
import type { BaseEventData } from './event-types'

/**
 * Bank deposit completion event data
 */
export interface BankDepositCompleteData extends BaseEventData {
  playerId: string
  success: boolean
  items?: Array<{ itemId: string; quantity: number }>
  itemsDeposited?: Array<{ itemId: string; quantity: number }>
  error?: string
}

/**
 * Woodcutting completion event data
 */
export interface WoodcuttingCompleteData extends BaseEventData {
  playerId: string
  success: boolean
  reward?: {
    item: string
    quantity: number
  }
  xpGained?: number
  error?: string
}

/**
 * Fishing completion event data
 */
export interface FishingCompleteData extends BaseEventData {
  playerId: string
  success: boolean
  reward?: {
    item: string
    quantity: number
  }
  xpGained?: number
  error?: string
}

/**
 * Firemaking completion event data
 */
export interface FiremakingCompleteData extends BaseEventData {
  playerId: string
  success: boolean
  xpGained?: number
  error?: string
}

/**
 * Cooking completion event data
 */
export interface CookingCompleteData extends BaseEventData {
  playerId: string
  success: boolean
  reward?: {
    item: string
    quantity: number
  }
  xpGained?: number
  burnt?: boolean
  levelUp?: boolean
  newLevel?: number
  error?: string
}

/**
 * Generic skill event data for XP gain and level up
 */
export interface SkillEventData extends BaseEventData {
  playerId: string
  skill: string
  xp?: number
  level?: number
  newLevel?: number
}

/**
 * Safety violation event data
 */
export interface SafetyViolationData extends BaseEventData {
  runtime: IAgentRuntime
  roomId: string
  violations: Array<{
    type: string
    severity: string
    description: string
  }>
  severity: string
  scores: {
    messageSpam: number
    actionSpam: number
    contentSafety: number
    harassment: number
    griefing: number
  }
  recommendations: string
}

/**
 * Engagement update event data
 */
export interface EngagementUpdateData extends BaseEventData {
  runtime: IAgentRuntime
  roomId: string
  entityId: string
  level: string
  score: number
  recommendation: string
  concerns: string
}

/**
 * Resource inefficiency event data
 */
export interface ResourceInefficiencyData extends BaseEventData {
  runtime: IAgentRuntime
  roomId: string
  issue: string
  severity: string
  inventoryUsage: number
  recommendations: string
}

/**
 * Skill level up event data
 */
export interface SkillLevelUpData extends BaseEventData {
  runtime: IAgentRuntime
  roomId: string
  skill: string
  newLevel: number
  xpPerHour: number
}

/**
 * RPG event data union type
 */
export type RPGEventData =
  | BankDepositCompleteData
  | WoodcuttingCompleteData
  | FishingCompleteData
  | FiremakingCompleteData
  | CookingCompleteData
  | SkillEventData
  | SafetyViolationData
  | EngagementUpdateData
  | ResourceInefficiencyData
  | SkillLevelUpData
