/**
 * player-event-handler.ts - Player Event Handler
 *
 * Tracks player state changes, social interactions, and inventory updates.
 * Maintains agent's awareness of other players and own state.
 *
 * **Purpose**:
 * - Track players joining/leaving world
 * - Monitor inventory changes
 * - Track teleportation events
 * - Monitor skills/XP progression
 *
 * **Handled Events**:
 * - PLAYER_JOINED: New player entered world
 * - PLAYER_LEFT: Player left world
 * - PLAYER_TELEPORTED: Player was teleported
 * - INVENTORY_UPDATED: Inventory state changed
 * - SKILLS_XP_GAINED: Gained XP in skill
 * - SKILLS_LEVEL_UP: Leveled up a skill
 *
 * **Integration**:
 * - Called by WorldEventBridge
 * - Provides data to character/inventory providers
 * - Tracks social context for conversations
 *
 * CLAUDE.md Compliance:
 * - ✅ Strong typing enforced
 * - ✅ Self-contained functionality
 * - ✅ Proper error handling
 */

import { type IAgentRuntime, elizaLogger } from "@elizaos/core";
import type { World } from "@hyperscape/shared";

/**
 * Player info
 */
type PlayerInfo = {
  playerId: string;
  name?: string;
  joinedAt: number;
  position?: { x: number; y: number; z: number };
  isOnline: boolean;
};

/**
 * Inventory item
 */
type InventoryItem = {
  slot: number;
  itemId: string;
  quantity: number;
  item?: {
    id: string;
    name: string;
    type: string;
    stackable: boolean;
  };
};

/**
 * Player event data
 */
type PlayerEventData = {
  playerId?: string;
  name?: string;
  position?: { x: number; y: number; z: number };
  items?: Array<InventoryItem>;
  coins?: number;
  maxSlots?: number;
  skill?: string;
  amount?: number;
  newLevel?: number;
  [key: string]: unknown;
};

/**
 * Player Event Handler - Tracks player state
 */
export class PlayerEventHandler {
  private runtime: IAgentRuntime;
  private world: World;
  private players: Map<string, PlayerInfo>;
  private inventoryCache: Map<string, InventoryItem[]>;

  constructor(runtime: IAgentRuntime, world: World) {
    this.runtime = runtime;
    this.world = world;
    this.players = new Map();
    this.inventoryCache = new Map();
  }

  /**
   * Handle player joined event
   */
  async handlePlayerJoined(data: PlayerEventData): Promise<void> {
    try {
      const { playerId, name, position } = data;

      if (!playerId) {
        elizaLogger.warn(`[PlayerEventHandler] Invalid player join data: ${JSON.stringify(data)}`);
        return;
      }

      const player: PlayerInfo = {
        playerId,
        name,
        position,
        joinedAt: Date.now(),
        isOnline: true,
      };

      this.players.set(playerId, player);

      elizaLogger.info(`[PlayerEventHandler] Player joined: ${name || playerId} ${position ? `at (${position.x}, ${position.y}, ${position.z})` : ""}`);
    } catch (error) {
      elizaLogger.error(`[PlayerEventHandler] Error handling player join: ${error}`);
    }
  }

  /**
   * Handle player left event
   */
  async handlePlayerLeft(data: PlayerEventData): Promise<void> {
    try {
      const { playerId } = data;

      if (!playerId) {
        elizaLogger.warn(`[PlayerEventHandler] Invalid player leave data: ${JSON.stringify(data)}`);
        return;
      }

      const player = this.players.get(playerId);
      if (player) {
        player.isOnline = false;
        elizaLogger.info(`[PlayerEventHandler] Player left: ${player.name || playerId}`);
      } else {
        elizaLogger.info(`[PlayerEventHandler] Unknown player left: ${playerId}`);
      }

      // Keep player in cache for a while for conversation context
      setTimeout(() => {
        this.players.delete(playerId);
      }, 60000); // Keep for 1 minute
    } catch (error) {
      elizaLogger.error(`[PlayerEventHandler] Error handling player leave: ${error}`);
    }
  }

  /**
   * Handle player teleported event
   */
  async handlePlayerTeleported(data: PlayerEventData): Promise<void> {
    try {
      const { playerId, position } = data;

      if (!playerId || !position) {
        elizaLogger.warn(`[PlayerEventHandler] Invalid teleport data: ${JSON.stringify(data)}`);
        return;
      }

      const player = this.players.get(playerId);
      if (player) {
        player.position = position;
      }

      elizaLogger.info(`[PlayerEventHandler] Player teleported: ${playerId} to (${position.x}, ${position.y}, ${position.z})`);

      // Check if this is the agent
      const agentPlayerId = this.world.entities.player?.data?.id;
      if (playerId === agentPlayerId) {
        elizaLogger.success(`[PlayerEventHandler] 📍 Agent teleported to (${position.x}, ${position.y}, ${position.z})`);
      }
    } catch (error) {
      elizaLogger.error(`[PlayerEventHandler] Error handling teleport: ${error}`);
    }
  }

  /**
   * Handle inventory updated event
   */
  async handleInventoryUpdated(data: PlayerEventData): Promise<void> {
    try {
      const { playerId, items, coins, maxSlots } = data;

      if (!playerId) {
        elizaLogger.warn(`[PlayerEventHandler] Invalid inventory update data: ${JSON.stringify(data)}`);
        return;
      }

      if (items) {
        this.inventoryCache.set(playerId, items as InventoryItem[]);
      }

      elizaLogger.info(`[PlayerEventHandler] Inventory updated: ${playerId} (${items ? items.length : 0} items, ${coins || 0} coins, ${maxSlots || 0} slots)`);

      // Check if this is the agent
      const agentPlayerId = this.world.entities.player?.data?.id;
      if (playerId === agentPlayerId) {
        elizaLogger.success(`[PlayerEventHandler] 🎒 Agent inventory updated: ${items ? items.length : 0} items, ${coins || 0} coins`);

        // Log significant changes
        if (items && items.length > 0) {
          const itemNames = items
            .filter((i) => i.item)
            .map((i) => `${i.item!.name} x${i.quantity}`)
            .join(", ");

          if (itemNames) {
            elizaLogger.debug(`[PlayerEventHandler] Items: ${itemNames}`);
          }
        }
      }
    } catch (error) {
      elizaLogger.error(`[PlayerEventHandler] Error handling inventory update: ${error}`);
    }
  }

  /**
   * Handle skills XP gained event
   */
  async handleSkillsXPGained(data: PlayerEventData): Promise<void> {
    try {
      const { playerId, skill, amount } = data;

      if (!playerId || !skill || amount === undefined) {
        elizaLogger.warn(`[PlayerEventHandler] Invalid XP gained data: ${JSON.stringify(data)}`);
        return;
      }

      elizaLogger.info(`[PlayerEventHandler] XP gained: ${playerId} gained ${amount} ${skill} XP`);

      // Check if this is the agent
      const agentPlayerId = this.world.entities.player?.data?.id;
      if (playerId === agentPlayerId) {
        elizaLogger.success(`[PlayerEventHandler] ⭐ Agent gained ${amount} ${skill} XP`);
      }
    } catch (error) {
      elizaLogger.error(`[PlayerEventHandler] Error handling XP gain: ${error}`);
    }
  }

  /**
   * Handle skills level up event
   */
  async handleSkillsLevelUp(data: PlayerEventData): Promise<void> {
    try {
      const { playerId, skill, newLevel } = data;

      if (!playerId || !skill || newLevel === undefined) {
        elizaLogger.warn(`[PlayerEventHandler] Invalid level up data: ${JSON.stringify(data)}`);
        return;
      }

      elizaLogger.info(`[PlayerEventHandler] Level up: ${playerId} reached ${skill} level ${newLevel}`);

      // Check if this is the agent
      const agentPlayerId = this.world.entities.player?.data?.id;
      if (playerId === agentPlayerId) {
        elizaLogger.success(`[PlayerEventHandler] 🎉 Agent leveled up! ${skill} is now level ${newLevel}`);
      }
    } catch (error) {
      elizaLogger.error(`[PlayerEventHandler] Error handling level up: ${error}`);
    }
  }

  /**
   * Get online players
   */
  getOnlinePlayers(): Map<string, PlayerInfo> {
    const online = new Map<string, PlayerInfo>();

    for (const [id, player] of this.players.entries()) {
      if (player.isOnline) {
        online.set(id, player);
      }
    }

    return online;
  }

  /**
   * Get player info by ID
   */
  getPlayerById(playerId: string): PlayerInfo | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get inventory for player
   */
  getInventory(playerId: string): InventoryItem[] {
    return this.inventoryCache.get(playerId) || [];
  }

  /**
   * Clear all player data
   */
  clear(): void {
    this.players.clear();
    this.inventoryCache.clear();
  }
}
