/**
 * @deprecated BaseEntity is deprecated - use Entity instead
 * 
 * This class has been consolidated into Entity for better inheritance hierarchy.
 * All functionality from BaseEntity has been moved to Entity.
 * This file will be removed in a future version.
 * 
 * @see Entity for the new base class for all entities
 */

import { Entity } from './Entity';
import * as THREE from '../extras/three';
import type { World } from '../World';
import { GAME_CONSTANTS } from '../constants/GameConstants';
import type { BaseEntityData } from '../types/entities';
import { MeshFactory } from '../utils/MeshFactory';
import { UIRenderer } from '../utils/UIRenderer';

export abstract class BaseEntity extends Entity {
  public data: BaseEntityData;
  protected health: number;
  protected maxHealth: number;
  protected level: number;
  public mesh: THREE.Mesh | THREE.Group | THREE.Object3D | null = null;
  protected nameSprite: THREE.Sprite | null = null;
  protected healthSprite: THREE.Sprite | null = null;

  constructor(world: World, data: BaseEntityData) {
    super(world, data);
    
    this.data = data;
    this.health = data.health || GAME_CONSTANTS.PLAYER.DEFAULT_HEALTH;
    this.maxHealth = data.maxHealth || GAME_CONSTANTS.PLAYER.DEFAULT_MAX_HEALTH;
    this.level = data.level || 1;
    
    // Set initial position if provided
    if (data.position) {
      this.position.x = data.position[0];
      this.position.y = data.position[1];
      this.position.z = data.position[2];
    }
    
    // Set initial quaternion if provided (rotation property returns a quaternion-like object)
    if (data.quaternion) {
      this.rotation.set(
        data.quaternion[0],
        data.quaternion[1],
        data.quaternion[2],
        data.quaternion[3]
      );
    }
  }

  /**
   * Initialize common components - called by subclasses
   */
  protected initializeComponents(): void {
    this.addHealthComponent();
    this.addCombatComponent();
    this.addVisualComponent();
  }

  /**
   * Add health component with standard properties
   */
  protected addHealthComponent(): void {
    this.addComponent('health', {
      current: this.health,
      max: this.maxHealth,
      regenerationRate: GAME_CONSTANTS.PLAYER.HEALTH_REGEN_RATE,
      isDead: false
    });
  }

  /**
   * Add combat component with standard properties
   */
  protected addCombatComponent(): void {
    this.addComponent('combat', {
      isInCombat: false,
      target: null,
      lastAttackTime: 0,
      attackCooldown: GAME_CONSTANTS.COMBAT.ATTACK_COOLDOWN,
      damage: GAME_CONSTANTS.COMBAT.DEFAULT_DAMAGE,
      range: GAME_CONSTANTS.COMBAT.MELEE_RANGE
    });
  }

  /**
   * Add visual component with mesh and UI sprites
   */
  protected addVisualComponent(): void {
    this.addComponent('visual', {
      mesh: null,
      nameSprite: null,
      healthSprite: null,
      isVisible: true
    });
  }

  /**
   * Create the main mesh for this entity - implemented by subclasses
   */
  protected abstract createMesh(): Promise<void>;

  /**
   * Initialize visual elements (mesh, name tag, health bar)
   */
  protected async initializeVisuals(): Promise<void> {
    // Create main mesh
    await this.createMesh();
    if (this.mesh) {
      if (this.mesh.type === 'Mesh') {
        if (this.mesh instanceof THREE.Mesh) {
          MeshFactory.setupGameMesh(this.mesh, this.data.name || this.id);
        }
      }
      // Add mesh to scene
      if (this.world.stage.scene) {
        this.world.stage.scene.add(this.mesh);
      }
    }

    // Create name tag if entity has a name
    if (this.data.name) {
      this.createNameTag();
    }

    // Create health bar for entities with health
    if (this.maxHealth > 0) {
      this.createHealthBar();
    }

    // Update visual component
    const visualComponent = this.getComponent('visual');
    if (visualComponent && visualComponent.data) {
      visualComponent.data.mesh = this.mesh;
      visualComponent.data.nameSprite = this.nameSprite;
      visualComponent.data.healthSprite = this.healthSprite;
    }
  }

  /**
   * Create name tag sprite
   */
  protected createNameTag(): void {
    if (!this.data.name) return;

    const nameCanvas = UIRenderer.createNameTag(this.data.name, {
      width: GAME_CONSTANTS.UI.NAME_TAG_WIDTH,
      height: GAME_CONSTANTS.UI.NAME_TAG_HEIGHT
    });

    this.nameSprite = UIRenderer.createSpriteFromCanvas(nameCanvas, GAME_CONSTANTS.UI.SPRITE_SCALE);
    this.nameSprite.position.set(0, 2.5, 0); // Position above the entity
    if (this.world.stage.scene) {
      this.world.stage.scene.add(this.nameSprite);
    }
  }

  /**
   * Create health bar sprite
   */
  protected createHealthBar(): void {
    const healthCanvas = UIRenderer.createHealthBar(this.health, this.maxHealth, {
      width: GAME_CONSTANTS.UI.HEALTH_BAR_WIDTH,
      height: GAME_CONSTANTS.UI.HEALTH_BAR_HEIGHT
    });

    this.healthSprite = UIRenderer.createSpriteFromCanvas(healthCanvas, GAME_CONSTANTS.UI.SPRITE_SCALE);
    this.healthSprite.position.set(0, 2.0, 0); // Position above the entity, below name tag
    if (this.world.stage.scene) {
      this.world.stage.scene.add(this.healthSprite);
    }
  }

  /**
   * Update health and refresh health bar
   */
  public setHealth(newHealth: number): void {
    this.health = Math.max(0, Math.min(this.maxHealth, newHealth));
    
    // Update health component
    const healthComponent = this.getComponent('health');
    if (healthComponent && healthComponent.data) {
      healthComponent.data.current = this.health;
      healthComponent.data.isDead = this.health <= 0;
    }

    // Update health bar visual
    this.updateHealthBar();

    // Emit health change event
    this.world.emit('entity:health_changed', {
      entityId: this.id,
      health: this.health,
      maxHealth: this.maxHealth,
      isDead: this.health <= 0
    });
  }

  /**
   * Update health bar sprite
   */
  protected updateHealthBar(): void {
    if (!this.healthSprite) return;

    const healthCanvas = UIRenderer.createHealthBar(this.health, this.maxHealth, {
      width: GAME_CONSTANTS.UI.HEALTH_BAR_WIDTH,
      height: GAME_CONSTANTS.UI.HEALTH_BAR_HEIGHT
    });

    UIRenderer.updateSpriteTexture(this.healthSprite, healthCanvas);
  }

  /**
   * Damage this entity
   */
  public damage(amount: number, source?: string): boolean {
    if (this.health <= 0) return false;

    const newHealth = this.health - amount;
    this.setHealth(newHealth);

    // Emit damage event
    this.world.emit('entity:damaged', {
      entityId: this.id,
      damage: amount,
      sourceId: source,
      remainingHealth: this.health,
      isDead: this.health <= 0
    });

    return true;
  }

  /**
   * Heal this entity
   */
  public heal(amount: number): boolean {
    if (this.health >= this.maxHealth) return false;

    const newHealth = this.health + amount;
    this.setHealth(newHealth);

    // Emit heal event
    this.world.emit('entity:healed', {
      entityId: this.id,
      healAmount: amount,
      newHealth: this.health
    });

    return true;
  }

  /**
   * Check if entity is alive
   */
  public isAlive(): boolean {
    return this.health > 0;
  }

  /**
   * Check if entity is dead
   */
  public isDead(): boolean {
    return this.health <= 0;
  }

  /**
   * Get entity's current health
   */
  public getHealth(): number {
    return this.health;
  }

  /**
   * Get entity's maximum health
   */
  public getMaxHealth(): number {
    return this.maxHealth;
  }

  /**
   * Get entity's level
   */
  public getLevel(): number {
    return this.level;
  }

  /**
   * Set entity level
   */
  public setLevel(newLevel: number): void {
    this.level = Math.max(1, newLevel);
    
    // Emit level change event
    this.world.emit('entity:level_changed', {
      entityId: this.id,
      newLevel: this.level
    });
  }

  /**
   * Get entity's main mesh
   */
  public getMesh(): THREE.Mesh | THREE.Group | THREE.Object3D | null {
    return this.mesh;
  }

  /**
   * Show/hide entity visuals
   */
  public setVisible(visible: boolean): void {
    if (this.mesh) this.mesh.visible = visible;
    if (this.nameSprite) this.nameSprite.visible = visible;
    if (this.healthSprite) this.healthSprite.visible = visible;

    const visualComponent = this.getComponent('visual');
    if (visualComponent && visualComponent.data) {
      visualComponent.data.isVisible = visible;
    }
  }

  /**
   * Clean up entity resources
   */
  public destroy(): void {
    // Remove sprites and meshes
    if (this.nameSprite && this.world.stage.scene) {
      this.world.stage.scene.remove(this.nameSprite);
      if (this.nameSprite.material instanceof THREE.SpriteMaterial && this.nameSprite.material.map) {
        this.nameSprite.material.map.dispose();
      }
      this.nameSprite.material.dispose();
    }

    if (this.healthSprite && this.world.stage.scene) {
      this.world.stage.scene.remove(this.healthSprite);
      if (this.healthSprite.material instanceof THREE.SpriteMaterial && this.healthSprite.material.map) {
        this.healthSprite.material.map.dispose();
      }
      this.healthSprite.material.dispose();
    }

    if (this.mesh && this.world.stage.scene) {
      this.world.stage.scene.remove(this.mesh);
      if (this.mesh instanceof THREE.Mesh) {
        this.mesh.geometry.dispose();
        if (Array.isArray(this.mesh.material)) {
          this.mesh.material.forEach(material => material.dispose());
        } else {
          this.mesh.material.dispose();
        }
      }
    }

    // Call parent destroy
    super.destroy();
  }

  /**
   * Serialize entity data for network sync
   */
  public serialize(): BaseEntityData {
    return {
      id: this.id,
      type: this.data.type,
      name: this.data.name,
      level: this.level,
      health: this.health,
      maxHealth: this.maxHealth,
      position: [this.position.x, this.position.y, this.position.z],
      quaternion: [this.rotation.x, this.rotation.y, this.rotation.z, this.rotation.w]
    };
  }
}