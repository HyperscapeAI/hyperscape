import {
  type Action,
  type ActionExample,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from "@elizaos/core";
import type { ActionHandlerOptions } from "../types/core-types";

/**
 * Action representing the IGNORE action. This action is used when ignoring the user in a conversation.
 *
 * @type {Action}
 * @property {string} name - The name of the action, which is "IGNORE".
 * @property {string[]} similes - An array of related similes for the action.
 * @property {Function} validate - Asynchronous function that validates the action.
 * @property {string} description - Description of when to use the IGNORE action in a conversation.
 * @property {Function} handler - Asynchronous function that handles the action logic.
 * @property {ActionExample[][]} examples - Array of examples demonstrating the usage of the IGNORE action.
 */
/**
 * Represents an action called 'IGNORE'.
 *
 * This action is used to ignore the user in a conversation. It should be used when the user is aggressive, creepy, or when the conversation has naturally ended.
 * Avoid using this action if the user has engaged directly or if there is a need to communicate with them. Use IGNORE only when the user should be ignored.
 *
 * The action includes a validation function that always returns true and a handler function that also returns true.
 *
 * Examples of using the IGNORE action are provided in the 'examples' array. Each example includes messages between two parties and the use of the IGNORE action.
 *
 * @typedef {Action} ignoreAction
 */
export const ignoreAction: Action = {
  name: "IGNORE",
  similes: ["STOP_TALKING", "STOP_CHATTING", "STOP_CONVERSATION"],
  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    logger.info("[IGNORE] Validating IGNORE action - always returns true");
    return true;
  },
  description:
    "Call this action if ignoring the user. If the user is aggressive, creepy or is finished with the conversation, use this action. Or, if both you and the user have already said goodbye, use this action instead of saying bye again. Use IGNORE any time the conversation has naturally ended. Do not use IGNORE if the user has engaged directly, or if something went wrong an you need to tell them. Only ignore if the user should be ignored. Can end action chains when no further response is needed.",
  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: ActionHandlerOptions,
    callback: HandlerCallback,
    responses?: Memory[],
  ): Promise<ActionResult> => {
    logger.info("[IGNORE] Executing IGNORE action - ending conversation");

    // If a callback and the agent's response content are available, call the callback
    if (callback && responses?.[0]?.content) {
      logger.info("[IGNORE] Passing response content to callback");
      // Pass the agent's original response content (thought, IGNORE action, etc.)
      await callback(responses[0].content);
    }

    logger.info("[IGNORE] Conversation ignored successfully");

    return {
      text: "",
      success: true,
      values: { ignored: true, reason: "conversation_ended_or_inappropriate" },
      data: { action: "IGNORE", hasResponse: !!responses?.[0]?.content },
    };
  },
  examples: [
    [
      { name: "{{user}}", content: { text: "Go screw yourself" } } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "",
          actions: ["IGNORE"],
          thought: "User is being rude",
        },
      } as ActionExample,
    ],
    [
      { name: "{{user}}", content: { text: "Shut up, bot" } } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "",
          actions: ["IGNORE"],
          thought: "User is being rude",
        },
      } as ActionExample,
    ],

    [
      {
        name: "{{user}}",
        content: { text: "Got any investment advice" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Uh, don't let the volatility sway your long-term strategy",
        },
      } as ActionExample,
      {
        name: "{{user}}",
        content: { text: "Wise words I think" },
      } as ActionExample,
      {
        name: "{{user}}",
        content: { text: "I gotta run, talk to you later" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: { text: "See ya" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought:
            "Conversation has naturally concluded with goodbyes - no need to respond further",
          text: "",
          actions: ["IGNORE"],
        },
      } as ActionExample,
    ],

    [
      {
        name: "{{user}}",
        content: { text: "Gotta go" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: { text: "Okay, talk to you later" },
      } as ActionExample,
      {
        name: "{{user}}",
        content: { text: "Cya" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought:
            "User said goodbye and I responded - conversation is over, no need for further response",
          text: "",
          actions: ["IGNORE"],
        },
      } as ActionExample,
    ],

    [
      {
        name: "{{user}}",
        content: { text: "bye" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: { text: "cya" },
      } as ActionExample,
      {
        name: "{{user}}",
        content: {
          thought:
            "User said goodbye and I responded - conversation is over, no need for further response",
          text: "",
          actions: ["IGNORE"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Who added this stupid bot to the chat",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: { text: "Sorry, am I being annoying" },
      } as ActionExample,
      {
        name: "{{user}}",
        content: { text: "Yeah" },
      } as ActionExample,
      {
        name: "{{user}}",
        content: { text: "PLEASE shut up" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought:
            "User is being persistently rude and asking me to shut up - I should ignore this behavior",
          text: "",
          actions: ["IGNORE"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "ur so dumb",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought:
            "User is being insulting - I should ignore this inappropriate behavior",
          text: "",
          actions: ["IGNORE"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "later nerd",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "bye",
        },
      } as ActionExample,
      {
        name: "{{user}}",
        content: {
          text: "",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought:
            "User said goodbye rudely but conversation is over - no further response needed",
          text: "",
          actions: ["IGNORE"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "wanna cyber",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought:
            "User is making inappropriate sexual advances - I should call this out and ignore",
          text: "thats inappropriate",
          actions: ["IGNORE"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Im out ttyl",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "cya",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought: "User left and I said goodbye - conversation is complete",
          text: "",
          actions: ["IGNORE"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "u there",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "yes how can I help",
        },
      } as ActionExample,
      {
        name: "{{user}}",
        content: {
          text: "k nvm figured it out",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          thought:
            "User resolved their issue and no longer needs help - no response needed",
          text: "",
          actions: ["IGNORE"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "bad word",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "",
          actions: ["IGNORE"],
        },
      } as ActionExample,
    ],
  ],
};
