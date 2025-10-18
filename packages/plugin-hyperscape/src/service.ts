/**
 * Hyperscape Service - ElizaOS World Integration
 *
 * This service manages the connection between ElizaOS agents and Hyperscape 3D worlds.
 * It handles real-time state synchronization, action execution, and event routing for
 * autonomous agents operating in virtual environments.
 *
 * **Architecture**:
 *
 * **Connection Management**:
 * - Establishes WebSocket connection to Hyperscape server
 * - Maintains connection state and handles reconnection
 * - Synchronizes world state with the agent's decision-making system
 *
 * **Agent Managers**:
 * - `BehaviorManager`: Coordinates agent behaviors and action selection
 * - `BuildManager`: Handles world editing and entity placement
 * - `EmoteManager`: Manages gestures and animations
 * - `MessageManager`: Routes chat messages and handles replies
 * - `MultiAgentManager`: Coordinates multiple agents in the same world
 * - `VoiceManager`: Manages voice chat and audio interactions
 * - `PlaywrightManager`: Provides headless testing capabilities
 * - `DynamicActionLoader`: Loads custom actions from content packs
 *
 * **World Interaction**:
 * - Movement: Navigate to locations, patrol areas, wander randomly
 * - Interaction: Use items, activate objects, gather resources
 * - Communication: Send chat messages, respond to users, perform emotes
 * - Building: Place entities, modify the world (if agent has builder permissions)
 * - Perception: Scan environment, identify nearby entities and users
 *
 * **State Management**:
 * - Tracks agent's current position, health, inventory
 * - Monitors nearby entities and users
 * - Maintains conversation context for natural interactions
 * - Persists agent state across reconnections
 *
 * **Event Handling**:
 * Listens for world events and routes them to the agent:
 * - Chat messages → MessageManager → Agent decision-making
 * - Entity spawns/despawns → Update world state
 * - Player join/leave → Update social context
 * - System events → Trigger appropriate behaviors
 *
 * **Content Packs**:
 * Supports loading custom content bundles that extend agent capabilities:
 * - Custom actions and behaviors
 * - World-specific knowledge
 * - Specialized interaction patterns
 *
 * **Testing Support**:
 * Integrates with Playwright for automated testing:
 * - Headless agent spawning
 * - Scripted behavior sequences
 * - World state verification
 * - Screenshot capture for debugging
 *
 * **Referenced by**: ElizaOS plugin system, agent runtime, action handlers
 */

import {
  createUniqueUuid,
  EventType,
  IAgentRuntime,
  logger,
  Service,
  type Component as ElizaComponent,
  type UUID,
} from "@elizaos/core";
import {
  EventDataSchema,
  EntityDataSchema,
  EntityUpdateSchema,
  PlayerDataExtendedSchema,
  ControllerInterfaceSchema,
  ChatMessageDataSchema,
  type EventData,
  type EntityData as ValidatedEntityData,
  type EntityUpdate,
  type PlayerAppearance,
  type ControllerInterface,
} from "./types/validation-schemas";
// Minimal implementation for now - we'll improve this once we have proper imports working
import type { Quaternion } from "@hyperscape/shared";
import {
  Chat,
  ClientInput,
  Entity,
  loadPhysX,
  createNodeClientWorld,
  type NetworkSystem,
  type World,
  type Player,
} from "@hyperscape/shared";
import { promises as fsPromises } from "fs";
import path from "path";
import { Vector3 } from "three";
import { BehaviorManager } from "./managers/behavior-manager";
import { BuildManager } from "./managers/build-manager";
import { DynamicActionLoader } from "./managers/dynamic-action-loader";
import { EmoteManager } from "./managers/emote-manager";
import { MessageManager } from "./managers/message-manager";
import { MultiAgentManager } from "./managers/multi-agent-manager";
import { PlaywrightManager } from "./managers/playwright-manager";
import { VoiceManager } from "./managers/voice-manager";
import { AgentActions } from "./systems/actions";
import { EnvironmentSystem } from "./systems/environment";
import { AgentLiveKit } from "./systems/liveKit";
import { AgentLoader } from "./systems/loader";
import type {
  EntityModificationData,
  RPGStateManager,
  TeleportOptions,
} from "./types/content-types";
import type {
  IContentPack,
  IGameSystem,
} from "./types/content-pack";
import {
  CharacterController,
} from "./types/core-types";
import type {
  CharacterControllerOptions,
  ChatMessage,
  ContentBundle,
  ContentInstance,
  Position,
  RigidBody,
} from "./types/core-types";

/**
 * EntityData interface for agent-created entities
 * Defines the structure for entities the agent can spawn or modify
 */
interface EntityData {
  id: string;
  type: string;
  position?: [number, number, number] | { x: number; y: number; z: number };
  quaternion?:
    | [number, number, number, number]
    | { x: number; y: number; z: number; w: number };
  [key: string]: string | number | boolean | number[] | { x: number; y: number; z: number } | { x: number; y: number; z: number; w: number } | undefined;
}

import type { NetworkEventData } from "./types/event-types";
import { getModuleDirectory, hashFileBuffer } from "./utils";

const moduleDirPath = getModuleDirectory();
const LOCAL_AVATAR_PATH = `${moduleDirPath}/avatars/avatar.vrm`;

import { AGENT_CONFIG, NETWORK_CONFIG } from "./config/constants";

type ChatSystem = Chat;

/**
 * Extended NetworkSystem interface with upload capability
 */
interface UploadableNetwork extends NetworkSystem {
  upload: (file: File) => Promise<string>;
}

/**
 * Extended Player interface with modification methods
 */
interface ModifiablePlayer extends Player {
  modify: (data: { name: string }) => void;
  setSessionAvatar: (url: string) => void;
}

/**
 * HyperscapeService - Main service class for agent-world integration
 *
 * Manages connection lifecycle, state synchronization, and coordinates
 * all agent activities within the Hyperscape world.
 */
export class HyperscapeService extends Service {
  static serviceName = "hyperscape";
  serviceName = "hyperscape";
  declare runtime: IAgentRuntime;

  capabilityDescription = `
Hyperscape world integration service that enables agents to:
- Connect to 3D virtual worlds through WebSocket connections
- Navigate virtual environments and interact with objects
- Communicate with other users via chat and voice
- Perform gestures and emotes
- Build and modify world environments
- Share content and media within virtual spaces
- Manage multi-agent interactions in virtual environments
  `;

  // Connection and world state
  private isServiceConnected = false;
  private world: World | null = null;

  // Manager components
  private playwrightManager: PlaywrightManager | null = null;
  private emoteManager: EmoteManager | null = null;
  private messageManager: MessageManager | null = null;
  private voiceManager: VoiceManager | null = null;
  private behaviorManager: BehaviorManager | null = null;
  private buildManager: BuildManager | null = null;
  private dynamicActionLoader: DynamicActionLoader | null = null;

  // Network state
  private maxRetries = 3;
  private retryDelay = NETWORK_CONFIG.RETRY_DELAY_MS;
  private connectionTimeoutMs = NETWORK_CONFIG.CONNECTION_TIMEOUT_MS;

  private _currentWorldId: UUID | null = null;
  private lastMessageHash: string | null = null;
  private appearanceRefreshInterval: NodeJS.Timeout | null = null;
  private appearanceHash: string | null = null;
  private connectionTime: number | null = null;
  private multiAgentManager?: MultiAgentManager;
  private processedMsgIds: Set<string> = new Set();
  private playerNamesMap: Map<string, string> = new Map();
  private hasChangedName = false;

  // UGC content support
  private loadedContent: Map<string, ContentInstance> = new Map();

  // Content pack support
  private loadedContentPacks: Map<string, IContentPack> = new Map();
  private activeGameSystems: Map<string, IGameSystem[]> = new Map();

  public get currentWorldId(): UUID | null {
    return this._currentWorldId;
  }

  public getWorld(): World | null {
    return this.world;
  }

  constructor(runtime: IAgentRuntime) {
    super();
    this.runtime = runtime;
    console.info("HyperscapeService instance created");
  }

  /**
   * Start the Hyperscape service
   */
  static async start(runtime: IAgentRuntime): Promise<HyperscapeService> {
    console.info("*** Starting Hyperscape service ***");
    const service = new HyperscapeService(runtime);
    console.info(
      `Attempting automatic connection to default Hyperscape URL: ${NETWORK_CONFIG.DEFAULT_WS_URL}`,
    );
    const defaultWorldId = createUniqueUuid(
      runtime,
      `${runtime.agentId}-default-hyperscape`,
    ) as UUID;
    const authToken: string | undefined = undefined;

    service
      .connect({
        wsUrl: NETWORK_CONFIG.DEFAULT_WS_URL,
        worldId: defaultWorldId,
        authToken,
      })
      .then(() => console.info("Automatic Hyperscape connection initiated."))
      .catch((err) =>
        console.error(`Automatic Hyperscape connection failed: ${err.message}`),
      );

    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    console.info("*** Stopping Hyperscape service ***");
    const service = runtime.getService<HyperscapeService>(
      HyperscapeService.serviceName,
    );
    if (service) {
      await service.stop();
    } else {
      console.warn("Hyperscape service not found during stop.");
      throw new Error("Hyperscape service not found");
    }
  }

  async connect(config: {
    wsUrl: string;
    authToken?: string;
    worldId: UUID;
  }): Promise<void> {
    if (this.isServiceConnected) {
      console.warn(
        `HyperscapeService already connected to world ${this._currentWorldId}. Disconnecting first.`,
      );
      await this.disconnect();
    }

    console.info(
      `Attempting to connect HyperscapeService to ${config.wsUrl} for world ${config.worldId}`,
    );
    this._currentWorldId = config.worldId;
    this.appearanceHash = null;

    // Create real Hyperscape world connection with proper binary protocol
    console.info(
      "[HyperscapeService] Creating headless Node.js client world with binary protocol",
    );

    // Create headless client world with proper ClientNetwork system
    this.world = createNodeClientWorld();

    // Initialize world with server connection
    await this.world.init({
      wsUrl: config.wsUrl,
      initialAuthToken: config.authToken,
      assetsUrl:
        process.env.HYPERSCAPE_ASSETS_URL || "https://assets.hyperscape.io",
    });

    console.info("[HyperscapeService] Headless client world initialized and connected");

    this.playwrightManager = new PlaywrightManager(this.runtime);
    this.emoteManager = new EmoteManager(this.runtime);
    this.messageManager = new MessageManager(this.runtime);
    this.voiceManager = new VoiceManager(this.runtime);
    this.behaviorManager = new BehaviorManager(this.runtime);
    this.buildManager = new BuildManager(this.runtime);
    this.dynamicActionLoader = new DynamicActionLoader(this.runtime);

    // Initialize world systems using the real world instance
    const livekit = new AgentLiveKit(this.world);
    this.world.systems.push(livekit);

    const actions = new AgentActions(this.world);
    this.world.systems.push(actions);

    // Register ClientInput as controls - this provides both human and agent control
    this.world.register("controls", ClientInput);

    const loader = new AgentLoader(this.world);
    this.world.systems.push(loader);

    const environment = new EnvironmentSystem(this.world);
    this.world.systems.push(environment);

    console.info(
      "[HyperscapeService] Hyperscape world initialized successfully",
    );

    this.voiceManager.start();

    this.behaviorManager.start();

    this.subscribeToHyperscapeEvents();

    this.isServiceConnected = true;

    this.connectionTime = Date.now();

    console.info(`HyperscapeService connected successfully to ${config.wsUrl}`);

    // Initialize managers
    await this.emoteManager.uploadEmotes();

    // Discover and load dynamic actions
    const discoveredActions = await this.dynamicActionLoader.discoverActions(
      this.world,
    );
    console.info(
      `[HyperscapeService] Discovered ${discoveredActions.length} dynamic actions`,
    );

    for (const actionDescriptor of discoveredActions) {
      await this.dynamicActionLoader.registerAction(
        actionDescriptor,
        this.runtime,
      );
    }

    // Check for RPG systems and load RPG actions/providers dynamically
    await this.loadRPGExtensions();

    // Load default content packs (Runescape RPG pack)
    await this.loadDefaultContentPacks();

    // Check player entity availability (appearance polling will handle initialization)
    if (this.world.entities?.player) {
      const appearance = this.world.entities.player.data.appearance;
      console.debug("[Appearance] Current appearance data available");
    } else {
      console.debug("[Appearance] Waiting for server to create player entity");
    }
  }

  /**
   * Detects RPG systems and dynamically loads corresponding actions and providers
   */
  private async loadRPGExtensions(): Promise<void> {
    const rpgSystems = this.world.rpgSystems || {};
    console.info(`[HyperscapeService] Checking for RPG systems...`, Object.keys(rpgSystems));

    // Check for skills system - load skill-based actions
    if (this.world.getSystem?.('skills')) {
      console.info('[HyperscapeService] Skills system detected - loading skill actions');

      // Dynamically import and register skill actions
      const { chopTreeAction } = await import('./actions/chopTree');
      const { catchFishAction } = await import('./actions/catchFish');
      const { lightFireAction } = await import('./actions/lightFire');
      const { cookFoodAction } = await import('./actions/cookFood');

      await this.runtime.registerAction(chopTreeAction);
      await this.runtime.registerAction(catchFishAction);
      await this.runtime.registerAction(lightFireAction);
      await this.runtime.registerAction(cookFoodAction);

      // Load skill-specific providers
      const { woodcuttingSkillProvider } = await import('./providers/skills/woodcutting');
      const { fishingSkillProvider } = await import('./providers/skills/fishing');
      const { firemakingSkillProvider } = await import('./providers/skills/firemaking');
      const { cookingSkillProvider } = await import('./providers/skills/cooking');

      await this.runtime.registerProvider(woodcuttingSkillProvider);
      await this.runtime.registerProvider(fishingSkillProvider);
      await this.runtime.registerProvider(firemakingSkillProvider);
      await this.runtime.registerProvider(cookingSkillProvider);

      console.info('[HyperscapeService] Loaded 4 skill actions and 4 skill providers');
    }

    // Check for inventory/banking system - load inventory actions
    if (this.world.getSystem?.('banking')) {
      console.info('[HyperscapeService] Banking system detected - loading inventory actions');

      const { bankItemsAction } = await import('./actions/bankItems');
      const { checkInventoryAction } = await import('./actions/checkInventory');

      await this.runtime.registerAction(bankItemsAction);
      await this.runtime.registerAction(checkInventoryAction);

      console.info('[HyperscapeService] Loaded 2 inventory actions');
    }
  }

  /**
   * Load a content pack into the service
   *
   * Content packs are modular bundles that can include:
   * - Actions: Custom agent actions (e.g., combat, trading)
   * - Providers: State providers for agent context
   * - Evaluators: Post-processing analysis components
   * - Systems: Game systems (e.g., combat, inventory)
   * - Visual config: Entity colors, UI themes, assets
   * - State managers: Per-player state tracking
   *
   * **Important Limitations:**
   * - Actions, providers, and evaluators are managed by ElizaOS core and persist after unload
   * - These components cannot be dynamically unregistered from the runtime
   * - Repeated load/unload cycles will accumulate registrations in memory
   * - Naming conflicts may occur if the same pack is loaded multiple times
   *
   * **Recommendations:**
   * - Avoid repeated load/unload cycles; prefer loading once at startup
   * - Use unique, versioned names for actions/providers/evaluators
   * - Only unload content packs when absolutely necessary
   *
   * @param pack - The content pack to load
   * @param runtime - Optional runtime override (defaults to service runtime)
   */
  async loadContentPack(pack: IContentPack, runtime?: IAgentRuntime): Promise<void> {
    logger.info(
      `[HyperscapeService] Loading content pack: ${pack.name} v${pack.version}`,
    );

    // Check if already loaded
    if (this.loadedContentPacks.has(pack.id)) {
      logger.warn(`[HyperscapeService] Content pack already loaded: ${pack.id}`);
      return;
    }

    const targetRuntime = runtime || this.runtime;
    const world = this.getWorld();

    if (!world) {
      throw new Error(
        `[HyperscapeService] Cannot load content pack: No world connected`,
      );
    }

    // Track registered items for cleanup on failure
    const registeredActions: string[] = [];
    const registeredProviders: string[] = [];
    const registeredEvaluators: string[] = [];

    try {
      // Execute onLoad hook if provided
      if (pack.onLoad) {
        await pack.onLoad(targetRuntime, world);
      }

      // Initialize game systems
      if (pack.systems) {
        const initializedSystems: IGameSystem[] = [];

        for (const system of pack.systems) {
          try {
            await system.init(world);
            initializedSystems.push(system);
            logger.info(`[HyperscapeService] Initialized system: ${system.name}`);
          } catch (error) {
            logger.error(
              `[HyperscapeService] Failed to initialize system ${system.name}:`,
              error,
            );
            throw error;
          }
        }

        this.activeGameSystems.set(pack.id, initializedSystems);
      }

      // Register actions dynamically
      if (pack.actions) {
        for (const action of pack.actions) {
          try {
            await targetRuntime.registerAction(action);
            registeredActions.push(action.name);
            logger.info(`[HyperscapeService] Registered action: ${action.name}`);
          } catch (error) {
            logger.error(
              `[HyperscapeService] Failed to register action ${action.name}:`,
              error,
            );
            throw error;
          }
        }
      }

      // Register providers
      if (pack.providers) {
        for (const provider of pack.providers) {
          try {
            targetRuntime.registerProvider(provider);
            registeredProviders.push(provider.name);
            logger.info(`[HyperscapeService] Registered provider: ${provider.name}`);
          } catch (error) {
            logger.error(
              `[HyperscapeService] Failed to register provider ${provider.name}:`,
              error,
            );
            throw error;
          }
        }
      }

      // Register evaluators
      if (pack.evaluators) {
        for (const evaluator of pack.evaluators) {
          try {
            targetRuntime.registerEvaluator(evaluator);
            registeredEvaluators.push(evaluator.name);
            logger.info(`[HyperscapeService] Registered evaluator: ${evaluator.name}`);
          } catch (error) {
            logger.error(
              `[HyperscapeService] Failed to register evaluator ${evaluator.name}:`,
              error,
            );
            throw error;
          }
        }
      }

      // Initialize state manager (verify player exists first)
      if (pack.stateManager) {
        const player = world.entities?.player;
        if (!player || !player.data || !player.data.id) {
          throw new Error(
            `[HyperscapeService] Cannot initialize state manager: Player entity not available`,
          );
        }

        const playerId = player.data.id as string;
        pack.stateManager.initPlayerState(playerId);
        logger.info(`[HyperscapeService] Initialized state manager for player: ${playerId}`);
      }

      // Store loaded pack
      this.loadedContentPacks.set(pack.id, pack);
      logger.info(`[HyperscapeService] Successfully loaded content pack: ${pack.id}`);
    } catch (error) {
      logger.error(
        `[HyperscapeService] Failed to load content pack ${pack.id}:`,
        error,
      );

      // Cleanup on failure - unregister all partially registered items
      // Note: ElizaOS core doesn't support unregistration, so we log warnings
      if (registeredActions.length > 0) {
        logger.warn(
          `[HyperscapeService] ${registeredActions.length} actions were registered but cannot be unregistered: ${registeredActions.join(', ')}`,
        );
      }

      if (registeredProviders.length > 0) {
        logger.warn(
          `[HyperscapeService] ${registeredProviders.length} providers were registered but cannot be unregistered: ${registeredProviders.join(', ')}`,
        );
      }

      if (registeredEvaluators.length > 0) {
        logger.warn(
          `[HyperscapeService] ${registeredEvaluators.length} evaluators were registered but cannot be unregistered: ${registeredEvaluators.join(', ')}`,
        );
      }

      // Cleanup initialized systems
      const systems = this.activeGameSystems.get(pack.id);
      if (systems) {
        for (const system of systems) {
          try {
            system.cleanup();
            logger.info(`[HyperscapeService] Cleaned up system: ${system.name}`);
          } catch (cleanupError) {
            logger.error(
              `[HyperscapeService] Failed to cleanup system ${system.name}:`,
              cleanupError,
            );
          }
        }
        this.activeGameSystems.delete(pack.id);
      }

      throw error;
    }
  }

  /**
   * Unload a content pack from the service
   *
   * **Important Limitations:**
   * - Actions, providers, and evaluators are managed by ElizaOS core and **cannot** be unregistered
   * - These components will persist in memory after unload
   * - Only systems and state managers are properly cleaned up
   * - Repeated unload/load cycles will accumulate actions/providers/evaluators in memory
   *
   * **Consequences:**
   * - Memory accumulation: Each load adds more actions/providers/evaluators to the runtime
   * - Naming conflicts: Reloading with same names may cause conflicts
   * - Confusion: Active actions list will include unloaded pack actions
   *
   * **Mitigations:**
   * - Avoid repeated load/unload cycles
   * - Use unique, versioned names for components (e.g., "rpg_v1_attack")
   * - Restart the agent runtime to fully clear unloaded packs
   *
   * @param packId - ID of the content pack to unload
   */
  async unloadContentPack(packId: string): Promise<void> {
    const pack = this.loadedContentPacks.get(packId);

    if (!pack) {
      logger.warn(`[HyperscapeService] Content pack not loaded: ${packId}`);
      return;
    }

    logger.info(`[HyperscapeService] Unloading content pack: ${pack.name}`);

    // Warn if pack has persistent registrations
    const hasPersistentRegistrations =
      (pack.actions && pack.actions.length > 0) ||
      (pack.providers && pack.providers.length > 0) ||
      (pack.evaluators && pack.evaluators.length > 0);

    if (hasPersistentRegistrations) {
      logger.warn(
        `[HyperscapeService] Content pack "${pack.name}" has actions/providers/evaluators that cannot be unregistered. ` +
        `These will persist in the runtime after unload. To fully remove, restart the agent.`
      );
    }

    const world = this.getWorld();

    try {
      // Execute onUnload hook if provided
      if (pack.onUnload && world) {
        await pack.onUnload(this.runtime, world);
      }

      // Cleanup game systems
      const systems = this.activeGameSystems.get(packId);
      if (systems) {
        for (const system of systems) {
          try {
            system.cleanup();
            logger.info(`[HyperscapeService] Cleaned up system: ${system.name}`);
          } catch (error) {
            logger.error(
              `[HyperscapeService] Failed to cleanup system ${system.name}:`,
              error,
            );
          }
        }
        this.activeGameSystems.delete(packId);
      }

      // Note: Actions, providers, and evaluators are managed by ElizaOS core
      // They cannot be unregistered dynamically, so they remain in the runtime

      this.loadedContentPacks.delete(packId);
      logger.info(`[HyperscapeService] Successfully unloaded content pack: ${packId}`);
    } catch (error) {
      logger.error(
        `[HyperscapeService] Failed to unload content pack ${packId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Load default content packs during service initialization
   * Currently loads the RunescapeRPG content pack
   */
  async loadDefaultContentPacks(): Promise<void> {
    logger.info('[HyperscapeService] Loading default content packs...');

    try {
      // Import and load the Runescape RPG pack
      const { RunescapeRPGPack } = await import('./content-packs/content-pack');
      await this.loadContentPack(RunescapeRPGPack);

      logger.info('[HyperscapeService] Default content packs loaded successfully');
    } catch (error) {
      logger.error(
        '[HyperscapeService] Failed to load default content packs:',
        error,
      );
      // Don't throw - allow service to continue without content packs
    }
  }

  /**
   * Get all loaded content packs
   */
  getLoadedContentPacks(): IContentPack[] {
    return Array.from(this.loadedContentPacks.values());
  }

  /**
   * Check if a content pack is loaded
   */
  isContentPackLoaded(packId: string): boolean {
    return this.loadedContentPacks.has(packId);
  }

  /**
   * Update all active game systems (called from game loop if needed)
   */
  updateContentPackSystems(deltaTime: number): void {
    for (const [_packId, systems] of this.activeGameSystems) {
      for (const system of systems) {
        if (system.update) {
          try {
            system.update(deltaTime);
          } catch (error) {
            logger.error(
              `[HyperscapeService] Error updating system ${system.name}:`,
              error,
            );
          }
        }
      }
    }
  }

  private subscribeToHyperscapeEvents(): void {
    this.world.off("disconnect");

    this.world.on("disconnect", (data: Record<string, unknown> | string) => {
      // Data is either a string reason or an object with reason property
      const reason = (data as { reason?: string }).reason || "Unknown reason";
      console.warn(`Hyperscape world disconnected: ${reason}`);
      this.runtime.emitEvent(EventType.WORLD_LEFT, {
        runtime: this.runtime,
        eventName: "HYPERSCAPE_DISCONNECTED",
        data: { worldId: this._currentWorldId, reason },
      });
      this.handleDisconnect();
    });

    this.startChatSubscription();
  }

  private async uploadCharacterAssets(): Promise<{
    success: boolean;
    error?: string;
  }> {
    const agentPlayer = this.world.entities.player;
    const localAvatarPath = path.resolve(LOCAL_AVATAR_PATH);

    console.info(`[Appearance] Reading avatar file from: ${localAvatarPath}`);
    const fileBuffer: Buffer = await fsPromises.readFile(localAvatarPath);
    const fileName = path.basename(localAvatarPath);
    const mimeType = fileName.endsWith(".vrm")
      ? "model/gltf-binary"
      : "application/octet-stream";

    console.info(
      `[Appearance] Uploading ${fileName} (${(fileBuffer.length / 1024).toFixed(2)} KB, Type: ${mimeType})...`,
    );

    const hash = await hashFileBuffer(fileBuffer);
    const ext = fileName.split(".").pop()!.toLowerCase();
    const fullFileNameWithHash = `${hash}.${ext}`;
    const baseUrl = this.world.assetsUrl.replace(/\/$/, "");
    const constructedHttpUrl = `${baseUrl}/${fullFileNameWithHash}`;

    // Strong type assumption - network has upload method
    const network = this.world.network as UploadableNetwork;

    console.info(`[Appearance] Uploading avatar to ${constructedHttpUrl}...`);
    const fileArrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    ) as ArrayBuffer;
    const fileForUpload = new File([fileArrayBuffer], fileName, {
      type: mimeType,
    });

    // Strong type assumption - network has upload method
    const uploadPromise = network.upload(fileForUpload);
    const timeoutPromise = new Promise((_resolve, reject) =>
      setTimeout(
        () => reject(new Error("Upload timed out")),
        NETWORK_CONFIG.UPLOAD_TIMEOUT_MS,
      ),
    );

    await Promise.race([uploadPromise, timeoutPromise]);
    console.info("[Appearance] Avatar uploaded successfully.");
    (agentPlayer as ModifiablePlayer).setSessionAvatar(constructedHttpUrl);

    await this.emoteManager.uploadEmotes();

    // Assume send method exists on network
    this.world.network.send("playerSessionAvatar", {
      avatar: constructedHttpUrl,
    });
    console.info(
      `[Appearance] Sent playerSessionAvatar with: ${constructedHttpUrl}`,
    );

    return { success: true };
  }

  private startAppearancePolling(): void {
    if (this.appearanceRefreshInterval) {
      clearInterval(this.appearanceRefreshInterval);
    }
    const pollingTasks = {
      avatar: this.appearanceHash !== null,
      name: this.world?.entities?.player?.data?.name !== undefined,
    };

    if (pollingTasks.avatar && pollingTasks.name) {
      console.info("[Appearance/Name Polling] Already set, skipping start.");
      return;
    }
    console.info(
      `[Appearance/Name Polling] Initializing interval every ${AGENT_CONFIG.APPEARANCE_POLL_INTERVAL_MS}ms.`,
    );

    const f = async () => {
      if (pollingTasks.avatar && pollingTasks.name) {
        if (this.appearanceRefreshInterval) {
          clearInterval(this.appearanceRefreshInterval);
        }
        this.appearanceRefreshInterval = null;
        console.info(
          "[Appearance/Name Polling] Both avatar and name set. Polling stopped.",
        );
        return;
      }

      const agentPlayer = this.world?.entities?.player;
      const agentPlayerReady = !!agentPlayer;
      const agentPlayerId = agentPlayer?.data?.id;
      const agentPlayerIdReady = !!agentPlayerId;
      const networkReady = this.world?.network.id !== null;
      const assetsUrlReady = !!this.world?.assetsUrl;

      if (agentPlayerReady && agentPlayerIdReady && networkReady) {
        const entityId = createUniqueUuid(this.runtime, this.runtime.agentId);
        const entity = await this.runtime.getEntityById(entityId);

        if (entity) {
          // Add or update the appearance component
          entity.components = entity.components || [];
          const appearanceComponent = entity.components.find(
            (c) => c.type === "appearance",
          );
          if (appearanceComponent) {
            appearanceComponent.data = {
              appearance: this.world.entities.player.data.appearance,
            };
          } else {
            const newComponent: Partial<ElizaComponent> = {
              type: "appearance",
              data: { appearance: this.world.entities.player.data.appearance },
            };
            entity.components.push(newComponent as ElizaComponent);
          }
          // Cast runtime to include updateEntity and call it directly
          const runtimeWithUpdate = this.runtime as IAgentRuntime & {
            updateEntity: (entity: Record<string, unknown>) => Promise<void>;
          };
          await runtimeWithUpdate.updateEntity(entity);
        }

        // Also attempt to change name on first appearance
        if (!this.hasChangedName) {
          const character = this.runtime.character;
          await this.changeName(character.name);
          this.hasChangedName = true;
          console.info(
            `[Name Polling] Initial name successfully set to "${character.name}".`,
          );
        }

        if (!pollingTasks.avatar && assetsUrlReady) {
          console.info(
            `[Appearance Polling] Player (ID: ${agentPlayerId}), network, assetsUrl ready. Attempting avatar upload and set...`,
          );
          const result = await this.uploadCharacterAssets();

          if (result.success) {
            const hashValue = await hashFileBuffer(
              Buffer.from(JSON.stringify(result.success)),
            );
            this.appearanceHash = hashValue;
            pollingTasks.avatar = true;
            console.info(
              "[Appearance Polling] Avatar setting process successfully completed.",
            );
          } else {
            console.warn(
              `[Appearance Polling] Avatar setting process failed: ${result.error || "Unknown reason"}. Will retry...`,
            );
          }
        } else if (!pollingTasks.avatar) {
          console.debug(
            `[Appearance Polling] Waiting for: Assets URL (${assetsUrlReady})...`,
          );
        }
      } else {
        console.debug(
          `[Appearance/Name Polling] Waiting for: Player (${agentPlayerReady}), Player ID (${agentPlayerIdReady}), Network (${networkReady})...`,
        );
      }
    };
    this.appearanceRefreshInterval = setInterval(
      f,
      AGENT_CONFIG.APPEARANCE_POLL_INTERVAL_MS,
    );
    f();
  }

  // Removed type guard - assume updateEntity exists when needed

  private stopAppearancePolling(): void {
    if (this.appearanceRefreshInterval) {
      clearInterval(this.appearanceRefreshInterval);
      this.appearanceRefreshInterval = null;
      console.info("[Appearance Polling] Stopped.");
    }
  }

  public isConnected(): boolean {
    return this.isServiceConnected;
  }

  public getEntityById(entityId: string): Entity | null {
    return this.world?.entities?.items?.get(entityId) || null;
  }

  public getEntityName(entityId: string): string | null {
    const entity = this.world?.entities?.items?.get(entityId);
    return (
      entity?.data?.name ||
      ((entity as Entity)?.metadata?.hyperscape as { name: string })?.name ||
      "Unnamed"
    );
  }

  async handleDisconnect(): Promise<void> {
    if (!this.isServiceConnected && !this.world) {
      return;
    }
    console.info("Handling Hyperscape disconnection...");
    this.isServiceConnected = false;

    this.stopAppearancePolling();

    if (this.world) {
      console.info("[Hyperscape Cleanup] Calling world.disconnect() and world.destroy()...");
      await this.world.disconnect();
      this.world.destroy();
    }

    this.world = null;
    this.connectionTime = null;

    if (this.appearanceRefreshInterval) {
      clearInterval(this.appearanceRefreshInterval);
      this.appearanceRefreshInterval = null;
    }

    if (this.dynamicActionLoader) {
      // Unregister all dynamic actions
      const registeredActions = this.dynamicActionLoader.getRegisteredActions();
      for (const [actionName, _] of registeredActions) {
        await this.dynamicActionLoader.unregisterAction(
          actionName,
          this.runtime,
        );
      }
      this.dynamicActionLoader.clear();
      this.dynamicActionLoader = null;
    }

    // Clean up loaded content
    for (const [contentId, content] of this.loadedContent) {
      // Assume uninstall is a function
      await (content as { uninstall: () => Promise<void> }).uninstall();
    }
    this.loadedContent.clear();

    console.info("Hyperscape disconnection handling complete.");
  }

  async disconnect(): Promise<void> {
    console.info(
      `Disconnecting HyperscapeService from world ${this._currentWorldId}`,
    );
    await this.handleDisconnect();

    // Assume emitEvent is a function - use Zod validated EventData
    (
      this.runtime as {
        emitEvent: (type: EventType, data: EventData) => void;
      }
    ).emitEvent(EventType.WORLD_LEFT, {
      runtime: this.runtime.agentId,
      worldId: this._currentWorldId,
    });

    this.world = null;
    this.isServiceConnected = false;
    this._currentWorldId = null;
    console.info("HyperscapeService disconnect complete.");
  }

  // Removed type guard - assume disconnect exists when needed

  async changeName(newName: string): Promise<void> {
    const agentPlayerId = this.world.entities.player.data.id;

    console.info(
      `[Action] Attempting to change name to "${newName}" for ID ${agentPlayerId}`,
    );

    // Update the name map
    if (this.playerNamesMap.has(agentPlayerId)) {
      console.info(
        `[Name Map Update] Setting name via changeName for ID ${agentPlayerId}: '${newName}'`,
      );
      this.playerNamesMap.set(agentPlayerId, newName);
    } else {
      console.warn(
        `[Name Map Update] Attempted changeName for ID ${agentPlayerId} not currently in map. Adding.`,
      );
      this.playerNamesMap.set(agentPlayerId, newName);
    }

    // --- Use agentPlayer.modify for local update --- >
    const agentPlayer = this.world.entities.player;
    (agentPlayer as ModifiablePlayer).modify({ name: newName });
    agentPlayer.data.name = newName;

    this.world.network.send("entityModified", {
      id: agentPlayer.data.id,
      name: newName,
    });
    console.debug(`[Action] Called agentPlayer.modify({ name: "${newName}" })`);
  }

  async stop(): Promise<void> {
    console.info("*** Stopping Hyperscape service instance ***");
    await this.disconnect();
  }

  private startChatSubscription(): void {
    console.info("[HyperscapeService] Initializing chat subscription...");

    // Pre-populate processed IDs with existing messages
    (this.world.chat as ChatSystem).msgs.forEach((msg: ChatMessage) => {
      this.processedMsgIds.add(msg.id);
    });

    this.world.chat.subscribe((msgs: ChatMessage[]) => {
      const chatMessages = msgs as ChatMessage[];

      const newMessagesFound: ChatMessage[] = []; // Temporary list for new messages

      // Step 1: Identify new messages and update processed set
      chatMessages.forEach((msg: ChatMessage) => {
        // Check timestamp FIRST - only consider messages newer than connection time
        const messageTimestamp = new Date(msg.createdAt).getTime();
        if (messageTimestamp <= this.connectionTime!) {
          // Ensure historical messages are marked processed if encountered *before* connectionTime was set (edge case)
          if (!this.processedMsgIds.has(msg.id.toString())) {
            this.processedMsgIds.add(msg.id.toString());
          }
          return; // Skip this message
        }

        // Check if we've already processed this message ID (secondary check for duplicates)
        const msgIdStr = msg.id.toString();
        if (!this.processedMsgIds.has(msgIdStr)) {
          newMessagesFound.push(msg); // Add the full message object
          this.processedMsgIds.add(msgIdStr); // Mark ID as processed immediately
        }
      });

      // Step 2: Process only the newly found messages
      if (newMessagesFound.length > 0) {
        console.info(
          `[Chat] Found ${newMessagesFound.length} new messages to process.`,
        );

        newMessagesFound.forEach(async (msg: ChatMessage) => {
          await this.messageManager.handleMessage(msg);
        });
      }
    });
  }

  getEmoteManager() {
    return this.emoteManager;
  }

  getBehaviorManager() {
    return this.behaviorManager;
  }

  getMessageManager() {
    return this.messageManager;
  }

  getVoiceManager() {
    return this.voiceManager;
  }

  getPlaywrightManager() {
    return this.playwrightManager;
  }

  getBuildManager(): BuildManager | null {
    return this.buildManager;
  }

  getMultiAgentManager() {
    return this.multiAgentManager;
  }

  setMultiAgentManager(manager: MultiAgentManager) {
    this.multiAgentManager = manager;
  }

  getDynamicActionLoader() {
    return this.dynamicActionLoader;
  }

  /**
   * Load UGC content bundle into the current world
   */
  async loadUGCContent(
    contentId: string,
    contentBundle: ContentBundle,
  ): Promise<boolean> {
    if (this.loadedContent.has(contentId)) {
      console.warn(
        `[HyperscapeService] Content ${contentId} already loaded. Unloading first...`,
      );
      await this.unloadUGCContent(contentId);
    }

    console.info(`[HyperscapeService] Loading UGC content: ${contentId}`);

    // Install the content bundle
    const instance = await contentBundle.install(this.world, this.runtime);
    this.loadedContent.set(contentId, instance);

    // Handle actions from the content bundle
    if (contentBundle.actions) {
      console.info(
        `[HyperscapeService] Registering ${contentBundle.actions.length} actions from ${contentId}`,
      );
      for (const action of contentBundle.actions) {
        // Register each action with the runtime
        await this.runtime.registerAction(action);
      }
    }

    // Handle providers from the content bundle
    if (contentBundle.providers) {
      console.info(
        `[HyperscapeService] Registering ${contentBundle.providers.length} providers from ${contentId}`,
      );
      for (const provider of contentBundle.providers) {
        // Register each provider with the runtime
        await this.runtime.registerProvider(provider);
      }
    }

    // Support for dynamic action discovery via the dynamic loader
    if (contentBundle.dynamicActions) {
      console.info(
        `[HyperscapeService] Discovering dynamic actions from ${contentId}`,
      );
      const discoveredActions = contentBundle.dynamicActions;
      for (const actionDescriptor of discoveredActions) {
        await this.dynamicActionLoader.registerAction(
          actionDescriptor,
          this.runtime,
        );
      }
    }

    // Emit event for content loaded
    this.runtime.emitEvent(EventType.WORLD_JOINED, {
      runtime: this.runtime,
      eventName: "UGC_CONTENT_LOADED",
      data: {
        contentId: contentId,
        contentName: contentBundle.name || contentId,
        features: contentBundle.config?.features || {},
        actionsCount: contentBundle.actions?.length || 0,
        providersCount: contentBundle.providers?.length || 0,
      },
    });

    console.info(
      `[HyperscapeService] UGC content ${contentId} loaded successfully`,
    );
    return true;
  }

  /**
   * Unload UGC content
   */
  async unloadUGCContent(contentId: string): Promise<boolean> {
    const content = this.loadedContent.get(contentId)!;

    console.info(`[HyperscapeService] Unloading UGC content: ${contentId}`);

    // First, unregister any actions that were registered
    if (content.actions) {
      console.info(
        `[HyperscapeService] Unregistering ${content.actions.length} actions from ${contentId}`,
      );
      for (const action of content.actions) {
        // Cast runtime to include unregisterAction
        const runtimeWithUnregister = this.runtime as IAgentRuntime & {
          unregisterAction: (name: string) => Promise<void>;
        };
        await runtimeWithUnregister.unregisterAction(action.name);
      }
    }

    // Unregister any providers that were registered
    if (content.providers) {
      console.info(
        `[HyperscapeService] Unregistering ${content.providers.length} providers from ${contentId}`,
      );
      for (const provider of content.providers) {
        // Cast runtime to include unregisterProvider
        const runtimeWithUnregisterProvider = this.runtime as IAgentRuntime & {
          unregisterProvider: (name: string) => Promise<void>;
        };
        await runtimeWithUnregisterProvider.unregisterProvider(provider.name);
      }
    }

    // Unregister any dynamic actions
    if (content.dynamicActions) {
      console.info(
        `[HyperscapeService] Unregistering ${content.dynamicActions.length} dynamic actions from ${contentId}`,
      );
      for (const actionName of content.dynamicActions) {
        await this.dynamicActionLoader.unregisterAction(
          actionName,
          this.runtime,
        );
      }
    }

    // Call the content's uninstall method
    await (content as { uninstall: () => Promise<void> }).uninstall();

    this.loadedContent.delete(contentId);

    // Emit event for content unloaded
    this.runtime.emitEvent(EventType.WORLD_LEFT, {
      runtime: this.runtime,
      eventName: "UGC_CONTENT_UNLOADED",
      data: {
        contentId: contentId,
      },
    });

    console.info(
      `[HyperscapeService] UGC content ${contentId} unloaded successfully`,
    );
    return true;
  }

  // Removed type guard - assume unregisterAction exists when needed

  // Removed type guard - assume unregisterProvider exists when needed

  /**
   * Get loaded UGC content instance
   */
  getLoadedContent(contentId: string): ContentInstance | null {
    return this.loadedContent.get(contentId) || null;
  }

  /**
   * Check if UGC content is loaded
   */
  isContentLoaded(contentId: string): boolean {
    return this.loadedContent.has(contentId);
  }

  async initialize(): Promise<void> {
    // Initialize managers
    this.playwrightManager = new PlaywrightManager(this.runtime);
    this.emoteManager = new EmoteManager(this.runtime);
    this.messageManager = new MessageManager(this.runtime);
    this.voiceManager = new VoiceManager(this.runtime);
    this.behaviorManager = new BehaviorManager(this.runtime);
    this.buildManager = new BuildManager(this.runtime);
    this.dynamicActionLoader = new DynamicActionLoader(this.runtime);

    logger.info("[HyperscapeService] Service initialized successfully");
  }

  getRPGStateManager(): RPGStateManager | null {
    // Return RPG state manager for testing
    return null;
  }
}
