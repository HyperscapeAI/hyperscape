/**
 * Mob Interaction System
 * Handles click interactions with mobs for combat and examine
 * Similar to ResourceInteractionSystem but for combat
 */

import THREE from '../extras/three';
import { SystemBase } from './SystemBase';
import type { World } from '../types';
import { EventType } from '../types/events';
import type { Position3D } from '../types/base-types';
import { AttackType } from '../types/core';

interface MobInteractable {
  id: string;
  name: string;
  level: number;
  position: Position3D;
  mesh?: THREE.Object3D;
  isAlive: boolean;
  mobType: string;
}

interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  enabled: boolean;
}

export class MobInteractionSystem extends SystemBase {
  private mobs = new Map<string, MobInteractable>();
  private raycaster = new THREE.Raycaster();
  private canvas: HTMLCanvasElement | null = null;
  private _tempVec2 = new THREE.Vector2();
  
  // Mobile long-press support
  private touchStart: { x: number; y: number; time: number } | null = null;
  private longPressTimer: NodeJS.Timeout | null = null;
  private readonly LONG_PRESS_DURATION = 500; // 500ms for long-press
  
  constructor(world: World) {
    super(world, { 
      name: 'mob-interaction', 
      dependencies: { required: [], optional: ['rpg-mob', 'rpg-combat'] },
      autoCleanup: true 
    });
  }

  async init(): Promise<void> {
    // Listen for mob spawn events to register interactables
    this.subscribe(EventType.MOB_SPAWNED, (data: {
      mobId: string;
      mobType: string;
      position: { x: number; y: number; z: number };
      level?: number;
      name?: string;
    }) => {
      this.registerMob({
        id: data.mobId,
        name: data.name || data.mobType,
        level: data.level || 1,
        position: data.position,
        isAlive: true,
        mobType: data.mobType
      });
    });

    // Listen for mob death
    this.subscribe(EventType.MOB_DIED, (data: { mobId: string }) => {
      const mob = this.mobs.get(data.mobId);
      if (mob) {
        mob.isAlive = false;
      }
    });
    
    // Listen for combat attack requests from UI context menu
    this.subscribe(EventType.COMBAT_ATTACK_REQUEST, (data: {
      playerId: string;
      targetId: string;
      attackerType?: string;
      targetType?: string;
    }) => {
      // Only handle if targeting one of our registered mobs
      const localPlayer = this.world.getPlayer();
      if (!localPlayer || localPlayer.id !== data.playerId) return;
      
      const mob = this.mobs.get(data.targetId);
      if (mob && mob.isAlive) {
        console.log(`[MobInteraction] Received attack request for ${mob.name} from UI`);
        this.startAttack(mob, data.playerId);
      }
    });

    // Listen for mob respawn - disabled, no MOB_RESPAWN event exists
    // TODO: Re-enable when proper mob respawn event is added
    // this.subscribe(EventType.MOB_RESPAWN_ALL, () => {
    //   // Handle all mobs respawning
    // });
  }

  start(): void {
    // Get canvas for mouse events
    this.canvas = this.world.graphics?.renderer?.domElement || null;
    
    if (this.canvas) {
      // Add event handlers with capture phase
      this.onContextMenu = this.onContextMenu.bind(this);
      this.onLeftClick = this.onLeftClick.bind(this);
      this.onTouchStart = this.onTouchStart.bind(this);
      this.onTouchEnd = this.onTouchEnd.bind(this);
      
      this.canvas.addEventListener('contextmenu', this.onContextMenu, true);
      this.canvas.addEventListener('click', this.onLeftClick, true);
      // Mobile: long-press for context menu
      this.canvas.addEventListener('touchstart', this.onTouchStart, true);
      this.canvas.addEventListener('touchend', this.onTouchEnd, true);
    }
  }

  private onContextMenu(event: MouseEvent): void {
    const mob = this.getMobAtPosition(event.clientX, event.clientY);
    
    if (mob && mob.isAlive) {
      // Prevent default context menu and camera orbit
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.showMobContextMenu(mob, event.clientX, event.clientY);
    }
  }

  private onLeftClick(event: MouseEvent): void {
    // Left-click on mobs is handled by InteractionSystem for movement
    // We only handle right-click context menus, not left-click auto-attacks
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
        console.log('[MobInteraction] Long-press detected');
        const mob = this.getMobAtPosition(this.touchStart.x, this.touchStart.y);
        if (mob && mob.isAlive) {
          // Prevent default and show context menu
          event.preventDefault();
          event.stopPropagation();
          this.showMobContextMenu(mob, this.touchStart.x, this.touchStart.y);
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

  private showMobContextMenu(mob: MobInteractable, screenX: number, screenY: number): void {
    const localPlayer = this.world.getPlayer();
    if (!localPlayer) return;
    
    console.log(`[MobInteraction] 📋 Showing context menu for ${mob.name}`);
    
    const actions: ContextMenuItem[] = [
      {
        id: 'attack',
        label: 'Attack',
        icon: '⚔️',
        enabled: mob.isAlive
      },
      {
        id: 'examine',
        label: 'Examine',
        icon: '🔍',
        enabled: true
      }
    ];
    
    // Emit event to show context menu
    this.emitTypedEvent(EventType.UI_OPEN_MENU, {
      playerId: localPlayer.id,
      type: 'context',
      position: { x: screenX, y: screenY },
      actions: actions,
      targetId: mob.id,
      targetType: 'mob'
    });
  }

  private getMobAtPosition(screenX: number, screenY: number): MobInteractable | null {
    if (!this.canvas || !this.world.camera || !this.world.stage?.scene) return null;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = ((screenX - rect.left) / rect.width) * 2 - 1;
    const y = -((screenY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this._tempVec2.set(x, y), this.world.camera);
    
    // Raycast against scene to find mobs
    const intersects = this.raycaster.intersectObjects(this.world.stage.scene.children, true);
    
    for (const intersect of intersects) {
      const userData = intersect.object.userData;
      if (userData?.type === 'mob' || userData?.entityType === 'mob') {
        const mobId = userData.entityId || userData.mobId;
        if (mobId) {
          const mob = this.mobs.get(mobId);
          if (mob) {
            return mob;
          }
        }
      }
    }
    
    return null;
  }

  private startAttack(mob: MobInteractable, playerId: string): void {
    console.log(`[MobInteraction] ⚔️ Starting attack on ${mob.name}`);
    
    const player = this.world.getPlayer();
    if (!player) return;
    
    // Check distance
    const playerPos = player.position;
    const mobPos = mob.position;
    const distance = Math.sqrt(
      Math.pow(playerPos.x - mobPos.x, 2) +
      Math.pow(playerPos.z - mobPos.z, 2)
    );
    
    // Get equipped weapon to determine attack type
    const equipment = (player as { equipment?: { weapon?: { weaponType?: string } } }).equipment;
    const weaponType = equipment?.weapon?.weaponType;
    const isBow = weaponType === 'bow' || weaponType === 'crossbow';
    const attackType = isBow ? AttackType.RANGED : AttackType.MELEE;
    const maxRange = isBow ? 8 : 2;
    
    console.log(`[MobInteraction] Distance: ${distance.toFixed(2)}m, Range: ${maxRange}m, Type: ${attackType}`);
    
    // If too far, move closer first
    if (distance > maxRange) {
      console.log(`[MobInteraction] 🚶 Too far, moving to mob...`);
      this.moveToMob(mob, playerId, maxRange);
    } else {
      console.log(`[MobInteraction] ✅ In range, sending attack request`);
      this.sendAttackRequest(mob.id, playerId, attackType);
    }
  }

  private moveToMob(mob: MobInteractable, playerId: string, range: number): void {
    // Calculate position near mob
    const player = this.world.getPlayer();
    if (!player) return;
    
    const playerPos = player.position;
    const mobPos = mob.position;
    
    const direction = {
      x: mobPos.x - playerPos.x,
      z: mobPos.z - playerPos.z
    };
    
    const length = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    if (length > 0) {
      direction.x /= length;
      direction.z /= length;
    }
    
    // Position just within range
    const targetPos = {
      x: mobPos.x - direction.x * (range - 0.5),
      y: mobPos.y,
      z: mobPos.z - direction.z * (range - 0.5)
    };
    
    console.log(`[MobInteraction] Moving to position: (${targetPos.x.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
    
    // Get player's current run mode
    const playerRunMode = (player as { runMode?: boolean }).runMode !== false; // Default to run
    
    // Send move request to server
    if (this.world.network?.send) {
      this.world.network.send('moveRequest', {
        target: [targetPos.x, targetPos.y, targetPos.z],
        runMode: playerRunMode,
        cancel: false
      });
      
      console.log(`[MobInteraction] Move request sent with runMode: ${playerRunMode ? 'RUN' : 'WALK'}`);
    }
    
    // Set up proximity checking
    const checkInterval = setInterval(() => {
      const currentPlayer = this.world.getPlayer();
      if (!currentPlayer) {
        clearInterval(checkInterval);
        return;
      }
      
      const currentDistance = Math.sqrt(
        Math.pow(currentPlayer.position.x - mobPos.x, 2) +
        Math.pow(currentPlayer.position.z - mobPos.z, 2)
      );
      
      if (currentDistance <= range) {
        console.log(`[MobInteraction] ✅ Reached mob, starting attack`);
        clearInterval(checkInterval);
        this.sendAttackRequest(mob.id, playerId, range > 5 ? AttackType.RANGED : AttackType.MELEE);
      }
    }, 100);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
    }, 10000);
  }

  private sendAttackRequest(mobId: string, playerId: string, attackType: AttackType): void {
    console.log(`[MobInteraction] 📨 Sending ${attackType} attack request to server`);
    
    // Send to server
    if (this.world.network?.send) {
      this.world.network.send('attackMob', {
        mobId: mobId,
        attackType: attackType
      });
    }
    
    // Also emit local event
    this.emitTypedEvent(EventType.COMBAT_ATTACK_REQUEST, {
      playerId: playerId,
      targetId: mobId,
      attackerType: 'player',
      targetType: 'mob',
      attackType: attackType
    });
  }

  private registerMob(mob: MobInteractable): void {
    this.mobs.set(mob.id, mob);
    console.log(`[MobInteraction] Registered mob: ${mob.name} (${mob.id}) at (${mob.position.x.toFixed(0)}, ${mob.position.z.toFixed(0)})`);
  }

  destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('contextmenu', this.onContextMenu as EventListener);
      this.canvas.removeEventListener('click', this.onLeftClick as EventListener);
      this.canvas.removeEventListener('touchstart', this.onTouchStart as EventListener);
      this.canvas.removeEventListener('touchend', this.onTouchEnd as EventListener);
    }
    
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    
    this.mobs.clear();
    super.destroy();
  }

  // Required lifecycle methods
  update(_deltaTime: number): void {}
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

