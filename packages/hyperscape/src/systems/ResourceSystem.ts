import { SystemBase } from './SystemBase';
import type { World } from '../types';
import { EventType } from '../types/events';
import { Resource, ResourceDrop } from '../types/core';
import {
  PlayerID,
  ResourceID,
} from '../types/identifiers';
import { calculateDistance } from '../utils/EntityUtils';
import {
  createPlayerID,
  createResourceID
} from '../utils/IdentifierUtils';
import type {
  TerrainResourceSpawnPoint,
  TerrainTileData,
  TerrainResource
} from '../types/terrain';

/**
 * Resource System
 * Manages resource gathering per GDD specifications:
 * 
 * Woodcutting:
 * - Click tree with hatchet equipped
 * - Success rates based on skill level
 * - Produces logs
 * 
 * Fishing:
 * - Click water edge with fishing rod equipped  
 * - Success rates based on skill level
 * - Produces raw fish
 * 
 * Resource respawning and depletion mechanics
 */
export class ResourceSystem extends SystemBase {
  private resources = new Map<ResourceID, Resource>();
  private activeGathering = new Map<PlayerID, { playerId: PlayerID; resourceId: ResourceID; startTime: number; skillCheck: number }>();
  private respawnTimers = new Map<ResourceID, NodeJS.Timeout>();
  private playerSkills = new Map<string, Record<string, { level: number; xp: number }>>();

  // Resource drop tables per GDD
  private readonly RESOURCE_DROPS = new Map<string, ResourceDrop[]>([
    ['tree_normal', [
      {
        itemId: '200', // Logs
        itemName: 'Logs',
        quantity: 1,
        chance: 1.0, // Always get logs
        xpAmount: 25, // Woodcutting XP per log
        stackable: true
      }
    ]],
    ['herb_patch_normal', [
      {
        itemId: '202', // Herbs
        itemName: 'Herbs',
        quantity: 1,
        chance: 1.0, // Always get herbs
        xpAmount: 20, // Herbalism XP per herb
        stackable: true
      }
    ]],
    ['fishing_spot_normal', [
      {
        itemId: '201', // Raw Fish
        itemName: 'Raw Fish',
        quantity: 1,
        chance: 1.0, // Always get fish (when successful)
        xpAmount: 10, // Fishing XP per fish
        stackable: true
      }
    ]]
  ]);

  constructor(world: World) {
    super(world, {
      name: 'rpg-resource',
      dependencies: {
        required: [], // Resource system can work independently
        optional: ['rpg-inventory', 'rpg-xp', 'rpg-skills', 'rpg-ui', 'terrain'] // Better with inventory, skills, and terrain systems
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Set up type-safe event subscriptions for resource management
    this.subscribe<{ spawnPoints: TerrainResourceSpawnPoint[] }>(EventType.RESOURCE_SPAWN_POINTS_REGISTERED, (data) => this.registerTerrainResources(data));
    // Bridge gather click -> start gathering with player position
    this.subscribe<{ playerId: string; resourceId: string }>(EventType.RESOURCE_GATHER, (data) => {
      const player = this.world.getPlayer?.(data.playerId);
      const playerPosition = player && (player as { position?: { x: number; y: number; z: number } }).position
        ? (player as { position: { x: number; y: number; z: number } }).position
        : { x: 0, y: 0, z: 0 };
      this.startGathering({ playerId: data.playerId, resourceId: data.resourceId, playerPosition });
    });
    
    // Set up player gathering event subscriptions
    this.subscribe<{ playerId: string; resourceId: string; playerPosition: { x: number; y: number; z: number } }>(EventType.RESOURCE_GATHERING_STARTED, (data) => this.startGathering(data));
    this.subscribe<{ playerId: string; resourceId: string }>(EventType.RESOURCE_GATHERING_STOPPED, (data) => this.stopGathering(data));
    this.subscribe<{ id: string }>(EventType.PLAYER_UNREGISTERED, (data) => this.cleanupPlayerGathering(data.id));
    
    // Set up terrain system event subscriptions for resource generation
    this.subscribe<TerrainTileData>(EventType.TERRAIN_TILE_GENERATED, (data) => this.onTerrainTileGenerated(data));
    this.subscribe<{ tileId: string }>('terrain:tile:unloaded', (data) => this.onTerrainTileUnloaded(data));

    // Listen to skills updates for reactive patterns
    this.subscribe<{ playerId: string; skills: Record<string, { level: number; xp: number }> }>(EventType.SKILLS_UPDATED, (data) => {
      this.playerSkills.set(data.playerId, data.skills);
    });
    
  }

  start(): void {
    // Gathering progress is updated via system lifecycle methods
  }

  // Add lifecycle method for gathering updates
  update(): void {
    this.updateGathering();
  }

  /**
   * Handle terrain system resource registration (new procedural system)
   */
  private registerTerrainResources(data: { spawnPoints: TerrainResourceSpawnPoint[] }): void {
    const { spawnPoints } = data;
    
    for (const spawnPoint of spawnPoints) {
      const resource = this.createResourceFromSpawnPoint(spawnPoint);
      if (resource) {
        this.resources.set(createResourceID(resource.id), resource);
        // Emit spawn event so visual test or interaction layers can render cubes
        this.emitTypedEvent(EventType.RESOURCE_SPAWNED, resource);
      }
    }
  }
  
  /**
   * Create resource from terrain spawn point
   */
  private createResourceFromSpawnPoint(spawnPoint: TerrainResourceSpawnPoint): Resource | undefined {
    const { position, type, subType: _subType } = spawnPoint;
    
    let skillRequired: string;
    let toolRequired: string;
    let respawnTime: number;
    let levelRequired: number = 1;
    
    switch (type) {
      case 'tree':
        skillRequired = 'woodcutting';
        toolRequired = 'bronze_hatchet'; // Bronze Hatchet
        respawnTime = 60000; // 1 minute respawn
        break;
        
      case 'fish':
        skillRequired = 'fishing';
        toolRequired = 'fishing_rod'; // Fishing Rod  
        respawnTime = 30000; // 30 second respawn
        break;
        
      case 'rock':
      case 'ore':
        skillRequired = 'mining';
        toolRequired = 'bronze_pickaxe'; // Bronze Pickaxe
        respawnTime = 120000; // 2 minute respawn
        levelRequired = 5;
        break;
        
      case 'herb':
        skillRequired = 'herbalism';
        toolRequired = ''; // No tool required for herbs
        respawnTime = 45000; // 45 second respawn
        levelRequired = 1;
        break;
        
      default:
        throw new Error(`Unknown resource type: ${type}`);
    }
    
    const resourceType: 'tree' | 'fishing_spot' | 'ore' | 'herb_patch' = 
      type === 'rock' ? 'ore' : 
      type === 'fish' ? 'fishing_spot' : 
      type === 'herb' ? 'herb_patch' :
      'tree';
      
    const resource: Resource = {
      id: `${type}_${position.x.toFixed(0)}_${position.z.toFixed(0)}`,
      type: resourceType,
      name: type === 'fish' ? 'Fishing Spot' : 
            type === 'tree' ? 'Tree' : 
            type === 'herb' ? 'Herb' : 'Rock',
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      },
      skillRequired,
      levelRequired,
      toolRequired,
      respawnTime,
      isAvailable: true,
      lastDepleted: 0,
      drops: this.RESOURCE_DROPS.get(`${resourceType}_normal`) || []
    };
    
    return resource;
  }
  
  /**
   * Handle terrain tile generation - add resources from new tiles
   */
  private onTerrainTileGenerated(data: TerrainTileData): void {
    const { resources } = data;
    
    if (resources && resources.length > 0) {
      console.log(`[ResourceSystem] Processing ${resources.length} resources from terrain tile`);
      for (const terrainResource of resources) {
        const resource = this.createResourceFromTerrainResource(terrainResource);
        if (resource) {
          this.resources.set(createResourceID(resource.id), resource);
          // Emit spawn event for each resource to show cubes
          this.emitTypedEvent(EventType.RESOURCE_SPAWNED, resource);
          console.log(`[ResourceSystem] Added resource: ${resource.id} (${resource.type}) at (${resource.position.x.toFixed(0)}, ${resource.position.z.toFixed(0)})`);
        }
      }
    }
  }
  
  /**
   * Handle terrain tile unloading - remove resources from unloaded tiles
   */
  private onTerrainTileUnloaded(data: { tileId: string }): void {
    // Extract tileX and tileZ from tileId (format: "x,z")
    const [tileX, tileZ] = data.tileId.split(',').map(Number);
    
    // Remove resources that belong to this tile
    let _removedCount = 0;
    for (const [resourceId, resource] of this.resources) {
      // Check if resource belongs to this tile (based on position)
      const resourceTileX = Math.floor(resource.position.x / 100); // 100m tile size
      const resourceTileZ = Math.floor(resource.position.z / 100);
      
      if (resourceTileX === tileX && resourceTileZ === tileZ) {
        this.resources.delete(resourceId);
        
        // Clean up any active gathering on this resource
        // Note: activeGathering is keyed by PlayerID, not ResourceID
        // We need to find and remove any gathering sessions for this resource
        for (const [playerId, session] of this.activeGathering) {
          if (session.resourceId === resourceId) {
            this.activeGathering.delete(playerId);
          }
        }
        
        // Clean up respawn timer
        if (this.respawnTimers.has(resourceId)) {
          clearTimeout(this.respawnTimers.get(resourceId)!);
          this.respawnTimers.delete(resourceId);
        }
        
        _removedCount++;
      }
    }
    
    // Resources removed from unloaded tile
  }
  
  /**
   * Create resource from terrain system resource
   */
  private createResourceFromTerrainResource(terrainResource: TerrainResource): Resource | undefined {
    const { id, type, position } = terrainResource;
    
    let skillRequired: string;
    let toolRequired: number | string;
    let respawnTime: number;
    const levelRequired: number = 1;
    
    switch (type) {
      case 'tree':
        skillRequired = 'woodcutting';
        toolRequired = 'bronze_hatchet'; // Bronze Hatchet
        respawnTime = 60000; // 1 minute respawn
        break;
        
      case 'fish':
        skillRequired = 'fishing';
        toolRequired = 'fishing_rod'; // Fishing Rod  
        respawnTime = 30000; // 30 second respawn
        break;
        
      case 'herb':
        skillRequired = 'herbalism';
        toolRequired = 'none'; // No tool required for herbs
        respawnTime = 45000; // 45 second respawn
        break;
        
      case 'rock':
      case 'ore':
      case 'gem':
      case 'rare_ore':
        // Future expansion for mining
        return undefined; // Skip for now
        
      default:
        throw new Error(`Unknown terrain resource type: ${type}`);
    }
    
    // Map terrain types to resource types
    const resourceType: 'tree' | 'fishing_spot' | 'ore' | 'herb_patch' | 'mine' = 
      (type === 'fish') ? 'fishing_spot' : 
      (type === 'herb') ? 'herb_patch' :
      'tree'; // Default to tree for now
      
    const resource: Resource = {
      id: id || `resource_${position.x}_${position.y}_${position.z}_${Date.now()}`,
      type: resourceType,
      name: type === 'fish' ? 'Fishing Spot' : 
            type === 'tree' ? 'Tree' : 
            type === 'herb' ? 'Herb Patch' : 
            'Rock',
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      },
      skillRequired,
      levelRequired,
      toolRequired,
      respawnTime,
      isAvailable: true,
      lastDepleted: 0,
      drops: this.RESOURCE_DROPS.get(`${resourceType}_normal`) || []
    };
    
    return resource;
  }

  private startGathering(data: { playerId: string; resourceId: string; playerPosition: { x: number; y: number; z: number } }): void {
    const playerId = createPlayerID(data.playerId);
    const resourceId = createResourceID(data.resourceId);
    
    const resource = this.resources.get(resourceId);
    
    // Check if resource exists
    if (!resource) {
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: `Resource not found: ${data.resourceId}`,
        type: 'error'
      });
      return;
    }

    // Check if resource is available
    if (!resource.isAvailable) {
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: `This ${resource.type.replace('_', ' ')} is depleted. Please wait for it to respawn.`,
        type: 'info'
      });
      return;
    }

    // Check if player is already gathering
    if (this.activeGathering.has(playerId)) {
      return;
    }

    // Check distance (must be within 2 meters)
    const distance = calculateDistance(data.playerPosition, resource.position);
    if (distance > 2) {
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: `You need to be closer to the ${resource.type.replace('_', ' ')}.`,
        type: 'error'
      });
      return;
    }

    // Check if player has required tool equipped
    const toolMap = {
      'bronze_hatchet': { type: 'hatchet', name: 'hatchet' },
      'fishing_rod': { type: 'fishing_rod', name: 'fishing rod' },
      'bronze_pickaxe': { type: 'pickaxe', name: 'pickaxe' }
    };
    
    const tool = toolMap[resource.toolRequired as keyof typeof toolMap];
    
    this.emitTypedEvent(EventType.INVENTORY_HAS_EQUIPPED, {
      playerId: data.playerId,
      slot: 'weapon', // Tools are equipped in weapon slot
      itemType: tool.type,
      callback: (hasEquipped: boolean) => {
        if (!hasEquipped) {
          this.emitTypedEvent(EventType.UI_MESSAGE, {
            playerId: data.playerId,
            message: `You need a ${tool.name} equipped to ${resource.skillRequired}.`,
            type: 'error'
          });
          return;
        }

        // Check player skill level (reactive pattern)
        const cachedSkills = this.playerSkills.get(data.playerId);
        const skillLevel = cachedSkills?.[resource.skillRequired]?.level ?? 1;
        
        if (resource.levelRequired !== undefined && skillLevel < resource.levelRequired) {
          this.emitTypedEvent(EventType.UI_MESSAGE, {
            playerId: data.playerId,
            message: `You need level ${resource.levelRequired} ${resource.skillRequired} to use this resource.`,
            type: 'error'
          });
          return;
        }

        // Start gathering process
        const skillCheck = Math.random() * 100; // Will determine success
        const gatheringSession = {
          playerId: playerId,
          resourceId: resourceId,
          startTime: Date.now(),
          skillCheck
        };

        this.activeGathering.set(playerId, gatheringSession);

        const actionName = resource.skillRequired === 'woodcutting' ? 'chopping' : 'fishing';
        
        // Send gathering started event
        this.emitTypedEvent(EventType.RESOURCE_GATHERING_STARTED, {
          playerId: data.playerId,
          resourceId: data.resourceId,
          skill: resource.skillRequired,
          actionName
        });

        // Show gathering message
        this.emitTypedEvent(EventType.UI_MESSAGE, {
          playerId: data.playerId, 
          message: `You start ${actionName}...`,
          type: 'info'
        });
      }
    });
  }

  private stopGathering(data: { playerId: string }): void {
    const playerId = createPlayerID(data.playerId);
    const session = this.activeGathering.get(playerId);
    if (session) {
      this.activeGathering.delete(playerId);
      
      this.emitTypedEvent(EventType.RESOURCE_GATHERING_STOPPED, {
        playerId: data.playerId,
        resourceId: session.resourceId
      });
    }
  }

  private cleanupPlayerGathering(playerId: string): void {
    this.activeGathering.delete(createPlayerID(playerId));
  }

  private updateGathering(): void {
    const now = Date.now();
    const completedSessions: PlayerID[] = [];

    for (const [playerId, session] of this.activeGathering.entries()) {
      const resource = this.resources.get(session.resourceId);
      if (!resource?.isAvailable) {
        completedSessions.push(playerId);
        continue;
      }

      // Check if gathering time is complete (3-5 seconds based on skill)
      const gatheringTime = 5000 - (session.skillCheck * 20); // 3-5 seconds based on skill check
      if (now - session.startTime >= gatheringTime) {
        this.completeGathering(playerId, session);
        completedSessions.push(playerId);
      }
    }

    // Clean up completed sessions
    for (const playerId of completedSessions) {
      this.activeGathering.delete(playerId);
    }
  }

  private completeGathering(playerId: PlayerID, session: { playerId: PlayerID; resourceId: ResourceID; startTime: number; skillCheck: number }): void {
    const resource = this.resources.get(session.resourceId)!;

    // Calculate success based on skill level and random check (reactive pattern)
    const cachedSkills = this.playerSkills.get(playerId);
    const skillLevel = cachedSkills?.[resource.skillRequired]?.level ?? 1;
    
    // Success rate: base 60% + skill level * 2% (max ~85% at high levels)
    const baseSuccessRate = 60;
    const skillBonus = skillLevel * 2;
    const successRate = Math.min(85, baseSuccessRate + skillBonus);
    const isSuccessful = session.skillCheck <= successRate;

    if (isSuccessful) {
      // Determine drops
      const dropTable = this.RESOURCE_DROPS.get(`${resource.type}_normal`);
      if (dropTable) {
        for (const drop of dropTable) {
          if (Math.random() <= drop.chance) {
            // Add item to player inventory
            this.emitTypedEvent(EventType.INVENTORY_ITEM_ADDED, {
              playerId: playerId,
              item: {
                id: `inv_${playerId}_${Date.now()}_${drop.itemId}`,
                itemId: drop.itemId,
                quantity: drop.quantity,
                slot: -1, // Let system find empty slot
                metadata: null
              }
            });

            // Award XP and check for level up (reactive pattern)
            this.emitTypedEvent(EventType.SKILLS_XP_GAINED, {
              playerId: playerId,
              skill: resource.skillRequired,
              amount: drop.xpAmount
            });

            // Skills system will listen to XP_GAINED and emit SKILLS_UPDATED reactively

            const actionName = resource.skillRequired === 'woodcutting' ? 'chop down the tree' : 'catch a fish';
            this.emitTypedEvent(EventType.UI_MESSAGE, {
              playerId: playerId,
              message: `You successfully ${actionName} and receive ${drop.quantity}x ${drop.itemName}!`,
              type: 'success'
            });

          }
        }
      }

      // Deplete resource temporarily
      resource.isAvailable = false;
      resource.lastDepleted = Date.now();

      // Set respawn timer
      const respawnTimer = setTimeout(() => {
        resource.isAvailable = true;
        resource.lastDepleted = 0;
        
        // Notify nearby players
        this.emitTypedEvent(EventType.RESOURCE_RESPAWNED, {
          resourceId: session.resourceId,
          position: resource.position
        });
      }, resource.respawnTime);

      this.respawnTimers.set(session.resourceId, respawnTimer);

    } else {
      // Failed attempt
      const actionName = resource.skillRequired === 'woodcutting' ? 'cut the tree' : 'catch anything';
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: playerId,
        message: `You fail to ${actionName}.`,
        type: 'info'
      });

    }

    // Emit gathering completed event
    this.emitTypedEvent(EventType.RESOURCE_GATHERING_COMPLETED, {
      playerId: playerId,
      resourceId: session.resourceId,
      successful: isSuccessful,
      skill: resource.skillRequired
    });
  }

  /**
   * Get all resources for testing/debugging
   */
  getAllResources(): Resource[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get resources by type
   */
  getResourcesByType(type: string): Resource[] {
    return this.getAllResources().filter(resource => resource.type === type);
  }

  /**
   * Get resource by ID
   */
  getResource(resourceId: string): Resource | undefined {
    return this.resources.get(createResourceID(resourceId));
  }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all active gathering sessions
    this.activeGathering.clear();
    
    // Clear all respawn timers to prevent memory leaks
    for (const timer of this.respawnTimers.values()) {
      clearTimeout(timer);
    }
    this.respawnTimers.clear();
    
    // Clear all resource data
    this.resources.clear();
    
    // Call parent cleanup
    super.destroy();
  }
}
