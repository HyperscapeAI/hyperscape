import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  type HandlerOptions,
  type UUID,
} from "@elizaos/core";
import type { HyperscapeService } from "../service";
import { NETWORK_CONFIG } from "../config/constants";

type AgentTokenResponse = {
  token: string;
  userId: string;
  scopes: string[];
  restrictions: string[];
};

/**
 * Link Agent Action
 *
 * Exchanges a challenge code for an agent token and connects to Hyperscape.
 *
 * Flow:
 * 1. User generates challenge code via UI (POST /api/agent/challenge)
 * 2. User gives challenge code to agent
 * 3. Agent calls this action with the challenge code
 * 4. Action exchanges challenge for scoped JWT token (POST /api/agent/token)
 * 5. Action connects to Hyperscape using the token
 *
 * The agent token has limited permissions:
 * - ✅ game:connect, game:play, character:read, character:control
 * - ❌ NO wallet access, NO fund transfer, NO Privy auth, NO account modification
 */
export const linkAgentAction: Action = {
  name: "LINK_AGENT",
  description: "Link this agent to a user's Hyperscape account using a challenge code",

  similes: [
    "link agent",
    "connect agent",
    "authenticate agent",
    "link to account",
    "use challenge code",
    "connect with code",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory, _state?: State | undefined): Promise<boolean> => {
    // Extract challenge code from message
    const text = message.content.text;
    if (!text) return false;
    const normalizedText = text.toLowerCase();

    // Look for 6-character alphanumeric code pattern
    const codeMatch: RegExpMatchArray | null = normalizedText.match(/\b[a-z0-9]{6}\b/i);

    if (!codeMatch) {
      return false;
    }

    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State | undefined,
    _options?: HandlerOptions | undefined,
    callback?: HandlerCallback | undefined,
  ): Promise<{text: string; success: boolean; values: Record<string, unknown>; data: Record<string, unknown>}> => {
    try {
      // Extract challenge code from message
      const text = message.content.text;
      if (!text) {
        if (callback) {
          callback({
            text: "I couldn't find a valid message. Please provide a 6-character challenge code (example: A3B7C2)",
            type: "error",
          });
        }
        return {
          text: "I couldn't find a valid message. Please provide a 6-character challenge code (example: A3B7C2)",
          success: false,
          values: { linked: false, error: "invalid_message" },
          data: { source: "hyperscape", action: "LINK_AGENT" },
        };
      }
      const codeMatch = text.match(/\b([a-z0-9]{6})\b/i);

      if (!codeMatch) {
        if (callback) {
          callback({
            text: "I couldn't find a valid challenge code. Please provide a 6-character code (example: A3B7C2)",
            type: "error",
          });
        }
        return {
          text: "I couldn't find a valid challenge code. Please provide a 6-character code (example: A3B7C2)",
          success: false,
          values: { linked: false, error: "invalid_code" },
          data: { source: "hyperscape", action: "LINK_AGENT" },
        };
      }

      const challengeCode = codeMatch[1]!.toUpperCase();

      if (callback) {
        callback({
          text: `Exchanging challenge code ${challengeCode} for agent token...`,
          type: "info",
        });
      }

      // Call server to exchange challenge for token
      const serverUrl = process.env.HYPERSCAPE_SERVER_URL || "http://localhost:5555";
      console.log(`[LINK_AGENT] Calling ${serverUrl}/api/agent/token with challenge: ${challengeCode}`);

      const response = await fetch(`${serverUrl}/api/agent/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ challengeCode }),
      });

      console.log(`[LINK_AGENT] Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LINK_AGENT] Error response: ${errorText}`);
        type ErrorData = { error: string };
        let errorData: ErrorData;
        try {
          errorData = JSON.parse(errorText) as ErrorData;
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}` };
        }

        if (callback) {
          callback({
            text: `Failed to exchange challenge code: ${errorData.error || "Unknown error"}`,
            type: "error",
          });
        }
        return {
          text: `Failed to exchange challenge code: ${errorData.error || "Unknown error"}`,
          success: false,
          values: { linked: false, error: errorData.error || "Unknown error" },
          data: { source: "hyperscape", action: "LINK_AGENT" },
        };
      }

      const data = await response.json() as AgentTokenResponse;
      const { token, userId, scopes, restrictions } = data;

      if (callback) {
        callback({
          text: `✅ Successfully obtained agent token!\nUser ID: ${userId}\nPermissions: ${scopes.join(", ")}\nRestrictions: ${restrictions.join(", ")}`,
          type: "success",
        });
      }

      // Store token in runtime state for future use and connect to Hyperscape
      console.log('[LINK_AGENT] Checking for HyperscapeService...');
      console.log('[LINK_AGENT] Runtime services available:', runtime.services ? Object.keys(runtime.services) : 'runtime.services is undefined');
      console.log('[LINK_AGENT] Attempting to get service with name "hyperscape"...');

      const hyperscapeService = runtime.getService<HyperscapeService>("hyperscape");

      console.log('[LINK_AGENT] Service lookup result:', hyperscapeService ? 'FOUND' : 'NOT FOUND');
      console.log('[LINK_AGENT] Service type:', typeof hyperscapeService);
      console.log('[LINK_AGENT] Service details:', hyperscapeService);

      if (!hyperscapeService) {
        console.error('[LINK_AGENT] HyperscapeService not found! This should not happen if the plugin is loaded.');
        if (callback) {
          callback({
            text: "⚠️ Token obtained but Hyperscape service not available. Please ensure the plugin is loaded.",
            type: "warning",
          });
        }
        return {
          text: "Token obtained but Hyperscape service not available. Please ensure the plugin is loaded.",
          success: false,
          values: { linked: false, tokenObtained: true, error: "service_not_found" },
          data: { source: "hyperscape", action: "LINK_AGENT", userId },
        };
      }

      console.log('[LINK_AGENT] ✅ HyperscapeService found, storing token and connecting...');

      // Store token on the service instance for future use
      // Dynamic properties added at runtime for agent authentication
      Object.assign(hyperscapeService, { agentToken: token, agentUserId: userId });

      if (callback) {
        callback({
          text: "Connecting to Hyperscape server...",
          type: "info",
        });
      }

      // Connect to Hyperscape using the agent token
      // Use the same URL resolution logic as the service
      const wsUrl = NETWORK_CONFIG.DEFAULT_WS_URL;
      console.log(`[LINK_AGENT] Connecting to Hyperscape at: ${wsUrl}`);

      // Strong type assumption - runtime.agentId is a UUID
      const worldId = runtime.agentId as UUID;
      await hyperscapeService.connect({
        wsUrl,
        authToken: token,
        worldId,
      });

      // Wait for connection to be fully established and character list to be received
      console.log('[LINK_AGENT] Waiting for connection to establish...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Handle character selection/creation for agent
      console.log('[LINK_AGENT] Checking for characters...');
      const world = hyperscapeService.getWorld();

      if (!world || !world.network) {
        console.warn('[LINK_AGENT] World or network not available');
      } else {
        // Check if agent already has a character (from environment variable or previous session)
        const agentCharacterId = process.env.AGENT_CHARACTER_ID;

        if (agentCharacterId) {
          console.log(`[LINK_AGENT] Using configured character: ${agentCharacterId}`);
          (world.network as { send: (type: string, data: unknown) => void }).send('selectCharacter', { characterId: agentCharacterId });
          (world.network as { send: (type: string, data: unknown) => void }).send('enterWorld', { characterId: agentCharacterId });
        } else {
          // TODO: In the future, we could query available characters and select/create one
          // For now, agents should either have AGENT_CHARACTER_ID set or will be prompted by server
          console.log('[LINK_AGENT] No AGENT_CHARACTER_ID configured - server will handle character selection');
        }
      }

      if (callback) {
        callback({
          text: `🎮 Successfully linked to user ${userId} and connected to Hyperscape!\n\nI now have limited permissions to play the game on your behalf:\n✅ ${scopes.join(", ")}\n🚫 ${restrictions.join(", ")}`,
          type: "success",
        });
      }

      return {
        text: `Successfully linked to user ${userId} and connected to Hyperscape!`,
        success: true,
        values: { 
          linked: true, 
          userId, 
          scopes,
          restrictions,
        },
        data: { 
          source: "hyperscape", 
          action: "LINK_AGENT",
          userId,
          token,
        },
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[Link Agent] Error:", error);

      if (callback) {
        callback({
          text: `Failed to link agent: ${errorMsg}`,
          type: "error",
        });
      }

      return {
        text: `Failed to link agent: ${errorMsg}`,
        success: false,
        values: { linked: false, error: errorMsg },
        data: { source: "hyperscape", action: "LINK_AGENT" },
      };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Link to my account with code A3B7C2" },
      },
      {
        name: "{{agentName}}",
        content: { text: "Exchanging challenge code A3B7C2 for agent token..." },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Use this challenge code to connect: XY9Z4K" },
      },
      {
        name: "{{agentName}}",
        content: { text: "Exchanging challenge code XY9Z4K for agent token..." },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Here's your code: B8N2M5" },
      },
      {
        name: "{{agentName}}",
        content: { text: "Exchanging challenge code B8N2M5 for agent token..." },
      },
    ],
  ],
};
