import type { World } from '../../types/index';
import { EventType } from '../../types/events';
import type { MobData } from '../data/mobs';
import { ALL_MOBS, getMobsByDifficulty } from '../data/mobs';
import { ALL_WORLD_AREAS as WORLD_AREAS } from '../data/world-areas';
import type { MobSpawnStats } from '../types/core';
import type { EntitySpawnedEvent, MobSpawnRequest } from '../types/rpg-systems';
import { RPGSystemBase } from './RPGSystemBase';

// Types are now imported from shared type files

/**
 * MobSpawnerSystem
 * 
 * Uses EntityManager to spawn mob entities instead of RPGMobApp objects.
 * Creates and manages all mob instances across the world based on GDD specifications.
 */
export class MobSpawnerSystem extends RPGSystemBase {
  private spawnedMobs = new Map<string, string>(); // mobId -> entityId
  private spawnPoints = new Map<string, { x: number; y: number; z: number }[]>();
  private mobIdCounter = 0;
  
  constructor(world: World) {
    super(world, {
      name: 'mob-spawner',
      dependencies: {
        required: ['rpg-entity-manager'], // Depends on EntityManager to spawn mobs
        optional: ['rpg-world-generation', 'rpg-mob'] // Better with world generation and mob systems
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Set up event subscriptions for mob spawning (4 listeners!)
    this.subscribe<MobSpawnRequest>(EventType.MOB_SPAWN_REQUEST, (event) => this.spawnMobAtLocation(event.data));
    this.subscribe(EventType.MOB_DESPAWN, (event) => {
      const data = event.data as { mobId: string };
      this.despawnMob(data.mobId);
    });
    this.subscribe(EventType.MOB_RESPAWN_ALL, (_event) => this.respawnAllMobs());
    
    // Listen for entity spawned events to track our mobs
    this.subscribe<EntitySpawnedEvent>(EventType.ENTITY_SPAWNED, (event) => {
      const data = event.data;
      // Only handle mob entities
      if (data.entityType === 'mob') {
        this.handleEntitySpawned(data);
      }
    });
    
  }

  start(): void {
    // Initialize spawn points for all difficulty zones
    this.initializeSpawnPoints();
    
    // Spawn all 9 mob types across their appropriate zones
    this.spawnAllMobTypes();
  }

  private initializeSpawnPoints(): void {
    // Load spawn points from externalized world areas data
    for (const [areaId, area] of Object.entries(WORLD_AREAS)) {
      if (area.mobSpawns && area.mobSpawns.length > 0) {
        // Convert mob spawn points to the format expected by this system
        const spawnPositions = area.mobSpawns.map(spawn => ({
          x: spawn.position.x,
          y: spawn.position.y || 2, // Default Y level
          z: spawn.position.z
        }));
        
        this.spawnPoints.set(areaId, spawnPositions);
      }
    }
  }

  private spawnAllMobTypes(): void {
    // Spawn mobs in all areas based on their difficulty level
    for (const [areaId, area] of Object.entries(WORLD_AREAS)) {
      if (area.mobSpawns && area.mobSpawns.length > 0 && area.difficultyLevel > 0) {
        // Skip difficulty level 0 (safe zones) - only spawn in combat zones (1-3)
        this.spawnMobsByDifficulty(area.difficultyLevel as 1 | 2 | 3, areaId);
      }
    }
  }

  private spawnMobsByDifficulty(difficultyLevel: 1 | 2 | 3, spawnZone: string): void {
    const mobs = getMobsByDifficulty(difficultyLevel);
    const spawnPoints = this.spawnPoints.get(spawnZone) || [];
    
    
    let spawnIndex = 0;
    for (const mobData of mobs) {
      // Spawn multiple instances of each mob type
      const instancesPerType = 2;
      
      for (let i = 0; i < instancesPerType; i++) {
        const spawnPoint = spawnPoints[spawnIndex % spawnPoints.length];
        if (spawnPoint) {
          this.spawnMobFromData(mobData, spawnPoint);
          spawnIndex++;
        }
      }
    }
  }

  private spawnMobFromData(mobData: MobData, position: { x: number; y: number; z: number }): void {
    const mobId = `gdd_${mobData.id}_${this.mobIdCounter++}`;
    
    // Use EntityManager to spawn mob via event system
    this.world.emit(EventType.MOB_SPAWN_REQUEST, {
      mobType: mobData.id,
      level: mobData.stats.level,
      position: position,
      respawnTime: mobData.respawnTime || 300000, // 5 minutes default
      customId: mobId // Pass our custom ID for tracking
    });
  }

  private handleEntitySpawned(data: EntitySpawnedEvent): void {
    // Track mobs spawned by the EntityManager  
    if (data.entityType === 'mob' && data.entityData?.mobType) {
      // Find matching request based on mob type and position
      for (const [mobId] of this.spawnedMobs) {
        if (!this.spawnedMobs.get(mobId) && mobId.includes(data.entityData.mobType as string)) {
          this.spawnedMobs.set(mobId, data.entityId);
          break;
        }
      }
    }
  }

  private spawnMobAtLocation(data: MobSpawnRequest): void {
    const mobData = ALL_MOBS[data.mobType];
    if (!mobData) {
      console.error(`[MobSpawnerSystem] Unknown mob type: ${data.mobType}`);
      return;
    }
    
    this.spawnMobFromData(mobData, data.position);
  }

  private despawnMob(mobId: string): void {
    const entityId = this.spawnedMobs.get(mobId);
    if (entityId) {
      this.world.emit(EventType.ENTITY_DEATH, { entityId });
      this.spawnedMobs.delete(mobId);
      
    }
  }

  private respawnAllMobs(): void {
    
    // Clear existing mobs
    for (const [_mobId, entityId] of this.spawnedMobs) {
      this.world.emit(EventType.ENTITY_DEATH, { entityId });
    }
    this.spawnedMobs.clear();
    
    // Respawn all mobs
    this.spawnAllMobTypes();
  }

  // Public API
  getSpawnedMobs(): Map<string, string> {
    return this.spawnedMobs;
  }

  getMobCount(): number {
    return this.spawnedMobs.size;
  }

  getMobsByType(mobType: string): string[] {
    const mobEntityIds: string[] = [];
    for (const [id, entityId] of this.spawnedMobs) {
      if (id.includes(mobType)) {
        mobEntityIds.push(entityId);
      }
    }
    return mobEntityIds;
  }

  getMobStats(): MobSpawnStats {
    const stats = {
      totalMobs: this.spawnedMobs.size,
      level1Mobs: 0,
      level2Mobs: 0,
      level3Mobs: 0,
      byType: {} as Record<string, number>,
      spawnedMobs: this.spawnedMobs.size
    };
    
    for (const [mobId] of this.spawnedMobs) {
      if (mobId.includes('goblin') || mobId.includes('bandit') || mobId.includes('barbarian')) {
        stats.level1Mobs++;
      } else if (mobId.includes('hobgoblin') || mobId.includes('guard') || mobId.includes('dark_warrior')) {
        stats.level2Mobs++;
      } else if (mobId.includes('black_knight') || mobId.includes('ice_warrior') || mobId.includes('dark_ranger')) {
        stats.level3Mobs++;
      }
      
      // Count by type
      for (const mobType of Object.keys(ALL_MOBS)) {
        if (mobId.includes(mobType)) {
          stats.byType[mobType] = (stats.byType[mobType] || 0) + 1;
        }
      }
    }
    
    return stats;
  }

  // Required System lifecycle methods
  update(_dt: number): void {
    // Update mob behaviors, check for respawns, etc.
  }



  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all spawn tracking
    this.spawnedMobs.clear();
    this.spawnPoints.clear();
    
    // Reset counter
    this.mobIdCounter = 0;
    

    
    // Call parent cleanup
    super.destroy();
  }
}