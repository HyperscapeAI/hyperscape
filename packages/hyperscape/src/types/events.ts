import * as Payloads from './event-payloads'

/**
 * Event Types
 * Defines all event types used in the system
 */

import type { Position3D } from './core';

// Banking Events
export interface BankDepositEvent {
  playerId: string;
  itemId: string;
  quantity: number;
}

export interface BankWithdrawEvent {
  playerId: string;
  itemId: string;
  quantity: number;
  slotIndex: number;
}

export interface BankDepositSuccessEvent {
  playerId: string;
  itemId: string;
  quantity: number;
  bankId: string;
}

// Store Events
export interface StoreTransactionEvent {
  playerId: string;
  storeId: string;
  itemId: string;
  quantity: number;
  totalCost: number;
  transactionType: 'buy' | 'sell';
}

export interface StoreOpenEvent {
  playerId: string;
  storeId: string;
  playerPosition: Position3D;
}

export interface StoreCloseEvent {
  playerId: string;
  storeId: string;
}

export interface StoreBuyEvent {
  playerId: string;
  storeId: string;
  itemId: string;
  quantity: number;
}

export interface StoreSellEvent {
  playerId: string;
  storeId: string;
  itemId: string;
  quantity: number;
}

// Inventory Events
export interface InventoryUpdateEvent {
  playerId: string;
  itemId: string;
  previousQuantity: number;
  newQuantity: number;
  action: 'add' | 'remove' | 'update';
}

export interface InventoryAddEvent {
  playerId: string;
  itemId: string;
  quantity: number;
}

export interface InventoryCanAddEvent {
  playerId: string;
  item: {
    id: string;
    name: string;
    quantity: number;
    stackable: boolean;
  };
  callback: (canAdd: boolean) => void;
}

export interface InventoryCheckEvent {
  playerId: string;
  itemId: string;
  quantity: number;
  callback: (hasItem: boolean, inventorySlot: InventoryItemInfo | null) => void;
}
export interface InventoryGetCoinsEvent {
  playerId: string;
  callback: (coins: number) => void;
}

export interface InventoryHasEquippedEvent {
  playerId: string;
  slot: string;
  itemType: string;
  callback: (hasEquipped: boolean) => void;
}

export interface InventoryRemoveCoinsEvent {
  playerId: string;
  amount: number;
}

export interface InventoryRemoveEvent {
  playerId: string;
  itemId: string;
  quantity: number;
}

export interface InventoryItemInfo {
  id: string;
  name: string;
  quantity: number;
  stackable: boolean;
  slot: string | null;
}

// Player Events
export interface PlayerInitEvent {
  playerId: string;
  position: Position3D;
  isNewPlayer: boolean;
}

export interface PlayerEnterEvent {
  playerId: string;
}

export interface PlayerLeaveEvent {
  playerId: string;
}

export interface PlayerLevelUpEvent {
  playerId: string;
  previousLevel: number;
  newLevel: number;
  skill: string;
}

export interface PlayerXPGainEvent {
  playerId: string;
  skill: string;
  xpGained: number;
  currentXP: number;
  currentLevel: number;
}

export interface HealthUpdateEvent {
  entityId: string;
  previousHealth: number;
  currentHealth: number;
  maxHealth: number;
}

export interface PlayerDeathEvent {
  playerId: string;
  deathLocation: Position3D;
  cause: string;
}

export interface PlayerRespawnRequestEvent {
  playerId: string;
  requestTime: number;
}

export interface PlayerRegisterEvent {
  id: string;
  playerId: string;
  entity: import('../entities/PlayerLocal').PlayerLocal;
}

// UI Events
export interface UIMessageEvent {
  playerId: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  duration: number; // 0 for permanent
}

// Player Events
export interface AvatarReadyEvent {
  playerId: string;
  avatar: unknown; // THREE.Object3D - avoiding direct three.js dependency
  camHeight: number;
}

export interface PlayerPositionUpdateEvent {
  playerId: string;
  position: { x: number; y: number; z: number };
}

// Combat Events  
export interface CombatSessionEvent {
  sessionId: string;
  attackerId: string;
  targetId: string;
}

export interface CombatHitEvent {
  sessionId: string;
  attackerId: string;
  targetId: string;
  damage: number;
  hitType: string;
}

// Item Events
export interface ItemSpawnedEvent {
  itemId: string;
  position: { x: number; y: number; z: number };
}

export interface EventData<T = Record<string, unknown>> {
  type: EventType;
  data: T;
  timestamp: number;
  source: string | null;
}

export enum EventType {
  // General System
  READY = 'ready',
  ERROR = 'error',
  TICK = 'tick',

  // Player Core
  PLAYER_JOINED = 'player:joined',
  PLAYER_LEFT = 'player:left',
  PLAYER_LOGOUT = 'player:logout',
  PLAYER_RECONNECTED = 'player:reconnected',
  PLAYER_AVATAR_READY = 'player:avatar_ready',
  PLAYER_INIT = 'player:init',
  PLAYER_READY = 'player:ready',
  PLAYER_REGISTERED = 'rpg:player:registered',
  PLAYER_UNREGISTERED = 'rpg:player:unregistered',
  PLAYER_CLEANUP = 'rpg:player:cleanup',
  PLAYER_AUTHENTICATED = 'rpg:player:authenticated',
  PLAYER_UPDATED = 'rpg:player:updated',
  PLAYER_SPAWNED = 'rpg:player:spawned',
  PLAYER_SPAWN_REQUEST = 'rpg:player:spawn_request',
  PLAYER_DATA_LOADED = 'rpg:player:data_loaded',
  PLAYER_DATA_SAVED = 'rpg:player:data_saved',
  PLAYER_SESSION_STARTED = 'rpg:player:session_started',
  PLAYER_SESSION_ENDED = 'rpg:player:session_ended',
  PLAYER_CREATE = 'rpg:player:create',
  PLAYER_SPAWN_COMPLETE = 'rpg:player:spawn_complete',
  PLAYER_ANIMATION = 'rpg:player:animation',
  
  // Entity Management
  ENTITY_CREATED = 'entity:created',
  ENTITY_UPDATED = 'entity:updated',
  ENTITY_INTERACT = 'entity:interact',
  ENTITY_MOVE_REQUEST = 'entity:move_request',
  ENTITY_PROPERTY_REQUEST = 'entity:property_request',
  ENTITY_SPAWNED = 'entity:spawned',
  ENTITY_DEATH = 'entity:death',
  ENTITY_POSITION_CHANGED = 'entity:position_changed',
  ENTITY_UNDERGROUND_DETECTED = 'entity:underground_detected',
  ENTITY_POSITION_CORRECTED = 'entity:position_corrected',
  ENTITY_COMPONENT_ADDED = 'entity:component:added',
  ENTITY_COMPONENT_REMOVED = 'entity:component:removed',

  // Asset Management
  ASSET_LOADED = 'asset:loaded',
  ASSETS_LOADING_PROGRESS = 'assets:loading:progress',

  // UI System
  UI_TOGGLE = 'ui:toggle',
  UI_OPEN_PANE = 'ui:open_pane',
  UI_CLOSE_PANE = 'ui:close_pane',
  UI_MENU = 'ui:menu',
  UI_AVATAR = 'ui:avatar',
  UI_KICK = 'ui:kick',
  UI_TOAST = 'ui:toast',
  UI_SIDEBAR_CHAT_TOGGLE = 'ui:sidebar:chat:toggle',
  UI_ACTIONS_UPDATE = 'ui:actions:update',
  UI_UPDATE = 'ui',

  // Network Communication
  NETWORK_CONNECTED = 'network:connected',
  NETWORK_DISCONNECTED = 'network:disconnected',
  NETWORK_MESSAGE_RECEIVED = 'network:message:received',
  NETWORK_ENTITY_UPDATES = 'network:entity_updates',

  // Client Communication
  CLIENT_CONNECT = 'client:connect',
  CLIENT_DISCONNECT = 'client:disconnect',
  CLIENT_ENTITY_SYNC = 'client:entity_sync',

  // Input System
  INPUT_KEY_DOWN = 'input:key:down',
  INPUT_KEY_UP = 'input:key:up',
  INPUT_POINTER_DOWN = 'input:pointer:down',
  INPUT_POINTER_UP = 'input:pointer:up',
  INPUT_POINTER_MOVE = 'input:pointer:move',

  // System Settings
  SETTINGS_CHANGED = 'settings:changed',

  // Graphics System
  GRAPHICS_RESIZE = 'graphics:resize',

  // XR System
  XR_SESSION = 'xr:session',

  // Terrain System
  TERRAIN_TILE_GENERATED = 'terrain:tile:generated',
  TERRAIN_VALIDATION_COMPLETE = 'terrain:validation:complete',
  TERRAIN_PHYSICS_READY = 'terrain:physics:ready',

  // Camera System
  CAMERA_SET_TARGET = 'camera:set_target',
  CAMERA_CLICK_WORLD = 'camera:click:world',
  CAMERA_SET_MODE = 'camera:set:mode',
  CAMERA_RESET = 'camera:reset',
  CAMERA_TAP = 'camera:tap',
  CAMERA_TARGET_CHANGED = 'camera:target:changed',

  // Movement System
  MOVEMENT_STOP = 'movement:stop',
  MOVEMENT_TOGGLE_RUN = 'movement:toggle:run',
  MOVEMENT_STARTED = 'movement:started',
  MOVEMENT_STOPPED = 'movement:stopped',
  MOVEMENT_SPEED_CHANGED = 'movement:speed:changed',
  MOVEMENT_STAMINA_DEPLETED = 'movement:stamina:depleted',
  PLAYER_STAMINA_UPDATE = 'player:stamina:update',

  // AI Navigation System
  AI_NAVIGATION_REQUEST = 'ai:navigation:request',
  AI_AGENT_REGISTER = 'ai:agent:register',
  AI_AGENT_UNREGISTER = 'ai:agent:unregister',
  AI_NAVIGATION_GRID_READY = 'ai:navigation:grid:ready',
  AI_AGENT_UNSTUCK = 'ai:agent:unstuck',

  // Test Framework Events
  TEST_STATION_CREATED = 'rpg:test:station:created',
  TEST_RESULT = 'rpg:test:result',


  // Test Visual Events
  TEST_UI_CREATE = 'rpg:test:ui:create',
  TEST_ZONE_CREATE = 'rpg:test:zone:create',
  TEST_UI_UPDATE = 'rpg:test:ui:update',
  TEST_ZONE_UPDATE = 'rpg:test:zone:update',
  TEST_PLAYER_CREATE = 'rpg:test:player:create',
  TEST_PLAYER_MOVE = 'rpg:test:player:move',
  TEST_CLEAR_UI = 'rpg:test:clear_ui',

  // Player Stats & Progression
  PLAYER_LEVEL_UP = 'rpg:player:level_up',
  PLAYER_LEVEL_CHANGED = 'rpg:player:level_changed',
  PLAYER_XP_GAINED = 'rpg:player:xp_gained',
  PLAYER_SKILLS_UPDATED = 'rpg:player:skills_updated',

  // Player Health & Status
  PLAYER_HEALTH_UPDATED = 'rpg:player:health_updated',
  PLAYER_DAMAGE = 'rpg:player:damage',
  PLAYER_DIED = 'rpg:player:died',
  PLAYER_RESPAWNED = 'rpg:player:respawned',
  PLAYER_RESPAWN_REQUEST = 'rpg:player:respawn_request',
  PLAYER_DESTROY = 'rpg:player:destroy',

  // Player Equipment & Stats
  PLAYER_EQUIPMENT_CHANGED = 'rpg:player:equipment_changed',
  PLAYER_EQUIPMENT_UPDATED = 'rpg:player:equipment_updated',
  PLAYER_STATS_EQUIPMENT_UPDATED = 'rpg:player:stats:equipment_updated',

  // Player Movement & Position
  PLAYER_POSITION_UPDATED = 'rpg:player:position:updated',
  PLAYER_TELEPORT_REQUEST = 'rpg:player:teleport_request',
  PLAYER_TELEPORTED = 'rpg:player:teleported',
  MOVEMENT_COMPLETED = 'rpg:movement:completed',
  MOVEMENT_CLICK_TO_MOVE = 'rpg:movement:click_to_move',

  // Player Combat Style
  ATTACK_STYLE_CHANGED = 'rpg:attack_style:changed',

  // Combat System
  COMBAT_STARTED = 'rpg:combat:started',
  COMBAT_ENDED = 'rpg:combat:ended',
  COMBAT_ATTACK = 'rpg:combat:attack',
  COMBAT_ATTACK_REQUEST = 'rpg:combat:attack_request',
  COMBAT_START_ATTACK = 'rpg:combat:start_attack',
  COMBAT_STOP_ATTACK = 'rpg:combat:stop_attack',
  COMBAT_ATTACK_STYLE_CHANGE = 'rpg:combat:attack_style:change',
  COMBAT_ATTACK_FAILED = 'rpg:combat:attack_failed',

  // Combat Types
  COMBAT_MELEE_ATTACK = 'rpg:combat:melee_attack',
  COMBAT_RANGED_ATTACK = 'rpg:combat:ranged_attack',
  COMBAT_MOB_ATTACK = 'rpg:combat:mob_attack',

  // Combat Calculations
  COMBAT_DAMAGE_DEALT = 'rpg:combat:damage_dealt',
  COMBAT_DAMAGE_CALCULATE = 'rpg:combat:damage_calculate',
  COMBAT_ACCURACY_CALCULATE = 'rpg:combat:accuracy_calculate',
  COMBAT_XP_CALCULATE = 'rpg:combat:xp_calculate',
  COMBAT_HEAL = 'rpg:combat:heal',
  COMBAT_MISS = 'rpg:combat:miss',
  COMBAT_ACTION = 'rpg:combat:action',
  COMBAT_KILL = 'rpg:combat:kill',

  // Aggro System
  AGGRO_PLAYER_LEFT = 'rpg:aggro:player_left',
  AGGRO_PLAYER_ENTERED = 'rpg:aggro:player_entered',
  AGGRO_MOB_AGGROED = 'rpg:aggro:mob_aggroed',

  // Inventory Management
  INVENTORY_INITIALIZED = 'rpg:inventory:initialized',
  INVENTORY_UPDATED = 'rpg:inventory:updated',
  INVENTORY_REQUEST = 'rpg:inventory:request',
  INVENTORY_FULL = 'rpg:inventory:full',

  // Inventory Items
  INVENTORY_ITEM_ADDED = 'rpg:inventory:item_added',
  INVENTORY_ITEM_REMOVED = 'rpg:inventory:item_removed',
  INVENTORY_MOVE = 'rpg:inventory:move',
  INVENTORY_USE = 'rpg:inventory:use',
  INVENTORY_EXAMINE_ITEM = 'rpg:inventory:examine_item',
  INVENTORY_CONSUME_ITEM = 'rpg:inventory:consume_item',

  // Inventory Queries
  INVENTORY_CHECK = 'rpg:inventory:check',
  INVENTORY_CAN_ADD = 'rpg:inventory:can_add',
  INVENTORY_HAS_ITEM = 'rpg:inventory:has_item',
  INVENTORY_HAS_EQUIPPED = 'rpg:inventory:has_equipped',

  // Inventory Interactions
  INVENTORY_ITEM_RIGHT_CLICK = 'rpg:inventory:item_right_click',

  // Inventory Currency
  INVENTORY_UPDATE_COINS = 'rpg:inventory:update_coins',
  INVENTORY_REMOVE_COINS = 'rpg:inventory:remove_coins',
  INVENTORY_COINS_UPDATED = 'rpg:inventory:coins_updated',

  // Item Lifecycle
  ITEM_SPAWNED = 'rpg:item:spawned',
  ITEM_SPAWN = 'rpg:item:spawn',
  ITEM_SPAWN_REQUEST = 'rpg:item:spawn_request',
  ITEM_SPAWN_LOOT = 'rpg:item:spawn_loot',
  ITEM_DESPAWN = 'rpg:item:despawn',
  ITEM_DESPAWNED = 'rpg:item:despawned',
  ITEM_RESPAWN_SHOPS = 'rpg:item:respawn_shops',

  // Item Actions
  ITEM_DROPPED = 'rpg:item:dropped',
  ITEM_DROP = 'rpg:item:drop',
  LOOT_DROPPED = 'rpg:loot:dropped',
  ITEM_PICKUP = 'rpg:item:picked_up',
  ITEM_PICKUP_REQUEST = 'rpg:item:pickup_request',
  ITEM_USED = 'rpg:item:used',
  ITEM_ACTION_SELECTED = 'rpg:item:action_selected',
  ITEMS_RETRIEVED = 'rpg:items:retrieved',

  // Equipment System
  EQUIPMENT_EQUIP = 'rpg:equipment:equip',
  EQUIPMENT_UNEQUIP = 'rpg:equipment:unequip',
  EQUIPMENT_TRY_EQUIP = 'rpg:equipment:try_equip',
  EQUIPMENT_FORCE_EQUIP = 'rpg:equipment:force_equip',
  EQUIPMENT_CONSUME_ARROW = 'rpg:equipment:consume_arrow',
  EQUIPMENT_EQUIPPED = 'rpg:equipment:equipped',
  EQUIPMENT_UNEQUIPPED = 'rpg:equipment:unequipped',
  EQUIPMENT_CAN_EQUIP = 'rpg:equipment:can_equip',

  // Interaction System
  INTERACTION_REGISTER = 'rpg:interaction:register',
  INTERACTION_UNREGISTER = 'rpg:interaction:unregister',

  // NPC System
  NPC_SPAWNED = 'rpg:npc:spawned',
  NPC_SPAWN_REQUEST = 'rpg:npc:spawn_request',
  NPC_INTERACTION = 'rpg:npc:interaction',
  NPC_DIALOGUE = 'rpg:npc:dialogue',

  // Quest System
  QUEST_STARTED = 'rpg:quest:started',
  QUEST_PROGRESSED = 'rpg:quest:progressed',
  QUEST_COMPLETED = 'rpg:quest:completed',

  // Mobs
  MOB_SPAWNED = 'rpg:mob:spawned',
  MOB_SPAWN_REQUEST = 'rpg:mob:spawn_request',
  MOB_SPAWN_POINTS_REGISTERED = 'rpg:mob:spawn_points:registered',
  MOB_DESPAWN = 'rpg:mob:despawn',
  MOB_DESPAWNED = 'rpg:mob:despawned',
  MOB_RESPAWN_ALL = 'rpg:mob:respawn_all',
  MOB_DAMAGED = 'rpg:mob:damaged',
  MOB_POSITION_UPDATED = 'rpg:mob:position_updated',
  MOB_ATTACKED = 'rpg:mob:attacked',
  MOB_DIED = 'rpg:mob:died',
  MOB_CHASE_STARTED = 'rpg:mob:chase:started',
  MOB_CHASE_ENDED = 'rpg:mob:chase:ended',
  MOB_MOVE_REQUEST = 'rpg:mob:move:request',
  MOB_DESTROY = 'rpg:mob:destroy',

  // Banking System
  BANK_OPEN = 'rpg:bank:open',
  BANK_CLOSE = 'rpg:bank:close',
  BANK_DEPOSIT = 'rpg:bank:deposit',
  BANK_DEPOSIT_SUCCESS = 'rpg:bank:deposit_success',
  BANK_DEPOSIT_FAIL = 'rpg:bank:deposit_fail',
  BANK_DEPOSIT_ALL = 'rpg:bank:deposit_all',
  BANK_WITHDRAW = 'rpg:bank:withdraw',
  BANK_WITHDRAW_SUCCESS = 'rpg:bank:withdraw_success',
  BANK_WITHDRAW_FAIL = 'rpg:bank:withdraw_fail',
  BANK_REMOVE = 'rpg:bank:remove',
  BANK_CREATE = 'rpg:bank:create',

  // Store System
  STORE_OPEN = 'rpg:store:open',
  STORE_CLOSE = 'rpg:store:close',
  STORE_BUY = 'rpg:store:buy',
  STORE_SELL = 'rpg:store:sell',
  STORE_REGISTER_NPC = 'rpg:store:register_npc',
  STORE_TRANSACTION = 'rpg:store:transaction',
  STORE_PLAYER_COINS = 'rpg:store:player_coins',

  // UI System
  UI_ATTACK_STYLE_GET = 'rpg:ui:attack_style:get',
  UI_ATTACK_STYLE_UPDATE = 'rpg:ui:attack_style:update',
  UI_ATTACK_STYLE_CHANGED = 'rpg:ui:attack_style:changed',
  UI_MESSAGE = 'rpg:ui:message',
  UI_REQUEST = 'rpg:ui:request',
  UI_CONTEXT_ACTION = 'rpg:ui:context_action',

  // Camera & Avatar
  CAMERA_FOLLOW_PLAYER = 'rpg:camera:follow_player',

  // Resource System
  RESOURCE_SPAWNED = 'rpg:resource:spawned',
  RESOURCE_GATHER = 'rpg:resource:gather',
  RESOURCE_GATHERED = 'rpg:resource:gathered',
  RESOURCE_HARVEST = 'rpg:resource:harvest',
  RESOURCE_DEPLETED = 'rpg:resource:depleted',
  RESOURCE_RESPAWNED = 'rpg:resource:respawned',
  RESOURCE_GATHERING_STARTED = 'rpg:resource:gathering:started',
  RESOURCE_GATHERING_STOPPED = 'rpg:resource:gathering:stopped',

  // Resource Validation Events
  RESOURCE_VALIDATION_REQUEST = 'rpg:resource:validation:request',
  RESOURCE_VALIDATION_COMPLETE = 'rpg:resource:validation:complete',
  RESOURCE_PLACEMENT_VALIDATE = 'rpg:resource:placement:validate',
  RESOURCE_RESPAWN_READY = 'rpg:resource:respawn:ready',
  RESOURCE_GATHERING_COMPLETED = 'rpg:resource:gathering:completed',
  RESOURCE_SPAWN_POINTS_REGISTERED = 'rpg:resource:spawn_points:registered',
  RESOURCE_ACTION = 'rpg:resource:action',

  // Skills & XP System
  SKILLS_XP_GAINED = 'rpg:skills:xp_gained',
  SKILLS_LEVEL_UP = 'rpg:skills:level_up',
  SKILLS_UPDATED = 'rpg:skills:updated',

  // Chat System
  CHAT_SEND = 'rpg:chat:send',
  CHAT_MESSAGE = 'rpg:chat:message',

  // Item Actions
  ITEM_USE_ON_FIRE = 'rpg:item:use_on_fire',
  ITEM_USE_ON_ITEM = 'rpg:item:use_on_item',
  ITEM_ON_ITEM = 'rpg:item:on:item',
  ITEM_RIGHT_CLICK = 'rpg:item:right_click',
  ITEM_ACTION_EXECUTE = 'rpg:item:action:execute',
  ITEM_EXAMINE = 'rpg:item:examine',
  ITEM_CONSUME = 'rpg:item:consume',

  // Additional Inventory Events
  INVENTORY_REMOVE_ITEM = 'rpg:inventory:remove_item',
  INVENTORY_ADD_COINS = 'rpg:inventory:add_coins',

  // Corpse System
  CORPSE_SPAWNED = 'rpg:corpse:spawned',
  CORPSE_CLICK = 'rpg:corpse:click',
  CORPSE_LOOT_REQUEST = 'rpg:corpse:loot_request',
  CORPSE_CLEANUP = 'rpg:corpse:cleanup',

  // Fire System
  FIRE_EXTINGUISHED = 'rpg:fire:extinguished',
  FIRE_CREATED = 'rpg:fire:created',

  // Cooking System
  COOKING_COMPLETED = 'rpg:cooking:completed',

  // Processing System
  PROCESSING_FIREMAKING_REQUEST = 'rpg:processing:firemaking:request',
  PROCESSING_COOKING_REQUEST = 'rpg:processing:cooking:request',

  // Additional UI Events
  UI_CREATE = 'rpg:ui:create',
  UI_OPEN_MENU = 'rpg:ui:open_menu',
  UI_CLOSE_MENU = 'rpg:ui:close_menu',
  UI_CONTEXT_MENU = 'rpg:ui:context_menu',
  UI_CLOSE_ALL = 'rpg:ui:close_all',
  UI_SET_VIEWPORT = 'rpg:ui:set_viewport',
  UI_DRAG_DROP = 'rpg:ui:drag_drop',
  UI_BANK_DEPOSIT = 'rpg:ui:bank_deposit',
  UI_BANK_WITHDRAW = 'rpg:ui:bank_withdraw',
  UI_HEALTH_UPDATE = 'rpg:ui:update_health',
  UI_PLAYER_UPDATE = 'rpg:ui:player_update',
  UI_EQUIPMENT_UPDATE = 'rpg:ui:equipment_update',
  UI_KEYBOARD_TEST = 'rpg:ui:keyboard_test',
  UI_SCREEN_READER_TEST = 'rpg:ui:screen_reader_test',
  UI_CONTRAST_TEST = 'rpg:ui:contrast_test',
  UI_COMPLEX_INTERACTION = 'rpg:ui:complex_interaction',
  UI_INTERACTION_VALIDATION = 'rpg:ui:interaction_validation',
  UI_TRIGGER_ERROR = 'rpg:ui:trigger_error',
  UI_TEST_RECOVERY = 'rpg:ui:test_recovery',
  UI_RESILIENCE_TEST = 'rpg:ui:resilience_test',

  // Stats System
  STATS_UPDATE = 'rpg:stats:update',

  // Persistence System
  PERSISTENCE_SAVE = 'rpg:persistence:save',
  PERSISTENCE_LOAD = 'rpg:persistence:load',

  // Chunk System
  CHUNK_LOADED = 'rpg:chunk:loaded',
  CHUNK_UNLOADED = 'rpg:chunk:unloaded',

  // Pathfinding System
  PATHFINDING_REQUEST = 'rpg:pathfinding:request',

  // Physics Test Events
  PHYSICS_TEST_RUN_ALL = 'rpg:physics:test:run_all',
  PHYSICS_TEST_BALL_RAMP = 'rpg:physics:test:ball_ramp',
  PHYSICS_TEST_CUBE_DROP = 'rpg:physics:test:cube_drop',
  PHYSICS_TEST_CHARACTER_COLLISION = 'rpg:physics:test:character_collision',
  PHYSICS_PRECISION_RUN_ALL = 'rpg:physics:precision:run_all',
  PHYSICS_PRECISION_PROJECTILE = 'rpg:physics:precision:projectile',
  PHYSICS_PRECISION_COMPLETED = 'rpg:physics:precision:completed',

  // Physics Validation Events
  PHYSICS_VALIDATION_REQUEST = 'rpg:physics:validation:request',
  PHYSICS_VALIDATION_COMPLETE = 'rpg:physics:validation:complete',
  PHYSICS_GROUND_CLAMP = 'rpg:physics:ground_clamp',

  // General Test Events
  TEST_RUN_ALL = 'rpg:test:run_all',
  TEST_PLAYER_REMOVE = 'rpg:test:player:remove',
  TEST_BANK_CREATE = 'rpg:test:bank:create',
  TEST_BANK_REMOVE = 'rpg:test:bank:remove',
  TEST_STORE_CREATE = 'rpg:test:store:create',
  TEST_STORE_REMOVE = 'rpg:test:store:remove',
  TEST_NPC_CREATE = 'rpg:test:npc:create',
  TEST_NPC_REMOVE = 'rpg:test:npc:remove',
  TEST_ITEM_CREATE = 'rpg:test:item:create',
  TEST_ITEM_REMOVE = 'rpg:test:item:remove',
  TEST_TREE_CREATE = 'rpg:test:tree:create',
  TEST_TREE_REMOVE = 'rpg:test:tree:remove',
  TEST_FISHING_SPOT_CREATE = 'rpg:test:fishing_spot:create',
  TEST_FISHING_SPOT_REMOVE = 'rpg:test:fishing_spot:remove',
  TEST_FIRE_EXTINGUISH = 'rpg:test:fire:extinguish',
  TEST_TEXT_CREATE = 'rpg:test:text:create',
  TEST_WAYPOINT_CREATE = 'rpg:test:waypoint:create',
  TEST_WAYPOINT_UPDATE = 'rpg:test:waypoint:update',
  TEST_WAYPOINT_REMOVE = 'rpg:test:waypoint:remove',
  TEST_OBSTACLE_CREATE = 'rpg:test:obstacle:create',
  TEST_OBSTACLE_REMOVE = 'rpg:test:obstacle:remove',
  TEST_BARRIER_CREATE = 'rpg:test:barrier:create',
  TEST_BARRIER_REMOVE = 'rpg:test:barrier:remove',
  TEST_TELEPORT_TARGET_CREATE = 'rpg:test:teleport_target:create',
  TEST_TELEPORT_TARGET_UPDATE = 'rpg:test:teleport_target:update',
  TEST_TELEPORT_TARGET_REMOVE = 'rpg:test:teleport_target:remove',
  TEST_EQUIPMENT_RACK_CREATE = 'rpg:test:equipment_rack:create',
  TEST_EQUIPMENT_RACK_REMOVE = 'rpg:test:equipment_rack:remove',
  TEST_EQUIPMENT_SLOT_CREATE = 'rpg:test:equipment_slot:create',
  TEST_EQUIPMENT_SLOT_REMOVE = 'rpg:test:equipment_slot:remove',
  TEST_EQUIPMENT_SLOT_UPDATE = 'rpg:test:equipment_slot:update',
  TEST_RUN_FIREMAKING_TESTS = 'rpg:test:run_firemaking_tests',
  TEST_RUN_COOKING_TESTS = 'rpg:test:run_cooking_tests',

  // Death System Events
  DEATH_LOOT_COLLECT = 'rpg:death:loot:collect',
  DEATH_HEADSTONE_EXPIRED = 'rpg:death:headstone:expired',
  INVENTORY_DROP_ALL = 'rpg:inventory:drop_all',
  PLAYER_SET_DEAD = 'rpg:player:set_dead',
  UI_DEATH_SCREEN = 'rpg:ui:death_screen',
  UI_DEATH_SCREEN_CLOSE = 'rpg:ui:death_screen:close',
  DEATH_LOOT_HEADSTONE = 'rpg:death:loot_headstone',
  ENTITY_CREATE_HEADSTONE = 'rpg:entity:create_headstone',
  ENTITY_REMOVE = 'rpg:entity:remove',
  WORLD_CREATE_GROUND_ITEM = 'rpg:world:create_ground_item',

  // Biome Visualization Events
  BIOME_TOGGLE_VISUALIZATION = 'rpg:biome:toggle_visualization',
  BIOME_SHOW_AREA = 'rpg:biome:show_area',
  BIOME_HIDE_AREA = 'rpg:biome:hide_area',

  // Test Runner Events
  TEST_ALL_COMPLETED = 'rpg:test:all_completed',
  TEST_REPORT = 'rpg:test:report',
  TEST_SPAWN_CUBE = 'rpg:test:spawn_cube',
  TEST_CLEAR_CUBES = 'rpg:test:clear_cubes',

  // Physics Events
  PHYSICS_REGISTER = 'rpg:physics:register',
  PHYSICS_UNREGISTER = 'rpg:physics:unregister',

  // Animation Events
  ANIMATION_COMPLETE = 'rpg:animation:complete',
  ANIMATION_PLAY = 'rpg:animation:play',

  // Terrain Events
  TERRAIN_CONFIGURE = 'rpg:terrain:configure',
  TERRAIN_SPAWN_RESOURCE = 'rpg:terrain:spawn_resource',

  // Skills System Events
  SKILLS_ACTION = 'rpg:skills:action',
  SKILLS_RESET = 'rpg:skills:reset',
  SKILLS_MILESTONE = 'rpg:skills:milestone',
  COMBAT_LEVEL_CHANGED = 'rpg:combat:level:changed',
  TOTAL_LEVEL_CHANGED = 'rpg:total:level:changed',

  // Damage & Healing Events
  PLAYER_DAMAGE_TAKEN = 'rpg:player:damage:taken',
  PLAYER_HEALING_RECEIVED = 'rpg:player:healing:received',
  ENTITY_DAMAGE_TAKEN = 'rpg:entity:damage:taken',
  ENTITY_HEALING_RECEIVED = 'rpg:entity:healing:received',
  ENTITY_HEALTH_CHANGED = 'rpg:entity:health:changed',
  ENTITY_REVIVED = 'rpg:entity:revived',

  // World Events
  WORLD_LOAD_AREA = 'rpg:world:load_area',
  WORLD_UNLOAD_AREA = 'rpg:world:unload_area',

  // Test framework events
  TEST_RUN_SUITE = 'rpg:test:run_suite',

  // World generation events
  WORLD_GENERATE = 'rpg:world:generate',
  WORLD_SPAWN_STRUCTURE = 'rpg:world:spawn_structure',
  ANIMATION_CANCEL = 'rpg:animation:cancel',
  AVATAR_LOAD_COMPLETE = 'avatar_load_complete',
}

export type EventPayloads = {
  // Core Events
  [EventType.PLAYER_JOINED]: Payloads.PlayerJoinedPayload
  [EventType.ENTITY_CREATED]: Payloads.EntityCreatedPayload

  // Events
  [EventType.PLAYER_LEVEL_UP]: Payloads.PlayerLevelUpPayload
  [EventType.PLAYER_XP_GAINED]: Payloads.PlayerXPGainedPayload
  [EventType.COMBAT_STARTED]: Payloads.CombatStartedPayload
  [EventType.INVENTORY_ITEM_ADDED]: Payloads.InventoryItemAddedPayload
  [EventType.MOB_DIED]: Payloads.MobDiedPayload
}

// Generic event base type for event payloads
// Use a more flexible type that can handle complex nested objects
export type AnyEvent = Record<string, unknown>
