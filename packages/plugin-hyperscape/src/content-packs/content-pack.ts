/**
 * RPG Content Pack for ElizaOS Agent Integration
 *
 * This content pack bridges the polished RPG systems from @hyperscape/shared
 * with ElizaOS agents, enabling AI agents to interact with our RPG world.
 */

import { IAgentRuntime, Provider } from "@elizaos/core";
import {
  IContentPack,
  IGameSystem,
} from "../types/content-pack";
import type { World } from "../types/core-types";

// Import real RPG actions
import { chopTreeAction } from "../actions/chopTree";
import { catchFishAction } from "../actions/catchFish";
import { cookFoodAction } from "../actions/cookFood";
import { lightFireAction } from "../actions/lightFire";
import { bankItemsAction } from "../actions/bankItems";
import { checkInventoryAction } from "../actions/checkInventory";

// Import real RPG providers
import { bankingProvider } from "../providers/banking";
import { characterProvider } from "../providers/character";
import { woodcuttingSkillProvider } from "../providers/skills/woodcutting";
import { fishingSkillProvider } from "../providers/skills/fishing";
import { firemakingSkillProvider } from "../providers/skills/firemaking";
import { cookingSkillProvider } from "../providers/skills/cooking";

/**
 * RPG Actions for AI Agents
 * Using real, production-ready actions from the actions directory
 */
const rpgActions = [
  chopTreeAction,      // Woodcutting skill
  catchFishAction,     // Fishing skill
  cookFoodAction,      // Cooking skill
  lightFireAction,     // Firemaking skill
  bankItemsAction,     // Banking system
  checkInventoryAction, // Inventory management
];

/**
 * RPG Providers for AI Agents
 * Using real, production-ready providers from the providers directory
 */
const rpgProviders: Provider[] = [
  // Core RPG providers
  bankingProvider,              // Banking system state
  characterProvider,            // Character stats and skills

  // Skill-specific providers
  woodcuttingSkillProvider,     // Woodcutting skill state
  fishingSkillProvider,         // Fishing skill state
  firemakingSkillProvider,      // Firemaking skill state
  cookingSkillProvider,         // Cooking skill state
];

/**
 * Validates that a world system exists and is properly connected
 * @param world - The world instance to check
 * @param systemName - The name of the system to validate
 * @throws Error if world.getSystem is not a function or system is missing
 */
function validateWorldSystem(world: World, systemName: string): void {
  // Type guard: verify world has getSystem method
  if (typeof world.getSystem !== 'function') {
    throw new Error('[RPG Pack] Missing required API: world.getSystem is not a function');
  }

  // Retrieve system
  const system = world.getSystem(systemName);

  // Verify system exists
  if (!system) {
    throw new Error(`[RPG Pack] Missing required system: ${systemName}`);
  }

  // Add runtime type guard for system methods (optional, depending on expected API)
  if (typeof (system as { getSkillLevel?: unknown }).getSkillLevel === 'function') {
    console.info(`[RPG Pack] ✓ ${systemName} system connected (with getSkillLevel API)`);
  } else {
    console.info(`[RPG Pack] ✓ ${systemName} system connected`);
  }
}

/**
 * RPG Game Systems Bridge
 * Validates that RPG systems are available in the world
 */
const rpgSystems: IGameSystem[] = [
  {
    id: "rpg-skills-bridge",
    name: "RPG Skills System Bridge",
    type: "skills",
    init: async (world: World) => {
      validateWorldSystem(world, 'skills');
    },
    cleanup: () => {
      console.info('[RPG Pack] Skills system bridge disconnected');
    },
  },

  {
    id: "rpg-inventory-bridge",
    name: "RPG Inventory System Bridge",
    type: "inventory",
    init: async (world: World) => {
      validateWorldSystem(world, 'inventory');
    },
    cleanup: () => {
      console.info('[RPG Pack] Inventory system bridge disconnected');
    },
  },

  {
    id: "rpg-banking-bridge",
    name: "RPG Banking System Bridge",
    type: "custom",
    init: async (world: World) => {
      validateWorldSystem(world, 'banking');
    },
    cleanup: () => {
      console.info('[RPG Pack] Banking system bridge disconnected');
    },
  },

  {
    id: "rpg-resource-bridge",
    name: "RPG Resource System Bridge",
    type: "custom",
    init: async (world: World) => {
      validateWorldSystem(world, 'resources');
    },
    cleanup: () => {
      console.info('[RPG Pack] Resource system bridge disconnected');
    },
  },
];

/**
 * Runescape-Style RPG Content Pack
 *
 * This content pack connects ElizaOS agents to our polished RPG systems,
 * enabling AI agents to play in our RPG world with full system integration.
 *
 * **Contents:**
 * - 6 RPG actions: chopTree, catchFish, cookFood, lightFire, bankItems, checkInventory
 * - 6 RPG providers: banking, character, woodcutting, fishing, firemaking, cooking
 * - 4 system bridges: skills, inventory, banking, resources
 */
export const RunescapeRPGPack: IContentPack = {
  id: "runescape-rpg",
  name: "Runescape RPG Pack",
  description:
    "Enables AI agents to gather resources, train skills, manage inventory, and bank items in a Runescape-style RPG world",
  version: "1.0.0",

  // Actions available to AI agents
  actions: rpgActions,

  // State providers for agent context
  providers: rpgProviders,

  // Game systems integration
  systems: rpgSystems,

  // Lifecycle hooks
  onLoad: async (runtime: IAgentRuntime, world: World) => {
    console.info('[RPG Pack] Loading Runescape RPG Pack...');
    console.info(`[RPG Pack] Agent: ${runtime.agentId}`);
    console.info(`[RPG Pack] World connected: ${world ? 'Yes' : 'No'}`);

    // System bridges will validate RPG systems are available
    // Actions and providers are registered by the content pack loader
  },

  onUnload: async (runtime: IAgentRuntime, world: World) => {
    console.info('[RPG Pack] Unloading Runescape RPG Pack...');
    console.info(`[RPG Pack] Cleanup complete for agent: ${runtime.agentId}`);
  },
};

export default RunescapeRPGPack;
