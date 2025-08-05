/**
 * RPG Terrain NaN Test System
 * Tests TerrainSystem to ensure proper handling of NaN and invalid position values
 * - Tests terrain height calculation with invalid inputs
 * - Tests player spawning with NaN coordinates
 * - Tests entity positioning validation
 * - Tests ground positioning utilities
 * - Monitors console for NaN terrain errors
 */

import type { World } from '../../types';
import { TerrainSystem } from '../../core/systems/TerrainSystem';
import { RPGVisualTestFramework } from './RPGVisualTestFramework';
import { fixPositionIfAtGroundLevel } from '../../core/utils/GroundPositioningUtils';
import { RPGEntityManager } from './RPGEntityManager';
import { EventType } from '../../types/events';
import { requireSystem } from '../../core/utils/SystemUtils';
import { RPGLogger } from '../utils/RPGLogger';

interface TerrainNaNTestData {
  testType: 'terrain_getHeightAt' | 'player_spawn' | 'entity_spawn' | 'ground_positioning' | 'comprehensive';
  startTime: number;
  nanInputsDetected: number;
  validatedPositions: Array<{ input: { x: number; y: number; z: number }; output: { x: number; y: number; z: number } }>;
  errors: string[];
  consoleErrors: string[];
}

export class RPGTerrainNaNTestSystem extends RPGVisualTestFramework {
  private testData = new Map<string, TerrainNaNTestData>();
  private terrainSystem!: TerrainSystem;

  constructor(world: World) {
    super(world);
  }

  async init(): Promise<void> {
    await super.init();
    
    this.terrainSystem = requireSystem<TerrainSystem>(this.world, 'terrain');
    
    // Create test stations for each test type
    this.createTestStation({
      id: 'terrain-nan-getheightat',
      name: 'Test getHeightAt NaN',
      position: { x: -50, y: 0, z: -50 },
      timeoutMs: 10000
    });
    
    this.createTestStation({
      id: 'terrain-nan-player-spawn',
      name: 'Test Player Spawn NaN',
      position: { x: -50, y: 0, z: -40 },
      timeoutMs: 10000
    });
    
    this.createTestStation({
      id: 'terrain-nan-entity-spawn',
      name: 'Test Entity Spawn NaN',
      position: { x: -50, y: 0, z: -30 },
      timeoutMs: 10000
    });
    
    this.createTestStation({
      id: 'terrain-nan-ground-positioning',
      name: 'Test Ground Positioning',
      position: { x: -50, y: 0, z: -20 },
      timeoutMs: 10000
    });
  }



  protected async runTest(stationId: string): Promise<void> {
    switch (stationId) {
      case 'terrain-nan-getheightat':
        await this.testGetHeightAtNaN();
        break;
      case 'terrain-nan-player-spawn':
        await this.testPlayerSpawnNaN();
        break;
      case 'terrain-nan-entity-spawn':
        await this.testEntitySpawnNaN();
        break;
      case 'terrain-nan-ground-positioning':
        await this.testGroundPositioning();
        break;
      default:
        this.failTest(stationId, `Unknown test station: ${stationId}`);
    }
  }
  
  protected cleanupTest(stationId: string): void {
    // Clean up any test data for the station
    const testData = Array.from(this.testData.entries()).find(([_, data]) => data.testType === stationId);
    if (testData) {
      this.testData.delete(testData[0]);
    }
  }

  private async testGetHeightAtNaN(): Promise<void> {
    const testId = `terrain_nan_${Date.now()}`;
    const testData: TerrainNaNTestData = {
      testType: 'terrain_getHeightAt',
      startTime: Date.now(),
      nanInputsDetected: 0,
      validatedPositions: [],
      errors: [],
      consoleErrors: []
    };
    
    this.testData.set(testId, testData);
    
    // Test various invalid inputs
    const testCases = [
      { x: NaN, z: 10, label: 'NaN x' },
      { x: 10, z: NaN, label: 'NaN z' },
      { x: NaN, z: NaN, label: 'Both NaN' },
      { x: undefined as unknown as number, z: undefined as unknown as number, label: 'Undefined' },
      { x: null as unknown as number, z: null as unknown as number, label: 'Null' },
      { x: Infinity, z: -Infinity, label: 'Infinity' },
    ];
    
    for (const testCase of testCases) {
      RPGLogger.system('RPGTerrainNaNTestSystem', `  Testing ${testCase.label}: x=${testCase.x}, z=${testCase.z}`);
      
      const height = this.terrainSystem.getHeightAt(testCase.x, testCase.z);
      
      // Validate output
      if (typeof height !== 'number' || isNaN(height)) {
        testData.errors.push(`getHeightAt returned invalid value for ${testCase.label}: ${height}`);
      } else {
        RPGLogger.system('RPGTerrainNaNTestSystem', `    ✓ Returned valid height: ${height}`);
      }
      
      testData.validatedPositions.push({
        input: { x: testCase.x, y: 0, z: testCase.z },
        output: { x: testCase.x, y: height, z: testCase.z }
      });
    }
    
    this.completeTest(testId);
    
    // Report test result to framework
    if (testData.errors.length === 0) {
      this.passTest('terrain-nan-getheightat', {
        validatedPositions: testData.validatedPositions.length,
        nanInputsDetected: testData.nanInputsDetected
      });
    } else {
      this.failTest('terrain-nan-getheightat', testData.errors[0]);
    }
  }

  private async testPlayerSpawnNaN(): Promise<void> {
    const testId = `player_spawn_nan_${Date.now()}`;
    const testData: TerrainNaNTestData = {
      testType: 'player_spawn',
      startTime: Date.now(),
      nanInputsDetected: 0,
      validatedPositions: [],
      errors: [],
      consoleErrors: []
    };
    
    this.testData.set(testId, testData);
    this.startConsoleCapture(testId);
    
    RPGLogger.system('RPGTerrainNaNTestSystem', 'Testing player spawn with NaN coordinates...');
    
    // Create fake player with NaN position
    const playerId = `test_player_nan_${Date.now()}`;
    
    try {
      const player = this.createPlayer({
        id: playerId,
        name: 'NaN Test Player',
        position: { x: NaN, y: NaN, z: NaN }
      });
      
      // Check resulting position
      if (player && player.position) {
        const pos = player.position;
        
        if (typeof pos.x !== 'number' || isNaN(pos.x) ||
            typeof pos.y !== 'number' || isNaN(pos.y) ||
            typeof pos.z !== 'number' || isNaN(pos.z)) {
          testData.errors.push(`Player spawned with invalid position: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
        } else {
          RPGLogger.system('RPGTerrainNaNTestSystem', `  ✓ Player spawned with valid position: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
          testData.validatedPositions.push({
            input: { x: NaN, y: NaN, z: NaN },
            output: pos
          });
        }
      }
    } catch (error) {
      testData.errors.push(`Failed to spawn player with NaN position: ${error}`);
    }
    
    this.completeTest(testId);
    
    // Report test result to framework
    if (testData.errors.length === 0) {
      this.passTest('terrain-nan-player-spawn', {
        validatedPositions: testData.validatedPositions.length,
        nanInputsDetected: testData.nanInputsDetected
      });
    } else {
      this.failTest('terrain-nan-player-spawn', testData.errors[0]);
    }
  }

  private async testEntitySpawnNaN(): Promise<void> {
    const testId = `entity_spawn_nan_${Date.now()}`;
    const testData: TerrainNaNTestData = {
      testType: 'entity_spawn',
      startTime: Date.now(),
      nanInputsDetected: 0,
      validatedPositions: [],
      errors: [],
      consoleErrors: []
    };
    
    this.testData.set(testId, testData);
    this.startConsoleCapture(testId);
    
    RPGLogger.system('RPGTerrainNaNTestSystem', 'Testing entity spawn with NaN coordinates...');
    
    const entityManager = requireSystem<RPGEntityManager>(this.world, 'rpg-entity-manager');
    
    try {
      const entity = await entityManager.createTestItem({
        id: `test_entity_nan_${Date.now()}`,
        name: 'NaN Test Item',
        position: { x: NaN, y: NaN, z: NaN },
        itemId: 'test-item',
        quantity: 1
      });
      
      if (entity && entity.position) {
        const pos = entity.position;
        
        if (typeof pos.x !== 'number' || isNaN(pos.x) ||
            typeof pos.y !== 'number' || isNaN(pos.y) ||
            typeof pos.z !== 'number' || isNaN(pos.z)) {
          testData.errors.push(`Entity spawned with invalid position: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
        } else {
          RPGLogger.system('RPGTerrainNaNTestSystem', `  ✓ Entity spawned with valid position: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
          testData.validatedPositions.push({
            input: { x: NaN, y: NaN, z: NaN },
            output: { x: pos.x, y: pos.y, z: pos.z }
          });
        }
        
        // Clean up entity
        entityManager.destroyEntity(entity.id);
      }
    } catch (error) {
      testData.errors.push(`Failed to spawn entity with NaN position: ${error}`);
    }
    
    this.completeTest(testId);
    
    // Report test result to framework
    if (testData.errors.length === 0) {
      this.passTest('terrain-nan-entity-spawn', {
        validatedPositions: testData.validatedPositions.length,
        nanInputsDetected: testData.nanInputsDetected
      });
    } else {
      this.failTest('terrain-nan-entity-spawn', testData.errors[0]);
    }
  }

  private async testGroundPositioning(): Promise<void> {
    const testId = `ground_positioning_${Date.now()}`;
    const testData: TerrainNaNTestData = {
      testType: 'ground_positioning',
      startTime: Date.now(),
      nanInputsDetected: 0,
      validatedPositions: [],
      errors: [],
      consoleErrors: []
    };
    
    this.testData.set(testId, testData);
    this.startConsoleCapture(testId);
    
    RPGLogger.system('RPGTerrainNaNTestSystem', 'Testing ground positioning utilities with NaN inputs...');
    
    // Test fixPositionIfAtGroundLevel with various invalid inputs
    const testCases = [
      { pos: { x: NaN, y: 0, z: NaN }, label: 'NaN x,z' },
      { pos: { x: undefined as unknown as number, y: undefined as unknown as number, z: undefined as unknown as number }, label: 'Undefined' },
      { pos: { x: null as unknown as number, y: 0, z: null as unknown as number }, label: 'Null' },
      { pos: null as unknown as { x: number; y: number; z: number }, label: 'Null object' }
    ];
    
    for (const testCase of testCases) {
      RPGLogger.system('RPGTerrainNaNTestSystem', `  Testing ${testCase.label}...`);
      
      try {
        const fixed = fixPositionIfAtGroundLevel(this.world, testCase.pos, 'player');
        
        if (!fixed || 
            typeof fixed.x !== 'number' || isNaN(fixed.x) ||
            typeof fixed.y !== 'number' || isNaN(fixed.y) ||
            typeof fixed.z !== 'number' || isNaN(fixed.z)) {
          testData.errors.push(`fixPositionIfAtGroundLevel returned invalid position for ${testCase.label}`);
        } else {
          RPGLogger.system('RPGTerrainNaNTestSystem', `    ✓ Returned valid position: x=${fixed.x}, y=${fixed.y}, z=${fixed.z}`);
          testData.validatedPositions.push({
            input: testCase.pos || { x: 0, y: 0, z: 0 },
            output: fixed
          });
        }
      } catch (error) {
        testData.errors.push(`fixPositionIfAtGroundLevel threw error for ${testCase.label}: ${error}`);
      }
    }
    
    this.completeTest(testId);
    
    // Report test result to framework
    if (testData.errors.length === 0) {
      this.passTest('terrain-nan-ground-positioning', {
        validatedPositions: testData.validatedPositions.length,
        nanInputsDetected: testData.nanInputsDetected
      });
    } else {
      this.failTest('terrain-nan-ground-positioning', testData.errors[0]);
    }
  }

  private completeTest(testId: string): void {
    const testData = this.testData.get(testId);
    if (!testData) return;
    
    const duration = Date.now() - testData.startTime;
    const consoleCaptures = this.getConsoleCaptures(testId);
    
    RPGLogger.system('RPGTerrainNaNTestSystem', `[RPGTerrainNaNTestSystem] Test ${testData.testType} completed in ${duration}ms`);
    RPGLogger.system('RPGTerrainNaNTestSystem', `  - NaN inputs detected: ${testData.nanInputsDetected}`);
    RPGLogger.system('RPGTerrainNaNTestSystem', `  - Validated positions: ${testData.validatedPositions.length}`);
    RPGLogger.system('RPGTerrainNaNTestSystem', `  - Errors: ${testData.errors.length}`);
    RPGLogger.system('RPGTerrainNaNTestSystem', `  - Console errors: ${testData.consoleErrors.length}`);
    
    if (testData.errors.length > 0) {
      RPGLogger.systemError('RPGTerrainNaNTestSystem', 'Test errors detected', undefined, { errors: testData.errors });
    }
    
    if (testData.consoleErrors.length > 0) {
      RPGLogger.systemError('RPGTerrainNaNTestSystem', 'Console errors captured', undefined, { consoleErrors: testData.consoleErrors });
    }
    
    if (consoleCaptures.length > 0) {
      RPGLogger.system('RPGTerrainNaNTestSystem', 'Console captures', { consoleCaptures });
    }
    
    // Emit test result event
    const success = testData.errors.length === 0 && testData.consoleErrors.filter(e => e.includes('NaN input to generateNoise')).length === 0;
    this.world.emit(EventType.TEST_RESULT, {
      system: 'RPGTerrainNaNTestSystem',
      testType: testData.testType,
      success,
      duration,
      details: {
        nanInputsDetected: testData.nanInputsDetected,
        validatedPositions: testData.validatedPositions.length,
        errors: testData.errors,
        consoleErrors: testData.consoleErrors
      }
    });
    
    // Clean up
    this.testData.delete(testId);
    this.stopConsoleCapture(testId);
  }

  update(_deltaTime: number): void {
    // No regular updates needed
  }
}