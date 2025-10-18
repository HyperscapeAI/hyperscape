import { Action, Provider, Evaluator, IAgentRuntime } from "@elizaos/core";
import type { World } from "./core-types";

/**
 * Interface for modular content packs that can be loaded into Hyperscape
 */
export interface IContentPack {
  id: string;
  name: string;
  description: string;
  version: string;

  // Core functionality
  actions?: Action[];
  providers?: Provider[];
  evaluators?: Evaluator[];

  systems?: IGameSystem[];

  // State management
  stateManager?: IStateManager;

  // Lifecycle hooks
  onLoad?: (runtime: IAgentRuntime, world: World) => Promise<void>;
  onUnload?: (runtime: IAgentRuntime, world: World) => Promise<void>;
}

/**
 * Game system interface for modular gameplay features
 */
export interface IGameSystem {
  id: string;
  name: string;
  type: "combat" | "inventory" | "skills" | "quests" | "trading" | "custom";

  // System initialization
  init(world: World): Promise<void>;

  // System update loop (if needed)
  update?(deltaTime: number): void;

  // System cleanup
  cleanup(): void;
}

/**
 * Generic player state type for state managers
 */
export type PlayerStateData = Record<string, string | number | boolean | string[] | number[]>;

/**
 * State manager interface for content pack state
 */
export interface IStateManager {
  // Initialize state for a player
  initPlayerState(playerId: string): PlayerStateData;

  // Get current state
  getState(playerId: string): PlayerStateData;

  // Update state
  updateState(playerId: string, updates: Partial<PlayerStateData>): void;

  // Subscribe to state changes
  subscribe(playerId: string, callback: (state: PlayerStateData) => void): () => void;

  // Serialize/deserialize for persistence
  serialize(playerId: string): string;
  deserialize(playerId: string, data: string): void;
}
