/**
 * BankEntity - RPG Bank buildings extending RPGEntity
 * Managed by RPGBankingSystem, inherits ECS functionality from RPGEntity
 */

import * as THREE from '../../core/extras/three';
import type { World } from '../../core/World';
import type { BankEntityData, BankStorageItem, EntityInteractionData } from '../types/entities';
import { EntityType, InteractionType } from '../types/entities';
import type { InventoryItem } from '../types/core';
import { StorageEntity, type StorageConfig } from './StorageEntity';

// Type for bank-specific metadata stored in items
interface BankItemMetadata extends Record<string, string | number | boolean> {
  storedAt: number;
  bankId: string;
  originalItemId: string;
}

// Type guard for BankItemMetadata
function isBankItemMetadata(metadata: Record<string, string | number | boolean> | null | undefined): metadata is BankItemMetadata {
  return metadata !== null &&
         metadata !== undefined &&
         typeof metadata.storedAt === 'number' &&
         typeof metadata.bankId === 'string' &&
         typeof metadata.originalItemId === 'string';
}

export class BankEntity extends StorageEntity {
  // Bank-specific properties
  public readonly bankId: string;
  public readonly townId: string;
  protected capacity: number;
  private interactionDistance: number;
  
  // Visual elements
  private buildingMesh: THREE.Group | null = null;
  private signMesh: THREE.Sprite | null = null;
  private chestMesh: THREE.Mesh | null = null;

  constructor(world: World, data: BankEntityData) {
    // Convert BankEntityData to StorageConfig format
    const config: StorageConfig = {
      id: data.id,
      name: data.name || `Bank (${data.townId})`,
      type: EntityType.STATIC,
      position: { 
        x: data.position ? data.position[0] : 0, 
        y: data.position ? data.position[1] : 0, 
        z: data.position ? data.position[2] : 0 
      },
      rotation: data.quaternion ? {
        x: data.quaternion[0],
        y: data.quaternion[1], 
        z: data.quaternion[2]
      } : { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      interactable: true,
      interactionType: InteractionType.BANK,
      interactionDistance: 3,
      description: `Bank services for ${data.townId}`,
      model: null,
      properties: {
        // Base entity properties (null for non-combatant entities)
        movementComponent: null,
        combatComponent: null,
        healthComponent: null,
        visualComponent: null,
        health: 1,
        maxHealth: 1,
        level: 1,
        // Bank-specific properties
        bankId: data.bankId,
        townId: data.townId
      },
      storage: {
        capacity: data.capacity || 1000, // Unlimited slots per GDD
        accessType: 'private', // Each player has their own bank space
        requiresPermission: false,
        persistenceKey: `bank_${data.bankId}`,
        categories: [], // Banks can store any item type
        restrictions: {
          maxStackSize: 1000,
          blockedItems: [], // Banks accept all items
          allowedItems: [] // Empty = allow all
        }
      }
    };
    
    super(world, config);
    
    // Initialize bank-specific properties
    this.bankId = data.bankId;
    this.townId = data.townId;
    this.capacity = data.capacity || 1000;
    this.interactionDistance = data.interactionDistance || 3.0;
    
    // Add bank-specific ECS components (storage/interaction handled by StorageEntity)
    this.addComponent('banking', {
      bankId: this.bankId,
      townId: this.townId,
      isOpen: false,
      currentUser: null
    });
    
    this.addComponent('building', {
      type: 'bank',
      townId: this.townId,
      isPublic: true,
      operatingHours: 'always', // Banks are always open per GDD
      services: ['item_storage', 'item_retrieval']
    });
  }

  /**
   * Create the bank building's visual representation - implements RPGEntity.createMesh
   */
  protected async createMesh(): Promise<void> {
    // Create main building group
    const bankGroup = new THREE.Group();
    bankGroup.userData.entity = this;
    bankGroup.userData.entityType = 'bank';
    bankGroup.userData.bankId = this.bankId;
    bankGroup.userData.townId = this.townId;
    
    // Main building structure (brown wooden building)
    const buildingGeometry = new THREE.BoxGeometry(4, 3, 3);
    const buildingMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x8B4513, // Brown wood
      shininess: 0,
      side: THREE.FrontSide
    });
    const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
    buildingMesh.position.y = 1.5;
    buildingMesh.castShadow = true;
    buildingMesh.receiveShadow = true;
    bankGroup.add(buildingMesh);
    
    // Bank vault/chest (symbolic storage)
    const chestGeometry = new THREE.BoxGeometry(1.5, 1, 1);
    const chestMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4A4A4A, // Dark gray metal
      metalness: 0.8,
      roughness: 0.2
    });
    this.chestMesh = new THREE.Mesh(chestGeometry, chestMaterial);
    this.chestMesh.position.set(0, 0.5, 1.8);
    this.chestMesh.castShadow = true;
    this.chestMesh.receiveShadow = true;
    bankGroup.add(this.chestMesh);
    
    // Gold accents on vault chest
    const accentGeometry = new THREE.BoxGeometry(1.6, 0.2, 1.1);
    const accentMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFD700, // Gold
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x332200,
      emissiveIntensity: 0.1
    });
    const accentMesh = new THREE.Mesh(accentGeometry, accentMaterial);
    accentMesh.position.set(0, 0.9, 1.8);
    accentMesh.castShadow = true;
    bankGroup.add(accentMesh);
    
    // Bank entrance (door area)
    const doorGeometry = new THREE.BoxGeometry(1.2, 2.2, 0.1);
    const doorMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x654321, // Dark brown
      shininess: 10
    });
    const doorMesh = new THREE.Mesh(doorGeometry, doorMaterial);
    doorMesh.position.set(0, 1.1, 1.55);
    bankGroup.add(doorMesh);
    
    // Create bank sign
    this.createBankSign(bankGroup);
    
    // Create interaction area marker (invisible trigger zone)
    const triggerGeometry = new THREE.CylinderGeometry(this.interactionDistance, this.interactionDistance, 0.1);
    const triggerMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00, 
      transparent: true, 
      opacity: 0, // Invisible
      visible: false
    });
    const triggerMesh = new THREE.Mesh(triggerGeometry, triggerMaterial);
    triggerMesh.position.y = 0.05;
    triggerMesh.userData.interactionTrigger = true;
    bankGroup.add(triggerMesh);
    
    this.buildingMesh = bankGroup;
    this.mesh = bankGroup as unknown as THREE.Object3D; // Set main mesh for RPGEntity
    
    // Add building group to the entity's node
    this.node.add(bankGroup);

    // Add mesh component to ECS
    this.addComponent('mesh', {
      mesh: bankGroup,
      geometry: buildingGeometry,
      material: buildingMaterial,
      castShadow: true,
      receiveShadow: true
    });
  }

  /**
   * Create the bank sign with text
   */
  private createBankSign(container: THREE.Group): void {
    // Create sign background
    const signGeometry = new THREE.PlaneGeometry(2.5, 1);
    const signMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xF5F5DC, // Beige
      side: THREE.DoubleSide,
      shininess: 5
    });
    const signBackground = new THREE.Mesh(signGeometry, signMaterial);
    signBackground.position.set(0, 3.5, 1.52);
    signBackground.rotation.x = -0.1; // Slight tilt
    container.add(signBackground);
    
    // Create sign text using canvas texture
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 400;
    canvas.height = 160;
    
    // Draw sign text
    context.fillStyle = '#F5F5DC'; // Beige background
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Bank name
    context.fillStyle = '#8B4513'; // Brown text
    context.font = 'bold 36px serif';
    context.textAlign = 'center';
    context.fillText('BANK', canvas.width / 2, 60);
    
    // Town name
    context.font = '24px serif';
    context.fillText(`${this.townId.replace('_', ' ').toUpperCase()}`, canvas.width / 2, 100);
    
    // Services text
    context.font = '16px serif';
    context.fillText('Safe Item Storage', canvas.width / 2, 130);
    
    // Create sign text texture
    const signTexture = new THREE.CanvasTexture(canvas);
    const signTextMaterial = new THREE.SpriteMaterial({ 
      map: signTexture, 
      transparent: true,
      alphaTest: 0.1
    });
    const signSprite = new THREE.Sprite(signTextMaterial);
    signSprite.scale.set(2.4, 0.96, 1);
    signSprite.position.set(0, 3.5, 1.53);
    
    this.signMesh = signSprite;
    container.add(signSprite);
  }

  /**
   * Handle interactions with the bank - extends StorageEntity.onInteract
   */
  protected async onInteract(data: EntityInteractionData): Promise<void> {
    // Call parent StorageEntity onInteract for basic storage handling
    await super.onInteract(data);
    
    // Bank-specific interaction handling
    if (data.interactionType === 'use' || !data.interactionType) {
      // Visual feedback - chest opens slightly when accessed
      if (this.chestMesh && this.canAccess(data.playerId)) {
        this.chestMesh.rotation.x = -0.3; // Tilt to show "open"
      }
      
      // Emit bank-specific event
      this.emit('bank-interaction', {
        bankId: this.bankId,
        playerId: data.playerId,
        townId: this.townId,
        action: 'open'
      });
    }
  }

  // Bank-specific methods that can be called by Systems

  /**
   * Open bank interface for a player - wrapper around StorageEntity.addUser
   */
  public openBank(playerId: string): boolean {
    const success = this.addUser(playerId);
    
    if (success) {
      // Update banking component
      const bankingComponent = this.getComponent('banking');
      if (bankingComponent) {
        bankingComponent.data.isOpen = true;
        bankingComponent.data.currentUser = playerId;
      }
      
      // Visual feedback - chest opens slightly
      if (this.chestMesh) {
        this.chestMesh.rotation.x = -0.3; // Tilt to show "open"
      }
      
      // Emit bank opened event
      this.emit('bank-opened', {
        bankId: this.bankId,
        playerId: playerId,
        townId: this.townId
      });
    }
    
    return success;
  }

  /**
   * Close bank interface for a player - wrapper around StorageEntity.removeUser
   */
  public closeBank(playerId: string): void {
    // Remove user from storage system
    this.removeUser(playerId);
    
    // Update banking component
    const bankingComponent = this.getComponent('banking');
    if (bankingComponent && bankingComponent.data.currentUser === playerId) {
      bankingComponent.data.isOpen = false;
      bankingComponent.data.currentUser = null;
    }
    
    // Visual feedback - chest closes
    if (this.chestMesh) {
      this.chestMesh.rotation.x = 0; // Return to closed position
    }
    
    // Emit bank closed event
    this.emit('bank-closed', {
      bankId: this.bankId,
      playerId: playerId,
      townId: this.townId
    });
  }

  // canInteract removed - use StorageEntity.canAccess instead

  /**
   * Get bank status information
   */
  public getBankStatus() {
    const bankingComponent = this.getComponent('banking');
    return {
      bankId: this.bankId,
      townId: this.townId,
      position: this.position,
      capacity: this.capacity,
      isOpen: bankingComponent?.data.isOpen || false,
      currentUser: bankingComponent?.data.currentUser || null,
      interactionDistance: this.interactionDistance
    };
  }

  /**
   * Store bank items for a player - converts BankStorageItem to InventoryItem for StorageEntity
   */
  public storeBankItems(playerId: string, items: BankStorageItem[]): boolean {
    // Convert BankStorageItem to InventoryItem format expected by StorageEntity
    const rpgItems: InventoryItem[] = items.map((item, index) => ({
      id: `${item.id}_${Date.now()}_${index}`, // Unique instance ID
      itemId: item.id, // Reference to base item
      quantity: 1, // Each BankStorageItem is individual
      slot: index, // Assign slot position
      metadata: {
        storedAt: Date.now(),
        bankId: this.bankId,
        originalItemId: item.id
      }
    }));
    
    // Use parent storage method
    const result = super.storeItems(rpgItems, playerId);
    
    if (result.success) {
      // Emit bank-specific storage event
      this.emit('items-stored', {
        bankId: this.bankId,
        playerId: playerId,
        items: items,
        totalItems: this.getTotalItemCount(playerId)
      });
    }
    
    return result.success;
  }

  /**
   * Retrieve bank items for a player - converts StorageSlot back to BankStorageItem
   */
  public retrieveBankItems(playerId: string, itemIds: string[]): BankStorageItem[] {
    // Use parent storage method
    const result = super.retrieveItems(itemIds, playerId);
    
    if (!result.success) {
      return [];
    }
    
    // Convert retrieved items back to BankStorageItem format
    const bankItems: BankStorageItem[] = result.retrievedItems
      .map(item => {
        // Get bank metadata with proper typing
        if (isBankItemMetadata(item.metadata)) {
          const bankMetadata = item.metadata;
          // Note: This is a simplified approach - in a full implementation,
          // you would need to fetch the full item data from the item registry
          return {
            id: bankMetadata.originalItemId,
            storedAt: bankMetadata.storedAt,
            bankId: this.bankId
          } as BankStorageItem;
        }
        
        // Fallback: create BankStorageItem from available data
        return {
          id: item.id,
          name: 'Unknown Item',
          type: 'misc',
          stackable: false,
          value: 0,
          storedAt: Date.now(), // No metadata available, use current time
          bankId: this.bankId
        } as BankStorageItem;
      });
    
    // Emit bank-specific retrieval event
    this.emit('items-retrieved', {
      bankId: this.bankId,
      playerId: playerId,
      items: bankItems,
      remainingItems: this.getTotalItemCount(playerId)
    });
    
    return bankItems;
  }

  /**
   * Get all items stored by a player - converts from StorageEntity format
   */
  public getPlayerItems(playerId: string): BankStorageItem[] {
    // Use parent storage method
    const storageContents = super.getStorageContents(playerId);
    
    // Convert StorageSlot to BankStorageItem format
    return storageContents.map(slot => {
      // Get bank metadata with proper typing
      if (isBankItemMetadata(slot.metadata)) {
        const bankMetadata = slot.metadata;
        return {
          id: bankMetadata.originalItemId,
          storedAt: bankMetadata.storedAt,
          bankId: this.bankId
        } as BankStorageItem;
      }
      
      // Fallback: create BankStorageItem from slot data  
      return {
        id: slot.itemId,
        name: 'Unknown Item',
        type: 'misc',
        stackable: false,
        value: 0,
        storedAt: Date.now(), // No metadata available, use current time
        bankId: this.bankId
      } as BankStorageItem;
    });
  }

  /**
   * Clean up when entity is destroyed
   */
  public destroy(): void {
    
    // Clean up visual elements
    if (this.signMesh) {
      this.signMesh.removeFromParent();
      this.signMesh = null;
    }
    if (this.buildingMesh) {
      this.buildingMesh.removeFromParent();
      this.buildingMesh = null;
    }
    if (this.chestMesh) {
      this.chestMesh.removeFromParent();
      this.chestMesh = null;
    }
    
    // Call parent destroy
    super.destroy();
  }
}