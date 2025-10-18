/**
 * Hyperscape Provider Exports
 *
 * Central export file for all ElizaOS providers in the Hyperscape plugin.
 * Providers inject context into LLM prompts to help the agent make informed decisions.
 *
 * **Provider Categories**:
 * - Core: Always available (world-context, actions, character, emote, skills)
 * - RPG: Loaded via content packs (banking, skill-specific providers)
 * - Evaluator Support: Engagement tracking (boredom, facts, time)
 *
 * **Usage**:
 * ```typescript
 * import { worldContextProvider, hyperscapeActionsProvider } from './providers';
 * ```
 */

// Core Providers - Always available
export { worldContextProvider } from './world-context'
export { hyperscapeActionsProvider } from './actions'
export { characterProvider } from './character'
export { hyperscapeEmoteProvider } from './emote'
export { hyperscapeSkillProvider } from './skills'

// RPG Providers - Loaded via content packs
export { bankingProvider } from './banking'

// Skill-Specific Providers - Dynamic loading
export { woodcuttingSkillProvider } from './skills/woodcutting'
export { fishingSkillProvider } from './skills/fishing'
export { cookingSkillProvider } from './skills/cooking'
export { firemakingSkillProvider } from './skills/firemaking'

// Evaluator Support Providers
export { boredomProvider } from './boredom'
export { factsProvider } from './facts'
export { timeProvider } from './time'
