/**
 * IGNORE Action Tests - CLAUDE.md Compliant (No Mocks)
 *
 * Tests the IGNORE action handler's behavior without using mocks.
 * Verifies action metadata, validation, and handler logic.
 *
 * NOTE: The IGNORE action is a simple logic action that doesn't interact
 * with Hyperscape, databases, or external systems. It only validates input
 * and returns a result. We test the real action handler with minimal fixtures.
 */

import { describe, it, expect } from "vitest";
import { ignoreAction } from "../../actions/ignore";
import type { Memory, State, Content, IAgentRuntime, UUID } from "@elizaos/core";
import { randomUUID } from "crypto";

/**
 * Generate a real UUID for testing
 */
function generateUUID(): UUID {
  return randomUUID() as UUID;
}

/**
 * Create minimal runtime fixture for testing simple actions
 * This is not a mock - it's a complete real object that satisfies the IAgentRuntime interface
 * The IGNORE action doesn't use most runtime properties, but we provide a complete runtime for type safety
 */
function createMinimalRuntime(): IAgentRuntime {
  const runtime: IAgentRuntime = {
    agentId: generateUUID(),
    character: {
      id: generateUUID(),
      name: "Test Agent",
      modelProvider: "openai",
      clients: [],
      settings: { secrets: {}, voice: { model: "en_US-male-medium" } },
    },
    // Add all required IAgentRuntime properties
    serverUrl: "http://localhost:3000",
    databaseAdapter: {} as any,
    token: null,
    actions: [],
    evaluators: [],
    providers: [],
    plugins: [],
    fetch: fetch.bind(globalThis),
    messageManager: {} as any,
    descriptionManager: {} as any,
    loreManager: {} as any,
    documentsManager: {} as any,
    knowledgeManager: {} as any,
    services: new Map(),
    initialize: async () => {},
    registerMemoryManager: () => {},
    getMemoryManager: () => null as any,
    getService: () => null,
    registerService: () => {},
    getSetting: () => null,
    getConversationLength: () => 32,
    processActions: async () => {},
    evaluate: async () => [],
    ensureConnection: async () => {},
    ensureUserExists: async () => {},
    ensureParticipantInRoom: async () => {},
    ensureRoomExists: async () => {},
    composeState: async () => ({} as any),
    updateRecentMessageState: async () => ({} as any),
  };
  return runtime;
}

describe("IGNORE Action", () => {
  describe("validate", () => {
    it("should always return true", async () => {
      const runtime = createMinimalRuntime();
      const message: Memory = {
        id: generateUUID(),
        content: { text: "test" },
        userId: generateUUID(),
        agentId: generateUUID(),
        roomId: generateUUID(),
        createdAt: Date.now(),
      };
      const result = await ignoreAction.validate(runtime, message);
      expect(result).toBe(true);
    });
  });

  describe("handler", () => {
    it("should return result with ignored flag and call callback with response content", async () => {
      const runtime = createMinimalRuntime();
      const message: Memory = {
        id: generateUUID(),
        content: { text: "Go away bot" },
        userId: generateUUID(),
        agentId: generateUUID(),
        roomId: generateUUID(),
        createdAt: Date.now(),
      };
      const state: State = {
        values: {},
        data: {},
        text: "test state",
      };

      let callbackInvoked = false;
      let callbackContent: Content | undefined;
      const callback = (content: Content) => {
        callbackInvoked = true;
        callbackContent = content;
      };

      const responses = [
        {
          id: generateUUID(),
          userId: generateUUID(),
          agentId: generateUUID(),
          roomId: generateUUID(),
          content: {
            text: "",
            thought: "User is being rude, I should ignore them",
            actions: ["IGNORE"],
          },
          createdAt: Date.now(),
        },
      ];

      const result = await ignoreAction.handler(
        runtime,
        message,
        state,
        {},
        callback,
        responses,
      );

      expect(result).toBeDefined();
      expect(result.text).toBe("");
      expect(result.values).toEqual({
        ignored: true,
        reason: "conversation_ended_or_inappropriate",
      });
      expect(result.data).toEqual({
        action: "IGNORE",
        hasResponse: true,
      });
      expect(callbackInvoked).toBe(true);
      expect(callbackContent).toBeDefined();
      expect(callbackContent!.text).toBe("");
    });

    it("should return result without calling callback if no responses", async () => {
      const runtime = createMinimalRuntime();
      const message: Memory = {
        id: generateUUID(),
        content: { text: "Go away bot" },
        userId: generateUUID(),
        agentId: generateUUID(),
        roomId: generateUUID(),
        createdAt: Date.now(),
      };
      const state: State = {
        values: {},
        data: {},
        text: "test state",
      };

      let callbackInvoked = false;
      const callback = () => {
        callbackInvoked = true;
      };

      const result = await ignoreAction.handler(
        runtime,
        message,
        state,
        {},
        callback,
        [],
      );

      expect(result).toBeDefined();
      expect(result.text).toBe("");
      expect(result.values).toEqual({
        ignored: true,
        reason: "conversation_ended_or_inappropriate",
      });
      expect(result.data).toEqual({
        action: "IGNORE",
        hasResponse: false,
      });
      expect(callbackInvoked).toBe(false);
    });

    it("should handle null callback gracefully", async () => {
      const runtime = createMinimalRuntime();
      const message: Memory = {
        id: generateUUID(),
        content: { text: "Go away bot" },
        userId: generateUUID(),
        agentId: generateUUID(),
        roomId: generateUUID(),
        createdAt: Date.now(),
      };
      const state: State = {
        values: {},
        data: {},
        text: "test state",
      };

      const responses = [
        {
          id: generateUUID(),
          userId: generateUUID(),
          agentId: generateUUID(),
          roomId: generateUUID(),
          content: {
            text: "",
            actions: ["IGNORE"],
          },
          createdAt: Date.now(),
        },
      ];

      const result = await ignoreAction.handler(
        runtime,
        message,
        state,
        {},
        null as never,
        responses,
      );

      expect(result).toBeDefined();
      expect(result.text).toBe("");
      expect(result.values).toEqual({
        ignored: true,
        reason: "conversation_ended_or_inappropriate",
      });
      expect(result.data).toEqual({
        action: "IGNORE",
        hasResponse: true,
      });
    });

    it("should handle multiple responses by using the first one", async () => {
      const runtime = createMinimalRuntime();
      const message: Memory = {
        id: generateUUID(),
        content: { text: "Go away bot" },
        userId: generateUUID(),
        agentId: generateUUID(),
        roomId: generateUUID(),
        createdAt: Date.now(),
      };
      const state: State = {
        values: {},
        data: {},
        text: "test state",
      };

      let callbackContent: Content | undefined;
      const callback = (content: Content) => {
        callbackContent = content;
      };

      const responses = [
        {
          id: generateUUID(),
          userId: generateUUID(),
          agentId: generateUUID(),
          roomId: generateUUID(),
          content: {
            text: "",
            thought: "First ignore response",
            actions: ["IGNORE"],
          },
          createdAt: Date.now(),
        },
        {
          id: generateUUID(),
          userId: generateUUID(),
          agentId: generateUUID(),
          roomId: generateUUID(),
          content: {
            text: "",
            thought: "Second ignore response",
            actions: ["IGNORE"],
          },
          createdAt: Date.now(),
        },
      ];

      const result = await ignoreAction.handler(
        runtime,
        message,
        state,
        {},
        callback,
        responses,
      );

      expect(result).toBeDefined();
      expect(result.text).toBe("");
      expect(callbackContent).toBeDefined();
      expect(callbackContent!.thought).toBe("First ignore response");
    });
  });

  describe("examples", () => {
    it("should have valid examples array", () => {
      expect(ignoreAction.examples).toBeDefined();
      expect(Array.isArray(ignoreAction.examples)).toBe(true);
      expect(ignoreAction.examples!.length).toBeGreaterThan(0);
    });

    it("should have properly formatted examples", () => {
      ignoreAction.examples!.forEach((example) => {
        expect(Array.isArray(example)).toBe(true);
        expect(example.length).toBeGreaterThanOrEqual(1);

        example.forEach((message) => {
          expect(message).toHaveProperty("name");
          expect(message).toHaveProperty("content");

          // Check if it's an agent response with IGNORE action
          if (message.content.actions) {
            expect(message.content.actions).toContain("IGNORE");
          }
        });
      });
    });

    it("should include examples of different ignore scenarios", () => {
      const examples = ignoreAction.examples!;

      // Should have examples for aggressive behavior
      const aggressiveExample = examples.find(
        (ex) =>
          ex[0].content.text?.toLowerCase().includes("screw") ||
          ex[0].content.text?.toLowerCase().includes("shut up"),
      );
      expect(aggressiveExample).toBeDefined();

      // Should have examples for end of conversation
      const goodbyeExample = examples.find((ex) =>
        ex.some(
          (msg) =>
            msg.content.text?.toLowerCase().includes("bye") ||
            msg.content.text?.toLowerCase().includes("cya"),
        ),
      );
      expect(goodbyeExample).toBeDefined();

      // Should have examples for inappropriate content
      const inappropriateExample = examples.find((ex) =>
        ex[0].content.text?.toLowerCase().includes("cyber"),
      );
      expect(inappropriateExample).toBeDefined();
    });
  });

  describe("similes", () => {
    it("should have appropriate similes", () => {
      expect(ignoreAction.similes).toBeDefined();
      expect(Array.isArray(ignoreAction.similes)).toBe(true);
      expect(ignoreAction.similes).toContain("STOP_TALKING");
      expect(ignoreAction.similes).toContain("STOP_CHATTING");
      expect(ignoreAction.similes).toContain("STOP_CONVERSATION");
    });
  });

  describe("description", () => {
    it("should have a comprehensive description", () => {
      expect(ignoreAction.description).toBeDefined();
      expect(ignoreAction.description).toContain("ignoring the user");
      expect(ignoreAction.description).toContain("aggressive");
      expect(ignoreAction.description).toContain(
        "conversation has naturally ended",
      );
    });
  });
});
