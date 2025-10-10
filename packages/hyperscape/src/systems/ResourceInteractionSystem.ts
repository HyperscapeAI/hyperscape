/**
 * Resource Interaction System
 * Handles context menu and interaction flow for resources like trees
 * - Right-click context menu for resources
 * - Movement to resource before gathering
 * - Animation during gathering
 * - Integration with ResourceSystem for actual gathering logic
 */

import THREE from '../extras/three';
import { SystemBase } from './SystemBase';
import type { World } from '../types';
import { Entity } from '../entities/Entity';
import { EventType } from '../types/events';
import type { Position3D } from '../types/base-types';
import { Logger } from '../utils/Logger';

interface ResourceInteractable {
  id: string;
  type: string;
  position: Position3D;
  mesh?: THREE.Object3D;
  instanceId?: number;
  isAvailable: boolean;
  requiredTool?: string;
}

interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  enabled: boolean;
}

interface ActiveGathering {
  resourceId: string;
  playerId: string;
  startTime: number;
  animationInterval?: NodeJS.Timer;
}

export class ResourceInteractionSystem extends SystemBase {
  private resources = new Map<string, ResourceInteractable>();
  private activeGathering: ActiveGathering | null = null;
  private raycaster = new THREE.Raycaster();
  private canvas: HTMLCanvasElement | null = null;
  private _tempVec3 = new THREE.Vector3();
  private _tempVec2 = new THREE.Vector2();
  
  // Mobile long-press support
  private touchStart: { x: number; y: number; time: number } | null = null;
  private longPressTimer: NodeJS.Timeout | null = null;
  private readonly LONG_PRESS_DURATION = 500; // 500ms for long-press
  
  constructor(world: World) {
    super(world, { 
      name: 'resource-interaction', 
      dependencies: { required: [], optional: ['resource', 'interaction'] },
      autoCleanup: true 
    });
  }

  async init(): Promise<void> {
    // Listen for resource spawn events to register interactables
    this.subscribe(EventType.RESOURCE_SPAWN_POINTS_REGISTERED, (data: {
      spawnPoints: Array<{
        position: Position3D;
        type: string;
        subType: string;
        id: string;
      }>;
    }) => {
      data.spawnPoints.forEach(point => {
        this.registerResource({
          id: point.id,
          type: point.subType || point.type,
          position: point.position,
          isAvailable: true,
          requiredTool: this.getRequiredTool(point.type)
        });
      });
    });

    // Listen for tree creation from test systems
    this.subscribe(EventType.TEST_TREE_CREATE, (data: {
      id: string;
      position: Position3D;
      type: string;
    }) => {
      this.registerResource({
        id: data.id,
        type: data.type,
        position: data.position,
        isAvailable: true,
        requiredTool: 'hatchet'
      });
          });

    // Listen for resource depletion
    this.subscribe(EventType.RESOURCE_DEPLETED, (data: { resourceId: string }) => {
      const resource = this.resources.get(data.resourceId);
      if (resource) {
        resource.isAvailable = false;
      }
    });

    // Listen for resource respawn
    this.subscribe(EventType.RESOURCE_RESPAWNED, (data: { resourceId: string }) => {
      const resource = this.resources.get(data.resourceId);
      if (resource) {
        resource.isAvailable = true;
      }
    });

    // Listen for gathering completion
    this.subscribe(EventType.RESOURCE_GATHERING_COMPLETED, (data: {
      playerId: string;
      resourceId: string;
      skill: string;
      success: boolean;
    }) => {
      if (this.activeGathering && this.activeGathering.resourceId === data.resourceId) {
        this.stopGatheringAnimation();
      }
    });

    // Listen for gathering stopped
    this.subscribe(EventType.RESOURCE_GATHERING_STOPPED, (data: {
      playerId: string;
      resourceId: string;
    }) => {
      if (this.activeGathering && this.activeGathering.resourceId === data.resourceId) {
        this.stopGatheringAnimation();
      }
    });

    // Listen for resource action events from UI
    this.subscribe(EventType.RESOURCE_ACTION, (data: {
      playerId: string;
      resourceId: string;
      action: string;
    }) => {
      this.handleResourceAction(data);
    });
  }

  start(): void {
    // Get canvas for mouse events
    this.canvas = this.world.graphics?.renderer?.domElement || null;
    
    if (this.canvas) {
      // Add event handlers with capture phase for higher priority
      // IMPORTANT: bind once so we can remove listeners later without leaks
      this.onContextMenu = this.onContextMenu.bind(this)
      this.onMouseDown = this.onMouseDown.bind(this)
      this.onLeftClick = this.onLeftClick.bind(this)
      this.onTouchStart = this.onTouchStart.bind(this)
      this.onTouchEnd = this.onTouchEnd.bind(this)
      
      this.canvas.addEventListener('contextmenu', this.onContextMenu, true)
      this.canvas.addEventListener('mousedown', this.onMouseDown, true)
      this.canvas.addEventListener('click', this.onLeftClick, true)
      // Mobile: long-press for context menu
      this.canvas.addEventListener('touchstart', this.onTouchStart, true)
      this.canvas.addEventListener('touchend', this.onTouchEnd, true)
    }
  }

  private onContextMenu(event: MouseEvent): void {
    const resource = this.getResourceAtPosition(event.clientX, event.clientY);
    
    if (resource) {
      // Prevent default context menu and camera orbit
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.showResourceContextMenu(resource, event.clientX, event.clientY);
    }
    // Don't prevent default if not clicking on resource - allow camera orbit
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button === 2) { // Right-click
      // Check if clicking on resource to prevent camera orbit
      const resource = this.getResourceAtPosition(event.clientX, event.clientY);
      if (resource) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    } else if (event.button !== 2) { // Not right-click
      // Close context menu on any other click
      this.emitTypedEvent(EventType.UI_CLOSE_MENU, {});
    }
  }

  private onLeftClick(event: MouseEvent): void {
    // Left-click on resources is handled by InteractionSystem for movement
    // We only handle right-click context menus, not left-click auto-actions
    // This allows click-to-move to work normally
  }
  
  private onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;
    
    this.touchStart = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
    
    // Set up long-press timer
    this.longPressTimer = setTimeout(() => {
      if (this.touchStart) {
        console.log('[ResourceInteraction] Long-press detected');
        const resource = this.getResourceAtPosition(this.touchStart.x, this.touchStart.y);
        if (resource) {
          // Prevent default and show context menu
          event.preventDefault();
          event.stopPropagation();
          this.showResourceContextMenu(resource, this.touchStart.x, this.touchStart.y);
        }
        this.touchStart = null;
      }
    }, this.LONG_PRESS_DURATION);
  }
  
  private onTouchEnd(event: TouchEvent): void {
    // Clear long-press timer
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    
    // Check if this was a quick tap (not a long-press)
    if (this.touchStart && Date.now() - this.touchStart.time < this.LONG_PRESS_DURATION) {
      // Quick tap - treat as left-click (allow movement)
      // Don't show context menu
    }
    
    this.touchStart = null;
  }

  private getLocalPlayer(): Entity | null {
    // Get the local player from the world's entities
    if (this.world.entities) {
      return this.world.entities.player || null;
    }
    return null;
  }

  private handleActionExecute(params: {
    resourceId: string;
    resourceType: string;
    position: Position3D;
    action: string;
    playerId: Entity | null;
  }): void {
    if (!params.playerId) return;

    // Emit resource action event
    this.emitTypedEvent(EventType.RESOURCE_ACTION, {
      playerId: params.playerId.id,
      resourceId: params.resourceId,
      resourceType: params.resourceType,
      action: params.action,
      position: params.position
    });
  }

  private getDefaultAction(resourceType: string): string {
    // Define default actions for each resource type
    const defaultActions: Record<string, string> = {
      'tree': 'chop',
      'normal_tree': 'chop', 
      'oak_tree': 'chop',
      'willow_tree': 'chop',
      'rock': 'mine',
      'fishing_spot': 'fish'
    };
    return defaultActions[resourceType] || 'gather';
  }

  private getResourceAtPosition(screenX: number, screenY: number): ResourceInteractable | null {
    if (!this.canvas || !this.world.camera || !this.world.stage?.scene) return null;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = ((screenX - rect.left) / rect.width) * 2 - 1;
    const y = -((screenY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this._tempVec2.set(x, y), this.world.camera);
    
    // First try raycasting against actual 3D objects in the scene
    const intersects = this.raycaster.intersectObjects(this.world.stage.scene.children, true);
    
    for (const intersect of intersects) {
      if (intersect.object.userData?.resourceId) {
        // Found a resource mesh
        const resourceId = intersect.object.userData.resourceId;
        const resource = this.resources.get(resourceId);
        if (resource) {
          return resource;
        }
      }
    }
    
    // Fallback: Check against resource positions (for resources without meshes yet)
    let closestResource: ResourceInteractable | null = null;
    let closestDistance = Infinity;
    
    for (const resource of this.resources.values()) {
      const resourcePos = this._tempVec3.set(
        resource.position.x,
        resource.position.y || 0,
        resource.position.z
      );
      
      const distance = this.raycaster.ray.distanceToPoint(resourcePos);
      
      // Check if ray is close enough to resource (within 2 units for easier clicking)
      if (distance < 2 && distance < closestDistance) {
        // Additional distance check from camera
        const cameraDistance = this.world.camera.position.distanceTo(resourcePos);
        if (cameraDistance < 50) { // Max interaction distance
          closestResource = resource;
          closestDistance = distance;
        }
      }
    }
    
    return closestResource;
  }

  private showResourceContextMenu(resource: ResourceInteractable, screenX: number, screenY: number): void {
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
    Logger.system('ResourceInteractionSystem', `Showing context menu for resource: ${resource.id} (${resource.type})`);
    
    // Build actions WITHOUT onClick handlers (they can't be serialized through events)
    // Instead, the UI will emit RESOURCE_ACTION events with the action ID
    const actions: ContextMenuItem[] = [];
    
    // Add appropriate actions based on resource type
    if (resource.type.includes('tree')) {
      actions.push({
        id: 'chop',
        label: 'Chop',
        icon: '🪓',
        enabled: resource.isAvailable
      });
    } else if (resource.type.includes('rock') || resource.type.includes('ore')) {
      actions.push({
        id: 'mine',
        label: 'Mine',
        icon: '⛏️',
        enabled: resource.isAvailable
      });
    } else if (resource.type.includes('fish')) {
      actions.push({
        id: 'fish',
        label: 'Fish',
        icon: '🎣',
        enabled: resource.isAvailable
      });
    }
    
    // Add examine action for all resources
    actions.push({
      id: 'examine',
      label: 'Examine',
      icon: '🔍',
      enabled: true
    });
    
    // Emit event to show context menu
    this.emitTypedEvent(EventType.UI_OPEN_MENU, {
      playerId: localPlayer.id,
      type: 'context',
      position: { x: screenX, y: screenY },
      actions: actions,
      targetId: resource.id,
      targetType: 'resource'
    });
  }

  private handleResourceAction(data: { playerId: string; resourceId: string; action: string }): void {
    console.log(`[ResourceInteraction] 🎯 Player ${data.playerId} action: ${data.action} on resource ${data.resourceId}`);
    
    const resource = this.resources.get(data.resourceId);
    if (!resource) {
      console.warn(`[ResourceInteraction] ⚠️ Resource not found: ${data.resourceId}`);
      return;
    }

    // Execute the appropriate action
    switch (data.action) {
      case 'chop':
        console.log('[ResourceInteraction] Starting chopping tree...');
        this.startChoppingTree(resource);
        break;
      case 'mine':
        console.log('[ResourceInteraction] Starting mining...');
        this.startMining(resource);
        break;
      case 'fish':
        console.log('[ResourceInteraction] Starting fishing...');
        this.startFishing(resource);
        break;
      case 'examine':
        this.examineResource(resource);
        break;
      default:
        console.warn(`[ResourceInteraction] Unknown action: ${data.action}`);
    }
  }

  private startChoppingTree(resource: ResourceInteractable): void {
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
    console.log(`[ResourceInteraction] 🚶 Starting to chop tree at (${resource.position.x.toFixed(1)}, ${resource.position.z.toFixed(1)})`);
        
    // Calculate position near tree (1.5 units away)
    const playerPos = localPlayer.position;
    const treePos = resource.position;
    
    // Check current distance
    const currentDistance = Math.sqrt(
      Math.pow(playerPos.x - treePos.x, 2) +
      Math.pow(playerPos.z - treePos.z, 2)
    );
    
    console.log(`[ResourceInteraction] Current distance to tree: ${currentDistance.toFixed(2)}m`);
    
    // If already close enough, start gathering immediately
    if (currentDistance < 2.5) {
      console.log(`[ResourceInteraction] ✅ Already close enough, starting gathering immediately`);
      this.startGatheringImmediately(resource, localPlayer);
      return;
    }
    
    // Calculate position near tree (1.5 units away)
    const direction = this._tempVec3.set(
      playerPos.x - treePos.x,
      0,
      playerPos.z - treePos.z
    ).normalize();
    
    const targetPos = {
      x: treePos.x + direction.x * 1.5,
      y: treePos.y || 0,
      z: treePos.z + direction.z * 1.5
    };
    
    console.log(`[ResourceInteraction] 🚶 Moving player to tree, target: (${targetPos.x.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
    
    // Get player's current run mode
    const playerRunMode = (localPlayer as { runMode?: boolean }).runMode !== false; // Default to run
    
    // Send move request to server (server-authoritative movement)
    if (this.world.network?.send) {
      this.world.network.send('moveRequest', {
        target: [targetPos.x, targetPos.y, targetPos.z],
        runMode: playerRunMode,
        cancel: false
      });
      
      console.log(`[ResourceInteraction] Move request sent with runMode: ${playerRunMode ? 'RUN' : 'WALK'}`);
    }
    
    // Set up proximity checking
    this.activeGathering = {
      resourceId: resource.id,
      playerId: localPlayer.id,
      startTime: Date.now()
    };
    
    // Start checking for proximity
    const checkInterval = setInterval(() => {
      if (!this.activeGathering || this.activeGathering.resourceId !== resource.id) {
        clearInterval(checkInterval);
        return;
      }
      
      const currentPlayer = this.world.getPlayer();
      if (!currentPlayer) {
        clearInterval(checkInterval);
        this.activeGathering = null;
        return;
      }
      
      const distance = Math.sqrt(
        Math.pow(currentPlayer.position.x - treePos.x, 2) +
        Math.pow(currentPlayer.position.z - treePos.z, 2)
      );
      
      if (distance < 2.5) {
        // Player is close enough, start gathering
        console.log(`[ResourceInteraction] ✅ Reached tree! Distance: ${distance.toFixed(2)}m`);
        clearInterval(checkInterval);
        this.startGatheringImmediately(resource, currentPlayer);
      }
      
      // Timeout after 10 seconds
      if (Date.now() - this.activeGathering.startTime > 10000) {
        clearInterval(checkInterval);
        this.activeGathering = null;
        console.warn('[ResourceInteraction] ⏱️ Timeout waiting for player to reach tree');
      }
    }, 100);
  }
  
  private startGatheringImmediately(resource: ResourceInteractable, player: Entity): void {
    this.startGatheringAnimation(resource);
    
    // Calculate gathering duration (3-5 seconds based on skill)
    const gatheringDuration = 5000; // Will be refined by ResourceSystem based on skill
    
    console.log(`[ResourceInteraction] 🪓 Sending gather request to server for resource ${resource.id}`);
    
    // Send gather request to SERVER via network
    if (this.world.network?.send) {
      this.world.network.send('gatherResource', {
        resourceId: resource.id,
        playerPosition: {
          x: player.position.x,
          y: player.position.y,
          z: player.position.z
        }
      });
      console.log(`[ResourceInteraction] ✉️ Gather request sent to server`);
    } else {
      console.error('[ResourceInteraction] ❌ No network connection to send gather request!');
    }
    
    // Also emit local event for progress bar UI (client-side only)
    this.emitTypedEvent(EventType.RESOURCE_GATHERING_STARTED, {
      playerId: player.id,
      resourceId: resource.id,
      playerPosition: player.position,
      action: resource.type.includes('tree') ? 'Chopping' : 'Gathering',
      duration: gatheringDuration
    });
  }

  private startGatheringAnimation(resource: ResourceInteractable): void {
    if (!this.activeGathering) return;
    
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
        
    // Play jump animation every second (since we don't have a chop animation)
    let animationCount = 0;
    const maxAnimations = 3; // 3 jumps for gathering
    
    this.activeGathering.animationInterval = setInterval(() => {
      if (!this.activeGathering || animationCount >= maxAnimations) {
        this.stopGatheringAnimation();
        return;
      }
      
      // Emit jump animation event
      this.emitTypedEvent(EventType.PLAYER_ANIMATION, {
        playerId: localPlayer.id,
        animation: 'jump',
        duration: 500
      });
      
      // Visual feedback - play sound or particle effect
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: localPlayer.id,
        message: '*chop*',
        type: 'action'
      });
      
      animationCount++;
      
          }, 1000);
  }

  private stopGatheringAnimation(): void {
    if (this.activeGathering?.animationInterval) {
      clearInterval(this.activeGathering.animationInterval);
          }
    this.activeGathering = null;
  }

  private startMining(_resource: ResourceInteractable): void {
    // Similar to chopping but for mining rocks
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
        
    // For now, just emit a message - implement similar to chopping
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId: localPlayer.id,
      message: 'Mining not yet implemented',
      type: 'info'
    });
  }

  private startFishing(_resource: ResourceInteractable): void {
    // Similar to chopping but for fishing spots
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
        
    // For now, just emit a message - implement similar to chopping
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId: localPlayer.id,
      message: 'Fishing not yet implemented',
      type: 'info'
    });
  }

  private examineResource(resource: ResourceInteractable): void {
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
    const examineText = this.getExamineText(resource.type);
    
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId: localPlayer.id,
      message: examineText,
      type: 'examine'
    });
  }

  private getExamineText(resourceType: string): string {
    const examineTexts: Record<string, string> = {
      'normal_tree': 'A regular tree. I can chop it down with a hatchet.',
      'oak_tree': 'An oak tree. It looks sturdy and would provide good logs.',
      'willow_tree': 'A willow tree. Its drooping branches sway in the wind.',
      'maple_tree': 'A maple tree. Its wood is prized for crafting.',
      'mining_rock': 'A rock containing ore. I could mine it with a pickaxe.',
      'fishing_spot': 'Fish are swimming in the water here. I could catch them with a fishing rod.'
    };
    
    return examineTexts[resourceType] || 'A resource I can gather with the right tools.';
  }

  private getRequiredTool(resourceType: string): string {
    const toolMap: Record<string, string> = {
      'tree': 'hatchet',
      'rock': 'pickaxe',
      'ore': 'pickaxe',
      'fish': 'fishing_rod'
    };
    
    return toolMap[resourceType] || '';
  }

  private registerResource(resource: ResourceInteractable): void {
    this.resources.set(resource.id, resource);
    Logger.system('ResourceInteractionSystem', `Registered resource: ${resource.id} (${resource.type}) at (${resource.position.x.toFixed(0)}, ${resource.position.z.toFixed(0)})`);
  }

  update(_deltaTime: number): void {
    // Update logic if needed
  }

  destroy(): void {
    if (this.canvas) {
      // Remove using the same bound references to prevent listener leaks
      this.canvas.removeEventListener('contextmenu', this.onContextMenu as EventListener);
      this.canvas.removeEventListener('mousedown', this.onMouseDown as EventListener);
      this.canvas.removeEventListener('click', this.onLeftClick as EventListener);
      this.canvas.removeEventListener('touchstart', this.onTouchStart as EventListener);
      this.canvas.removeEventListener('touchend', this.onTouchEnd as EventListener);
    }
    
    if (this.activeGathering?.animationInterval) {
      clearInterval(this.activeGathering.animationInterval);
    }
    
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    
    this.resources.clear();
  }

  // Required System lifecycle methods
  preTick(): void {}
  preFixedUpdate(): void {}
  fixedUpdate(_dt: number): void {}
  postFixedUpdate(): void {}
  preUpdate(): void {}
  postUpdate(): void {}
  lateUpdate(): void {}
  postLateUpdate(): void {}
  commit(): void {}
  postTick(): void {}
}

