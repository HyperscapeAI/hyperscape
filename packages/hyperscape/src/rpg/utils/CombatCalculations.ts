/**
 * Centralized combat calculation utilities
 * Reduces duplication across combat-related systems
 */

import { COMBAT_CONSTANTS } from '../constants/CombatConstants';
import { AttackType } from '../types/core';

export interface CombatStats {
  attack?: number;
  strength?: number;
  defense?: number;
  ranged?: number;
  attackPower?: number;
}

export interface DamageResult {
  damage: number;
  isCritical: boolean;
  damageType: AttackType;
}

/**
 * Calculate damage for any attack type
 * Consolidates melee and ranged damage calculations
 */
export function calculateDamage(
  attacker: { stats?: CombatStats; config?: { attackPower?: number } },
  target: { stats?: CombatStats; config?: { defense?: number } },
  attackType: AttackType
): DamageResult {
  // Get base damage based on attack type
  let baseDamage = 1;
  
  if (attackType === AttackType.MELEE) {
    if (attacker.stats?.attack) {
      baseDamage = Math.floor(attacker.stats.attack * COMBAT_CONSTANTS.DAMAGE_MULTIPLIERS.MELEE_ATTACK) + 1;
    } else if (attacker.config?.attackPower) {
      baseDamage = attacker.config.attackPower;
    }
  } else if (attackType === AttackType.RANGED) {
    if (attacker.stats?.ranged) {
      baseDamage = Math.floor(attacker.stats.ranged * COMBAT_CONSTANTS.DAMAGE_MULTIPLIERS.RANGED_ATTACK) + 1;
    } else if (attacker.config?.attackPower) {
      baseDamage = attacker.config.attackPower;
    }
  }
  
  // Apply defense reduction
  const defense = getDefenseValue(target);
  const damageReduction = Math.floor(defense * COMBAT_CONSTANTS.DAMAGE_MULTIPLIERS.DEFENSE_REDUCTION);
  
  // Calculate final damage with randomization
  const finalDamage = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, baseDamage - damageReduction);
  const damage = Math.floor(Math.random() * finalDamage) + 1;
  
  // Simple critical hit chance (10%)
  const isCritical = Math.random() < 0.1;
  
  return {
    damage: isCritical ? damage * 2 : damage,
    isCritical,
    damageType: attackType
  };
}

/**
 * Get defense value from entity
 */
function getDefenseValue(entity: { stats?: CombatStats; config?: { defense?: number } }): number {
  if (entity.stats?.defense) {
    return entity.stats.defense;
  } else if (entity.config?.defense) {
    return entity.config.defense;
  }
  return 0;
}

/**
 * Check if entity is within attack range
 */
export function isInAttackRange(
  attackerPos: { x: number; y: number; z: number },
  targetPos: { x: number; y: number; z: number },
  attackType: AttackType
): boolean {
  const distance = calculateDistance3D(attackerPos, targetPos);
  const maxRange = attackType === AttackType.MELEE 
    ? COMBAT_CONSTANTS.MELEE_RANGE 
    : COMBAT_CONSTANTS.RANGED_RANGE;
  
  return distance <= maxRange;
}

/**
 * Calculate 3D distance between two positions
 */
export function calculateDistance3D(
  pos1: { x: number; y: number; z: number },
  pos2: { x: number; y: number; z: number }
): number {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  const dz = pos2.z - pos1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate 2D distance (ignoring Y axis)
 */
export function calculateDistance2D(
  pos1: { x: number; z: number },
  pos2: { x: number; z: number }
): number {
  const dx = pos2.x - pos1.x;
  const dz = pos2.z - pos1.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Check if attack is on cooldown
 */
export function isAttackOnCooldown(lastAttackTime: number, currentTime: number): boolean {
  return currentTime - lastAttackTime < COMBAT_CONSTANTS.ATTACK_COOLDOWN_MS;
}

/**
 * Check if combat should timeout
 */
export function shouldCombatTimeout(combatStartTime: number, currentTime: number): boolean {
  return currentTime - combatStartTime > COMBAT_CONSTANTS.COMBAT_TIMEOUT_MS;
}