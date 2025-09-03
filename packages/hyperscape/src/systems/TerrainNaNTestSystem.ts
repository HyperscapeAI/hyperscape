/**
 * Terrain NaN Test System
 * Tests TerrainSystem to ensure proper handling of NaN and invalid position values
 * - Tests terrain height calculation with invalid inputs
 * - Tests player spawning with NaN coordinates
 * - Tests entity positioning validation
 * - Tests ground positioning utilities
 * - Monitors console for NaN terrain errors
 */

import type { World } from '../types';
import { TerrainSystem } from './TerrainSystem';
import { VisualTestFramework } from './VisualTestFramework';
import { fixPositionIfAtGroundLevel } from '../utils/GroundPositioningUtils';
import { EntityManager } from './EntityManager';
import { EventType } from '../types/events';
import { requireSystem } from '../utils/SystemUtils';
import { Logger } from '../utils/Logger';
import type { TerrainNaNTestData } from '../types/validation-types';

export class TerrainNaNTestSystem extends VisualTestFramework {
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
      { x: Number.NaN, z: Number.NaN, label: 'Undefined' },
      { x: Number.NaN, z: Number.NaN, label: 'Null' },
      { x: Infinity, z: -Infinity, label: 'Infinity' },
    ];
    
    for (const testCase of testCases) {
      Logger.system('TerrainNaNTestSystem', `  Testing ${testCase.label}: x=${testCase.x}, z=${testCase.z}`);
      
      const height = this.terrainSystem.getHeightAt(testCase.x, testCase.z);
      
      // Validate output
      if (typeof height !== 'number' || isNaN(height)) {
        testData.errors.push(`getHeightAt returned invalid value for ${testCase.label}: ${height}`);
      } else {
        Logger.system('TerrainNaNTestSystem', `    ✓ Returned valid height: ${height}`);
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
    
    Logger.system('TerrainNaNTestSystem', 'Testing player spawn with NaN coordinates...');
    
    // Create fake player with NaN position
    const playerId = `test_player_nan_${Date.now()}`;
    
    try {
      const player = this.createPlayer({
        id: playerId,
        name: 'NaN Test Player',
        position: { x: Number.NaN, y: Number.NaN, z: Number.NaN }
      });
      
      // Check resulting position
      if (player && player.position) {
        const pos = player.position;
        
        if (typeof pos.x !== 'number' || isNaN(pos.x) ||
            typeof pos.y !== 'number' || isNaN(pos.y) ||
            typeof pos.z !== 'number' || isNaN(pos.z)) {
          testData.errors.push(`Player spawned with invalid position: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
        } else {
          Logger.system('TerrainNaNTestSystem', `  ✓ Player spawned with valid position: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
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
    
    Logger.system('TerrainNaNTestSystem', 'Testing entity spawn with NaN coordinates...');
    
    const entityManager = requireSystem<EntityManager>(this.world, 'rpg-entity-manager');
    
    try {
        const entity = await entityManager.createTestItem({
        id: `test_entity_nan_${Date.now()}`,
        name: 'NaN Test Item',
          position: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
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
          Logger.system('TerrainNaNTestSystem', `  ✓ Entity spawned with valid position: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
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
    
    Logger.system('TerrainNaNTestSystem', 'Testing ground positioning utilities with NaN inputs...');
    
    // Test fixPositionIfAtGroundLevel with various invalid inputs
    const testCases = [
      { pos: { x: Number.NaN, y: 0, z: Number.NaN }, label: 'NaN x,z' },
      { pos: { x: Number.NaN, y: Number.NaN, z: Number.NaN }, label: 'Undefined' },
      { pos: { x: Number.NaN, y: 0, z: Number.NaN }, label: 'Null' },
      { pos: { x: Number.NaN, y: Number.NaN, z: Number.NaN }, label: 'Null object' }
    ];
    
    for (const testCase of testCases) {
      Logger.system('TerrainNaNTestSystem', `  Testing ${testCase.label}...`);
      
      try {
        const fixed = fixPositionIfAtGroundLevel(this.world, testCase.pos, 'player');
        
        if (!fixed || 
            typeof fixed.x !== 'number' || isNaN(fixed.x) ||
            typeof fixed.y !== 'number' || isNaN(fixed.y) ||
            typeof fixed.z !== 'number' || isNaN(fixed.z)) {
          testData.errors.push(`fixPositionIfAtGroundLevel returned invalid position for ${testCase.label}`);
        } else {
          Logger.system('TerrainNaNTestSystem', `    ✓ Returned valid position: x=${fixed.x}, y=${fixed.y}, z=${fixed.z}`);
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
    
    Logger.system('TerrainNaNTestSystem', `[TerrainNaNTestSystem] Test ${testData.testType} completed in ${duration}ms`);
    Logger.system('TerrainNaNTestSystem', `  - NaN inputs detected: ${testData.nanInputsDetected}`);
    Logger.system('TerrainNaNTestSystem', `  - Validated positions: ${testData.validatedPositions.length}`);
    Logger.system('TerrainNaNTestSystem', `  - Errors: ${testData.errors.length}`);
    Logger.system('TerrainNaNTestSystem', `  - Console errors: ${testData.consoleErrors.length}`);
    
    if (testData.errors.length > 0) {
      Logger.systemError('TerrainNaNTestSystem', 'Test errors detected', undefined, { errors: testData.errors });
    }
    
    if (testData.consoleErrors.length > 0) {
      Logger.systemError('TerrainNaNTestSystem', 'Console errors captured', undefined, { consoleErrors: testData.consoleErrors });
    }
    
    if (consoleCaptures.length > 0) {
      Logger.system('TerrainNaNTestSystem', 'Console captures', { consoleCaptures });
    }
    
    // Emit test result event
    const success = testData.errors.length === 0 && testData.consoleErrors.filter(e => e.includes('NaN input to generateNoise')).length === 0;
    this.emitTypedEvent(EventType.TEST_RESULT, {
      system: 'TerrainNaNTestSystem',
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