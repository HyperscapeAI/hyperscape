import { type Provider, type IAgentRuntime, type Memory, logger } from "@elizaos/core";
import { EMOTES_LIST } from "../constants";

/**
 * Emote Provider
 *
 * Provides a list of available animations and emotes that the agent can perform
 * in the Hyperscape world for expressive non-verbal communication.
 *
 * **Position**: 3 (loads after core context)
 * **Dynamic Loading**: false (always available)
 */
export const hyperscapeEmoteProvider: Provider = {
  name: "HYPERSCAPE_EMOTE_LIST",
  description: "Lists all available emotes and their descriptions",
  dynamic: false,
  position: 3,
  get: async (_runtime: IAgentRuntime, _message: Memory) => {
    logger.debug('[EMOTE_LIST] Loading emote list')

    const animationListText = EMOTES_LIST.map(
      (e) => `- **${e.name}**: ${e.description}`,
    ).join("\n");
    const animationText = `## Available Animations\n${animationListText}`;

    logger.debug(`[EMOTE_LIST] Loaded ${EMOTES_LIST.length} emotes`)

    return {
      data: {
        emotes: EMOTES_LIST,
      },
      values: {
        hyperscapeAnimations: animationText,
      },
      text: animationText,
    };
  },
};
