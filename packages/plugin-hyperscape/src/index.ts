/**
 * Hyperscape ElizaOS Plugin
 *
 * This plugin integrates ElizaOS AI agents with Hyperscape 3D multiplayer worlds.
 * It enables autonomous agents to join virtual worlds, navigate environments, interact
 * with objects, chat with users, and perform actions just like human players.
 *
 * **Key Features**:
 *
 * **Agent Actions**:
 * - `perception`: Scan the environment and identify nearby entities
 * - `goto`: Navigate to specific entities or locations
 * - `use`: Use/activate items or objects in the world
 * - `unuse`: Stop using an item
 * - `stop`: Stop current movement
 * - `walk_randomly`: Wander around randomly
 * - `ambient`: Perform ambient behaviors (idle animations, emotes)
 * - `build`: Place and modify world entities (if agent has builder role)
 * - `reply`: Respond to chat messages
 * - `ignore`: Ignore specific messages or users
 *
 * **Providers** (context for agent decision-making):
 * Core providers (always available):
 * - `world-context`: Agent position and nearby entities (compact, optimized)
 * - `emote`: Available emotes and gestures
 * - `actions`: Available actions the agent can perform
 * - `skills`: General skill system provider
 *
 * RPG providers (loaded via content packs):
 * - `character`: Agent's character state (health, inventory, etc.)
 * - `banking`: Banking and inventory status
 * - `woodcutting`, `fishing`, `firemaking`, `cooking`: Skill-specific providers
 *
 * **Evaluators** (post-conversation analysis):
 * - `boredom`: Monitors engagement levels and detects boredom
 * - `fact`: Extracts and stores factual information from conversations
 * - `goal`: Tracks user goals and progress toward objectives
 * - `skills`: Tracks skill training efficiency, XP rates, and level progression
 * - `resources`: Monitors inventory management, banking efficiency, and resource gathering
 * - `safety`: CRITICAL - Detects spam, harassment, and rule violations in multiplayer
 *
 * **Service**:
 * `HyperscapeService` manages the connection to Hyperscape worlds, handles
 * real-time state synchronization, and executes actions on behalf of the agent.
 *
 * **Content Packs**:
 * Modular bundles that extend agent capabilities with custom actions, providers,
 * evaluators, and game systems. The service automatically loads the Runescape RPG
 * content pack on startup, which includes:
 * - 6 RPG actions (chopTree, catchFish, cookFood, lightFire, bankItems, checkInventory)
 * - 6 RPG providers (character, banking, woodcutting, fishing, firemaking, cooking)
 * - 4 system bridges (skills, inventory, banking, resources)
 *
 * Additional content packs can be loaded via `service.loadContentPack(pack)`
 * See `content-packs/content-pack.ts` for the complete Runescape RPG Pack implementation.
 *
 * **Events**:
 * Listens for world events (chat messages, entity spawns, etc.) and routes
 * them to the agent's decision-making system.
 *
 * **Configuration**:
 * - `DEFAULT_HYPERSCAPE_WS_URL`: WebSocket URL for the Hyperscape server
 *   (default: ws://localhost:5555/ws)
 *
 * **Usage**:
 * ```typescript
 * import { hyperscapePlugin } from '@hyperscape/plugin';
 *
 * const character = {
 *   name: 'MyAgent',
 *   plugins: [hyperscapePlugin],
 *   // ...
 * };
 * ```
 *
 * **Architecture**:
 * This plugin follows the ElizaOS plugin pattern:
 * - Service: Long-lived connection and state management
 * - Actions: Discrete tasks the agent can perform
 * - Providers: Context injection for agent prompts
 * - Evaluators: Post-conversation analysis and memory building
 * - Events: React to world events
 *
 * **Referenced by**: ElizaOS agent configurations, character definitions
 */

import type { Plugin } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { HyperscapeService } from "./service";
import { z } from "zod";
// import { hyperscapeChatAction } from './actions/chat';
import { hyperscapeGotoEntityAction } from "./actions/goto";
import { useAction } from "./actions/use";
import { hyperscapeUnuseItemAction } from "./actions/unuse";
import { hyperscapeStopMovingAction } from "./actions/stop";
import { hyperscapeWalkRandomlyAction } from "./actions/walk_randomly";
import { ambientAction } from "./actions/ambient";
import { hyperscapeScenePerceptionAction } from "./actions/perception";
import { hyperscapeEditEntityAction } from "./actions/build";
import { replyAction } from "./actions/reply";
import { ignoreAction } from "./actions/ignore";
// RPG actions are loaded dynamically when RPG systems are detected
// import { chopTreeAction } from "./actions/chopTree";
// import { catchFishAction } from "./actions/catchFish";
// import { lightFireAction } from "./actions/lightFire";
// import { cookFoodAction } from "./actions/cookFood";
// import { checkInventoryAction } from "./actions/checkInventory";
// import { bankItemsAction } from "./actions/bankItems";
import { worldContextProvider } from "./providers/world-context";
import { hyperscapeEmoteProvider } from "./providers/emote";
import { hyperscapeActionsProvider } from "./providers/actions";
import { hyperscapeSkillProvider } from "./providers/skills";
// Note: characterProvider, bankingProvider, and skill-specific providers
// are loaded via the Runescape RPG content pack (see content-packs/content-pack.ts)
// Dynamic skill providers are loaded when RPG systems detect specific skills are available
// import { woodcuttingSkillProvider } from "./providers/skills/woodcutting";
// import { fishingSkillProvider } from "./providers/skills/fishing";
// import { cookingSkillProvider } from "./providers/skills/cooking";
// import { firemakingSkillProvider } from "./providers/skills/firemaking";
import { hyperscapeEvents } from "./events";
import {
  boredomEvaluator,
  factEvaluator,
  goalEvaluator,
  skillProgressionEvaluator,
  safetyEvaluator,
  resourceManagementEvaluator,
} from "./evaluators";

import { NETWORK_CONFIG } from "./config/constants";

/**
 * Configuration schema for the Hyperscape plugin
 * Validates environment variables and plugin settings
 */
const hyperscapePluginConfigSchema = z.object({
  DEFAULT_HYPERSCAPE_WS_URL: z.string().url().optional(),
});

/**
 * Main Hyperscape Plugin Definition
 *
 * Registers all services, actions, providers, and event handlers with ElizaOS
 */
export const hyperscapePlugin: Plugin = {
  name: "hyperscape", // Renamed plugin
  description: "Integrates ElizaOS agents with Hyperscape worlds",
  config: {
    // Map environment variables to config keys
    DEFAULT_HYPERSCAPE_WS_URL: NETWORK_CONFIG.DEFAULT_WS_URL,
  },
  async init(config: Record<string, string | undefined>) {
    logger.info("*** Initializing Hyperscape Integration plugin ***");
    // Validate config using the schema
    const validatedConfig = await hyperscapePluginConfigSchema.parseAsync({
      DEFAULT_HYPERSCAPE_WS_URL: config.DEFAULT_HYPERSCAPE_WS_URL,
    });
    logger.info(
      `Hyperscape plugin config validated: ${JSON.stringify(validatedConfig)}`,
    );
    // Store validated config for service use (runtime.pluginConfigs is usually the way)
  },
  services: [HyperscapeService],
  events: hyperscapeEvents,
  actions: [
    // Core world interaction actions
    hyperscapeScenePerceptionAction,
    hyperscapeGotoEntityAction,
    useAction,
    hyperscapeUnuseItemAction,
    hyperscapeStopMovingAction,
    hyperscapeWalkRandomlyAction,
    ambientAction,
    hyperscapeEditEntityAction,
    replyAction,
    ignoreAction,
    // RPG actions are loaded dynamically when RPG systems are available
  ],
  providers: [
    // Core providers - always loaded with plugin
    worldContextProvider,         // Compact world context (position + nearby entities)
    hyperscapeEmoteProvider,      // Available emotes and gestures
    hyperscapeActionsProvider,    // Available actions the agent can perform
    hyperscapeSkillProvider,      // General skill system provider

    // RPG-specific providers are loaded via content packs:
    // - characterProvider (from Runescape RPG Pack)
    // - bankingProvider (from Runescape RPG Pack)
    // - woodcuttingSkillProvider (from Runescape RPG Pack)
    // - fishingSkillProvider (from Runescape RPG Pack)
    // - firemakingSkillProvider (from Runescape RPG Pack)
    // - cookingSkillProvider (from Runescape RPG Pack)
  ],
  evaluators: [
    // Post-conversation analysis and memory building
    boredomEvaluator,
    factEvaluator,
    goalEvaluator,
    // Gameplay analytics
    skillProgressionEvaluator,
    resourceManagementEvaluator,
    // Safety and compliance (critical for multiplayer)
    safetyEvaluator,
  ],
  routes: [],
};

export default hyperscapePlugin;

// Export content packs for easy integration
export * from "./content-packs";
