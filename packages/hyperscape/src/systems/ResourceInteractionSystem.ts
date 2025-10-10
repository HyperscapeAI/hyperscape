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
  private _contextMenuBlocker?: (e: MouseEvent) => void;
  private floatingLabelEl: HTMLDivElement | null = null;
  private onMenuSelect?: (e: Event) => void;
  private pendingMenuTargets = new Map<string, ResourceInteractable>();
  
  private findResourceObjectById(resourceId: string): THREE.Object3D | null {
    try {
      const scene = this.world.stage?.scene;
      if (!scene) return null;
      const byName = scene.getObjectByName(`resource_${resourceId}`);
      if (byName) return byName;
      // Lightweight scan among top-level children only (no deep traverse)
      for (const child of scene.children) {
        if ((child as any).userData?.resourceId === resourceId) return child;
      }
      return null;
    } catch { return null; }
  }
  
  // Generate server-side canonical resource IDs to match ResourceSystem
  private getServerResourceId(resource: { type: string; position: Position3D }): string {
    const px = Math.round(resource.position.x);
    const pz = Math.round(resource.position.z);
    if (resource.type.includes('tree')) return `tree_${px}_${pz}`;
    if (resource.type.includes('fish')) return `fishing_spot_${px}_${pz}`;
    if (resource.type.includes('herb')) return `herb_patch_${px}_${pz}`;
    if (resource.type.includes('rock') || resource.type.includes('ore')) return `ore_${px}_${pz}`;
    return `${resource.type}_${px}_${pz}`;
  }
  
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

    // Also listen for canonical server spawns to register interactables with exact IDs
    this.subscribe(EventType.RESOURCE_SPAWNED, (data: {
      id: string;
      type: string;
      position: Position3D;
    }) => {
      this.registerResource({
        id: data.id,
        type: data.type,
        position: data.position,
        isAvailable: true,
        requiredTool: this.getRequiredTool(data.type)
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
      // If this was the active target, announce chop completion
      if (this.activeGathering && this.activeGathering.resourceId === data.resourceId) {
        const localPlayer = this.world.getPlayer();
        if (localPlayer) {
          this.emitTypedEvent(EventType.UI_MESSAGE, {
            playerId: localPlayer.id,
            message: 'The tree is chopped down.',
            type: 'success'
          });
        }
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
      // Always suppress default browser context menu on our canvas
      this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); }, { capture: true });
      // Global capture: block context menu if inside canvas bounds
      this._contextMenuBlocker = (e: MouseEvent) => {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          e.preventDefault();
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
        }
      };
      window.addEventListener('contextmenu', this._contextMenuBlocker as EventListener, true);
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
    
    // Single source of truth for RMB selections: global listener
    this.onMenuSelect = ((e: Event) => {
      const ce = e as CustomEvent<{ actionId: string; targetId: string }>;
      if (!ce?.detail) return;
      if (ce.detail.actionId !== 'chop') return;
      Logger.system?.('ResourceInteractionSystem', `RMB select received: action=chop target=${ce.detail.targetId}`);
      const res = this.resources.get(ce.detail.targetId);
      if (res) {
        Logger.system?.('ResourceInteractionSystem', `RMB resolved resource from registry: ${res.id}`);
        this.startChoppingTree(res);
      } else {
        const pending = this.pendingMenuTargets.get(ce.detail.targetId);
        if (pending) {
          Logger.system?.('ResourceInteractionSystem', `RMB resolved resource from pending cache: ${pending.id}`);
          this.startChoppingTree(pending);
        } else {
          Logger.system?.('ResourceInteractionSystem', `RMB could not resolve resource for ${ce.detail.targetId}`);
        }
      }
    }).bind(this);
    window.addEventListener('rpg:contextmenu:select', this.onMenuSelect as EventListener);
  }

  private onContextMenu(event: MouseEvent): void {
    // Always block the browser menu on canvas; show game menu only for resources
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const resource = this.getResourceAtPosition(event.clientX, event.clientY);
    if (resource) {
      this.showResourceContextMenu(resource, event.clientX, event.clientY);
    }
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button === 2) { // Right-click
      // Check if clicking on resource to prevent camera orbit
      const resource = this.getResourceAtPosition(event.clientX, event.clientY);
      if (resource) {
        // Prevent camera handlers and open our context menu
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        console.log('[ResourceInteractionSystem] RMB on resource', resource.id, resource.type);
        this.showResourceContextMenu(resource, event.clientX, event.clientY);
        // Do NOT auto-start; wait for explicit "Chop" selection
      } else {
        // If no resource under cursor, allow default handlers
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
    
    // Set up long-press timer for context menu
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

    // Directly execute the action instead of emitting RESOURCE_ACTION
    if (params.action === 'chop') {
      const res = this.resources.get(params.resourceId) || {
        id: params.resourceId,
        type: params.resourceType,
        position: params.position,
        isAvailable: true,
      } as ResourceInteractable;
      if (!this.resources.has(params.resourceId)) this.registerResource(res);
      this.startChoppingTree(res);
      return;
    }
    if (params.action === 'fish') {
      this.startFishing({ id: params.resourceId, type: params.resourceType, position: params.position, isAvailable: true });
      return;
    }
    if (params.action === 'mine') {
      this.startMining({ id: params.resourceId, type: params.resourceType, position: params.position, isAvailable: true });
      return;
    }
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
      // Ignore skyboxes or far background hits by distance threshold
      if (intersect.distance > 200) continue;
      // Traverse up to find the parent with resourceId
      let obj: THREE.Object3D | null = intersect.object;
      while (obj && !obj.userData?.resourceId) obj = obj.parent as THREE.Object3D | null;
      if (obj && obj.userData?.resourceId) {
        // Found a server-tagged resource mesh; use its exact ID
        const resourceId = obj.userData.resourceId as string;
        const resourceType = (obj.userData.resourceType as string) || 'tree';
        const existing = this.resources.get(resourceId);
        if (existing) return existing;
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);
        const interactable: ResourceInteractable = {
          id: resourceId,
          type: resourceType,
          position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
          mesh: obj,
          isAvailable: true,
          requiredTool: this.getRequiredTool(resourceType),
        };
        this.registerResource(interactable);
        return interactable;
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
    
    // Get the server-side canonical resource ID
    const serverId = this.getServerResourceId(resource);
    const name = resource.type.includes('tree') ? 'Tree' : (resource.type || 'Resource');
    
    Logger.system('ResourceInteractionSystem', `Showing context menu for resource: ${serverId} (${resource.type})`);
    
    // Cache canonical target + ensure registry so selection can always resolve
    const canonical: ResourceInteractable = {
      id: serverId,
      type: resource.type,
      position: resource.position,
      mesh: resource.mesh,
      isAvailable: true,
      requiredTool: this.getRequiredTool(resource.type),
    };
    this.registerResource(canonical);
    this.pendingMenuTargets.set(serverId, canonical);
    
    // Build menu items based on resource type
    const items: Array<{ id: string; label: string; enabled: boolean }> = [];
    
    if (resource.type.includes('tree')) {
      items.push({ id: 'chop', label: 'Chop', enabled: resource.isAvailable });
    } else if (resource.type.includes('rock') || resource.type.includes('ore')) {
      items.push({ id: 'mine', label: 'Mine', enabled: resource.isAvailable });
    } else if (resource.type.includes('fish')) {
      items.push({ id: 'fish', label: 'Fish', enabled: resource.isAvailable });
    }
    
    items.push({ id: 'walk_here', label: 'Walk here', enabled: true });
    items.push({ id: 'examine', label: 'Examine', enabled: true });
    
    // Listen for UI selection before dispatch to avoid any race
    const onSelect = (e: Event) => {
      const ce = e as CustomEvent<{ actionId: string; targetId: string }>;
      if (!ce?.detail) return;
      if (ce.detail.targetId !== serverId) return;
      window.removeEventListener('rpg:contextmenu:select', onSelect as EventListener);
      
      // Handle action selection
      if (ce.detail.actionId === 'chop') {
        let selected = this.resources.get(serverId) || this.pendingMenuTargets.get(serverId);
        if (!selected) {
          const obj = this.findResourceObjectById(serverId);
          if (obj) {
            const wp = new THREE.Vector3();
            obj.getWorldPosition(wp);
            selected = {
              id: serverId,
              type: (obj as any).userData?.resourceType || resource.type || 'tree',
              position: { x: wp.x, y: wp.y, z: wp.z },
              mesh: obj,
              isAvailable: true,
              requiredTool: this.getRequiredTool(resource.type)
            };
            this.registerResource(selected);
          }
        }
        if (selected) this.startChoppingTree(selected);
        this.emitTypedEvent(EventType.UI_CLOSE_MENU, {});
        this.pendingMenuTargets.delete(serverId);
      } else if (ce.detail.actionId === 'walk_here') {
        if (localPlayer && this.world.network?.send) {
          const tp = resource.position;
          this.world.network.send('moveRequest', { target: [tp.x, tp.y || 0, tp.z], runMode: true, cancel: false });
        }
        this.pendingMenuTargets.delete(serverId);
      } else if (ce.detail.actionId === 'examine') {
        this.examineResource(canonical);
        this.pendingMenuTargets.delete(serverId);
      } else if (ce.detail.actionId === 'mine') {
        this.startMining(canonical);
        this.pendingMenuTargets.delete(serverId);
      } else if (ce.detail.actionId === 'fish') {
        this.startFishing(canonical);
        this.pendingMenuTargets.delete(serverId);
      }
    };
    window.addEventListener('rpg:contextmenu:select', onSelect as EventListener, { once: true });

    // Dispatch custom event for React UI to listen to
    const evt = new CustomEvent('rpg:contextmenu', {
      detail: {
        target: {
          id: serverId,
          type: 'resource',
          name,
          position: resource.position,
          resourceType: resource.type,
        },
        mousePosition: { x: screenX, y: screenY },
        items,
      }
    });
    window.dispatchEvent(evt);

    // Ensure a visible in-game context menu exists even if another UI layer isn't mounted
    try {
      // Remove existing menu
      const existing = document.getElementById('rpg-context-menu');
      if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
      // Build minimal menu
      const menu = document.createElement('div');
      menu.id = 'rpg-context-menu';
      menu.style.position = 'fixed';
      menu.style.left = `${screenX}px`;
      menu.style.top = `${screenY}px`;
      menu.style.background = 'rgba(20,20,20,0.95)';
      menu.style.border = '1px solid #555';
      menu.style.padding = '6px 0';
      menu.style.color = '#fff';
      menu.style.fontFamily = 'sans-serif';
      menu.style.fontSize = '14px';
      menu.style.zIndex = '99999';
      menu.style.minWidth = '160px';

      const addRow = (itemId: string, label: string, enabled: boolean) => {
        const row = document.createElement('div');
        row.textContent = label;
        row.style.padding = '6px 12px';
        row.style.cursor = enabled ? 'pointer' : 'not-allowed';
        row.style.opacity = enabled ? '1' : '0.5';
        row.addEventListener('mouseenter', () => { row.style.background = '#2a2a2a'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
        if (enabled) {
          const dispatchSelect = (ev: Event) => {
            ev.preventDefault();
            ev.stopPropagation();
            // @ts-ignore
            ev.stopImmediatePropagation?.();
            console.log('[ResourceInteractionSystem] RMB menu select', itemId, serverId);
            const select = new CustomEvent('rpg:contextmenu:select', { detail: { actionId: itemId, targetId: serverId } });
            window.dispatchEvent(select);
            if (menu.parentElement) menu.parentElement.removeChild(menu);
          };
          row.addEventListener('click', dispatchSelect as EventListener, { capture: false });
          row.addEventListener('mousedown', dispatchSelect as EventListener, { capture: false });
          // @ts-ignore
          row.addEventListener('pointerdown', dispatchSelect as EventListener, { capture: false });
        }
        menu.appendChild(row);
      };

      addRow('chop', 'Chop', true);
      addRow('walk_here', 'Walk here', true);

      document.body.appendChild(menu);
      console.log('[ResourceInteractionSystem] RMB menu rendered');
      // Dismiss handlers (after click so row handlers can fire)
      const dismiss = (evt: MouseEvent | KeyboardEvent) => {
        if (evt instanceof MouseEvent) {
          const target = evt.target as HTMLElement | null;
          if (target && target.closest && target.closest('#rpg-context-menu')) return;
        }
        const el = document.getElementById('rpg-context-menu');
        if (el && el.parentElement) el.parentElement.removeChild(el);
        window.removeEventListener('click', dismiss as EventListener, false);
        window.removeEventListener('scroll', dismiss as EventListener, true);
        window.removeEventListener('keydown', dismiss as EventListener, false);
      };
      setTimeout(() => {
        window.addEventListener('click', dismiss as EventListener, { once: true, capture: false });
        window.addEventListener('scroll', dismiss as EventListener, { once: true, capture: true });
        window.addEventListener('keydown', dismiss as EventListener, { once: true, capture: false });
      }, 0);
    } catch {}
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
    const serverResourceId = this.getServerResourceId(resource);
    
    console.log(`[ResourceInteraction] 🚶 Starting to chop tree at (${resource.position.x.toFixed(1)}, ${resource.position.z.toFixed(1)})`);
    
    // Debounce duplicate starts for the same resource within 1s
    if (this.activeGathering && this.activeGathering.resourceId === serverResourceId && Date.now() - this.activeGathering.startTime < 1000) {
      console.log(`[ResourceInteraction] Ignoring duplicate chop request (debounced)`);
      return;
    }
        
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
      y: (treePos.y || 0),
      z: treePos.z + direction.z * 1.5
    };
    
    console.log(`[ResourceInteraction] 🚶 Moving player to tree, target: (${targetPos.x.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
    
    // Get player's current run mode
    const playerRunMode = (localPlayer as { runMode?: boolean }).runMode !== false; // Default to run
    
    // Move player to tree using server-authoritative movement
    try {
      if (this.world.network?.send) {
        // Cancel any previous move to clear server path
        try { 
          this.world.network.send('moveRequest', { target: null, cancel: true }); 
        } catch {}
        
        this.world.network.send('moveRequest', {
          target: [targetPos.x, targetPos.y, targetPos.z],
          runMode: playerRunMode,
          cancel: false
        });
        
        console.log(`[ResourceInteraction] Move request sent with runMode: ${playerRunMode ? 'RUN' : 'WALK'}`);
      }
    } catch (error) {
      console.error('[ResourceInteraction] Error sending move request:', error);
    }
    
    // Set up proximity checking
    this.activeGathering = {
      resourceId: serverResourceId,
      playerId: localPlayer.id,
      startTime: Date.now()
    };
    
    // Start checking for proximity (increase threshold, align with server ~4m)
    const checkInterval = setInterval(() => {
      if (!this.activeGathering || this.activeGathering.resourceId !== serverResourceId) {
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
      
      if (distance < 4.0) {
        // Player is close enough, start gathering
        console.log(`[ResourceInteraction] ✅ Reached tree! Distance: ${distance.toFixed(2)}m`);
        clearInterval(checkInterval);
        
        // Start gathering immediately
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
      this.world.network.send('resourceGather', {
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
    
    // Show overhead floating text "Chopping..." while gathering
    this.showFloatingText('Chopping...');
        
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
    this.hideFloatingText();
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
    if (this._contextMenuBlocker) {
      window.removeEventListener('contextmenu', this._contextMenuBlocker as EventListener, true);
      this._contextMenuBlocker = undefined;
    }
    if (this.onMenuSelect) {
      window.removeEventListener('rpg:contextmenu:select', this.onMenuSelect as EventListener);
      this.onMenuSelect = undefined;
    }
    
    if (this.activeGathering?.animationInterval) {
      clearInterval(this.activeGathering.animationInterval);
    }
    this.hideFloatingText();
    
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

  private showFloatingText(text: string): void {
    try {
      if (!this.canvas || !this.world.camera) return;
      if (!this.floatingLabelEl) {
        const el = document.createElement('div');
        el.id = 'rpg-floating-text';
        el.style.position = 'fixed';
        el.style.pointerEvents = 'none';
        el.style.color = '#fff';
        el.style.fontFamily = 'sans-serif';
        el.style.fontSize = '14px';
        el.style.fontWeight = '600';
        el.style.textShadow = '0 1px 2px rgba(0,0,0,0.9)';
        el.style.zIndex = '99998';
        document.body.appendChild(el);
        this.floatingLabelEl = el;
      }
      this.floatingLabelEl!.textContent = text;
      // Update position immediately and on animation frames
      const updatePos = () => {
        if (!this.floatingLabelEl || !this.canvas || !this.world.camera) return;
        const player = this.world.getPlayer();
        if (!player) return;
        const rect = this.canvas.getBoundingClientRect();
        const head = new THREE.Vector3(player.position.x, (player.position.y || 0) + 2.0, player.position.z);
        head.project(this.world.camera);
        const sx = rect.left + (head.x + 1) / 2 * rect.width;
        const sy = rect.top + (-head.y + 1) / 2 * rect.height;
        this.floatingLabelEl.style.left = `${sx - 30}px`;
        this.floatingLabelEl.style.top = `${sy - 20}px`;
      };
      updatePos();
      // Tie into the browser's animation loop for smooth tracking
      const rafTick = () => {
        if (!this.floatingLabelEl) return;
        updatePos();
        requestAnimationFrame(rafTick);
      };
      requestAnimationFrame(rafTick);
    } catch {}
  }

  private hideFloatingText(): void {
    if (this.floatingLabelEl && this.floatingLabelEl.parentElement) {
      this.floatingLabelEl.parentElement.removeChild(this.floatingLabelEl);
    }
    this.floatingLabelEl = null;
  }
}

