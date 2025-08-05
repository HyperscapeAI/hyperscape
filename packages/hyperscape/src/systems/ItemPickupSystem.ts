/**
 * Item Pickup System
 * 
 * Handles ground items, pickup interactions, and drop mechanics.
 * Items appear as colored cubes that players can click to pick up.
 */

import * as THREE from '../extras/three';
import type {
  ItemDropPayload,
  ItemPickupPayload,
  ItemPickupRequestPayload,
  PlayerEnterPayload,
  PlayerLeavePayload
} from '../types/event-payloads';
import { EventType } from '../types/events';
import { GroundItem, Item, ItemType, World } from '../types/core';
import { ItemPickupSystemInfo as SystemInfo } from '../types/system-types';
import { safeSceneAdd } from '../utils/EntityUtils';
import { SystemBase } from './SystemBase';

export class ItemPickupSystem extends SystemBase {
  private groundItems: Map<string, GroundItem> = new Map();
  private itemColors: Map<string, number> = new Map();
  private lastUpdate: number = 0;
  private updateInterval: number = 1000; // Update every second

  constructor(world: World) {
    super(world, {
      name: 'rpg-item-pickup',
      dependencies: {
        required: [], // Item pickup can work independently
        optional: ['rpg-inventory', 'rpg-loot', 'rpg-ui', 'client-graphics'] // Better with inventory and graphics systems
      },
      autoCleanup: true
    });
    this.initializeItemColors();
  }

  async init(): Promise<void> {
    
    // Set up type-safe event subscriptions for item pickup mechanics
    this.subscribe<ItemDropPayload>(EventType.ITEM_DROP, (event) => this.handleItemDrop(event.data));
    this.subscribe<ItemPickupPayload>(EventType.ITEM_PICKUP, (event) => this.handleItemPickup(event.data));
    this.subscribe<ItemPickupRequestPayload>(EventType.ITEM_PICKUP_REQUEST, (event) => this.handlePickupRequest(event.data));
    
    // Listen for player events
    this.subscribe<PlayerEnterPayload>(EventType.PLAYER_JOINED, (event) => this.handlePlayerJoin(event.data));
    this.subscribe<PlayerLeavePayload>(EventType.PLAYER_LEFT, (event) => this.handlePlayerLeave(event.data));
  }



  /**
   * Initialize item type colors for visual representation
   */
  private initializeItemColors(): void {
    this.itemColors.set('weapon', 0xFFFFFF);       // White for weapons
    this.itemColors.set('armor', 0x8B4513);        // Brown for armor
    this.itemColors.set('shield', 0x4169E1);       // Blue for shields
    this.itemColors.set('ammunition', 0xFFD700);   // Gold for arrows
    this.itemColors.set('food', 0x32CD32);         // Green for food
    this.itemColors.set('resource', 0x654321);     // Dark brown for resources
    this.itemColors.set('tool', 0xC0C0C0);         // Silver for tools
    this.itemColors.set('coin', 0xFFD700);         // Gold for coins
  }

  /**
   * Drop an item at a specific location
   */
  public dropItem(item: Item, position: { x: number; y: number; z: number }, droppedBy: string): string {
    const itemId = `ground_item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create visual representation
    const mesh: THREE.Mesh = this.createItemMesh(item, itemId);
    mesh.position.set(position.x, position.y, position.z);
    mesh.position.y += 0.5; // Slightly above ground
    
    // Add to world scene
    safeSceneAdd(this.world, mesh.parent as unknown as THREE.Object3D);
    
    const groundItem: GroundItem = {
      id: itemId,
      item: item,
      position: new THREE.Vector3(position.x, position.y, position.z),
      mesh: mesh,
      droppedBy: droppedBy,
      droppedAt: Date.now(),
      despawnTime: Date.now() + (5 * 60 * 1000) // 5 minutes despawn time
    };
    this.groundItems.set(itemId, groundItem);
    
    // Emit drop event for other systems
    this.emit(EventType.ITEM_DROPPED, { itemId, item, position, droppedBy, playerId: droppedBy });
    
    return itemId;
  }

  /**
   * Create visual mesh for ground item
   */
  private createItemMesh(item: Item, itemId: string): THREE.Mesh {
    // Create geometry based on item type
    let geometry: THREE.BufferGeometry;
    
    switch (item.type) {
      case ItemType.WEAPON:
        if (item.name.toLowerCase().includes('bow')) {
          geometry = new THREE.BoxGeometry(0.1, 0.8, 0.05);
        } else if (item.name.toLowerCase().includes('shield')) {
          geometry = new THREE.BoxGeometry(0.03, 0.5, 0.4);
        } else {
          geometry = new THREE.BoxGeometry(0.05, 0.6, 0.05);
        }
        break;
      case ItemType.ARMOR:
        if (item.equipSlot === 'helmet') {
          geometry = new THREE.BoxGeometry(0.3, 0.25, 0.3);
        } else if (item.equipSlot === 'body') {
          geometry = new THREE.BoxGeometry(0.4, 0.5, 0.2);
        } else if (item.equipSlot === 'legs') {
          geometry = new THREE.BoxGeometry(0.3, 0.6, 0.2);
        } else {
          geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        }
        break;
      case ItemType.AMMUNITION:
        geometry = new THREE.BoxGeometry(0.02, 0.3, 0.02);
        break;
      case ItemType.CONSUMABLE:
        geometry = new THREE.SphereGeometry(0.1, 6, 4);
        break;
      case ItemType.TOOL:
        geometry = new THREE.BoxGeometry(0.05, 0.4, 0.05);
        break;
      default:
        geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    }

    const material = new THREE.MeshLambertMaterial({ 
      color: this.getItemColor(item),
      transparent: true,
      opacity: 0.9
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ground_item_${item.name.replace(/\s+/g, '_')}`;
    
    // Add interaction data for raycasting
    mesh.userData = {
      type: 'ground_item',
      itemId: itemId,
      itemType: item.type,
      itemName: item.name,
      interactive: true,
      clickable: true
    };

    // Add PhysX collider for interaction
    mesh.userData.physx = {
      type: 'box',
      size: { 
        x: (geometry as THREE.BoxGeometry).parameters?.width || 0.2,
        y: (geometry as THREE.BoxGeometry).parameters?.height || 0.2,
        z: (geometry as THREE.BoxGeometry).parameters?.depth || 0.2
      },
      collider: true,
      trigger: false,
      interactive: true
    };

    // Add floating animation
    mesh.userData.startTime = Date.now();
    
    return mesh;
  }

  /**
   * Get item color based on type and material
   */
  private getItemColor(item: Item): number {
    // First check for specific material colors
    const nameLower = item.name.toLowerCase();
    
    if (nameLower.includes('bronze')) return 0xCD7F32;
    if (nameLower.includes('steel')) return 0xC0C0C0;
    if (nameLower.includes('mithril')) return 0x4169E1;
    if (nameLower.includes('leather')) return 0x8B4513;
    
    // Fall back to type-based colors
    return this.itemColors.get(item.type) || 0x808080;
  }

  /**
   * Handle pickup request from player interaction
   */
  private handlePickupRequest(event: ItemPickupRequestPayload): void {
    const groundItem = this.groundItems.get(event.itemId);
    if (!groundItem) {
      return;
    }

    const player = this.world.getPlayer(event.playerId);
    if (!player) {
      return;
    }

    // Check if player is close enough to pick up
    const distance = player.node.position.distanceTo(groundItem.position);
    
    if (distance > 3.0) { // 3 meter pickup range
      this.sendMessage(event.playerId, 'You are too far away to pick up that item.', 'warning');
      return;
    }

    // Try to add to inventory
    const item = groundItem.item;
    this.emit(EventType.INVENTORY_ITEM_ADDED, {
      playerId: event.playerId,
      item: {
        id: item.id,
        name: item.name,
        type: item.type,
        quantity: 1, // Ground items are always quantity 1
        stackable: item.stackable || false
      }
    });

    // Successfully added to inventory - remove from ground
    this.removeGroundItem(event.itemId);
    this.sendMessage(event.playerId, `Picked up ${item.name}.`, 'info');
    
    
    // Emit pickup event
    this.emit(EventType.ITEM_PICKUP, {
        playerId: event.playerId,
        itemId: event.itemId,
        groundItemId: event.itemId
      });
  }

  /**
   * Handle item drop event
   */
  private handleItemDrop(event: ItemDropPayload): void {
    this.dropItem(event.item, event.position, event.playerId);
  }

  /**
   * Handle item pickup event (direct pickup without distance check)
   */
  private handleItemPickup(event: ItemPickupPayload): void {
    const groundItem = this.groundItems.get(event.itemId);
    if (groundItem) {
      this.removeGroundItem(event.itemId);
    }
  }

  /**
   * Remove ground item
   */
  private removeGroundItem(itemId: string): void {
    const groundItem = this.groundItems.get(itemId);
    if (!groundItem) return;
    
    // Remove mesh from scene
    if (groundItem.mesh.parent) {
      groundItem.mesh.parent.remove(groundItem.mesh);
    }
    
    // Remove from tracking
    this.groundItems.delete(itemId);
  }

  /**
   * Handle player join
   */
  private handlePlayerJoin(_event: PlayerEnterPayload): void {
    // Send existing ground items to new player
    for (const [itemId, groundItem] of this.groundItems) {
      this.emit(EventType.ITEM_SPAWNED, {
        itemId: itemId,
        position: groundItem.position
      });
    }
  }

  /**
   * Handle player leave
   */
  private handlePlayerLeave(_event: PlayerLeavePayload): void {
    // No specific cleanup needed for pickup system
  }

  /**
   * Send message to player
   */
  private sendMessage(playerId: string, message: string, type: 'info' | 'warning' | 'error'): void {
    this.emit(EventType.UI_MESSAGE, {
      playerId: playerId,
      message: message,
      type: type
    });
  }

  /**
   * Update system - handle item floating animation and despawning
   */
  update(_deltaTime: number): void {
    const now = Date.now();
    
    // Update floating animation and check for despawns
    for (const [itemId, groundItem] of this.groundItems) {
      // Floating animation
      if (groundItem.mesh) {
        const time = (now - (groundItem.mesh.userData.startTime as number)) * 0.001;
        const originalY = groundItem.position.y + 0.5;
        groundItem.mesh.position.y = originalY + Math.sin(time * 2) * 0.1;
        groundItem.mesh.rotation.y = time * 0.5; // Slow rotation
      }
      
      // Check for despawn
      if (groundItem.despawnTime && now > groundItem.despawnTime) {
        this.removeGroundItem(itemId);
      }
    }
    
    // Periodic cleanup check
    if (now - this.lastUpdate > this.updateInterval) {
      this.lastUpdate = now;
      this.cleanupOrphanedItems();
    }
  }

  /**
   * Clean up orphaned items (items without meshes in scene)
   */
  private cleanupOrphanedItems(): void {
    for (const [itemId, groundItem] of this.groundItems) {
      if (!groundItem.mesh.parent) {
        this.groundItems.delete(itemId);
      }
    }
  }

  /**
   * Get all ground items in range of a position
   */
  public getItemsInRange(position: { x: number; y: number; z: number }, range: number): GroundItem[] {
    const itemsInRange: GroundItem[] = [];
    
    for (const groundItem of this.groundItems.values()) {
      const distance = Math.sqrt(
        Math.pow(position.x - groundItem.position.x, 2) +
        Math.pow(position.y - groundItem.position.y, 2) +
        Math.pow(position.z - groundItem.position.z, 2)
      );
      if (distance <= range) {
        itemsInRange.push(groundItem);
      }
    }
    
    return itemsInRange;
  }

  /**
   * Get ground item by ID
   */
  public getGroundItem(itemId: string): GroundItem | null {
    return this.groundItems.get(itemId) || null;
  }

  /**
   * Get all ground items
   */
  public getAllGroundItems(): GroundItem[] {
    return Array.from(this.groundItems.values());
  }

  /**
   * Force remove all ground items (for cleanup)
   */
  public clearAllItems(): void {
    for (const groundItem of this.groundItems.values()) {
      if (groundItem.mesh.parent) {
        groundItem.mesh.parent.remove(groundItem.mesh);
      }
    }
    this.groundItems.clear();
  }

  /**
   * Get system info for debugging
   */
  getSystemInfo(): SystemInfo {
    const oldest = this.getOldestItem();
    const newest = this.getNewestItem();
    
    return {
      totalGroundItems: this.groundItems.size,
      itemsByType: this.getItemsByType(),
      oldestItem: oldest ? {
        itemId: oldest.id,
        position: {
          x: oldest.position.x,
          y: oldest.position.y,
          z: oldest.position.z
        },
        droppedAt: oldest.droppedAt
      } : null,
      newestItem: newest ? {
        itemId: newest.id,
        position: {
          x: newest.position.x,
          y: newest.position.y,
          z: newest.position.z
        },
        droppedAt: newest.droppedAt
      } : null
    };
  }

  private getItemsByType(): Record<string, number> {
    const typeCount: Record<string, number> = {};
    
    for (const groundItem of this.groundItems.values()) {
      const type = groundItem.item.type;
      typeCount[type] = (typeCount[type] || 0) + 1;
    }
    
    return typeCount;
  }

  private getOldestItem(): GroundItem | null {
    let oldest: GroundItem | null = null;
    
    for (const groundItem of this.groundItems.values()) {
      if (!oldest || groundItem.droppedAt < oldest.droppedAt) {
        oldest = groundItem;
      }
    }
    
    return oldest;
  }

  private getNewestItem(): GroundItem | null {
    let newest: GroundItem | null = null;
    
    for (const groundItem of this.groundItems.values()) {
      if (!newest || groundItem.droppedAt > newest.droppedAt) {
        newest = groundItem;
      }
    }
    
    return newest;
  }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all ground items (calls existing cleanup logic)
    this.clearAllItems();
    
    // Clear item colors mapping
    this.itemColors.clear();
    
    // Reset timing variables
    this.lastUpdate = 0;
    
    // Call parent cleanup
    super.destroy();
  }
}