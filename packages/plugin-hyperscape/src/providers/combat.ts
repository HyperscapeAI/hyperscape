import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { addHeader, logger } from "@elizaos/core";
import type { HyperscapeService } from "../service";

/**
 * Combat State Provider
 *
 * Exposes current combat status to the LLM for decision-making.
 * Enhanced with CombatEventHandler for real-time combat analysis.
 *
 * The LLM uses this context along with the character's personality to decide
 * how to react to combat situations (engage, flee, heal, etc.)
 *
 * This provider does NOT make decisions - it only provides context.
 * Decisions are made by the LLM based on character.json personality.
 *
 * **Enhancement**: Now includes damage history, threat analysis, and tactical recommendations.
 */
export const combatProvider: Provider = {
  name: "COMBAT",
  description: "Current combat status, health information, and tactical analysis",
  dynamic: true,
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
  ): Promise<ProviderResult> => {
    const service = runtime.getService<HyperscapeService>("hyperscape");
    if (!service) {
      logger.debug("[COMBAT_PROVIDER] No Hyperscape service found");
      return { text: "", data: {} };
    }

    const world = service.getWorld();
    if (!world) {
      logger.debug("[COMBAT_PROVIDER] No world found");
      return { text: "", data: {} };
    }

    const player = world.entities.player;
    if (!player) {
      logger.debug("[COMBAT_PROVIDER] No player entity found");
      return { text: "", data: {} };
    }

    // Get combat system if available
    const combatSystem = world.getSystem?.('combat');

    // Get combat event handler for real-time combat analysis
    const combatEventHandler = service.getCombatEventHandler();

    // Gather combat state
    const playerId = player.data.id;
    const inCombat = combatSystem ? (combatSystem as any).isInCombat?.(playerId) ?? false : false;
    const currentTarget = combatSystem ? (combatSystem as any).getTarget?.(playerId) : null;

    // Health state
    const health = (player.data as any).health ?? 100;
    const maxHealth = (player.data as any).maxHealth ?? 100;
    const healthPercent = Math.round((health / maxHealth) * 100);

    // Determine health status
    let healthStatus = "healthy";
    if (healthPercent < 20) healthStatus = "critical";
    else if (healthPercent < 50) healthStatus = "wounded";
    else if (healthPercent < 80) healthStatus = "injured";

    // Get combat event data
    const activeSessions = combatEventHandler ? Array.from(combatEventHandler.getActiveSessions().values()) : [];
    const recentDamage = combatEventHandler ? combatEventHandler.getRecentDamage(playerId) : [];
    const isActuallyInCombat = combatEventHandler ? combatEventHandler.isInCombat(playerId) : inCombat;

    // Calculate tactical information
    let damagePerSecond = 0;
    let estimatedTimeToKO = 0;
    let combatDuration = 0;

    if (recentDamage.length > 0) {
      // Calculate DPS from recent damage events
      const now = Date.now();
      const recentWindow = recentDamage.filter(d => d.timestamp && now - d.timestamp < 10000); // Last 10 seconds
      if (recentWindow.length > 0) {
        const totalDamage = recentWindow.reduce((sum, d) => sum + (d.damage || 0), 0);
        const timeSpan = (now - (recentWindow[0].timestamp || now)) / 1000;
        damagePerSecond = timeSpan > 0 ? totalDamage / timeSpan : 0;
      }

      // Estimate time to KO
      if (damagePerSecond > 0) {
        estimatedTimeToKO = health / damagePerSecond;
      }
    }

    // Get combat session duration
    const playerSession = activeSessions.find(s => s.attackerId === playerId || s.targetId === playerId);
    if (playerSession && playerSession.isActive) {
      combatDuration = (Date.now() - playerSession.startedAt) / 1000;
    }

    // Format combat context with enhanced information
    const combatLines: string[] = [];

    if (isActuallyInCombat) {
      combatLines.push(`COMBAT STATUS: Currently fighting ${currentTarget ? `entity ${currentTarget}` : "an opponent"}`);
      combatLines.push(`Combat Duration: ${Math.floor(combatDuration)}s`);

      if (damagePerSecond > 0) {
        combatLines.push(`Taking Damage: ~${damagePerSecond.toFixed(1)} DPS`);
        if (estimatedTimeToKO > 0 && estimatedTimeToKO < 60) {
          combatLines.push(`⚠️ Estimated KO: ${estimatedTimeToKO.toFixed(1)}s`);
        }
      }

      // Show recent damage events
      if (recentDamage.length > 0) {
        const lastDamage = recentDamage[recentDamage.length - 1];
        const timeSince = lastDamage.timestamp ? Math.floor((Date.now() - lastDamage.timestamp) / 1000) : 0;
        combatLines.push(`Last Hit: ${lastDamage.damage} damage (${timeSince}s ago)`);
      }
    } else {
      combatLines.push("COMBAT STATUS: Not in combat");
    }

    const healthText = `HEALTH: ${health}/${maxHealth} HP (${healthPercent}% - ${healthStatus})`;

    // Enhanced tactical advice
    let combatAdvice = "";
    if (isActuallyInCombat) {
      if (healthPercent < 20) {
        combatAdvice = "\n⚠️ CRITICAL: Health extremely low! Flee immediately or use healing items!";
      } else if (healthPercent < 30) {
        combatAdvice = "\n⚠️ WARNING: Health is critical during combat. Consider fleeing or using healing items.";
      } else if (estimatedTimeToKO > 0 && estimatedTimeToKO < 10) {
        combatAdvice = `\n⚠️ DANGER: High incoming damage! Estimated knockout in ${estimatedTimeToKO.toFixed(1)}s. Take defensive action!`;
      } else if (damagePerSecond > 5) {
        combatAdvice = "\n⚠️ Taking heavy damage. Monitor health closely.";
      }
    }

    // Show active threats
    let threatText = "";
    if (activeSessions.length > 1) {
      const otherCombats = activeSessions.filter(s => s.attackerId !== playerId && s.targetId !== playerId);
      if (otherCombats.length > 0) {
        threatText = `\nNearby Combats: ${otherCombats.length} other fight(s) in progress`;
      }
    }

    const text = addHeader(
      "# Combat & Health Status",
      [...combatLines, healthText, combatAdvice, threatText].filter(Boolean).join("\n")
    );

    return {
      text,
      values: {
        combatStatus: text,
        inCombat: isActuallyInCombat,
        health,
        healthPercent,
        damagePerSecond,
        estimatedTimeToKO,
        success: true,
      },
      data: {
        inCombat: isActuallyInCombat,
        health,
        maxHealth,
        healthPercent,
        healthStatus,
        currentTarget: currentTarget || null,
        // Enhanced tactical data
        damagePerSecond,
        estimatedTimeToKO,
        combatDuration,
        recentDamageCount: recentDamage.length,
        activeCombatSessions: activeSessions.length,
        lastDamage: recentDamage[recentDamage.length - 1] || null,
      },
    };
  },
};
