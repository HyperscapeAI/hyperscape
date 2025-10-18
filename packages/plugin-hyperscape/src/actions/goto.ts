import {
  type Action,
  type ActionResult,
  type ActionExample,
  composePromptFromState,
  ModelType,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from "@elizaos/core";
import { HyperscapeService } from "../service";
import type { World } from "../types/core-types";

// Typed navigation event constants
export const NAVIGATION_STARTED = 'rpg:navigation:started' as const;
export const NAVIGATION_COMPLETED = 'rpg:navigation:completed' as const;
export const NAVIGATION_FAILED = 'rpg:navigation:failed' as const;

// Navigation event payload interfaces
export interface NavigationStartedPayload {
  playerId: string;
  targetEntityId?: string;
  targetPosition?: { x: number; z: number };
  navigationType: 'entity' | 'position';
}

export interface NavigationCompletedPayload {
  playerId: string;
  success: boolean;
}

export interface NavigationFailedPayload {
  playerId: string;
  error?: string;
}

// Type map for event emissions
export interface NavigationEventMap {
  [NAVIGATION_STARTED]: NavigationStartedPayload;
  [NAVIGATION_COMPLETED]: NavigationCompletedPayload;
  [NAVIGATION_FAILED]: NavigationFailedPayload;
}

export enum NavigationType {
  ENTITY = "entity",
  POSITION = "position",
}

// Configurable navigation timeout
const DEFAULT_NAVIGATION_TIMEOUT_MS = 10000;

/**
 * Helper function to execute navigation with typed events
 */
async function executeNavigationWithEvents(
  world: World,
  playerId: string,
  navigationType: 'entity' | 'position',
  options: {
    targetEntityId?: string;
    targetPosition?: { x: number; z: number };
    timeout?: number;
  },
  startNavigation: () => void,
): Promise<{ success: boolean; error?: string }> {
  const timeoutMs = options.timeout || DEFAULT_NAVIGATION_TIMEOUT_MS;

  // Emit navigation started event
  const startPayload: NavigationStartedPayload = {
    playerId,
    targetEntityId: options.targetEntityId,
    targetPosition: options.targetPosition,
    navigationType,
  };
  world.emit(NAVIGATION_STARTED, startPayload);

  // Wrap navigation in promise with event listeners
  return new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
    const completionHandler = (data: NavigationCompletedPayload) => {
      if (data.playerId === playerId) {
        logger.info(`[GOTO] Navigation ${data.success ? 'completed' : 'failed'}`);
        cleanup();
        resolve({ success: data.success });
      }
    };

    const failureHandler = (data: NavigationFailedPayload) => {
      if (data.playerId === playerId) {
        logger.error(`[GOTO] Navigation failed: ${data.error || 'Unknown error'}`);
        cleanup();
        resolve({ success: false, error: data.error });
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      world.off(NAVIGATION_COMPLETED, completionHandler);
      world.off(NAVIGATION_FAILED, failureHandler);
    };

    const timeout = setTimeout(() => {
      cleanup();
      const errorMsg = `Navigation timeout after ${timeoutMs}ms`;
      logger.error(`[GOTO] ${errorMsg}`);
      reject(new Error(errorMsg));
    }, timeoutMs);

    world.on(NAVIGATION_COMPLETED, completionHandler);
    world.on(NAVIGATION_FAILED, failureHandler);

    // Start navigation
    try {
      startNavigation();
    } catch (error) {
      cleanup();
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[GOTO] Failed to start navigation: ${errorMsg}`);
      reject(error);
    }
  });
}

const navigationTargetExtractionTemplate = (thoughts?: string) => {
  return `
# Task:
Decide whether the agent should navigate to a specific **Entity** or a direct **Position** in the Hyperscape world.

# Navigation Types:
- "entity": Navigate to a known entity by its ID.
- "position": Navigate to a specific X,Z coordinate (e.g., from user input like "go to the fountain at 5, 10").

# Constraints:
- Only use **Entity IDs** listed in the current world state.
- Positions must be 2D coordinates in the format { "x": <number>, "z": <number> }.
- Never invent or assume entities that are not in the world state.
- Use "position" only if a direct coordinate is clearly specified or derivable.

# Agent Thought:
${thoughts || "None"}

# World State:
{{hyperscapeStatus}}

# Instructions:
You are **{{agentName}}**, a virtual agent in a Hyperscape world. Analyze the conversation and determine the most appropriate navigation type and target.

Return your answer as a JSON object in **one** of the following forms:

\`\`\`json
{
  "navigationType": "${NavigationType.ENTITY}",
  "parameter": { "entityId": "<string>" }
}
\`\`\`

or

\`\`\`json
{
  "navigationType": "${NavigationType.POSITION}",
  "parameter": { "position": { "x": 5, "z": 10 } }
}
\`\`\`

Only return the JSON object. Do not include any extra text or comments.
  `.trim();
};

export const hyperscapeGotoEntityAction: Action = {
  name: "HYPERSCAPE_GOTO_ENTITY",
  similes: ["GO_TO_ENTITY_IN_WORLD", "MOVE_TO_ENTITY", "NAVIGATE_TO_ENTITY"],
  description:
    "Moves your character to a specified player, object, or world position; use when you need to approach something or go somewhere before interacting. Can be chained with USE_ITEM or PERCEPTION actions for complex navigation scenarios.",
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const service = runtime.getService<HyperscapeService>(
      HyperscapeService.serviceName,
    );
    // Check if connected and if controls are available
    return !!service && service.isConnected() && !!service.getWorld()?.controls;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: { entityId?: string },
    callback?: HandlerCallback,
    responses?: Memory[],
  ): Promise<ActionResult> => {
    const thoughtSnippets =
      responses
        ?.map((res) => res.content?.thought)
        .filter(Boolean)
        .join("\n") ?? "";

    const service = runtime.getService<HyperscapeService>(
      HyperscapeService.serviceName,
    )!;
    const world = service.getWorld()!;
    const controls = world.controls!;
    const player = world.entities.player;

    const extractionState = await runtime.composeState(message);
    const prompt = composePromptFromState({
      state: extractionState,
      template: navigationTargetExtractionTemplate(thoughtSnippets),
    });

    const navigationResult = await runtime.useModel(ModelType.OBJECT_LARGE, {
      prompt,
    });
    logger.info("[GOTO Action] Navigation target extracted:", navigationResult);

    const { navigationType, parameter } = navigationResult;

    switch (navigationType) {
      case NavigationType.ENTITY: {
        const entityId = parameter.entityId;

        logger.info(`[GOTO] Navigating to entity ${entityId}`);

        // Execute navigation with events
        const navResult = await executeNavigationWithEvents(
          world,
          player.id,
          'entity',
          { targetEntityId: entityId },
          () => {
            controls.followEntity(entityId);
            logger.info(`[GOTO] Started following entity ${entityId}`);
          },
        );

        if (!navResult.success) {
          if (callback) {
            await callback({
              text: `Failed to reach entity: ${navResult.error || 'Unknown error'}`,
              actions: ["HYPERSCAPE_GOTO_ENTITY"],
              source: "hyperscape",
            });
          }

          return {
            text: `Failed to reach entity: ${navResult.error || 'Unknown error'}`,
            success: false,
            values: { success: false, error: navResult.error },
            data: { action: "HYPERSCAPE_GOTO_ENTITY" },
          };
        }

        const targetEntity = world.entities.items.get(parameter.entityId);

        // Handle case where entity was deleted/despawned after navigation started
        if (!targetEntity) {
          logger.warn(`[GOTO] Target entity ${parameter.entityId} not found after navigation - may have been deleted`);

          const missingEntityResponse = {
            text: `Reached the location, but the entity is no longer there.`,
            actions: ["HYPERSCAPE_GOTO_ENTITY"],
            source: "hyperscape",
          };
          if (callback) {
            await callback(missingEntityResponse);
          }

          return {
            text: missingEntityResponse.text,
            success: true, // Navigation succeeded, entity just missing
            values: {
              success: true,
              navigationType: "entity",
              targetEntity: parameter.entityId,
              entityMissing: true
            },
            data: {
              action: "HYPERSCAPE_GOTO_ENTITY",
              targetEntityId: parameter.entityId,
              entityMissing: true
            },
          };
        }

        const entityName =
          targetEntity.data.name ||
          (
            targetEntity.data as {
              metadata?: { hyperscape?: { name?: string } };
            }
          )?.metadata?.hyperscape?.name ||
          `entity ${entityId}`;

        const successResponse = {
          text: `Arrived at ${entityName}.`,
          actions: ["HYPERSCAPE_GOTO_ENTITY"],
          source: "hyperscape",
        };
        if (callback) {
          await callback(successResponse);
        }

        return {
          text: successResponse.text,
          success: true,
          values: {
            success: true,
            navigationType: "entity",
            targetEntity: entityId,
            entityName,
          },
          data: {
            action: "HYPERSCAPE_GOTO_ENTITY",
            targetEntityId: entityId,
          },
        };
      }

      case NavigationType.POSITION: {
        const pos = parameter.position;

        logger.info(`[GOTO] Navigating to position (${pos.x}, ${pos.z})`);

        // Execute navigation with events
        const navResult = await executeNavigationWithEvents(
          world,
          player.id,
          'position',
          { targetPosition: pos },
          () => {
            controls.goto(pos.x, pos.z);
            logger.info(`[GOTO] Started navigation to position (${pos.x}, ${pos.z})`);
          },
        );

        if (!navResult.success) {
          if (callback) {
            await callback({
              text: `Failed to reach position: ${navResult.error || 'Unknown error'}`,
              actions: ["HYPERSCAPE_GOTO_ENTITY"],
              source: "hyperscape",
            });
          }

          return {
            text: `Failed to reach position: ${navResult.error || 'Unknown error'}`,
            success: false,
            values: { success: false, error: navResult.error },
            data: { action: "HYPERSCAPE_GOTO_ENTITY" },
          };
        }

        const positionResponse = {
          text: `Reached position (${pos.x}, ${pos.z}).`,
          actions: ["HYPERSCAPE_GOTO_ENTITY"],
          source: "hyperscape",
        };
        if (callback) {
          await callback(positionResponse);
        }

        return {
          text: positionResponse.text,
          success: true,
          values: {
            success: true,
            navigationType: "position",
            targetPosition: pos,
          },
          data: {
            action: "HYPERSCAPE_GOTO_ENTITY",
            targetX: pos.x,
            targetZ: pos.z,
          },
        };
      }

      default:
        throw new Error(`Unsupported navigation type: ${navigationType}`);
    }
  },
  examples: [
    [
      {
        name: "user",
        content: {
          text: "Go to Bob",
        },
      } as ActionExample,
      {
        name: "agent",
        content: {
          text: "Navigating towards Bob...",
          actions: ["HYPERSCAPE_GOTO_ENTITY"],
          thought:
            "User wants me to go to Bob - I need to find Bob's entity in the world and navigate there",
        },
      } as ActionExample,
    ],
    [
      {
        name: "user",
        content: {
          text: "Find entity abcdef",
        },
      } as ActionExample,
      {
        name: "agent",
        content: {
          text: "Navigating towards entity abcdef...",
          actions: ["HYPERSCAPE_GOTO_ENTITY"],
          thought:
            "User is asking me to navigate to a specific entity ID - I should move to that location",
        },
      } as ActionExample,
    ],
    [
      {
        name: "user",
        content: {
          text: "Move to position 10, 15",
        },
      } as ActionExample,
      {
        name: "agent",
        content: {
          text: "Navigating to position (10, 15)...",
          actions: ["HYPERSCAPE_GOTO_ENTITY"],
          thought:
            "User specified a direct coordinate - I should navigate to that position",
        },
      } as ActionExample,
    ],
  ],
};
