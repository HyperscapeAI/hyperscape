/**
 * PlayerEntity - RPG Player characters extending RPGEntity
 * Managed by RPGPlayerSystem, inherits health/UI management from RPGEntity
 */

import * as THREE from '../../core/extras/three';
import type { World } from '../../core/World';
import type { Vector3 } from '../../types';
import type { EntityInteractionData, PlayerEntityData, PlayerCombatStyle } from '../types/entities';
import { EntityType, InteractionType } from '../types/entities';
import { clamp } from '../utils/EntityUtils';
import { CombatantEntity, type CombatantConfig } from './CombatantEntity';

export class PlayerEntity extends CombatantEntity {
  public readonly playerId: string;
  public readonly playerName: string;
  
  // Player-specific properties (health, level, maxHealth now in RPGEntity)
  private stamina: number;
  private maxStamina: number;
  private combatStyle: string;
  private isRunning: boolean = false;
  
  // Player-specific UI elements (nameTag, healthBar now in RPGEntity)
  private staminaBarUI: THREE.Sprite | null = null;

  constructor(world: World, data: PlayerEntityData) {
    // Convert PlayerEntityData to CombatantConfig format
    const config: CombatantConfig = {
      id: data.id,
      name: data.name || data.playerName,
      type: EntityType.PLAYER,
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
      interactionType: InteractionType.TALK,
      interactionDistance: 2,
      description: `Player: ${data.playerName}`,
      model: null,
      properties: {
        // Base entity properties
        health: data.health || (data.maxHealth || 100),
        maxHealth: data.maxHealth || 100,
        level: data.level || 1,
        
        // Player-specific properties
        playerId: data.playerId,
        playerName: data.playerName,
        stamina: data.stamina || (data.maxStamina || 100),
        maxStamina: data.maxStamina || 100,
        combatStyle: (data.combatStyle || 'attack') as PlayerCombatStyle,
        
        // Use minimal component implementations with type assertions
        // These will be properly initialized by the systems that use them
        statsComponent: {
          combatLevel: data.level || 1,
          level: data.level || 1,
          health: data.health || 100,
          maxHealth: data.maxHealth || 100,
          attack: { level: 1, xp: 0 },
          defense: { level: 1, xp: 0 },
          strength: { level: 1, xp: 0 },
          ranged: { level: 1, xp: 0 },
          magic: { level: 1, xp: 0 },
          constitution: { level: 10, xp: 0 },
          prayer: { level: 1, points: 0 },
          woodcutting: { level: 1, xp: 0 },
          fishing: { level: 1, xp: 0 },
          firemaking: { level: 1, xp: 0 },
          cooking: { level: 1, xp: 0 },
          // Placeholder for complex fields - will be initialized by systems
          activePrayers: {} as import('../types/core').PrayerComponent,
          equipment: {} as import('../types/core').EquipmentComponent,
          equippedSpell: null,
          effects: { onSlayerTask: false, targetIsDragon: false, targetMagicLevel: 1 },
          combatBonuses: {} as import('../types/core').CombatBonuses
        } as import('../types/core').StatsComponent,
        
        inventoryComponent: {
          items: [] as import('../types/core').InventoryItem[],
          capacity: 30,
          coins: 0
        },
        
        equipmentComponent: {
          weapon: null,
          shield: null,
          helmet: null,
          body: null,
          legs: null,
          boots: null,
          gloves: null,
          cape: null,
          amulet: null,
          ring: null
        },
        
        prayerComponent: {
          protectFromMelee: false,
          protectFromRanged: false,
          protectFromMagic: false,
          piety: false,
          chivalry: false,
          ultimateStrength: false,
          superhumanStrength: false,
          burstOfStrength: false,
          rigour: false,
          eagleEye: false,
          hawkEye: false,
          sharpEye: false,
          augury: false,
          mysticMight: false,
          mysticLore: false,
          mysticWill: false
        },
        
        // Base entity components
        movementComponent: {
          position: { x: 0, y: 0, z: 0 },
          velocity: new THREE.Vector3(0, 0, 0),
          targetPosition: null,
          destination: null,
          speed: 5,
          movementSpeed: 5,
          isMoving: false,
          path: [],
          pathNodes: [],
          currentPathIndex: 0,
          lastMovementTime: 0
        },
        
        combatComponent: null, // Will be set properly in parent constructor
        
        healthComponent: {
          current: data.health || 100,
          max: data.maxHealth || 100,
          regenerationRate: 1,
          isDead: false
        },
        
        visualComponent: {
          mesh: null,
          nameSprite: null,
          healthSprite: null,
          isVisible: true,
          currentAnimation: null,
          animationTime: 0
        }
      } as import('../types/entities').PlayerEntityProperties,
      combat: {
        attack: 15, // Default player attack
        defense: 10, // Default player defense
        attackSpeed: 1.0,
        criticalChance: 0.1,
        combatLevel: data.level || 1,
        respawnTime: 0, // Players don't auto-respawn
        aggroRadius: 0, // Players don't have aggro
        attackRange: 1.5
      }
    };
    
    super(world, config);
    
    // Initialize player-specific properties
    this.playerId = data.playerId;
    this.playerName = data.playerName;
    this.maxStamina = data.maxStamina || 100;
    this.stamina = data.stamina || this.maxStamina;
    this.combatStyle = data.combatStyle || 'attack';
    
    // Add player-specific components
    
    // Add stamina component (player-specific)
    this.addComponent('stamina', {
      current: this.stamina,
      max: this.maxStamina,
      drainRate: 20.0, // Stamina per second when running
      regenRate: 15.0  // Stamina per second when walking/idle
    });
    
    // Override combat component with player-specific settings
    const combatComponent = this.getComponent('combat');
    if (combatComponent && combatComponent.data) {
      combatComponent.data.combatStyle = this.combatStyle;
      combatComponent.data.attackCooldown = 2000; // ms between attacks
    }
    
    // Override health component with player-specific settings
    const healthComponent = this.getComponent('health');
    if (healthComponent && healthComponent.data) {
      healthComponent.data.regenerationRate = 1.0; // HP per second regen out of combat
    }
    
    this.addComponent('movement', {
      isMoving: false,
      isRunning: this.isRunning,
      speed: 3.0, // walking speed
      runSpeed: 6.0,
      destination: null,
      path: []
    });
    
    this.addComponent('inventory', {
      items: data.inventory || [],
      capacity: 28, // RuneScape-style 28 slots
      coins: 0
    });
    
    this.addComponent('equipment', {
      weapon: null,
      shield: null,
      helmet: null,
      body: null,
      legs: null,
      arrows: null // Required for bow usage per GDD
    });
    
    this.addComponent('stats', {
      // Combat skills
      attack: { level: 1, xp: 0 },
      strength: { level: 1, xp: 0 },
      defense: { level: 1, xp: 0 },
      constitution: { level: 1, xp: 0 },
      ranged: { level: 1, xp: 0 },
      // Non-combat skills
      woodcutting: { level: 1, xp: 0 },
      fishing: { level: 1, xp: 0 },
      firemaking: { level: 1, xp: 0 },
      cooking: { level: 1, xp: 0 },
      // Additional stats from StatsComponent interface
      combatLevel: 3, // Will be calculated by skills system
      totalLevel: 9, // Sum of all skill levels
      health: this.config.properties?.health || 100,
      maxHealth: this.config.properties?.maxHealth || 100,
      level: this.config.properties?.level || 1,
      // HP stats for combat level calculation
      hitpoints: { level: 10, xp: 0, current: this.config.properties?.health || 100, max: this.config.properties?.maxHealth || 100 },
      prayer: { level: 1, points: 1 },
      magic: { level: 1, xp: 0 }
    });
  }

  /**
   * Create the player's visual representation - implements RPGEntity.createMesh
   */
  protected async createMesh(): Promise<void> {
    // Create player capsule geometry (represents the player body)
    const geometry = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
    const material = new THREE.MeshPhongMaterial({
      color: 0x4169e1, // Royal blue for player
      emissive: 0x1a3470,
      emissiveIntensity: 0.2
    });

    this.mesh = new THREE.Mesh(geometry, material) as unknown as THREE.Object3D;
    this.mesh!.castShadow = true;
    this.mesh!.receiveShadow = true;
    this.mesh!.position.y = 0.8; // Position at feet level
    this.mesh!.userData.entity = this;
    this.mesh!.userData.entityType = EntityType.PLAYER;
    this.mesh!.userData.playerId = this.playerId;

    // Add mesh to the entity's node
    this.node.add(this.mesh!);

    // Add mesh component to ECS
    this.addComponent('mesh', {
      mesh: this.mesh,
      geometry: geometry,
      material: material,
      castShadow: true,
      receiveShadow: true
    });

    // Note: UI creation (name tag, health bar) is now handled by RPGEntity.initializeVisuals()
    // Stamina bar will be created in initializeVisuals override
  }

  /**
   * Override initializeVisuals to add player-specific stamina bar
   */
  protected initializeVisuals(): void {
    // Call parent to create name tag and health bar
    super.initializeVisuals();
    
    // Create player-specific stamina bar
    this.createStaminaBar();
  }

  /**
   * Create stamina bar UI - player-specific
   */
  private createStaminaBar(): void {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 200;
    canvas.height = 15;
    
    this.updateStaminaBarCanvas(canvas, context);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const staminaSprite = new THREE.Sprite(material);
    staminaSprite.scale.set(1.5, 0.1, 1);
    staminaSprite.position.set(0, 1.5, 0); // Position below health bar
    
    this.staminaBarUI = staminaSprite;
    if (this.world.stage.scene) {
      this.world.stage.scene.add(staminaSprite);
    }
  }

  /**
   * Update stamina bar visual representation
   */
  private updateStaminaBarCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
    const staminaPercent = this.stamina / this.maxStamina;
    
    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Background
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Stamina bar (blue/green color)
    const barWidth = (canvas.width - 4) * staminaPercent;
    const staminaColor = staminaPercent > 0.6 ? '#60a5fa' : staminaPercent > 0.3 ? '#fbbf24' : '#ef4444';
    context.fillStyle = staminaColor;
    context.fillRect(2, 2, barWidth, canvas.height - 4);
    
    // Border
    context.strokeStyle = '#1e40af'; // Blue border for stamina
    context.lineWidth = 1;
    context.strokeRect(0, 0, canvas.width, canvas.height);
  }

  // Note: UI creation methods (createNameTag, createHealthBar) removed
  // These are now handled by RPGEntity.initializeVisuals() using UIRenderer

  // Player-specific methods that can be called by Systems

  /**
   * Set player health - uses RPGEntity's implementation
   */
  public setHealth(health: number): void {
    // Use parent's health management (includes UI updates, events, component updates)
    super.setHealth(health);
  }

  /**
   * Set player stamina and update UI
   */
  public setStamina(stamina: number): void {
    this.stamina = clamp(stamina, 0, this.maxStamina);
    
    // Update stamina component
    const staminaComponent = this.getComponent('stamina');
    if (staminaComponent) {
      staminaComponent.data.current = this.stamina;
    }
    
    // Update UI if present
    if (this.staminaBarUI && this.staminaBarUI instanceof THREE.Sprite) {
      const canvas = (this.staminaBarUI.material as THREE.SpriteMaterial).map!.image as HTMLCanvasElement;
      const context = canvas.getContext('2d')!;
      this.updateStaminaBarCanvas(canvas, context);
      (this.staminaBarUI.material as THREE.SpriteMaterial).map!.needsUpdate = true;
    }
    
    // Emit stamina change event
    this.emit('stamina-changed', { 
      playerId: this.playerId, 
      stamina: this.stamina, 
      maxStamina: this.maxStamina 
    });
  }

  /**
   * Set running state
   */
  public setRunning(running: boolean): void {
    this.isRunning = running;
    
    // Update movement component
    const movementComponent = this.getComponent('movement');
    if (movementComponent) {
      movementComponent.data.isRunning = running;
    }
  }

  /**
   * Get current player stats for external systems
   */
  public getStats() {
    return {
      playerId: this.playerId,
      playerName: this.playerName,
      level: this.level,
      health: this.health,
      maxHealth: this.maxHealth,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      combatStyle: this.combatStyle,
      isRunning: this.isRunning,
      position: this.position
    };
  }

  /**
   * Handle player death - override CombatantEntity.die()
   */
  protected die(): void {
    // Call parent die() for basic death handling
    super.die();
    
    // Player-specific death handling
    // Emit death event for other systems to handle
    this.emit('player-died', {
      playerId: this.playerId,
      position: this.getPosition(),
      inventory: this.getComponent('inventory')?.data
    });
  }

  /**
   * Respawn player at specified location - override CombatantEntity.respawn()
   */
  public respawn(position?: Vector3, health?: number): void {
    
    if (position) {
      // Set new position before calling parent respawn
      this.setPosition(position);
    }
    
    // Call parent respawn for basic respawn handling
    super.respawn();
    
    // Restore health if specified
    if (health !== undefined) {
      this.setHealth(health);
    }
    
    // Restore stamina (player-specific)
    this.setStamina(this.maxStamina);
    
    // Emit player-specific respawn event
    this.emit('player-respawned', {
      playerId: this.playerId,
      position: this.getPosition()
    });
  }

  /**
   * Handle interactions with the player - implements RPGEntity.onInteract
   */
  protected async onInteract(data: EntityInteractionData): Promise<void> {
    // Handle different interaction types
    switch (data.interactionType) {
      case 'trade':
        // Emit trade request event
        this.emit('player-trade-request', {
          playerId: this.playerId,
          interactorId: data.playerId,
          position: this.getPosition()
        });
        break;
      case 'challenge':
        // Emit PvP challenge event
        this.emit('player-challenge', {
          challengedPlayerId: this.playerId,
          challengerId: data.playerId,
          position: this.getPosition()
        });
        break;
      default:
        // Default interaction - examine player
        this.emit('player-examine', {
          playerId: this.playerId,
          examinerPlayerId: data.playerId,
          playerStats: this.getStats()
        });
        break;
    }
  }

  /**
   * Clean up when entity is destroyed - RPGEntity handles most cleanup
   */
  public destroy(): void {
    // Clean up player-specific stamina bar
    if (this.staminaBarUI && this.world.stage.scene) {
      this.world.stage.scene.remove(this.staminaBarUI);
      if (this.staminaBarUI.material instanceof THREE.SpriteMaterial && this.staminaBarUI.material.map) {
        this.staminaBarUI.material.map.dispose();
      }
      this.staminaBarUI.material.dispose();
      this.staminaBarUI = null;
    }
    
    // Call parent destroy (handles name tag, health bar, mesh, and standard cleanup)
    super.destroy();
  }
}