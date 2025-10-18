import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  ModelType,
  logger,
} from "@elizaos/core";
import type {
  Component,
  HyperscapeActionDescriptor,
} from "../types/core-types";
import { HyperscapeService } from "../service";
import { World, Entity } from "../types/core-types";
import { DYNAMIC_ACTION_CONFIG } from "../config/manager-config";

/**
 * Retry helper with exponential backoff for LLM calls
 * Retries failed LLM calls with increasing delays between attempts
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = DYNAMIC_ACTION_CONFIG.MAX_RETRY_ATTEMPTS,
  baseDelay: number = DYNAMIC_ACTION_CONFIG.RETRY_DELAY_MS,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        // Last attempt failed, throw the error
        break;
      }

      // Calculate exponential backoff delay
      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.warn(
        `[DynamicActionLoader] Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All attempts failed - rethrow the last error
  throw lastError!;
}

/**
 * Timeout wrapper for promises
 * Rejects if promise doesn't resolve within specified timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise,
  ]);
}

/**
 * Robust JSON parsing that handles various response formats
 * Extracts JSON from code blocks, text, and handles malformed responses
 */
function parseJSONFromResponse(response: string | unknown): Record<string, unknown> {
  // Handle non-string responses
  if (typeof response !== 'string') {
    if (response && typeof response === 'object') {
      return response as Record<string, unknown>;
    }
    logger.warn('[DynamicActionLoader] Response is not a string or object');
    return {};
  }

  const text = response.trim();

  // Try direct JSON parse first
  try {
    return JSON.parse(text);
  } catch (e) {
    // Direct parse failed, try extracting from various formats
  }

  // Try to extract JSON from code blocks (```json ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch (e) {
      logger.debug('[DynamicActionLoader] Failed to parse JSON from code block');
    }
  }

  // Try to extract first JSON object from text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      logger.debug('[DynamicActionLoader] Failed to parse extracted JSON object');
    }
  }

  // All parsing attempts failed
  logger.warn('[DynamicActionLoader] Could not parse JSON from LLM response');
  return {};
}

/**
 * CLAUDE.md Compliance: Strong typing for dynamic action results
 */
export interface DynamicActionResult {
  success: boolean;
  pending?: boolean;
  message?: string;
  error?: string;
  data?: Record<string, string | number | boolean | unknown>;
}

export interface DynamicActionResponse {
  text: string;
  success: boolean;
  data: {
    action: string;
    parameters: Record<string, unknown>;
    result: DynamicActionResult;
  };
}

// HyperscapeActionDescriptor is now imported from core-types

/**
 * Manages dynamic discovery and registration of actions from Hyperscape worlds
 */
export class DynamicActionLoader {
  private runtime: IAgentRuntime;
  private registeredActions: Map<string, Action> = new Map();
  private worldActions: Map<string, HyperscapeActionDescriptor> = new Map();

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  /**
   * Discovers available actions from a Hyperscape world
   */
  async discoverActions(world: World): Promise<HyperscapeActionDescriptor[]> {
    logger.info("[DynamicActionLoader] Discovering actions from world...");

    // Check if world exposes actions through a specific protocol
    const worldActions = world.actions as {
      getAvailableActions?: () => Promise<HyperscapeActionDescriptor[]>;
    };
    if (worldActions?.getAvailableActions) {
      const actions = await worldActions.getAvailableActions();
      logger.info(
        `[DynamicActionLoader] Found ${actions.length} actions from world`,
      );
      return actions;
    }

    const actionProviders: HyperscapeActionDescriptor[] = [];
    world.entities.items.forEach((entity: Entity) => {
      if (entity.components) {
        const actionComponent = Array.from(entity.components.values()).find(
          (c: Component) => c.type === "action-provider",
        ) as Component & {
          data?: { actions?: HyperscapeActionDescriptor[] };
        };
        if (actionComponent?.data?.actions) {
          actionProviders.push(...actionComponent.data.actions);
        }
      }
    });

    logger.info(
      `[DynamicActionLoader] Found ${actionProviders.length} actions from entity scan`,
    );
    return actionProviders;
  }

  /**
   * Registers a discovered action with the runtime
   */
  async registerAction(
    descriptor: HyperscapeActionDescriptor,
    runtime: IAgentRuntime,
  ): Promise<void> {
    logger.info(`[DynamicActionLoader] Registering action: ${descriptor.name}`);

    // Create Action object from descriptor
    const action: Action = {
      name: descriptor.name,
      description: descriptor.description,
      similes: this.generateSimiles(descriptor),

      validate: async (runtime: IAgentRuntime): Promise<boolean> => {
        const service = runtime.getService<HyperscapeService>(
          HyperscapeService.serviceName,
        );
        return !!service && service.isConnected() && !!service.getWorld();
      },

      handler: this.createDynamicHandler(descriptor),

      examples: this.generateExamples(descriptor) as ActionExample[][],
    };

    // Store the action
    this.registeredActions.set(descriptor.name, action);
    this.worldActions.set(descriptor.name, descriptor);

    // Register with runtime
    await runtime.registerAction(action);
    logger.info(
      `[DynamicActionLoader] Successfully registered action: ${descriptor.name}`,
    );
  }

  /**
   * Unregisters an action from the runtime
   */
  async unregisterAction(
    actionName: string,
    runtime: IAgentRuntime,
  ): Promise<void> {
    logger.info(`[DynamicActionLoader] Unregistering action: ${actionName}`);

    this.registeredActions.delete(actionName);
    this.worldActions.delete(actionName);

    const index = runtime.actions.findIndex(
      (a: Action) => a.name === actionName,
    );
    if (index !== -1) {
      runtime.actions.splice(index, 1);
    }
  }

  /**
   * Creates a dynamic handler for a discovered action
   */
  private createDynamicHandler(descriptor: HyperscapeActionDescriptor) {
    return async (
      runtime: IAgentRuntime,
      message: Memory,
      state?: State,
      _options?: {},
      callback?: HandlerCallback,
    ): Promise<DynamicActionResponse> => {
      logger.info(`[DynamicAction] Executing ${descriptor.name}`);

      const service = runtime.getService<HyperscapeService>(
        HyperscapeService.serviceName,
      )!;
      const world = service.getWorld()!;

      // Extract parameters from message or state
      const params = await this.extractParameters(
        descriptor,
        message,
        state,
        runtime,
      );

      // Execute the action through world interface
      let result: DynamicActionResult;
      const worldActions = world.actions as {
        execute?: (name: string, params: Record<string, unknown>) => Promise<DynamicActionResult>;
      };
      if (worldActions?.execute) {
        result = await worldActions.execute(descriptor.name, params);
      } else {
        world.network.send("executeAction", {
          action: descriptor.name,
          parameters: params,
        });
        result = { success: true, pending: true };
      }

      // Generate response based on result
      const responseText = await this.generateResponse(
        descriptor,
        params,
        result,
        runtime,
        state,
      );

      if (callback) {
        await callback({
          text: responseText,
          metadata: { action: descriptor.name, result },
        });
      }

      return {
        text: responseText,
        success: true,
        data: { action: descriptor.name, parameters: params, result },
      };
    };
  }

  /**
   * Extracts parameters for an action from the message and state using LLM
   * Uses intelligent context-aware parsing instead of naive regex matching
   */
  private async extractParameters(
    descriptor: HyperscapeActionDescriptor,
    message: Memory,
    state: State | undefined,
    runtime: IAgentRuntime,
  ): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {};

    // If no parameters required, return early
    if (!descriptor.parameters || descriptor.parameters.length === 0) {
      return params;
    }

    const messageText = message.content?.text || "";

    // Build LLM prompt for intelligent parameter extraction
    const paramDescriptions = descriptor.parameters
      .map(p => `  - ${p.name} (${p.type}): ${p.description || 'No description'}${p.required ? ' [REQUIRED]' : ' [OPTIONAL]'}${p.default !== undefined ? ` [DEFAULT: ${p.default}]` : ''}`)
      .join('\n');

    const extractionPrompt = `Extract parameters for the action "${descriptor.name}" from the user's message.

Action Description: ${descriptor.description}

Parameters to extract:
${paramDescriptions}

User Message: "${messageText}"

${state?.text ? `\nContext:\n${state.text}\n` : ''}

Respond with a JSON object containing the extracted parameters. Only include parameters that you can confidently extract from the message or context. Use default values when specified and the parameter is not mentioned.

Example response format:
{
  "paramName1": "value1",
  "paramName2": 123
}

JSON Response:`;

    try {
      logger.debug(`[DynamicActionLoader] Extracting parameters using LLM for action: ${descriptor.name}`);

      // Wrap LLM call with retry and timeout
      const response = await retryWithBackoff(async () => {
        return await withTimeout(
          runtime.useModel(
            ModelType.TEXT_LARGE,
            {
              prompt: extractionPrompt,
              max_tokens: 500,
              temperature: DYNAMIC_ACTION_CONFIG.PARAMETER_EXTRACTION_TEMPERATURE,
              stop: [],
            }
          ),
          DYNAMIC_ACTION_CONFIG.LLM_TIMEOUT_MS,
          `LLM parameter extraction timed out after ${DYNAMIC_ACTION_CONFIG.LLM_TIMEOUT_MS}ms`
        );
      });

      // Parse response using robust JSON parsing
      const parsedParams = parseJSONFromResponse(response);

      // Validate and assign parameters with hardened type coercion
      for (const param of descriptor.parameters) {
        if (param.name in parsedParams) {
          // Type coercion based on parameter definition
          let value = parsedParams[param.name];

          if (param.type === 'number') {
            // Harden number coercion - fail fast on invalid values
            if (typeof value === 'string') {
              // Strict validation: trim, match valid number format, then coerce
              const trimmed = value.trim();
              const validNumberRegex = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

              if (!validNumberRegex.test(trimmed)) {
                if (param.required) {
                  throw new Error(
                    `[DynamicActionLoader] Required parameter '${param.name}' has invalid number format: "${value}"`
                  );
                }
                logger.warn(
                  `[DynamicActionLoader] Invalid number format for parameter '${param.name}' in action ${descriptor.name}: "${value}"`
                );
                if (param.default !== undefined) {
                  params[param.name] = param.default;
                }
                continue;
              }

              const coerced = Number(trimmed);
              if (!Number.isFinite(coerced)) {
                if (param.required) {
                  throw new Error(
                    `[DynamicActionLoader] Required parameter '${param.name}' has invalid number value: "${value}"`
                  );
                }
                logger.warn(
                  `[DynamicActionLoader] Invalid number for parameter '${param.name}' in action ${descriptor.name}: "${value}"`
                );
                if (param.default !== undefined) {
                  params[param.name] = param.default;
                }
                continue;
              }
              value = coerced;
            } else if (typeof value === 'number') {
              if (!Number.isFinite(value)) {
                if (param.required) {
                  throw new Error(
                    `[DynamicActionLoader] Required parameter '${param.name}' has invalid number value: ${value}`
                  );
                }
                logger.warn(
                  `[DynamicActionLoader] Invalid number for parameter '${param.name}' in action ${descriptor.name}: ${value}`
                );
                if (param.default !== undefined) {
                  params[param.name] = param.default;
                }
                continue;
              }
            } else {
              // Not a string or number - fail if required
              if (param.required) {
                throw new Error(
                  `[DynamicActionLoader] Required parameter '${param.name}' must be a number, got: ${typeof value}`
                );
              }
              logger.warn(
                `[DynamicActionLoader] Parameter '${param.name}' expected number, got ${typeof value}`
              );
              if (param.default !== undefined) {
                params[param.name] = param.default;
              }
              continue;
            }
          } else if (param.type === 'boolean') {
            // Harden boolean coercion - fail fast on invalid values
            if (typeof value === 'string') {
              const normalized = value.toLowerCase().trim();
              if (normalized !== 'true' && normalized !== 'false') {
                if (param.required) {
                  throw new Error(
                    `[DynamicActionLoader] Required parameter '${param.name}' has invalid boolean value: "${value}"`
                  );
                }
                logger.warn(
                  `[DynamicActionLoader] Invalid boolean for parameter '${param.name}' in action ${descriptor.name}: "${value}"`
                );
                if (param.default !== undefined) {
                  params[param.name] = param.default;
                }
                continue;
              }
              value = normalized === 'true';
            } else if (typeof value !== 'boolean') {
              // Not a string or boolean - fail if required
              if (param.required) {
                throw new Error(
                  `[DynamicActionLoader] Required parameter '${param.name}' must be a boolean, got: ${typeof value}`
                );
              }
              logger.warn(
                `[DynamicActionLoader] Parameter '${param.name}' expected boolean, got ${typeof value}`
              );
              if (param.default !== undefined) {
                params[param.name] = param.default;
              }
              continue;
            }
          }

          params[param.name] = value;
        } else if (param.default !== undefined) {
          // Use default value
          params[param.name] = param.default;
        } else if (param.required) {
          // Required parameter missing - fail fast
          throw new Error(
            `[DynamicActionLoader] Required parameter '${param.name}' not found for action ${descriptor.name}`
          );
        }
      }

      logger.debug(`[DynamicActionLoader] Extracted parameters: ${JSON.stringify(params)}`);
      return params;

    } catch (error) {
      logger.error(`[DynamicActionLoader] Error extracting parameters with LLM:`, error);

      // Check if any required parameters are missing - if so, re-throw
      const missingRequired = descriptor.parameters.filter(p => p.required && !(p.name in params));
      if (missingRequired.length > 0) {
        throw new Error(
          `[DynamicActionLoader] Failed to extract required parameters for ${descriptor.name}: ${missingRequired.map(p => p.name).join(', ')}`
        );
      }

      // Fallback to default values for all parameters
      for (const param of descriptor.parameters) {
        if (param.default !== undefined && !(param.name in params)) {
          params[param.name] = param.default;
        }
      }

      return params;
    }
  }

  /**
   * Generates context-aware response text for an executed action using LLM
   * Creates natural, character-consistent responses instead of generic templates
   */
  private async generateResponse(
    descriptor: HyperscapeActionDescriptor,
    params: Record<string, unknown>,
    result: DynamicActionResult,
    runtime: IAgentRuntime,
    state?: State,
  ): Promise<string> {
    // Quick fallback for failures
    if (!result.success) {
      const errorMessage = result.error || "Unknown error";
      logger.warn(`[DynamicActionLoader] Action ${descriptor.name} failed: ${errorMessage}`);

      // Generate contextual error response
      try {
        const characterName = Array.isArray(runtime.character.name)
          ? runtime.character.name[0]
          : runtime.character.name;

        const errorPrompt = `You are ${characterName}. You just tried to ${descriptor.description.toLowerCase()} but it failed with error: "${errorMessage}".

Generate a brief, in-character response (1-2 sentences) explaining what went wrong. Be natural and stay in character.

Response:`;

        const response = await retryWithBackoff(async () => {
          return await withTimeout(
            runtime.useModel(
              ModelType.TEXT_LARGE,
              {
                prompt: errorPrompt,
                max_tokens: 100,
                temperature: DYNAMIC_ACTION_CONFIG.RESPONSE_GENERATION_TEMPERATURE,
                stop: [],
              }
            ),
            DYNAMIC_ACTION_CONFIG.LLM_TIMEOUT_MS,
            `LLM error response generation timed out after ${DYNAMIC_ACTION_CONFIG.LLM_TIMEOUT_MS}ms`
          );
        });

        return typeof response === 'string' ? response.trim() : `Failed to ${descriptor.name}: ${errorMessage}`;
      } catch (error) {
        logger.error(`[DynamicActionLoader] Error generating failure response:`, error);
        return `Failed to ${descriptor.name}: ${errorMessage}`;
      }
    }

    // Generate contextual success response using LLM
    try {
      const characterName = Array.isArray(runtime.character.name)
        ? runtime.character.name[0]
        : runtime.character.name;

      const characterBio = Array.isArray(runtime.character.bio)
        ? runtime.character.bio.join(" ")
        : runtime.character.bio;

      const paramsDescription = Object.entries(params)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      const responsePrompt = `You are ${characterName}. ${characterBio}

You just successfully performed: ${descriptor.description}
${paramsDescription ? `With parameters: ${paramsDescription}` : ''}
${result.message ? `Result: ${result.message}` : ''}

${state?.text ? `\nCurrent context:\n${state.text}\n` : ''}

Generate a brief, in-character response (1-2 sentences) about completing this action. Be natural, stay in character, and reference the specific action you performed.

Response:`;

      logger.debug(`[DynamicActionLoader] Generating contextual response for ${descriptor.name}`);

      const response = await retryWithBackoff(async () => {
        return await withTimeout(
          runtime.useModel(
            ModelType.TEXT_LARGE,
            {
              prompt: responsePrompt,
              max_tokens: 150,
              temperature: DYNAMIC_ACTION_CONFIG.RESPONSE_GENERATION_TEMPERATURE,
              stop: [],
            }
          ),
          DYNAMIC_ACTION_CONFIG.LLM_TIMEOUT_MS,
          `LLM success response generation timed out after ${DYNAMIC_ACTION_CONFIG.LLM_TIMEOUT_MS}ms`
        );
      });

      const responseText = typeof response === 'string'
        ? response.trim()
        : (response && typeof response === 'object' && 'text' in response)
          ? String((response as { text: unknown }).text)
          : '';

      // Fallback if LLM returns empty response
      if (!responseText) {
        return `Successfully ${descriptor.description.toLowerCase()}${result.message ? ": " + result.message : ""}`;
      }

      return responseText;

    } catch (error) {
      logger.error(`[DynamicActionLoader] Error generating success response:`, error);
      return `Successfully ${descriptor.description.toLowerCase()}${result.message ? ": " + result.message : ""}`;
    }
  }

  /**
   * Generates similes for an action based on its descriptor
   */
  private generateSimiles(descriptor: HyperscapeActionDescriptor): string[] {
    const similes: string[] = [];

    // Generate based on category
    switch (descriptor.category) {
      case "combat":
        similes.push("FIGHT", "ATTACK", "BATTLE");
        break;
      case "inventory":
        similes.push("MANAGE_ITEMS", "INVENTORY");
        break;
      case "skills":
        similes.push("TRAIN", "PRACTICE", "SKILL");
        break;
      case "quest":
        similes.push("QUEST", "MISSION", "TASK");
        break;
      case "social":
        similes.push("INTERACT", "COMMUNICATE");
        break;
      case "movement":
        similes.push("MOVE", "NAVIGATE", "GO");
        break;
    }

    // Add name variations
    const words = descriptor.name.split("_");
    if (words.length > 1) {
      similes.push(words.join(" "));
      similes.push(
        words
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(""),
      );
    }

    return similes;
  }

  /**
   * Generates examples for an action from its descriptor
   */
  private generateExamples(
    descriptor: HyperscapeActionDescriptor,
  ): ActionExample[][] {
    const examples: ActionExample[][] = [];

    // Use provided examples
    for (const exampleText of descriptor.examples || []) {
      examples.push([
        {
          name: "user",
          content: { text: exampleText },
        },
        {
          name: "assistant",
          content: {
            text: `I'll ${descriptor.name.toLowerCase().replace(/_/g, " ")} for you.`,
            action: descriptor.name,
          },
        },
      ]);
    }

    // Generate category-specific examples if none provided
    if (examples.length === 0) {
      switch (descriptor.category) {
        case "combat":
          examples.push([
            {
              name: "user",
              content: { text: `Attack the goblin` },
            },
            {
              name: "assistant",
              content: {
                text: `Engaging in combat!`,
                action: descriptor.name,
              },
            },
          ]);
          break;
        // Add more category-specific examples as needed
      }
    }

    return examples;
  }

  /**
   * Gets all registered actions
   */
  getRegisteredActions(): Map<string, Action> {
    return new Map(this.registeredActions);
  }

  /**
   * Gets world action descriptors
   */
  getWorldActions(): Map<string, HyperscapeActionDescriptor> {
    return new Map(this.worldActions);
  }

  /**
   * Clears all registered actions
   */
  clear(): void {
    this.registeredActions.clear();
    this.worldActions.clear();
  }
}
