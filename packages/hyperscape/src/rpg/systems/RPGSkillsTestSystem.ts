/**
 * RPG Skills Test System
 * Tests XP gaining, leveling up, skill progression, and stat calculations
 * - Tests XP gain from combat actions (attack, strength, defense)
 * - Tests XP gain from gathering actions (woodcutting, fishing, firemaking, cooking)
 * - Tests level up mechanics and thresholds
 * - Tests skill stat bonuses and calculations
 * - Tests combat level calculations
 * - Tests skill requirements for equipment and actions
 */

import type { PlayerSkills, World, SkillData } from '../types/core';
import type { Player } from '../types/test'
import { EventType } from '../../types/events';
import { RPGSkillsSystem } from './RPGSkillsSystem';
import { RPGVisualTestFramework } from './RPGVisualTestFramework';
import { getEntityStats } from '../utils/CombatUtils';
import { RPGLogger } from '../utils/RPGLogger';

// Define skill constants locally (same as RPGSkillsSystem)
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

// Local StatsComponent type compatible with getEntityStats return type
type LocalStatsComponent = {
  attack?: SkillData | number;
  strength?: SkillData | number;
  defense?: SkillData | number;
  ranged?: SkillData | number;
  constitution?: SkillData | number;
  woodcutting?: SkillData | number;
  fishing?: SkillData | number;
  firemaking?: SkillData | number;
  cooking?: SkillData | number;
  combatLevel?: number;
  [key: string]: unknown;
};

interface SkillsTestData {
  player: Player;
  testType: 'combat_xp' | 'gathering_xp' | 'level_up' | 'stat_calculations' | 'requirements' | 'comprehensive';
  startTime: number;
  initialSkills: PlayerSkills;
  finalSkills: PlayerSkills;
  xpGained: Record<string, number>;
  levelsGained: Record<string, number>;
  levelUpsDetected: number;
  combatLevelInitial: number;
  combatLevelFinal: number;
  actionsPerformed: Record<string, number>;
  expectedXPPerAction: Record<string, number>;
  skillsToTest: string[];
  testActions: Array<{
    action: string;
    targetSkill: string;
    expectedXP: number;
    levelRequired?: number;
    equipmentRequired?: string;
  }>;
}

export class RPGSkillsTestSystem extends RPGVisualTestFramework {
  private testData = new Map<string, SkillsTestData>();
  private skillsSystem!: RPGSkillsSystem;

  constructor(world: World) {
    super(world);
  }

  async init(): Promise<void> {
    await super.init();
    
    this.skillsSystem = this.world.getSystem('rpg-skills') as RPGSkillsSystem;

    // Set up event listeners
    this.world.on(EventType.SKILLS_XP_GAINED, this.handleXPGained.bind(this));
    this.world.on(EventType.SKILLS_LEVEL_UP, this.handleLevelUp.bind(this));
    this.world.on(EventType.COMBAT_ACTION, this.handleCombatAction.bind(this));
    this.world.on(EventType.RESOURCE_GATHERED, this.handleGatheringAction.bind(this));

    // Create test stations immediately
    this.createTestStations();
    this.testStationsCreated = true;
  }

  protected createTestStations(): void {
    const testConfigs = [
      {
        id: 'combat-xp-test',
        name: 'Combat XP Test',
        position: { x: 10, y: 1, z: 10 },
        testType: 'combat_xp' as const
      },
      {
        id: 'gathering-xp-test', 
        name: 'Gathering XP Test',
        position: { x: 20, y: 1, z: 10 },
        testType: 'gathering_xp' as const
      },
      {
        id: 'level-up-test',
        name: 'Level Up Test',
        position: { x: 30, y: 1, z: 10 },
        testType: 'level_up' as const
      },
      {
        id: 'stat-calc-test',
        name: 'Stat Calculations Test',
        position: { x: 40, y: 1, z: 10 },
        testType: 'stat_calculations' as const
      },
      {
        id: 'requirements-test',
        name: 'Requirements Test',
        position: { x: 50, y: 1, z: 10 },
        testType: 'requirements' as const
      },
      {
        id: 'comprehensive-skills-test',
        name: 'Comprehensive Skills Test',
        position: { x: 60, y: 1, z: 10 },
        testType: 'comprehensive' as const
      }
    ];

    RPGLogger.system('RPGSkillsTestSystem', `Creating ${testConfigs.length} test stations`);

    testConfigs.forEach(config => {
      this.createTestStation(config);
      this.testData.set(config.id, {
        player: this.createPlayer({
          id: `${config.id}-player`,
          name: `${config.name} Player`,
          position: config.position
        }),
        testType: config.testType,
        startTime: 0,
        initialSkills: this.getDefaultSkills(),
        finalSkills: this.getDefaultSkills(),
        xpGained: {},
        levelsGained: {},
        levelUpsDetected: 0,
        combatLevelInitial: 3,
        combatLevelFinal: 3,
        actionsPerformed: {},
        expectedXPPerAction: {},
        skillsToTest: [],
        testActions: []
      });
      RPGLogger.system('RPGSkillsTestSystem', `Created test station '${config.id}' with test data`);
    });
    
    RPGLogger.system('RPGSkillsTestSystem', `All test stations created. Test data available for: [${Array.from(this.testData.keys()).join(', ')}]`);
  }

  private getDefaultSkills(): PlayerSkills {
    return {
      attack: { level: 1, xp: 0 },
      strength: { level: 1, xp: 0 },
      defense: { level: 1, xp: 0 },
      ranged: { level: 1, xp: 0 },
      constitution: { level: 10, xp: 1154 },
      woodcutting: { level: 1, xp: 0 },
      fishing: { level: 1, xp: 0 },
      firemaking: { level: 1, xp: 0 },
      cooking: { level: 1, xp: 0 }
    };
  }

  protected runTest(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) {
      const availableStations = Array.from(this.testData.keys());
      RPGLogger.systemError('RPGSkillsTestSystem', `No test data found for station ${stationId}. Available stations: [${availableStations.join(', ')}]`);
      this.failTest(stationId, 'Test data not found');
      return;
    }

    this.startTest(stationId);
    testData.startTime = Date.now();

    switch (testData.testType) {
      case 'combat_xp':
        this.runCombatXPTest(stationId);
        break;
      case 'gathering_xp':
        this.runGatheringXPTest(stationId);
        break;
      case 'level_up':
        this.runLevelUpTest(stationId);
        break;
      case 'stat_calculations':
        this.runStatCalculationsTest(stationId);
        break;
      case 'requirements':
        this.runRequirementsTest(stationId);
        break;
      case 'comprehensive':
        this.runComprehensiveSkillsTest(stationId);
        break;
    }
  }

  private async runCombatXPTest(stationId: string): Promise<void> {
    const testData = this.testData.get(stationId)!;

    // Initialize test actions for combat skills
    testData.testActions = [
      { action: 'melee_attack', targetSkill: 'attack', expectedXP: 4 },
      { action: 'strength_training', targetSkill: 'strength', expectedXP: 4 },
      { action: 'defense_training', targetSkill: 'defense', expectedXP: 4 },
      { action: 'ranged_attack', targetSkill: 'ranged', expectedXP: 4 }
    ];

    testData.skillsToTest = ['attack', 'strength', 'defense', 'ranged'];
    testData.initialSkills = await this.getPlayerSkills(testData.player.id);

    // Create training dummy
    this.createTrainingDummy();

    // Start combat training sequence
    this.startCombatTrainingSequence(stationId);

    // Complete test after training actions
    setTimeout(() => {
      this.completeCombatXPTest(stationId);
    }, 15000);
  }

  private async runGatheringXPTest(stationId: string): Promise<void> {
    const testData = this.testData.get(stationId)!;

    testData.testActions = [
      { action: 'chop_tree', targetSkill: 'woodcutting', expectedXP: 6 },
      { action: 'catch_fish', targetSkill: 'fishing', expectedXP: 5 },
      { action: 'light_fire', targetSkill: 'firemaking', expectedXP: 3 },
      { action: 'cook_food', targetSkill: 'cooking', expectedXP: 7 }
    ];

    testData.skillsToTest = ['woodcutting', 'fishing', 'firemaking', 'cooking'];
    testData.initialSkills = await this.getPlayerSkills(testData.player.id);

    // Create gathering resources
    this.createGatheringResources();

    // Start gathering sequence
    this.startGatheringSequence(stationId);

    setTimeout(() => {
      this.completeGatheringXPTest(stationId);
    }, 20000);
  }

  private async runLevelUpTest(stationId: string): Promise<void> {
    const testData = this.testData.get(stationId)!;

    // Set player to near level-up XP amounts
    const nearLevelUpSkills: PlayerSkills = {
      attack: { level: 1, xp: 80 }, // Need 83 XP for level 2
      strength: { level: 1, xp: 80 },
      defense: { level: 1, xp: 80 },
      ranged: { level: 1, xp: 80 },
      constitution: { level: 10, xp: 1154 },
      woodcutting: { level: 1, xp: 80 },
      fishing: { level: 1, xp: 80 },
      firemaking: { level: 1, xp: 80 },
      cooking: { level: 1, xp: 80 }
    };

    // Set initial skills near level up
    await this.setPlayerSkills(testData.player.id, nearLevelUpSkills);
    testData.initialSkills = nearLevelUpSkills;

    // Perform actions to trigger level ups
    this.triggerLevelUps(stationId);

    setTimeout(() => {
      this.completeLevelUpTest(stationId);
    }, 10000);
  }

  private async runStatCalculationsTest(stationId: string): Promise<void> {
    const testData = this.testData.get(stationId)!;

    // Test combat level calculation with different skill combinations
    const testSkillSets = [
      { attack: 20, strength: 15, defense: 10, ranged: 1, constitution: 15 }, // Should be combat level 16
      { attack: 40, strength: 40, defense: 40, ranged: 1, constitution: 40 }, // Should be combat level 40  
      { attack: 60, strength: 60, defense: 60, ranged: 60, constitution: 60 }, // Should be combat level 60
      { attack: 99, strength: 99, defense: 99, ranged: 99, constitution: 99 }  // Should be combat level 126
    ];

    for (let i = 0; i < testSkillSets.length; i++) {
      const skillSet = testSkillSets[i];
      const expectedCombatLevel = this.calculateExpectedCombatLevel(skillSet);
      
      // Set skills and verify combat level
      await this.setPlayerCombatSkills(testData.player.id, skillSet);
      const actualCombatLevel = await this.getPlayerCombatLevel(testData.player.id);
      
      if (actualCombatLevel === expectedCombatLevel) {
        testData.actionsPerformed[`combat_calc_${i}`] = 1;
      }
    }

    this.completeStatCalculationsTest(stationId);
  }

  private async runRequirementsTest(stationId: string): Promise<void> {
    const testData = this.testData.get(stationId)!;

    // Test equipment level requirements
    const equipmentTests = [
      { itemId: 'steel_sword', requiredLevel: 10, skill: 'attack' },
      { itemId: 'steel_body', requiredLevel: 10, skill: 'defense' },
      { itemId: 'mithril_sword', requiredLevel: 20, skill: 'attack' },
      { itemId: 'mithril_body', requiredLevel: 20, skill: 'defense' }
    ];

    for (const test of equipmentTests) {
      // Test with insufficient level
      await this.setPlayerSkillLevel(testData.player.id, test.skill, test.requiredLevel - 1);
      const canEquipLow = await this.testEquipmentRequirement(testData.player.id, test.itemId);
      
      // Test with sufficient level  
      await this.setPlayerSkillLevel(testData.player.id, test.skill, test.requiredLevel);
      const canEquipHigh = await this.testEquipmentRequirement(testData.player.id, test.itemId);
      
      if (!canEquipLow && canEquipHigh) {
        testData.actionsPerformed[`req_${test.itemId}`] = 1;
      }
    }

    this.completeRequirementsTest(stationId);
  }

  private async runComprehensiveSkillsTest(stationId: string): Promise<void> {
    // Run all skill tests in sequence
    await this.runCombatXPTest(stationId);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await this.runGatheringXPTest(stationId);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await this.runLevelUpTest(stationId);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await this.runStatCalculationsTest(stationId);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await this.runRequirementsTest(stationId);

    this.completeComprehensiveTest(stationId);
  }

  // Helper methods for test execution
  private createTrainingDummy(): void {
    // Create visual training dummy for combat tests
  }

  private createGatheringResources(): void {
    // Create visual resources for gathering tests
  }

  private startCombatTrainingSequence(stationId: string): void {
    const testData = this.testData.get(stationId)!;

    let actionIndex = 0;
    const performNextAction = () => {
      if (actionIndex >= testData.testActions.length) return;

      const action = testData.testActions[actionIndex];
      this.performCombatAction(testData.player.id, action.action);
      testData.actionsPerformed[action.action] = (testData.actionsPerformed[action.action] || 0) + 1;
      
      actionIndex++;
      setTimeout(performNextAction, 2000);
    };

    performNextAction();
  }

  private startGatheringSequence(stationId: string): void {
    const testData = this.testData.get(stationId)!;

    let actionIndex = 0;
    const performNextAction = () => {
      if (actionIndex >= testData.testActions.length) return;

      const action = testData.testActions[actionIndex];
      this.performGatheringAction(testData.player.id, action.action);
      testData.actionsPerformed[action.action] = (testData.actionsPerformed[action.action] || 0) + 1;
      
      actionIndex++;
      setTimeout(performNextAction, 3000);
    };

    performNextAction();
  }

  private triggerLevelUps(stationId: string): void {
    const testData = this.testData.get(stationId)!;

    // Give small XP amounts to trigger level ups from near-level state
    testData.skillsToTest.forEach((skill, index) => {
      setTimeout(() => {
        this.giveSkillXP(testData.player.id, skill, 5); // Should push to level 2
      }, index * 1000);
    });
  }

  // Event handlers
  private handleXPGained(data: { playerId: string; skill: string; amount: number }): void {
    for (const testData of this.testData.values()) {
      if (testData.player.id === data.playerId) {
        testData.xpGained[data.skill] = (testData.xpGained[data.skill] ?? 0) + data.amount;
        break;
      }
    }
  }

  private handleLevelUp(data: { playerId: string; skill: string; newLevel: number; oldLevel: number }): void {
    for (const testData of this.testData.values()) {
      if (testData.player.id === data.playerId) {
        testData.levelUpsDetected++;
        testData.levelsGained[data.skill] = data.newLevel - data.oldLevel;
        break;
      }
    }
  }

  private handleCombatAction(): void {
    // Track combat actions for XP validation
  }

  private handleGatheringAction(): void {
    // Track gathering actions for XP validation
  }

  // Test completion methods
  private completeCombatXPTest(stationId: string): void {
    const testData = this.testData.get(stationId)!;

    const totalXPGained = Object.values(testData.xpGained).reduce((sum, xp) => sum + xp, 0);
    const skillsTested = testData.skillsToTest.length;
    const actionsPerformed = Object.values(testData.actionsPerformed).reduce((sum, count) => sum + count, 0);

    const success = totalXPGained > 0 && skillsTested > 0 && actionsPerformed > 0;

    if (success) {
      this.passTest(stationId);
    } else {
      this.failTest(stationId, 'No XP gained from combat actions');
    }
  }

  private completeGatheringXPTest(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) {
      RPGLogger.systemError('RPGSkillsTestSystem', `No test data found for station ${stationId} in completeGatheringXPTest`);
      this.failTest(stationId, 'Test data not found');
      return;
    }

    const gatheringSkills = ['woodcutting', 'fishing', 'firemaking', 'cooking'];
    const xpInGatheringSkills = gatheringSkills.some(skill => testData.xpGained[skill] > 0);

    if (xpInGatheringSkills) {
      this.passTest(stationId);
    } else {
      this.failTest(stationId, 'No XP gained from gathering actions');
    }
  }

  private completeLevelUpTest(stationId: string): void {
    const testData = this.testData.get(stationId)!;

    const expectedLevelUps = testData.skillsToTest.length;
    const actualLevelUps = testData.levelUpsDetected;

    if (actualLevelUps >= expectedLevelUps) {
      this.passTest(stationId);
    } else {
      this.failTest(stationId, `Expected ${expectedLevelUps} level ups, got ${actualLevelUps}`);
    }
  }

  private completeStatCalculationsTest(stationId: string): void {
    const testData = this.testData.get(stationId)!;

    const calculationsPerformed = Object.keys(testData.actionsPerformed).filter(key => key.startsWith('combat_calc_')).length;
    const expectedCalculations = 4; // 4 test skill sets

    if (calculationsPerformed >= expectedCalculations) {
      this.passTest(stationId);
    } else {
      this.failTest(stationId, `Only ${calculationsPerformed}/${expectedCalculations} calculations correct`);
    }
  }

  private completeRequirementsTest(stationId: string): void {
    const testData = this.testData.get(stationId)!;

    const requirementsTestsPassed = Object.keys(testData.actionsPerformed).filter(key => key.startsWith('req_')).length;
    const expectedTests = 4; // 4 equipment requirement tests

    if (requirementsTestsPassed >= expectedTests) {
      this.passTest(stationId);
    } else {
      this.failTest(stationId, `Only ${requirementsTestsPassed}/${expectedTests} requirement tests passed`);
    }
  }

  private completeComprehensiveTest(stationId: string): void {
    const testData = this.testData.get(stationId)!;

    const allTestsPerformed = testData.actionsPerformed;
    const totalActions = Object.values(allTestsPerformed).reduce((sum, count) => sum + count, 0);
    const totalXP = Object.values(testData.xpGained).reduce((sum, xp) => sum + xp, 0);

    const success = totalActions > 10 && totalXP > 50 && testData.levelUpsDetected > 0;

    if (success) {
      this.passTest(stationId);
    } else {
      this.failTest(stationId, 'Comprehensive skills test did not meet all criteria');
    }
  }

  protected cleanupTest(stationId: string): void {
    // Clean up any test-specific visuals or timers
    this.testData.delete(stationId);
  }

  // Helper methods for skill system interaction
  private async getPlayerSkills(playerId: string): Promise<PlayerSkills> {
    // Get skills from the stats component
    const stats = getEntityStats(this.world, playerId);
    if (!stats) return this.getDefaultSkills();
    
    // Helper function to ensure SkillData type
    const ensureSkillData = (skill: SkillData | number | undefined, defaultLevel: number = 1): SkillData => {
      if (typeof skill === 'object' && skill && 'level' in skill && 'xp' in skill) {
        return skill;
      }
      return { level: (typeof skill === 'number' ? skill : defaultLevel), xp: 0 };
    };

    // Extract skills from stats component
    const skills: PlayerSkills = {
      attack: ensureSkillData(stats.attack as SkillData | number | undefined, 1),
      strength: ensureSkillData(stats.strength as SkillData | number | undefined, 1),
      defense: ensureSkillData(stats.defense as SkillData | number | undefined, 1),
      ranged: ensureSkillData(stats.ranged as SkillData | number | undefined, 1),
      constitution: ensureSkillData(stats.constitution as SkillData | number | undefined, 10),
      woodcutting: ensureSkillData(stats.woodcutting as SkillData | number | undefined, 1),
      fishing: ensureSkillData(stats.fishing as SkillData | number | undefined, 1),
      firemaking: ensureSkillData(stats.firemaking as SkillData | number | undefined, 1),
      cooking: ensureSkillData(stats.cooking as SkillData | number | undefined, 1)
    };
    
    return skills;
  }

  private async setPlayerSkills(playerId: string, skills: PlayerSkills): Promise<void> {
    if (!this.skillsSystem) return;
    
    // Set skills via the skills system
    for (const _skill of Object.keys(skills)) {
      // Skills system methods not available - would need to use alternative approach
    }
  }

  private async setPlayerSkillLevel(playerId: string, skill: string, level: number): Promise<void> {
    // Calculate XP needed for the target level
    const xpForLevel = this.getXPForLevel(level);
    
    // Get the stats component and set the skill level directly
    const stats = getEntityStats(this.world, playerId) as LocalStatsComponent;
    if (!stats) {
      RPGLogger.systemError('RPGSkillsTestSystem', `No stats component found for player ${playerId}`);
      return;
    }
    
    // Update the skill in the stats component
    const skillKey = skill as keyof PlayerSkills;
    if (stats[skillKey]) {
      const skillData = stats[skillKey] as SkillData;
      if (typeof skillData === 'object' && 'level' in skillData) {
        skillData.level = level;
        skillData.xp = xpForLevel;
      }
      
      // Also update combat level if this is a combat skill
      if (['attack', 'strength', 'defense', 'ranged', 'constitution'].includes(skill)) {
        stats.combatLevel = this.calculateCombatLevel(stats);
      }
    }
  }

  private async setPlayerCombatSkills(playerId: string, skills: Record<string, number>): Promise<void> {
    
    for (const [skill, level] of Object.entries(skills)) {
      await this.setPlayerSkillLevel(playerId, skill, level);
    }
  }

  private async getPlayerCombatLevel(playerId: string): Promise<number> {
    const stats = getEntityStats(this.world, playerId) as LocalStatsComponent;
    if (!stats) return 3;
    
    // Calculate combat level based on stats
    const combatLevel = this.getStatValue(stats.combatLevel);
    if (typeof combatLevel === 'number') {
      return combatLevel;
    }
    return this.calculateCombatLevel(stats);
  }

  private calculateExpectedCombatLevel(skills: Record<string, number>): number {
    // RuneScape combat level formula
    const { attack, strength, defense, ranged, constitution } = skills;
    const combatLevel = (defense + constitution + Math.floor(constitution / 2)) / 4 +
                       Math.max(attack + strength, Math.floor(ranged * 1.5)) / 4;
    return Math.floor(combatLevel);
  }

  private giveSkillXP(playerId: string, skill: string, amount: number): void {
    // Use the proper grantXP method from RPGSkillsSystem
    this.skillsSystem.grantXP(playerId, skill as keyof PlayerSkills, amount);
  }

  private performCombatAction(playerId: string, action: string): void {
    // Simulate combat action that should give XP
    this.world.emit(EventType.COMBAT_ACTION, { playerId, action });
    
    // Give XP based on the action
    const xpAmount = 10; // Base XP per action
    switch (action) {
      case 'melee_attack':
        this.giveSkillXP(playerId, RPGSkill.ATTACK, xpAmount);
        this.giveSkillXP(playerId, RPGSkill.CONSTITUTION, Math.floor(xpAmount / 3));
        break;
      case 'strength_attack':
        this.giveSkillXP(playerId, RPGSkill.STRENGTH, xpAmount);
        this.giveSkillXP(playerId, RPGSkill.CONSTITUTION, Math.floor(xpAmount / 3));
        break;
      case 'defensive_attack':
        this.giveSkillXP(playerId, RPGSkill.DEFENSE, xpAmount);
        this.giveSkillXP(playerId, RPGSkill.CONSTITUTION, Math.floor(xpAmount / 3));
        break;
      case 'ranged_attack':
        this.giveSkillXP(playerId, RPGSkill.RANGE, xpAmount);
        this.giveSkillXP(playerId, RPGSkill.CONSTITUTION, Math.floor(xpAmount / 3));
        break;
    }
  }

  private performGatheringAction(playerId: string, action: string): void {
    // Simulate gathering action that should give XP
    this.world.emit(EventType.RESOURCE_ACTION, { playerId, action });
    
    // Give XP based on the gathering action
    const xpAmount = 15; // Base XP per gathering action
    switch (action) {
      case 'cut_tree':
        this.giveSkillXP(playerId, RPGSkill.WOODCUTTING, xpAmount);
        break;
      case 'catch_fish':
        this.giveSkillXP(playerId, RPGSkill.FISHING, xpAmount);
        break;
      case 'light_fire':
        this.giveSkillXP(playerId, RPGSkill.FIREMAKING, xpAmount);
        break;
      case 'cook_food':
        this.giveSkillXP(playerId, RPGSkill.COOKING, xpAmount);
        break;
    }
  }

  private async testEquipmentRequirement(playerId: string, itemId: string): Promise<boolean> {
    // Test if player meets requirements to equip item
    this.world.emit(EventType.EQUIPMENT_CAN_EQUIP, { playerId, itemId });
    
    // Get player skills and check against item requirements
    const skills = await this.getPlayerSkills(playerId);
    
    // Mock item requirements for testing
    const itemRequirements: Record<string, { skill: string; level: number }> = {
      'bronze_sword': { skill: RPGSkill.ATTACK, level: 1 },
      'iron_sword': { skill: RPGSkill.ATTACK, level: 10 },
      'steel_sword': { skill: RPGSkill.ATTACK, level: 20 },
      'mithril_sword': { skill: RPGSkill.ATTACK, level: 30 },
      'adamant_sword': { skill: RPGSkill.ATTACK, level: 40 },
      'rune_sword': { skill: RPGSkill.ATTACK, level: 50 }
    };
    
    const requirement = itemRequirements[itemId];
    if (!requirement) return true; // No requirements
    
    const playerSkillLevel = skills[requirement.skill as keyof PlayerSkills]?.level ?? 1;
    return playerSkillLevel >= requirement.level;
  }

  // Helper method to calculate combat level
  private calculateCombatLevel(stats: LocalStatsComponent): number {
    const attack = (typeof stats.attack === 'object' ? stats.attack?.level : stats.attack) ?? 1;
    const strength = (typeof stats.strength === 'object' ? stats.strength?.level : stats.strength) ?? 1;
    const defense = (typeof stats.defense === 'object' ? stats.defense?.level : stats.defense) ?? 1;
    const constitution = (typeof stats.constitution === 'object' ? stats.constitution?.level : stats.constitution) ?? 10;
    const ranged = (typeof stats.ranged === 'object' ? stats.ranged?.level : stats.ranged) ?? 1;
    
    const combatLevel = (defense + constitution + Math.floor(constitution / 2)) / 4 +
                       Math.max(attack + strength, Math.floor(ranged * 1.5)) / 4;
    return Math.floor(combatLevel);
  }
  
  // Helper method to get XP for a level
  private getXPForLevel(level: number): number {
    if (level <= 1) return 0;
    
    let xp = 0;
    for (let i = 2; i <= level; i++) {
      xp += Math.floor(i + 300 * Math.pow(2, i / 7));
    }
    return Math.floor(xp / 4);
  }

  // Helper method to get stat value from mixed types
  private getStatValue(stat: number | SkillData | undefined): number | SkillData | undefined {
    return stat;
  }

  // Helper method to get skill level from mixed types
  private getSkillLevel(stat: number | SkillData | undefined): number | undefined {
    if (typeof stat === 'number') {
      return stat;
    }
    if (typeof stat === 'object' && stat !== null && 'level' in stat) {
      return stat.level;
    }
    return undefined;
  }

  async getSystemRating(): Promise<string> {
    const allTests = Array.from(this.testStations.values());
    const passedTests = allTests.filter(station => station.status === 'passed').length;
    const totalTests = allTests.length;
    const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    return `Skills System: ${passedTests}/${totalTests} tests passed (${passRate.toFixed(1)}%)`;
  }

  // Empty lifecycle methods removed for cleaner code
}