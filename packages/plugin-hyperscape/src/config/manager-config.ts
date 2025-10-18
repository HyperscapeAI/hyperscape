/**
 * Manager-specific configuration constants
 * Centralizes all configurable values for manager components
 */

// Type-safe environment variable parsing helpers
function parseIntEnv(value: string | undefined, defaultValue: number, min?: number, max?: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    console.warn(`Invalid integer env value "${value}", using default ${defaultValue}`);
    return defaultValue;
  }
  if (min !== undefined && parsed < min) {
    console.warn(`Env value ${parsed} below minimum ${min}, clamping to ${min}`);
    return min;
  }
  if (max !== undefined && parsed > max) {
    console.warn(`Env value ${parsed} above maximum ${max}, clamping to ${max}`);
    return max;
  }
  return parsed;
}

function parseFloatEnv(value: string | undefined, defaultValue: number, min?: number, max?: number): number {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) {
    console.warn(`Invalid float env value "${value}", using default ${defaultValue}`);
    return defaultValue;
  }
  if (min !== undefined && parsed < min) {
    console.warn(`Env value ${parsed} below minimum ${min}, clamping to ${min}`);
    return min;
  }
  if (max !== undefined && parsed > max) {
    console.warn(`Env value ${parsed} above maximum ${max}, clamping to ${max}`);
    return max;
  }
  return parsed;
}

function parseBoolEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  const lower = value.toLowerCase().trim();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  console.warn(`Invalid boolean env value "${value}", using default ${defaultValue}`);
  return defaultValue;
}

// Interface definitions
export interface EmoteConfig {
  readonly MAX_QUEUE_SIZE: number;
  readonly MOVEMENT_CHECK_INTERVAL_MS: number;
}

export interface VoiceManagerConfig {
  readonly PLAYBACK_TIMEOUT_MS: number;
  readonly AMPLITUDE_THRESHOLD: number;
  readonly DEFAULT_EMOTE: string;
}

export interface BehaviorManagerConfig {
  readonly LOOP_INTERVAL_MS: number;
  readonly EXPLORE_DISTANCE: number;
  readonly NEARBY_ENTITY_DISTANCE: number;
}

export interface MultiAgentConfig {
  readonly UPDATE_INTERVAL_MS: number;
  readonly MAX_AGENTS_PER_WORLD: number;
  readonly AGENT_SPACING: number;
}

export interface DynamicActionConfig {
  readonly CACHE_TTL_MS: number;
  readonly MAX_CACHED_ACTIONS: number;
  readonly PARAMETER_EXTRACTION_TEMPERATURE: number;
  readonly RESPONSE_GENERATION_TEMPERATURE: number;
  readonly LLM_TIMEOUT_MS: number;
  readonly MAX_RETRY_ATTEMPTS: number;
  readonly RETRY_DELAY_MS: number;
}

export interface PlaywrightConfig {
  readonly VIEWPORT_WIDTH: number;
  readonly VIEWPORT_HEIGHT: number;
  readonly SCREENSHOT_DIFF_THRESHOLD: number;
  readonly OPERATION_TIMEOUT_MS: number;
}

export interface BuildManagerConfig {
  readonly MAX_BUILD_DISTANCE: number;
  readonly ENTITY_MIN_SPACING: number;
  readonly MAX_ENTITIES: number;
}

export interface MessageManagerConfig {
  readonly RECENT_MESSAGE_COUNT: number;
  readonly MAX_CONTEXT_MESSAGES: number;
  readonly ENABLE_BROADCAST_RESPONSES: boolean;
}

export interface ManagerConfigs {
  emote: EmoteConfig;
  voice: VoiceManagerConfig;
  behavior: BehaviorManagerConfig;
  multiAgent: MultiAgentConfig;
  dynamicAction: DynamicActionConfig;
  playwright: PlaywrightConfig;
  build: BuildManagerConfig;
  message: MessageManagerConfig;
}

// EmoteManager Configuration
export const EMOTE_CONFIG: EmoteConfig = {
  /** Maximum number of emotes that can be queued */
  MAX_QUEUE_SIZE: parseIntEnv(process.env.EMOTE_MAX_QUEUE_SIZE, 5, 1, 100),

  /** Interval for checking player movement during emotes (ms) */
  MOVEMENT_CHECK_INTERVAL_MS: parseIntEnv(process.env.EMOTE_MOVEMENT_CHECK_MS, 100, 50, 1000),
} as const;

// VoiceManager Configuration
export const VOICE_MANAGER_CONFIG: VoiceManagerConfig = {
  /** Timeout for audio playback operations (ms) */
  PLAYBACK_TIMEOUT_MS: parseIntEnv(process.env.VOICE_PLAYBACK_TIMEOUT_MS, 30000, 1000, 120000),

  /** Audio amplitude threshold for voice activity detection */
  AMPLITUDE_THRESHOLD: parseIntEnv(process.env.VOICE_AMPLITUDE_THRESHOLD, 1000, 100, 10000),

  /** Default emote to play when no emote is specified */
  DEFAULT_EMOTE: process.env.VOICE_DEFAULT_EMOTE || "waving both hands",
} as const;

// BehaviorManager Configuration
export const BEHAVIOR_MANAGER_CONFIG: BehaviorManagerConfig = {
  /** Interval between behavior cycles (ms) */
  LOOP_INTERVAL_MS: parseIntEnv(process.env.BEHAVIOR_LOOP_INTERVAL_MS, 2000, 500, 30000),

  /** Distance for exploration movements */
  EXPLORE_DISTANCE: parseFloatEnv(process.env.BEHAVIOR_EXPLORE_DISTANCE, 5.0, 1.0, 100.0),

  /** Maximum distance for nearby entity detection */
  NEARBY_ENTITY_DISTANCE: parseFloatEnv(process.env.BEHAVIOR_NEARBY_DISTANCE, 10.0, 1.0, 100.0),
} as const;

// MultiAgentManager Configuration
export const MULTI_AGENT_CONFIG: MultiAgentConfig = {
  /** Update interval for agent status checks (ms) */
  UPDATE_INTERVAL_MS: parseIntEnv(process.env.MULTI_AGENT_UPDATE_INTERVAL_MS, 1000, 100, 10000),

  /** Maximum number of agents per world */
  MAX_AGENTS_PER_WORLD: parseIntEnv(process.env.MULTI_AGENT_MAX_PER_WORLD, 50, 1, 1000),

  /** Default spacing between agent spawn positions */
  AGENT_SPACING: parseFloatEnv(process.env.MULTI_AGENT_SPACING, 3.0, 0.5, 50.0),
} as const;

// DynamicActionLoader Configuration
export const DYNAMIC_ACTION_CONFIG: DynamicActionConfig = {
  /** Cache TTL for discovered actions (ms) */
  CACHE_TTL_MS: parseIntEnv(process.env.DYNAMIC_ACTION_CACHE_TTL_MS, 60000, 1000, 3600000),

  /** Maximum number of cached dynamic actions */
  MAX_CACHED_ACTIONS: parseIntEnv(process.env.DYNAMIC_ACTION_MAX_CACHED, 100, 10, 1000),

  /** Temperature for LLM parameter extraction */
  PARAMETER_EXTRACTION_TEMPERATURE: parseFloatEnv(process.env.DYNAMIC_ACTION_PARAM_TEMP, 0.3, 0.0, 1.0),

  /** Temperature for LLM response generation */
  RESPONSE_GENERATION_TEMPERATURE: parseFloatEnv(process.env.DYNAMIC_ACTION_RESPONSE_TEMP, 0.8, 0.0, 1.0),

  /** LLM call timeout (ms) */
  LLM_TIMEOUT_MS: parseIntEnv(process.env.DYNAMIC_ACTION_LLM_TIMEOUT_MS, 30000, 5000, 120000),

  /** Maximum retry attempts for LLM calls */
  MAX_RETRY_ATTEMPTS: parseIntEnv(process.env.DYNAMIC_ACTION_MAX_RETRIES, 3, 1, 10),

  /** Delay between retry attempts (ms) */
  RETRY_DELAY_MS: parseIntEnv(process.env.DYNAMIC_ACTION_RETRY_DELAY_MS, 1000, 100, 10000),
} as const;

// PlaywrightManager Configuration
export const PLAYWRIGHT_CONFIG: PlaywrightConfig = {
  /** Default viewport width for screenshots */
  VIEWPORT_WIDTH: parseIntEnv(process.env.PLAYWRIGHT_VIEWPORT_WIDTH, 1920, 640, 7680),

  /** Default viewport height for screenshots */
  VIEWPORT_HEIGHT: parseIntEnv(process.env.PLAYWRIGHT_VIEWPORT_HEIGHT, 1080, 480, 4320),

  /** Screenshot comparison threshold (0-1) */
  SCREENSHOT_DIFF_THRESHOLD: parseFloatEnv(process.env.PLAYWRIGHT_DIFF_THRESHOLD, 0.1, 0.0, 1.0),

  /** Timeout for browser operations (ms) */
  OPERATION_TIMEOUT_MS: parseIntEnv(process.env.PLAYWRIGHT_TIMEOUT_MS, 30000, 1000, 120000),
} as const;

// BuildManager Configuration
export const BUILD_MANAGER_CONFIG: BuildManagerConfig = {
  /** Maximum distance from origin for building */
  MAX_BUILD_DISTANCE: parseFloatEnv(process.env.BUILD_MAX_DISTANCE, 1000.0, 10.0, 10000.0),

  /** Minimum spacing between entities */
  ENTITY_MIN_SPACING: parseFloatEnv(process.env.BUILD_MIN_SPACING, 2.0, 0.1, 100.0),

  /** Maximum entities per world */
  MAX_ENTITIES: parseIntEnv(process.env.BUILD_MAX_ENTITIES, 1000, 1, 100000),
} as const;

// MessageManager Configuration
export const MESSAGE_MANAGER_CONFIG: MessageManagerConfig = {
  /** Number of recent messages to keep in context */
  RECENT_MESSAGE_COUNT: parseIntEnv(process.env.MESSAGE_RECENT_COUNT, 20, 1, 1000),

  /** Maximum message context for LLM */
  MAX_CONTEXT_MESSAGES: parseIntEnv(process.env.MESSAGE_MAX_CONTEXT, 10, 1, 100),

  /** Enable broadcast responses (respond to all messages, not just mentions) */
  ENABLE_BROADCAST_RESPONSES: parseBoolEnv(process.env.MESSAGE_BROADCAST, false),
} as const;

/**
 * All manager configurations combined
 */
export const MANAGER_CONFIGS: ManagerConfigs = {
  emote: EMOTE_CONFIG,
  voice: VOICE_MANAGER_CONFIG,
  behavior: BEHAVIOR_MANAGER_CONFIG,
  multiAgent: MULTI_AGENT_CONFIG,
  dynamicAction: DYNAMIC_ACTION_CONFIG,
  playwright: PLAYWRIGHT_CONFIG,
  build: BUILD_MANAGER_CONFIG,
  message: MESSAGE_MANAGER_CONFIG,
} as const;
