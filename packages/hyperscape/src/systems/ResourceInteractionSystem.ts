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
  onClick: () => void;
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
      Logger.system('ResourceInteractionSystem', `Registered test tree: ${data.id} at position`, { ...data.position });
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
  }

  start(): void {
    // Get canvas for mouse events
    this.canvas = this.world.graphics?.renderer?.domElement || null;
    
    if (this.canvas) {
      // Add event handlers with capture phase for higher priority
      // This ensures we handle events before camera controls
      this.canvas.addEventListener('contextmenu', this.onContextMenu.bind(this), true);
      this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this), true);
      this.canvas.addEventListener('click', this.onLeftClick.bind(this), true);
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
    // RuneScape-style: left-click performs default action
    const resource = this.getResourceAtPosition(event.clientX, event.clientY);
    
    if (resource) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      // Get local player
      const localPlayer = this.getLocalPlayer();
      if (!localPlayer) {
        console.warn('[ResourceInteractionSystem] No local player found');
        return;
      }
      
      // Perform default action based on resource type
      const defaultAction = this.getDefaultAction(resource.type);
      if (defaultAction) {
        this.handleActionExecute({
          resourceId: resource.id,
          resourceType: resource.type,
          position: resource.position,
          action: defaultAction,
          playerId: localPlayer
        });
      }
    }
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
    
    const actions: ContextMenuItem[] = [];
    
    // Add appropriate actions based on resource type
    if (resource.type.includes('tree')) {
      actions.push({
        id: 'chop',
        label: 'Chop',
        icon: '🪓',
        enabled: resource.isAvailable,
        onClick: () => this.startChoppingTree(resource)
      });
    } else if (resource.type.includes('rock') || resource.type.includes('ore')) {
      actions.push({
        id: 'mine',
        label: 'Mine',
        icon: '⛏️',
        enabled: resource.isAvailable,
        onClick: () => this.startMining(resource)
      });
    } else if (resource.type.includes('fish')) {
      actions.push({
        id: 'fish',
        label: 'Fish',
        icon: '🎣',
        enabled: resource.isAvailable,
        onClick: () => this.startFishing(resource)
      });
    }
    
    // Add examine action for all resources
    actions.push({
      id: 'examine',
      label: 'Examine',
      icon: '🔍',
      enabled: true,
      onClick: () => this.examineResource(resource)
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

  private startChoppingTree(resource: ResourceInteractable): void {
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
    Logger.system('ResourceInteractionSystem', `Starting to chop tree: ${resource.id}`);
    
    // Calculate position near tree (1.5 units away)
    const playerPos = localPlayer.position;
    const treePos = resource.position;
    
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
    
    // Move player to tree
    this.emitTypedEvent(EventType.MOVEMENT_CLICK_TO_MOVE, {
      playerId: localPlayer.id,
      targetPosition: targetPos,
      currentPosition: playerPos,
      isRunning: false
    });
    
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
        clearInterval(checkInterval);
        this.startGatheringAnimation(resource);
        
        // Emit gathering started event
        this.emitTypedEvent(EventType.RESOURCE_GATHERING_STARTED, {
          playerId: localPlayer.id,
          resourceId: resource.id,
          playerPosition: currentPlayer.position
        });
        
        Logger.system('ResourceInteractionSystem', 'Player reached tree, starting gathering animation');
      }
      
      // Timeout after 10 seconds
      if (Date.now() - this.activeGathering.startTime > 10000) {
        clearInterval(checkInterval);
        this.activeGathering = null;
        Logger.systemWarn('ResourceInteractionSystem', 'Timeout waiting for player to reach tree');
      }
    }, 100);
  }

  private startGatheringAnimation(resource: ResourceInteractable): void {
    if (!this.activeGathering) return;
    
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
    Logger.system('ResourceInteractionSystem', 'Starting gathering animation (jump emote)');
    
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
      
      Logger.system('ResourceInteractionSystem', `Chopping animation ${animationCount}/${maxAnimations}`);
    }, 1000);
  }

  private stopGatheringAnimation(): void {
    if (this.activeGathering?.animationInterval) {
      clearInterval(this.activeGathering.animationInterval);
      Logger.system('ResourceInteractionSystem', 'Stopped gathering animation');
    }
    this.activeGathering = null;
  }

  private startMining(_resource: ResourceInteractable): void {
    // Similar to chopping but for mining rocks
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
    Logger.system('ResourceInteractionSystem', `Starting to mine: ${_resource.id}`);
    
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
    
    Logger.system('ResourceInteractionSystem', `Starting to fish: ${_resource.id}`);
    
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
    Logger.system('ResourceInteractionSystem', `Registered resource: ${resource.id} of type ${resource.type}`);
  }

  update(_deltaTime: number): void {
    // Update logic if needed
  }

  destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('contextmenu', this.onContextMenu.bind(this));
      this.canvas.removeEventListener('mousedown', this.onMouseDown.bind(this));
      this.canvas.removeEventListener('click', this.onLeftClick.bind(this));
    }
    
    if (this.activeGathering?.animationInterval) {
      clearInterval(this.activeGathering.animationInterval);
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

