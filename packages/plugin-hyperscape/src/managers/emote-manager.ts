import { elizaLogger, type IAgentRuntime } from "@elizaos/core";
import { Player, ClientNetwork } from "@hyperscape/shared";
import { promises as fsPromises } from "fs";
import path from "path";
import { NETWORK_CONFIG } from "../config/constants";
import { EMOTES_LIST } from "../constants";
import { HyperscapeService } from "../service";
import { getModuleDirectory, hashFileBuffer } from "../utils";

/**
 * EmoteManager - Manages agent emotes and animations
 *
 * Handles uploading, queueing, and playing emotes for agents in Hyperscape worlds.
 * Emotes are automatically cancelled if the agent starts moving.
 */
export class EmoteManager {
  private emoteHashMap: Map<string, string>;
  private currentEmoteTimeout: NodeJS.Timeout | null;
  private movementCheckInterval: NodeJS.Timeout | null = null;
  private runtime: IAgentRuntime;
  private emoteQueue: string[] = [];
  private isPlayingEmote = false;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    this.emoteHashMap = new Map();
    this.currentEmoteTimeout = null;
  }

  async uploadEmotes() {
    for (const emote of EMOTES_LIST) {
      const moduleDirPath = getModuleDirectory();
      const emoteBuffer = await fsPromises.readFile(moduleDirPath + emote.path);
      const emoteMimeType = "model/gltf-binary";

      const emoteHash = await hashFileBuffer(emoteBuffer);
      const emoteExt = emote.path.split(".").pop()!.toLowerCase();
      const emoteFullName = `${emoteHash}.${emoteExt}`;
      const emoteUrl = `asset://${emoteFullName}`;

      console.info(
        `[Appearance] Uploading emote '${emote.name}' as ${emoteFullName} (${(emoteBuffer.length / 1024).toFixed(2)} KB)`,
      );

      const emoteArrayBuffer = emoteBuffer.buffer.slice(
        emoteBuffer.byteOffset,
        emoteBuffer.byteOffset + emoteBuffer.byteLength,
      ) as ArrayBuffer;
      const emoteFile = new File(
        [emoteArrayBuffer],
        path.basename(emote.path),
        {
          type: emoteMimeType,
        },
      );

      const service = this.getService();
      if (!service) {
        throw new Error("[EmoteManager] Service not available during emote upload");
      }
      const world = service.getWorld();
      if (!world) {
        throw new Error("[EmoteManager] World not available during emote upload");
      }
      const network = world.network as ClientNetwork;

      const emoteUploadPromise = network.upload(emoteFile);
      const emoteTimeout = new Promise((_resolve, reject) =>
        setTimeout(
          () => reject(new Error("Upload timed out")),
          NETWORK_CONFIG.UPLOAD_TIMEOUT_MS,
        ),
      );

      await Promise.race([emoteUploadPromise, emoteTimeout]);

      this.emoteHashMap.set(emote.name, emoteFullName);
      console.info(`[Appearance] Emote '${emote.name}' uploaded: ${emoteUrl}`);
    }
  }

  /**
   * Queue an emote for playback
   * If no emote is currently playing, plays immediately
   * Otherwise adds to queue for sequential playback
   */
  async queueEmote(emoteName: string): Promise<void> {
    // Validate emote exists
    const emoteExists = EMOTES_LIST.some(e => e.name === emoteName);
    if (!emoteExists) {
      elizaLogger.warn(`[EmoteManager] Emote '${emoteName}' not found in EMOTES_LIST`);
      return;
    }

    if (!this.isPlayingEmote) {
      await this.playEmote(emoteName);
    } else {
      this.emoteQueue.push(emoteName);
      elizaLogger.info(`[EmoteManager] Queued emote '${emoteName}' (queue size: ${this.emoteQueue.length})`);
    }
  }

  /**
   * Play an emote immediately
   * Private method - use queueEmote() for public API
   * Throws errors instead of returning early to ensure proper error handling
   */
  private async playEmote(emoteName: string): Promise<void> {
    const service = this.getService();
    if (!service) {
      throw new Error("[EmoteManager] Service not available for emote playback");
    }
    const world = service.getWorld();
    if (!world) {
      throw new Error("[EmoteManager] World not available for emote playback");
    }

    const agentPlayer = world.entities.player as Player;

    // Ensure effect object exists with emote property
    if (!agentPlayer.data) {
      throw new Error("[EmoteManager] Player has no data property");
    }
    const playerData = agentPlayer.data;
    if (!playerData.effect) {
      playerData.effect = { emote: emoteName };
    } else {
      playerData.effect = { emote: emoteName };
    }

    elizaLogger.info(`[EmoteManager] Playing emote '${emoteName}'`);

    this.clearTimers();
    this.isPlayingEmote = true;

    // Get duration from EMOTES_LIST
    const emoteMeta = EMOTES_LIST.find((e) => e.name === emoteName)!;
    const duration = emoteMeta.duration;

    this.movementCheckInterval = setInterval(() => {
      // Check if player is moving (only PlayerLocal/PlayerRemote have moving property)
      const playerWithMovement = agentPlayer as Player & { moving?: boolean };
      if (playerWithMovement.moving) {
        elizaLogger.info(
          `[EmoteManager] Emote '${emoteName}' cancelled early due to movement`,
        );
        this.clearEmote(agentPlayer);
        this.processNextEmote();
      }
    }, 100);

    this.currentEmoteTimeout = setTimeout(() => {
      if (!agentPlayer.data) return;
      const data = agentPlayer.data;
      if (
        data.effect &&
        (data.effect as { emote?: string }).emote === emoteName
      ) {
        elizaLogger.info(
          `[EmoteManager] Emote '${emoteName}' finished after ${duration}s`,
        );
        this.clearEmote(agentPlayer);
        this.processNextEmote();
      }
    }, duration * 1000);
  }

  /**
   * Process next emote in queue
   * Wrapped in try/catch/finally to ensure proper cleanup on errors
   */
  private async processNextEmote(): Promise<void> {
    const nextEmote = this.emoteQueue.shift();
    if (nextEmote) {
      elizaLogger.debug(`[EmoteManager] Playing next queued emote: ${nextEmote}`);
      try {
        await this.playEmote(nextEmote);
      } catch (error) {
        elizaLogger.error(`[EmoteManager] Error playing queued emote '${nextEmote}':`, error);
        // Clear any partial state and continue to next emote
        this.clearTimers();
      } finally {
        // Always ensure we mark as not playing if queue is empty
        if (this.emoteQueue.length === 0) {
          this.isPlayingEmote = false;
        }
      }
    } else {
      this.isPlayingEmote = false;
    }
  }

  private clearEmote(player: Player) {
    if (!player.data) return;
    const data = player.data;
    if (data.effect) {
      data.effect = null;
    }
    this.clearTimers();
  }

  private clearTimers() {
    if (this.currentEmoteTimeout) {
      clearTimeout(this.currentEmoteTimeout);
      this.currentEmoteTimeout = null;
    }
    if (this.movementCheckInterval) {
      clearInterval(this.movementCheckInterval);
      this.movementCheckInterval = null;
    }
  }

  private getService() {
    return this.runtime.getService<HyperscapeService>(
      HyperscapeService.serviceName,
    );
  }
}
