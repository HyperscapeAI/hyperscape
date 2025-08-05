import { getItem } from '../data/items';
import type { PlayerLocal } from '../entities/PlayerLocal';
import { Position3D } from '../types';
import { AttackType, Player, PlayerMigration, Skills } from '../types/core';
import type { HealthUpdateEvent, PlayerDeathEvent, PlayerEnterEvent, PlayerLeaveEvent, PlayerLevelUpEvent } from '../types/events';
import { EventType } from '../types/events';
import type { World } from '../types/index';
import { Logger } from '../utils/Logger';
import { EntityManager } from './EntityManager';
import { SystemBase } from './SystemBase';
import { WorldGenerationSystem } from './WorldGenerationSystem';

export class PlayerSystem extends SystemBase {
  declare world: World;
  
  private players = new Map<string, Player>();
  private respawnTimers = new Map<string, NodeJS.Timeout>();
  private entityManager?: EntityManager;
  private worldGeneration!: WorldGenerationSystem;
  private databaseSystem?: import('./DatabaseSystem').DatabaseSystem;
  private playerLocalRefs = new Map<string, PlayerLocal>(); // Store PlayerLocal references for integration
  private readonly RESPAWN_TIME = 30000; // 30 seconds per GDD
  private readonly AUTO_SAVE_INTERVAL = 30000; // 30 seconds auto-save
  private saveInterval?: NodeJS.Timeout;

  constructor(world: World) {
    super(world, {
      name: 'rpg-player',
      dependencies: {
        optional: ['rpg-entity-manager', 'rpg-database', 'rpg-world-generation', 'rpg-ui']
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    // Subscribe to player events using strongly typed event system
    this.subscribe(EventType.PLAYER_JOINED, (data) => {
      this.onPlayerEnter(data);
    });
    this.subscribe(EventType.PLAYER_LEFT, (data) => {
      this.onPlayerLeave(data);
    });
    this.subscribe(EventType.PLAYER_REGISTERED, (data) => {
      this.onPlayerRegister(data);
    });
    this.subscribe(EventType.PLAYER_DAMAGE, (data) => {
      this.damagePlayer(data.playerId, data.damage, data.source);
    });
    this.subscribe(EventType.PLAYER_DIED, (data) => {
      this.handleDeath(data);
    });
    this.subscribe(EventType.PLAYER_RESPAWN_REQUEST, (data) => {
      this.respawnPlayer(data.playerId);
    });
    this.subscribe(EventType.PLAYER_LEVEL_UP, (data) => {
      this.updateCombatLevel(data);
    });
    
    // Handle consumable item usage
    this.subscribe(EventType.ITEM_USED, (data) => {
      this.handleItemUsed(data);
    });

    // Get system references using the type-safe getSystem method
    this.entityManager = this.world.getSystem<EntityManager>('rpg-entity-manager');
    // Get database system if available (server only)
    this.databaseSystem = this.world.getSystem<import('./DatabaseSystem').DatabaseSystem>('rpg-database');
    this.worldGeneration = this.world.getSystem<WorldGenerationSystem>('rpg-world-generation')!;

    // Start auto-save
    this.startAutoSave();
  }

  start(): void {
    // System is ready
    Logger.system('PlayerSystem', 'System started');
  }

  private onPlayerRegister(data: { playerId: string }): void {
    // For now, just log the registration - PlayerLocal reference will be handled elsewhere
    Logger.system('PlayerSystem', `Player registered: ${data.playerId}`);
  }

  private async onPlayerEnter(data: PlayerEnterEvent): Promise<void> {
    try {
      Logger.system('PlayerSystem', `Player entering: ${data.playerId}`);

      // Check if player already exists in our system
      if (this.players.has(data.playerId)) {
        Logger.system('PlayerSystem', 'Player already exists in system');
        return;
      }

    // Load player data from database
    let playerData: Player | undefined;
    if (this.databaseSystem) {
      const dbData = this.databaseSystem.getPlayer(data.playerId);
      if (dbData) {
        playerData = PlayerMigration.fromPlayerRow(dbData, data.playerId);
      }
    }

    // Create new player if not found in database
    if (!playerData) {
      const playerLocal = this.playerLocalRefs.get(data.playerId);
      const playerName = playerLocal?.name || `Player_${data.playerId}`;
      playerData = PlayerMigration.createNewPlayer(data.playerId, data.playerId, playerName);

      // Save new player to database
      if (this.databaseSystem) {
        this.databaseSystem.savePlayer(data.playerId, {
          name: playerData.name,
          combatLevel: playerData.combat.combatLevel,
          attackLevel: playerData.skills.attack.level,
        strengthLevel: playerData.skills.strength.level,
        defenseLevel: playerData.skills.defense.level,
        constitutionLevel: playerData.skills.constitution.level,
        rangedLevel: playerData.skills.ranged.level,
        health: playerData.health.current,
        maxHealth: playerData.health.max,
        positionX: playerData.position.x,
        positionY: playerData.position.y,
        positionZ: playerData.position.z,
      });
      }
    }

    // Add to our system
    this.players.set(data.playerId, playerData);

    // Emit player ready event
    this.emitTypedEvent(EventType.PLAYER_UPDATED, {
      playerId: data.playerId,
      playerData: {
        id: playerData.id,
        name: playerData.name,
        level: playerData.combat.combatLevel,
        health: playerData.health.current,
        maxHealth: playerData.health.max,
        alive: playerData.alive
      },
    });

    // Update UI
    this.emitPlayerUpdate(data.playerId);
    
    Logger.system('PlayerSystem', `Player data loaded for ${data.playerId}`, { hasPlayer: !!playerData });
    } catch (error) {
      Logger.systemError('PlayerSystem', `Error handling player enter for ${data.playerId}`, 
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  private async onPlayerLeave(data: PlayerLeaveEvent): Promise<void> {
    try {
      Logger.system('PlayerSystem', `Player leaving: ${data.playerId}`);

      // Save player data before removal
      if (this.databaseSystem && this.players.has(data.playerId)) {
        await this.savePlayerToDatabase(data.playerId);
      }

    // Clean up
    this.players.delete(data.playerId);
    this.playerLocalRefs.delete(data.playerId);
    
    // Clear any respawn timers
    const timer = this.respawnTimers.get(data.playerId);
    if (timer) {
      clearTimeout(timer);
      this.respawnTimers.delete(data.playerId);
    }

    Logger.system('PlayerSystem', 'Player cleanup completed');
    } catch (error) {
      Logger.systemError('PlayerSystem', `Error handling player leave for ${data.playerId}`, 
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  private async updateHealth(data: HealthUpdateEvent): Promise<void> {
    const player = this.players.get(data.entityId);
    if (!player) {
      Logger.system('PlayerSystem', `Player not found for health update: ${data.entityId}`);
      return;
    }

    player.health.current = Math.max(0, Math.min(data.currentHealth, data.maxHealth));
    player.health.max = data.maxHealth;

    // Check for death
    if (player.health.current <= 0 && player.alive) {
      this.handleDeath({ 
        playerId: data.entityId, 
        deathLocation: player.position, 
        cause: 'health_depletion' 
      });
    }

    this.emitPlayerUpdate(data.entityId);
  }

  private handleDeath(data: PlayerDeathEvent): void {
    const player = this.players.get(data.playerId)!;

    player.alive = false;
    player.death.deathLocation = { ...player.position };
    player.death.respawnTime = Date.now() + this.RESPAWN_TIME;

    // Start respawn timer
    const timer = this.createTimer(() => {
      this.respawnPlayer(data.playerId);
      this.respawnTimers.delete(data.playerId);
    }, this.RESPAWN_TIME);

    this.respawnTimers.set(data.playerId, timer!);

    // Emit death event
    this.emitTypedEvent(EventType.PLAYER_DIED, {
      playerId: data.playerId,
      deathLocation: {
        x: player.death.deathLocation?.x ?? 0,
        y: player.death.deathLocation?.y ?? 2,
        z: player.death.deathLocation?.z ?? 0
      }
    });
    
    // Also emit ENTITY_DEATH for the death system
    this.emitTypedEvent(EventType.ENTITY_DEATH, {
      entityId: data.playerId,
      killedBy: 'unknown', // Could be passed in if we track the source
      entityType: 'player' as const
    });

    this.emitPlayerUpdate(data.playerId);
  }

  private respawnPlayer(playerId: string): void {
    const player = this.players.get(playerId)!;

    // Get spawn position - use a default spawn point if world generation system doesn't have the method
    const spawnPosition = { x: 0, y: 2, z: 0 }; // Default Lumbridge spawn position

    // Reset player state
    player.alive = true;
    player.health.current = player.health.max;
    player.position = spawnPosition;
    player.death.respawnTime = 0;

    // Clear respawn timer
    const timer = this.respawnTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.respawnTimers.delete(playerId);
    }

    // Update PlayerLocal position if available
    const playerLocal = this.playerLocalRefs.get(playerId);
    if (playerLocal) {
      playerLocal.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    }

    // Emit respawn event
    this.emitTypedEvent(EventType.PLAYER_RESPAWNED, {
      playerId,
      spawnPosition,
      townName: 'Lumbridge' // Default town
    });

    this.emitPlayerUpdate(playerId);
    
    Logger.system('PlayerSystem', `Player respawned: ${playerId}`, { spawnPosition });
  }

  private updateCombatLevel(data: PlayerLevelUpEvent): void {
    const player = this.players.get(data.playerId)!;

    // Recalculate combat level based on current stats
    player.combat.combatLevel = this.calculateCombatLevel(player.skills);
    this.emitPlayerUpdate(data.playerId);
  }

  private emitPlayerUpdate(playerId: string): void {
    const player = this.players.get(playerId)!;

    this.emitTypedEvent(EventType.PLAYER_UPDATED, {
      playerId,
      component: 'player',
      data: {
        id: player.id,
        name: player.name,
        level: player.combat.combatLevel,
        health: player.health.current,
        maxHealth: player.health.max,
        alive: player.alive,
                position: {
          x: player.position.x,
        y: player.position.y,
        z: player.position.z
        }
      }
    });
  }

  // Public API methods
  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  getAllPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  isPlayerAlive(playerId: string): boolean {
    const player = this.players.get(playerId);
    return !!player?.alive;
  }

  getPlayerHealth(playerId: string): { health: number; maxHealth: number } | undefined {
    const player = this.players.get(playerId);
    return player ? { health: player.health.current, maxHealth: player.health.max } : undefined;
  }

  healPlayer(playerId: string, amount: number): boolean {
    const player = this.players.get(playerId);
    if (!player || !player.alive) return false;

    const oldHealth = player.health.current;
    player.health.current = Math.min(player.health.max, player.health.current + amount);

    if (player.health.current !== oldHealth) {
      this.emitTypedEvent(EventType.PLAYER_HEALTH_UPDATED, {
        playerId,
        health: player.health.current,
        maxHealth: player.health.max
      });
      this.emitPlayerUpdate(playerId);
      return true;
    }
    
    return false;
  }
  
  private handleItemUsed(data: { playerId: string; itemId: string; slot: number; itemData: { id: string; name: string; type: string } }): void {
    // Check if this is a consumable item
    if (data.itemData.type !== 'consumable' && data.itemData.type !== 'food') {
      return;
    }
    
    // Get the full item data to check for healing properties
    const itemData = getItem(data.itemId);
    if (!itemData || !itemData.healAmount || itemData.healAmount <= 0) {
      return;
    }
    
    // Apply healing
    const healed = this.healPlayer(data.playerId, itemData.healAmount);
    
    if (healed) {
      // Emit healing event with source for tests
      this.emitTypedEvent(EventType.PLAYER_HEALTH_UPDATED, {
        playerId: data.playerId,
        amount: itemData.healAmount,
        source: 'food'
      });
      
      // Show message to player
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: `You eat the ${itemData.name} and heal ${itemData.healAmount} HP.`,
        type: 'success' as const
      });
    }
  }

  async updatePlayerPosition(playerId: string, position: Position3D): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) {
      // In test scenarios, players might not be registered through normal flow
      // Only warn if this seems like a real player ID (not a test ID)
      if (!playerId.startsWith('test-')) {
        Logger.system('PlayerSystem', `Cannot update position for unknown player: ${playerId}`);
      }
      return;
    }

    player.position = { ...position };
    
    // Emit position update event for reactive systems
    this.emitTypedEvent(EventType.PLAYER_POSITION_UPDATED, {
      playerId,
      position
    });
    
    // Position updates are frequent, don't save immediately
  }

  async updatePlayerStats(playerId: string, stats: Partial<Player['skills']>): Promise<void> {
    const player = this.players.get(playerId)!;

    // Update stats
    Object.assign(player.skills, stats);
    
    // Recalculate combat level
    player.combat.combatLevel = this.calculateCombatLevel(player.skills);

    // Save to database
    if (this.databaseSystem) {
      this.databaseSystem.savePlayer(playerId, {
        attackLevel: player.skills.attack.level,
        strengthLevel: player.skills.strength.level,
        defenseLevel: player.skills.defense.level,
        constitutionLevel: player.skills.constitution.level,
        rangedLevel: player.skills.ranged.level,
        combatLevel: player.combat.combatLevel
      });
    }
    
    this.emitPlayerUpdate(playerId);
  }

  async updatePlayerEquipment(playerId: string, equipment: Partial<Player['equipment']>): Promise<void> {
    const player = this.players.get(playerId)!;

    // Update equipment
    Object.assign(player.equipment, equipment);
    
    this.emitTypedEvent(EventType.PLAYER_EQUIPMENT_UPDATED, {
      playerId,
      equipment: {
        helmet: player.equipment.helmet ? player.equipment.helmet.id : null,
        body: player.equipment.body ? player.equipment.body.id : null,
        legs: player.equipment.legs ? player.equipment.legs.id : null,
        weapon: player.equipment.weapon ? player.equipment.weapon.id : null,
        shield: player.equipment.shield ? player.equipment.shield.id : null,
      }
    });
    
    this.emitPlayerUpdate(playerId);
  }

  getPlayerStats(playerId: string): Skills | undefined {
    const player = this.players.get(playerId);
    return player?.skills;
  }

  getPlayerEquipment(playerId: string): Player['equipment'] | undefined {
    const player = this.players.get(playerId);
    return player?.equipment;
  }

  hasWeaponEquipped(playerId: string): boolean {
    const equipment = this.getPlayerEquipment(playerId);
    return !!equipment?.weapon;
  }

  canPlayerUseRanged(playerId: string): boolean {
    const equipment = this.getPlayerEquipment(playerId);
    return !!equipment?.weapon && equipment.weapon.attackType === AttackType.RANGED && !!equipment.arrows;
  }

  damagePlayer(playerId: string, amount: number, _source?: string): boolean {
    const player = this.players.get(playerId);
    if (!player || !player.alive) return false;

    player.health.current = Math.max(0, player.health.current - amount);

    this.emitTypedEvent(EventType.PLAYER_HEALTH_UPDATED, {
      playerId,
      health: player.health.current,
      maxHealth: player.health.max
    });

    if (player.health.current <= 0) {
      this.handleDeath({ 
        playerId, 
        deathLocation: player.position, 
        cause: _source || 'damage' 
      });
    }
    
    this.emitPlayerUpdate(playerId);
    return true;
  }

  destroy(): void {
    // Clear all timers
    this.respawnTimers.forEach(timer => clearTimeout(timer));
    this.respawnTimers.clear();

    // Clear auto-save
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }

    // Clear references
    this.players.clear();
    this.playerLocalRefs.clear();
  }

  private startAutoSave(): void {
    this.saveInterval = this.createInterval(() => {
      this.performAutoSave();
    }, this.AUTO_SAVE_INTERVAL)!;
  }

  private async performAutoSave(): Promise<void> {
    if (!this.databaseSystem) return;

    // Save all players
    for (const playerId of this.players.keys()) {
      try {
        await this.savePlayerToDatabase(playerId);
      } catch (error) {
        Logger.systemError('PlayerSystem', `Error saving player data during auto-save for ${playerId}`, 
          error instanceof Error ? error : new Error('Unknown error')
        );
      }
    }
  }

  private async savePlayerToDatabase(playerId: string): Promise<void> {
    const player = this.players.get(playerId);
    if (!player || !this.databaseSystem) return;

    this.databaseSystem.savePlayer(playerId, {
      name: player.name,
      combatLevel: player.combat.combatLevel,
      attackLevel: player.skills.attack.level,
      strengthLevel: player.skills.strength.level,
      defenseLevel: player.skills.defense.level,
      constitutionLevel: player.skills.constitution.level,
      rangedLevel: player.skills.ranged.level,
      health: player.health.current,
      maxHealth: player.health.max,
              positionX: player.position.x,
        positionY: player.position.y,
        positionZ: player.position.z
    });
  }

  private calculateCombatLevel(skills: Skills): number {
    // Formula from GDD: (Attack + Strength + Defense + Constitution + Ranged) / 4
    const totalLevel =
      skills.attack.level +
      skills.strength.level +
      skills.defense.level +
      skills.constitution.level +
      skills.ranged.level;
    return Math.floor(totalLevel / 4);
  }

  // System lifecycle methods
  preTick(): void {}
  preFixedUpdate(): void {}
  fixedUpdate(_dt: number): void {}
  postFixedUpdate(): void {}
  preUpdate(): void {}
  update(_dt: number): void {
    // Update system logic
  }
  postUpdate(): void {}
  lateUpdate(): void {}
  postLateUpdate(): void {}
  commit(): void {}
  postTick(): void {}
}