/**
 * Combat Component for RPG entities
 * Stores combat-related data for entities that can participate in combat
 */

import { Component } from '../../core/components/Component';
import type { Entity } from '../../core/entities/Entity';

export interface CombatComponentData {
  isInCombat?: boolean;
  target?: string | null;
  lastAttackTime?: number;
  attackCooldown?: number;
  damage?: number;
  range?: number;
}

export class CombatComponent extends Component {
  public isInCombat: boolean = false;
  public target: string | null = null;
  public lastAttackTime: number = 0;
  public attackCooldown: number = 1000;
  public damage: number = 10;
  public range: number = 2;

  constructor(entity: Entity, data?: CombatComponentData) {
    super('combat', entity, data as Record<string, unknown>);
    
    if (data) {
      if (data.isInCombat !== undefined) this.isInCombat = data.isInCombat;
      if (data.target !== undefined) this.target = data.target;
      if (data.lastAttackTime !== undefined) this.lastAttackTime = data.lastAttackTime;
      if (data.attackCooldown !== undefined) this.attackCooldown = data.attackCooldown;
      if (data.damage !== undefined) this.damage = data.damage;
      if (data.range !== undefined) this.range = data.range;
    }
  }

  update(_deltaTime: number): void {
    // Combat logic is handled by RPGCombatSystem
  }

  serialize(): Record<string, unknown> {
    return {
      type: this.type,
      isInCombat: this.isInCombat,
      target: this.target,
      lastAttackTime: this.lastAttackTime,
      attackCooldown: this.attackCooldown,
      damage: this.damage,
      range: this.range
    };
  }
}