/**
 * resource-event-handler.ts - Resource Event Handler
 *
 * Tracks resource nodes (trees, rocks, fish spots) for gathering skills.
 * Monitors resource availability, depletion, and respawn states.
 *
 * **Purpose**:
 * - Track all resource nodes in the world
 * - Monitor resource availability (depleted vs. harvestable)
 * - Predict respawn times
 * - Help agent find optimal gathering locations
 *
 * **Handled Events**:
 * - RESOURCE_SPAWNED: New resource node appeared
 * - RESOURCE_DEPLETED: Resource was harvested
 * - RESOURCE_RESPAWNED: Resource became available again
 * - RESOURCE_GATHERING_STARTED: Agent started gathering
 * - RESOURCE_GATHERING_COMPLETED: Gathering finished
 *
 * **Integration**:
 * - Called by WorldEventBridge
 * - Provides data to skill providers (woodcutting, fishing, mining)
 * - Helps actions find nearest available resources
 *
 * CLAUDE.md Compliance:
 * - ✅ Strong typing enforced
 * - ✅ Self-contained functionality
 * - ✅ Proper error handling
 */

import { type IAgentRuntime, elizaLogger } from "@elizaos/core";
import type { World } from "@hyperscape/shared";

/**
 * Resource state
 */
type ResourceState = "available" | "depleted" | "gathering";

/**
 * Resource node data
 */
type ResourceNode = {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  state: ResourceState;
  depletedAt?: number;
  respawnAt?: number;
  gatheringStartedAt?: number;
  lastGatheredBy?: string;
};

/**
 * Resource event data from world
 */
type ResourceEventData = {
  id?: string;
  resourceId?: string;
  type?: string;
  resourceType?: string;
  position?: { x: number; y: number; z: number };
  isAvailable?: boolean;
  respawnAt?: number;
  playerId?: string;
  successful?: boolean;
  [key: string]: unknown;
};

/**
 * Resource Event Handler - Tracks resource node lifecycle
 */
export class ResourceEventHandler {
  private runtime: IAgentRuntime;
  private world: World;
  private resources: Map<string, ResourceNode>;

  constructor(runtime: IAgentRuntime, world: World) {
    this.runtime = runtime;
    this.world = world;
    this.resources = new Map();
  }

  /**
   * Handle resource spawned event
   */
  async handleResourceSpawned(data: ResourceEventData): Promise<void> {
    try {
      const resourceId = data.id || data.resourceId;
      const resourceType = data.type || data.resourceType;

      if (!resourceId || !resourceType || !data.position) {
        elizaLogger.warn(`[ResourceEventHandler] Invalid resource spawn data: ${JSON.stringify(data)}`);
        return;
      }

      const node: ResourceNode = {
        id: resourceId,
        type: resourceType,
        position: data.position,
        state: "available",
      };

      this.resources.set(resourceId, node);

      elizaLogger.info(`[ResourceEventHandler] Resource spawned: ${resourceType} at (${data.position.x}, ${data.position.y}, ${data.position.z})`);
    } catch (error) {
      elizaLogger.error(`[ResourceEventHandler] Error handling resource spawn: ${error}`);
    }
  }

  /**
   * Handle resource depleted event
   */
  async handleResourceDepleted(data: ResourceEventData): Promise<void> {
    try {
      const resourceId = data.id || data.resourceId;

      if (!resourceId) {
        elizaLogger.warn(`[ResourceEventHandler] Invalid resource depletion data: ${JSON.stringify(data)}`);
        return;
      }

      const node = this.resources.get(resourceId);
      if (!node) {
        elizaLogger.warn(`[ResourceEventHandler] Unknown resource depleted: ${resourceId}`);
        return;
      }

      node.state = "depleted";
      node.depletedAt = Date.now();
      node.respawnAt = data.respawnAt;

      elizaLogger.info(`[ResourceEventHandler] Resource depleted: ${node.type} (${resourceId}) - respawn in ${data.respawnAt ? `${Math.floor((data.respawnAt - Date.now()) / 1000)}s` : "unknown"}`);
    } catch (error) {
      elizaLogger.error(`[ResourceEventHandler] Error handling resource depletion: ${error}`);
    }
  }

  /**
   * Handle resource respawned event
   */
  async handleResourceRespawned(data: ResourceEventData): Promise<void> {
    try {
      const resourceId = data.id || data.resourceId;

      if (!resourceId) {
        elizaLogger.warn(`[ResourceEventHandler] Invalid resource respawn data: ${JSON.stringify(data)}`);
        return;
      }

      const node = this.resources.get(resourceId);
      if (!node) {
        elizaLogger.warn(`[ResourceEventHandler] Unknown resource respawned: ${resourceId}`);
        return;
      }

      node.state = "available";
      delete node.depletedAt;
      delete node.respawnAt;
      delete node.gatheringStartedAt;
      delete node.lastGatheredBy;

      elizaLogger.info(`[ResourceEventHandler] Resource respawned: ${node.type} (${resourceId})`);
    } catch (error) {
      elizaLogger.error(`[ResourceEventHandler] Error handling resource respawn: ${error}`);
    }
  }

  /**
   * Handle gathering started event
   */
  async handleGatheringStarted(data: ResourceEventData): Promise<void> {
    try {
      const resourceId = data.id || data.resourceId;
      const playerId = data.playerId;

      if (!resourceId) {
        elizaLogger.warn(`[ResourceEventHandler] Invalid gathering start data: ${JSON.stringify(data)}`);
        return;
      }

      const node = this.resources.get(resourceId);
      if (!node) {
        elizaLogger.warn(`[ResourceEventHandler] Gathering started on unknown resource: ${resourceId}`);
        return;
      }

      node.state = "gathering";
      node.gatheringStartedAt = Date.now();
      node.lastGatheredBy = playerId;

      elizaLogger.info(`[ResourceEventHandler] Gathering started: ${node.type} (${resourceId}) by ${playerId || "unknown"}`);
    } catch (error) {
      elizaLogger.error(`[ResourceEventHandler] Error handling gathering start: ${error}`);
    }
  }

  /**
   * Handle gathering completed event
   */
  async handleGatheringCompleted(data: ResourceEventData): Promise<void> {
    try {
      const resourceId = data.id || data.resourceId;
      const successful = data.successful ?? true;

      if (!resourceId) {
        elizaLogger.warn(`[ResourceEventHandler] Invalid gathering completion data: ${JSON.stringify(data)}`);
        return;
      }

      const node = this.resources.get(resourceId);
      if (!node) {
        elizaLogger.warn(`[ResourceEventHandler] Gathering completed on unknown resource: ${resourceId}`);
        return;
      }

      if (successful) {
        // Resource was depleted
        node.state = "depleted";
        node.depletedAt = Date.now();
      } else {
        // Gathering failed/interrupted
        node.state = "available";
      }

      delete node.gatheringStartedAt;

      elizaLogger.info(`[ResourceEventHandler] Gathering completed: ${node.type} (${resourceId}) - ${successful ? "depleted" : "failed"}`);
    } catch (error) {
      elizaLogger.error(`[ResourceEventHandler] Error handling gathering completion: ${error}`);
    }
  }

  /**
   * Get all resources
   */
  getAllResources(): Map<string, ResourceNode> {
    return new Map(this.resources);
  }

  /**
   * Get available resources by type
   */
  getAvailableResourcesByType(type: string): ResourceNode[] {
    const available: ResourceNode[] = [];

    for (const node of this.resources.values()) {
      if (node.type === type && node.state === "available") {
        available.push(node);
      }
    }

    return available;
  }

  /**
   * Get nearest available resource of type
   */
  getNearestAvailableResource(
    type: string,
    position: { x: number; y: number; z: number }
  ): ResourceNode | null {
    let nearest: ResourceNode | null = null;
    let nearestDistance = Infinity;

    for (const node of this.resources.values()) {
      if (node.type !== type || node.state !== "available") {
        continue;
      }

      const dx = node.position.x - position.x;
      const dy = node.position.y - position.y;
      const dz = node.position.z - position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  /**
   * Get resources near position
   */
  getResourcesNearPosition(
    position: { x: number; y: number; z: number },
    radius: number,
    type?: string
  ): ResourceNode[] {
    const nearby: ResourceNode[] = [];

    for (const node of this.resources.values()) {
      if (type && node.type !== type) {
        continue;
      }

      const dx = node.position.x - position.x;
      const dy = node.position.y - position.y;
      const dz = node.position.z - position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance <= radius) {
        nearby.push(node);
      }
    }

    return nearby;
  }

  /**
   * Get resource by ID
   */
  getResourceById(resourceId: string): ResourceNode | undefined {
    return this.resources.get(resourceId);
  }

  /**
   * Clear all resources
   */
  clear(): void {
    this.resources.clear();
  }
}
