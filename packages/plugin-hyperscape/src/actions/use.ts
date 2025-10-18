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
import { Entity } from "../types/core-types";
import type { World as HyperscapeWorld } from "@hyperscape/shared";
import type { HyperscapeService } from "../service";

interface UseActionResponse {
  itemName: string;
  entity: Entity;
}

const useAction: Action = {
  name: "HYPERSCAPE_USE_ITEM",
  description: "Use, equip, or wield an item in the Hyperscape world by interacting with it",
  similes: ["USE_ITEM", "EQUIP_ITEM", "WIELD_ITEM", "ACTIVATE_ITEM", "INTERACT_WITH_ITEM"],
  examples: [
    [
      {
        name: "{{user}}",
        content: { text: "use sword" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought: "User wants me to use a sword - I should find it and interact with it",
          text: "Using sword...",
          actions: ["HYPERSCAPE_USE_ITEM"],
          source: "hyperscape",
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user}}",
        content: { text: "equip armor" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought: "User wants me to equip armor - I should find and use it",
          text: "Equipping armor...",
          actions: ["HYPERSCAPE_USE_ITEM"],
          source: "hyperscape",
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user}}",
        content: { text: "wield the shield" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought: "User wants me to wield a shield - I should find it in the world and use it",
          text: "Wielding shield...",
          actions: ["HYPERSCAPE_USE_ITEM"],
          source: "hyperscape",
        },
      } as ActionExample,
    ],
  ],
  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const service = runtime.getService<HyperscapeService>("hyperscape");
    const world = service?.getWorld();

    // Check if service is connected and world.actions exists
    return !!service && service.isConnected() && !!world && !!world.actions;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _params?: Record<string, string | number | boolean>,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const service = runtime.getService<HyperscapeService>("hyperscape");

    if (!service || !service.isConnected()) {
      logger.error("[USE_ITEM] Hyperscape service not available or not connected");
      if (callback) {
        await callback({
          text: "Error: Cannot use item. Hyperscape connection unavailable.",
          actions: ["HYPERSCAPE_USE_ITEM"],
          source: "hyperscape",
        });
      }
      return {
        text: "Error: Cannot use item. Hyperscape connection unavailable.",
        success: false,
        values: { success: false, error: "service_unavailable" },
        data: { action: "HYPERSCAPE_USE_ITEM" },
      };
    }

    const world = service.getWorld();
    if (!world || !world.actions) {
      logger.error("[USE_ITEM] World or actions system not available");
      if (callback) {
        await callback({
          text: "Error: Cannot use item. World not available.",
          actions: ["HYPERSCAPE_USE_ITEM"],
          source: "hyperscape",
        });
      }
      return {
        text: "Error: Cannot use item. World not available.",
        success: false,
        values: { success: false, error: "world_unavailable" },
        data: { action: "HYPERSCAPE_USE_ITEM" },
      };
    }

    try {
      // Extract item name from user's message
      const messageText = message.content.text || "";
      const itemName = extractItemName(messageText);

      if (!itemName) {
        logger.warn("[USE_ITEM] No item name found in message:", messageText);
        if (callback) {
          await callback({
            text: "I couldn't determine which item you want to use. Please specify an item.",
            actions: ["HYPERSCAPE_USE_ITEM"],
            source: "hyperscape",
          });
        }
        return {
          text: "I couldn't determine which item you want to use. Please specify an item.",
          success: false,
          values: { success: false, error: "no_item_specified" },
          data: { action: "HYPERSCAPE_USE_ITEM", messageText },
        };
      }

      logger.info(`[USE_ITEM] Extracted item name: "${itemName}"`);

      // Find the item entity in the world
      const entity = findEntityByName(world, itemName);

      if (!entity) {
        logger.warn(`[USE_ITEM] Item "${itemName}" not found in world`);
        if (callback) {
          await callback({
            text: `I couldn't find "${itemName}" in the world.`,
            actions: ["HYPERSCAPE_USE_ITEM"],
            source: "hyperscape",
          });
        }
        return {
          text: `I couldn't find "${itemName}" in the world.`,
          success: false,
          values: { success: false, error: "item_not_found", itemName },
          data: { action: "HYPERSCAPE_USE_ITEM", itemName },
        };
      }

      // Check if the entity is usable
      if (!entity.data?.usable) {
        logger.warn(`[USE_ITEM] Entity "${entity.name}" (${entity.id}) is not usable`);
        if (callback) {
          await callback({
            text: `"${entity.name}" cannot be used or equipped.`,
            actions: ["HYPERSCAPE_USE_ITEM"],
            source: "hyperscape",
          });
        }
        return {
          text: `"${entity.name}" cannot be used or equipped.`,
          success: false,
          values: { success: false, error: "item_not_usable", itemName: entity.name },
          data: { action: "HYPERSCAPE_USE_ITEM", entityId: entity.id, entityName: entity.name },
        };
      }

      // Prepare response data
      const useResponse: UseActionResponse = {
        itemName: entity.name,
        entity: entity,
      };

      logger.info(`[USE_ITEM] Using item "${useResponse.itemName}" (${entity.id})`);

      // Send intermediate feedback to user
      if (callback) {
        await callback({
          text: `Using ${useResponse.itemName}...`,
          actions: ["HYPERSCAPE_USE_ITEM"],
          source: "hyperscape",
        });
      }

      // Actually perform the use action via world.actions
      world.actions.performAction(entity.id);

      logger.info(`[USE_ITEM] Successfully used "${useResponse.itemName}"`);

      // Return success result
      return {
        text: `Used ${useResponse.itemName}`,
        success: true,
        values: {
          success: true,
          itemName: useResponse.itemName,
          entityId: entity.id,
        },
        data: {
          action: "HYPERSCAPE_USE_ITEM",
          entityId: entity.id,
          entityName: useResponse.itemName,
        },
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("[USE_ITEM] Error:", errorMsg);

      if (callback) {
        await callback({
          text: `Failed to use item: ${errorMsg}`,
          actions: ["HYPERSCAPE_USE_ITEM"],
          source: "hyperscape",
        });
      }

      return {
        text: `Failed to use item: ${errorMsg}`,
        success: false,
        values: { success: false, error: "execution_failed", detail: errorMsg },
        data: { action: "HYPERSCAPE_USE_ITEM" },
      };
    }
  },
};

/**
 * Extract item name from text using regex patterns
 */
function extractItemName(text: string): string | null {
  // Look for patterns like "use the sword", "equip shield", "wield bow"
  // Patterns are case-insensitive (flag /i) and extract the item name from common phrases
  const patterns = [
    /(?:use|equip|wield|activate|employ)\s+(?:the\s+)?([a-zA-Z\s]+?)(?:\s+(?:please|now|$))/i,
    /(?:use|equip|wield|activate|employ)\s+([a-zA-Z\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Find an item in the world by name (fuzzy matching)
 */
function findEntityByName(world: HyperscapeWorld, name: string): Entity | null {
  // Direct exact name match
  for (const entity of world.entities.items.values()) {
    if (entity.name === name) {
      return entity;
    }
  }

  // Then try partial name match
  for (const entity of world.entities.items.values()) {
    const entityName = (entity.data?.name || entity.name || "").toLowerCase();
    if (
      entityName.includes(name.toLowerCase()) ||
      name.toLowerCase().includes(entityName)
    ) {
      return entity;
    }
  }

  return null;
}

export { useAction };
