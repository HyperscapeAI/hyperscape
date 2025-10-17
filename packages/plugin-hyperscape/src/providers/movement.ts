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
 * Movement State Provider
 *
 * Exposes current position and movement state to the LLM for decision-making.
 * Enhanced with EntityEventHandler and CombatEventHandler for threat awareness.
 *
 * The LLM uses this context along with the character's personality to decide
 * where to go, when to stop, how to navigate the world, etc.
 *
 * This provider does NOT make decisions - it only provides context.
 * Decisions are made by the LLM based on character.json personality.
 *
 * **Enhancement**: Now detects nearby combat activity and aggressive entities for threat avoidance.
 *
 * Example character reactions (defined in character.json):
 * - An explorer agent might wander to new locations frequently
 * - A woodcutter agent might move toward tree clusters
 * - A social agent might move toward groups of players
 * - A cautious agent might avoid areas with active combat
 */
export const movementProvider: Provider = {
  name: "MOVEMENT",
  description: "Current position, movement status, and nearby threat assessment",
  dynamic: true,
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
  ): Promise<ProviderResult> => {
    const service = runtime.getService<HyperscapeService>("hyperscape");
    if (!service) {
      logger.debug("[MOVEMENT_PROVIDER] No Hyperscape service found");
      return { text: "", data: {} };
    }

    const world = service.getWorld();
    if (!world) {
      logger.debug("[MOVEMENT_PROVIDER] No world found");
      return { text: "", data: {} };
    }

    const player = world.entities.player;
    if (!player) {
      logger.debug("[MOVEMENT_PROVIDER] No player entity found");
      return { text: "", data: {} };
    }

    // Get event handlers for threat detection
    const entityEventHandler = service.getEntityEventHandler();
    const combatEventHandler = service.getCombatEventHandler();

    // Get position
    const position = player.position || player.base?.position || { x: 0, y: 0, z: 0 };
    const x = position.x;
    const y = position.y;
    const z = position.z;

    // Get movement system if available
    const movementSystem = world.getSystem?.('movement');
    const isMoving = movementSystem
      ? (movementSystem as any).isMoving?.(player.data.id) ?? false
      : false;

    // Format position in a readable way
    const positionText = `POSITION: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`;
    const statusText = `STATUS: ${isMoving ? "Moving" : "Stationary"}`;

    // Determine region/area (simplified - could be enhanced with actual region data)
    let regionHint = "";
    if (Math.abs(x) < 50 && Math.abs(z) < 50) {
      regionHint = "\nAREA: Near spawn/center region";
    } else if (Math.abs(x) > 100 || Math.abs(z) > 100) {
      regionHint = "\nAREA: Far from spawn (exploration zone)";
    }

    // Check for nearby threats
    const playerId = player.data.id;
    const activeCombatSessions = combatEventHandler ? Array.from(combatEventHandler.getActiveSessions().values()) : [];
    const nearbyCombat = activeCombatSessions.filter(session => {
      // Check if combat involves player or is nearby
      return session.isActive && (session.attackerId === playerId || session.targetId === playerId);
    });

    const otherCombats = activeCombatSessions.filter(session => {
      return session.isActive && session.attackerId !== playerId && session.targetId !== playerId;
    });

    let threatText = "";
    if (nearbyCombat.length > 0) {
      threatText = "\n\n⚠️ THREAT: You are in active combat!";
    } else if (otherCombats.length > 0) {
      threatText = `\n\n⚠️ WARNING: ${otherCombats.length} active combat(s) nearby. Area may be dangerous.`;
    }

    // Check for recently spawned aggressive entities
    const recentSpawns = entityEventHandler?.getRecentSpawns(5) ?? [];
    const recentAggressiveSpawns = recentSpawns.filter(spawn => {
      const type = spawn.type?.toLowerCase() || "";
      return type.includes("mob") || type.includes("enemy") || type.includes("goblin") || type.includes("monster");
    });

    if (recentAggressiveSpawns.length > 0) {
      const spawnList = recentAggressiveSpawns.map(s => {
        const timeSince = Math.floor((Date.now() - s.timestamp) / 1000);
        return `  - ${s.name || s.type} spawned ${timeSince}s ago`;
      }).join("\n");
      threatText += `\n\n🔴 Recent Aggressive Spawns:\n${spawnList}`;
    }

    const text = addHeader(
      "# Movement & Position",
      [positionText, statusText, regionHint, threatText].filter(Boolean).join("\n")
    );

    return {
      text,
      values: {
        movementStatus: text,
        isMoving,
        x,
        z,
        inCombat: nearbyCombat.length > 0,
        nearbyCombatCount: otherCombats.length,
        threatLevel: nearbyCombat.length > 0 ? "high" : otherCombats.length > 0 ? "medium" : "low",
        success: true,
      },
      data: {
        x,
        y,
        z,
        position: { x, y, z },
        isMoving,
        distanceFromSpawn: Math.sqrt(x * x + z * z),
        inCombat: nearbyCombat.length > 0,
        nearbyCombatCount: otherCombats.length,
        recentAggressiveSpawns: recentAggressiveSpawns.length,
      },
    };
  },
};
