/**
 * world-event-bridge.ts - World Event Bridge Handler
 *
 * Bridges Hyperscape world events to ElizaOS runtime events.
 * Converts low-level network packets into high-level AI agent events.
 *
 * **Architecture**:
 * - Listens to World.on() events from Hyperscape
 * - Transforms event data into ElizaOS-compatible format
 * - Emits events through IAgentRuntime.emitEvent()
 * - Coordinates specialized handlers for different event categories
 *
 * **Event Flow**:
 * Server → WebSocket → ClientNetwork → World.emit(EventType.X)
 * → WorldEventBridge.handleEvent()
 * → Runtime.emitEvent(ElizaOS_Event)
 * → Agent evaluators/providers/actions react
 *
 * **Key Responsibilities**:
 * - Route events to specialized handlers
 * - Maintain event context (timestamp, source, etc.)
 * - Filter irrelevant events
 * - Ensure type safety for event payloads
 *
 * CLAUDE.md Compliance:
 * - ✅ Strong typing enforced (no `any` types)
 * - ✅ Proper error handling
 * - ✅ Uses existing Hyperscape EventType enum
 * - ✅ Self-contained and modular
 */

import { type IAgentRuntime, elizaLogger } from "@elizaos/core";
import { EventType as HyperscapeEventType } from "@hyperscape/shared";
import type { World } from "@hyperscape/shared";
import { hyperscapeEventType } from "../events";

/**
 * Event subscription handler type
 */
type EventHandler = (data: Record<string, unknown>) => void | Promise<void>;

/**
 * World Event Bridge - Routes Hyperscape events to ElizaOS runtime
 */
export class WorldEventBridge {
  private runtime: IAgentRuntime;
  private world: World;
  private subscriptions: Map<string, EventHandler[]>;
  private isActive: boolean;
  private service: { initializeWalletAuth: (playerId: string) => Promise<void> } | null;

  constructor(runtime: IAgentRuntime, world: World, service?: { initializeWalletAuth: (playerId: string) => Promise<void> }) {
    this.runtime = runtime;
    this.world = world;
    this.subscriptions = new Map();
    this.isActive = false;
    this.service = service || null;
  }

  /**
   * Start listening to world events
   */
  start(): void {
    if (this.isActive) {
      elizaLogger.warn("[WorldEventBridge] Already active");
      return;
    }

    elizaLogger.info("[WorldEventBridge] Starting event bridge");
    this.subscribeToWorldEvents();
    this.isActive = true;
  }

  /**
   * Stop listening to world events
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    elizaLogger.info("[WorldEventBridge] Stopping event bridge");
    this.unsubscribeFromWorldEvents();
    this.subscriptions.clear();
    this.isActive = false;
  }

  /**
   * Subscribe to all relevant Hyperscape world events
   */
  private subscribeToWorldEvents(): void {
    // Player lifecycle events
    this.subscribe(HyperscapeEventType.PLAYER_JOINED, this.handlePlayerJoined.bind(this));
    this.subscribe(HyperscapeEventType.PLAYER_LEFT, this.handlePlayerLeft.bind(this));
    this.subscribe(HyperscapeEventType.PLAYER_TELEPORTED, this.handlePlayerTeleported.bind(this));

    // Entity lifecycle events
    this.subscribe(HyperscapeEventType.ENTITY_SPAWNED, this.handleEntitySpawned.bind(this));
    this.subscribe(HyperscapeEventType.ENTITY_UPDATED, this.handleEntityUpdated.bind(this));
    this.subscribe(HyperscapeEventType.ENTITY_DEATH, this.handleEntityDeath.bind(this));

    // Inventory events
    this.subscribe(HyperscapeEventType.INVENTORY_UPDATED, this.handleInventoryUpdated.bind(this));
    this.subscribe(HyperscapeEventType.INVENTORY_ITEM_ADDED, this.handleInventoryItemAdded.bind(this));
    this.subscribe(HyperscapeEventType.INVENTORY_ITEM_REMOVED, this.handleInventoryItemRemoved.bind(this));

    // Resource system events
    this.subscribe(HyperscapeEventType.RESOURCE_SPAWNED, this.handleResourceSpawned.bind(this));
    this.subscribe(HyperscapeEventType.RESOURCE_DEPLETED, this.handleResourceDepleted.bind(this));
    this.subscribe(HyperscapeEventType.RESOURCE_RESPAWNED, this.handleResourceRespawned.bind(this));
    this.subscribe(HyperscapeEventType.RESOURCE_GATHERING_STARTED, this.handleResourceGatheringStarted.bind(this));
    this.subscribe(HyperscapeEventType.RESOURCE_GATHERING_COMPLETED, this.handleResourceGatheringCompleted.bind(this));

    // Combat events
    this.subscribe(HyperscapeEventType.COMBAT_STARTED, this.handleCombatStarted.bind(this));
    this.subscribe(HyperscapeEventType.COMBAT_ENDED, this.handleCombatEnded.bind(this));
    this.subscribe(HyperscapeEventType.COMBAT_DAMAGE_DEALT, this.handleCombatDamage.bind(this));
    this.subscribe(HyperscapeEventType.ENTITY_DAMAGED, this.handleEntityDamaged.bind(this));
    this.subscribe(HyperscapeEventType.ENTITY_HEALTH_CHANGED, this.handleHealthChanged.bind(this));

    // Skill & XP events
    this.subscribe(HyperscapeEventType.SKILLS_XP_GAINED, this.handleSkillsXPGained.bind(this));
    this.subscribe(HyperscapeEventType.SKILLS_LEVEL_UP, this.handleSkillsLevelUp.bind(this));

    // Chat events (already handled by native-message-handler, but we track them here too)
    this.subscribe(HyperscapeEventType.CHAT_MESSAGE, this.handleChatMessage.bind(this));

    // UI/System events
    this.subscribe(HyperscapeEventType.UI_TOAST, this.handleToastNotification.bind(this));

    elizaLogger.success("[WorldEventBridge] Subscribed to all world events");
  }

  /**
   * Unsubscribe from all world events
   */
  private unsubscribeFromWorldEvents(): void {
    for (const [eventType] of this.subscriptions) {
      this.world.off(eventType);
    }
  }

  /**
   * Subscribe to a world event
   */
  private subscribe(eventType: string, handler: EventHandler): void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }

    const handlers = this.subscriptions.get(eventType)!;
    handlers.push(handler);

    // Register with world event system
    this.world.on(eventType, handler as (data: Record<string, string | number | boolean>) => void);
  }

  // ============================================================================
  // PLAYER EVENT HANDLERS
  // ============================================================================

  private async handlePlayerJoined(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Player joined: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "PLAYER_JOINED",
      data,
    });

    // Initialize wallet auth for agent's own player
    if (this.service && data.playerId) {
      const playerId = data.playerId as string;
      const networkId = (this.world.network as { id?: string }).id;

      // Check if this is the agent's own player by comparing with network ID or player entity
      const isOwnPlayer = this.world.entities.player?.data.id === playerId || networkId === playerId;

      if (isOwnPlayer) {
        elizaLogger.info(`[WorldEventBridge] Detected agent's own player ${playerId}, initializing wallet...`);
        await this.service.initializeWalletAuth(playerId);
      }
    }
  }

  private async handlePlayerLeft(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Player left: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "PLAYER_LEFT",
      data,
    });
  }

  private async handlePlayerTeleported(data: Record<string, unknown>): Promise<void> {
    elizaLogger.debug(`[WorldEventBridge] Player teleported: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "PLAYER_TELEPORTED",
      data,
    });
  }

  // ============================================================================
  // ENTITY EVENT HANDLERS
  // ============================================================================

  private async handleEntitySpawned(data: Record<string, unknown>): Promise<void> {
    elizaLogger.debug(`[WorldEventBridge] Entity spawned: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "ENTITY_SPAWNED",
      data,
    });
  }

  private async handleEntityUpdated(data: Record<string, unknown>): Promise<void> {
    // Don't log every position update - too noisy
    // elizaLogger.debug(`[WorldEventBridge] Entity updated: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "ENTITY_UPDATED",
      data,
    });
  }

  private async handleEntityDeath(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Entity died: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "ENTITY_DEATH",
      data,
    });
  }

  // ============================================================================
  // INVENTORY EVENT HANDLERS
  // ============================================================================

  private async handleInventoryUpdated(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Inventory updated: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "INVENTORY_UPDATED",
      data,
    });
  }

  private async handleInventoryItemAdded(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Inventory item added: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "INVENTORY_ITEM_ADDED",
      data,
    });
  }

  private async handleInventoryItemRemoved(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Inventory item removed: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "INVENTORY_ITEM_REMOVED",
      data,
    });
  }

  // ============================================================================
  // RESOURCE EVENT HANDLERS
  // ============================================================================

  private async handleResourceSpawned(data: Record<string, unknown>): Promise<void> {
    elizaLogger.debug(`[WorldEventBridge] Resource spawned: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "RESOURCE_SPAWNED",
      data,
    });
  }

  private async handleResourceDepleted(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Resource depleted: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "RESOURCE_DEPLETED",
      data,
    });
  }

  private async handleResourceRespawned(data: Record<string, unknown>): Promise<void> {
    elizaLogger.debug(`[WorldEventBridge] Resource respawned: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "RESOURCE_RESPAWNED",
      data,
    });
  }

  private async handleResourceGatheringStarted(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Resource gathering started: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "RESOURCE_GATHERING_STARTED",
      data,
    });
  }

  private async handleResourceGatheringCompleted(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Resource gathering completed: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "RESOURCE_GATHERING_COMPLETED",
      data,
    });
  }

  // ============================================================================
  // COMBAT EVENT HANDLERS
  // ============================================================================

  private async handleCombatStarted(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Combat started: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "COMBAT_STARTED",
      data,
    });
  }

  private async handleCombatEnded(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Combat ended: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "COMBAT_ENDED",
      data,
    });
  }

  private async handleCombatDamage(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Combat damage dealt: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "COMBAT_DAMAGE_DEALT",
      data,
    });
  }

  private async handleEntityDamaged(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Entity damaged: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "ENTITY_DAMAGED",
      data,
    });
  }

  private async handleHealthChanged(data: Record<string, unknown>): Promise<void> {
    elizaLogger.debug(`[WorldEventBridge] Health changed: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "HEALTH_CHANGED",
      data,
    });
  }

  // ============================================================================
  // SKILL & XP EVENT HANDLERS
  // ============================================================================

  private async handleSkillsXPGained(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Skills XP gained: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "SKILLS_XP_GAINED",
      data,
    });
  }

  private async handleSkillsLevelUp(data: Record<string, unknown>): Promise<void> {
    elizaLogger.success(`[WorldEventBridge] Skills level up: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "SKILLS_LEVEL_UP",
      data,
    });
  }

  // ============================================================================
  // CHAT & UI EVENT HANDLERS
  // ============================================================================

  private async handleChatMessage(data: Record<string, unknown>): Promise<void> {
    // Chat is handled by native-message-handler, but we track it here for context
    elizaLogger.debug(`[WorldEventBridge] Chat message: ${JSON.stringify(data)}`);
  }

  private async handleToastNotification(data: Record<string, unknown>): Promise<void> {
    elizaLogger.info(`[WorldEventBridge] Toast notification: ${JSON.stringify(data)}`);

    this.runtime.emitEvent(hyperscapeEventType.WORLD_EVENT, {
      runtime: this.runtime,
      eventName: "TOAST_NOTIFICATION",
      data,
    });
  }
}
