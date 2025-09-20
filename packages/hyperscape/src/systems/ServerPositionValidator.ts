/**
 * Server-side system to continuously validate and correct player positions
 * This ensures players never fall below terrain even when stationary
 */

import { SystemBase } from './SystemBase';
import type { World } from '../World';
import type { TerrainSystem } from './TerrainSystem';
import type { ServerNetwork } from './ServerNetwork';

export class ServerPositionValidator extends SystemBase {
  private lastValidationTime = 0;
  private validationInterval = 100; // Start with aggressive checking (100ms)
  private systemUptime = 0;
  
  constructor(world: World) {
    super(world, {
      name: 'ServerPositionValidator',
      dependencies: {},
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    this.logger.info('ServerPositionValidator initialized');
  }

  async start(): Promise<void> {
    this.logger.info('ServerPositionValidator started');
  }

  update(dt: number): void {
    // Only run on server
    if (!this.world.isServer) return;
    
    // Track system uptime
    this.systemUptime += dt;
    
    // Use aggressive checking for first 10 seconds, then slow down
    if (this.systemUptime > 10 && this.validationInterval < 1000) {
      this.validationInterval = 1000; // Switch to 1 second intervals after 10 seconds
      this.logger.info('ServerPositionValidator switching to normal interval (1s)');
    }
    
    // Throttle validation checks
    this.lastValidationTime += dt * 1000;
    if (this.lastValidationTime < this.validationInterval) return;
    this.lastValidationTime = 0;
    
    // Get terrain system
    const terrain = this.world.getSystem('terrain') as TerrainSystem | null;
    if (!terrain) {
      this.logger.warn('No terrain system available');
      return;
    }
    
    // Validate all player positions
    const players: any[] = [];
    
    // Try to get players from the entities system
    if (this.world.entities && typeof this.world.entities.getPlayers === 'function') {
      players.push(...this.world.entities.getPlayers());
    } else if (this.world.entities && (this.world.entities as any).players) {
      // Try to access the players map directly
      const playersMap = (this.world.entities as any).players;
      if (playersMap && typeof playersMap.values === 'function') {
        players.push(...playersMap.values());
      }
    } else if (this.world.entities && (this.world.entities as any).items) {
      // Fallback to items map
      const itemsMap = (this.world.entities as any).items;
      if (itemsMap && typeof itemsMap.forEach === 'function') {
        itemsMap.forEach((entity: any) => {
          if (entity && entity.type === 'player') {
            players.push(entity);
          }
        });
      }
    }
    
    if (players.length === 0) {
      // No players found - this might be normal if no one is connected
      return;
    }
    
    // Log that we're checking players
    this.logger.info(`Checking ${players.length} player positions...`);
    
    for (const player of players) {
      const currentY = player.position.y;
      
      // Check for invalid Y
      if (currentY < -5 || currentY > 200 || !Number.isFinite(currentY)) {
        this.logger.error(
          `Player ${player.id} has invalid Y=${currentY}, correcting...`);
        
        // Get terrain height at player position
        const terrainHeight = terrain.getHeightAt(player.position.x, player.position.z);
        
        let correctedY: number;
        if (Number.isFinite(terrainHeight) && terrainHeight > -100 && terrainHeight < 100) {
          correctedY = terrainHeight + 0.1; // Keep player 10cm above terrain
        } else {
          correctedY = 10; // Safe fallback
        }
        
        // Apply correction
        player.position.y = correctedY;
        if (player.data) {
          player.data.position = [player.position.x, correctedY, player.position.z];
        }
        
        // Broadcast correction to clients
        const network = this.world.getSystem('ServerNetwork') as ServerNetwork | null;
        if (network && network.send) {
          network.send('entityModified', {
            id: player.id,
            changes: { p: [player.position.x, correctedY, player.position.z] }
          });
        }
        
        this.logger.info(
          `Corrected player ${player.id} from Y=${currentY} to Y=${correctedY}`);
      }
      
      // Also validate against terrain even if Y seems valid
      else {
        const terrainHeight = terrain.getHeightAt(player.position.x, player.position.z);
        if (Number.isFinite(terrainHeight)) {
          const expectedY = terrainHeight + 0.1; // 10cm above terrain
          const errorMargin = Math.abs(currentY - expectedY);
          
          // If player is too far from expected terrain height
          if (errorMargin > 10) {
            this.logger.warn(
              `Player ${player.id} is ${errorMargin.toFixed(1)}m from terrain, correcting...`);
            
            player.position.y = expectedY;
            if (player.data) {
              player.data.position = [player.position.x, expectedY, player.position.z];
            }
            
            // Broadcast correction
            const network = this.world.getSystem('ServerNetwork') as ServerNetwork | null;
            if (network && network.send) {
              network.send('entityModified', {
                id: player.id,
                changes: { p: [player.position.x, expectedY, player.position.z] }
              });
            }
          }
        }
      }
    }
  }
}
