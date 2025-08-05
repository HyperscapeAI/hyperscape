/**
 * StorageEntity - Base class for entities that can store items
 * 
 * Extends RPGEntity to provide storage-specific functionality including:
 * - Item storage and retrieval systems
 * - Capacity management
 * - Access control (private/public/shared)
 * - Storage UI management
 * - Persistence integration
 * 
 * Used by: BankEntity, ChestEntity, ContainerEntity
 */

import { RPGEntity } from './RPGEntity';
import type { World } from '../../core/World';
import type { RPGEntityConfig, EntityInteractionData, BankEntityProperties } from '../types/entities';
import type { RPGItem, InventoryItem } from '../types/core';
import { ItemType } from '../types/core';
import { ItemRarity } from '../types/entities';

export interface StorageConfig extends RPGEntityConfig<BankEntityProperties> {
  storage?: {
    capacity?: number; // -1 = unlimited
    accessType?: 'private' | 'public' | 'shared'; // private = per-player, public = all players, shared = guild/party
    requiresPermission?: boolean;
    allowedPlayers?: string[]; // For shared access
    persistenceKey?: string; // For database storage
    categories?: string[]; // What types of items can be stored
    restrictions?: {
      maxStackSize?: number;
      blockedItems?: string[];
      allowedItems?: string[];
    };
  };
}

export interface StorageSlot {
  id: string;
  itemId: string;
  quantity: number;
  metadata?: Record<string, string | number | boolean> | null;
  slotIndex?: number;
}

export abstract class StorageEntity extends RPGEntity {
  // Storage properties
  protected capacity: number = 1000; // Default large capacity
  protected accessType: 'private' | 'public' | 'shared' = 'private';
  protected requiresPermission: boolean = false;
  protected allowedPlayers: Set<string> = new Set();
  protected persistenceKey: string;
  protected allowedCategories: Set<string> = new Set();
  
  // Storage restrictions
  protected maxStackSize: number = 1000;
  protected blockedItems: Set<string> = new Set();
  protected allowedItems: Set<string> = new Set(); // Empty = allow all
  
  // Storage data
  protected storage: Map<string, Map<string, StorageSlot>> = new Map(); // playerId -> items
  protected publicStorage: Map<string, StorageSlot> = new Map(); // For public storage
  protected currentUsers: Set<string> = new Set(); // Players currently accessing

  constructor(world: World, config: StorageConfig) {
    super(world, config);
    
    this.persistenceKey = config.storage?.persistenceKey || `storage_${this.id}`;
    
    // Initialize storage properties from config
    if (config.storage) {
      this.capacity = config.storage.capacity ?? this.capacity;
      this.accessType = config.storage.accessType || this.accessType;
      this.requiresPermission = config.storage.requiresPermission || this.requiresPermission;
      
      if (config.storage.allowedPlayers) {
        this.allowedPlayers = new Set(config.storage.allowedPlayers);
      }
      
      if (config.storage.categories) {
        this.allowedCategories = new Set(config.storage.categories);
      }
      
      if (config.storage.restrictions) {
        this.maxStackSize = config.storage.restrictions.maxStackSize || this.maxStackSize;
        if (config.storage.restrictions.blockedItems) {
          this.blockedItems = new Set(config.storage.restrictions.blockedItems);
        }
        if (config.storage.restrictions.allowedItems) {
          this.allowedItems = new Set(config.storage.restrictions.allowedItems);
        }
      }
    }
    
    this.initializeStorage();
  }

  protected initializeStorage(): void {
    // Add storage component
    this.addComponent('storage', {
      capacity: this.capacity,
      accessType: this.accessType,
      requiresPermission: this.requiresPermission,
      allowedPlayers: Array.from(this.allowedPlayers),
      persistenceKey: this.persistenceKey,
      currentUsers: Array.from(this.currentUsers),
      itemCount: 0,
      isEmpty: true
    });
    
    // Add interaction component for storage access
    this.addComponent('interaction', {
      type: 'storage',
      interactable: true,
      distance: 3.0,
      prompt: `Open ${this.name}`,
      description: `${this.accessType} storage container`
    });
  }

  // === Storage Management ===

  /**
   * Check if a player can access this storage
   */
  public canAccess(playerId: string): boolean {
    if (this.accessType === 'public') {
      return true;
    }
    
    if (this.accessType === 'private') {
      return true; // Each player has their own storage space
    }
    
    if (this.accessType === 'shared') {
      return !this.requiresPermission || this.allowedPlayers.has(playerId);
    }
    
    return false;
  }

  /**
   * Get storage for a specific player or public storage
   */
  protected getStorageSpace(playerId?: string): Map<string, StorageSlot> {
    if (this.accessType === 'public' || this.accessType === 'shared') {
      return this.publicStorage;
    }
    
    // Private storage - each player has their own space
    if (!playerId) {
      throw new Error('Player ID required for private storage');
    }
    
    if (!this.storage.has(playerId)) {
      this.storage.set(playerId, new Map());
    }
    
    return this.storage.get(playerId)!;
  }

  /**
   * Store items in the storage
   */
  public storeItems(items: InventoryItem[], playerId?: string): {
    success: boolean;
    storedItems: InventoryItem[];
    remainingItems: InventoryItem[];
    reason?: string;
  } {
    if (playerId && !this.canAccess(playerId)) {
      return {
        success: false,
        storedItems: [],
        remainingItems: items,
        reason: 'Access denied'
      };
    }
    
    const storageSpace = this.getStorageSpace(playerId);
    const storedItems: InventoryItem[] = [];
    const remainingItems: InventoryItem[] = [];
    
    for (const item of items) {
      // Check if item is allowed (convert to RPGItem for checking)
      const baseItem: RPGItem = { 
        id: item.itemId, 
        name: '', 
        type: ItemType.MISC, 
        quantity: 1,
        stackable: false, 
        maxStackSize: 1,
        value: 0,
        weight: 0,
        equipSlot: null,
        weaponType: null,
        equipable: false,
        attackType: null,
        description: '',
        examine: '',
        tradeable: true,
        rarity: ItemRarity.COMMON,
        modelPath: '',
        iconPath: '',
        healAmount: 0,
        stats: { attack: 0, defense: 0, strength: 0 },
        bonuses: { attack: 0, defense: 0, ranged: 0, strength: 0 },
        requirements: { level: 1, skills: {} }
      };
      if (!this.canStoreItem(baseItem)) {
        remainingItems.push(item);
        continue;
      }
      
      // Check capacity
      if (this.capacity > 0 && storageSpace.size >= this.capacity) {
        remainingItems.push(item);
        continue;
      }
      
      // Try to stack with existing item
      const existingSlot = this.findStackableSlot(storageSpace, item);
      if (existingSlot && existingSlot.quantity + item.quantity <= this.maxStackSize) {
        existingSlot.quantity += item.quantity;
        storedItems.push(item);
      } else if (storageSpace.size < this.capacity || this.capacity < 0) {
        // Create new slot
        const slot: StorageSlot = {
          id: `${item.id}_${Date.now()}_${Math.random()}`,
          itemId: item.itemId,
          quantity: item.quantity,
          metadata: item.metadata,
          slotIndex: storageSpace.size
        };
        
        storageSpace.set(slot.id, slot);
        storedItems.push(item);
      } else {
        remainingItems.push(item);
      }
    }
    
    // Update storage component
    this.updateStorageComponent(playerId);
    
    // Emit storage event
    if (storedItems.length > 0) {
      this.emit('items-stored', {
        entityId: this.id,
        playerId,
        items: storedItems,
        totalItems: this.getTotalItemCount(playerId)
      });
    }
    
    return {
      success: storedItems.length > 0,
      storedItems,
      remainingItems,
      reason: remainingItems.length > 0 ? 'Some items could not be stored' : undefined
    };
  }

  /**
   * Retrieve items from storage
   */
  public retrieveItems(itemIds: string[], playerId?: string): {
    success: boolean;
    retrievedItems: InventoryItem[];
    reason?: string;
  } {
    if (playerId && !this.canAccess(playerId)) {
      return {
        success: false,
        retrievedItems: [],
        reason: 'Access denied'
      };
    }
    
    const storageSpace = this.getStorageSpace(playerId);
    const retrievedItems: InventoryItem[] = [];
    
    for (const itemId of itemIds) {
      const slot = storageSpace.get(itemId);
      if (slot) {
        const item: InventoryItem = {
          id: slot.id,
          itemId: slot.itemId,
          quantity: slot.quantity,
          slot: slot.slotIndex || 0,
          metadata: slot.metadata ?? null
        };
        
        retrievedItems.push(item);
        storageSpace.delete(itemId);
      }
    }
    
    // Update storage component
    this.updateStorageComponent(playerId);
    
    // Emit retrieval event
    if (retrievedItems.length > 0) {
      this.emit('items-retrieved', {
        entityId: this.id,
        playerId,
        items: retrievedItems,
        totalItems: this.getTotalItemCount(playerId)
      });
    }
    
    return {
      success: retrievedItems.length > 0,
      retrievedItems,
      reason: retrievedItems.length === 0 ? 'No items found' : undefined
    };
  }

  /**
   * Get all items in storage for a player
   */
  public getStorageContents(playerId?: string): StorageSlot[] {
    if (playerId && !this.canAccess(playerId)) {
      return [];
    }
    
    const storageSpace = this.getStorageSpace(playerId);
    return Array.from(storageSpace.values());
  }

  /**
   * Check if an item can be stored
   */
  protected canStoreItem(item: RPGItem): boolean {
    // Check blocked items
    if (this.blockedItems.has(item.id)) {
      return false;
    }
    
    // Check allowed items (if list is not empty)
    if (this.allowedItems.size > 0 && !this.allowedItems.has(item.id)) {
      return false;
    }
    
    // Check categories if specified (would need item type information)
    // This would require expanding the RPGItem interface to include category
    
    return true;
  }

  /**
   * Find a stackable slot for an item
   */
  protected findStackableSlot(storageSpace: Map<string, StorageSlot>, item: InventoryItem): StorageSlot | null {
    for (const slot of storageSpace.values()) {
      if (slot.itemId === item.itemId && slot.quantity < this.maxStackSize) {
        return slot;
      }
    }
    return null;
  }

  /**
   * Get total item count in storage
   */
  protected getTotalItemCount(playerId?: string): number {
    const storageSpace = this.getStorageSpace(playerId);
    return storageSpace.size;
  }

  /**
   * Update storage component data
   */
  protected updateStorageComponent(playerId?: string): void {
    const storageComponent = this.getComponent('storage');
    if (storageComponent) {
      const itemCount = this.getTotalItemCount(playerId);
      storageComponent.data.itemCount = itemCount;
      storageComponent.data.isEmpty = itemCount === 0;
      storageComponent.data.currentUsers = Array.from(this.currentUsers);
    }
  }

  // === User Management ===

  /**
   * Add a player to current users (for UI management)
   */
  public addUser(playerId: string): boolean {
    if (!this.canAccess(playerId)) {
      return false;
    }
    
    this.currentUsers.add(playerId);
    this.updateStorageComponent();
    
    this.emit('storage-opened', {
      entityId: this.id,
      playerId,
      currentUsers: Array.from(this.currentUsers)
    });
    
    return true;
  }

  /**
   * Remove a player from current users
   */
  public removeUser(playerId: string): void {
    this.currentUsers.delete(playerId);
    this.updateStorageComponent();
    
    this.emit('storage-closed', {
      entityId: this.id,
      playerId,
      currentUsers: Array.from(this.currentUsers)
    });
  }

  // === Interaction Handling ===

  protected async onInteract(data: EntityInteractionData): Promise<void> {
    // Handle storage access
    if (data.interactionType === 'use' || !data.interactionType) {
      if (this.canAccess(data.playerId)) {
        const success = this.addUser(data.playerId);
        
        if (success) {
          this.emit('storage-interaction', {
            entityId: this.id,
            playerId: data.playerId,
            action: 'open',
            accessType: this.accessType
          });
        } else {
          this.emit('storage-error', {
            entityId: this.id,
            playerId: data.playerId,
            message: 'Cannot access storage'
          });
        }
      } else {
        this.emit('storage-denied', {
          entityId: this.id,
          playerId: data.playerId,
          message: 'Access denied'
        });
      }
    }
  }

  // === Persistence ===

  /**
   * Serialize storage data for persistence
   */
  public serializeStorage(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      accessType: this.accessType,
      capacity: this.capacity,
      publicStorage: Array.from(this.publicStorage.entries()),
      privateStorage: {}
    };
    
    if (this.accessType === 'private') {
      const privateData: Record<string, Array<[string, StorageSlot]>> = {};
      for (const [playerId, playerStorage] of this.storage.entries()) {
        privateData[playerId] = Array.from(playerStorage.entries());
      }
      data.privateStorage = privateData;
    }
    
    return data;
  }

  /**
   * Load storage data from persistence
   */
  public deserializeStorage(data: Record<string, unknown>): void {
    if (data.publicStorage && Array.isArray(data.publicStorage)) {
      this.publicStorage = new Map(data.publicStorage as [string, StorageSlot][]);
    }
    
    if (data.privateStorage && typeof data.privateStorage === 'object') {
      const privateData = data.privateStorage as Record<string, Array<[string, StorageSlot]>>;
      for (const [playerId, playerData] of Object.entries(privateData)) {
        this.storage.set(playerId, new Map(playerData));
      }
    }
    
    this.updateStorageComponent();
  }

  // === Cleanup ===

  public destroy(): void {
    // Clear all users
    for (const playerId of this.currentUsers) {
      this.removeUser(playerId);
    }
    
    super.destroy();
  }

  // === Abstract Methods ===

  /**
   * Create the entity's visual representation - from RPGEntity
   */
  protected abstract createMesh(): Promise<void>;

  // === Getters ===

  public getCapacity(): number { return this.capacity; }
  public getAccessType(): string { return this.accessType; }
  public getCurrentUsers(): string[] { return Array.from(this.currentUsers); }
  public getPersistenceKey(): string { return this.persistenceKey; }
}