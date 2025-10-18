import type {
  Action,
  IAgentRuntime,
  Memory,
  Provider,
  State,
} from "@elizaos/core";
import {
  addHeader,
  composeActionExamples,
  formatActionNames,
  logger,
} from "@elizaos/core";
import { getHyperscapeActions, formatActions } from "../utils";

/**
 * Actions Provider
 *
 * Provides available response actions based on runtime validation.
 * This provider validates all registered actions and supplies action names,
 * descriptions, and examples to help the LLM choose appropriate actions.
 *
 * **Position**: -1 (executes before world state providers)
 * **Dynamic Loading**: false (always available)
 */
export const hyperscapeActionsProvider: Provider = {
  name: "ACTIONS",
  description: "Possible response actions",
  dynamic: false,
  position: -1,
  get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    logger.debug('[ACTIONS] Retrieving available actions')

    // Standard action loading (validates all actions)
    const actionsData = await getHyperscapeActions(runtime, message, state);

    // NOTE: Smart filtering is available via getHyperscapeActionsOptimized()
    // Reduces context by 50-70% by filtering: verbose descriptions, large example payloads,
    // rarely-used optional parameters, and non-essential metadata fields. Core action
    // signatures and mandatory parameters are preserved. May affect edge-cases where
    // optional context is critical for rare actions. To enable optimized mode:
    // const actionsData = await getHyperscapeActionsOptimized(runtime, message, state);

    const actionNames = `Possible response actions: ${formatActionNames(actionsData)}`;
    const actions =
      actionsData.length > 0
        ? addHeader("# Available Actions", formatActions(actionsData))
        : "";
    const actionExamples =
      actionsData.length > 0
        ? addHeader("# Action Examples", composeActionExamples(actionsData as Action[], 10))
        : "";

    const data = { actionsData };
    const values = { actions, actionNames, actionExamples };
    const text = [actionNames, actionExamples, actions]
      .filter(Boolean)
      .join("\n\n");

    logger.debug(`[ACTIONS] Loaded ${actionsData.length} actions, context length: ${text.length} chars`)

    return { data, values, text };
  },
};
