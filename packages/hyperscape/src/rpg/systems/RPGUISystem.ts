 
/**
 * RPG UI System
 * Server-side system that manages UI state and coordinates with client-side UI apps
 * Sends UI update events that client-side UI apps listen for
 */

import type { World } from '../../types';
import { EventType } from '../../types/events';
import { PlayerData, UIState, Equipment, SkillData, PlayerEquipment, EquipmentSlot, RPGItem, EquipmentSlotName } from '../types/core';
import type { EquipmentData, InventoryData, SkillsData, UIRequestData } from '../types/rpg-systems';
import { RPGSystemBase } from './RPGSystemBase';
import { getItem } from '../data/items';

export class RPGUISystem extends RPGSystemBase {
  private playerUIStates = new Map<string, UIState>();

  constructor(world: World) {
    super(world, {
      name: 'rpg-ui',
      dependencies: {
        required: ['rpg-player', 'rpg-inventory', 'rpg-equipment'], // Core dependencies
        optional: ['rpg-combat', 'rpg-skills'] // Additional systems for full UI support
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Set up type-safe event subscriptions for UI updates
    this.subscribe<{ playerId: string; player: PlayerData }>(EventType.PLAYER_UPDATED, (event) => {
      this.updatePlayerUI(event.data);
    });
    this.subscribe<{ playerId: string; health: number; maxHealth: number }>(EventType.PLAYER_HEALTH_UPDATED, (event) => {
      this.updateHealthUI(event.data);
    });
    this.subscribe<{ playerId: string; skills: SkillsData }>(EventType.PLAYER_SKILLS_UPDATED, (event) => {
      this.updateSkillsUI(event.data);
    });
    this.subscribe<{ playerId: string; items: unknown[] }>(EventType.INVENTORY_UPDATED, (event) => {
      const inventoryData = { playerId: event.data.playerId, inventory: { items: event.data.items } as InventoryData };
      this.updateInventoryUI(inventoryData);
    });
    this.subscribe<{ playerId: string; equipment: EquipmentData }>(EventType.PLAYER_EQUIPMENT_UPDATED, (event) => {
      this.updateEquipmentUI(event.data);
    });
    this.subscribe<{ sessionId: string; attackerId: string; targetId: string }>(EventType.COMBAT_STARTED, (event) => {
      this.updateCombatUI({ attackerId: event.data.attackerId, targetId: event.data.targetId });
    });
    this.subscribe<{ sessionId: string; winnerId?: string }>(EventType.COMBAT_ENDED, (event) => {
      this.updateCombatUI({ attackerId: event.data.winnerId });
    });
    this.subscribe<{ playerId: string }>(EventType.PLAYER_REGISTERED, (event) => {
      const mockPlayerData = { id: event.data.playerId } as PlayerData;
      this.initializePlayerUI(mockPlayerData);
    });
    this.subscribe<{ playerId: string }>(EventType.PLAYER_UNREGISTERED, (event) => {
      this.cleanupPlayerUI(event.data.playerId);
    });
    
    this.subscribe<UIRequestData>(EventType.UI_REQUEST, (event) => {
      this.handleUIRequest(event.data);
    });
    
  }

  start(): void {
  }

  private convertPlayerEquipmentToEquipment(playerEquipment: PlayerEquipment): Equipment {
    const convertSlot = (item: RPGItem | null, slotName: string): EquipmentSlot | null => {
      if (!item) return null;
      
      return {
        id: `${item.id}_slot`,
        name: item.name,
        slot: slotName as EquipmentSlotName,
        itemId: item.id,
        item: item
      };
    };

    return {
      weapon: convertSlot(playerEquipment.weapon, 'weapon'),
      shield: convertSlot(playerEquipment.shield, 'shield'),
      helmet: convertSlot(playerEquipment.helmet, 'helmet'),
      body: convertSlot(playerEquipment.body, 'body'),
      legs: convertSlot(playerEquipment.legs, 'legs'),
      arrows: convertSlot(playerEquipment.arrows, 'arrows')
    };
  }

  private convertEquipmentDataToEquipment(equipmentData: EquipmentData): Equipment {
    const convertDataSlot = (data: { itemId: string; name: string; stats: { attack: number; defense: number; strength: number } } | null, slotName: string): EquipmentSlot | null => {
      if (!data) return null;
      
      return {
        id: `${data.itemId}_slot`,
        name: data.name,
        slot: slotName as EquipmentSlotName,
        itemId: data.itemId,
        item: null // EquipmentData doesn't contain full item info
      };
    };

    return {
      weapon: convertDataSlot(equipmentData.weapon, 'weapon'),
      shield: convertDataSlot(equipmentData.shield, 'shield'),
      helmet: convertDataSlot(equipmentData.helmet, 'helmet'),
      body: convertDataSlot(equipmentData.body, 'body'),
      legs: convertDataSlot(equipmentData.legs, 'legs'),
      arrows: convertDataSlot(equipmentData.arrows, 'arrows')
    };
  }

  private initializePlayerUI(playerData: PlayerData): void {
    const uiState: UIState = {
      playerId: playerData.id,
      health: { 
        current: playerData.health.current, 
        max: playerData.health.max 
      },
      skills: {
        attack: { level: 1, xp: 0 } as SkillData,
        strength: { level: 1, xp: 0 } as SkillData,
        defense: { level: 1, xp: 0 } as SkillData,
        constitution: { level: 1, xp: 0 } as SkillData,
        ranged: { level: 1, xp: 0 } as SkillData,
        woodcutting: { level: 1, xp: 0 } as SkillData,
        fishing: { level: 1, xp: 0 } as SkillData,
        firemaking: { level: 1, xp: 0 } as SkillData,
        cooking: { level: 1, xp: 0 } as SkillData
      },
      inventory: { items: [], capacity: 28, coins: 0 },
      equipment: this.convertPlayerEquipmentToEquipment(playerData.equipment),
      combatLevel: playerData.combat.combatLevel,
      inCombat: false,
      minimapData: { position: playerData.position }
    };

    this.playerUIStates.set(playerData.id, uiState);
    
    this.sendUIUpdate(playerData.id, 'init', { ...uiState });
  }

  private cleanupPlayerUI(playerId: string): void {
    this.playerUIStates.delete(playerId);
  }

  private updatePlayerUI(data: { playerId: string; player: PlayerData }): void {
    const uiState = this.playerUIStates.get(data.playerId)!;

    // Update core player data
    uiState.health = { 
      current: data.player.health.current, 
      max: data.player.health.max 
    };
    uiState.combatLevel = data.player.combat.combatLevel;
    uiState.minimapData.position = data.player.position;

    this.sendUIUpdate(data.playerId, 'player', {
      health: { ...uiState.health },
      combatLevel: uiState.combatLevel,
      position: { ...data.player.position },
      isAlive: data.player.alive
    });
  }

  private updateHealthUI(data: { playerId: string; health: number; maxHealth: number }): void {
    const uiState = this.playerUIStates.get(data.playerId)!;

    uiState.health = { current: data.health, max: data.maxHealth };
    
    this.sendUIUpdate(data.playerId, 'health', {
      current: data.health,
      max: data.maxHealth
    });
  }

  private updateSkillsUI(data: { playerId: string; skills: SkillsData }): void {
    const uiState = this.playerUIStates.get(data.playerId)!;

    uiState.skills = data.skills;
    
    this.sendUIUpdate(data.playerId, 'skills', { ...data.skills });
  }

  private updateInventoryUI(data: { playerId: string; inventory: InventoryData }): void {
    const uiState = this.playerUIStates.get(data.playerId)!;

    const inventoryData = {
      items: data.inventory.items.map(item => ({
        id: `${item.itemId}_${item.slot}`, // Generate unique ID
        itemId: item.itemId,
        quantity: item.quantity,
        slot: item.slot,
        metadata: null as Record<string, number | string | boolean> | null
      })),
      capacity: data.inventory.maxSlots || 28,
      coins: data.inventory.coins || 0
    };

    uiState.inventory = inventoryData;
    
    this.sendUIUpdate(data.playerId, 'inventory', { ...data.inventory, maxSlots: data.inventory.maxSlots });
  }

  private updateEquipmentUI(data: { playerId: string; equipment: EquipmentData }): void {
    const uiState = this.playerUIStates.get(data.playerId)!;

    uiState.equipment = this.convertEquipmentDataToEquipment(data.equipment);
    
    this.sendUIUpdate(data.playerId, 'equipment', data.equipment);
  }

  private updateCombatUI(data: { attackerId?: string; targetId?: string }): void {
    // Update combat status for both attacker and target
    if (data.attackerId) {
      const attackerState = this.playerUIStates.get(data.attackerId);
      if (attackerState) {
        attackerState.inCombat = !!data.targetId; // true if starting combat, false if ending
        this.sendUIUpdate(data.attackerId, 'combat', { inCombat: attackerState.inCombat });
      }
    }
  }

  private sendUIUpdate(playerId: string, component: string, data: unknown): void {
    // Send UI update event that client-side UI apps can listen for
    this.emitTypedEvent(EventType.UI_PLAYER_UPDATE, {
      playerId,
      playerData: {
        component,
        data: data as Record<string, unknown>
      }
    });
  }

  // Public API for other systems
  getPlayerUIState(playerId: string): UIState | undefined {
    return this.playerUIStates.get(playerId);
  }

  forceUIRefresh(playerId: string): void {
    const uiState = this.playerUIStates.get(playerId)!;
    this.sendUIUpdate(playerId, 'refresh', { 
      ...uiState, 
      inventory: { ...uiState.inventory, items: [...uiState.inventory.items] },
      health: { ...uiState.health },
      skills: { ...uiState.skills },
      equipment: { ...uiState.equipment },
      minimapData: { ...uiState.minimapData }
    });
  }

  // Method to send custom UI messages
  sendUIMessage(playerId: string, message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId,
      message,
      type
    });
  }

  private handleUIRequest(data: UIRequestData): void {
    const { playerId } = data;
    const rpgAPI = this.world.rpg!;
    
    const playerData = rpgAPI.getPlayer(playerId);
    const skills = rpgAPI.getSkills(playerId);
    const rawInventory = rpgAPI.getInventory(playerId);
    const equipment = rpgAPI.getEquipment(playerId);
    const health = rpgAPI.getPlayerHealth(playerId);
    const stamina = rpgAPI.getPlayerStamina(playerId);

    const ensureInventoryItem = (item: unknown, index: number) => {
      const rawItem = item as Record<string, unknown>;
      const itemId = (rawItem.itemId || rawItem.id || 'unknown') as string;
      const itemData = getItem(itemId);
      const slot = (rawItem.slot ?? index) as number;
      
      return {
        slot: slot,
        itemId: itemId,
        quantity: (rawItem.quantity || 1) as number,
        item: {
          id: itemData?.id || itemId,
          name: itemData?.name || (rawItem.name as string) || 'Unknown Item',
          type: itemData?.type || 'misc',
          stackable: itemData?.stackable ?? (rawItem.stackable as boolean) ?? true,
          weight: itemData?.weight ?? (rawItem.weight as number) ?? 0.1
        }
      };
    };

    let inventory: InventoryData;
    if (Array.isArray(rawInventory)) {
      inventory = {
        items: rawInventory.map(ensureInventoryItem),
        maxSlots: 28,
        coins: 0
      };
    } else if (rawInventory && typeof rawInventory === 'object') {
      const inventoryObj = rawInventory as { items: unknown[]; capacity?: number; coins?: number };
      inventory = {
        items: (inventoryObj.items || []).map(ensureInventoryItem),
        maxSlots: inventoryObj.capacity || 28,
        coins: inventoryObj.coins || 0
      };
    } else {
      inventory = {
        items: [],
        maxSlots: 28,
        coins: 0
      };
    }
    
    const uiData = {
      health: health || (playerData?.health || 100),
      maxHealth: 100,
      stamina: stamina || 100,
      maxStamina: 100,
      level: 1,
      xp: 0,
      maxXp: 83,
      coins: 0,
      combatStyle: 'attack' as const,
              skills: skills || {
          attack: 1,
          strength: 1,
          defense: 1,
          constitution: 1,
          ranged: 1,
          woodcutting: 1,
          fishing: 1,
          firemaking: 1,
          cooking: 1
        }
    };

    this.emitTypedEvent(EventType.UI_PLAYER_UPDATE, {
      playerId,
      playerData: uiData
    });

    this.emitTypedEvent(EventType.INVENTORY_UPDATED, {
      playerId,
      items: inventory.items
    });

    this.emitTypedEvent(EventType.UI_EQUIPMENT_UPDATE, {
      playerId,
      equipment: equipment || {}
    });
  }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    this.playerUIStates.clear();
    super.destroy();
  }
}