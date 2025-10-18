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
  IVisualConfig,
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
  bankingProvider,    // Banking system state
  characterProvider,  // Character stats and skills
];

/**
 * Visual Configuration for RPG Entities
 * Matches our testing framework with colored cubes
 */
const rpgVisuals: IVisualConfig = {
  entityColors: {
    // Players and NPCs
    "rpg.player": { color: 0x0099ff, hex: "#0099FF" }, // Blue
    "rpg.npc.merchant": { color: 0x00ff00, hex: "#00FF00" }, // Green
    "rpg.npc.trainer": { color: 0xffff00, hex: "#FFFF00" }, // Yellow

    // Mobs
    "rpg.mob.goblin": { color: 0xff0000, hex: "#FF0000" }, // Red
    "rpg.mob.skeleton": { color: 0x888888, hex: "#888888" }, // Gray

    // Items
    "rpg.item.weapon": { color: 0xff6600, hex: "#FF6600" }, // Orange
    "rpg.item.armor": { color: 0x6666ff, hex: "#6666FF" }, // Purple
    "rpg.item.resource": { color: 0x996633, hex: "#996633" }, // Brown

    // Interactive Objects
    "rpg.object.chest": { color: 0xffd700, hex: "#FFD700" }, // Gold
    "rpg.object.bank": { color: 0x00ffff, hex: "#00FFFF" }, // Cyan
    "rpg.object.shop": { color: 0xff00ff, hex: "#FF00FF" }, // Magenta

    // Effects
    "rpg.effect.damage": { color: 0xff0000, hex: "#FF0000" }, // Red
    "rpg.effect.heal": { color: 0x00ff00, hex: "#00FF00" }, // Green
    "rpg.effect.xp": { color: 0xffff00, hex: "#FFFF00" }, // Yellow
  },
};

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
      const skillsSystem = world.getSystem?.('skills');
      if (!skillsSystem) {
        console.warn('[RPG Pack] Skills system not found in world');
      } else {
        console.info('[RPG Pack] ✓ Skills system connected');
      }
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
      const inventorySystem = world.getSystem?.('inventory');
      if (!inventorySystem) {
        console.warn('[RPG Pack] Inventory system not found in world');
      } else {
        console.info('[RPG Pack] ✓ Inventory system connected');
      }
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
      const bankingSystem = world.getSystem?.('banking');
      if (!bankingSystem) {
        console.warn('[RPG Pack] Banking system not found in world');
      } else {
        console.info('[RPG Pack] ✓ Banking system connected');
      }
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
      const resourceSystem = world.getSystem?.('resources');
      if (!resourceSystem) {
        console.warn('[RPG Pack] Resource system not found in world');
      } else {
        console.info('[RPG Pack] ✓ Resource system connected');
      }
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
 */
export const RunescapeRPGPack: IContentPack = {
  id: "runescape-rpg",
  name: "Runescape RPG Pack",
  description:
    "Complete RPG experience with real actions, providers, and system bridges for AI agents",
  version: "1.0.0",

  // Actions available to AI agents
  actions: rpgActions,

  // State providers for agent context
  providers: rpgProviders,

  // Game systems integration
  systems: rpgSystems,

  // Visual configuration for testing
  visuals: rpgVisuals,

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
