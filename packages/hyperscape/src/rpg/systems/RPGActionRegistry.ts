 
import { ActionRegistry } from '../../core/ActionRegistry';
import { RPGSystemBase } from './RPGSystemBase';
import { EventType } from '../../types/events';
import type { World, ActionContext } from '../../types';
import { RPGLogger } from '../utils/RPGLogger';

// Define a proper type for action parameters
interface ActionParams {
  // Combat parameters
  targetId?: string;
  attackStyle?: string;
  
  // Item parameters
  itemId?: string;
  slot?: number;
  quantity?: number;
  
  // Movement parameters
  destination?: { x: number; y: number; z: number };
  
  // Banking/Store parameters
  bankId?: string;
  storeId?: string;
  
  // Skill parameters
  skill?: string;
  
  // Generic parameters
  [key: string]: string | number | boolean | { x: number; y: number; z: number } | undefined;
}

/**
 * RPG Action Registry System
 * 
 * This system creates and manages the world's actionRegistry,
 * exposing all RPG actions for agent discovery and execution.
 */
export class RPGActionRegistry extends RPGSystemBase {
  private actionRegistry: ActionRegistry;

  constructor(world: World) {
    super(world, {
      name: 'rpg-action-registry',
      dependencies: {
        required: [], // Action registry can work independently
        optional: ['rpg-combat', 'rpg-inventory', 'rpg-skills', 'rpg-banking', 'rpg-store', 'rpg-movement'] // Better with all game systems
      },
      autoCleanup: true
    });
    this.actionRegistry = new ActionRegistry();
    
    // Attach to world for discovery with compatible interface
    world.actionRegistry = {
      getAll: () => this.actionRegistry.getAll().map(action => ({
        ...action,
        execute: action.execute as (context: ActionContext, params: Record<string, unknown>) => Promise<unknown>
      })) as { [key: string]: unknown; name: string; }[],
      getAvailable: (context: Record<string, unknown>) => this.actionRegistry.getAvailable(context as unknown as ActionContext).map(action => ({
        ...action,
        execute: action.execute as (context: ActionContext, params: Record<string, unknown>) => Promise<unknown>
      })) as { [key: string]: unknown; name: string; }[],
      execute: (name: string, context: Record<string, unknown>, params: ActionParams) => 
        this.actionRegistry.execute(name, context as unknown as ActionContext, params)
    };
  }

  async init(): Promise<void> {
    // Register all RPG actions
    this.registerCombatActions();
    this.registerInventoryActions();
    this.registerSkillActions();
    this.registerBankingActions();
    this.registerStoreActions();
    this.registerMovementActions();
    
    RPGLogger.system('RPGActionRegistry', `Registered ${this.actionRegistry.getAll().length} actions`);
  }

  private registerCombatActions(): void {
    this.actionRegistry.register({
      name: 'attack',
      description: 'Attack a target mob or player',
      parameters: [
        { name: 'targetId', type: 'string', required: true, description: 'ID of the target to attack' }
      ],
      validate: (_context: ActionContext): boolean => {
        // Check if player is in combat range, has weapon, etc.
        return true;
      },
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit(EventType.COMBAT_START_ATTACK, { 
          attackerId: playerId, 
          targetId: params.targetId as string
        });
        
        return { success: true, message: `Started attacking ${params.targetId}` };
      }
    });

    this.actionRegistry.register({
      name: 'stop_attack',
      description: 'Stop current combat',
      parameters: [],
      execute: async (context: ActionContext, _params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit(EventType.COMBAT_STOP_ATTACK, { attackerId: playerId });
        return { success: true, message: 'Stopped attacking' };
      }
    });
  }

  private registerInventoryActions(): void {
    this.actionRegistry.register({
      name: 'use_item',
      description: 'Use an item from inventory',
      parameters: [
        { name: 'itemId', type: 'string', required: true, description: 'ID of the item to use' },
        { name: 'slot', type: 'number', required: true, description: 'Inventory slot number' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        // Validate slot parameter
        const slot = params.slot as number;
        if (typeof slot !== 'number' || slot < 0) {
          return { success: false, message: 'Invalid slot number provided' };
        }
        
        // Get item action system
        const itemActionSystem = world.getSystem('rpg-item-actions');
        if (itemActionSystem) {
          // Trigger appropriate action based on item type
          world.emit(EventType.INVENTORY_USE, { playerId, itemId: params.itemId as string, slot });
        }
        
        return { success: true, message: `Using item ${params.itemId}` };
      }
    });

    this.actionRegistry.register({
      name: 'drop_item',
      description: 'Drop an item from inventory',
      parameters: [
        { name: 'itemId', type: 'string', required: true, description: 'ID of the item to drop' },
        { name: 'quantity', type: 'number', required: false, description: 'Amount to drop' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit(EventType.ITEM_DROP, { 
          playerId, 
          itemId: params.itemId as string, 
          quantity: (params.quantity as number) || 1 
        });
        
        return { success: true, message: `Dropped item ${params.itemId}` };
      }
    });

    this.actionRegistry.register({
      name: 'equip_item',
      description: 'Equip an item',
      parameters: [
        { name: 'itemId', type: 'string', required: true, description: 'ID of the item to equip' },
        { name: 'slot', type: 'string', required: false, description: 'Equipment slot (auto-detect if not provided)' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit(EventType.EQUIPMENT_TRY_EQUIP, { 
          playerId, 
          itemId: params.itemId as string, 
          slot: params.slot as number
        });
        
        return { success: true, message: `Equipping item ${params.itemId}` };
      }
    });

    this.actionRegistry.register({
      name: 'pickup_item',
      description: 'Pick up an item from the ground',
      parameters: [
        { name: 'itemId', type: 'string', required: true, description: 'ID of the ground item to pick up' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit(EventType.ITEM_PICKUP_REQUEST, { 
          playerId, 
          itemId: params.itemId as string
        });
        
        return { success: true, message: `Picking up item ${params.itemId}` };
      }
    });
  }

  private registerSkillActions(): void {
    this.actionRegistry.register({
      name: 'start_gathering',
      description: 'Start gathering a resource',
      parameters: [
        { name: 'resourceId', type: 'string', required: true, description: 'ID of the resource to gather' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        const player = world.entities.player;
        
        world.emit(EventType.RESOURCE_GATHERING_STARTED, { 
          playerId, 
          resourceId: params.resourceId,
          playerPosition: player?.position 
        });
        
        return { success: true, message: `Started gathering ${params.resourceId}` };
      }
    });

    this.actionRegistry.register({
      name: 'stop_gathering',
      description: 'Stop current gathering action',
      parameters: [],
      execute: async (context: ActionContext, _params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit(EventType.RESOURCE_GATHERING_STOPPED, { playerId });
        return { success: true, message: 'Stopped gathering' };
      }
    });
  }

  private registerBankingActions(): void {
    this.actionRegistry.register({
      name: 'open_bank',
      description: 'Open a bank interface',
      parameters: [
        { name: 'bankId', type: 'string', required: true, description: 'ID of the bank to open' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        const player = world.entities.player;
        
        world.emit(EventType.BANK_OPEN, { 
          playerId, 
          bankId: params.bankId,
          playerPosition: player?.position 
        });
        
        return { success: true, message: `Opening bank ${params.bankId}` };
      }
    });

    this.actionRegistry.register({
      name: 'deposit_item',
      description: 'Deposit an item into the bank',
      parameters: [
        { name: 'bankId', type: 'string', required: true, description: 'ID of the bank' },
        { name: 'itemId', type: 'string', required: true, description: 'ID of the item to deposit' },
        { name: 'quantity', type: 'number', required: false, description: 'Amount to deposit' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit(EventType.BANK_DEPOSIT, { 
          playerId, 
          bankId: params.bankId as string,
          itemId: params.itemId as string,
          quantity: (params.quantity as number) || 1
        });
        
        return { success: true, message: `Deposited ${(params.quantity as number) || 1} ${params.itemId}` };
      }
    });
  }

  private registerStoreActions(): void {
    this.actionRegistry.register({
      name: 'open_store',
      description: 'Open a store interface',
      parameters: [
        { name: 'storeId', type: 'string', required: true, description: 'ID of the store to open' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        const player = world.entities.player;
        
        world.emit(EventType.STORE_OPEN, { 
          playerId, 
          storeId: params.storeId,
          playerPosition: player?.position 
        });
        
        return { success: true, message: `Opening store ${params.storeId}` };
      }
    });

    this.actionRegistry.register({
      name: 'buy_item',
      description: 'Buy an item from a store',
      parameters: [
        { name: 'storeId', type: 'string', required: true, description: 'ID of the store' },
        { name: 'itemId', type: 'string', required: true, description: 'ID of the item to buy' },
        { name: 'quantity', type: 'number', required: false, description: 'Amount to buy' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit(EventType.STORE_BUY, { 
          playerId, 
          storeId: params.storeId as string,
          itemId: params.itemId as string,
          quantity: (params.quantity as number) || 1
        });
        
        return { success: true, message: `Buying ${(params.quantity as number) || 1} ${params.itemId}` };
      }
    });

    this.actionRegistry.register({
      name: 'sell_item',
      description: 'Sell an item to a store',
      parameters: [
        { name: 'storeId', type: 'string', required: true, description: 'ID of the store' },
        { name: 'itemId', type: 'string', required: true, description: 'ID of the item to sell' },
        { name: 'quantity', type: 'number', required: false, description: 'Amount to sell' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit(EventType.STORE_SELL, { 
          playerId, 
          storeId: params.storeId as string,
          itemId: params.itemId as string,
          quantity: (params.quantity as number) || 1
        });
        
        return { success: true, message: `Selling ${(params.quantity as number) || 1} ${params.itemId}` };
      }
    });
  }

  private registerMovementActions(): void {
    this.actionRegistry.register({
      name: 'move_to',
      description: 'Move to a specific location',
      parameters: [
        { name: 'x', type: 'number', required: true, description: 'X coordinate' },
        { name: 'y', type: 'number', required: false, description: 'Y coordinate' },
        { name: 'z', type: 'number', required: true, description: 'Z coordinate' }
      ],
      execute: async (context: ActionContext, params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit(EventType.MOVEMENT_CLICK_TO_MOVE, { 
          playerId,
          targetPosition: { x: params.x as number, y: (params.y as number) || 0, z: params.z as number }
        });
        
        return { success: true, message: `Moving to (${params.x}, ${params.z})` };
      }
    });

    this.actionRegistry.register({
      name: 'stop_moving',
      description: 'Stop current movement',
      parameters: [],
      execute: async (context: ActionContext, _params: Record<string, unknown>) => {
        const { world } = context;
        const playerId = context.playerId || world.network.id;
        
        world.emit('movement:stop', { playerId });
        return { success: true, message: 'Stopped moving' };
      }
    });
  }

  /**
   * Get action registry for external access
   */
  getActionRegistry(): ActionRegistry {
    return this.actionRegistry;
  }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all registered actions by creating a new ActionRegistry
    if (this.actionRegistry) {
      // Get all action names and unregister them
      const allActions = this.actionRegistry.getAll();
      for (const action of allActions) {
        this.actionRegistry.unregister(action.name);
      }
    }
    
    // Clear from world
    this.world.actionRegistry = undefined;
    

    
    // Call parent cleanup
    super.destroy();
  }
} 