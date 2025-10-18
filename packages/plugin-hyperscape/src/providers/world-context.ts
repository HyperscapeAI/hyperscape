/**
 * World Context Provider - Injects Hyperscape world state into agent context
 *
 * This provider supplies compact, focused world information to the LLM context:
 * - Agent position, rotation, scale
 * - Nearby entities (within 10m)
 * - Current action/equipment status
 * - Environmental context
 *
 * Unlike the verbose `world.ts` provider, this is designed for concise,
 * action-relevant context that doesn't overwhelm the LLM prompt.
 *
 * **Position in Provider Chain**: 0 (default)
 * - Executes after `actions` provider (position: -1)
 * - Executes before `skills` provider (position: 1)
 *
 * **Dynamic Loading**: true (only loads when connected to world)
 */

import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { logger } from "@elizaos/core";
import type { HyperscapeService } from "../service";

/**
 * Nearby entity data structure
 */
interface NearbyEntityData {
  id?: string;
  type?: string;
  data?: {
    name?: string;
  };
  distance?: number;
  position?: {
    x: number;
    y: number;
    z: number;
  };
}

/**
 * World Context Provider
 *
 * Provides compact world state for agent decision-making.
 * Automatically injected into state.text during runtime.composeState().
 */
export const worldContextProvider: Provider = {
  name: "HYPERSCAPE_WORLD_CONTEXT",
  description:
    "Current agent position and nearby entities in the Hyperscape world",
  dynamic: true, // Only load when connected to world
  position: 0, // Default position (standard execution order)

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<{
    text?: string;
    values?: Record<string, unknown>;
    data?: Record<string, unknown>;
  }> => {
    logger.debug("[WorldContextProvider] Getting world context");

    // Get Hyperscape service
    const service =
      runtime.getService<HyperscapeService>("hyperscape");

    if (!service) {
      logger.debug("[WorldContextProvider] Service not available");
      return { text: "" };
    }

    // Get world instance
    const world = service.getWorld();

    if (!world?.entities?.player) {
      logger.debug("[WorldContextProvider] World or player not available");
      return { text: "" };
    }

    const player = world.entities.player;
    const position = player.position;

    if (!position) {
      logger.debug("[WorldContextProvider] Player position not available");
      return { text: "" };
    }

    // Get nearby entities (within 10m radius)
    const nearbyEntities =
      world.getNearbyEntities?.(position, 10) || [];

    logger.debug(
      `[WorldContextProvider] Found ${nearbyEntities.length} nearby entities`,
    );

    // Format world context (compact format)
    const contextParts: string[] = [
      "## Agent Location",
      `Position: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`,
    ];

    // Add nearby entities if present
    if (nearbyEntities.length > 0) {
      contextParts.push(`\n## Nearby Entities (${nearbyEntities.length})`);

      // Show first 5 entities
      nearbyEntities.slice(0, 5).forEach((entity) => {
        const entityData = entity as NearbyEntityData;

        const entityType = entityData.type || "unknown";
        const entityName = entityData.data?.name || entityType;
        const distance = entityData.distance
          ? `${entityData.distance.toFixed(1)}m`
          : "nearby";

        contextParts.push(`- ${entityName} at ${distance}`);
      });

      // Indicate if there are more
      if (nearbyEntities.length > 5) {
        contextParts.push(`... and ${nearbyEntities.length - 5} more`);
      }
    }

    const contextText = contextParts.join("\n");

    logger.debug(`[WorldContextProvider] Context length: ${contextText.length} chars`);

    return {
      text: contextText,
      values: {
        agentX: position.x,
        agentY: position.y,
        agentZ: position.z,
        nearbyCount: nearbyEntities.length,
      },
      data: {
        position: { x: position.x, y: position.y, z: position.z },
        nearbyEntities: nearbyEntities.slice(0, 10).map((entity) => {
          const entityData = entity as NearbyEntityData;

          return {
            id: entityData.id,
            type: entityData.type,
            name: entityData.data?.name,
            distance: entityData.distance,
            position: entityData.position,
          };
        }),
      },
    };
  },
};
