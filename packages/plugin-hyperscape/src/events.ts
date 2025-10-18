import { MessagePayload, logger } from "@elizaos/core";

export enum hyperscapeEventType {
  MESSAGE_RECEIVED = "HYPERSCAPE_MESSAGE_RECEIVED",
  VOICE_MESSAGE_RECEIVED = "HYPERSCAPE_VOICE_MESSAGE_RECEIVED",
  CONTENT_LOADED = "HYPERSCAPE_CONTENT_LOADED",
  CONTENT_UNLOADED = "HYPERSCAPE_CONTENT_UNLOADED",
}

// Alias for backward compatibility
export const EventType = hyperscapeEventType;

/**
 * Hyperscape event handlers
 *
 * Note: Message handling is done directly in MessageManager via WebSocket subscription.
 * These event handlers are kept for compatibility and logging purposes.
 */
export const hyperscapeEvents = {
  [hyperscapeEventType.MESSAGE_RECEIVED]: [
    async (_payload: MessagePayload): Promise<void> => {
      logger.debug(
        "[Events] MESSAGE_RECEIVED event triggered (handled by MessageManager)"
      );
      // Message processing happens in MessageManager.handleMessage()
      // via WebSocket subscription in HyperscapeService.startChatSubscription()
    },
  ],

  [hyperscapeEventType.VOICE_MESSAGE_RECEIVED]: [
    async (_payload: MessagePayload): Promise<void> => {
      logger.debug(
        "[Events] VOICE_MESSAGE_RECEIVED event triggered (handled by MessageManager)"
      );
      // Voice message processing handled through standard message flow
    },
  ],

  CONTROL_MESSAGE: [],
};
