/**
 * RPGEntity - Server-authoritative entity system replacing RPGApp
 * No sandboxing, no UGC, full server control over all game entities
 */

import { Entity } from '../../core/entities/Entity';
import * as THREE from '../../core/extras/three';
import type { World } from '../../core/World';
import type { EntityData } from '../../types';
import { EventType } from '../../types/events';
import { GAME_CONSTANTS } from '../constants/GameConstants';
import type { MeshUserData, Position3D } from '../types/core';
import type { EntityInteractionData, RPGEntityConfig } from '../types/entities';
import { toPosition3D } from '../types/utilities';
import { UIRenderer } from '../utils/UIRenderer';

// Re-export types for external use
export type { RPGEntityConfig };

// Type alias for event callbacks
type EventCallback = (data: unknown) => void;



export abstract class RPGEntity extends Entity {
  protected config: RPGEntityConfig;
  public mesh: THREE.Object3D | null = null;

  public nodes: Map<string, THREE.Object3D> = new Map(); // Child nodes by ID
  public worldNodes: Set<THREE.Object3D> = new Set(); // Nodes added to world
  public listeners: Record<string, Set<EventCallback>> = {}; // Event listeners
  public worldListeners: Map<EventCallback, string> = new Map(); // World event listeners
  protected lastUpdate = 0;
  
  // RPG-specific properties merged from BaseEntity
  protected health: number = 0;
  protected maxHealth: number = 100;
  protected level: number = 1;
  
  // UI elements from BaseEntity
  protected nameSprite: THREE.Sprite | null = null;
  protected healthSprite: THREE.Sprite | null = null;
  
  // Entity.data is inherited from parent class
  
  /**
   * Initialize common RPG components - merged from BaseEntity
   */
  protected initializeRPGComponents(): void {
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
   * Initialize visual elements (mesh, name tag, health bar) - from BaseEntity
   */
  protected initializeVisuals(): void {
    // Create main mesh - implemented by subclasses
    // Note: createMesh is async in RPGEntity, so this will be called from init()
    
    // Create name tag if entity has a name
    if (this.name) {
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
   * Create name tag sprite using UIRenderer - from BaseEntity
   */
  protected createNameTag(): void {
    if (!this.name) return;

    const nameCanvas = UIRenderer.createNameTag(this.name, {
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
   * Create health bar sprite using UIRenderer - from BaseEntity
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
   * Update health bar sprite - from BaseEntity
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
   * Update health and refresh health bar - from BaseEntity
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
   * Damage this entity - from BaseEntity
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
   * Heal this entity - from BaseEntity
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
   * Check if entity is alive - from BaseEntity
   */
  public isAlive(): boolean {
    return this.health > 0;
  }

  /**
   * Check if entity is dead - from BaseEntity
   */
  public isDead(): boolean {
    return this.health <= 0;
  }

  /**
   * Get entity's current health - from BaseEntity
   */
  public getHealth(): number {
    return this.health;
  }

  /**
   * Get entity's maximum health - from BaseEntity
   */
  public getMaxHealth(): number {
    return this.maxHealth;
  }

  /**
   * Get entity's level - from BaseEntity
   */
  public getLevel(): number {
    return this.level;
  }

  /**
   * Set entity level - from BaseEntity
   */
  public setLevel(newLevel: number): void {
    this.level = Math.max(1, newLevel);
    
    // Emit level change event
    this.world.emit('entity:level_changed', {
      entityId: this.id,
      newLevel: this.level
    });
  }
  
  // Position getter/setter compatibility methods for Position3D
  public getPosition(): Position3D {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z
    };
  }
  
  public setPosition(posOrX: Position3D | number, y?: number, z?: number): void {
    if (typeof posOrX === 'object') {
      this.position.set(posOrX.x, posOrX.y, posOrX.z);
      this.config.position = { x: posOrX.x, y: posOrX.y, z: posOrX.z };
    } else {
      this.position.set(posOrX, y!, z!);
      this.config.position = { x: posOrX, y: y!, z: z! };
    }
    // Position is already set via this.position, no sync needed
    this.markNetworkDirty();
  }
  
  // Rotation getter/setter for compatibility - removed to prevent infinite recursion
  // Direct access to inherited rotation property is available

  // Network state
  public networkDirty = false; // Needs network sync
  public networkVersion = 0; // Version for conflict resolution

  // Interpolation state
  protected networkPos?: Position3D;
  protected networkQuat?: THREE.Quaternion;
  protected networkSca?: Position3D;

  constructor(world: World, config: RPGEntityConfig) {
    // Validate position to prevent NaN values
    const validX = (typeof config.position.x === 'number' && !isNaN(config.position.x)) ? config.position.x : 0;
    const validY = (typeof config.position.y === 'number' && !isNaN(config.position.y)) ? config.position.y : 0;
    const validZ = (typeof config.position.z === 'number' && !isNaN(config.position.z)) ? config.position.z : 0;
    
    // Silently handle invalid positions
    
    // Convert RPGEntityConfig to EntityData format for parent constructor
    const entityData: EntityData = {
      id: config.id,
      name: config.name,
      type: config.type,
      position: [validX, validY, validZ],
      quaternion: config.rotation ? [config.rotation.x, config.rotation.y, config.rotation.z, 1] : undefined,
      scale: config.scale ? [config.scale.x, config.scale.y, config.scale.z] : undefined
    };
    
    // Call parent Entity constructor
    super(world, entityData);
    
    this.config = { ...config };
    
    // Set up userData with proper typing - merge with existing userData
    const userData: MeshUserData = {
      type: this.config.type,
      entityId: this.id,
      name: this.config.name,
      interactable: this.config.interactable,
      mobData: null, // Most entities are not mobs, override in MobEntity
      ...this.node.userData // Preserve any existing userData
    };
    this.node.userData = userData;
    
    // Initialize RPG-specific properties
    this.health = config.properties?.health as number || GAME_CONSTANTS.PLAYER.DEFAULT_HEALTH;
    this.maxHealth = config.properties?.maxHealth as number || GAME_CONSTANTS.PLAYER.DEFAULT_MAX_HEALTH;
    this.level = config.properties?.level as number || 1;
    
    // Initialize common RPG components
    this.initializeRPGComponents();
  }

  async init(): Promise<void> {
    // Entity is already initialized by parent constructor
    // Just add RPG-specific initialization
    
    try {
      // Create the visual representation
      await this.createMesh();

      // Initialize UI elements (name tag, health bar) - only on client
      if (this.world.isClient) {
        this.initializeVisuals();
      }

      // Load model if specified
      if (this.config.model) {
        await this.loadModel();
      }

      // Note: Entity constructor already adds node to scene

      // Set up interaction system
      this.setupInteraction();

      // Call custom initialization
      await this.onInit();

    } catch (error) {
      console.error(`Failed to initialize RPGEntity ${this.id}:`, error);
      throw error;
    }
  }

  protected async loadModel(): Promise<void> {
    if (!this.config.model || !this.world.loader) return;
    
    // Skip model loading on server side - models are only needed for client rendering
    if (this.world.isServer) return;

    try {
      // Determine file type from extension
      const extension = this.config.model.split('.').pop()?.toLowerCase();
      const modelType = extension === 'vrm' ? 'vrm' : 'model';

      // Load the model
      const modelObject = await this.world.loader.load(modelType, this.config.model) as unknown as THREE.Object3D;
      
      if (modelObject) {
        // Clear existing mesh
        if (this.mesh) {
          this.node.remove(this.mesh);
        }

        this.mesh = modelObject;
        if (this.mesh) {
          this.mesh.name = `${this.name}_Model`;
        }
        
        // Set up userData with proper typing
        const userData: MeshUserData = {
          ...this.node.userData as MeshUserData,
          type: this.config.type,
          entityId: this.id,
          interactable: this.config.interactable
        };
        if (this.mesh) {
          this.mesh.userData = userData;

          // Collect all child nodes
          this.collectNodes(this.mesh);

          // Add to node
          this.node.add(this.mesh);
        }
      }
    } catch (error) {
      console.error(`Failed to load model for entity ${this.id}:`, error);
    }
  }

  protected collectNodes(node: THREE.Object3D): void {
    if (node.name) {
      this.nodes.set(node.name, node);
    }

    node.children.forEach(child => {
      this.collectNodes(child as THREE.Object3D);
    });
  }

  // Abstract methods to be implemented by subclasses
  protected abstract createMesh(): Promise<void>;

  // Default interaction handler - can be overridden
  protected abstract onInteract(data: EntityInteractionData): Promise<void>;

  // Custom initialization hook
  protected async onInit(): Promise<void> {
    // Override in subclasses if needed
  }

  private setupInteraction(): void {
    if (!this.config.interactable) return;

    // Set up interaction target with proper typing
    const target = this.mesh || this.node;
    const userData: MeshUserData = {
      ...(target.userData as MeshUserData || {}),
      type: this.config.type,
      entityId: this.id,
      name: this.config.name,
      interactable: true,
      mobData: null // Default - subclasses can override if needed
    };
    target.userData = userData;

    // Add interaction distance if specified
    if (this.config.interactionDistance) {
      userData.interactionDistance = this.config.interactionDistance;
    }

    // Add interaction type if specified
    if (this.config.interactionType) {
      userData.interactionType = this.config.interactionType;
    }

    // Listen for interaction events
    this.world.on(EventType.ENTITY_INTERACT, async (data: EntityInteractionData) => {
      if (data.entityId === this.id) {
        await this.onInteract(data);
      }
    });
  }

  update(deltaTime: number): void {
    if (this.destroyed) return;

    const now = this.world.getTime();
    if (now - this.lastUpdate < 16) return; // Limit to ~60fps
    this.lastUpdate = now;

    // Update based on client/server
    if (this.world.isServer) {
      this.serverUpdate(deltaTime);
    } else {
      this.clientUpdate(deltaTime);
    }
  }

  // Server-side update logic
  protected serverUpdate(_deltaTime: number): void {
    // Override in subclasses for server-specific logic
  }

  // Client-side update logic
  protected clientUpdate(_deltaTime: number): void {
    // Override in subclasses for client-specific logic
  }

  // Fixed timestep update (for physics, etc.)
  fixedUpdate(deltaTime: number): void {
    if (this.destroyed) return;

    if (this.world.isServer) {
      this.serverFixedUpdate(deltaTime);
    }
  }

  // Server fixed update
  protected serverFixedUpdate(_deltaTime: number): void {
    // Override in subclasses
  }

  // Mark this entity as needing network sync
  markNetworkDirty(): void {
    if (this.world.isServer) {
      this.networkDirty = true;
      this.networkVersion++;
    }
  }

  // Get data for network synchronization
  getNetworkData(): Record<string, unknown> {
    const position = toPosition3D(this.node.position);
    const rotation = this.node.quaternion;
    const scale = { x: this.node.scale.x, y: this.node.scale.y, z: this.node.scale.z };

    return {
      id: this.id,
      type: this.type,
      name: this.name,
      position,
      rotation,
      scale,
      visible: this.node.visible,
      networkVersion: this.networkVersion,
      properties: this.config.properties || {}
    };
  }

  // Apply network data (client-side)
  applyNetworkData(data: Record<string, unknown>): void {
    if (this.world.isServer) return;
    if ((data.networkVersion as number) <= this.networkVersion) return;

    this.networkVersion = data.networkVersion as number;

    // Transform is now handled directly by Entity base class
    // No longer reading position/rotation/scale from EntityData

    if (typeof data.visible === 'boolean') {
      this.node.visible = data.visible;
    }

    // Update properties
    if (data.properties && typeof data.properties === 'object') {
      this.config.properties = { ...this.config.properties, ...data.properties };
    }
  }

  // Position management - keeping the overloaded version above

  getDistanceTo(point: Position3D): number {
    const pos = this.getPosition();
    const dx = pos.x - point.x;
    const dy = pos.y - point.y;
    const dz = pos.z - point.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  isPlayerInRange(playerPosition: Position3D): boolean {
    const distance = this.getDistanceTo(playerPosition);
    return distance <= (this.config.interactionDistance || 5);
  }

  // Handle interaction request
  async handleInteraction(data: EntityInteractionData): Promise<void> {
    if (!this.config.interactable) return;

    // Check if player is in range
    if (!this.isPlayerInRange(data.playerPosition)) {
      this.world.emit('entity:interaction:failed', {
        entityId: this.id,
        playerId: data.playerId,
        reason: 'out_of_range'
      });
      return;
    }

    // Call the interaction handler
    await this.onInteract(data);
  }

  // Property management
  getProperty<T>(key: string, defaultValue?: T): T {
    return (this.config.properties?.[key] ?? defaultValue) as T;
  }

  setProperty(key: string, value: unknown): void {
    if (!this.config.properties) {
      this.config.properties = {
        movementComponent: null,
        combatComponent: null,
        healthComponent: null,
        visualComponent: null,
        health: this.health,
        maxHealth: this.maxHealth,
        level: 1
      };
    }
    this.config.properties[key] = value;
    this.markNetworkDirty();
  }

  // Event system
  on<T>(event: string, callback: (data: T) => void): void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event].add(callback as EventCallback);
  }

  off<T>(event: string, callback: (data: T) => void): void {
    this.listeners[event]?.delete(callback as EventCallback);
  }

  emit<T>(event: string, data: T): void {
    this.listeners[event]?.forEach(callback => {
      try { callback(data); } catch (error) { console.error('Entity event error:', error); }
    });
  }

  // Visibility
  setVisible(visible: boolean): void {
    this.node.visible = visible;
    this.config.visible = visible;
    this.markNetworkDirty();
  }

  // Cleanup
  destroy(): void {
    if (this.destroyed) return;
    
    // Clean up UI elements first - from BaseEntity
    if (this.nameSprite && this.world.stage.scene) {
      this.world.stage.scene.remove(this.nameSprite);
      if (this.nameSprite.material instanceof THREE.SpriteMaterial && this.nameSprite.material.map) {
        this.nameSprite.material.map.dispose();
      }
      this.nameSprite.material.dispose();
      this.nameSprite = null;
    }

    if (this.healthSprite && this.world.stage.scene) {
      this.world.stage.scene.remove(this.healthSprite);
      if (this.healthSprite.material instanceof THREE.SpriteMaterial && this.healthSprite.material.map) {
        this.healthSprite.material.map.dispose();
      }
      this.healthSprite.material.dispose();
      this.healthSprite = null;
    }
    
    // Call parent destroy
    super.destroy();

    // Clear event listeners
    this.clearEventListeners();

    // Remove from world
    this.worldNodes.forEach(node => {
      if (node.parent) {
        node.parent.remove(node);
      }
    });
    this.worldNodes.clear();

    // Dispose of THREE.js resources
    if (this.mesh) {
      this.disposeMesh(this.mesh);
    }

    // Clear references
    this.nodes.clear();
    this.mesh = null;
  }

  private clearEventListeners(): void {
    // Clear local event listeners
    Object.keys(this.listeners).forEach(event => {
      this.listeners[event].clear();
    });

    // Clear world event listeners
    this.worldListeners.forEach((eventName, callback) => {
      this.world.off(eventName, callback);
    });
    this.worldListeners.clear();
  }

  private disposeMesh(object: THREE.Object3D): void {
    object.traverse(child => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }

  // Debug information
  getInfo(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      position: this.getPosition(),
      visible: this.node.visible,
      isInitialized: true, // Entity is always initialized after constructor
      isDestroyed: this.destroyed,
      networkDirty: this.networkDirty,
      networkVersion: this.networkVersion,
      nodeCount: this.nodes.size,
      properties: this.config.properties
    };
  }
}