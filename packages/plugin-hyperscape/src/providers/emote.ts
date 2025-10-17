import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
} from "@elizaos/core";
import { EMOTES_LIST } from "../constants";

/**
 * Emote List Provider
 *
 * Provides a list of all available emotes/animations with descriptions.
 * This is a standard provider (always loaded) that gives the agent awareness
 * of available gestures and animations they can perform.
 *
 * @type {Provider}
 * @property {string} name - The name of the provider ("HYPERSCAPE_EMOTE_LIST")
 * @property {string} description - Description of the emote information
 * @property {boolean} dynamic - Standard provider (always loaded)
 * @property {number} position - The position of the provider (1)
 * @property {Function} get - Asynchronous function to get available emotes list
 */
export const hyperscapeEmoteProvider: Provider = {
  name: "HYPERSCAPE_EMOTE_LIST",
  description: "Lists all available emotes and their descriptions",
  dynamic: false,
  position: 1,
  get: async (_runtime: IAgentRuntime, _message: Memory) => {
    const animationListText = EMOTES_LIST.map(
      (e) => `- **${e.name}**: ${e.description}`,
    ).join("\n");
    const animationText = `## Available Animations\n${animationListText}`;

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
