import { Entity } from '../../core/entities/Entity';
import type { World } from '../../types/index';
import { Inventory, PlayerSkills, SkillData } from '../types/core';
import { RPGSystemBase } from './RPGSystemBase';
import { EventType } from '../../types/events';

// Define skill constants since RPGSkill enum is not exported
const RPGSkill = {
  ATTACK: 'attack' as keyof PlayerSkills,
  STRENGTH: 'strength' as keyof PlayerSkills,
  DEFENSE: 'defense' as keyof PlayerSkills,
  RANGE: 'ranged' as keyof PlayerSkills,
  CONSTITUTION: 'constitution' as keyof PlayerSkills,
  WOODCUTTING: 'woodcutting' as keyof PlayerSkills,
  FISHING: 'fishing' as keyof PlayerSkills,
  FIREMAKING: 'firemaking' as keyof PlayerSkills,
  COOKING: 'cooking' as keyof PlayerSkills
};

// Component interfaces (not exported from types)
type StatsComponent = PlayerSkills & {
  hitpoints?: { level: number; xp: number; current: number; max: number };
  prayer?: SkillData;
  magic?: SkillData;
  combatLevel?: number;
  totalLevel?: number;
};

import type { SkillMilestone, XPDrop } from '../types/rpg-systems';

export class RPGSkillsSystem extends RPGSystemBase {
  private static readonly MAX_LEVEL = 99;
  private static readonly MAX_XP = 200_000_000; // 200M XP cap
  private static readonly COMBAT_SKILLS: (keyof PlayerSkills)[] = [
    RPGSkill.ATTACK, RPGSkill.STRENGTH, RPGSkill.DEFENSE, RPGSkill.RANGE
  ];
  
  private xpTable: number[] = [];
  private xpDrops: XPDrop[] = [];
  private skillMilestones: Map<keyof PlayerSkills, SkillMilestone[]> = new Map();

  constructor(world: World) {
    super(world, {
      name: 'rpg-skills',
      dependencies: {
        optional: ['rpg-xp', 'rpg-combat', 'rpg-ui', 'rpg-quest']
      },
      autoCleanup: true
    });
    this.generateXPTable();
    this.setupSkillMilestones();
  }

  async init(): Promise<void> {
    // Subscribe to skill events using type-safe event system
    this.subscribe<{ attackerId: string; targetId: string; damageDealt: number; attackStyle: string }>(EventType.COMBAT_KILL, (event) => this.handleCombatKill(event.data));
    this.subscribe<{ entityId: string; skill: keyof PlayerSkills; xp: number }>(EventType.SKILLS_ACTION, (event) => this.handleSkillAction(event.data));
    this.world.on(EventType.QUEST_COMPLETED, (...args: unknown[]) => {
      const data = args[0] as { playerId: string; questId: string; rewards: { xp?: Record<keyof PlayerSkills, number> } };
      this.handleQuestComplete(data);
    });
  }

  update(_deltaTime: number): void {
    // Clean up old XP drops (for UI)
    const currentTime = Date.now();
    this.xpDrops = this.xpDrops.filter(drop => 
      currentTime - drop.timestamp < 3000 // Keep for 3 seconds
    );
  }

  /**
   * Grant XP to a specific skill
   */
  public grantXP(entityId: string, skill: keyof PlayerSkills, amount: number): void {
    const entity = this.world.entities.get(entityId) as Entity;
    if (!entity) return;

    // Handle both real entities and mock entities
    let stats = entity.getComponent('stats') as unknown as StatsComponent | null;
    
    if (!stats) {
      console.warn(`[RPGSkillsSystem] Entity ${entityId} has no stats component`);
      return;
    }

    const skillData = stats[skill] as SkillData;
    if (!skillData) {
      console.warn(`[RPGSkillsSystem] Entity ${entityId} has no skill data for ${skill}`);
      return;
    }

    // Apply XP modifiers (e.g., from equipment, prayers, etc.)
    const modifiedAmount = this.calculateModifiedXP(entity, skill, amount);

    // Check XP cap
    const oldXP = skillData.xp;
    const newXP = Math.min(oldXP + modifiedAmount, RPGSkillsSystem.MAX_XP);
    const actualGain = newXP - oldXP;

    if (actualGain <= 0) return;

    // Update XP
    skillData.xp = newXP;

    // Check for level up
    const oldLevel = skillData.level;
    const newLevel = this.getLevelForXP(newXP);

    if (newLevel > oldLevel) {
      this.handleLevelUp(entity, skill, oldLevel, newLevel);
    }

    // Update combat level if it's a combat skill
    if (RPGSkillsSystem.COMBAT_SKILLS.includes(skill as keyof PlayerSkills)) {
      this.updateCombatLevel(entity, stats);
    }

    // Update total level
    this.updateTotalLevel(entity, stats);

    // Add XP drop for UI
    this.xpDrops.push({
      entityId,
      playerId: entityId,
      skill,
      amount: actualGain,
      timestamp: Date.now(),
      position: { x: 0, y: 0, z: 0 } // Position not used for non-visual drops
    });

    // Emit XP gained event
    this.emitTypedEvent(EventType.SKILLS_XP_GAINED, {
      entityId,
      skill,
      amount: actualGain,
      totalXP: newXP,
      level: skillData.level
    });
  }

  /**
   * Get the level for a given amount of XP
   */
  public getLevelForXP(xp: number): number {
    for (let level = RPGSkillsSystem.MAX_LEVEL; level >= 1; level--) {
      if (xp >= this.xpTable[level]) {
        return level;
      }
    }
    return 1;
  }

  /**
   * Get the XP required for a specific level
   */
  public getXPForLevel(level: number): number {
    if (level < 1) return 0;
    if (level > RPGSkillsSystem.MAX_LEVEL) return this.xpTable[RPGSkillsSystem.MAX_LEVEL];
    return this.xpTable[level];
  }

  /**
   * Get XP remaining to next level
   */
  public getXPToNextLevel(skill: SkillData): number {
    if (skill.level >= RPGSkillsSystem.MAX_LEVEL) return 0;
    
    const nextLevelXP = this.getXPForLevel(skill.level + 1);
    return nextLevelXP - skill.xp;
  }

  /**
   * Get XP progress percentage to next level
   */
  public getXPProgress(skill: SkillData): number {
    if (skill.level >= RPGSkillsSystem.MAX_LEVEL) return 100;
    
    const currentLevelXP = this.getXPForLevel(skill.level);
    const nextLevelXP = this.getXPForLevel(skill.level + 1);
    const progressXP = skill.xp - currentLevelXP;
    const requiredXP = nextLevelXP - currentLevelXP;
    
    return (progressXP / requiredXP) * 100;
  }

  /**
   * Check if entity meets skill requirements
   */
  public meetsRequirements(entity: Entity, requirements: Partial<Record<keyof PlayerSkills, number>>): boolean {
    // Handle both real entities and mock entities
    let stats = entity.getComponent('stats') as unknown as StatsComponent | null;
    
    if (!stats) return false;

    for (const [skill, requiredLevel] of Object.entries(requirements)) {
      const skillData = stats[skill as keyof PlayerSkills] as SkillData;
      if (!skillData) return false;
      if (skillData.level < (requiredLevel ?? 0)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get combat level for an entity
   */
  public getCombatLevel(stats: StatsComponent): number {
    // RuneScape combat level formula
    // Extract levels from stats
    const defenseLevel = stats.defense?.level ?? 1;
    const hitpointsLevel = stats.hitpoints?.level ?? 10;
    const prayerLevel = stats.prayer?.level ?? 1;
    const attackLevel = stats.attack?.level ?? 1;
    const strengthLevel = stats.strength?.level ?? 1;
    const rangedLevel = stats.ranged?.level ?? 1;
    const magicLevel = stats.magic?.level ?? 1;
    
    const base = 0.25 * (
      defenseLevel + 
      hitpointsLevel + 
      Math.floor(prayerLevel / 2)
    );
    
    const melee = 0.325 * (attackLevel + strengthLevel);
    const rangedCalc = 0.325 * Math.floor(rangedLevel * 1.5);
    const magicCalc = 0.325 * Math.floor(magicLevel * 1.5);
    
    return Math.floor(base + Math.max(melee, rangedCalc, magicCalc));
  }

  /**
   * Get total level (sum of all skill levels)
   */
  public getTotalLevel(stats: StatsComponent): number {
    let total = 0;
    
    // Sum all skill levels
    const skills: (keyof PlayerSkills)[] = [
      RPGSkill.ATTACK, RPGSkill.STRENGTH, RPGSkill.DEFENSE, RPGSkill.RANGE, 
      RPGSkill.CONSTITUTION, RPGSkill.WOODCUTTING, RPGSkill.FISHING,
      RPGSkill.FIREMAKING, RPGSkill.COOKING
    ];

    for (const skill of skills) {
      const skillData = stats[skill] as SkillData;
      total += skillData.level;
    }

    return total;
  }

  /**
   * Get total XP across all skills
   */
  public getTotalXP(stats: StatsComponent): number {
    let total = 0;
    
    const skills: (keyof PlayerSkills)[] = [
      RPGSkill.ATTACK, RPGSkill.STRENGTH, RPGSkill.DEFENSE, RPGSkill.RANGE, 
      RPGSkill.CONSTITUTION, RPGSkill.WOODCUTTING, RPGSkill.FISHING,
      RPGSkill.FIREMAKING, RPGSkill.COOKING
    ];

    for (const skill of skills) {
      const skillData = stats[skill] as SkillData;
      total += skillData.xp;
    }

    return total;
  }

  /**
   * Reset a skill to level 1
   */
  public resetSkill(entityId: string, skill: keyof PlayerSkills): void {
    const entity = this.world.entities.get(entityId) as Entity;
    if (!entity) return;

    // Handle both real entities and mock entities
    const stats = entity.getComponent('stats') as unknown as StatsComponent;
    if (!stats) {
      console.warn(`[RPGSkillsSystem] Entity ${entityId} has no stats component`);
      return;
    }

    const skillData = stats[skill] as SkillData;
    if (!skillData) {
      console.warn(`[RPGSkillsSystem] Entity ${entityId} has no skill data for ${skill}`);
      return;
    }

    skillData.level = 1;
    skillData.xp = 0;

    // Update combat level if needed
    if (RPGSkillsSystem.COMBAT_SKILLS.includes(skill as keyof PlayerSkills)) {
      this.updateCombatLevel(entity, stats);
    }

    this.updateTotalLevel(entity, stats);

    this.emitTypedEvent(EventType.SKILLS_RESET, {
      entityId,
      skill
    });
  }

  /**
   * Set skill level directly (for admin commands)
   */
  public setSkillLevel(entityId: string, skill: keyof PlayerSkills, level: number): void {
    if (level < 1 || level > RPGSkillsSystem.MAX_LEVEL) {
      console.warn(`Invalid level ${level} for skill ${skill}`);
      return;
    }

    const entity = this.world.entities.get(entityId) as Entity;
    if (!entity) return;

    const stats = entity.getComponent('stats') as unknown as StatsComponent;
    if (!stats) {
      console.warn(`[RPGSkillsSystem] Entity ${entityId} has no stats component`);
      return;
    }
    
    const skillData = stats[skill] as SkillData;
    if (!skillData) {
      console.warn(`[RPGSkillsSystem] Entity ${entityId} has no skill data for ${skill}`);
      return;
    }

    const oldLevel = skillData.level;
    skillData.level = level;
    skillData.xp = this.getXPForLevel(level);

    if (level > oldLevel) {
      this.handleLevelUp(entity, skill, oldLevel, level);
    }

    // Update combat level if needed
    if (RPGSkillsSystem.COMBAT_SKILLS.includes(skill as keyof PlayerSkills)) {
      this.updateCombatLevel(entity, stats);
    }

    this.updateTotalLevel(entity, stats);
  }

  private generateXPTable(): void {
    this.xpTable = [0, 0]; // Levels 0 and 1
    
    for (let level = 2; level <= RPGSkillsSystem.MAX_LEVEL; level++) {
      const xp = Math.floor(
        (level - 1) + 300 * Math.pow(2, (level - 1) / 7)
      ) / 4;
      this.xpTable.push(Math.floor(this.xpTable[level - 1] + xp));
    }
  }

  private setupSkillMilestones(): void {
    // Define special milestones for each skill
    const commonMilestones: SkillMilestone[] = [
      { level: 50, name: 'Halfway', message: 'Halfway to mastery!', reward: null },
      { level: 92, name: 'Half XP', message: 'Halfway to 99 in XP!', reward: null },
      { level: 99, name: 'Mastery', message: 'Skill mastered!', reward: null }
    ];

    // Apply common milestones to all skills
    const skills: (keyof PlayerSkills)[] = [
      RPGSkill.ATTACK, RPGSkill.STRENGTH, RPGSkill.DEFENSE, RPGSkill.RANGE, 
      RPGSkill.CONSTITUTION, RPGSkill.WOODCUTTING, RPGSkill.FISHING,
      RPGSkill.FIREMAKING, RPGSkill.COOKING
    ];

    for (const skill of skills) {
      this.skillMilestones.set(skill, [...commonMilestones]);
    }

    // Add skill-specific milestones
    const combatMilestones = this.skillMilestones.get(RPGSkill.ATTACK)!;
    combatMilestones.push(
      { level: 40, name: 'Rune Weapons', message: 'You can now wield rune weapons!', reward: null },
      { level: 60, name: 'Dragon Weapons', message: 'You can now wield dragon weapons!', reward: null }
    );
  }

  private handleLevelUp(entity: Entity, skill: keyof PlayerSkills, oldLevel: number, newLevel: number): void {
    // This method is only called after verifying stats exists in grantXP and setSkillLevel
    const stats = entity.getComponent('stats')! as unknown as StatsComponent;

    const skillData = stats[skill] as SkillData;
    if (!skillData) {
      console.warn(`[RPGSkillsSystem] Entity ${entity.id} has no skill data for ${skill} in handleLevelUp`);
      return;
    }
    
    skillData.level = newLevel;

    // Check for milestones
    const milestones = this.skillMilestones.get(skill) ?? [];
    for (const milestone of milestones) {
      if (milestone.level > oldLevel && milestone.level <= newLevel) {
        this.emitTypedEvent(EventType.SKILLS_MILESTONE, {
          entityId: entity.id,
          skill,
          milestone
        });
      }
    }

    // Special handling for HP level up
    if (skill === RPGSkill.CONSTITUTION && stats.hitpoints) {
      // Update hitpoints max
      const newMax = this.calculateMaxHitpoints(newLevel);
      stats.hitpoints.max = newMax;
      // If current HP is higher than new max, cap it
      stats.hitpoints.current = newMax;
    }

    // Special handling for Prayer level up - skipping for MVP
    // Prayer is not in our current RPGSkill enum

    this.emitTypedEvent(EventType.SKILLS_LEVEL_UP, {
      entityId: entity.id,
      skill,
      oldLevel,
      newLevel,
      totalLevel: stats.totalLevel
    });
  }

  private calculateMaxHitpoints(level: number): number {
    // RuneScape formula: 10 + level
    return 10 + level;
  }

  private updateCombatLevel(entity: Entity, stats: StatsComponent): void {
    const oldCombatLevel = stats.combatLevel;
    const newCombatLevel = this.getCombatLevel(stats);

    if (newCombatLevel !== oldCombatLevel) {
      stats.combatLevel = newCombatLevel;
      
      this.emitTypedEvent(EventType.COMBAT_LEVEL_CHANGED, {
        entityId: entity.id,
        oldLevel: oldCombatLevel,
        newLevel: newCombatLevel
      });
    }
  }

  private updateTotalLevel(entity: Entity, stats: StatsComponent): void {
    const oldTotalLevel = stats.totalLevel;
    const newTotalLevel = this.getTotalLevel(stats);

    if (newTotalLevel !== oldTotalLevel) {
      stats.totalLevel = newTotalLevel;
      
      this.emitTypedEvent(EventType.TOTAL_LEVEL_CHANGED, {
        entityId: entity.id,
        oldLevel: oldTotalLevel,
        newLevel: newTotalLevel
      });
    }
  }

  private calculateModifiedXP(entity: Entity, skill: keyof PlayerSkills, baseXP: number): number {
    const modifier = 1.0;

    const inventory = entity.getComponent('inventory') as unknown as Inventory;
    
    return Math.floor(baseXP * modifier);
  }

  // Event handlers
  private handleCombatKill(data: { 
    attackerId: string; 
    targetId: string; 
    damageDealt: number;
    attackStyle: string;
  }): void {
    const { attackerId, targetId, attackStyle } = data;
    
    const target = this.world.entities.get(targetId) as Entity;
    if (!target) return;

    // Handle both real entities and mock entities
    let targetStats: StatsComponent | undefined;
    if (typeof target.getComponent === 'function') {
      targetStats = target.getComponent('stats') as unknown as StatsComponent;
    } else if ('stats' in target) {
      // Mock entity - access stats directly
      targetStats = (target as unknown as { stats: StatsComponent }).stats;
    }
    
    if (!targetStats?.hitpoints) return;

    // Calculate XP based on target's hitpoints
    const baseXP = (targetStats.hitpoints?.max ?? 10) * 4; // 4 XP per hitpoint
    
    // Grant XP based on attack style
    switch (attackStyle) {
      case 'accurate':
        this.grantXP(attackerId, RPGSkill.ATTACK, baseXP);
        break;
      case 'aggressive':
        this.grantXP(attackerId, RPGSkill.STRENGTH, baseXP);
        break;
      case 'defensive':
        this.grantXP(attackerId, RPGSkill.DEFENSE, baseXP);
        break;
      case 'controlled':
        // Split XP between attack, strength, and defense
        this.grantXP(attackerId, RPGSkill.ATTACK, baseXP / 3);
        this.grantXP(attackerId, RPGSkill.STRENGTH, baseXP / 3);
        this.grantXP(attackerId, RPGSkill.DEFENSE, baseXP / 3);
        break;
      case 'ranged':
        this.grantXP(attackerId, RPGSkill.RANGE, baseXP);
        break;
      case 'magic':
        // Magic is not in our current RPGSkill enum, skip for MVP
        break;
    }

    // Always grant Constitution XP
    this.grantXP(attackerId, RPGSkill.CONSTITUTION, baseXP / 3);
  }

  private handleSkillAction(data: {
    entityId: string;
    skill: keyof PlayerSkills;
    xp: number;
  }): void {
    this.grantXP(data.entityId, data.skill, data.xp);
  }

  private handleQuestComplete(data: {
    playerId: string;
    questId: string;
    rewards: {
      xp?: Record<keyof PlayerSkills, number>;
    };
  }): void {
    if (!data.rewards.xp) return;

    for (const [skill, xp] of Object.entries(data.rewards.xp)) {
      this.grantXP(data.playerId, skill as keyof PlayerSkills, xp);
    }
  }

  // Public getters
  public getXPDrops(): XPDrop[] {
    return [...this.xpDrops];
  }

  public getRPGSkillData(entityId: string, skill: keyof PlayerSkills): SkillData | undefined {
    const entity = this.world.entities.get(entityId) as Entity;
    if (!entity) return undefined;

    // Handle both real entities and mock entities
    let stats: StatsComponent | undefined;
    if (typeof entity.getComponent === 'function') {
      stats = entity.getComponent('stats') as unknown as StatsComponent;
    } else if ('stats' in entity) {
      // Mock entity - access stats directly
      stats = (entity as unknown as { stats: StatsComponent }).stats;
    }
    
    if (!stats) return undefined;
    
    return stats[skill] as SkillData;
  }

  public getSkills(entityId: string): PlayerSkills | undefined {
    const entity = this.world.entities.get(entityId) as Entity;
    if (!entity) return undefined;

    // Handle both real entities and mock entities
    let stats: StatsComponent | undefined;
    if (typeof entity.getComponent === 'function') {
      stats = entity.getComponent('stats') as unknown as StatsComponent;
    } else if ('stats' in entity) {
      // Mock entity - access stats directly
      stats = (entity as unknown as { stats: StatsComponent }).stats;
    }
    
    if (!stats) return undefined;

    // Extract only the skill data from stats component
    const skills: PlayerSkills = {
      attack: stats.attack ?? { level: 1, xp: 0 },
      strength: stats.strength ?? { level: 1, xp: 0 },
      defense: stats.defense ?? { level: 1, xp: 0 },
      constitution: stats.constitution ?? { level: 1, xp: 0 },
      ranged: stats.ranged ?? { level: 1, xp: 0 },
      woodcutting: stats.woodcutting ?? { level: 1, xp: 0 },
      fishing: stats.fishing ?? { level: 1, xp: 0 },
      firemaking: stats.firemaking ?? { level: 1, xp: 0 },
      cooking: stats.cooking ?? { level: 1, xp: 0 }
    };

    return skills;
  }

  destroy(): void {
    // Clear XP drops for UI
    this.xpDrops.length = 0;
    
    // Clear skill milestones
    this.skillMilestones.clear();
    
    // Clear XP table
    this.xpTable.length = 0;
    
    // Event cleanup is handled by parent RPGSystemBase destroy method
    
    // Call parent cleanup
    super.destroy();
  }
} 