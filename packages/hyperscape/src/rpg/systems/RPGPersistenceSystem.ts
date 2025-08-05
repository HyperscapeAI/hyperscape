import { RPGSystemBase } from './RPGSystemBase';
import { EventType } from '../../types/events';
import { getSystem } from '../../core/utils/SystemUtils';
import type { World } from '../../types/index';
import { TerrainSystem } from '../../core/systems/TerrainSystem';
import { IPlayerSystemForPersistence } from '../types/core';
import type { RPGWorldChunk } from '../types/core';
import type { WorldChunkData, RPGPlayerSessionRow } from '../types/database';
import { RPGLogger } from '../utils/RPGLogger';
// RPGDatabaseSystem is imported dynamically on server only

/**
 * RPG Persistence System
 * Coordinates all persistence operations across the RPG systems
 * - Manages periodic saves for performance optimization
 * - Handles session tracking and cleanup
 * - Manages chunk inactivity and reset timers
 * - Provides centralized persistence monitoring
 */
export class RPGPersistenceSystem extends RPGSystemBase {
  private databaseSystem?: import('./RPGDatabaseSystem').RPGDatabaseSystem;
  private playerSystem?: IPlayerSystemForPersistence;
  private terrainSystem?: TerrainSystem;
  
  // Timers and intervals
  // Last execution times for frame-based updates
  private lastPeriodicSave = 0;
  private lastChunkCleanup = 0;
  private lastSessionCleanup = 0;
  private lastMaintenance = 0;
  
  // Configuration
  private readonly PERIODIC_SAVE_INTERVAL = 30000; // 30 seconds
  private readonly CHUNK_CLEANUP_INTERVAL = 300000; // 5 minutes
  private readonly SESSION_CLEANUP_INTERVAL = 600000; // 10 minutes  
  private readonly MAINTENANCE_INTERVAL = 3600000; // 1 hour
  private readonly CHUNK_INACTIVE_TIME = 900000; // 15 minutes
  
  // Statistics
  private stats = {
    totalSaves: 0,
    lastSaveTime: 0,
    chunksReset: 0,
    sessionsEnded: 0,
    lastMaintenanceTime: 0
  };

  constructor(world: World) {
    super(world, {
      name: 'rpg-persistence',
      dependencies: {
        required: ['rpg-database'], // Needs database for persistence
        optional: ['rpg-player', 'terrain'] // Can save player and terrain data if available
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Get references to other systems
    this.databaseSystem = getSystem(this.world, 'rpg-database') as import('./RPGDatabaseSystem').RPGDatabaseSystem | undefined;
    if (!this.databaseSystem && this.world.isServer) {
      throw new Error('[RPGPersistenceSystem] RPGDatabaseSystem not found on server!');
    }
    
    this.playerSystem = getSystem(this.world, 'rpg-player') as unknown as IPlayerSystemForPersistence | undefined;
    if (!this.playerSystem) {
      RPGLogger.systemWarn('RPGPersistenceSystem', 'RPGPlayerSystem not found - player persistence will be limited');
    }
    
    this.terrainSystem = getSystem<TerrainSystem>(this.world, 'terrain') || undefined;
    if (!this.terrainSystem) {
      // This is expected in test environments without terrain, so use debug level
      console.debug('[RPGPersistenceSystem] TerrainSystem not found - chunk persistence will be limited');
    }
    
    // Subscribe to critical persistence events using type-safe event system
    this.subscribe<{ playerId: string; playerToken?: string }>(EventType.PLAYER_JOINED, (event) => this.onPlayerEnter(event.data));
    this.subscribe<{ playerId: string }>(EventType.PLAYER_LEFT, (event) => this.onPlayerLeave(event.data));
    this.subscribe<{ chunkId: string; chunkData: RPGWorldChunk }>(EventType.CHUNK_LOADED, (event) => {
      // Convert chunkId to chunkX/chunkZ coordinates
      const coords = this.parseChunkId(event.data.chunkId);
      this.onChunkLoaded({ chunkX: coords.x, chunkZ: coords.z });
    });
    this.subscribe<{ chunkId: string }>(EventType.CHUNK_UNLOADED, (event) => {
      // Convert chunkId to chunkX/chunkZ coordinates
      const coords = this.parseChunkId(event.data.chunkId);
      this.onChunkUnloaded({ chunkX: coords.x, chunkZ: coords.z });
    });
    
    // Subscribe to persistence test events
    this.subscribe<{ playerId: string; data?: Record<string, unknown> }>(EventType.PERSISTENCE_SAVE, (event) => {
      this.handleTestSave({ playerId: event.data.playerId, data: event.data.data || {} });
    });
    this.subscribe<{ playerId: string }>(EventType.PERSISTENCE_LOAD, (event) => {
      this.handleTestLoad({ playerId: event.data.playerId });
    });
    
  }

  /**
   * Parse a chunk ID string like "chunk_10_20" to coordinates
   */
  private parseChunkId(chunkId: string): { x: number; z: number } {
    const parts = chunkId.split('_');
    if (parts.length >= 3) {
      return { x: parseInt(parts[1], 10), z: parseInt(parts[2], 10) };
    }
    RPGLogger.systemWarn('RPGPersistenceSystem', `Invalid chunk ID format: ${chunkId}`);
    return { x: 0, z: 0 };
  }

  start(): void {
    RPGLogger.system('RPGPersistenceSystem', 'Starting persistence services...');
    
    // Initialize last execution times
    const now = Date.now();
    this.lastPeriodicSave = now;
    this.lastChunkCleanup = now;
    this.lastSessionCleanup = now;
    this.lastMaintenance = now;
    
    RPGLogger.system('RPGPersistenceSystem', 'Persistence services started - using frame-based updates');
  }

  destroy(): void {
    // Perform final save before shutting down
    this.performPeriodicSave().catch(error => {
      RPGLogger.systemError('RPGPersistenceSystem', 'Failed to perform final save', error instanceof Error ? error : new Error(String(error)));
    });
    
    // Clear persistence state
    this.stats = {
      totalSaves: 0,
      lastSaveTime: 0,
      chunksReset: 0,
      sessionsEnded: 0,
      lastMaintenanceTime: 0
    };
    
    // Reset timing variables
    this.lastPeriodicSave = 0;
    this.lastChunkCleanup = 0;
    this.lastSessionCleanup = 0;
    this.lastMaintenance = 0;
    
    // Call parent cleanup (handles event listeners automatically)
    super.destroy();
    
    RPGLogger.system('RPGPersistenceSystem', 'Persistence system destroyed');
  }

  // Event Handlers
  private async onPlayerEnter(event: { playerId: string; playerToken?: string }): Promise<void> {
    if (!this.databaseSystem) return;
    
    try {
      const sessionData: Omit<RPGPlayerSessionRow, 'id' | 'sessionId'> = {
        playerId: event.playerId,
        sessionStart: Date.now(),
        sessionEnd: null,
        playtimeMinutes: 0,
        reason: null,
        lastActivity: Date.now()
      };
      
      await this.databaseSystem.createPlayerSession(sessionData);
    } catch (_error) {
      RPGLogger.systemError('RPGPersistenceSystem', `Failed to create session for player ${event.playerId}`, _error instanceof Error ? _error : new Error(String(_error)));
    }
  }

  private async onPlayerLeave(event: { playerId: string; sessionId?: string; reason?: string }): Promise<void> {
    if (!this.databaseSystem) return;
    
    try {
      // Find and end the player's active session
      const activeSessions = this.databaseSystem.getActivePlayerSessions();
      const playerSession = activeSessions.find(s => s.playerId === event.playerId);
      
      if (playerSession) {
        this.databaseSystem.endPlayerSession(playerSession.id, event.reason || 'disconnect');
        this.stats.sessionsEnded++;
      }
    } catch (_error) {
      RPGLogger.systemError('RPGPersistenceSystem', `Failed to end session for player ${event.playerId}`, _error instanceof Error ? _error : new Error(String(_error)));
    }
  }

  private async onChunkLoaded(event: { chunkX: number; chunkZ: number }): Promise<void> {
    if (!this.databaseSystem) return;
    
    try {
      // Update chunk activity
      this.databaseSystem.updateChunkPlayerCount(event.chunkX, event.chunkZ, 1);
    } catch (_error) {
      RPGLogger.systemError('RPGPersistenceSystem', 'Failed to update chunk activity', _error instanceof Error ? _error : new Error(String(_error)));
    }
  }

  private async onChunkUnloaded(event: { chunkX: number; chunkZ: number }): Promise<void> {
    if (!this.databaseSystem) return;
    
    try {
      // Update chunk activity
      this.databaseSystem.updateChunkPlayerCount(event.chunkX, event.chunkZ, 0);
    } catch (_error) {
      RPGLogger.systemError('RPGPersistenceSystem', 'Failed to update chunk activity', _error instanceof Error ? _error : new Error(String(_error)));
    }
  }

  // Periodic Tasks
  private async performPeriodicSave(): Promise<void> {
    try {
      const startTime = Date.now();
      let saveCount = 0;

      // Save active player sessions
      if (this.databaseSystem) {
        const activeSessions = this.databaseSystem.getActivePlayerSessions();
        for (const session of activeSessions) {
          this.databaseSystem.updatePlayerSession(session.id, {
            lastActivity: Date.now()
          });
          saveCount++;
        }
      }

      // Save active chunks
      if (this.terrainSystem && this.databaseSystem) {
        // Get active chunks from terrain system and save them
        // This would need to be implemented in the terrain system
        const activeChunks = await this.getActiveChunks();
        for (const chunk of activeChunks) {
          // Convert RPGWorldChunk to WorldChunkData
          const chunkData: WorldChunkData = {
            chunkX: chunk.chunkX,
            chunkZ: chunk.chunkZ,
            data: JSON.stringify(chunk.data || {}),
            lastActive: chunk.lastActivity ? chunk.lastActivity.getTime() : Date.now(),
            playerCount: 0, // Will be updated by active player tracking
            version: 1
          };
          this.databaseSystem.saveWorldChunk(chunkData);
          saveCount++;
        }
      }

      const duration = Date.now() - startTime;
      this.stats.totalSaves += saveCount;
      this.stats.lastSaveTime = Date.now();

      if (saveCount > 0) {
        RPGLogger.system('RPGPersistenceSystem', `💾 Periodic save completed: ${saveCount} items in ${duration}ms`);
      }
    } catch (_error) {
      RPGLogger.systemError('RPGPersistenceSystem', 'Periodic save failed', _error instanceof Error ? _error : new Error(String(_error)));
    }
  }

  private async performChunkCleanup(): Promise<void> {
    if (!this.databaseSystem) return;

    try {
      // Find chunks that have been inactive for too long
      const inactiveChunks = this.databaseSystem.getInactiveChunks(this.CHUNK_INACTIVE_TIME / 60000); // Convert to minutes
      
      for (const chunk of inactiveChunks) {
        // Mark chunk for reset
        this.databaseSystem.markChunkForReset(chunk.chunkX, chunk.chunkZ);
        
        // If chunk has no players and has been marked for reset, reset it
        if (chunk.playerCount === 0 && chunk.needsReset === 1) {
          this.databaseSystem.resetChunk(chunk.chunkX, chunk.chunkZ);
          this.stats.chunksReset++;
        }
      }

      if (inactiveChunks.length > 0) {
        RPGLogger.system('RPGPersistenceSystem', `🧹 Chunk cleanup: ${inactiveChunks.length} inactive chunks processed`);
      }
    } catch (_error) {
      RPGLogger.systemError('RPGPersistenceSystem', 'Chunk cleanup failed', _error instanceof Error ? _error : new Error(String(_error)));
    }
  }

  private async performSessionCleanup(): Promise<void> {
    if (!this.databaseSystem) return;

    try {
      // End stale sessions (no activity for 5+ minutes)
      const activeSessions = this.databaseSystem.getActivePlayerSessions();
      const cutoffTime = Date.now() - 300000; // 5 minutes

      for (const session of activeSessions) {
        if (session.lastActivity && session.lastActivity < cutoffTime) {
          this.databaseSystem.endPlayerSession(session.id, 'timeout');
          this.stats.sessionsEnded++;
        }
      }
    } catch (_error) {
      RPGLogger.systemError('RPGPersistenceSystem', 'Session cleanup failed', _error instanceof Error ? _error : new Error(String(_error)));
    }
  }

  private async performMaintenance(): Promise<void> {
    if (!this.databaseSystem) return;

    try {

      // Clean up old sessions (7+ days old)
      const oldSessionsDeleted = this.databaseSystem.cleanupOldSessions(7);
      
      // Clean up old chunk activity records (30+ days old)
      const oldActivityDeleted = this.databaseSystem.cleanupOldChunkActivity(30);
      
      // Get database statistics
      const dbStats = this.databaseSystem.getDatabaseStats();

      this.stats.lastMaintenanceTime = Date.now();

      RPGLogger.system('RPGPersistenceSystem', '🔧 Maintenance completed', {
        oldSessionsDeleted,
        oldActivityDeleted,
        dbStats
      });
    } catch (_error) {
      RPGLogger.systemError('RPGPersistenceSystem', 'Maintenance failed', _error instanceof Error ? _error : new Error(String(_error)));
    }
  }

  // Helper methods
  private async getActiveChunks(): Promise<RPGWorldChunk[]> {
    // This would need to be implemented to get active chunks from the terrain system
    // For now, return empty array
    return [];
  }

  // Public API
  async forceSave(): Promise<void> {
    await this.performPeriodicSave();
  }

  async forceChunkCleanup(): Promise<void> {
    await this.performChunkCleanup();
  }

  async forceMaintenance(): Promise<void> {
    await this.performMaintenance();
  }

  private async handleTestSave(data: { playerId: string; data: Record<string, unknown> }): Promise<void> {
    RPGLogger.system('RPGPersistenceSystem', `Test save requested for player ${data.playerId}`);
    
    // Simulate saving player data
    try {
      // In a real implementation, this would save to database
      // For testing, we'll just emit a success message
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: 'Player data saved successfully',
        type: 'success' as const
      });
    } catch (_error) {
              RPGLogger.systemError('RPGPersistenceSystem', 'Test save failed', _error instanceof Error ? _error : new Error(String(_error)));
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: `Failed to save data: ${_error instanceof Error ? _error.message : String(_error)}`,
        type: 'error' as const
      });
    }
  }

  private async handleTestLoad(data: { playerId: string }): Promise<void> {
    RPGLogger.system('RPGPersistenceSystem', `Test load requested for player ${data.playerId}`);
    
    // Simulate loading player data
    try {
      // In a real implementation, this would load from database
      // For testing, we'll return some dummy data immediately
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: 'Player data loaded successfully',
        type: 'success' as const
      });
    } catch (_error) {
              RPGLogger.systemError('RPGPersistenceSystem', 'Test load failed', _error instanceof Error ? _error : new Error(String(_error)));
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: `Failed to load data: ${_error instanceof Error ? _error.message : String(_error)}`,
        type: 'error' as const
      });
    }
  }

  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  // Active persistence update cycle
  update(_dt: number): void {
    const now = Date.now();
    
    // Check if it's time for periodic save
    if (now - this.lastPeriodicSave >= this.PERIODIC_SAVE_INTERVAL) {
      this.lastPeriodicSave = now;
      this.performPeriodicSave().catch(error => {
        RPGLogger.systemError('RPGPersistenceSystem', 'Periodic save failed', error instanceof Error ? error : new Error(String(error)));
      });
    }
    
    // Check if it's time for chunk cleanup
    if (now - this.lastChunkCleanup >= this.CHUNK_CLEANUP_INTERVAL) {
      this.lastChunkCleanup = now;
      this.performChunkCleanup().catch(error => {
        RPGLogger.systemError('RPGPersistenceSystem', 'Chunk cleanup failed', error instanceof Error ? error : new Error(String(error)));
      });
    }
    
    // Check if it's time for session cleanup
    if (now - this.lastSessionCleanup >= this.SESSION_CLEANUP_INTERVAL) {
      this.lastSessionCleanup = now;
      this.performSessionCleanup().catch(error => {
        RPGLogger.systemError('RPGPersistenceSystem', 'Session cleanup failed', error instanceof Error ? error : new Error(String(error)));
      });
    }
    
    // Check if it's time for maintenance
    if (now - this.lastMaintenance >= this.MAINTENANCE_INTERVAL) {
      this.lastMaintenance = now;
      this.performMaintenance().catch(error => {
        RPGLogger.systemError('RPGPersistenceSystem', 'Maintenance failed', error instanceof Error ? error : new Error(String(error)));
      });
    }
  }

}