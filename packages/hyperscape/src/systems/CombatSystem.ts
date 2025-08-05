/**
 * CombatSystem - Handles all combat mechanics
 */

import { EventType } from '../types/events';
import type { World } from '../World';
import { COMBAT_CONSTANTS } from '../constants/CombatConstants';
import { AttackType, MobInstance } from '../types/core';
import { EntityID } from '../types/identifiers';
import { MobEntity } from '../entities/MobEntity';
import { Entity } from '../entities/Entity';
import { PlayerSystem } from './PlayerSystem';
import { calculateDamage, calculateDistance3D, CombatStats, isAttackOnCooldown } from '../utils/CombatCalculations';
import { createEntityID } from '../utils/IdentifierUtils';
import { EntityManager } from './EntityManager';
import { MobSystem } from './MobSystem';
import { SystemBase } from './SystemBase';

export interface CombatData {
  attackerId: EntityID;
  targetId: EntityID;
  attackerType: 'player' | 'mob';
  targetType: 'player' | 'mob';
  weaponType: AttackType;
  inCombat: boolean;
  lastAttackTime: number;
  combatEndTime?: number; // When combat should timeout
}

export class CombatSystem extends SystemBase {
  private combatStates = new Map<EntityID, CombatData>();
  private attackCooldowns = new Map<EntityID, number>();
  private mobSystem?: MobSystem;
  private entityManager?: EntityManager;

  // Combat constants


  constructor(world: World) {
    super(world, {
      name: 'rpg-combat',
      dependencies: {
        required: ['rpg-entity-manager'], // Combat needs entity manager
        optional: ['rpg-mob'] // Combat can work without mobs but better with them
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    // Get entity manager - required dependency
    this.entityManager = this.world.getSystem<EntityManager>('rpg-entity-manager');
    if (!this.entityManager) {
      throw new Error('[CombatSystem] EntityManager not found - required dependency');
    }
    
    // Get mob system - optional but recommended
    this.mobSystem = this.world.getSystem<MobSystem>('rpg-mob');

    // Set up event listeners - required for combat to function
    this.subscribe(EventType.COMBAT_ATTACK_REQUEST, (event) => {
      const data = event as { playerId: string; targetId: string; attackType?: AttackType };
      this.handleAttack({
        attackerId: data.playerId,
        targetId: data.targetId,
        attackerType: 'player',
        targetType: 'mob',
        attackType: data.attackType || AttackType.MELEE
      });
    });
    this.subscribe<{ attackerId: string; targetId: string; attackerType: 'player' | 'mob'; targetType: 'player' | 'mob' }>(EventType.COMBAT_MELEE_ATTACK, (event) => {
      this.handleMeleeAttack(event.data);
    });
    this.subscribe<{ attackerId: string; targetId: string; attackerType: 'player' | 'mob'; targetType: 'player' | 'mob' }>(EventType.COMBAT_RANGED_ATTACK, (event) => {
      this.handleRangedAttack(event.data);
    });
    this.subscribe(EventType.COMBAT_MOB_ATTACK, (event) => {
      const data = event as { mobId: string; targetId: string };
      this.handleMobAttack(data);
    });

  }

  private handleAttack(data: { 
    attackerId: string; 
    targetId: string;
    attackerType: 'player' | 'mob';
    targetType: 'player' | 'mob';
    attackType: AttackType;
  }): void {
    // Validate attack request
    if (data.attackType === AttackType.MELEE) {
      this.handleMeleeAttack(data);
    } else if (data.attackType === AttackType.RANGED) {
      this.handleRangedAttack(data);
    }
  }

  private handleMeleeAttack(data: { 
    attackerId: string; 
    targetId: string;
    attackerType: 'player' | 'mob';
    targetType: 'player' | 'mob';
  }): void {
    const { attackerId, targetId, attackerType, targetType } = data;
    
    // Convert IDs to typed IDs
    const typedAttackerId = createEntityID(attackerId);
    const typedTargetId = createEntityID(targetId);

    // Get attacker and target positions for range check
    const attacker = this.getEntity(attackerId, attackerType);
    const target = this.getEntity(targetId, targetType);

    // Check if in melee range
    const attackerPos = attacker.position || attacker.getPosition();
    const targetPos = target.position || target.getPosition();
    const distance = calculateDistance3D(attackerPos, targetPos);
    if (distance > COMBAT_CONSTANTS.MELEE_RANGE) {
      this.emitTypedEvent(EventType.COMBAT_ATTACK_FAILED, {
        attackerId,
        targetId,
        reason: 'out_of_range'
      });
      return;
    }

    // Check attack cooldown
    const now = Date.now();
    const lastAttack = this.attackCooldowns.get(typedAttackerId) || 0;
    if (isAttackOnCooldown(lastAttack, now)) {
      return; // Still on cooldown
    }

    // Calculate damage
    const damage = this.calculateMeleeDamage(attacker, target);

    // Apply damage
    this.applyDamage(targetId, targetType, damage, attackerId);

    // Set attack cooldown
    this.attackCooldowns.set(typedAttackerId, now);

    // Enter combat state
    this.enterCombat(typedAttackerId, typedTargetId);
  }

  private handleRangedAttack(data: { 
    attackerId: string; 
    targetId: string;
    attackerType?: 'player' | 'mob';
    targetType?: 'player' | 'mob';
  }): void {
    const { attackerId, targetId, attackerType = 'player', targetType = 'mob' } = data;
    
    // Convert IDs to typed IDs
    const typedAttackerId = createEntityID(attackerId);
    const typedTargetId = createEntityID(targetId);

    // Get attacker and target
    const attacker = this.getEntity(attackerId, attackerType);
    const target = this.getEntity(targetId, targetType);



    // Check if in ranged range
    const attackerPos = attacker.position || attacker.getPosition();
    const targetPos = target.position || target.getPosition();
    const distance = calculateDistance3D(attackerPos, targetPos);
    if (distance > COMBAT_CONSTANTS.RANGED_RANGE) {
      this.emitTypedEvent(EventType.COMBAT_ATTACK_FAILED, {
        attackerId,
        targetId,
        reason: 'out_of_range'
      });
      return;
    }

    // Check for arrows (if player)
    if (attackerType === 'player') {
      // This would check equipment system for arrows
      // For now, assume arrows are available
    }

    // Check attack cooldown
    const now = Date.now();
    const lastAttack = this.attackCooldowns.get(typedAttackerId) || 0;
    if (isAttackOnCooldown(lastAttack, now)) {
      return; // Still on cooldown
    }

    // Calculate damage
    const damage = this.calculateRangedDamage(attacker, target);

    // Apply damage
    this.applyDamage(targetId, targetType, damage, attackerId);

    // Set attack cooldown
    this.attackCooldowns.set(typedAttackerId, now);

    // Enter combat state
    this.enterCombat(typedAttackerId, typedTargetId);
  }

  private handleMobAttack(data: { mobId: string; targetId: string }): void {
    // Handle mob attacking player
    this.handleMeleeAttack({
      attackerId: data.mobId,
      targetId: data.targetId,
      attackerType: 'mob',
      targetType: 'player'
    });
  }

  private calculateMeleeDamage(attacker: Entity | MobEntity, target: Entity | MobEntity): number {
    // Extract required properties for damage calculation
    let attackerData: { stats?: CombatStats; config?: { attackPower?: number } } = {};
    let targetData: { stats?: CombatStats; config?: { defense?: number } } = {};
    
    // Handle MobEntity
    if (attacker instanceof MobEntity) {
      const mobData = attacker.getMobData();
      attackerData = {
        config: { attackPower: mobData.attackPower }
      };
    } else {
      // Handle player or other Entity - get stats from components
      const statsComponent = attacker.getComponent('stats');
      if (statsComponent?.data) {
        attackerData = { stats: statsComponent.data };
      }
    }
    
    if (target instanceof MobEntity) {
      const mobData = target.getMobData();
      targetData = {
        config: { defense: mobData.defense }
      };
    } else {
      // Handle player or other Entity
      const statsComponent = target.getComponent('stats');
      if (statsComponent?.data) {
        targetData = { stats: statsComponent.data };
      }
    }
    
    const result = calculateDamage(attackerData, targetData, AttackType.MELEE);
    return result.damage;
  }

  private calculateRangedDamage(attacker: Entity | MobEntity, target: Entity | MobEntity): number {
    // Extract required properties for damage calculation
    let attackerData: { stats?: CombatStats; config?: { attackPower?: number } } = {};
    let targetData: { stats?: CombatStats; config?: { defense?: number } } = {};
    
    // Handle MobEntity
    if (attacker instanceof MobEntity) {
      const mobData = attacker.getMobData();
      attackerData = {
        config: { attackPower: mobData.attackPower }
      };
    } else {
      // Handle player or other Entity - get stats from components
      const statsComponent = attacker.getComponent('stats');
      if (statsComponent?.data) {
        attackerData = { stats: statsComponent.data };
      }
    }
    
    if (target instanceof MobEntity) {
      const mobData = target.getMobData();
      targetData = {
        config: { defense: mobData.defense }
      };
    } else {
      // Handle player or other Entity
      const statsComponent = target.getComponent('stats');
      if (statsComponent?.data) {
        targetData = { stats: statsComponent.data };
      }
    }
    
    const result = calculateDamage(attackerData, targetData, AttackType.RANGED);
    return result.damage;
  }

  private applyDamage(targetId: string, targetType: string, damage: number, attackerId: string): void {
    // Handle damage based on target type
    if (targetType === 'player') {
      // Get player system and use its damage method
      const playerSystem = this.world.getSystem<PlayerSystem>('rpg-player');
      if (!playerSystem) {

        return;
      }
      
      const damaged = playerSystem.damagePlayer(targetId, damage, attackerId);
      if (!damaged) {
        return;
      }
    } else if (targetType === 'mob') {
      // For mobs, use the mob system to handle damage
      if (!this.mobSystem) {
        return;
      }
      
      // Get mob instance from mob system
      const mobInstance = this.mobSystem.getMob(targetId) as MobInstance;
      if (!mobInstance) {
        return;
      }
      
      // Apply damage through mob system or directly to mob instance
      const newHealth = Math.max(0, mobInstance.health - damage);
      mobInstance.health = newHealth;
      
      // Check if mob died
      if (newHealth <= 0 && mobInstance.isAlive) {
        mobInstance.isAlive = false;
        // Emit mob died event
        this.emitTypedEvent(EventType.MOB_DIED, {
          mobId: targetId,
          mobType: mobInstance.type,
          position: mobInstance.homePosition,
          level: mobInstance.stats.level,
          killedBy: attackerId
        });
      }
      
      // Emit mob damaged event
      this.emitTypedEvent(EventType.MOB_DAMAGED, {
        mobId: targetId,
        damage,
        remainingHealth: newHealth,
        attackerId
      });
    } else {
      return;
    }

    // Emit combat damage event
    this.emitTypedEvent(EventType.COMBAT_DAMAGE_DEALT, {
      attackerId,
      targetId,
      damage,
      targetType
    });
  }

  private enterCombat(attackerId: EntityID, targetId: EntityID): void {
    const now = Date.now();
    const combatEndTime = now + COMBAT_CONSTANTS.COMBAT_TIMEOUT_MS;

    // Set combat state for attacker
    this.combatStates.set(attackerId, {
      attackerId,
      targetId,
      attackerType: 'player',
      targetType: 'mob',
      weaponType: AttackType.MELEE,
      inCombat: true,
      lastAttackTime: now,
      combatEndTime
    });

    // Set combat state for target
    this.combatStates.set(targetId, {
      attackerId: targetId,
      targetId: attackerId,
      attackerType: 'mob',
      targetType: 'player',
      weaponType: AttackType.MELEE,
      inCombat: true,
      lastAttackTime: 0,
      combatEndTime
    });

    // Emit combat started event
    this.emitTypedEvent(EventType.COMBAT_STARTED, {
      attackerId: String(attackerId),
      targetId: String(targetId)
    });
  }

  private endCombat(data: { entityId: string }): void {
    // Validate entity ID before processing
    if (!data.entityId) {
      return;
    }
    
    const typedEntityId = createEntityID(data.entityId);
    const combatState = this.combatStates.get(typedEntityId);
    if (!combatState) return;

    // Remove combat states
    this.combatStates.delete(typedEntityId);
    this.combatStates.delete(combatState.targetId);

    // Emit combat ended event
    this.emitTypedEvent(EventType.COMBAT_ENDED, {
      attackerId: data.entityId,
      targetId: String(combatState.targetId)
    });
  }

  // Public API methods
  public startCombat(attackerId: string, targetId: string, options?: {
    attackerType?: 'player' | 'mob';
    targetType?: 'player' | 'mob';
    weaponType?: AttackType;
  }): boolean {
    const opts = {
      attackerType: 'player',
      targetType: 'mob',
      weaponType: AttackType.MELEE,
      ...options
    };

    // Check if entities exist
    const attacker = this.getEntity(attackerId, opts.attackerType);
    const target = this.getEntity(targetId, opts.targetType);

    if (!attacker || !target) {
      return false;
    }

    // Check range
    const attackerPos = attacker.position || attacker.getPosition();
    const targetPos = target.position || target.getPosition();
    const distance = calculateDistance3D(attackerPos, targetPos);

    const maxRange = opts.weaponType === AttackType.RANGED ? COMBAT_CONSTANTS.RANGED_RANGE : COMBAT_CONSTANTS.MELEE_RANGE;
    if (distance > maxRange) {
      return false;
    }

    // Start combat
    this.enterCombat(createEntityID(attackerId), createEntityID(targetId));
    return true;
  }

  public isInCombat(entityId: string): boolean {
    return this.combatStates.has(createEntityID(entityId));
  }

  public getCombatData(entityId: string): CombatData | null {
    return this.combatStates.get(createEntityID(entityId)) || null;
  }

  public forceEndCombat(entityId: string): void {
    this.endCombat({ entityId });
  }

  private getEntity(entityId: string, entityType: string): Entity | MobEntity {
    if (entityType === 'mob') {
      const entity = this.world.entities.get(entityId);
      if (!entity) {
        throw new Error(`[CombatSystem] Mob entity not found: ${entityId}`);
      }
      return entity as MobEntity;
    }

    if (entityType === 'player') {
      // Look up players from world.entities.players (includes fake test players)
      const player = this.world.entities.players.get(entityId);
      if (!player) {
        const availablePlayerIds = Array.from(this.world.entities.players.keys());
        throw new Error(`[CombatSystem] Player entity not found: ${entityId}. Available players: [${availablePlayerIds.join(', ')}]`);
      }
      return player;
    }

    if (!this.entityManager) {
      throw new Error('[CombatSystem] Entity manager not available');
    }
    const entity = this.entityManager.getEntity(entityId);
    if (!entity) {
      throw new Error(`[CombatSystem] Entity not found: ${entityId}`);
    }
    return entity;
  }



  // Combat timeout checking - preserve active update logic
  update(_dt: number): void {
    const now = Date.now();
    
    // Check for combat timeouts
    for (const [entityId, combatState] of this.combatStates) {
      if (combatState.inCombat && combatState.combatEndTime && now >= combatState.combatEndTime) {
        // Convert EntityID to string for the event
        const entityIdStr = String(entityId);
        this.endCombat({ entityId: entityIdStr });
      }
    }
  }

  destroy(): void {
    // Clear all combat states
    this.combatStates.clear();
    
    // Clear all attack cooldowns
    this.attackCooldowns.clear();
    // Call parent cleanup (handles autoCleanup)
    super.destroy();
  }
}
