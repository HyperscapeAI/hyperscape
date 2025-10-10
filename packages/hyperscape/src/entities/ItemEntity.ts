/**
 * ItemEntity - Represents items in the world
 * Replaces item-based Apps with server-authoritative entities
 */

import THREE from '../extras/three';
import type { World } from '../World';
import type { ItemType, MeshUserData, Item } from '../types/core';
import { EquipmentSlotName, WeaponType } from '../types/core';
import type { EntityInteractionData, ItemEntityConfig } from '../types/entities';
import { InteractableEntity, type InteractableConfig } from './InteractableEntity';

// Re-export types for external use
export type { ItemEntityConfig } from '../types/entities';

export class ItemEntity extends InteractableEntity {
  protected config: ItemEntityConfig;

  constructor(world: World, config: ItemEntityConfig) {
    // Convert ItemEntityConfig to InteractableConfig format
    const interactableConfig: InteractableConfig = {
      ...config,
      interaction: {
        prompt: 'Take',
        description: `${config.name} - ${config.description || 'An item'}`,
        range: 2.0,
        cooldown: 0,
        usesRemaining: 1, // Items can only be picked up once
        maxUses: 1,
        effect: 'pickup'
      }
    };
    
    super(world, interactableConfig);
    this.config = config;
  }

  protected async createMesh(): Promise<void> {
    // Create a simple cube for now - replace with actual item models later
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshLambertMaterial({
      color: this.getItemColor(),
      transparent: true,
      opacity: 0.8
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Item_${this.config.itemId}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mesh = mesh;

    // Mesh position is relative to node, not world
    // Don't add offset here - the node is already at the correct world position
    // If we want floating animation, it should be done in update() with time-based offset

    // Set up userData with proper typing for item
    const userData: MeshUserData = {
      type: 'item',
      entityId: this.id,
      name: this.config.name,
      interactable: true,
      mobData: null,
      itemData: {
        id: this.id,
        itemId: this.config.itemId,
        name: this.config.name,
        type: this.config.itemType,
        quantity: this.config.quantity
      }
    };
    if (this.mesh) {
      // Spread userData to match THREE.js userData type
      this.mesh.userData = { ...userData };
    }

    // Add glow effect for rare items
    if (this.config.rarity !== 'common') {
      this.addGlowEffect();
    }
    
    // Add mesh to the entity's node so it appears in the scene
    if (this.mesh && this.node) {
      this.node.add(this.mesh);
      
      // Also set userData on the node itself for easier detection
      this.node.userData.type = 'item';
      this.node.userData.entityId = this.id;
      this.node.userData.interactable = true;
      this.node.userData.itemData = userData.itemData;
    }
  }

  /**
   * Handle item interaction - implements InteractableEntity.handleInteraction
   */
  public async handleInteraction(data: EntityInteractionData): Promise<void> {
    // Handle item pickup
    this.world.emit('item:pickup_request', {
      playerId: data.playerId,
      itemId: this.id,
      entityId: this.id,
      position: this.getPosition()
    });
    
    // Item is consumed after pickup, so it will be destroyed by the system
  }

  protected serverUpdate(deltaTime: number): void {
    super.serverUpdate(deltaTime);

    // Floating animation - mesh position is RELATIVE to node, not absolute world position
    // Node is already positioned at terrain height, so just offset from that
    if (this.mesh && this.mesh.position && this.mesh.rotation) {
      const time = this.world.getTime() * 0.001;
      this.mesh.position.y = 0.5 + Math.sin(time * 2) * 0.1; // Float above node position
      this.mesh.rotation.y += deltaTime * 0.5;
    }

    // Check for despawn conditions
    this.checkDespawn();
  }

  protected clientUpdate(deltaTime: number): void {
    super.clientUpdate(deltaTime);

    // Same floating animation on client - mesh position is RELATIVE to node
    if (this.mesh && this.mesh.position && this.mesh.rotation) {
      const time = this.world.getTime() * 0.001;
      this.mesh.position.y = 0.5 + Math.sin(time * 2) * 0.1; // Float above node position
      this.mesh.rotation.y += deltaTime * 0.5;
    }
  }

  private checkDespawn(): void {
    // Items despawn after 10 minutes if not picked up
    const despawnTime = this.getProperty('spawnTime', this.world.getTime()) + (10 * 60 * 1000);
    if (this.world.getTime() > despawnTime) {
      this.destroy();
    }
  }

  private getItemColor(): number {
    // Color based on rarity
    switch (this.config.rarity) {
      case 'legendary': return 0xffd700; // Gold
      case 'epic': return 0x9932cc; // Purple
      case 'rare': return 0x0066ff; // Blue
      case 'uncommon': return 0x00ff00; // Green
      default: return 0xffffff; // White
    }
  }

  private addGlowEffect(): void {
    if (!this.mesh) return;

    // Add a subtle glow effect for rare items
    const glowGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: this.getItemColor(),
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    });

    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.mesh.add(glow);
  }



  // Get item data for systems
  getItemData(): Item {
    return {
      id: this.config.itemId,
      name: this.config.name,
      type: this.config.itemType as ItemType, // Cast string to ItemType enum
      quantity: this.config.quantity || 1,
      stackable: this.config.stackable,
      maxStackSize: 100,
      value: this.config.value,
      weight: this.config.weight || 0,
      equipSlot: this.config.armorSlot ? this.config.armorSlot as EquipmentSlotName : null,
      weaponType: WeaponType.NONE,
      equipable: this.config.armorSlot ? true : false,
      attackType: null,
      description: this.config.description,
      examine: this.config.examine || '',
      tradeable: true,
      rarity: this.config.rarity,
      modelPath: this.config.modelPath || '',
      iconPath: this.config.iconPath || '',
      healAmount: this.config.healAmount || 0,
      stats: {
        attack: this.config.stats.attack || 0,
        defense: this.config.stats.defense || 0,
        strength: this.config.stats.strength || 0
      },
      bonuses: {
        attack: 0,
        defense: 0,
        ranged: 0,
        strength: 0
      },
      requirements: {
        level: this.config.requirements.level || 1,
        skills: {} as Partial<Record<string, number>>
      }
    };
  }

  // Quantity management
  setQuantity(quantity: number): void {
    this.config.quantity = Math.max(0, quantity);
    
    // Update userData
    if (this.mesh?.userData) {
      const userData = this.mesh.userData as MeshUserData;
      if (userData.itemData && typeof userData.itemData === 'object') {
        const itemData = userData.itemData as { quantity?: number };
        itemData.quantity = this.config.quantity;
      }
    }

    // Destroy if quantity reaches 0
    if (this.config.quantity <= 0) {
      this.destroy();
    }

    this.markNetworkDirty();
  }

  addQuantity(amount: number): number {
    if (!this.config.stackable && amount > 0) {
      return 0; // Can't add to non-stackable items
    }

    const oldQuantity = this.config.quantity;
    this.setQuantity(this.config.quantity + amount);
    return this.config.quantity - oldQuantity;
  }

  // Check if this item can stack with another
  canStackWith(other: ItemEntity): boolean {
    return this.config.stackable && 
           other.config.stackable &&
           this.config.itemId === other.config.itemId &&
           this.config.itemType === other.config.itemType;
  }

  // Network data override
  getNetworkData(): Record<string, unknown> {
    const baseData = super.getNetworkData();
    return {
      ...baseData,
      itemId: this.config.itemId,
      itemType: this.config.itemType,
      quantity: this.config.quantity,
      value: this.config.value,
      rarity: this.config.rarity,
      stackable: this.config.stackable
    };
  }
}