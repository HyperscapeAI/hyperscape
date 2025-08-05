/**
 * RPG Client Interaction System
 * Handles all client-side user interactions and connects them to server systems
 * - Point-and-click movement
 * - Click-to-attack combat
 * - Item pickup interactions
 * - Equipment management
 * - UI feedback
 */

import * as THREE from '../../core/extras/three';
import { RPGSystemBase } from './RPGSystemBase';
import { EventType } from '../../types/events';
import type { World } from '../../types/index';
import type { ClientControls } from '../../core/systems/ClientControls';

// Define proper types for player
interface LocalPlayer {
  id: string;
  data: { id: string };
  position: THREE.Vector3;
}

// Define proper types for userData on THREE objects
interface RPGUserData {
  type: string;
  id: string;
  itemType: string;
  entityId: string;
  [key: string]: unknown;
}

// Define event data types
interface AvatarReadyEvent {
  playerId: string;
  avatar: THREE.Object3D;
  camHeight: number;
}

interface PlayerPositionUpdateEvent {
  playerId: string;
  position: { x: number; y: number; z: number };
}

interface CombatSessionEvent {
  sessionId: string;
  attackerId: string;
  targetId: string;
}

interface ItemSpawnedEvent {
  itemId: string;
  position: { x: number; y: number; z: number };
}

interface CombatHitEvent {
  sessionId: string;
  attackerId: string;
  targetId: string;
  damage: number;
  hitType: string;
}

export class RPGClientInteractionSystem extends RPGSystemBase {
  private controls!: ClientControls;
  private camera!: THREE.Camera;
  private scene!: THREE.Scene;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private localPlayer!: LocalPlayer;
  private currentTarget!: string;
  private currentTargetType: string = '';
  private isShiftHeld = false;
  
  // Test system data tracking
  private testData = new Map<string, { clicks: number; movements: number; combats: number; pickups: number }>();
  private totalClicks = 0;
  private totalMovements = 0;
  private totalCombatInitiated = 0;
  private totalItemPickups = 0;

  constructor(world: World) {
    super(world, {
      name: 'rpg-client-interaction',
      dependencies: {
        required: [],
        optional: ['client-graphics', 'client-controls', 'rpg-player']
      },
      autoCleanup: true
    });
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  async init(): Promise<void> {
    
    // Only run on client
    if (!this.world.isClient) {
      return;
    }

    // Defer actual initialization to start() when player and rendering context are available
  }

  start(): void {
    // Try to initialize when system starts
    this.tryInitialize();
  }

  private tryInitialize(): void {
    // Get local player - try multiple methods
    const player = this.world.getPlayer() || this.world.entities?.getLocalPlayer();
    if (player) {
      this.localPlayer = player as LocalPlayer;
    }
    
    if (!this.localPlayer) {
      // Retry after a short delay
      setTimeout(() => this.tryInitialize(), 100);
      return;
    }

    // Set up camera and scene references - try multiple sources
    this.camera = this.world.camera;
    this.scene = this.world.stage.scene;
    
    if (!this.camera || !this.scene) {
      // Retry after a short delay
      setTimeout(() => this.tryInitialize(), 100);
      return;
    }


    // Set up event listeners
    this.setupEventListeners();
    
    // Listen for world events
    this.world.on(EventType.PLAYER_POSITION_UPDATED, (data: unknown) => this.onPlayerPositionUpdate(data as PlayerPositionUpdateEvent));
    this.world.on(EventType.COMBAT_STARTED, (data: unknown) => this.onCombatStarted(data as CombatSessionEvent));
    this.world.on(EventType.COMBAT_ENDED, (data: unknown) => this.onCombatEnded(data as CombatSessionEvent));
    this.world.on(EventType.ITEM_SPAWNED, (data: unknown) => this.onItemSpawned(data as ItemSpawnedEvent));
    
    // Listen for avatar ready events to ensure we have proper player reference
    this.world.on(EventType.PLAYER_AVATAR_READY, (data: unknown) => this.onAvatarReady(data as AvatarReadyEvent));
    
  }
  
  private onAvatarReady(data: AvatarReadyEvent): void {
    
    // Update local player reference if needed
    if (!this.localPlayer || (this.localPlayer.id || this.localPlayer.data?.id) === data.playerId) {
      const player = this.world.getPlayer() || this.world.entities?.getLocalPlayer();
      if (player) {
        this.localPlayer = player as LocalPlayer;
      }
    }
  }

  private setupEventListeners(): void {
    // Mouse click handler
    window.addEventListener('click', this.onMouseClick.bind(this), false);
    window.addEventListener('contextmenu', this.onRightClick.bind(this), false);
    window.addEventListener('mousemove', this.onMouseMove.bind(this), false);
    
    // Keyboard handlers
    window.addEventListener('keydown', this.onKeyDown.bind(this), false);
    window.addEventListener('keyup', this.onKeyUp.bind(this), false);
    
  }

  private onMouseClick(event: MouseEvent): void {

    // Update mouse position
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Get all intersectable objects
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    if (intersects.length === 0) {
      // Click on empty ground - move player
      this.handleGroundClick(event);
      return;
    }

    const clickedObject = intersects[0];
    const userData = clickedObject.object.userData as RPGUserData;


    // Determine what was clicked and handle accordingly
    if (userData.type === 'rpg_item') {
      this.handleItemClick(clickedObject, userData as { id: string; itemType: string });
    } else if (userData.type === 'rpg_mob') {
      this.handleMobClick(clickedObject, userData as { id: string });
    } else if (userData.type === 'rpg_player') {
      this.handlePlayerClick(clickedObject, userData);
    } else if (userData.type === 'corpse') {
      this.handleCorpseClick(clickedObject, userData);
    } else {
      // Unknown object or terrain - try to move
      this.handleGroundClick(event);
    }
  }

  private onRightClick(event: MouseEvent): void {
    event.preventDefault();
    
    if (!this.camera || !this.scene) return;

    // Update mouse position
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    if (intersects.length > 0) {
      const clickedObject = intersects[0];
      const userData = clickedObject.object.userData as RPGUserData;

      // Handle right-click context actions
      if (userData.type === 'rpg_item') {
        this.handleItemRightClick(clickedObject, userData as { id: string; itemType: string });
      }
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.camera || !this.scene) return;

    // Update mouse position
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    // Update cursor and highlight targets
    this.updateCursorAndHighlight(intersects);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.isShiftHeld = true;
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.isShiftHeld = false;
    }
  }

  private handleGroundClick(event: MouseEvent): void {
    // Calculate world position from click
    const worldPosition = this.getWorldPositionFromClick(event)!;

    const isRunning = this.isShiftHeld; // Hold shift to run


    // Track for test system
    this.totalClicks++;
    this.totalMovements++;

    // Get current player position
    const playerPos = this.localPlayer.position;
    const playerId = this.localPlayer.id;

    // Send movement request to server
    this.emitTypedEvent(EventType.MOVEMENT_CLICK_TO_MOVE, {
      playerId: playerId,
      targetPosition: {
        x: worldPosition.x,
        y: worldPosition.y,
        z: worldPosition.z
      },
      currentPosition: {
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z
      },
      isRunning: isRunning
    });


    // Clear any current combat target
    this.clearCurrentTarget();
  }

  private handleItemClick(clickedObject: THREE.Intersection, userData: { id: string; itemType: string }): void {
    // Track for test system
    this.totalClicks++;
    this.totalItemPickups++;

    const playerId = this.localPlayer.id;

    // Send pickup request to server
    this.emitTypedEvent(EventType.ITEM_PICKUP, {
      playerId: playerId,
      itemId: userData.id,
      itemType: userData.itemType
    });

    
    // No need to move to item - player can pick up from range
  }

  private handleMobClick(clickedObject: THREE.Intersection, userData: { id: string }): void {
    // Track for test system
    this.totalClicks++;
    this.totalCombatInitiated++;
    this.totalMovements++;

    // Set as current target
    this.setCurrentTarget(userData.id, 'mob');

    const playerId = this.localPlayer.id;

    // Start combat with the mob
    this.emitTypedEvent(EventType.COMBAT_START_ATTACK, {
      attackerId: playerId,
      targetId: userData.id,
      attackStyle: 'accurate' // Default attack style for MVP
    });

    
  }

  private handlePlayerClick(_clickedObject: THREE.Intersection, _userData: RPGUserData): void {
    // For now, clicking on players does nothing (no PvP in MVP)
    // Could show player info or trade window in future
    
  }

  private handleCorpseClick(clickedObject: THREE.Intersection, userData: RPGUserData): void {
    const playerId = this.localPlayer.id;

    // Get corpse ID from the object name or userData
    const corpseId = clickedObject.object.name || userData.entityId;

    // Track for test system
    this.totalClicks++;

    // Emit corpse click event
    this.emitTypedEvent(EventType.CORPSE_CLICK, {
      corpseId: corpseId,
      playerId: playerId,
      position: {
        x: clickedObject.point.x,
        y: clickedObject.point.y,
        z: clickedObject.point.z
      }
    });
  }

  private handleItemRightClick(_clickedObject: THREE.Intersection, _userData: { id: string; itemType: string }): void {
    // Could open context menu for items (examine, drop, etc)
    
  }

  private getWorldPositionFromClick(_event: MouseEvent): THREE.Vector3 | null {
    if (!this.camera || !this.scene) return null;

    // Create a plane at ground level (y = 0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const worldPosition = new THREE.Vector3();

    // Cast ray and find intersection with ground plane
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hasIntersection = this.raycaster.ray.intersectPlane(plane, worldPosition);

    if (!hasIntersection) {
      // Try using the first mesh intersection point
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
      if (intersects.length > 0) {
        return intersects[0].point;
      }
      return null;
    }

    return worldPosition;
  }

  private updateCursorAndHighlight(intersects: THREE.Intersection[]): void {
    // Update cursor style based on what's being hovered
    let cursorStyle = 'default';
    
    if (intersects.length > 0) {
      const userData = intersects[0].object.userData as RPGUserData;
      
      if (userData.type === 'rpg_item') {
        cursorStyle = 'pointer';
      } else if (userData.type === 'rpg_mob') {
        cursorStyle = 'crosshair';
      } else if (userData.type === 'rpg_player') {
        cursorStyle = 'help';
      }
    }
    
    document.body.style.cursor = cursorStyle;

    // TODO: Add visual highlighting of hovered objects
  }

  private setCurrentTarget(targetId: string, targetType: string): void {
    this.currentTarget = targetId;
    this.currentTargetType = targetType;

    // Emit target selection event for UI
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId: this.localPlayer.id,
      message: `Target selected: ${targetType}`,
      type: 'info' as const
    });
  }

  private clearCurrentTarget(): void {
    this.currentTarget = '';
    this.currentTargetType = '';

    // Emit target cleared event for UI
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId: this.localPlayer.id,
      message: 'Target cleared',
      type: 'info' as const
    });
  }

  // Event handlers for world events
  private onPlayerPositionUpdate(_data: PlayerPositionUpdateEvent): void {
    // Could be used to update local position prediction
  }

  private onCombatStarted(_data: CombatSessionEvent): void {
    
  }

  private onCombatEnded(data: CombatSessionEvent): void {
    
    // Clear target if it was involved in the ended combat
    if (this.currentTarget === data.targetId || this.currentTarget === data.attackerId) {
      this.clearCurrentTarget();
    }
  }

  private onItemSpawned(_data: ItemSpawnedEvent): void {
    
  }

  // Public test interface methods
  getTestStatistics(): {
    totalClicks: number;
    totalMovements: number;
    totalCombatInitiated: number;
    totalItemPickups: number;
  } {
    return {
      totalClicks: this.totalClicks,
      totalMovements: this.totalMovements, 
      totalCombatInitiated: this.totalCombatInitiated,
      totalItemPickups: this.totalItemPickups
    };
  }

  resetTestStatistics(): void {
    this.totalClicks = 0;
    this.totalMovements = 0;
    this.totalCombatInitiated = 0;
    this.totalItemPickups = 0;
    this.testData.clear();
  }

  // Called when a combat hit is registered (from server)
  onCombatHit(data: CombatHitEvent): void {
    
    
    // Visual feedback for hits
    if (data.targetId === this.localPlayer.id) {
      // Player was hit - flash screen red or shake camera
      this.showDamageEffect();
    } else if (data.attackerId === this.localPlayer.id) {
      // Player hit something - show hit marker
      this.showHitMarker(data.damage, data.hitType);
    }
  }

  private showDamageEffect(): void {
    // Create a red flash overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'red';
    overlay.style.opacity = '0.3';
    overlay.style.pointerEvents = 'none';
    overlay.style.transition = 'opacity 0.2s';
    
    document.body.appendChild(overlay);
    
    // Fade out and remove
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 200);
    }, 100);
  }

  private showHitMarker(damage: number, hitType: string): void {
    // Create floating damage number
    const hitMarker = document.createElement('div');
    hitMarker.textContent = damage.toString();
    hitMarker.style.position = 'fixed';
    hitMarker.style.left = '50%';
    hitMarker.style.top = '50%';
    hitMarker.style.transform = 'translate(-50%, -50%)';
    hitMarker.style.color = hitType === 'critical' ? '#FFD700' : '#FFFFFF';
    hitMarker.style.fontSize = hitType === 'critical' ? '32px' : '24px';
    hitMarker.style.fontWeight = 'bold';
    hitMarker.style.pointerEvents = 'none';
    hitMarker.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
    hitMarker.style.transition = 'all 0.5s ease-out';
    
    document.body.appendChild(hitMarker);
    
    // Animate upward and fade out
    requestAnimationFrame(() => {
      hitMarker.style.transform = 'translate(-50%, -150%)';
      hitMarker.style.opacity = '0';
    });
    
    setTimeout(() => hitMarker.remove(), 500);
  }

  // System lifecycle methods
  update(_dt: number): void {
    // Update any ongoing visual effects or UI elements
  }

  destroy(): void {
    // Remove event listeners
    window.removeEventListener('click', this.onMouseClick.bind(this));
    window.removeEventListener('contextmenu', this.onRightClick.bind(this));
    window.removeEventListener('mousemove', this.onMouseMove.bind(this));
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
    window.removeEventListener('keyup', this.onKeyUp.bind(this));
    
    // Reset cursor
    document.body.style.cursor = 'default';
  }

  // Required RPGSystemBase methods
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