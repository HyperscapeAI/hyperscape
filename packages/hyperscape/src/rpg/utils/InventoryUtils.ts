/**
 * Utility functions for common inventory operations
 * Consolidates duplicate patterns across RPG systems
 */

import type { World } from '../../types';
import type { InventoryItem } from '../types';
import { getEntityWithComponent } from './EntityUtils';
import { getItem } from '../data/items';

export interface InventoryComponent {
  items: InventoryItem[];
  capacity: number;
  addItem(item: InventoryItem): boolean;
  removeItem(itemId: string, quantity?: number): boolean;
  hasItem(itemId: string, quantity?: number): boolean;
  getItem(itemId: string): InventoryItem | null;
}

/**
 * Safe inventory access with validation
 */
export function getInventory(world: World, entityId: string): InventoryComponent | null {
  const result = getEntityWithComponent<InventoryComponent>(world, entityId, 'inventory');
  return result?.component || null;
}

/**
 * Check if entity has inventory space for item
 */
export function hasInventorySpace(world: World, entityId: string, itemsToAdd: number = 1): boolean {
  const inventory = getInventory(world, entityId);
  if (!inventory) return false;
  
  const currentItems = inventory.items?.length || 0;
  return currentItems + itemsToAdd <= inventory.capacity;
}

/**
 * Add item to entity inventory with validation
 */
export function addItemToInventory(
  world: World, 
  entityId: string, 
  item: InventoryItem
): boolean {
  const inventory = getInventory(world, entityId);
  if (!inventory) return false;
  
  return inventory.addItem(item);
}

/**
 * Remove item from entity inventory with validation
 */
export function removeItemFromInventory(
  world: World,
  entityId: string,
  itemId: string,
  quantity: number = 1
): boolean {
  const inventory = getInventory(world, entityId);
  if (!inventory) return false;
  
  return inventory.removeItem(itemId, quantity);
}

/**
 * Check if entity has specific item
 */
export function hasInventoryItem(
  world: World,
  entityId: string,
  itemId: string,
  quantity: number = 1
): boolean {
  const inventory = getInventory(world, entityId);
  if (!inventory) return false;
  
  return inventory.hasItem(itemId, quantity);
}

/**
 * Get specific item from inventory
 */
export function getInventoryItem(
  world: World,
  entityId: string,
  itemId: string
): InventoryItem | null {
  const inventory = getInventory(world, entityId);
  if (!inventory) return null;
  
  return inventory.getItem(itemId);
}

/**
 * Transfer items between entities
 */
export function transferItems(
  world: World,
  fromEntityId: string,
  toEntityId: string,
  itemId: string,
  quantity: number = 1
): boolean {
  // Validate both entities have inventories
  const fromInventory = getInventory(world, fromEntityId);
  const toInventory = getInventory(world, toEntityId);
  
  if (!fromInventory || !toInventory) return false;
  
  // Check if source has the item
  if (!fromInventory.hasItem(itemId, quantity)) return false;
  
  // Check if destination has space
  if (!hasInventorySpace(world, toEntityId, quantity)) return false;
  
  // Get the item
  const item = fromInventory.getItem(itemId);
  if (!item) return false;
  
  // Create item for transfer
  const transferItem: InventoryItem = {
    ...item,
    quantity: Math.min(quantity, item.quantity)
  };
  
  // Remove from source and add to destination
  if (fromInventory.removeItem(itemId, quantity)) {
    return toInventory.addItem(transferItem);
  }
  
  return false;
}

/**
 * Get all items of a specific type from inventory
 */
export function getItemsByType(
  world: World,
  entityId: string,
  itemType: string
): InventoryItem[] {
  const inventory = getInventory(world, entityId);
  if (!inventory || !inventory.items) return [];
  
  return inventory.items.filter(item => {
    const itemData = getItem(item.itemId);
    return itemData?.type === itemType;
  });
}

/**
 * Count total items in inventory
 */
export function getInventoryItemCount(world: World, entityId: string): number {
  const inventory = getInventory(world, entityId);
  if (!inventory || !inventory.items) return 0;
  
  return inventory.items.reduce((total, item) => total + item.quantity, 0);
}

/**
 * Check if inventory is full
 */
export function isInventoryFull(world: World, entityId: string): boolean {
  const inventory = getInventory(world, entityId);
  if (!inventory) return true;
  
  return inventory.items.length >= inventory.capacity;
}

/**
 * Get inventory utilization percentage
 */
export function getInventoryUtilization(world: World, entityId: string): number {
  const inventory = getInventory(world, entityId);
  if (!inventory) return 100;
  
  return (inventory.items.length / inventory.capacity) * 100;
}