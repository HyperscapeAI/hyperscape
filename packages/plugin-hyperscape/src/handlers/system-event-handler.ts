/**
 * system-event-handler.ts - System Event Handler
 *
 * Handles system-level notifications and events.
 * Monitors connection state, UI notifications, and system messages.
 *
 * **Purpose**:
 * - Process toast notifications
 * - Handle connection/disconnection
 * - Monitor system health
 * - Track error states
 *
 * **Handled Events**:
 * - UI_TOAST: Toast notification messages
 * - NETWORK_CONNECTED: Connection established
 * - NETWORK_DISCONNECTED: Connection lost
 * - ERROR: System errors
 *
 * **Integration**:
 * - Called by WorldEventBridge
 * - Provides system status to providers
 * - Triggers error recovery behaviors
 *
 * CLAUDE.md Compliance:
 * - ✅ Strong typing enforced
 * - ✅ Self-contained functionality
 * - ✅ Proper error handling
 */

import { type IAgentRuntime, elizaLogger } from "@elizaos/core";
import type { World } from "@hyperscape/shared";

/**
 * Toast notification types
 */
type ToastType = "info" | "success" | "warning" | "error";

/**
 * Toast notification data
 */
type ToastNotification = {
  message: string;
  type: ToastType;
  playerId?: string;
  timestamp: number;
};

/**
 * System event data
 */
type SystemEventData = {
  message?: string;
  type?: ToastType | string;
  playerId?: string;
  error?: Error | string;
  reason?: string;
  [key: string]: unknown;
};

/**
 * System Event Handler - Handles system notifications
 */
export class SystemEventHandler {
  private runtime: IAgentRuntime;
  private world: World;
  private recentToasts: ToastNotification[];
  private connectionState: "connected" | "disconnected" | "connecting";
  private lastError: Error | string | null;

  constructor(runtime: IAgentRuntime, world: World) {
    this.runtime = runtime;
    this.world = world;
    this.recentToasts = [];
    this.connectionState = "connecting";
    this.lastError = null;
  }

  /**
   * Handle toast notification
   */
  async handleToastNotification(data: SystemEventData): Promise<void> {
    try {
      const { message, type, playerId } = data;

      if (!message) {
        elizaLogger.warn(`[SystemEventHandler] Invalid toast data: ${JSON.stringify(data)}`);
        return;
      }

      const toast: ToastNotification = {
        message,
        type: (type as ToastType) || "info",
        playerId,
        timestamp: Date.now(),
      };

      this.recentToasts.push(toast);

      // Keep only last 20 toasts
      if (this.recentToasts.length > 20) {
        this.recentToasts.shift();
      }

      // Log based on severity
      const logMessage = `[Toast${playerId ? ` for ${playerId}` : ""}] ${message}`;

      switch (toast.type) {
        case "error":
          elizaLogger.error(logMessage);
          break;
        case "warning":
          elizaLogger.warn(logMessage);
          break;
        case "success":
          elizaLogger.success(logMessage);
          break;
        default:
          elizaLogger.info(logMessage);
      }

      // Check if this is for the agent
      const agentPlayerId = this.world.entities.player?.data?.id;
      if (playerId === agentPlayerId) {
        // Agent-specific toast - may need to react
        if (toast.type === "error") {
          elizaLogger.error(`[SystemEventHandler] ⚠️ Agent error notification: ${message}`);
        }
      }
    } catch (error) {
      elizaLogger.error(`[SystemEventHandler] Error handling toast: ${error}`);
    }
  }

  /**
   * Handle connection established
   */
  async handleConnected(data: SystemEventData): Promise<void> {
    try {
      this.connectionState = "connected";
      this.lastError = null;

      elizaLogger.success("[SystemEventHandler] ✅ Connected to Hyperscape server");
    } catch (error) {
      elizaLogger.error(`[SystemEventHandler] Error handling connection: ${error}`);
    }
  }

  /**
   * Handle disconnection
   */
  async handleDisconnected(data: SystemEventData): Promise<void> {
    try {
      const { reason } = data;

      this.connectionState = "disconnected";

      elizaLogger.warn(`[SystemEventHandler] ❌ Disconnected from Hyperscape server${reason ? `: ${reason}` : ""}`);
    } catch (error) {
      elizaLogger.error(`[SystemEventHandler] Error handling disconnection: ${error}`);
    }
  }

  /**
   * Handle system error
   */
  async handleError(data: SystemEventData): Promise<void> {
    try {
      const { error, message } = data;

      const errorMsg = error || message || "Unknown error";
      this.lastError = errorMsg;

      elizaLogger.error(`[SystemEventHandler] ⚠️ System error: ${errorMsg}`);
    } catch (err) {
      elizaLogger.error(`[SystemEventHandler] Error handling error event: ${err}`);
    }
  }

  /**
   * Get recent toasts
   */
  getRecentToasts(limit?: number): ToastNotification[] {
    if (limit && limit < this.recentToasts.length) {
      return this.recentToasts.slice(-limit);
    }
    return [...this.recentToasts];
  }

  /**
   * Get connection state
   */
  getConnectionState(): "connected" | "disconnected" | "connecting" {
    return this.connectionState;
  }

  /**
   * Get last error
   */
  getLastError(): Error | string | null {
    return this.lastError;
  }

  /**
   * Is connected
   */
  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  /**
   * Clear toast history
   */
  clearToasts(): void {
    this.recentToasts = [];
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.recentToasts = [];
    this.connectionState = "disconnected";
    this.lastError = null;
  }
}
