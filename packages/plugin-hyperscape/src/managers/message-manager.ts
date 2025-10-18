import {
  Entity as ElizaEntity,
  IAgentRuntime,
  Memory,
  ModelType,
  UUID,
  type Content,
  type State,
} from "@elizaos/core";
import type { HyperscapeService } from "../service";
import { World, Entity } from "../types/core-types";
import { ChatMessage } from "../types";

type HyperscapePlayerData = Entity & {
  metadata?: {
    hyperscape?: {
      name?: string;
    };
  };
  data: {
    appearance?: {
      avatar?: string;
    };
    [key: string]: string | number | boolean | Record<string, unknown> | undefined;
  };
};

type ElizaEntityWithHyperscape = ElizaEntity & {
  data?: {
    name?: string;
  };
  metadata?: {
    hyperscape?: {
      name?: string;
    };
    [key: string]: string | number | boolean | Record<string, unknown> | undefined;
  };
};

interface MessageManagerInterface {
  processMessage(msg: ChatMessage): Promise<void>;
  sendMessage(message: string): Promise<void>;
  handleChatError(error: Error): void;
}

interface MessageResponse {
  text: string;
  shouldRespond: boolean;
  confidence: number;
}

interface EntityDetails {
  id: string;
  name: string;
  type: string;
  position?: { x: number; y: number; z: number };
}

export class MessageManager {
  public runtime: IAgentRuntime;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  async handleMessage(msg: ChatMessage): Promise<void> {
    console.info("[MessageManager] Processing message:", {
      id: msg.id,
      userId: msg.userId,
      username: msg.username,
      text: msg.text?.substring(0, 100) + (msg.text?.length > 100 ? "..." : ""),
    });

    const service = this.getService()!;
    const world = service.getWorld()!;

    // Skip messages from this agent
    if (msg.userId === this.runtime.agentId) {
      console.debug("[MessageManager] Skipping own message");
      return;
    }

    // Convert chat message to Memory format
    const memory: Memory = {
      id: msg.id as UUID,
      entityId: msg.userId as UUID,
      agentId: this.runtime.agentId,
      content: {
        text: msg.text,
        source: "hyperscape_chat",
      },
      roomId: world.entities.player!.data.id as UUID,
      createdAt: new Date(msg.createdAt).getTime(),
      metadata: {
        type: "message",
        hyperscape: {
          username: msg.username,
          name: msg.username,
          worldId: service.currentWorldId!,
        },
        username: msg.username,
        avatar: msg.avatar,
        userId: msg.userId,
      },
    };

    // Save message to memory first
    await this.runtime.createMemory(memory, "messages");

    // Compose state with providers (includes world context from worldContextProvider)
    const state = await this.runtime.composeState(memory);

    // Check if we should respond
    const shouldRespond = await this.shouldRespondToMessage(memory, state);
    if (!shouldRespond) {
      console.debug("[MessageManager] Skipping message (should not respond)");
      return;
    }

    // Track responses
    const responses: Memory[] = [];

    // Process actions using ElizaOS core
    await this.runtime.processActions(
      memory,
      responses,
      state,
      async (content: Content) => {
        if (content?.text) {
          await this.sendMessage(content.text);
          console.info("[MessageManager] Response sent:", {
            originalMessage: msg.text?.substring(0, 50) + "...",
            response: content.text?.substring(0, 50) + "...",
            action: content.action || "none",
          });
        }
        return [];
      }
    );

    // If no action handled the message, generate conversational response
    if (responses.length === 0) {
      const response = await this.generateConversationalResponse(memory, state);
      if (response) {
        await this.sendMessage(response);
        console.info("[MessageManager] Generated conversational response");
      }
    }

    console.debug("[MessageManager] Message processing complete");
  }

  async sendMessage(text: string): Promise<void> {
    const service = this.getService()!;
    const world = service.getWorld()!;
    const player = world.entities.player!;

    // Create chat message
    const chatMessage: ChatMessage = {
      id: crypto.randomUUID(),
      from:
        player.data.name ||
        (player as HyperscapePlayerData).metadata?.hyperscape?.name ||
        "AI Agent",
      userId: this.runtime.agentId,
      username: player.data.name || "AI Agent",
      text: text,
      body: text,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      avatar: (player.data as HyperscapePlayerData["data"])?.appearance?.avatar,
    };

    // Add message to chat system
    world.chat.add(chatMessage, true);

    console.info(`[MessageManager] Sent message: ${text}`);
  }

  formatMessages({
    messages,
    entities,
  }: {
    messages: Memory[];
    entities: ElizaEntity[];
  }): string {
    // Create entity lookup map
    const entityMap = new Map<string, ElizaEntity>();
    entities.forEach((entity) => {
      entityMap.set(entity.id!, entity);
    });

    // Format messages with entity context
    const formattedMessages = messages
      .slice(-10) // Get last 10 messages
      .map((msg) => {
        const metadata = msg.metadata as { userId?: string; username?: string };
        const userId = String(metadata.userId || "");
        const entity = entityMap.get(userId);
        const username = String(metadata.username || "Unknown");
        const senderName =
          (entity as ElizaEntityWithHyperscape).data?.name ||
          (entity as ElizaEntityWithHyperscape).metadata?.hyperscape?.name ||
          username;
        const timestamp = new Date(
          msg.createdAt || Date.now(),
        ).toLocaleTimeString();
        const text = msg.content.text || "";

        return `[${timestamp}] ${senderName}: ${text}`;
      })
      .join("\n");

    return formattedMessages;
  }

  async getRecentMessages(roomId: UUID, count = 20): Promise<Memory[]> {
    // Get recent messages from runtime memory
    const memories = await this.runtime.getMemories({
      roomId,
      count,
      unique: false,
      tableName: "messages",
    });

    // Filter for message-type memories and sort by creation time
    const messageMemories = memories
      .filter(
        (memory) =>
          memory.content.source === "hyperscape_chat" ||
          memory.content.source === "agent_response",
      )
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .slice(-count);

    return messageMemories;
  }

  private getService(): HyperscapeService | null {
    return this.runtime.getService<HyperscapeService>("hyperscape") || null;
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private findEntityByUserId(world: World, userId: string): Entity {
    // Check players first
    for (const [id, player] of world.entities.players) {
      if (player.data.id === userId || id === userId) {
        return player;
      }
    }

    // Check other entities
    for (const [id, entity] of world.entities.items) {
      if (entity.data.id === userId || id === userId) {
        return entity;
      }
    }

    throw new Error(`Entity not found for userId: ${userId}`);
  }

  private getEntityDetails(entity: Entity): EntityDetails {
    return {
      id: entity.id,
      name:
        entity.data.name ||
        (entity as HyperscapePlayerData).metadata?.hyperscape?.name ||
        "Unknown",
      type: (entity.data.type as string) || "entity",
      position: entity.position
        ? {
            x: entity.position.x,
            y: entity.position.y,
            z: entity.position.z,
          }
        : undefined,
    };
  }

  private getWorldContext(world: World): string {
    const playerCount = world.entities.players.size;
    const entityCount = world.entities.items.size;
    const player = world.entities.player!;

    const context = [
      `Players online: ${playerCount}`,
      `Entities in world: ${entityCount}`,
      `Agent position: (${player.node.position.x.toFixed(1)}, ${player.node.position.y.toFixed(1)}, ${player.node.position.z.toFixed(1)})`,
    ];

    return context.join(", ");
  }

  /**
   * Determine if agent should respond to message
   *
   * By default, only responds when:
   * - Agent is mentioned by name
   * - Message is a direct message
   *
   * Can be overridden by setting alwaysRespond config option to true
   */
  private async shouldRespondToMessage(
    message: Memory,
    state: State
  ): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || "";
    const agentName = this.runtime.character.name;
    const nameToCheck = Array.isArray(agentName)
      ? agentName[0].toLowerCase()
      : agentName.toLowerCase();

    // Always respond if mentioned by name
    if (text.includes(nameToCheck)) {
      return true;
    }

    // Always respond to direct messages
    if (message.content.userName && text.length > 0) {
      return true;
    }

    // Check for configurable override to allow broadcast responses
    // This can be set via runtime.character.settings.alwaysRespond = true
    const settings = this.runtime.character.settings as Record<string, unknown> | undefined;
    if (settings?.alwaysRespond === true) {
      return true;
    }

    // Default to NOT responding (only respond when mentioned or in DMs)
    return false;
  }

  /**
   * Generate conversational response when no action matches
   */
  private async generateConversationalResponse(
    message: Memory,
    state: State
  ): Promise<string | null> {
    try {
      const context = this.buildLLMContext(message, state);

      const responseText = await this.runtime.useModel(
        ModelType.TEXT_LARGE,
        {
          prompt: context,
          max_tokens: 1000,
          temperature: 0.8,
          stop: [],
        }
      );

      // Parse response text using helper
      const textContent = this.parseResponseText(responseText);

      return textContent.trim();
    } catch (error) {
      console.error("[MessageManager] Failed to generate response:", error);
      return null;
    }
  }

  /**
   * Parse LLM response text with clear type guards
   *
   * @param responseText - Unknown response from LLM (could be string, object, or other type)
   * @returns Parsed string content
   */
  private parseResponseText(responseText: unknown): string {
    // Check if it's already a string
    if (typeof responseText === 'string') {
      return responseText;
    }

    // Check if it's an object with a 'text' property
    if (responseText && typeof responseText === 'object' && 'text' in responseText) {
      const textValue = (responseText as { text: unknown }).text;
      return String(textValue);
    }

    // Fallback: convert to string
    return String(responseText);
  }

  /**
   * Build LLM context from state
   */
  private buildLLMContext(message: Memory, state: State): string {
    const characterName = Array.isArray(this.runtime.character.name)
      ? this.runtime.character.name[0]
      : this.runtime.character.name;

    const characterBio = Array.isArray(this.runtime.character.bio)
      ? this.runtime.character.bio.join(" ")
      : this.runtime.character.bio;

    let context = `You are ${characterName}. ${characterBio}\n\n`;

    // Add state context (includes provider outputs like worldContextProvider)
    if (state.text) {
      context += `${state.text}\n\n`;
    }

    // Add current message
    context += `Message from ${message.content.userName || "User"}:\n${message.content.text}\n\n`;
    context += `Generate a response as ${characterName}. Keep it natural and in-character.\n`;

    return context;
  }
}
