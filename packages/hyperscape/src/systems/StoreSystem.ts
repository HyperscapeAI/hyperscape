import { SystemBase } from './SystemBase';
import type { World } from '../types';
import { EventType } from '../types/events';
import { getStoreItem } from '../constants/store-data';
import { Store } from '../types/core';
import type {
  StoreBuyEvent,
  StoreCloseEvent,
  StoreSellEvent,
  StoreOpenEvent
} from '../types/events';
import { StoreID } from '../types/identifiers';
import { calculateDistance } from '../utils/EntityUtils';
import {
  createItemID,
  createStoreID
} from '../utils/IdentifierUtils';

/**
 * Store System  
 * Manages general stores per GDD specifications:
 * - One general store per starter town
 * - Sells basic tools: Hatchet (Bronze), Fishing Rod, Tinderbox
 * - Sells ammunition: Arrows
 * - Uses coins as currency
 * - Click shopkeeper to open store interface
 */
export class StoreSystem extends SystemBase {
  private stores = new Map<StoreID, Store>();
  private readonly STORES_DATA: Store[] = [
    {
      id: 'store_town_0',
      name: 'Central General Store',
      position: { x: 5, y: 2, z: 0 },
      npcName: 'Shopkeeper Alice',
      items: [
        getStoreItem('bronze_hatchet'),
        getStoreItem('fishing_rod'),
        getStoreItem('tinderbox'),
        getStoreItem('arrows'),
        getStoreItem('logs')
      ],
      buyback: true, // Central store buys back items
      buybackRate: 0.5
    },
    {
      id: 'store_town_1',
      name: 'Eastern General Store',
      position: { x: 105, y: 2, z: 0 },
      npcName: 'Shopkeeper Bob',
      items: [
        getStoreItem('bronze_hatchet'),
        getStoreItem('fishing_rod'),
        getStoreItem('tinderbox'),
        getStoreItem('arrows')
      ],
      buyback: true,
      buybackRate: 0.5
    },
    {
      id: 'store_town_2',
      name: 'Western General Store',
      position: { x: -105, y: 2, z: 0 },
      npcName: 'Shopkeeper Charlie',
      items: [
        getStoreItem('bronze_hatchet'),
        getStoreItem('fishing_rod'),
        getStoreItem('tinderbox'),
        getStoreItem('arrows')
      ],
      buyback: true,
      buybackRate: 0.5
    },
    {
      id: 'store_town_3',
      name: 'Northern General Store', 
      position: { x: 0, y: 2, z: 110 },
      npcName: 'Shopkeeper Diana',
      items: [
        getStoreItem('bronze_hatchet'),
        getStoreItem('fishing_rod'),
        getStoreItem('tinderbox'),
        getStoreItem('arrows')
      ],
      buyback: false,
      buybackRate: 0.0
    },
    {
      id: 'store_town_4',
      name: 'Southern General Store',
      position: { x: 0, y: 2, z: -105 },
      npcName: 'Shopkeeper Eve',
      items: [
        getStoreItem('bronze_hatchet'),
        getStoreItem('fishing_rod'),
        getStoreItem('tinderbox'),
        getStoreItem('arrows')
      ],
      buyback: true,
      buybackRate: 0.5
    }
  ];

  constructor(world: World) {
    super(world, {
      name: 'rpg-store',
      dependencies: {
        required: [], // Store system can work independently
        optional: ['rpg-inventory', 'rpg-npc', 'rpg-ui', 'rpg-database'] // Better with inventory and NPC systems
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Initialize all stores
    for (const storeData of this.STORES_DATA) {
      this.stores.set(createStoreID(storeData.id), { ...storeData });
    }
    
    // Set up type-safe event subscriptions for store mechanics
    this.subscribe<StoreOpenEvent>(EventType.STORE_OPEN, (event) => {
      this.openStore(event.data);
    });
    this.subscribe<StoreCloseEvent>(EventType.STORE_CLOSE, (event) => {
      this.closeStore(event.data);
    });
    this.subscribe<StoreBuyEvent>(EventType.STORE_BUY, (event) => {
      this.buyItem(event.data);
    });
    this.subscribe<StoreSellEvent>(EventType.STORE_SELL, (event) => {
      this.sellItem(event.data.playerId, event.data.itemId, event.data.quantity);
    });
    
    // Listen for NPC registrations from world content system
    this.subscribe<{ npcId: string; storeId: string; position: { x: number; y: number; z: number }; name: string; area: string }>(EventType.STORE_REGISTER_NPC, (event) => {
      this.registerStoreNPC(event.data);
    });
    
  }



  private registerStoreNPC(data: { npcId: string; storeId: string; position: { x: number; y: number; z: number }; name: string; area: string }): void {
    const storeId = createStoreID(data.storeId);
    const store = this.stores.get(storeId);
    
    // Store must exist - fail if not found
    if (!store) {
      throw new Error(`Store ${data.storeId} not found for NPC ${data.npcId}`);
    }
    
    // Update store position to match NPC position
    store.position = data.position;
    store.npcName = data.name;
  }

  private openStore(data: StoreOpenEvent): void {
    const storeId = createStoreID(data.storeId);
    const store = this.stores.get(storeId)!; // Store must exist
    
    const distance = calculateDistance(data.playerPosition, store.position);
    if (distance > 3) {
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: 'You need to be closer to the shopkeeper to trade.',
        type: 'error'
      });
      return;
    }
    
    // Send store interface data to player
    this.emitTypedEvent(EventType.STORE_OPEN, {
      playerId: data.playerId,
      storeId: data.storeId,
      storeName: store.name,
      npcName: store.npcName,  
      items: store.items,
      categories: ['tools', 'ammunition', 'consumables']
    });
  }

  private closeStore(data: StoreCloseEvent): void {
    this.emitTypedEvent(EventType.STORE_CLOSE, {
      playerId: data.playerId,
      storeId: data.storeId
    });
  }

  private buyItem(data: StoreBuyEvent): void {
    const storeId = createStoreID(data.storeId);
    const store = this.stores.get(storeId)!; // Store must exist
    const itemId = createItemID(String(data.itemId));
    
    const item = store.items.find(item => item.id === itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found in store ${storeId}`);
    }
    
    const totalCost = item.price * data.quantity;

    // Check stock (if not unlimited)
    if (item.stockQuantity !== undefined && item.stockQuantity !== -1 && item.stockQuantity < data.quantity) {
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: 'Not enough stock available.',
        type: 'error'
      });
      return;
    }

    // Process the purchase immediately
    // Remove coins from player
    this.emitTypedEvent(EventType.INVENTORY_REMOVE_COINS, {
      playerId: data.playerId,
      amount: totalCost
    });

    // Add item to player inventory
    this.emitTypedEvent(EventType.INVENTORY_ITEM_ADDED, {
      playerId: data.playerId,
      item: {
        id: `inv_${data.playerId}_${Date.now()}`,
        itemId: item.id,
        quantity: data.quantity,
        slot: -1, // Let system find empty slot
        metadata: null
      }
    });

    // Update store stock (if not unlimited)
    if (item.stockQuantity !== undefined && item.stockQuantity !== -1) {
      item.stockQuantity -= data.quantity;
    }

    // Send success message
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId: data.playerId,
      message: `Purchased ${data.quantity}x ${item.name} for ${totalCost} coins.`,
      type: 'success'
    });
  }

  /**
   * Public API method for selling items (used by tests and internal events)
   * Compatible with test system signature: sellItem(playerId, itemId, quantity, expectedPrice)
   */
  public sellItem(playerId: string, itemId: string, quantity: number, _expectedPrice?: number): boolean {
    const validItemId = createItemID(itemId);
    
    // Find a store that buys the item
    let targetStore: Store | undefined;
    for (const store of this.stores.values()) {
      if (store.buyback && store.items.find(item => item.id === validItemId)) {
        targetStore = store;
        break;
      }
    }

    if (!targetStore) {
      throw new Error(`No store buys item: ${itemId}`);
    }

    const storeItem = targetStore.items.find(item => item.id === validItemId)!;
    const buybackRate = targetStore.buybackRate ?? 0.5;
    const sellPrice = Math.floor(storeItem.price * buybackRate);
    const totalValue = sellPrice * quantity;

    // Process the sale immediately
    // Remove item from player inventory
    this.emitTypedEvent(EventType.INVENTORY_REMOVE_ITEM, {
      playerId: playerId,
      itemId: itemId,
      quantity: quantity
    });

    // Add coins to player
    this.emitTypedEvent(EventType.INVENTORY_ADD_COINS, {
      playerId: playerId,
      amount: totalValue
    });

    // Send success message
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId: playerId,
      message: `Sold ${quantity}x ${storeItem.name} for ${totalValue} coins.`,
      type: 'success'
    });
    
    return true;
  }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all store data
    this.stores.clear();
    
    // Call parent cleanup
    super.destroy();
  }

  // Public API methods for integration tests
  public getAllStores(): Store[] {
    return Array.from(this.stores.values());
  }

  public getStore(storeId: string): Store | undefined {
    return this.stores.get(createStoreID(storeId));
  }

  public getStoreLocations(): Array<{ id: string; name: string; position: { x: number; y: number; z: number } }> {
    return Array.from(this.stores.values()).map(store => ({
      id: store.id,
      name: store.name,
      position: store.position
    }));
  }

  /**
   * Public API method for purchasing items (used by tests)
   * Compatible with test system signature: purchaseItem(playerId, itemId, quantity, expectedPrice)
   */
  public purchaseItem(playerId: string, itemId: string, quantity: number = 1, _expectedPrice?: number): boolean {
    // Use default store for tests
    const storeId = 'store_town_0';
    
    this.buyItem({
      playerId,
      storeId,
      itemId: createItemID(itemId),
      quantity
    });
    
    return true;
  }
}