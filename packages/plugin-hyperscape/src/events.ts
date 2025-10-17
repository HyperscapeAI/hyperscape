import { MessagePayload, HandlerCallback } from "@elizaos/core";
import { handleMessage } from "./handlers/native-message-handler";

/**
 * Hyperscape Event Types for ElizaOS Plugin
 *
 * These events are emitted by HyperscapeService when game events occur.
 * Handlers process the events and pass them to BehaviorManager for agent reactions.
 */
export enum hyperscapeEventType {
  // Chat Events
  MESSAGE_RECEIVED = "HYPERSCAPE_MESSAGE_RECEIVED",
  VOICE_MESSAGE_RECEIVED = "HYPERSCAPE_VOICE_MESSAGE_RECEIVED",

  // Content Events
  CONTENT_LOADED = "HYPERSCAPE_CONTENT_LOADED",
  CONTENT_UNLOADED = "HYPERSCAPE_CONTENT_UNLOADED",

  // World Events - emitted by HyperscapeService from world.on() events
  WORLD_EVENT = "HYPERSCAPE_WORLD_EVENT",
}

// Alias for backward compatibility
export const EventType = hyperscapeEventType;

const defaultCallback: HandlerCallback = async () => [];

/**
 * Native event handlers - process messages internally without bootstrap
 */
export const hyperscapeEvents = {
  [hyperscapeEventType.MESSAGE_RECEIVED]: [
    async (payload: MessagePayload) => {
      await handleMessage({
        runtime: payload.runtime,
        message: payload.message,
        callback: payload.callback || defaultCallback,
        onComplete: payload.onComplete,
      });
    },
  ],

  [hyperscapeEventType.VOICE_MESSAGE_RECEIVED]: [
    async (payload: MessagePayload) => {
        await handleMessage({
        runtime: payload.runtime,
        message: payload.message,
        callback: payload.callback || defaultCallback,
        onComplete: payload.onComplete,
      });
    },
  ],

  // World events - handled by WorldEventBridge
  [hyperscapeEventType.WORLD_EVENT]: [
    async (payload: { runtime: unknown; eventName: string; data: Record<string, unknown> }) => {
      // World events are processed by specialized handlers
      // This is just a passthrough for ElizaOS event system
    },
  ],

  // Content events
  [hyperscapeEventType.CONTENT_LOADED]: [
    async (_payload: { runtime: unknown; contentId: string }) => {
      // Content pack loaded
    },
  ],

  [hyperscapeEventType.CONTENT_UNLOADED]: [
    async (_payload: { runtime: unknown; contentId: string }) => {
      // Content pack unloaded
    },
  ],

  CONTROL_MESSAGE: [],
};
