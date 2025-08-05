
/**
 * RPG Interaction System
 * Comprehensive interaction system with raycasting and DOM-based UI
 * - Mouse hover detection and highlighting
 * - Click handlers for different interaction types
 * - Visual feedback (cursors, outlines, tooltips)
 * - Integration with movement system for click-to-move
 * - Action menus for complex interactions
 * - DOM-based UI instead of Three.js UI nodes
 */

import * as THREE from '../../core/extras/three';
import { toTHREEVector3 } from '../../core/extras/three';
import type { World } from '../../types';
import { EventType } from '../../types/events';
import { calculateDistance, getWorldCamera, getWorldScene } from '../utils/EntityUtils';
import { RPGSystemBase } from './RPGSystemBase';
import { RPGLogger } from '../utils/RPGLogger';

// RPGApp interface removed - using RPGEntity-based architecture instead

// Type helper for entity types
type EntityType = 'attack' | 'pickup' | 'talk' | 'gather' | 'use' | 'move' | 'mob' | 'item' | 'resource' | 'npc';

function isValidEntityType(type: string): type is EntityType {
  return ['attack', 'pickup', 'talk', 'gather', 'use', 'move', 'mob', 'item', 'resource', 'npc'].includes(type);
}

// HTMLElement for tooltip with custom property
import {
  RPGInteractableEntity as InteractableEntity,
  InteractionAction,
  InteractionHover,
  RPGInteractionSystemEvents as InteractionSystemEvents,
  TooltipElement
} from '../types/core';


// Re-export for backward compatibility
export type {
  InteractableEntity,
  InteractionAction,
  InteractionHover,
  InteractionSystemEvents, TooltipElement
};

export class RPGInteractionSystem extends RPGSystemBase {
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private scene!: THREE.Scene;
  private camera!: THREE.Camera;
  private canvas!: HTMLCanvasElement;
  
  // Interaction state
  private hoveredEntity: InteractableEntity | null = null;
  private selectedEntity: InteractableEntity | null = null;
  private interactables = new Map<string, InteractableEntity>();
  private isDragging = false;
  private actionMenu: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  
  // Mouse tracking
  private mousePosition = { x: 0, y: 0 };
  private lastClickTime = 0;
  private doubleClickThreshold = 300; // ms
  
  // Test system data tracking (merged from RPGClientInteractionSystem)
  private testData = new Map<string, { clicks: number; movements: number; combatInitiated: number; lastInteraction: number }>();
  private totalClicks = 0;
  private totalMovements = 0;
  private totalCombatInitiated = 0;
  private totalItemPickups = 0;
  private isShiftHeld = false;
  
  // Menu and hover state
  private isMenuOpen = false;
  private currentHover: InteractionHover | null = null;
  private eventListeners: Map<string, ((data: unknown) => void)[]> = new Map();

  // Visual feedback materials
  private highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.3,
    depthTest: false
  });
  
  private attackHighlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.4,
    depthTest: false
  });

  constructor(world: World) {
    super(world, {
      name: 'rpg-interaction',
      dependencies: {
        required: [], // Interaction system can work independently
        optional: ['rpg-movement', 'rpg-combat', 'rpg-player'] // Better with other systems for comprehensive interactions
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Only run on client
    if (!this.world.isClient) {
      return;
    }

    // Defer actual initialization to start() when rendering context is available
  }

  start(): void {
    // Try to initialize when system starts
    this.tryInitialize();
  }

  private tryInitialize(): void {
    // Get rendering context
    const scene = getWorldScene(this.world);
    const camera = getWorldCamera(this.world);
    const canvas = this.world.graphics?.renderer?.domElement;

    if (!scene || !camera || !canvas) {
      throw new Error('[RPGInteractionSystem] Required rendering context not available');
    }

    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;


    // Initialize DOM elements
    this.initializeDOMElements();

    // Set up event listeners
    this.setupEventListeners();
    
    // Set up event subscriptions for interaction system
    this.subscribe(EventType.INTERACTION_REGISTER, (event) => {
      const data = event.data as { appId: string; mesh: THREE.Object3D; type: string; distance: number; description: string };
      this.registerInteractable(data);
    });
    this.subscribe(EventType.INTERACTION_UNREGISTER, (event) => {
      const data = event.data as { appId: string };
      this.unregisterInteractable(data);
    });
    
  }

  /**
   * Initialize DOM elements for action menu
   */
  private initializeDOMElements(): void {
    // Create action menu container
    this.actionMenu = document.createElement('div');
    this.actionMenu.id = 'rpg-action-menu';
    this.actionMenu.style.cssText = `
      position: fixed;
      background: rgba(0, 0, 0, 0.9);
      border: 2px solid #8B4513;
      border-radius: 8px;
      padding: 8px;
      z-index: 1000;
      display: none;
      min-width: 120px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      color: #FFD700;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
    `;
    document.body.appendChild(this.actionMenu);

    // Add CSS for action buttons
    const style = document.createElement('style');
    style.textContent = `
      .rpg-action-button {
        display: block;
        width: 100%;
        padding: 6px 12px;
        margin: 2px 0;
        background: transparent;
        border: 1px solid #8B4513;
        border-radius: 4px;
        color: #FFD700;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .rpg-action-button:hover {
        background: rgba(139, 69, 19, 0.3);
        border-color: #FFD700;
        color: #FFFFFF;
      }
      
      .rpg-action-button:disabled {
        color: #666;
        border-color: #444;
        cursor: not-allowed;
      }
      
      .rpg-action-button:disabled:hover {
        background: transparent;
        border-color: #444;
        color: #666;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Set up mouse and keyboard event listeners
   */
  private setupEventListeners(): void {
    if (!this.canvas) return;

    // Mouse events
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('click', this.onClick.bind(this));
    this.canvas.addEventListener('contextmenu', this.onRightClick.bind(this));
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    
    // Keyboard events
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
    
    // Prevent default context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Close menu on escape
    document.addEventListener('keydown', (_event) => {
      if (_event.key === 'Escape' && this.isMenuOpen) {
        this.closeActionMenu();
      }
    });

    // Close menu on click outside
    document.addEventListener('click', (_event) => {
      if (this.isMenuOpen && !this.actionMenu?.contains(_event.target as Node)) {
        this.closeActionMenu();
      }
    });
    
    // Update cursor based on hover
    this.canvas.addEventListener('mouseenter', () => {
      document.body.style.cursor = 'default';
    });
  }

  /**
   * Handle mouse movement for hover detection
   */
  private onMouseMove(event: MouseEvent): void {
    if (!this.canvas || !this.camera || !this.scene) return;

    // Calculate mouse position in normalized device coordinates
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Find intersections with interactable objects
    const interactableObjects = Array.from(this.interactables.values()).map((e) => e.object);
    const intersects = this.raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0) {
      // Find the closest interactable
      for (const intersect of intersects) {
        const entity = this.findEntityByObject(intersect.object as THREE.Object3D);
        if (entity && intersect.distance <= entity.distance) {
          this.setHover(entity);
          this.updateCursor(entity.type);
          return;
        }
      }
    }

    // No valid intersection found
    this.clearHover();
    this.updateCursor('default');
  }

  /**
   * Handle mouse click for interactions
   */
  private onClick(_event: MouseEvent): void {
    
    // Track total clicks for test system
    this.totalClicks++;
    
    // Update mouse position
    this.updateMousePosition(_event);

    // Close action menu if open
    if (this.isMenuOpen) {
      this.closeActionMenu();
      return;
    }

    if (!this.currentHover) {
      // Click on empty space - trigger movement
      this.handleMovementClick(_event);
      return;
    }

    const entity = this.currentHover.entity;

    // For left click, perform primary action if available
    const primaryAction = entity.actions.find(action => action.enabled);
    if (primaryAction) {
      primaryAction.callback();
    } else {
      // Fallback to legacy interaction handling
      this.handleLegacyInteraction(entity);
    }
  }

  /**
   * Handle right click for action menu
   */
  private onRightClick(event: MouseEvent): void {
    event.preventDefault();
    
    this.updateMousePosition(event);
    const target = this.performRaycast();

    if (target && target.actions.length > 0) {
      this.showActionMenu(target, event.clientX, event.clientY);
    } else {
      this.closeActionMenu();
    }
  }

  /**
   * Handle mouse down events
   */
  private onMouseDown(_event: MouseEvent): void {
    // Can be used for drag detection or other mouse down specific logic
    this.isDragging = false;
  }

  /**
   * Handle mouse up events
   */
  private onMouseUp(_event: MouseEvent): void {
    // Reset dragging state
    this.isDragging = false;
  }

  /**
   * Update mouse position in normalized device coordinates
   */
  private updateMousePosition(event: MouseEvent): void {
    if (!this.canvas) return;
    
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Perform raycast and return the closest interactable entity
   */
  private performRaycast(): InteractableEntity | null {
    // Camera and scene are guaranteed to be initialized

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Get all interactable objects
    const objects = Array.from(this.interactables.values()).map(target => target.object);
    const intersects = this.raycaster.intersectObjects(objects, true);

    if (intersects.length > 0) {
      // Find the target that corresponds to the intersected object
      for (const [_id, target] of this.interactables) {
        if (target.object === intersects[0].object || target.object.children.includes(intersects[0].object)) {
          return target;
        }
      }
    }

    return null;
  }

  /**
   * Show action menu at specified position
   */
  private showActionMenu(target: InteractableEntity, x: number, y: number): void {
    if (!this.actionMenu) return;

    this.isMenuOpen = true;

    // Clear existing buttons
    this.actionMenu.innerHTML = '';

    // Add target info header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 4px 0;
      border-bottom: 1px solid #8B4513;
      margin-bottom: 4px;
      font-weight: bold;
      text-align: center;
    `;
    
    let headerText = target.name || target.description;
    if (target.level) {
      headerText += ` (Lvl ${target.level})`;
    }
    if (target.health !== undefined && target.maxHealth !== undefined) {
      headerText += `\nHP: ${target.health}/${target.maxHealth}`;
    }
    
    header.textContent = headerText;
    this.actionMenu.appendChild(header);

    // Add action buttons
    target.actions.forEach(action => {
      const button = document.createElement('button');
      button.className = 'rpg-action-button';
      button.textContent = action.label;
      button.disabled = !action.enabled;
      
      if (action.enabled) {
        button.onclick = () => {
          action.callback();
          this.closeActionMenu();
        };
      }

      this.actionMenu!.appendChild(button);
    });

    // Position menu
    const menuRect = this.actionMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let menuX = x;
    let menuY = y;

    // Adjust position if menu would go off screen
    if (x + menuRect.width > viewportWidth) {
      menuX = x - menuRect.width;
    }
    if (y + menuRect.height > viewportHeight) {
      menuY = y - menuRect.height;
    }

    this.actionMenu.style.left = `${menuX}px`;
    this.actionMenu.style.top = `${menuY}px`;
    this.actionMenu.style.display = 'block';
  }

  /**
   * Close the action menu
   */
  private closeActionMenu(): void {
    if (this.actionMenu) {
      this.actionMenu.style.display = 'none';
      this.isMenuOpen = false;
    }
  }

  /**
   * Handle click-to-move
   */
  private handleMovementClick(event: MouseEvent): void {
    if (!this.camera || !this.scene) return;

    // Raycast against ground/terrain
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Find ground intersection - check all objects recursively
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Find the first terrain/ground hit or any walkable surface
    let groundHit: THREE.Intersection | null = null;
    for (const hit of intersects) {
      const userData = hit.object.userData;
      // Accept terrain, ground, or any object marked as walkable
      if (userData?.type === 'terrain' || 
          userData?.type === 'ground' || 
          userData?.walkable === true ||
          hit.object.name?.includes('Terrain') ||
          hit.object.name?.includes('Ground')) {
        groundHit = hit;
        break;
      }
    }
    
    if (groundHit) {
      const targetPosition = groundHit.point;
      
      
      // Get local player
      const localPlayer = this.world.getPlayer();
      if (localPlayer) {
        // Track movement for test system
        this.totalMovements++;
        
        // Emit movement command using core movement system
        const clientMovementSystem = this.world.getSystem('client-movement-system');
        if (clientMovementSystem && 'movePlayer' in clientMovementSystem) {
          // Assume movePlayer method exists
          (clientMovementSystem as { movePlayer: (playerId: string, position: { x: number; y: number; z: number }) => void }).movePlayer(localPlayer.id, {
            x: targetPosition.x,
            y: targetPosition.y,
            z: targetPosition.z
          });
        } else {
          // Fallback to old event system
          this.emitTypedEvent(EventType.MOVEMENT_CLICK_TO_MOVE, {
            playerId: localPlayer.id,
            targetPosition: {
              x: targetPosition.x,
              y: targetPosition.y,
              z: targetPosition.z
            },
            currentPosition: {
              x: localPlayer.position.x,
              y: localPlayer.position.y,
              z: localPlayer.position.z
            },
            isRunning: event.shiftKey || this.isShiftHeld // Hold shift to run
          });
        }

        // Show movement target indicator
        this.showMovementTarget(targetPosition);
      }
    }
  }

  /**
   * Show visual indicator for movement target
   */
  private showMovementTarget(position: THREE.Vector3 | { x: number; y: number; z: number }): void {
    // Remove existing target indicator
    const existingTarget = this.scene?.getObjectByName('movement_target');
    if (existingTarget) {
      this.scene?.remove(existingTarget);
    }

    // Create new target indicator
    const targetGeometry = new THREE.RingGeometry(0.5, 0.7, 16);
    const targetMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });

    const targetIndicator = new THREE.Mesh(targetGeometry, targetMaterial);
    targetIndicator.name = 'movement_target';
    if (position instanceof THREE.Vector3) {
      targetIndicator.position.copy(position);
    } else {
      targetIndicator.position.set(position.x, position.y, position.z);
    }
    targetIndicator.position.y += 0.01; // Slightly above ground
    targetIndicator.rotation.x = -Math.PI / 2; // Lie flat on ground
    
    this.scene?.add(targetIndicator);

    // Animate and remove after delay
    let opacity = 0.8;
    const fadeOut = () => {
      opacity -= 0.02;
      targetMaterial.opacity = opacity;
      
      if (opacity > 0) {
        requestAnimationFrame(fadeOut);
      } else {
        this.scene?.remove(targetIndicator);
        targetGeometry.dispose();
        targetMaterial.dispose();
      }
    };
    
    setTimeout(fadeOut, 2000); // Start fading after 2 seconds
  }

  /**
   * Handle legacy interactions for backward compatibility
   */
  private handleLegacyInteraction(entity: InteractableEntity): void {
    // Handle different interaction types
    switch (entity.type) {
      case 'attack':
        this.handleAttackInteraction(entity);
        break;
      case 'pickup':
        this.handlePickupInteraction(entity);
        break;
      case 'talk':
        this.handleTalkInteraction(entity);
        break;
      case 'gather':
        this.handleGatherInteraction(entity);
        break;
      case 'use':
        this.handleUseInteraction(entity);
        break;
    }
  }

  /**
   * Handle attack interactions
   */
  private handleAttackInteraction(entity: InteractableEntity): void {
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;

    // Track combat initiation
    this.totalCombatInitiated++;

    // Emit attack command - determine target type from entity type
    const targetType = entity.type === 'mob' ? 'mob' : 'player';
    this.emitTypedEvent(EventType.COMBAT_START_ATTACK, {
      attackerId: localPlayer.id,
      targetId: entity.id,
      targetType
    });

    // Show attack feedback
    this.showAttackFeedback(entity);
  }

  /**
   * Handle pickup interactions  
   */
  private handlePickupInteraction(entity: InteractableEntity): void {
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;

    // Track item pickup
    this.totalItemPickups++;
    
    // Emit pickup request event for the entity system to handle
    this.emitTypedEvent(EventType.ITEM_PICKUP, {
      playerId: localPlayer.id,
      itemId: entity.id,
      position: {
        x: entity.object.position.x,
        y: entity.object.position.y,
        z: entity.object.position.z
      },
      playerPosition: {
        x: localPlayer.position.x,
        y: localPlayer.position.y,
        z: localPlayer.position.z
      }
    });
  }

  /**
   * Handle talk interactions
   */
  private handleTalkInteraction(_entity: InteractableEntity): void {
    // Implement NPC dialogue system
  }

  /**
   * Handle gather interactions (trees, rocks, etc.)
   */
  private handleGatherInteraction(entity: InteractableEntity): void {
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;

    
    // Emit gathering command - use entity type to determine resource type
    const resourceType = entity.type === 'resource' ? 'tree' : entity.type; // Default to tree for resources
    this.emitTypedEvent(EventType.RESOURCE_GATHER, {
      playerId: localPlayer.id,
      resourceId: entity.id,
      resourceType
    });
  }

  /**
   * Handle use interactions
   */
  private handleUseInteraction(_entity: InteractableEntity): void {
    // Implement use interaction
  }

  /**
   * Show attack feedback
   */
  private showAttackFeedback(entity: InteractableEntity): void {
    // Flash red highlight
    if (entity.object) {
      const originalMaterial = this.getMeshMaterial(entity.object);
      this.setMeshMaterial(entity.object, this.attackHighlightMaterial);
      
      setTimeout(() => {
        if (originalMaterial) {
          this.setMeshMaterial(entity.object, originalMaterial);
        }
      }, 200);
    }
  }

  /**
   * Register an interactable entity (legacy method)
   */
  private registerInteractable(data: {
    appId: string;
    mesh: THREE.Object3D;
    type: string;
    distance: number;
    description: string;
  }): void {
    const entity: InteractableEntity = {
      id: data.appId,
      object: data.mesh,
      type: isValidEntityType(data.type) ? data.type : 'use',
      distance: data.distance,
      description: data.description,
      name: data.description,
      actions: [] // Empty actions for legacy entities
    };

    this.interactables.set(data.appId, entity);
  }

  /**
   * Register an interactable entity with full action support
   */
  public registerInteractableEntity(target: InteractableEntity): void {
    if (!target || !target.object || !target.id) {
      RPGLogger.systemWarn('RPGInteractionSystem', 'Invalid interaction target provided - skipping registration', { target });
      return;
    }

    this.interactables.set(target.id, target);
  }

  /**
   * Register a mob with attack/loot actions
   */
  public registerMob(object: THREE.Object3D, mobData: {
    id: string;
    name: string;
    level: number;
    health: number;
    maxHealth: number;
    canAttack: boolean;
  }): void {
    const actions: InteractionAction[] = [];

    if (mobData.canAttack && mobData.health > 0) {
      actions.push({
        id: 'attack',
        label: 'Attack',
        enabled: true,
        callback: () => this.emitInteraction('interaction:attack', {
          targetId: mobData.id,
          targetType: 'mob'
        })
      });
    }

    if (mobData.health <= 0) {
      actions.push({
        id: 'loot',
        label: 'Loot',
        enabled: true,
        callback: () => this.emitInteraction('interaction:loot', {
          targetId: mobData.id
        })
      });
    }

    this.registerInteractableEntity({
      object,
      type: 'mob',
      id: mobData.id,
      name: mobData.name,
      description: mobData.name,
      distance: 3.0,
      level: mobData.level,
      health: mobData.health,
      maxHealth: mobData.maxHealth,
      actions
    });
  }

  /**
   * Register a resource with gather action
   */
  public registerResource(object: THREE.Object3D, resourceData: {
    id: string;
    name: string;
    type: 'tree' | 'rock' | 'fish';
    requiredTool?: string;
    canGather: boolean;
  }): void {
    const actions: InteractionAction[] = [];

    if (resourceData.canGather) {
      let actionLabel = 'Gather';
      switch (resourceData.type) {
        case 'tree':
          actionLabel = 'Chop';
          break;
        case 'rock':
          actionLabel = 'Mine';
          break;
        case 'fish':
          actionLabel = 'Fish';
          break;
      }

      actions.push({
        id: 'gather',
        label: actionLabel,
        enabled: true,
        callback: () => this.emitInteraction('interaction:gather', {
          targetId: resourceData.id,
          resourceType: resourceData.type,
          tool: resourceData.requiredTool
        })
      });
    }

    this.registerInteractableEntity({
      object,
      type: 'resource',
      id: resourceData.id,
      name: resourceData.name,
      description: resourceData.name,
      distance: 2.0,
      actions
    });
  }

  /**
   * Register an item with pickup action
   */
  public registerItem(object: THREE.Object3D, itemData: {
    id: string;
    name: string;
    canPickup: boolean;
  }): void {
    const actions: InteractionAction[] = [];

    if (itemData.canPickup) {
      actions.push({
        id: 'pickup',
        label: 'Take',
        enabled: true,
        callback: () => this.emitInteraction('interaction:pickup', {
          targetId: itemData.id
        })
      });
    }

    this.registerInteractableEntity({
      object,
      type: 'item',
      id: itemData.id,
      name: itemData.name,
      description: itemData.name,
      distance: 2.0,
      actions
    });
  }

  /**
   * Register an NPC with talk action
   */
  public registerNPC(object: THREE.Object3D, npcData: {
    id: string;
    name: string;
    canTalk: boolean;
    isShop?: boolean;
  }): void {
    const actions: InteractionAction[] = [];

    if (npcData.canTalk) {
      actions.push({
        id: 'talk',
        label: npcData.isShop ? 'Trade' : 'Talk',
        enabled: true,
        callback: () => this.emitInteraction('interaction:talk', {
          targetId: npcData.id
        })
      });
    }

    this.registerInteractableEntity({
      object,
      type: 'npc',
      id: npcData.id,
      name: npcData.name,
      description: npcData.name,
      distance: 3.0,
      actions
    });
  }

  /**
   * Unregister an interactable entity
   */
  private unregisterInteractable(data: { appId: string }): void {
    const entity = this.interactables.get(data.appId);
    if (entity) {
      // Clear hover if it's the current hover target
      if (this.currentHover?.entity.id === data.appId) {
        this.clearHover();
      }
      
      this.interactables.delete(data.appId);
    }
  }

  /**
   * Set hover state
   */
  private setHover(entity: InteractableEntity): void {
    if (this.currentHover?.entity.id === entity.id) return;

    // Clear previous hover
    this.clearHover();

    // Set new hover
    const originalMaterial = this.getMeshMaterial(entity.object);
    this.setMeshMaterial(entity.object, this.highlightMaterial);

    this.currentHover = {
      entity,
      originalMaterial
    };

    // Show tooltip
    this.showTooltip(entity.description, entity.type);
  }

  /**
   * Clear hover state
   */
  private clearHover(): void {
    if (this.currentHover) {
      // Restore original material
      if (this.currentHover.originalMaterial) {
        this.setMeshMaterial(this.currentHover.entity.object, this.currentHover.originalMaterial);
      }
      
      this.currentHover = null;
    }

    // Hide tooltip
    this.hideTooltip();
  }

  /**
   * Update cursor based on interaction type
   */
  private updateCursor(type: string): void {
    if (!this.canvas) return;

    switch (type) {
      case 'attack':
        this.canvas.style.cursor = 'crosshair';
        break;
      case 'pickup':
        this.canvas.style.cursor = 'grab';
        break;
      case 'talk':
        this.canvas.style.cursor = 'help';
        break;
      case 'gather':
        this.canvas.style.cursor = 'pointer';
        break;
      case 'use':
        this.canvas.style.cursor = 'pointer';
        break;
      default:
        this.canvas.style.cursor = 'default';
    }
  }

  /**
   * Show tooltip
   */
  private showTooltip(text: string, type: string): void {
    // Create or update tooltip element
    let tooltip = document.getElementById('rpg-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'rpg-tooltip';
      tooltip.style.cssText = `
        position: fixed;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-family: monospace;
        pointer-events: none;
        z-index: 1000;
        border: 1px solid #444;
      `;
      document.body.appendChild(tooltip);
    }

    // Add type-specific styling
    const typeColor = this.getTypeColor(type);
    tooltip.style.borderColor = typeColor;
    tooltip.innerHTML = `<span style="color: ${typeColor};">[${type.toUpperCase()}]</span> ${text}`;
    tooltip.style.display = 'block';

    // Position tooltip near mouse
    const updateTooltipPosition = (e: MouseEvent) => {
      tooltip!.style.left = `${e.clientX + 10}px`;
      tooltip!.style.top = `${e.clientY - 30}px`;
    };

    document.addEventListener('mousemove', updateTooltipPosition);
    (tooltip as TooltipElement)._removeListener = () => {
      document.removeEventListener('mousemove', updateTooltipPosition);
    };
  }

  /**
   * Hide tooltip
   */
  private hideTooltip(): void {
    const tooltip = document.getElementById('rpg-tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
      const tooltipElement = tooltip as TooltipElement;
      if (tooltipElement._removeListener) {
        tooltipElement._removeListener();
      }
    }
  }

  /**
   * Get color for interaction type
   */
  private getTypeColor(type: string): string {
    switch (type) {
      case 'attack': return '#ff4444';
      case 'pickup': return '#44ff44';
      case 'talk': return '#4444ff';
      case 'gather': return '#ffaa44';
      case 'use': return '#aa44ff';
      default: return '#ffffff';
    }
  }

  /**
   * Find entity by object
   */
  private findEntityByObject(object: THREE.Object3D): InteractableEntity | null {
    // Traverse up the object hierarchy to find the interactable
    let current = object;
    while (current) {
      for (const entity of this.interactables.values()) {
        if (entity.object === current || entity.object.children.includes(current)) {
          return entity;
        }
      }
      current = current.parent as THREE.Object3D;
    }
    return null;
  }

  /**
   * Get mesh material from object or its children
   */
  private getMeshMaterial(object: THREE.Object3D): THREE.Material | THREE.Material[] | null | undefined {
    if (object instanceof THREE.Mesh) {
      return object.material;
    }
    
    // Check children
    for (const child of object.children) {
      if (child instanceof THREE.Mesh) {
        return child.material;
      }
    }
    
    return undefined;
  }

  /**
   * Set mesh material
   */
  private setMeshMaterial(object: THREE.Object3D, material: THREE.Material | THREE.Material[]): void {
    if (object instanceof THREE.Mesh) {
      object.material = material;
      return;
    }
    
    // Set on children
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
      }
    });
  }

  /**
   * Event system for interaction events
   */
  public onInteraction<K extends keyof InteractionSystemEvents>(
    event: K,
    callback: (data: InteractionSystemEvents[K]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
            this.eventListeners.get(event)!.push(callback as (data: unknown) => void);
  }

  public offInteraction<K extends keyof InteractionSystemEvents>(
    event: K,
    callback: (data: InteractionSystemEvents[K]) => void
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
              const index = listeners.indexOf(callback as (data: unknown) => void);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emitInteraction<K extends keyof InteractionSystemEvents>(
    event: K,
    data: InteractionSystemEvents[K]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          RPGLogger.systemError('RPGInteractionSystem', `Error in interaction event listener for ${event}`, error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      });
    }
  }

  /**
   * Update interactable entity data
   */
  public updateInteractable(id: string, updates: Partial<InteractableEntity>): void {
    const existing = this.interactables.get(id);
    if (existing) {
      Object.assign(existing, updates);
    }
  }

  /**
   * Check if target is in range of player
   */
  public isInRange(targetId: string, playerPosition: THREE.Vector3, maxDistance: number): boolean {
    const target = this.interactables.get(targetId);
    if (!target) return false;

    // Use toTHREEVector3 to ensure compatibility with getWorldPosition
    const tempVector = toTHREEVector3(new THREE.Vector3());
    target.object.getWorldPosition(tempVector);
    const targetPosition = new THREE.Vector3(tempVector.x, tempVector.y, tempVector.z);
    
    return playerPosition.distanceTo(targetPosition) <= maxDistance;
  }

  /**
   * Update method to be called each frame for distance checking
   */
  public updateDistanceChecks(playerPosition: THREE.Vector3): void {
    // Update action enablement based on distance and other factors
    for (const [_id, target] of this.interactables) {
      const distance = calculateDistance(target.object.position, playerPosition);
      
      target.actions.forEach(action => {
        if (action.distance) {
          action.enabled = distance <= action.distance;
        }
      });
    }
  }

  /**
   * Handle keydown events
   */
  private onKeyDown(event: KeyboardEvent): void {
    // Handle keyboard shortcuts for interactions
    if (event.key === 'e' || event.key === 'E') {
      // Trigger primary interaction
      this.triggerPrimaryInteraction();
    }
  }

  /**
   * Handle keyup events
   */
  private onKeyUp(_event: KeyboardEvent): void {
    // Handle key release events if needed
  }

  /**
   * Trigger the primary interaction
   */
  private triggerPrimaryInteraction(): void {
    if (this.hoveredEntity) {
      const primaryAction = this.hoveredEntity.actions.find(action => action.enabled);
      if (primaryAction) {
        primaryAction.callback();
      }
    }
  }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear interaction state
    this.clearHover();
    this.closeActionMenu();
    this.hideTooltip();
    
    // Clear entity references
    this.hoveredEntity = null;
    this.selectedEntity = null;
    
    // Clear DOM references  
    this.actionMenu = null;
    this.tooltip = null;
    // Canvas, scene, camera are now required properties
    
    // Reset stats
    this.totalClicks = 0;
    this.totalCombatInitiated = 0;
    this.totalItemPickups = 0;
    
    RPGLogger.system('RPGInteractionSystem', 'Interaction system destroyed and cleaned up');
    
    // Call parent cleanup
    super.destroy();
  }

}
