
/**
 * Interaction System
 * Comprehensive interaction system with raycasting and DOM-based UI
 * - Mouse hover detection and highlighting
 * - Click handlers for different interaction types
 * - Visual feedback (cursors, outlines, tooltips)
 * - Integration with movement system for click-to-move
 * - Action menus for complex interactions
 * - DOM-based UI instead of Three.js UI nodes
 */

import THREE, { toTHREEVector3 } from '../extras/three';
import { logger as Logger } from '../logger';
import type { World } from '../types';
import { EventType } from '../types/events';
import { calculateDistance, getWorldCamera, getWorldScene } from '../utils/EntityUtils';
import { SystemBase } from './SystemBase';

// App interface removed - using Entity-based architecture instead

// Type helper for entity types
type EntityType = 'mob' | 'npc' | 'resource' | 'item' | 'store' | 'bank' | 'other';

function isValidEntityType(type: string): type is EntityType {
  return ['mob', 'npc', 'resource', 'item', 'store', 'bank', 'other'].includes(type);
}

// HTMLElement for tooltip with custom property
import {
  InteractableEntity,
  InteractionAction,
  InteractionHover,
  InteractionSystemEvents,
  TooltipElement
} from '../types/core';


// Re-export for backward compatibility
export type {
  InteractableEntity,
  InteractionAction,
  InteractionHover,
  InteractionSystemEvents, TooltipElement
};

export class InteractionSystem extends SystemBase {
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

  
  // Test system data tracking
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
    console.log('[InteractionSystem] Starting...');
    // Try to initialize when system starts
    this.tryInitialize();
  }

  private tryInitialize(): void {
    // Get rendering context
    const scene = getWorldScene(this.world);
    const camera = getWorldCamera(this.world);
    const canvas = this.world.graphics?.renderer?.domElement;

    console.log('[InteractionSystem] Trying to initialize:', { 
      hasScene: !!scene, 
      hasCamera: !!camera, 
      hasCanvas: !!canvas 
    });

    if (!scene || !camera || !canvas) {
      // Retry later instead of throwing to avoid breaking the system startup
      console.log('[InteractionSystem] Not ready yet, will retry in 100ms');
      setTimeout(() => this.tryInitialize(), 100);
      return;
    }

    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;


    // Initialize DOM elements
    this.initializeDOMElements();

    // Set up event listeners
    this.setupEventListeners();
    
    // Set up event subscriptions for interaction system
    this.subscribe<{ entityId: string; interactionType: "attack" | "pickup" | "talk" | "gather" | "use" | "loot" | "bank" | "trade" }>(EventType.INTERACTION_REGISTER, (data) => {
      this.registerInteractable({ appId: data.entityId, mesh: new THREE.Object3D() as THREE.Object3D<THREE.Object3DEventMap>, type: data.interactionType, distance: 5, description: '' });
    });
    this.subscribe<{ entityId: string; interactionType: "attack" | "pickup" | "talk" | "gather" | "use" | "loot" | "bank" | "trade" }>(EventType.INTERACTION_UNREGISTER, (data) => {
      this.unregisterInteractable({ appId: data.entityId });
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
    // Single-click only for movement; disable dblclick-to-move to avoid duplicate/lagged targets
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

    // Update raycaster and ensure camera is set (required for sprites)
    this.raycaster.camera = this.camera;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Find intersections with interactable objects
    const interactableObjects = Array.from(this.interactables.values())
      .filter((e) => e.object)
      .map((e) => e.object!);
    const intersects = this.raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0) {
      // Find the closest interactable
      for (const intersect of intersects) {
        const entity = this.findEntityByObject(intersect.object as THREE.Object3D);
        if (entity && intersect.distance <= (entity.distance || entity.interactionDistance)) {
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
   * Type guard to check if actions property contains InteractionAction objects
   */
  private hasInteractionActions(entity: InteractableEntity): entity is InteractableEntity & { actions: InteractionAction[] } {
    return (
      Array.isArray(entity.actions) &&
      entity.actions.length > 0 &&
      typeof entity.actions[0] === 'object' &&
      entity.actions[0] !== null &&
      'callback' in entity.actions[0] &&
      'enabled' in entity.actions[0] &&
      typeof (entity.actions[0] as InteractionAction).callback === 'function'
    );
  }

  /**
   * Handle mouse click for interactions
   */
  private onClick(_event: MouseEvent): void {
    console.log('[InteractionSystem] onClick triggered');
    // Prevent bubbling to document/UI that might also react to click
    _event.preventDefault();
    _event.stopPropagation();
    
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
    if (this.hasInteractionActions(entity)) {
      const primaryAction = entity.actions.find(action => action.enabled);
      if (primaryAction) {
        primaryAction.callback();
      } else {
        // No enabled primary action - treat as ground click move
        this.handleMovementClick(_event);
      }
    } else {
      // No structured actions - if it's not actionable, move instead of no-op
      this.handleMovementClick(_event);
    }
  }

  /**
   * Handle right click for action menu
   */
  private onRightClick(event: MouseEvent): void {
    event.preventDefault();
    
    this.updateMousePosition(event);
    const target = this.performRaycast();

    const actions = (target && this.hasInteractionActions(target)) ? target.actions : undefined;
    if (target && actions && actions.length > 0) {
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
    // Ensure camera is set for sprite raycasts
    this.raycaster.camera = this.camera;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Get all interactable objects
    const objects = Array.from(this.interactables.values())
      .filter(target => target.object)
      .map(target => target.object!);
    const intersects = this.raycaster.intersectObjects(objects, true);

    if (intersects.length > 0) {
      // Find the target that corresponds to the intersected object
      for (const [_id, target] of this.interactables) {
        if (target.object && (target.object === intersects[0].object || target.object.children.includes(intersects[0].object))) {
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
    
    let headerText = target.name || target.description || 'Unknown';
    if (target.level) {
      headerText += ` (Lvl ${target.level})`;
    }
    if (target.health !== undefined && target.maxHealth !== undefined) {
      headerText += `\nHP: ${target.health}/${target.maxHealth}`;
    }
    
    header.textContent = headerText;
    this.actionMenu.appendChild(header);

    // Add action buttons
    const actions = this.hasInteractionActions(target) ? target.actions : undefined;
    actions?.forEach(action => {
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

    // Get fresh references in case they've changed
    const currentCamera = getWorldCamera(this.world) || this.camera;
    const currentCanvas = this.world.graphics?.renderer?.domElement || this.canvas;
    
    if (!currentCanvas) {
      this.logger.warn('[InteractionSystem] No canvas found for raycasting');
      return;
    }

    // Recalculate NDC from this specific click to avoid any stale/shared mouse coords
    const rect = currentCanvas.getBoundingClientRect();
    // Store the exact click coordinates for debugging
    const clickX = event.clientX;
    const clickY = event.clientY;
    const relativeX = clickX - rect.left;
    const relativeY = clickY - rect.top;
    
    // Calculate NDC coordinates using local Vector2 (do not mutate shared this.mouse)
    const ndcX = (relativeX / rect.width) * 2 - 1;
    const ndcY = -(relativeY / rect.height) * 2 + 1;
    const ndc = new THREE.Vector2(ndcX, ndcY);
    
    // Log canvas dimensions for debugging
    this.logger.info(`[Raycast Debug] Canvas rect: width=${rect.width}, height=${rect.height}, left=${rect.left}, top=${rect.top}`);
    this.logger.info(`[Raycast Debug] Click position: clientX=${clickX}, clientY=${clickY}, relativeX=${relativeX}, relativeY=${relativeY}`);
    this.logger.info(`[Raycast Debug] Mouse NDC: x=${ndcX.toFixed(3)}, y=${ndcY.toFixed(3)}`);

    // Validate camera before using it
    if (!Number.isFinite(currentCamera.position.x) || !Number.isFinite(currentCamera.position.y) || !Number.isFinite(currentCamera.position.z)) {
      this.logger.error(`[Raycast Debug] Camera position is invalid: x=${currentCamera.position.x}, y=${currentCamera.position.y}, z=${currentCamera.position.z}`);
      return;
    }
    
    // Validate camera matrices before using them
    const cameraMatrix = currentCamera.matrixWorld;
    if (!cameraMatrix || !Number.isFinite(cameraMatrix.elements[0])) {
      this.logger.error('[Raycast Debug] Camera matrix is corrupted, skipping click');
      return;
    }
    
    // Only update matrices if they seem valid
    if (currentCamera.updateMatrixWorld && Number.isFinite(currentCamera.position.x)) {
      currentCamera.updateMatrixWorld(true);
    }
    
    // Skip aspect ratio updates during clicks to prevent matrix corruption
    // The graphics system should handle aspect ratio, not the interaction system

    // Debug camera state before using it
    this.logger.info(`[Raycast Debug] Camera type: ${currentCamera.type}`);
    this.logger.info(`[Raycast Debug] Camera position: x=${currentCamera.position.x}, y=${currentCamera.position.y}, z=${currentCamera.position.z}`);
    if ((currentCamera as any).fov) {
      this.logger.info(`[Raycast Debug] Camera FOV: ${(currentCamera as any).fov}`);
    }
    if ((currentCamera as any).aspect) {
      this.logger.info(`[Raycast Debug] Camera aspect: ${(currentCamera as any).aspect}`);
    } else {
      this.logger.error(`[Raycast Debug] Camera has no aspect ratio!`);
      // Set a default aspect ratio
      (currentCamera as any).aspect = rect.width / rect.height;
      if ((currentCamera as any).updateProjectionMatrix) {
        (currentCamera as any).updateProjectionMatrix();
      }
      this.logger.info(`[Raycast Debug] Set camera aspect to: ${(currentCamera as any).aspect}`);
    }

    // Build a camera ray from current mouse position and use PhysX raycast
    this.raycaster.camera = currentCamera;
    this.raycaster.setFromCamera(ndc, currentCamera);
    
    // Validate mouse coordinates
    if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) {
      this.logger.error(`[Raycast Debug] Invalid mouse coordinates: x=${ndcX}, y=${ndcY}`);
      return;
    }
    
    const direction = this.raycaster.ray.direction.clone().normalize();
    const baseOrigin = this.raycaster.ray.origin.clone();
    
    // Debug the raycaster state
    this.logger.info(`[Raycast Debug] Raycaster ray origin: x=${this.raycaster.ray.origin.x}, y=${this.raycaster.ray.origin.y}, z=${this.raycaster.ray.origin.z}`);
    this.logger.info(`[Raycast Debug] Raycaster ray direction (before normalize): x=${this.raycaster.ray.direction.x}, y=${this.raycaster.ray.direction.y}, z=${this.raycaster.ray.direction.z}`);
    
    // Validate camera ray
    if (!Number.isFinite(baseOrigin.x) || !Number.isFinite(baseOrigin.y) || !Number.isFinite(baseOrigin.z)) {
      this.logger.error(`[Raycast Debug] Invalid camera origin: x=${baseOrigin.x}, y=${baseOrigin.y}, z=${baseOrigin.z}`);
      return;
    }
    
    if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y) || !Number.isFinite(direction.z)) {
      this.logger.error(`[Raycast Debug] Invalid camera direction: x=${direction.x}, y=${direction.y}, z=${direction.z}`);
      return;
    }
    
    // Offset the origin slightly to avoid hitting the player's own capsule
    const origin = baseOrigin.add(direction.clone().multiplyScalar(1.0));
    
    // Debug logging for raycast
    this.logger.info(`[Raycast Debug] Mouse: x=${ndcX.toFixed(3)}, y=${ndcY.toFixed(3)}`);
    this.logger.info(`[Raycast Debug] Origin: x=${origin.x.toFixed(2)}, y=${origin.y.toFixed(2)}, z=${origin.z.toFixed(2)}`);
    this.logger.info(`[Raycast Debug] Direction: x=${direction.x.toFixed(3)}, y=${direction.y.toFixed(3)}, z=${direction.z.toFixed(3)}`);
    
    // Check if physics is initialized
    if (!this.world.physics || !this.world.physics.scene) {
      this.logger.warn('[Raycast Debug] Physics system not initialized');
    }
    
    // Try specific ground/terrain layers first; then environment; then all except player
    const groundMask = this.world.createLayerMask('ground', 'terrain');
    const environmentMask = this.world.createLayerMask('environment');
    // Create a mask that includes everything except the player layer
    const playerMask = this.world.createLayerMask('player');
    const allExceptPlayerMask = 0xFFFFFFFF & ~playerMask; // Exclude player layer
    
    this.logger.info(`[Raycast Debug] Environment mask: 0x${environmentMask.toString(16)}, All except player mask: 0x${allExceptPlayerMask.toString(16)}`);
    
    // Get the local player to check if we hit it
    const localPlayer = this.world.getPlayer();
    
    // Try ground/terrain layer first
    let physxHit = this.world.raycast(origin, direction, 5000, groundMask);
    let maskUsed = 'ground';
    
    // Check if we hit the player and skip if so
    if (physxHit && localPlayer) {
      console.log('[InteractionSystem] PhysX hit:', physxHit);
      console.log('[InteractionSystem] Player capsule handle:', (localPlayer as any).capsuleHandle);
      console.log('[InteractionSystem] Hit point:', 
        `(${physxHit.point.x.toFixed(2)}, ${physxHit.point.y.toFixed(2)}, ${physxHit.point.z.toFixed(2)})`);
      console.log('[InteractionSystem] Player position:', 
        `(${localPlayer.position.x.toFixed(2)}, ${localPlayer.position.y.toFixed(2)}, ${localPlayer.position.z.toFixed(2)})`);
      
      // Check if hit point is very close to player position (within 0.5 units)
      const hitPoint = physxHit.point;
      const playerPos = localPlayer.position;
      const distance = Math.sqrt(
        Math.pow(hitPoint.x - playerPos.x, 2) +
        Math.pow(hitPoint.y - playerPos.y, 2) +
        Math.pow(hitPoint.z - playerPos.z, 2)
      );
      
      if (distance < 0.5 || physxHit.handle === (localPlayer as any).capsuleHandle) {
        console.log('[InteractionSystem] Hit is too close to player (dist:', distance, '), retrying from further out');
        // Move origin much further to completely skip past the player
        const furtherOrigin = origin.clone().add(direction.clone().multiplyScalar(5.0));
        console.log('[InteractionSystem] Retry origin:', 
          `(${furtherOrigin.x.toFixed(2)}, ${furtherOrigin.y.toFixed(2)}, ${furtherOrigin.z.toFixed(2)})`);
        physxHit = this.world.raycast(furtherOrigin, direction, 5000, groundMask);
        
        if (physxHit) {
          console.log('[InteractionSystem] Retry hit point:', 
            `(${physxHit.point.x.toFixed(2)}, ${physxHit.point.y.toFixed(2)}, ${physxHit.point.z.toFixed(2)})`);
          
          // Check if retry still hit the player
          const retryDist = Math.sqrt(
            Math.pow(physxHit.point.x - playerPos.x, 2) +
            Math.pow(physxHit.point.y - playerPos.y, 2) +
            Math.pow(physxHit.point.z - playerPos.z, 2)
          );
          if (retryDist < 0.5) {
            console.log('[InteractionSystem] Retry STILL hit player! Trying Three.js fallback.');
            physxHit = null;
            
            // Use Three.js raycast as fallback
            this.raycaster.set(origin, direction);
            const meshIntersects = this.raycaster.intersectObjects(this.scene.children, true);
            const groundHit = meshIntersects.find(hit => {
              const obj = hit.object;
              // Skip player-related objects
              if (obj.name && obj.name.includes('player')) return false;
              // Skip our own debug/indicator visuals
              if (obj.name && (obj.name.includes('movement_target') || obj.name.includes('debug_cube') || obj.name.includes('debug_path'))) return false;
              if ((obj.userData as any)?.ignoreClickMove) return false;
              // Accept ground-like objects
              if (obj.name && (obj.name.includes('ground') || obj.name.includes('test-ground-plane'))) return true;
              // Check distance from player
              const hitDist = hit.point.distanceTo(playerPos);
              return hitDist > 1.0; // Only accept hits far from player
            });
            
            if (groundHit) {
              console.log('[InteractionSystem] Three.js fallback hit at:', 
                `(${groundHit.point.x.toFixed(2)}, ${groundHit.point.y.toFixed(2)}, ${groundHit.point.z.toFixed(2)})`);
              // Create a fake PhysX hit from the Three.js hit with a minimal Collider
              physxHit = {
                point: groundHit.point.clone(),
                normal: groundHit.face?.normal || new THREE.Vector3(0, 1, 0),
                distance: groundHit.distance,
                collider: { type: 'mesh', isTrigger: false },
                handle: undefined
              };
            }
          }
      } else {
          console.log('[InteractionSystem] Retry failed, no hit');
        }
      }
    }
    
    // If that fails, try environment, then all layers except player
    if (!physxHit) {
      physxHit = this.world.raycast(origin, direction, 5000, environmentMask);
      maskUsed = 'environment';
      
      // Check again for player hit
      if (physxHit && localPlayer && physxHit.handle === (localPlayer as any).capsuleHandle) {
        this.logger.info('[Raycast Debug] Hit player capsule on environment layer, retrying');
        const furtherOrigin = origin.clone().add(direction.clone().multiplyScalar(3.0));
        physxHit = this.world.raycast(furtherOrigin, direction, 5000, environmentMask);
      }
      
      if (!physxHit) {
        physxHit = this.world.raycast(origin, direction, 5000, allExceptPlayerMask);
        maskUsed = 'all-except-player';
        
        // Final check for player hit
        if (physxHit && localPlayer && physxHit.handle === (localPlayer as any).capsuleHandle) {
          this.logger.info('[Raycast Debug] Still hitting player, ignoring this hit');
          physxHit = null;
        }
      }
    }
    
    // If that fails, try no mask (default)
    if (!physxHit) {
      physxHit = this.world.raycast(origin, direction, 5000);
      maskUsed = 'default';
    }
    
    this.logger.info(`[Raycast Debug] PhysX raycast result (${maskUsed}): ${physxHit ? 'hit' : 'null'}`);
    if (physxHit) {
      this.logger.info(`[Raycast Debug] PhysX hit details: point=${physxHit.point ? `(${physxHit.point.x}, ${physxHit.point.y}, ${physxHit.point.z})` : 'null'}, distance=${physxHit.distance}`);
    }

    // Fallbacks: we do NOT use plane fallback for movement now; if no ground/terrain hit, abort
    let targetPosition: THREE.Vector3 | null = null;
    let hitMethod = 'none';
    
    // Check if PhysX hit is valid
    if (physxHit && physxHit.point) {
      // PhysX sometimes returns exactly 0,0,0 for invalid hits or hits on the player
      // Be more strict about rejecting invalid hits
      const isInvalidHit = Math.abs(physxHit.point.x) < 0.001 && 
                          Math.abs(physxHit.point.y) < 0.001 && 
                          Math.abs(physxHit.point.z) < 0.001;
      
      const isNaNHit = !Number.isFinite(physxHit.point.x) || 
                       !Number.isFinite(physxHit.point.y) || 
                       !Number.isFinite(physxHit.point.z);
      
      if (!isInvalidHit && !isNaNHit) {
        targetPosition = physxHit.point.clone();
        hitMethod = 'physx';
        this.logger.info(`[Raycast Debug] PhysX hit at: x=${physxHit.point.x.toFixed(2)}, y=${physxHit.point.y.toFixed(2)}, z=${physxHit.point.z.toFixed(2)}`);
      } else {
        this.logger.warn(`[Raycast Debug] PhysX returned invalid hit at (${physxHit.point.x}, ${physxHit.point.y}, ${physxHit.point.z}), trying fallback`);
      }
    } else {
      this.logger.warn('[Raycast Debug] PhysX raycast missed, trying fallback');
    }
    
    if (!targetPosition) {
      // Try Three.js raycast against known ground meshes first
      const ground = this.scene.getObjectByName('stage-ground');
      let meshIntersects: THREE.Intersection[] = [];
      if (ground) {
        meshIntersects = this.raycaster.intersectObject(ground, true);
      } else {
        // Fallback to intersecting all children (filtered below)
        meshIntersects = this.raycaster.intersectObjects(this.scene.children, true);
      }
      if (meshIntersects.length > 0) {
        // Filter for ground-like objects (not UI, not players, etc)
        const groundHit = meshIntersects.find(hit => {
          const obj = hit.object;
          // Skip UI elements, players, items
          if (obj.name && (obj.name.includes('ui') || obj.name.includes('player') || obj.name.includes('item'))) {
            return false;
          }
          // Accept terrain, ground, floor, environment objects
          if (obj.name && (obj.name.includes('terrain') || obj.name.includes('ground') || obj.name.includes('floor') || obj.name.includes('environment'))) {
            return true;
          }
          // Default: accept if no specific name
          return !obj.name || obj.name === '';
        });
        
        if (groundHit) {
          targetPosition = groundHit.point.clone();
          hitMethod = 'three_mesh';
          this.logger.info(`[Raycast Debug] Three.js mesh hit at: x=${groundHit.point.x.toFixed(2)}, y=${groundHit.point.y.toFixed(2)}, z=${groundHit.point.z.toFixed(2)}, object: ${groundHit.object.name || 'unnamed'}`);
        }
      }
      
      // No plane fallback for movement; if mesh also misses, we abort
    }

    if (!targetPosition) {
        this.logger.error(
          `[Movement] No ground hit for click ox=${origin.x.toFixed?.(2) ?? origin.x}, oy=${origin.y.toFixed?.(2) ?? origin.y}, oz=${origin.z.toFixed?.(2) ?? origin.z}, dx=${direction.x.toFixed?.(3) ?? direction.x}, dy=${direction.y.toFixed?.(3) ?? direction.y}, dz=${direction.z.toFixed?.(3) ?? direction.z}`
        );
      return; // Cancel movement when no proper ground hit
    }

    // Final validation: ensure we never set an invalid target position
    const isFinalInvalid = (Math.abs(targetPosition.x) < 0.001 && Math.abs(targetPosition.y) < 0.001 && Math.abs(targetPosition.z) < 0.001) ||
                          !Number.isFinite(targetPosition.x) || !Number.isFinite(targetPosition.y) || !Number.isFinite(targetPosition.z);
    
    if (isFinalInvalid) {
      this.logger.error(`[Movement] REJECTING final invalid target position: (${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z})`);
      return;
    }

    // Ignore targets that are effectively the player's current position to avoid toggle loops
    if (localPlayer) {
      const dToSelf = localPlayer.position.distanceTo(targetPosition);
      if (dToSelf < 0.2) {
        this.logger.info('[InteractionSystem] Ignoring click: target too close to player position');
        return;
      }
    }

    this.logger.info(`[Raycast Debug] Final target position (${hitMethod}): x=${targetPosition.x.toFixed(2)}, y=${targetPosition.y.toFixed(2)}, z=${targetPosition.z.toFixed(2)}`);
    
    // Sanity: clamp target Y to ground range if absurd
    if (!Number.isFinite(targetPosition.y) || Math.abs(targetPosition.y) > 1000) {
      targetPosition.y = 0
    }

    // Use the localPlayer we already got earlier
    if (!localPlayer) return;

    // Do not clear first; directly set the new target below so there is no transient 'null' state

    // Track movement for test system
    this.totalMovements++;

    // Show debug cube at the exact raycast hit location
    this.showDebugCube(targetPosition);

    // Pathfinding may be enabled for visualization, but MUST NOT influence movement target
    const pathfindingSystem = this.world.getSystem('heightmap-pathfinding') as any;
    let finalPath: THREE.Vector3[] | null = null;
    if (pathfindingSystem) {
      try {
        finalPath = pathfindingSystem.findPath(localPlayer.position, targetPosition);
        if (finalPath && finalPath.length > 2) {
          this.logger.info(`[InteractionSystem] Pathfinding available with ${finalPath.length} waypoints (visualization only)`);
          this.visualizeSimplePath(finalPath);
        } else {
          finalPath = null;
        }
      } catch {
        finalPath = null;
      }
    }
    
    // Expose last raycast target for testing/diagnostics
    if (typeof window !== 'undefined') {
      (window as any).__lastRaycastTarget = { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z, method: hitMethod };
    }

    // Check if player is PlayerLocal with physics movement
    if ('setClickMoveTarget' in localPlayer && typeof localPlayer.setClickMoveTarget === 'function') {
      const playerLocal = localPlayer as { 
        setClickMoveTarget: (target: { x: number; y: number; z: number }) => void;
        toggleRunMode?: () => void;
        runMode?: boolean;
      };
      
      // Always set a single direct target for deterministic movement
      // ALWAYS move to the exact clicked position, never use waypoints or pathfinding destinations
      // This ensures there's only ONE target the avatar moves to
      
      playerLocal.setClickMoveTarget({ x: targetPosition.x, y: targetPosition.y, z: targetPosition.z });
      this.logger.info(`[InteractionSystem] Set direct target: x=${targetPosition.x.toFixed(2)}, z=${targetPosition.z.toFixed(2)}`);
      
      // Optional: path visualization already handled above
    } else {
      this.logger.warn('[InteractionSystem] Player does not support physics click movement');
    }

    // Show movement target indicator where we actually intend to go
    this.showMovementTarget(targetPosition);
    // Mark indicator as non-interactive for future raycasts
    const indicator = this.scene?.getObjectByName('movement_target');
    if (indicator) {
      (indicator.userData as any).ignoreClickMove = true;
    }
  }

  /**
   * Check if there are obstacles between two points
   */
  private hasObstaclesBetween(start: THREE.Vector3 | { x: number; y: number; z: number }, end: THREE.Vector3 | { x: number; y: number; z: number }): boolean {
    const startVec = start instanceof THREE.Vector3 ? start : new THREE.Vector3(start.x, start.y, start.z);
    const endVec = end instanceof THREE.Vector3 ? end : new THREE.Vector3(end.x, end.y, end.z);
    
    const distance = startVec.distanceTo(endVec);
    
    // If points are too close, no obstacles between them
    if (distance < 0.01) {
      return false;
    }
    
    const direction = new THREE.Vector3().subVectors(endVec, startVec).normalize();
    
    // Check for obstacles using PhysX
    const mask = this.world.createLayerMask('obstacle', 'building');
    const hit = this.world.raycast(startVec, direction, distance, mask);
    
    return !!hit;
  }
  
  /**
   * Visualize a simple path for debugging
   */
  private visualizeSimplePath(path: THREE.Vector3[]): void {
    if (!this.scene || path.length < 2) return;
    
    // Remove old path
    const oldPath = this.scene.getObjectByName('debug_path');
    if (oldPath) {
      this.scene.remove(oldPath);
      if (oldPath instanceof THREE.Line) {
        oldPath.geometry?.dispose();
        if (oldPath.material instanceof THREE.Material) {
          oldPath.material.dispose();
        }
      }
    }
    
    // Create path line
    const points = path.map(p => {
      const point = p.clone();
      point.y += 0.1; // Slightly above ground
      return point;
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5
    });
    
    const line = new THREE.Line(geometry, material);
    line.name = 'debug_path';
    this.scene.add(line);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (line.parent) {
        this.scene?.remove(line);
        geometry.dispose();
        material.dispose();
      }
    }, 5000);
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
   * Show debug cube at raycast hit location
   */
  private showDebugCube(position: THREE.Vector3 | { x: number; y: number; z: number }): void {
    // Remove existing debug cubes (keep last 5 for trail)
    const existingCubes = this.scene?.children.filter(child => child.name === 'debug_cube') || [];
    if (existingCubes.length >= 5) {
      const toRemove = existingCubes[0];
      this.scene?.remove(toRemove);
      if (toRemove instanceof THREE.Mesh) {
        toRemove.geometry?.dispose();
        if (toRemove.material instanceof THREE.Material) {
          toRemove.material.dispose();
        }
      }
    }

    // Create debug cube
    const cubeGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const cubeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000, // Red
      transparent: true,
      opacity: 0.9,
      wireframe: false
    });

    const debugCube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    debugCube.name = 'debug_cube';
    
    if (position instanceof THREE.Vector3) {
      debugCube.position.copy(position);
    } else {
      debugCube.position.set(position.x, position.y, position.z);
    }
    
    // Raise cube slightly so it's visible
    debugCube.position.y += 0.15;
    
    this.scene?.add(debugCube);

    // Log the position for debugging
    this.logger.info(`Debug cube placed at: x=${debugCube.position.x.toFixed(2)}, y=${debugCube.position.y.toFixed(2)}, z=${debugCube.position.z.toFixed(2)}`);

    // Make it pulse for visibility
    let scale = 1;
    let growing = true;
    const pulse = () => {
      if (growing) {
        scale += 0.02;
        if (scale >= 1.3) growing = false;
      } else {
        scale -= 0.02;
        if (scale <= 0.7) growing = true;
      }
      debugCube.scale.setScalar(scale);
      
      if (debugCube.parent) {
        requestAnimationFrame(pulse);
      }
    };
    pulse();

    // Remove after 10 seconds
    setTimeout(() => {
      if (debugCube.parent) {
        this.scene?.remove(debugCube);
        cubeGeometry.dispose();
        cubeMaterial.dispose();
      }
    }, 10000);
  }

  /**
   * Handle legacy interactions for backward compatibility
   */
  private handleLegacyInteraction(entity: InteractableEntity): void {
    // Handle different interaction types based on entity type
    switch (entity.type) {
      case 'mob':
        this.handleAttackInteraction(entity);
        break;
      case 'item':
        this.handlePickupInteraction(entity);
        break;
      case 'npc':
        this.handleTalkInteraction(entity);
        break;
      case 'resource':
        this.handleGatherInteraction(entity);
        break;
      case 'store':
      case 'bank':
      case 'other':
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
      position: entity.object ? {
        x: entity.object.position?.x || 0,
        y: entity.object.position?.y || 0,
        z: entity.object.position?.z || 0
      } : entity.position,
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
        if (originalMaterial && entity.object) {
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
      type: isValidEntityType(data.type) ? data.type : 'other',
      interactionDistance: data.distance,
      distance: data.distance,
      description: data.description,
      name: data.description,
      position: { x: data.mesh.position.x, y: data.mesh.position.y, z: data.mesh.position.z },
      actions: [] // Empty actions for legacy entities
    };

    this.interactables.set(data.appId, entity);
  }

  /**
   * Register an interactable entity with full action support
   */
  public registerInteractableEntity(target: InteractableEntity): void {
    if (!target || !target.id) {
      Logger.warn('InteractionSystem', 'Invalid interaction target provided - skipping registration', { target });
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
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      interactionDistance: 3.0,
      distance: 3.0,
      level: mobData.level,
      health: mobData.health,
      maxHealth: mobData.maxHealth,
      actions: actions.map(action => action.id)
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
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      interactionDistance: 2.0,
      distance: 2.0,
      actions: actions.map(action => action.id)
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
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      interactionDistance: 2.0,
      distance: 2.0,
      actions: actions.map(action => action.id)
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
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      interactionDistance: 3.0,
      distance: 3.0,
      actions: actions.map(action => action.id)
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
    let originalMaterial: THREE.Material | THREE.Material[] | null | undefined = undefined;
    if (entity.object) {
      originalMaterial = this.getMeshMaterial(entity.object);
      this.setMeshMaterial(entity.object, this.highlightMaterial);
    }

    this.currentHover = {
      entity,
      originalMaterial
    };

    // Show tooltip
    this.showTooltip(entity.description || entity.name, entity.type);
  }

  /**
   * Clear hover state
   */
  private clearHover(): void {
    if (this.currentHover) {
      // Restore original material
      if (this.currentHover.originalMaterial && this.currentHover.entity.object) {
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
        if (entity.object && (entity.object === current || entity.object.children.includes(current))) {
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
          Logger.error('InteractionSystem', `Error in interaction event listener for ${event}`, error instanceof Error ? error : new Error(String(error)));
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

    if (target.object) {
      // Use toTHREEVector3 to ensure compatibility with getWorldPosition
      const tempVector = toTHREEVector3(new THREE.Vector3());
      target.object.getWorldPosition(tempVector);
      const targetPosition = new THREE.Vector3(tempVector.x, tempVector.y, tempVector.z);
      
      return playerPosition.distanceTo(targetPosition) <= maxDistance;
    } else {
      // Fallback to position property
      const targetPosition = new THREE.Vector3(target.position.x, target.position.y, target.position.z);
      return playerPosition.distanceTo(targetPosition) <= maxDistance;
    }
  }

  /**
   * Update method to be called each frame for distance checking
   */
  public updateDistanceChecks(playerPosition: THREE.Vector3): void {
    // Update action enablement based on distance and other factors
    for (const [_id, target] of this.interactables) {
      const targetPos = target.object?.position || target.position;
      const distance = calculateDistance(targetPos, playerPosition);
      
      const actions = this.hasInteractionActions(target) ? target.actions : undefined;
      actions?.forEach(action => {
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
    
    // Toggle run/walk mode with 'R' key (RuneScape style)
    if (event.key === 'r' || event.key === 'R') {
      const localPlayer = this.world.entities?.getLocalPlayer?.();
      if (localPlayer && 'toggleRunMode' in localPlayer && typeof localPlayer.toggleRunMode === 'function') {
        (localPlayer as any).toggleRunMode();
        
        // TODO: Update UI to show current run/walk state
        const runMode = (localPlayer as any).runMode;
        this.logger.info(`[InteractionSystem] Run mode toggled: ${runMode ? 'ON' : 'OFF'}`);
      }
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
      const actions = this.hasInteractionActions(this.hoveredEntity) ? this.hoveredEntity.actions : undefined;
      const primaryAction = actions?.find(action => action.enabled);
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
    
    Logger.info('InteractionSystem', 'Interaction system destroyed and cleaned up');
    
    // Call parent cleanup
    super.destroy();
  }

}
