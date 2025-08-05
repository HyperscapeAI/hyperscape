import type { World } from '../../core/World';
import { RPGSystemBase } from './RPGSystemBase';
import { RPGPlayerSystem } from './RPGPlayerSystem';
import { RPGWorldGenerationSystem } from './RPGWorldGenerationSystem';
import { EventType } from '../../types/events';
import { getSystem } from '../../core/utils/SystemUtils';

/**
 * RPG Spawn Test System
 * Tests player spawning system with fail-fast validation
 * Throws errors if players spawn at (0,0,0) instead of proper terrain positions
 */
export class RPGSpawnTestSystem extends RPGSystemBase {
  private playerSystem!: RPGPlayerSystem;
  private worldGenSystem!: RPGWorldGenerationSystem;
  
  constructor(world: World) {
    super(world, {
      name: 'rpg-spawn-test',
      dependencies: {
        required: ['rpg-player', 'rpg-world-generation'],
        optional: []
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Listen for player spawn events to validate positions
    this.world.on(EventType.PLAYER_SPAWNED, this.validatePlayerSpawn.bind(this));
    this.world.on(EventType.MOVEMENT_COMPLETED, this.validateTeleportPosition.bind(this));
  }

  start(): void {
    // Get required system references
    this.playerSystem = getSystem<RPGPlayerSystem>(this.world, 'rpg-player')!;
    this.worldGenSystem = getSystem<RPGWorldGenerationSystem>(this.world, 'rpg-world-generation')!;
    
    // Test spawn position availability immediately
    this.testSpawnPositionAvailability();
  }

  private testSpawnPositionAvailability(): void {
    const spawnPosition = this.getRandomTownPosition();
    
    // Validate position is on terrain (y > 0)
    if (spawnPosition.y <= 0) {
      throw new Error(`[RPGSpawnTestSystem] CRITICAL: Spawn position y=${spawnPosition.y} is at/below ground level!`);
    }
  }

  private validatePlayerSpawn(event: { playerId: string; position: { x: number; y: number; z: number } }): void {
    // CRITICAL TEST: Player should NEVER spawn at (0,0,0)
    if (event.position.x === 0 && event.position.y === 0 && event.position.z === 0) {
      throw new Error(`[RPGSpawnTestSystem] CRITICAL SPAWN FAILURE: Player ${event.playerId} spawned at (0,0,0) instead of terrain!`);
    }
    
    // CRITICAL TEST: Player should spawn above ground (y > 0)
    if (event.position.y <= 0) {
      throw new Error(`[RPGSpawnTestSystem] CRITICAL SPAWN FAILURE: Player ${event.playerId} spawned at/below ground level y=${event.position.y}!`);
    }
    
    // CRITICAL TEST: Player should spawn within reasonable world bounds
    const maxDistance = 200; // Maximum distance from world origin
    const distance = Math.sqrt(event.position.x ** 2 + event.position.z ** 2);
    if (distance > maxDistance) {
      throw new Error(`[RPGSpawnTestSystem] CRITICAL SPAWN FAILURE: Player ${event.playerId} spawned too far from world center (distance=${distance})!`);
    }
  }

  private validateTeleportPosition(event: { playerId: string; position: { x: number; y: number; z: number } }): void {
    // Same validation as spawn but for teleport events
    if (event.position.x === 0 && event.position.y === 0 && event.position.z === 0) {
      throw new Error(`[RPGSpawnTestSystem] CRITICAL TELEPORT FAILURE: Player ${event.playerId} teleported to (0,0,0)!`);
    }
    
    if (event.position.y <= 0) {
      throw new Error(`[RPGSpawnTestSystem] CRITICAL TELEPORT FAILURE: Player ${event.playerId} teleported below ground y=${event.position.y}!`);
    }
  }

  private getRandomTownPosition(): { x: number; y: number; z: number } {
    // Get actual town positions from world generation system
    const towns = this.worldGenSystem.getTowns();
    
    const randomIndex = Math.floor(Math.random() * towns.length);
    return towns[randomIndex].position;
  }
}