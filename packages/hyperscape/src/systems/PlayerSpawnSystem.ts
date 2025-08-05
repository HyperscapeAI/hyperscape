
/**
 * Player Spawn System
 * 
 * Handles player spawning with starter equipment as defined in the GDD:
 * - Player starts with bronze sword, helmet, and chest armor equipped
 * - Immediately triggers goblin aggro for combat testing
 * - Integrates with equipment and combat systems
 */

import * as THREE from '../extras/three';
import type { World } from '../types';
import { EventType } from '../types/events';
import { equipmentRequirements } from '../data/EquipmentRequirements';
import type { PlayerSpawnData } from '../types/core';
import { PlayerSpawnSystemInfo as SystemInfo } from '../types/system-types';
import { SystemBase } from './SystemBase';

export class PlayerSpawnSystem extends SystemBase {
  private spawnedPlayers = new Map<string, PlayerSpawnData>();
  
  // GDD-compliant starter equipment
  private readonly STARTER_EQUIPMENT = equipmentRequirements.getStarterEquipment();

  constructor(world: World) {
    super(world, { 
      name: 'rpg-player-spawn',
      dependencies: {
        required: [],
        optional: []
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Listen for player events
    this.world.on(EventType.PLAYER_JOINED, this.handlePlayerJoin.bind(this));
    this.world.on(EventType.PLAYER_LEFT, this.handlePlayerLeave.bind(this));
    
    // Listen for spawn completion events
    this.world.on(EventType.PLAYER_SPAWN_COMPLETE, this.handleSpawnComplete.bind(this));
    
  }

  start(): void {
  }

  /**
   * Handle spawn completion
   */
  private handleSpawnComplete(event: { playerId: string }): void {
    // Send welcome message
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId: event.playerId,
      message: 'Welcome to the world! You are equipped and ready for battle.',
      type: 'info'
    });
    
    // Additional spawn effects could go here
    // - Tutorial prompts
    // - UI highlighting
    // - Sound effects
  }

  /**
   * Handle player leave
   */
  private handlePlayerLeave(event: { playerId: string }): void {
    // Clean up spawn data
    this.spawnedPlayers.delete(event.playerId);
    
    // Cleanup any starter goblins that were spawned for this player
    this.cleanupPlayerMobs(event.playerId);
  }

  /**
   * Handle player join - start spawn process
   */
  private handlePlayerJoin(event: { playerId: string }): void {
    
    const player = this.world.getPlayer(event.playerId)!;
    
    // Create spawn data
    const position = { x: player.node.position.x, y: player.node.position.y, z: player.node.position.z };
    
    const spawnData: PlayerSpawnData = {
      playerId: event.playerId,
      position: new THREE.Vector3(position.x, position.y, position.z),
      hasStarterEquipment: false,
      aggroTriggered: false,
      spawnTime: Date.now()
    };
    
    this.spawnedPlayers.set(event.playerId, spawnData);
    
    // Start spawn sequence
    this.spawnPlayerWithEquipment(event.playerId);
  }

  /**
   * Spawn player with starter equipment
   */
  private async spawnPlayerWithEquipment(playerId: string): Promise<void> {
    const spawnData = this.spawnedPlayers.get(playerId)!;
      
      // First, register player with equipment system
      this.emitTypedEvent(EventType.PLAYER_REGISTERED, { playerId: playerId });
      
      // Wait a moment for systems to initialize
      await this.delay(100);
      
      // Equip each starter item
      for (const item of this.STARTER_EQUIPMENT) {
        
        // Force equip the item (bypass inventory checks for starter equipment)
        this.emitTypedEvent(EventType.EQUIPMENT_EQUIP, {
          playerId: playerId,
          itemId: item.itemId, // Pass itemId string directly, not the full item object
          slot: item.slot
        });
        
        // Small delay between equipment
        await this.delay(50);
      }
      
      spawnData.hasStarterEquipment = true;
      
      
      // Trigger aggro after equipment is ready
      this.triggerGoblinAggro(playerId);
      
      // Emit spawn complete event
      this.emitTypedEvent(EventType.PLAYER_SPAWNED, {
        playerId: playerId,
        equipment: this.STARTER_EQUIPMENT,
        position: spawnData.position
      });
      
  }

  /**
   * Trigger goblin aggro near player spawn
   */
  private triggerGoblinAggro(playerId: string): void {
    const spawnData = this.spawnedPlayers.get(playerId)!;
    if (spawnData.aggroTriggered) return;
    
    const player = this.world.getPlayer(playerId)!;
    
    // Spawn a few goblins near the player for immediate combat
    const playerPos = player.node.position;
    
    const goblinSpawnPositions = [
      new THREE.Vector3(playerPos.x + 3, playerPos.y, playerPos.z + 2),
      new THREE.Vector3(playerPos.x - 2, playerPos.y, playerPos.z + 4),
      new THREE.Vector3(playerPos.x + 1, playerPos.y, playerPos.z - 3)
    ];
    
    goblinSpawnPositions.forEach((position, index) => {
      setTimeout(() => {
        this.spawnAggroGoblin(playerId, position, index);
      }, index * 500); // Stagger spawns by 500ms
    });
    
    spawnData.aggroTriggered = true;
    
  }

  /**
   * Spawn an aggressive goblin that will attack the player
   */
  private spawnAggroGoblin(playerId: string, position: { x: number; y: number; z: number }, index: number): void {
    const goblinId = `starter_goblin_${playerId}_${index}`;
    
    // Spawn goblin mob
    this.emitTypedEvent(EventType.MOB_SPAWN_REQUEST, {
      mobType: 'goblin',
      position: position,
      level: 1,
      mobId: goblinId
    });
    
    // Force aggro toward the specific player
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      mobId: goblinId,
      targetId: playerId,
      aggroAmount: 100,
      reason: 'starter_spawn'
    });
    
  }

  // Duplicate methods removed - proper implementations exist above

  /**
   * Clean up mobs spawned for a specific player
   */
  private cleanupPlayerMobs(playerId: string): void {
    // Find and despawn any starter goblins for this player
    for (let i = 0; i < 3; i++) {
      const goblinId = `starter_goblin_${playerId}_${i}`;
      this.emitTypedEvent(EventType.MOB_DESPAWN, { mobId: goblinId });
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if player has completed spawn process
   */
  public hasPlayerCompletedSpawn(playerId: string): boolean {
    const spawnData = this.spawnedPlayers.get(playerId);
    return !!(spawnData?.hasStarterEquipment && spawnData?.aggroTriggered);
  }

  /**
   * Get spawn data for player
   */
  public getPlayerSpawnData(playerId: string): PlayerSpawnData | undefined {
    return this.spawnedPlayers.get(playerId);
  }

  /**
   * Force re-equip starter equipment (for testing)
   */
  public forceReequipStarter(playerId: string): void {
    this.spawnPlayerWithEquipment(playerId);
  }

  /**
   * Manually trigger goblin aggro (for testing)
   */
  public forceTriggerAggro(playerId: string): void {
    const spawnData = this.spawnedPlayers.get(playerId);
    if (!spawnData) return;
    
    spawnData.aggroTriggered = false; // Reset flag
    this.triggerGoblinAggro(playerId);
  }

  /**
   * Get all spawned players
   */
  public getAllSpawnedPlayers(): PlayerSpawnData[] {
    return Array.from(this.spawnedPlayers.values());
  }

  /**
   * Get system info for debugging
   */
  getSystemInfo(): SystemInfo {
    return {
      totalSpawnedPlayers: this.spawnedPlayers.size,
      playersWithEquipment: Array.from(this.spawnedPlayers.values()).filter(p => p.hasStarterEquipment).length,
      playersWithAggro: Array.from(this.spawnedPlayers.values()).filter(p => p.aggroTriggered).length,
      starterEquipmentItems: this.STARTER_EQUIPMENT.length,
      playerSpawnData: Object.fromEntries(
        Array.from(this.spawnedPlayers.entries()).map(([playerId, data]) => [
          playerId,
          {
            hasStarterEquipment: data.hasStarterEquipment,
            aggroTriggered: data.aggroTriggered,
            spawnTime: data.spawnTime,
            position: data.position
          }
        ])
      )
    };
  }

  destroy(): void {
    // Clean up all spawned player data
    for (const playerId of this.spawnedPlayers.keys()) {
      this.cleanupPlayerMobs(playerId);
    }
    this.spawnedPlayers.clear();
  }
}