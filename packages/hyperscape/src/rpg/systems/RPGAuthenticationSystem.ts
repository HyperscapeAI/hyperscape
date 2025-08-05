import { RPGSystemBase } from './RPGSystemBase';
import { getSystem } from '../../core/utils/SystemUtils';
import { EventType } from '../../types/events';
import type { World } from '../../types';
import { AuthenticationResult, RPGPlayerIdentity } from '../types/core';
// RPGDatabaseSystem is imported dynamically on server only

/**
 * RPG Authentication System
 * Integrates with Hyperscape's existing JWT authentication and provides
 * enhanced player identity management for the MMORPG prototype
 */

export class RPGAuthenticationSystem extends RPGSystemBase {
  private databaseSystem?: import('./RPGDatabaseSystem').RPGDatabaseSystem;
  private authenticatedPlayers = new Map<string, RPGPlayerIdentity>();
  private readonly GUEST_PREFIX = 'guest_';
  private readonly RPG_PLAYER_PREFIX = 'rpg_';

  constructor(world: World) {
    super(world, {
      name: 'rpg-authentication',
      dependencies: {
        required: [],
        optional: ['rpg-database']
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Get database system reference
    this.databaseSystem = getSystem(this.world, 'rpg-database') as import('./RPGDatabaseSystem').RPGDatabaseSystem;
    
    // Set up type-safe event subscriptions for authentication (3 listeners!)
    this.subscribe<{ playerId: string; hyperscapeUserId: string; hyperscapeJwtToken: string; clientToken: string; machineId: string }>(EventType.PLAYER_AUTHENTICATED, (event) => this.handlePlayerAuthentication(event.data));
    this.subscribe<{ playerId: string }>(EventType.PLAYER_LOGOUT, (event) => this.handlePlayerLogout(event.data));
    this.subscribe<{ playerId: string; clientToken: string }>(EventType.PLAYER_RECONNECTED, (event) => this.handlePlayerReconnection(event.data));
    
  }

  /**
   * Authenticate a player using multiple identity sources
   */
  async authenticatePlayer(
    hyperscapeUserId: string,
    hyperscapeJwtToken: string,
    clientToken: string,
    machineId: string
  ): Promise<AuthenticationResult> {
    return await this.authenticateWithHyperscapeJWT(hyperscapeUserId, hyperscapeJwtToken, clientToken, machineId);
  }

  /**
   * Authenticate using Hyperscape's JWT system
   */
  private async authenticateWithHyperscapeJWT(
    hyperscapeUserId: string,
    hyperscapeJwtToken: string,
    clientToken: string,
    machineId: string
  ): Promise<AuthenticationResult> {
    // Check for existing RPG player by Hyperscape ID
    const existingRpgPlayer = await this.findPlayerByHyperscapeId(hyperscapeUserId);
    
    const isNewPlayer = !existingRpgPlayer;
    const rpgPlayerId = this.generateRPGPlayerId();
    
    // Create player identity
    const identity: RPGPlayerIdentity = {
      hyperscapeUserId,
      hyperscapeUserName: 'Hyperscape User',
      hyperscapeUserRoles: ['user'],
      rpgPlayerId,
      rpgPlayerName: 'Adventurer',
      clientMachineId: machineId,
      hyperscapeJwtToken,
      clientPersistentToken: clientToken,
      sessionId: this.generateSessionId(),
      loginTime: new Date(),
      lastActivity: new Date(),
      isGuest: false
    };
    
    // Store authenticated player
    this.authenticatedPlayers.set(identity.rpgPlayerId, identity);
    
    // Create RPG player record if new
    if (isNewPlayer) {
      await this.createRPGPlayerRecord(identity);
    }
    
    // Update last login
    await this.updatePlayerLoginInfo(identity);
    
    return {
      success: true,
      identity,
      isNewPlayer,
      isReturningPlayer: !isNewPlayer
    };
  }

  /**
   * Authenticate using client persistent token (returning player)
   */
  private async authenticateWithClientToken(
    clientToken: string,
    machineId?: string
  ): Promise<AuthenticationResult> {
    
    try {
      // Look for existing player with this client token
      const existingPlayer = null;
      // TODO: Implement getPlayerDataByClientToken method in RPGDatabaseSystem
      
      if (!existingPlayer) {
        // Client token not found, treat as new guest
        return await this.createGuestAccount(machineId, clientToken);
      }
      
      // Create identity for returning player
      const identity: RPGPlayerIdentity = {
        hyperscapeUserId: '', // No Hyperscape account linked
        hyperscapeUserName: '',
        hyperscapeUserRoles: [],
        rpgPlayerId: 'placeholder', // Would be existingPlayer.id
        rpgPlayerName: 'Guest Player', // Would be existingPlayer.name
        clientMachineId: machineId || this.generateMachineId(),
        clientPersistentToken: clientToken,
        sessionId: this.generateSessionId(),
        loginTime: new Date(),
        lastActivity: new Date(),
        isGuest: true // Still a guest until they link Hyperscape account
      };
      
      // Store authenticated player
      this.authenticatedPlayers.set(identity.rpgPlayerId, identity);
      
      // Update last login
      if (this.databaseSystem) {
        await this.updatePlayerLoginInfo(identity);
      }
      
      return {
        success: true,
        identity,
        isNewPlayer: false,
        isReturningPlayer: true
      };
      
    } catch (error) {
      console.error('[RPGAuth] ❌ Client token authentication failed:', error);
      throw error;
    }
  }

  /**
   * Create new guest account
   */
  private async createGuestAccount(
    machineId?: string,
    existingClientToken?: string
  ): Promise<AuthenticationResult> {
    
    try {
      const rpgPlayerId = this.generateRPGPlayerId();
      const clientToken = existingClientToken || this.generateClientToken();
      const finalMachineId = machineId || this.generateMachineId();
      
      // Create guest identity
      const identity: RPGPlayerIdentity = {
        hyperscapeUserId: '',
        hyperscapeUserName: '',
        hyperscapeUserRoles: [],
        rpgPlayerId,
        rpgPlayerName: this.generateGuestName(),
        clientMachineId: finalMachineId,
        clientPersistentToken: clientToken,
        sessionId: this.generateSessionId(),
        loginTime: new Date(),
        lastActivity: new Date(),
        isGuest: true
      };
      
      // Store authenticated player
      this.authenticatedPlayers.set(identity.rpgPlayerId, identity);
      
      // Create RPG player record
      if (this.databaseSystem) {
        await this.createRPGPlayerRecord(identity);
      }
      
      return {
        success: true,
        identity,
        isNewPlayer: true,
        isReturningPlayer: false
      };
      
    } catch (error) {
      console.error('[RPGAuth] ❌ Guest account creation failed:', error);
      throw error;
    }
  }

  /**
   * Link guest account to Hyperscape account
   */
  async linkGuestToHyperscapeAccount(
    guestRpgPlayerId: string,
    hyperscapeUserId: string,
    hyperscapeJwtToken: string
  ): Promise<boolean> {
    
    try {
      const guestIdentity = this.authenticatedPlayers.get(guestRpgPlayerId);
      if (!guestIdentity || !guestIdentity.isGuest) {
        throw new Error('Guest account not found or already linked');
      }
      
      // Update identity
      guestIdentity.hyperscapeUserId = hyperscapeUserId;
      guestIdentity.hyperscapeJwtToken = hyperscapeJwtToken;
      guestIdentity.isGuest = false;
      guestIdentity.lastActivity = new Date();
      
      // Update database record
      if (this.databaseSystem) {
        await this.updatePlayerHyperscapeLink(guestIdentity);
      }
      
      return true;
      
    } catch (error) {
      console.error('[RPGAuth] ❌ Failed to link guest to Hyperscape:', error);
      return false;
    }
  }

  /**
   * Get authenticated player identity
   */
  getPlayerIdentity(rpgPlayerId: string): RPGPlayerIdentity | null {
    return this.authenticatedPlayers.get(rpgPlayerId) || null;
  }

  /**
   * Update player activity
   */
  updatePlayerActivity(rpgPlayerId: string): void {
    const identity = this.authenticatedPlayers.get(rpgPlayerId);
    if (identity) {
      identity.lastActivity = new Date();
    }
  }

  /**
   * Get all authenticated players
   */
  getAuthenticatedPlayers(): RPGPlayerIdentity[] {
    return Array.from(this.authenticatedPlayers.values());
  }

  /**
   * Handle player authentication event
   */
  private async handlePlayerAuthentication(data: {
    playerId: string;
    hyperscapeUserId: string;
    hyperscapeJwtToken: string;
    clientToken: string;
    machineId: string;
  }): Promise<void> {
    const result = await this.authenticatePlayer(
      data.hyperscapeUserId,
      data.hyperscapeJwtToken,
      data.clientToken,
      data.machineId
    );
    
    // Emit authentication result
    this.emitTypedEvent(EventType.PLAYER_AUTHENTICATED, {
      playerId: data.playerId,
      result
    });
  }

  /**
   * Handle player logout
   */
  private async handlePlayerLogout(data: { playerId: string }): Promise<void> {
    const identity = this.authenticatedPlayers.get(data.playerId);
    if (identity) {
      // Update logout time in database
      if (this.databaseSystem) {
        await this.updatePlayerLogoutInfo(identity);
      }
      
      // Remove from active players
      this.authenticatedPlayers.delete(data.playerId);
    }
  }

  /**
   * Handle player reconnection
   */
  private async handlePlayerReconnection(data: {
    playerId: string;
    clientToken: string;
  }): Promise<void> {
    
    const result = await this.authenticateWithClientToken(data.clientToken);
    
    this.emitTypedEvent(EventType.PLAYER_RECONNECTED, {
      playerId: data.playerId,
      result
    });
  }

  // Helper methods for database operations
  private async createRPGPlayerRecord(identity: RPGPlayerIdentity): Promise<void> {
    if (!this.databaseSystem) return;
    
    const playerData = {
      name: identity.rpgPlayerName,
      skills: {
        attack: { level: 1, xp: 0 },
        strength: { level: 1, xp: 0 },
        defense: { level: 1, xp: 0 },
        ranged: { level: 1, xp: 0 },
        woodcutting: { level: 1, xp: 0 },
        fishing: { level: 1, xp: 0 },
        firemaking: { level: 1, xp: 0 },
        cooking: { level: 1, xp: 0 },
        constitution: { level: 10, xp: 1154 }
      },
      health: 100,
      position: { x: 0, y: 2, z: 0 },
      alive: true,
      hyperscapeUserId: identity.hyperscapeUserId || null,
      clientToken: identity.clientPersistentToken,
      machineId: identity.clientMachineId
    };
    
    this.databaseSystem.savePlayerData(identity.rpgPlayerId, playerData);
  }

  private async updatePlayerLoginInfo(_identity: RPGPlayerIdentity): Promise<void> {
    // Implementation would update login timestamps in database
  }

  private async updatePlayerLogoutInfo(_identity: RPGPlayerIdentity): Promise<void> {
    // Implementation would update logout timestamp in database
  }

  private async updatePlayerHyperscapeLink(_identity: RPGPlayerIdentity): Promise<void> {
    // Implementation would update Hyperscape link in database
  }

  // ID generation helpers
  private generateRPGPlayerId(): string {
    return `${this.RPG_PLAYER_PREFIX}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateClientToken(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  private generateMachineId(): string {
    // In a real implementation, this would use browser fingerprinting
    return `machine_${Math.random().toString(36).substr(2, 12)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  private generateGuestName(): string {
    const adjectives = ['Swift', 'Brave', 'Clever', 'Bold', 'Wise', 'Strong', 'Quick', 'Silent'];
    const nouns = ['Adventurer', 'Explorer', 'Warrior', 'Mage', 'Ranger', 'Knight', 'Hero', 'Wanderer'];
    
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 1000);
    
    return `${adjective}${noun}${number}`;
  }

  /**
   * Find existing RPG player by Hyperscape ID
   */
  private async findPlayerByHyperscapeId(hyperscapeId: string): Promise<{ id: string; name: string } | null> {
    if (!this.databaseSystem) {
      return null;
    }

    try {
      // TODO: Implement hyperscapeUserId field in database schema
      // For now, the database doesn't store Hyperscape user IDs
      // This method returns null until database schema is updated
      console.warn('[RPGAuth] ⚠️ getPlayerByHyperscapeId not implemented - database schema needs hyperscapeUserId field');
      return null;
    } catch (error) {
      this.logger.error('Failed to find player by Hyperscape ID', error instanceof Error ? error : new Error(String(error)), { hyperscapeId });
    }

    return null;
  }

  /**
   * Update player activity tracking and session management
   */
  update(_dt: number): void {
    // Update player activity tracking
    const now = Date.now();
    for (const [playerId, identity] of this.authenticatedPlayers) {
      const inactiveTime = now - identity.lastActivity.getTime();
      
      // Log out inactive players after 30 minutes
      if (inactiveTime > 30 * 60 * 1000) {
        this.handlePlayerLogout({ playerId });
      }
    }
  }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all authenticated players
    this.authenticatedPlayers.clear();
    
    // Clear database system reference
    this.databaseSystem = undefined;
    
    this.logger.info('Authentication system destroyed and cleaned up');
    
    // Call parent cleanup
    super.destroy();
  }
}