/**
 * HeadstoneEntity - Represents a player's death location with dropped items
 */

import THREE from '../extras/three';
import type { World } from '../World';
import { EventType } from '../types/events';
import type { InventoryItem } from '../types/core';
import type { EntityInteractionData, HeadstoneData, HeadstoneEntityConfig } from '../types/entities';
import { Entity } from './Entity';

export class HeadstoneEntity extends Entity {
  public config: HeadstoneEntityConfig;
  private headstoneData: HeadstoneData;

  constructor(world: World, config: HeadstoneEntityConfig) {
    super(world, config);
    this.config = config;
    this.headstoneData = config.headstoneData;
  }

  protected async onInteract(data: EntityInteractionData): Promise<void> {
    if (data.interactionType !== 'loot') return;
    
    // Only the player who died can loot their own headstone
    if (data.playerId !== this.headstoneData.playerId) {
      return;
    }

    // Send loot request to death system
    this.world.emit(EventType.DEATH_LOOT_HEADSTONE, {
      playerId: data.playerId,
      headstoneId: this.id,
      items: this.headstoneData.items
    });
  }

  protected async createMesh(): Promise<void> {
    // Create headstone visual (tombstone shape)
    const geometry = new THREE.BoxGeometry(0.5, 1.2, 0.2);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x555555, // Dark gray stone
      roughness: 0.8,
      metalness: 0.1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    this.mesh = mesh;
    this.mesh!.position.y = 0.6; // Raise it above ground
    this.mesh!.castShadow = true;
    this.mesh!.receiveShadow = true;
    
    // Add inscription (player name)
    this.createInscription();
  }

  private createInscription(): void {
    if (!this.mesh) return;

    // Create inscription using canvas texture
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 200;
    canvas.height = 100;
    
    // Draw inscription background
    context.fillStyle = '#555555';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw text
    context.fillStyle = '#ffffff';
    context.font = 'bold 16px serif';
    context.textAlign = 'center';
    context.fillText('R.I.P.', canvas.width / 2, 30);
    context.font = '12px serif';
    context.fillText(this.headstoneData.playerName, canvas.width / 2, 50);
    context.fillText(`${this.headstoneData.itemCount} items`, canvas.width / 2, 70);
    
    // Create texture and apply to plane
    const texture = new THREE.CanvasTexture(canvas);
    const inscriptionMaterial = new THREE.MeshStandardMaterial({ 
      map: texture,
      transparent: true 
    });
    
    const inscriptionGeometry = new THREE.PlaneGeometry(0.4, 0.2);
    const inscriptionMesh = new THREE.Mesh(inscriptionGeometry, inscriptionMaterial);
    inscriptionMesh.position.set(0, 0.3, 0.11); // Slightly in front of headstone
    
    this.mesh.add(inscriptionMesh);
  }

  public getHeadstoneData(): HeadstoneData {
    return this.headstoneData;
  }

  public removeItem(itemId: string): boolean {
    const itemIndex = this.headstoneData.items.findIndex(item => item.id === itemId);
    if (itemIndex !== -1) {
      this.headstoneData.items.splice(itemIndex, 1);
      this.headstoneData.itemCount = this.headstoneData.items.length;
      this.markNetworkDirty();
      return true;
    }
    return false;
  }

  public getAllItems(): InventoryItem[] {
    return [...this.headstoneData.items];
  }

  public isEmpty(): boolean {
    return this.headstoneData.items.length === 0;
  }

  public isExpired(): boolean {
    return Date.now() > this.headstoneData.despawnTime;
  }

  public getNetworkData(): Record<string, unknown> {
    return {
      ...super.getNetworkData(),
      headstoneData: this.headstoneData
    };
  }
}