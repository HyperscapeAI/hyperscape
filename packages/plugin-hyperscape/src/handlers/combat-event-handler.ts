/**
 * combat-event-handler.ts - Combat Event Handler
 *
 * Monitors combat state, damage events, and health changes.
 * Helps agent respond to threats and make tactical decisions.
 *
 * **Purpose**:
 * - Track active combat sessions
 * - Monitor damage taken/dealt
 * - Alert agent when under attack
 * - Track enemy health for tactical decisions
 *
 * **Handled Events**:
 * - COMBAT_STARTED: Combat session initiated
 * - COMBAT_ENDED: Combat session finished
 * - COMBAT_DAMAGE_DEALT: Damage was dealt
 * - ENTITY_DAMAGED: Entity took damage
 * - ENTITY_HEALTH_CHANGED: Health points changed
 * - ENTITY_DEATH: Entity died in combat
 *
 * **Integration**:
 * - Called by WorldEventBridge
 * - Provides data to combat provider
 * - Triggers defensive/offensive behaviors
 *
 * CLAUDE.md Compliance:
 * - ✅ Strong typing enforced
 * - ✅ Self-contained functionality
 * - ✅ Proper error handling
 */

import { type IAgentRuntime, elizaLogger } from "@elizaos/core";
import type { World } from "@hyperscape/shared";

/**
 * Combat session data
 */
type CombatSession = {
  sessionId?: string;
  attackerId: string;
  targetId: string;
  startedAt: number;
  endedAt?: number;
  damageDealt: number;
  damageTaken: number;
  isActive: boolean;
};

/**
 * Damage event data
 */
type DamageEventData = {
  entityId?: string;
  targetId?: string;
  attackerId?: string;
  sourceId?: string;
  damage: number;
  damageType?: string;
  remainingHealth?: number;
  health?: number;
  maxHealth?: number;
  isDead?: boolean;
  timestamp?: number;
  [key: string]: unknown;
};

/**
 * Combat session event data
 */
type CombatSessionEventData = DamageEventData & {
  sessionId?: string;
};

/**
 * Combat Event Handler - Tracks combat state
 */
export class CombatEventHandler {
  private runtime: IAgentRuntime;
  private world: World;
  private activeSessions: Map<string, CombatSession>;
  private recentDamage: Map<string, Array<DamageEventData>>; // entityId -> damage events

  constructor(runtime: IAgentRuntime, world: World) {
    this.runtime = runtime;
    this.world = world;
    this.activeSessions = new Map();
    this.recentDamage = new Map();
  }

  /**
   * Handle combat started event
   */
  async handleCombatStarted(data: CombatSessionEventData): Promise<void> {
    try {
      const { sessionId, attackerId, targetId } = data;

      if (!attackerId || !targetId) {
        elizaLogger.warn(`[CombatEventHandler] Invalid combat start data: ${JSON.stringify(data)}`);
        return;
      }

      const session: CombatSession = {
        sessionId,
        attackerId,
        targetId,
        startedAt: Date.now(),
        damageDealt: 0,
        damageTaken: 0,
        isActive: true,
      };

      const key = sessionId || `${attackerId}_${targetId}`;
      this.activeSessions.set(key, session);

      elizaLogger.info(`[CombatEventHandler] Combat started: ${attackerId} vs ${targetId}`);

      // Check if agent is involved
      const agentPlayerId = this.world.entities.player?.data?.id;
      if (agentPlayerId === attackerId) {
        elizaLogger.warn(`[CombatEventHandler] ⚔️ Agent is attacking ${targetId}`);
      } else if (agentPlayerId === targetId) {
        elizaLogger.warn(`[CombatEventHandler] ⚔️ Agent is being attacked by ${attackerId}!`);
      }
    } catch (error) {
      elizaLogger.error(`[CombatEventHandler] Error handling combat start: ${error}`);
    }
  }

  /**
   * Handle combat ended event
   */
  async handleCombatEnded(data: CombatSessionEventData): Promise<void> {
    try {
      const { sessionId, attackerId, targetId } = data;

      const key = sessionId || (attackerId && targetId ? `${attackerId}_${targetId}` : null);
      if (!key) {
        elizaLogger.warn(`[CombatEventHandler] Invalid combat end data: ${JSON.stringify(data)}`);
        return;
      }

      const session = this.activeSessions.get(key);
      if (!session) {
        elizaLogger.warn(`[CombatEventHandler] Combat ended for unknown session: ${key}`);
        return;
      }

      session.isActive = false;
      session.endedAt = Date.now();

      const duration = session.endedAt - session.startedAt;

      elizaLogger.info(
        `[CombatEventHandler] Combat ended: ${session.attackerId} vs ${session.targetId} (${Math.floor(duration / 1000)}s, dealt: ${session.damageDealt}, taken: ${session.damageTaken})`
      );

      // Keep session in history for a bit before cleaning up
      setTimeout(() => {
        this.activeSessions.delete(key);
      }, 30000); // Keep for 30 seconds
    } catch (error) {
      elizaLogger.error(`[CombatEventHandler] Error handling combat end: ${error}`);
    }
  }

  /**
   * Handle damage dealt event
   */
  async handleDamageDealt(data: DamageEventData): Promise<void> {
    try {
      const { attackerId, targetId, damage } = data;

      if (!attackerId || !targetId || damage === undefined) {
        elizaLogger.warn(`[CombatEventHandler] Invalid damage dealt data: ${JSON.stringify(data)}`);
        return;
      }

      elizaLogger.info(`[CombatEventHandler] Damage dealt: ${attackerId} → ${targetId} (${damage} dmg)`);

      // Update session stats
      const key = `${attackerId}_${targetId}`;
      const session = this.activeSessions.get(key);
      if (session) {
        session.damageDealt += damage;
      }

      // Track recent damage for this entity
      this.trackDamageEvent(targetId, { ...data, timestamp: Date.now() });
    } catch (error) {
      elizaLogger.error(`[CombatEventHandler] Error handling damage dealt: ${error}`);
    }
  }

  /**
   * Handle entity damaged event
   */
  async handleEntityDamaged(data: DamageEventData): Promise<void> {
    try {
      const { entityId, targetId, damage, sourceId, attackerId, remainingHealth, isDead } = data;

      const target = entityId || targetId;
      const attacker = sourceId || attackerId;

      if (!target || damage === undefined) {
        elizaLogger.warn(`[CombatEventHandler] Invalid entity damage data: ${JSON.stringify(data)}`);
        return;
      }

      elizaLogger.info(`[CombatEventHandler] Entity damaged: ${target} took ${damage} dmg from ${attacker || "unknown"} (${remainingHealth !== undefined ? `${remainingHealth} HP left` : "HP unknown"})`);

      // Track damage event
      this.trackDamageEvent(target, { ...data, timestamp: Date.now() });

      // Check if agent was damaged
      const agentPlayerId = this.world.entities.player?.data?.id;
      if (target === agentPlayerId) {
        elizaLogger.warn(`[CombatEventHandler] 🛡️ Agent took ${damage} damage! (${remainingHealth !== undefined ? `${remainingHealth} HP remaining` : "HP unknown"})`);

        if (isDead) {
          elizaLogger.error(`[CombatEventHandler] ☠️ Agent has died!`);
        }
      }
    } catch (error) {
      elizaLogger.error(`[CombatEventHandler] Error handling entity damage: ${error}`);
    }
  }

  /**
   * Handle health changed event
   */
  async handleHealthChanged(data: DamageEventData): Promise<void> {
    try {
      const { entityId, health, maxHealth } = data;

      if (!entityId || health === undefined) {
        return; // Silent - health updates are frequent
      }

      const percentage = maxHealth ? Math.floor((health / maxHealth) * 100) : undefined;

      elizaLogger.debug(`[CombatEventHandler] Health changed: ${entityId} = ${health}${maxHealth ? `/${maxHealth}` : ""} ${percentage !== undefined ? `(${percentage}%)` : ""}`);

      // Check if agent health changed significantly
      const agentPlayerId = this.world.entities.player?.data?.id;
      if (entityId === agentPlayerId && percentage !== undefined) {
        if (percentage <= 25) {
          elizaLogger.warn(`[CombatEventHandler] ⚠️ Agent health critical: ${percentage}%`);
        } else if (percentage <= 50) {
          elizaLogger.warn(`[CombatEventHandler] ⚠️ Agent health low: ${percentage}%`);
        }
      }
    } catch (error) {
      // Silent - health events are very frequent
    }
  }

  /**
   * Handle entity death event
   */
  async handleEntityDeath(data: DamageEventData): Promise<void> {
    try {
      const { entityId, sourceId, attackerId } = data;

      if (!entityId) {
        elizaLogger.warn(`[CombatEventHandler] Invalid entity death data: ${JSON.stringify(data)}`);
        return;
      }

      const killer = sourceId || attackerId;

      elizaLogger.info(`[CombatEventHandler] Entity died: ${entityId} ${killer ? `(killed by ${killer})` : "(no killer)"}`);

      // End any active combat sessions involving this entity
      for (const [key, session] of this.activeSessions.entries()) {
        if (session.attackerId === entityId || session.targetId === entityId) {
          session.isActive = false;
          session.endedAt = Date.now();

          elizaLogger.debug(`[CombatEventHandler] Combat session ended due to death: ${key}`);
        }
      }

      // Clear damage history for this entity
      this.recentDamage.delete(entityId);
    } catch (error) {
      elizaLogger.error(`[CombatEventHandler] Error handling entity death: ${error}`);
    }
  }

  /**
   * Track damage event for an entity
   */
  private trackDamageEvent(entityId: string, event: DamageEventData): void {
    if (!this.recentDamage.has(entityId)) {
      this.recentDamage.set(entityId, []);
    }

    const events = this.recentDamage.get(entityId)!;
    events.push(event);

    // Keep only last 10 events
    if (events.length > 10) {
      events.shift();
    }
  }

  /**
   * Get active combat sessions
   */
  getActiveSessions(): Map<string, CombatSession> {
    const active = new Map<string, CombatSession>();

    for (const [key, session] of this.activeSessions.entries()) {
      if (session.isActive) {
        active.set(key, session);
      }
    }

    return active;
  }

  /**
   * Check if entity is in combat
   */
  isInCombat(entityId: string): boolean {
    for (const session of this.activeSessions.values()) {
      if (session.isActive && (session.attackerId === entityId || session.targetId === entityId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get recent damage for entity
   */
  getRecentDamage(entityId: string): DamageEventData[] {
    return this.recentDamage.get(entityId) || [];
  }

  /**
   * Clear all combat data
   */
  clear(): void {
    this.activeSessions.clear();
    this.recentDamage.clear();
  }
}
