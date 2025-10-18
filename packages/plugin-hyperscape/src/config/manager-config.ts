/**
 * Manager-specific configuration constants
 * Centralizes all configurable values for manager components
 */

// EmoteManager Configuration
export const EMOTE_CONFIG = {
  /** Maximum number of emotes that can be queued */
  MAX_QUEUE_SIZE: parseInt(process.env.EMOTE_MAX_QUEUE_SIZE || "5"),

  /** Interval for checking player movement during emotes (ms) */
  MOVEMENT_CHECK_INTERVAL_MS: parseInt(
    process.env.EMOTE_MOVEMENT_CHECK_MS || "100"
  ),
} as const;

// VoiceManager Configuration
export const VOICE_MANAGER_CONFIG = {
  /** Timeout for audio playback operations (ms) */
  PLAYBACK_TIMEOUT_MS: parseInt(
    process.env.VOICE_PLAYBACK_TIMEOUT_MS || "30000"
  ),

  /** Audio amplitude threshold for voice activity detection */
  AMPLITUDE_THRESHOLD: parseInt(process.env.VOICE_AMPLITUDE_THRESHOLD || "1000"),
} as const;

// BehaviorManager Configuration
export const BEHAVIOR_MANAGER_CONFIG = {
  /** Interval between behavior cycles (ms) */
  LOOP_INTERVAL_MS: parseInt(process.env.BEHAVIOR_LOOP_INTERVAL_MS || "2000"),

  /** Distance for exploration movements */
  EXPLORE_DISTANCE: parseFloat(process.env.BEHAVIOR_EXPLORE_DISTANCE || "5.0"),

  /** Maximum distance for nearby entity detection */
  NEARBY_ENTITY_DISTANCE: parseFloat(
    process.env.BEHAVIOR_NEARBY_DISTANCE || "10.0"
  ),
} as const;

// MultiAgentManager Configuration
export const MULTI_AGENT_CONFIG = {
  /** Update interval for agent status checks (ms) */
  UPDATE_INTERVAL_MS: parseInt(
    process.env.MULTI_AGENT_UPDATE_INTERVAL_MS || "1000"
  ),

  /** Maximum number of agents per world */
  MAX_AGENTS_PER_WORLD: parseInt(
    process.env.MULTI_AGENT_MAX_PER_WORLD || "50"
  ),

  /** Default spacing between agent spawn positions */
  AGENT_SPACING: parseFloat(process.env.MULTI_AGENT_SPACING || "3.0"),
} as const;

// DynamicActionLoader Configuration
export const DYNAMIC_ACTION_CONFIG = {
  /** Cache TTL for discovered actions (ms) */
  CACHE_TTL_MS: parseInt(process.env.DYNAMIC_ACTION_CACHE_TTL_MS || "60000"),

  /** Maximum number of cached dynamic actions */
  MAX_CACHED_ACTIONS: parseInt(
    process.env.DYNAMIC_ACTION_MAX_CACHED || "100"
  ),

  /** Temperature for LLM parameter extraction */
  PARAMETER_EXTRACTION_TEMPERATURE: parseFloat(
    process.env.DYNAMIC_ACTION_PARAM_TEMP || "0.3"
  ),

  /** Temperature for LLM response generation */
  RESPONSE_GENERATION_TEMPERATURE: parseFloat(
    process.env.DYNAMIC_ACTION_RESPONSE_TEMP || "0.8"
  ),
} as const;

// PlaywrightManager Configuration
export const PLAYWRIGHT_CONFIG = {
  /** Default viewport width for screenshots */
  VIEWPORT_WIDTH: parseInt(process.env.PLAYWRIGHT_VIEWPORT_WIDTH || "1920"),

  /** Default viewport height for screenshots */
  VIEWPORT_HEIGHT: parseInt(process.env.PLAYWRIGHT_VIEWPORT_HEIGHT || "1080"),

  /** Screenshot comparison threshold (0-1) */
  SCREENSHOT_DIFF_THRESHOLD: parseFloat(
    process.env.PLAYWRIGHT_DIFF_THRESHOLD || "0.1"
  ),

  /** Timeout for browser operations (ms) */
  OPERATION_TIMEOUT_MS: parseInt(
    process.env.PLAYWRIGHT_TIMEOUT_MS || "30000"
  ),
} as const;

// BuildManager Configuration
export const BUILD_MANAGER_CONFIG = {
  /** Maximum distance from origin for building */
  MAX_BUILD_DISTANCE: parseFloat(process.env.BUILD_MAX_DISTANCE || "1000.0"),

  /** Minimum spacing between entities */
  ENTITY_MIN_SPACING: parseFloat(process.env.BUILD_MIN_SPACING || "2.0"),

  /** Maximum entities per world */
  MAX_ENTITIES: parseInt(process.env.BUILD_MAX_ENTITIES || "1000"),
} as const;

// MessageManager Configuration
export const MESSAGE_MANAGER_CONFIG = {
  /** Number of recent messages to keep in context */
  RECENT_MESSAGE_COUNT: parseInt(
    process.env.MESSAGE_RECENT_COUNT || "20"
  ),

  /** Maximum message context for LLM */
  MAX_CONTEXT_MESSAGES: parseInt(
    process.env.MESSAGE_MAX_CONTEXT || "10"
  ),

  /** Enable broadcast responses (respond to all messages, not just mentions) */
  ENABLE_BROADCAST_RESPONSES: process.env.MESSAGE_BROADCAST === "true",
} as const;

/**
 * All manager configurations combined
 */
export const MANAGER_CONFIGS = {
  emote: EMOTE_CONFIG,
  voice: VOICE_MANAGER_CONFIG,
  behavior: BEHAVIOR_MANAGER_CONFIG,
  multiAgent: MULTI_AGENT_CONFIG,
  dynamicAction: DYNAMIC_ACTION_CONFIG,
  playwright: PLAYWRIGHT_CONFIG,
  build: BUILD_MANAGER_CONFIG,
  message: MESSAGE_MANAGER_CONFIG,
} as const;
