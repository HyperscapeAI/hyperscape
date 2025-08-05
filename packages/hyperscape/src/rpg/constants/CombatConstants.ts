/**
 * Combat-related constants extracted from various systems
 * These values are based on the GDD specifications
 */

// Constant for mobs that are always aggressive regardless of level
const ALWAYS_AGGRESSIVE_LEVEL = 999;

export const COMBAT_CONSTANTS = {
  // Attack ranges
  MELEE_RANGE: 2,
  RANGED_RANGE: 10,
  
  // Attack timing
  ATTACK_COOLDOWN_MS: 600,
  COMBAT_TIMEOUT_MS: 10000, // 10 seconds
  
  // Damage calculations
  DAMAGE_MULTIPLIERS: {
    MELEE_ATTACK: 0.5,
    RANGED_ATTACK: 0.5,
    DEFENSE_REDUCTION: 0.25,
  },
  
  // Minimum values
  MIN_DAMAGE: 1,
  
  // Combat states
  COMBAT_STATES: {
    IDLE: 'idle',
    IN_COMBAT: 'in_combat',
    FLEEING: 'fleeing',
  } as const,
} as const;

export const AGGRO_CONSTANTS = {
  // Default behaviors
  DEFAULT_BEHAVIOR: 'passive' as const,
  
  // Update intervals
  AGGRO_UPDATE_INTERVAL_MS: 100,
  
  // Special level thresholds
  ALWAYS_AGGRESSIVE_LEVEL: 999, // Used for mobs that ignore level differences
  
  // Mob behavior configurations
  MOB_BEHAVIORS: {
    'goblin': { 
      behavior: 'aggressive' as const, 
      detectionRange: 8, 
      leashRange: 15, 
      levelIgnoreThreshold: 15 
    },
    'bandit': { 
      behavior: 'aggressive' as const, 
      detectionRange: 8, 
      leashRange: 15, 
      levelIgnoreThreshold: 15 
    },
    'barbarian': { 
      behavior: 'aggressive' as const, 
      detectionRange: 10, 
      leashRange: 20, 
      levelIgnoreThreshold: 15 
    },
    'hobgoblin': { 
      behavior: 'aggressive' as const, 
      detectionRange: 12, 
      leashRange: 25, 
      levelIgnoreThreshold: 25 
    },
    'guard': { 
      behavior: 'aggressive' as const, 
      detectionRange: 12, 
      leashRange: 25, 
      levelIgnoreThreshold: 25 
    },
    'dark_warrior': { 
      behavior: 'aggressive' as const, 
      detectionRange: 15, 
      leashRange: 30, 
      levelIgnoreThreshold: ALWAYS_AGGRESSIVE_LEVEL 
    },
    'black_knight': { 
      behavior: 'aggressive' as const, 
      detectionRange: 15, 
      leashRange: 30, 
      levelIgnoreThreshold: ALWAYS_AGGRESSIVE_LEVEL 
    },
    'ice_warrior': { 
      behavior: 'aggressive' as const, 
      detectionRange: 12, 
      leashRange: 25, 
      levelIgnoreThreshold: 35 
    },
    'dark_ranger': { 
      behavior: 'aggressive' as const, 
      detectionRange: 20, 
      leashRange: 35, 
      levelIgnoreThreshold: ALWAYS_AGGRESSIVE_LEVEL 
    },
    'default': { 
      behavior: 'passive' as const, 
      detectionRange: 5, 
      leashRange: 10, 
      levelIgnoreThreshold: 0 
    }
  } as const,
} as const;

export const LEVEL_CONSTANTS = {
  // Starting values
  DEFAULT_COMBAT_LEVEL: 3,
  MIN_COMBAT_LEVEL: 3,
  MAX_LEVEL: 99,
  
  // XP formulas
  XP_BASE: 50,
  XP_GROWTH_FACTOR: 8,
  
  // Combat level calculation weights
  COMBAT_LEVEL_WEIGHTS: {
    DEFENSE_WEIGHT: 0.25,
    OFFENSE_WEIGHT: 0.325,
    RANGED_MULTIPLIER: 1.5,
  },
} as const;

export type CombatState = typeof COMBAT_CONSTANTS.COMBAT_STATES[keyof typeof COMBAT_CONSTANTS.COMBAT_STATES];
export type MobBehaviorType = keyof typeof AGGRO_CONSTANTS.MOB_BEHAVIORS;