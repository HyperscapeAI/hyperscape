
import type { World } from '../../types/index';
import { STARTER_TOWNS } from '../data/world-areas';
import { Town } from '../types/core';
import { RPGSystemBase } from './RPGSystemBase';
import { EventType } from '../../types/events';
import { RPGLogger } from '../utils/RPGLogger';

/**
 * RPG World Generation System
 * Handles generation of world structures including:
 * - Starter towns with safe zones
 * - Banks and stores
 * - Decorative elements
 * - Zone boundaries
 * - Mob spawn points
 * - Resource spawn points
 */
export class RPGWorldGenerationSystem extends RPGSystemBase {
  private towns = new Map<string, Town>();
  private worldStructures = new Map<string, { type: string; position: { x: number; y: number; z: number }; config: Record<string, unknown> }>();
  private mobSpawnPoints: Array<{ position: { x: number; y: number; z: number }; mobType: string; spawnRadius: number; difficulty: number }> = [];
  private resourceSpawnPoints: Array<{ position: { x: number; y: number; z: number }; type: string; subType: string }> = [];
  
  /**
   * Convert externalized world area data to Town format
   */
  private getStarterTownConfigs(): Town[] {
    return Object.values(STARTER_TOWNS).map(area => ({
      id: area.id,
      name: area.name,
      position: { 
        x: (area.bounds.minX + area.bounds.maxX) / 2, 
        y: 2, 
        z: (area.bounds.minZ + area.bounds.maxZ) / 2 
      },
      safeZoneRadius: Math.max(
        (area.bounds.maxX - area.bounds.minX) / 2,
        (area.bounds.maxZ - area.bounds.minZ) / 2
      ),
      hasBank: area.npcs.some(npc => npc.type === 'bank'),
      hasStore: area.npcs.some(npc => npc.type.includes('store')),
      isRespawnPoint: area.safeZone || false
    }));
  }

  constructor(world: World) {
    super(world, {
      name: 'rpg-world-generation',
      dependencies: {
        required: [],
        optional: ['rpg-safezone', 'rpg-mob', 'rpg-resource', 'rpg-banking', 'rpg-store']
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Set up type-safe event subscriptions for world generation
    this.subscribe<{ seed?: number; config?: Record<string, unknown> }>(EventType.WORLD_GENERATE, (_event) => this.generateWorld());
    this.subscribe<{ type: string; position: { x: number; y: number; z: number }; config?: Record<string, unknown> }>(EventType.WORLD_SPAWN_STRUCTURE, (event) => this.spawnStructure(event.data));
    
    // Generate world content immediately
    this.generateTowns();
    this.generateMobSpawnPoints();
    this.generateResourceSpawnPoints();
    
  }



  private generateWorld(): void {
    
    // Generate all starter towns
    this.generateTowns();
    
    // Generate other world features
    this.generateWorldFeatures();
    
    // Generate spawn points
    this.generateMobSpawnPoints();
    this.generateResourceSpawnPoints();
    
  }

  private generateTowns(): void {
    // Generate towns from externalized data
    const townConfigs = this.getStarterTownConfigs();
    for (const townConfig of townConfigs) {
      this.generateTown(townConfig);
    }
    
    RPGLogger.system('RPGWorldGenerationSystem', `Generated ${townConfigs.length} towns from externalized data`);
  }

  private generateTown(config: Town): void {
    
    // Store town data
    this.towns.set(config.id, config);
    
    // Register safe zone with combat system
    this.emitTypedEvent(EventType.ENTITY_SPAWNED, {
      entityId: `safezone_${config.id}`,
      entityType: 'safezone'
    });
    
    // Emit town generated event for other systems to use
    this.emitTypedEvent(EventType.ENTITY_SPAWNED, {
      entityId: config.id,
      entityType: 'town'
    });
    
    // Generate physical structures (visual indicators)
    this.generateTownStructures(config);
  }

  private generateTownStructures(town: Town): void {
    // Town center marker - create visual app
    this.emitTypedEvent(EventType.ENTITY_SPAWNED, {
      entityId: `town_center_${town.id}`,
      entityType: 'town_center'
    });
    
    // Bank building - create visual app
    if (town.hasBank) {
      const bankPosition = {
        x: town.position.x - 8,
        y: town.position.y,
        z: town.position.z
      };
      
      this.emitTypedEvent(EventType.ENTITY_SPAWNED, {
        entityId: `bank_${town.id}`,
        entityType: 'bank'
      });
      
      // Register bank location with banking system
      this.emitTypedEvent(EventType.BANK_OPEN, {
        bankId: `bank_${town.id}`,
        position: bankPosition,
        townId: town.id
      });
    }
    
    // Store building - create visual app
    if (town.hasStore) {
      const storePosition = {
        x: town.position.x + 8,
        y: town.position.y,
        z: town.position.z
      };
      
      const shopkeeperNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
      const shopkeeperName = shopkeeperNames[Object.keys(this.towns).length % shopkeeperNames.length];
      
      this.emitTypedEvent(EventType.ENTITY_SPAWNED, {
        entityId: `store_${town.id}`,
        entityType: 'store'
      });
      
      // Register store location with store system
      this.emitTypedEvent(EventType.STORE_REGISTER_NPC, {
        npcId: `store_npc_${town.id}`,
        storeId: `store_${town.id}`,
        position: storePosition,
        name: shopkeeperName,
        area: town.id
      });
    }
    
    // Town decorations
    this.generateTownDecorations(town);
  }

  private generateTownDecorations(town: Town): void {
    // Add some decorative elements like wells, benches, etc.
    const decorations = [
      { type: 'well', offset: { x: 0, z: -6 } },
      { type: 'bench', offset: { x: -4, z: 2 } },
      { type: 'bench', offset: { x: 4, z: 2 } },
      { type: 'lamp_post', offset: { x: -6, z: -6 } },
      { type: 'lamp_post', offset: { x: 6, z: -6 } },
      { type: 'lamp_post', offset: { x: -6, z: 6 } },
      { type: 'lamp_post', offset: { x: 6, z: 6 } }
    ];
    
    for (const deco of decorations) {
      this.emitTypedEvent(EventType.ENTITY_SPAWNED, {
        entityId: `${deco.type}_${town.id}_${decorations.indexOf(deco)}`,
        entityType: deco.type
      });
    }
  }

  private generateWorldFeatures(): void {
    // Generate roads between towns
    this.generateRoads();
    
    // Generate zone boundaries
    this.generateZoneBoundaries();
  }

  private generateRoads(): void {
    // Simple road generation between adjacent towns
    const townPairs = [
      ['town_central', 'town_eastern'],
      ['town_central', 'town_western'],
      ['town_central', 'town_northern'],
      ['town_central', 'town_southern'],
    ];
    
    for (const [townA, townB] of townPairs) {
      const startTown = this.towns.get(townA);
      const endTown = this.towns.get(townB);
      
      if (startTown && endTown) {
        this.emitTypedEvent(EventType.ENTITY_SPAWNED, {
          entityId: `road_${townA}_to_${townB}`,
          entityType: 'road'
        });
      }
    }
  }

  private generateZoneBoundaries(): void {
    // Visual indicators for different difficulty zones
    const zones = [
      { name: 'Beginner Zone', center: { x: 0, z: 0 }, radius: 150, level: '1-5' },
      { name: 'Intermediate Zone', center: { x: 200, z: 0 }, radius: 100, level: '5-10' },
      { name: 'Advanced Zone', center: { x: -200, z: 0 }, radius: 100, level: '10-15' }
    ];
    
    for (const zone of zones) {
      this.emitTypedEvent(EventType.ENTITY_SPAWNED, {
        entityId: `zone_${zone.name.replace(/\s+/g, '_').toLowerCase()}`,
        entityType: 'zone_marker'
      });
    }
  }

  private generateMobSpawnPoints(): void {
    
    // Define mob spawn areas based on difficulty zones
    const spawnAreas = [
      // Level 1 areas - Goblins, Bandits, Barbarians
      { center: { x: 50, y: 2, z: 50 }, radius: 30, mobTypes: ['goblin', 'bandit', 'barbarian'], difficulty: 1 },
      { center: { x: -50, y: 2, z: 50 }, radius: 30, mobTypes: ['goblin', 'bandit'], difficulty: 1 },
      { center: { x: 50, y: 2, z: -50 }, radius: 30, mobTypes: ['barbarian', 'goblin'], difficulty: 1 },
      { center: { x: -50, y: 2, z: -50 }, radius: 30, mobTypes: ['bandit', 'barbarian'], difficulty: 1 },
      
      // Level 2 areas - Hobgoblins, Guards, Dark Warriors
      { center: { x: 150, y: 2, z: 150 }, radius: 40, mobTypes: ['hobgoblin', 'guard'], difficulty: 2 },
      { center: { x: -150, y: 2, z: 150 }, radius: 40, mobTypes: ['dark_warrior', 'hobgoblin'], difficulty: 2 },
      { center: { x: 150, y: 2, z: -150 }, radius: 40, mobTypes: ['guard', 'dark_warrior'], difficulty: 2 },
      
      // Level 3 areas - Black Knights, Ice Warriors, Dark Rangers
      { center: { x: 250, y: 2, z: 250 }, radius: 50, mobTypes: ['black_knight', 'ice_warrior'], difficulty: 3 },
      { center: { x: -250, y: 2, z: 250 }, radius: 50, mobTypes: ['dark_ranger', 'black_knight'], difficulty: 3 },
      { center: { x: 0, y: 2, z: 300 }, radius: 60, mobTypes: ['ice_warrior', 'dark_ranger'], difficulty: 3 }
    ];
    
    // Generate spawn points within each area
    for (const area of spawnAreas) {
      const pointsPerArea = 8; // Multiple spawn points per area
      
      for (let i = 0; i < pointsPerArea; i++) {
        const angle = (i / pointsPerArea) * Math.PI * 2;
        const distance = Math.random() * area.radius;
        const x = area.center.x + Math.cos(angle) * distance;
        const z = area.center.z + Math.sin(angle) * distance;
        
        const spawnPoint = {
          position: { x, y: area.center.y, z },
          mobType: area.mobTypes[Math.floor(Math.random() * area.mobTypes.length)],
          spawnRadius: 10,
          difficulty: area.difficulty
        };
        
        this.mobSpawnPoints.push(spawnPoint);
        
        // Emit individual mob spawn request for each mob
        this.emitTypedEvent(EventType.MOB_SPAWN_REQUEST, {
          mobType: spawnPoint.mobType,
          level: spawnPoint.difficulty,
          position: spawnPoint.position,
          respawnTime: 300000, // 5 minutes
          name: `${spawnPoint.mobType.charAt(0).toUpperCase() + spawnPoint.mobType.slice(1).replace(/_/g, ' ')}`,
          aggroRange: spawnPoint.spawnRadius
        });
      }
    }
    
    RPGLogger.system('RPGWorldGenerationSystem', `Generated ${this.mobSpawnPoints.length} mob spawn points`);
  }

  private generateResourceSpawnPoints(): void {
    
    // Generate tree spawn points
    for (let i = 0; i < 50; i++) {
      const x = (Math.random() - 0.5) * 400; // Spread across 400x400 world
      const z = (Math.random() - 0.5) * 400;
      
      this.resourceSpawnPoints.push({
        position: { x, y: 2, z },
        type: 'tree',
        subType: 'regular'
      });
    }
    
    // Generate fishing spot locations
    const fishingSpots = [
      { x: 25, y: 2, z: 25 }, { x: -25, y: 2, z: 25 }, { x: 25, y: 2, z: -25 },
      { x: 75, y: 2, z: 75 }, { x: -75, y: 2, z: -75 }, { x: 125, y: 2, z: 0 }
    ];
    
    for (const spot of fishingSpots) {
      this.resourceSpawnPoints.push({
        position: spot,
        type: 'fishing_spot',
        subType: 'lake'
      });
    }
    
    
    // Notify resource system about spawn points
    this.emitTypedEvent(EventType.ENTITY_SPAWNED, {
      spawnPoints: this.resourceSpawnPoints
    });
  }

  private spawnStructure(data: { type: string; position: { x: number; y: number; z: number; }; config?: Record<string, unknown>; }): void {
    // This would be handled by the actual world/entity system
    // For now, just log what would be spawned
    
    // Store structure data
    const structureData = {
      type: data.type,
      position: data.position,
      config: data.config || {}
    };
    const structureId = `${structureData.type}_${Date.now()}`;
    this.worldStructures.set(structureId, structureData);
  }

  // API methods for other systems
  getTowns(): Town[] {
    return [...this.towns.values()];
  }

  private calculateDistance2D(pos1: { x: number; z: number }, pos2: { x: number; z: number }): number {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.z - pos2.z, 2)
    );
  }

  getNearestTown(position: { x: number; z: number }): Town | null {
    let nearestTown: Town | null = null;
    let minDistance = Infinity;
    
    for (const town of this.towns.values()) {
      const distance = this.calculateDistance2D(position, town.position);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestTown = town;
      }
    }
    
    return nearestTown;
  }

  isInSafeZone(position: { x: number; z: number }): boolean {
    for (const town of this.towns.values()) {
      const distance = this.calculateDistance2D(position, town.position);
      
      if (distance <= town.safeZoneRadius) {
        return true;
      }
    }
    
    return false;
  }

  getMobSpawnPoints(): Array<{ position: { x: number; y: number; z: number }; mobType: string; spawnRadius: number; difficulty: number }> {
    return [...this.mobSpawnPoints];
  }

  getResourceSpawnPoints(): Array<{ position: { x: number; y: number; z: number }; type: string; subType: string }> {
    return [...this.resourceSpawnPoints];
  }

  getWorldStructures(): Map<string, { type: string; position: { x: number; y: number; z: number }; config: Record<string, unknown> }> {
    return this.worldStructures;
  }



  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all world generation data
    this.towns.clear();
    this.worldStructures.clear();
    this.mobSpawnPoints.length = 0;
    this.resourceSpawnPoints.length = 0;
    
    RPGLogger.system('RPGWorldGenerationSystem', 'World generation system destroyed and cleaned up');
    
    // Call parent cleanup
    super.destroy();
  }
} 