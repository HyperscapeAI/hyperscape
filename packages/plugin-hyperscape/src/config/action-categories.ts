/**
 * Action Category Configuration
 *
 * Defines logical groupings of actions to optimize LLM context by only including
 * relevant actions based on the current situation.
 *
 * **Design Principles**:
 * - Core actions always load (essential for agent function)
 * - Conditional categories load based on world state
 * - Reduces token usage by 50-70% while maintaining full action availability
 *
 * **Categories**:
 * - `core`: Always available (communication, perception, flow control)
 * - `movement`: Navigation and locomotion
 * - `interaction`: World object interaction
 * - `rpg_gathering`: Resource gathering skills
 * - `rpg_production`: Crafting and production skills
 * - `rpg_inventory`: Inventory management
 * - `ambient`: Idle behaviors and emotes
 */

/**
 * Action category definitions
 * Maps category names to arrays of action names
 */
export const ACTION_CATEGORIES = {
  /**
   * Core Actions - Always loaded
   * Essential for basic agent function and communication
   */
  core: [
    'PERCEPTION',      // Environment scanning
    'REPLY',           // Chat responses
    'IGNORE',          // Message filtering
    'CONTINUE',        // Flow control
  ],

  /**
   * Movement Actions - Loaded when agent needs mobility
   * Navigation and locomotion capabilities
   */
  movement: [
    'GOTO',            // Navigate to entity/position
    'STOP',            // Stop movement
    'WALK_RANDOMLY',   // Wander behavior
  ],

  /**
   * Interaction Actions - Loaded when interactables nearby
   * World object interaction and manipulation
   */
  interaction: [
    'USE',             // Use/activate object
    'UNUSE',           // Stop using object
    'BUILD',           // Place/modify entities
  ],

  /**
   * RPG Gathering Actions - Loaded when RPG systems available
   * Resource gathering and collection skills
   */
  rpg_gathering: [
    'CHOP_TREE',       // Woodcutting
    'CATCH_FISH',      // Fishing
  ],

  /**
   * RPG Production Actions - Loaded when RPG systems available
   * Crafting and production skills
   */
  rpg_production: [
    'COOK_FOOD',       // Cooking
    'LIGHT_FIRE',      // Firemaking
  ],

  /**
   * RPG Inventory Actions - Loaded when RPG systems available
   * Inventory and banking management
   */
  rpg_inventory: [
    'CHECK_INVENTORY', // View inventory
    'BANK_ITEMS',      // Banking
  ],

  /**
   * Ambient Actions - Loaded for idle behaviors
   * Expressive behaviors and idle animations
   */
  ambient: [
    'AMBIENT',         // Ambient behaviors (emotes, idle)
  ],
} as const

/**
 * Type-safe action category keys
 */
export type ActionCategory = keyof typeof ACTION_CATEGORIES

/**
 * Get all action names from a specific category
 */
export function getActionsInCategory(category: ActionCategory): readonly string[] {
  return ACTION_CATEGORIES[category]
}

/**
 * Get all action names across multiple categories
 */
export function getActionsInCategories(categories: ActionCategory[]): string[] {
  const actions: string[] = []
  for (const category of categories) {
    actions.push(...ACTION_CATEGORIES[category])
  }
  return actions
}

/**
 * Check if an action belongs to a specific category
 */
export function isActionInCategory(actionName: string, category: ActionCategory): boolean {
  return (ACTION_CATEGORIES[category] as readonly string[]).includes(actionName)
}
