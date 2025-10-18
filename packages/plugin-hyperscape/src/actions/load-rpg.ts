import {
  type Action,
  type ActionResult,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from "@elizaos/core";
import { HyperscapeService } from "../service";

export const loadRPGAction: Action = {
  name: "LOAD_RPG",
  description: "Load an RPG content pack into the current Hyperscape world, enabling RPG-specific features, systems, and content",

  similes: [
    "load rpg",
    "start rpg",
    "activate rpg",
    "enable rpg mode",
    "load game mode",
    "initialize rpg",
    "start rpg mode",
  ],

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    // Validate that Hyperscape service is available
    const service = runtime.getService<HyperscapeService>("hyperscape");
    if (!service) {
      logger.warn("[LOAD_RPG] Hyperscape service not available");
      return false;
    }

    // Validate that we're connected to a world
    if (!service.isConnected()) {
      logger.warn("[LOAD_RPG] Not connected to Hyperscape world");
      return false;
    }

    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, string | number | boolean>,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    // Get the Hyperscape service
    const hyperscapeService =
      runtime.getService<HyperscapeService>("hyperscape");

    if (!hyperscapeService) {
      return {
        success: false,
        text: "Hyperscape service not available",
        data: { error: "SERVICE_NOT_FOUND" },
      };
    }

    if (!hyperscapeService.isConnected()) {
      return {
        success: false,
        text: "Not connected to Hyperscape world",
        data: { error: "NOT_CONNECTED" },
      };
    }

    const world = hyperscapeService.getWorld();
    if (!world) {
      return {
        success: false,
        text: "Could not access Hyperscape world",
        data: { error: "WORLD_NOT_FOUND" },
      };
    }

    try {
      // Load the RPG content pack
      // This integrates with our polished RPG systems:
      // - Skills system (combat, gathering, crafting)
      // - Quest system (objectives, rewards, tracking)
      // - NPC system (merchants, quest givers, enemies)
      // - Loot system (drops, rarity, equipment)
      // - Economy system (shops, trading, currency)

      logger.info("[LOAD_RPG] RPG content pack not yet implemented for world:", world.id);

      // RPG systems integration point - connect to our 54 polished systems
      // TODO: Actual RPG content pack loading will be implemented here
      // For now, return that RPG is not implemented

      const result: ActionResult = {
        success: false,
        text: "RPG content pack not implemented",
        data: {
          worldId: world.id,
          rpgEnabled: false,
          error: "NOT_IMPLEMENTED",
        },
        values: {
          rpg_mode: false,
          world_id: world.id,
        },
      };

      if (callback) {
        await callback({
          text: result.text,
          actions: ["HYPERSCAPE_LOAD_RPG"],
          source: "hyperscape",
          data: result.data,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("[LOAD_RPG] Failed to load RPG content pack:", error);

      return {
        success: false,
        text: `Failed to load RPG content pack: ${errorMessage}`,
        data: {
          error: "LOAD_FAILED",
          details: errorMessage,
        },
      };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Load the RPG game mode" },
      } as ActionExample,
      {
        name: "{{agentName}}",
        content: {
          text: "Loading RPG content pack...",
          actions: ["LOAD_RPG"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Start RPG mode please" },
      } as ActionExample,
      {
        name: "{{agentName}}",
        content: {
          text: "Activating RPG systems and content",
          actions: ["LOAD_RPG"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Enable RPG features in this world" },
      } as ActionExample,
      {
        name: "{{agentName}}",
        content: {
          text: "RPG content pack loaded successfully. RPG features are now available.",
          actions: ["LOAD_RPG"],
        },
      } as ActionExample,
    ],
  ],
};
