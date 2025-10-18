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
 * RPG Game Systems Bridge
 * Validates that RPG systems are available in the world
 */
const rpgSystems: IGameSystem[] = [
  {
    id: "rpg-skills-bridge",
    name: "RPG Skills System Bridge",
    type: "skills",
    init: async (world: World) => {
      // Validate that skills system exists in world
      if (typeof world.getSystem !== 'function') {
        throw new Error('[RPG Pack] Missing required API: world.getSystem is not a function');
      }
      const skillsSystem = world.getSystem('skills');
      if (!skillsSystem) {
        throw new Error('[RPG Pack] Missing required system: skills');
      }
      console.info('[RPG Pack] ✓ Skills system connected');
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
      // Validate that inventory system exists in world
      if (typeof world.getSystem !== 'function') {
        throw new Error('[RPG Pack] Missing required API: world.getSystem is not a function');
      }
      const inventorySystem = world.getSystem('inventory');
      if (!inventorySystem) {
        throw new Error('[RPG Pack] Missing required system: inventory');
      }
      console.info('[RPG Pack] ✓ Inventory system connected');
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
      // Validate that banking system exists in world
      if (typeof world.getSystem !== 'function') {
        throw new Error('[RPG Pack] Missing required API: world.getSystem is not a function');
      }
      const bankingSystem = world.getSystem('banking');
      if (!bankingSystem) {
        throw new Error('[RPG Pack] Missing required system: banking');
      }
      console.info('[RPG Pack] ✓ Banking system connected');
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
      // Validate that resource system exists in world
      if (typeof world.getSystem !== 'function') {
        throw new Error('[RPG Pack] Missing required API: world.getSystem is not a function');
      }
      const resourceSystem = world.getSystem('resources');
      if (!resourceSystem) {
        throw new Error('[RPG Pack] Missing required system: resources');
      }
      console.info('[RPG Pack] ✓ Resource system connected');
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
    "Complete RPG experience with 6 actions, 6 providers, and 4 system bridges for AI agents",
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
