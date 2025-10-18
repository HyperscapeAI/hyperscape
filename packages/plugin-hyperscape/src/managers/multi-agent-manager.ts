import { IAgentRuntime, logger, UUID, createUniqueUuid } from "@elizaos/core";
import { HyperscapeService } from "../service";
import { EventEmitter } from "events";
import type { ChatMessage } from "../types/core-types";

export interface AgentInstance {
  id: UUID;
  runtime: IAgentRuntime;
  service: HyperscapeService;
  name: string;
  position?: { x: number; y: number; z: number };
  status: "connecting" | "connected" | "disconnected" | "error";
  lastUpdate: number;
}

export interface MultiAgentConfig {
  worldUrl: string;
  maxAgents: number;
  agentSpacing: number; // Distance between agents when spawning
  enableAutonomy?: boolean;
}

export class MultiAgentManager extends EventEmitter {
  private agents: Map<UUID, AgentInstance> = new Map();
  private worldUrl: string;
  private maxAgents: number;
  private agentSpacing: number;
  private isRunning: boolean = false;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(config: MultiAgentConfig) {
    super();
    this.worldUrl = config.worldUrl;
    this.maxAgents = config.maxAgents;
    this.agentSpacing = config.agentSpacing;
  }

  /**
   * Add an agent to the world
   */
  async addAgent(runtime: IAgentRuntime): Promise<AgentInstance> {
    const agentId = runtime.agentId;
    const service = new HyperscapeService(runtime);

    const agent: AgentInstance = {
      id: agentId,
      runtime,
      service,
      name: runtime.character.name,
      status: "connecting",
      lastUpdate: Date.now(),
    };

    this.agents.set(agentId, agent);

    // Calculate spawn position based on number of agents
    const spawnIndex = this.agents.size - 1;
    const spawnX = (spawnIndex % 5) * this.agentSpacing;
    const spawnZ = Math.floor(spawnIndex / 5) * this.agentSpacing;

    // Connect agent to world
    const worldId = createUniqueUuid(runtime, `${agentId}-multi-agent`) as UUID;
    await service.connect({
      wsUrl: this.worldUrl,
      worldId,
      authToken: undefined,
    });

    agent.status = "connected";
    agent.position = { x: spawnX, y: 0, z: spawnZ };

    // Move agent to spawn position
    const world = service.getWorld()!;
    const controls = world.controls!;
    controls.goto(spawnX, spawnZ);

    logger.info(
      `Agent ${agent.name} connected to world at position (${spawnX}, 0, ${spawnZ})`,
    );
    this.emit("agentConnected", agent);

    return agent;
  }

  /**
   * Remove an agent from the world
   */
  async removeAgent(agentId: UUID): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn(`[MultiAgentManager] Agent ${agentId} not found for removal`);
      return;
    }

    await agent.service.disconnect();
    agent.status = "disconnected";
    this.agents.delete(agentId);
    logger.info(`Agent ${agent.name} disconnected from world`);
    this.emit("agentDisconnected", agent);
  }

  /**
   * Get all connected agents
   */
  getAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get a specific agent
   */
  getAgent(agentId: UUID): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Start the multi-agent manager
   */
  start(): void {
    if (this.isRunning) {
      logger.warn("Multi-agent manager already running");
      return;
    }

    this.isRunning = true;

    // Start update loop
    this.updateInterval = setInterval(() => {
      this.updateAgents();
    }, 1000); // Update every second

    logger.info("Multi-agent manager started");
    this.emit("started");
  }

  /**
   * Stop the multi-agent manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn("Multi-agent manager not running");
      return;
    }

    this.isRunning = false;

    // Stop update loop
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Disconnect all agents
    const disconnectPromises = Array.from(this.agents.values()).map((agent) =>
      this.removeAgent(agent.id).catch((error) =>
        logger.error(`Error disconnecting agent ${agent.name}:`, error),
      ),
    );

    await Promise.all(disconnectPromises);

    logger.info("Multi-agent manager stopped");
    this.emit("stopped");
  }

  /**
   * Update agent positions and status
   */
  private updateAgents(): void {
    for (const agent of this.agents.values()) {
      const world = agent.service.getWorld();
      if (!world || !world.entities.player) {
        logger.warn(`[MultiAgentManager] World or player not available for agent ${agent.name}`);
        continue;
      }

      const player = world.entities.player;

      agent.position = {
        x: player.node.position.x,
        y: player.node.position.y,
        z: player.node.position.z,
      };

      // Check connection status
      if (agent.service.isConnected()) {
        if (agent.status !== "connected") {
          agent.status = "connected";
          this.emit("agentReconnected", agent);
        }
      } else {
        if (agent.status === "connected") {
          agent.status = "disconnected";
          this.emit("agentDisconnected", agent);
        }
      }

      agent.lastUpdate = Date.now();
    }

    this.emit("agentsUpdated", this.getAgents());
  }

  /**
   * Enable inter-agent communication using event-based architecture
   * Avoids method override hacks and tight coupling
   */
  enableInterAgentCommunication(): void {
    logger.info("[MultiAgentManager] Enabling inter-agent communication");

    // Set up event-based message routing between agents
    for (const agent of this.agents.values()) {
      // Store original sendMessage for each agent
      const messageManager = agent.service.getMessageManager();
      if (!messageManager) {
        logger.warn(`[MultiAgentManager] MessageManager not available for agent ${agent.name}`);
        continue;
      }

      const originalSendMessage = messageManager.sendMessage.bind(messageManager);

      // Wrap sendMessage to broadcast to other agents
      messageManager.sendMessage = async (text: string): Promise<void> => {
        // Send normally
        await originalSendMessage(text);

        // Create chat message for broadcasting
        const chatMessage: ChatMessage = {
          id: createUniqueUuid(runtime, `message-${agent.runtime.agentId}-${Date.now()}`) as UUID,
          from: agent.name,
          userId: agent.runtime.agentId,
          username: agent.name,
          text: text,
          body: text,
          timestamp: Date.now(),
          createdAt: new Date().toISOString(),
        };

        // Broadcast to other agents
        this.broadcastMessage(agent.id, chatMessage);
      };
    }
  }

  /**
   * Broadcast a message from one agent to others
   */
  private broadcastMessage(fromAgentId: UUID, message: ChatMessage): void {
    const fromAgent = this.agents.get(fromAgentId);
    if (!fromAgent) {
      logger.warn(`[MultiAgentManager] Source agent ${fromAgentId} not found for broadcast`);
      return;
    }

    for (const [agentId, agent] of this.agents) {
      if (agentId !== fromAgentId && agent.status === "connected") {
        // Simulate receiving message from another agent
        const messageManager = agent.service.getMessageManager();
        if (!messageManager) {
          logger.warn(`[MultiAgentManager] MessageManager not available for agent ${agent.name}`);
          continue;
        }

        const agentMessage: ChatMessage = {
          ...message,
          from: fromAgent.name,
          userId: fromAgentId,
          username: fromAgent.name,
        };

        messageManager
          .handleMessage(agentMessage)
          .catch((error) =>
            logger.error(
              `[MultiAgentManager] Error broadcasting message to agent ${agent.name}:`,
              error,
            ),
          );
      }
    }
  }

  /**
   * Get agent statistics
   */
  getStats() {
    const connected = Array.from(this.agents.values()).filter(
      (a) => a.status === "connected",
    ).length;
    const total = this.agents.size;

    return {
      total,
      connected,
      disconnected: total - connected,
      agents: Array.from(this.agents.values()).map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        position: agent.position,
        lastUpdate: agent.lastUpdate,
      })),
    };
  }
}
