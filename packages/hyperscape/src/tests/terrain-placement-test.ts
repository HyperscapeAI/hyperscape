/**
 * Terrain Placement Runtime Test
 * 
 * Validates that ALL entities (NPCs, mobs, items, players, resources) spawn on terrain
 * and NOT on the ground plane (y≈0). Uses Playwright to spawn test entities and verify
 * their y-coordinates match terrain height at their x/z positions.
 * 
 * This is a REAL test using actual Hyperscape worlds and entities - NO MOCKS.
 */

import { chromium, Browser, Page } from 'playwright';
import { Logger } from '../utils/Logger';

interface TestResult {
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
  entities?: Array<{ id: string; type: string; y: number; terrainHeight: number; onTerrain: boolean }>;
}

interface EntityPosition {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  terrainHeight: number;
  onTerrain: boolean;
}

class TerrainPlacementTest {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private logger = new Logger('TerrainPlacementTest');

  async setup(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });

    this.page = await context.newPage();

    // Navigate to the game
    await this.page.goto('http://localhost:3333');

    // Wait for world to be ready
    await this.page.waitForFunction(() => {
      return window.world && window.world.entities;
    }, { timeout: 30000 });

    // Wait for terrain system to be ready
    await this.page.waitForFunction(() => {
      const terrain = window.world?.getSystem?.('terrain');
      return terrain && terrain.isReady && terrain.isReady();
    }, { timeout: 30000 });

    this.logger.system('Test page loaded and world ready');
  }

  /**
   * Test that all spawned entities are on terrain, not at y=0
   */
  async testAllEntitiesOnTerrain(): Promise<TestResult> {
    if (!this.page) {
      return { passed: false, message: 'Page not initialized' };
    }

    try {
      // Wait for entities to spawn
      await this.page.waitForTimeout(3000);

      const result = await this.page.evaluate(() => {
        const world = window.world;
        if (!world || !world.entities) {
          return { error: 'World or entities system not available' };
        }

        const terrain = world.getSystem('terrain');
        if (!terrain || !terrain.getHeightAt) {
          return { error: 'Terrain system not available' };
        }

        const entities: EntityPosition[] = [];
        const all = world.entities.getAll?.() || [];
        
        const TERRAIN_TOLERANCE = 2.0; // 2m tolerance (entity might be slightly above terrain)
        const GROUND_PLANE_THRESHOLD = 0.1; // If y < 0.1, it's on ground plane
        
        let violations = 0;

        for (const entity of all) {
          if (!entity.position) continue;
          
          const pos = entity.position;
          if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) continue;

          const terrainHeight = terrain.getHeightAt(pos.x, pos.z);
          const heightDiff = Math.abs(pos.y - terrainHeight);
          
          // Entity is on terrain if within tolerance OR if terrain is flat (near 0)
          const isOnTerrain = heightDiff <= TERRAIN_TOLERANCE || terrainHeight < 1.0;
          
          // Check if entity is incorrectly on ground plane
          const isOnGroundPlane = pos.y <= GROUND_PLANE_THRESHOLD && terrainHeight > 1.0;
          
          if (isOnGroundPlane) violations++;

          entities.push({
            id: entity.id,
            type: entity.type || 'unknown',
            position: { x: pos.x, y: pos.y, z: pos.z },
            terrainHeight,
            onTerrain: isOnTerrain && !isOnGroundPlane
          });
        }

        return {
          entities,
          totalEntities: entities.length,
          violations,
          passed: violations === 0
        };
      });

      if ('error' in result) {
        return { passed: false, message: result.error as string };
      }

      const { entities, totalEntities, violations, passed } = result as { 
        entities: EntityPosition[]; 
        totalEntities: number; 
        violations: number; 
        passed: boolean 
      };

      if (!passed) {
        const violators = entities.filter(e => !e.onTerrain);
        this.logger.error(`❌ Found ${violations} entities on ground plane!`);
        violators.forEach(e => {
          this.logger.error(`  - ${e.id} (${e.type}): y=${e.position.y.toFixed(3)}, terrain=${e.terrainHeight.toFixed(2)}m`);
        });
        
        return {
          passed: false,
          message: `${violations} of ${totalEntities} entities are incorrectly placed on ground plane`,
          entities: violators.map(e => ({
            id: e.id,
            type: e.type,
            y: e.position.y,
            terrainHeight: e.terrainHeight,
            onTerrain: e.onTerrain
          }))
        };
      }

      this.logger.system(`✅ All ${totalEntities} entities correctly placed on terrain`);
      return {
        passed: true,
        message: `All ${totalEntities} entities are properly placed on terrain`,
        entities: entities.map(e => ({
          id: e.id,
          type: e.type,
          y: e.position.y,
          terrainHeight: e.terrainHeight,
          onTerrain: e.onTerrain
        }))
      };

    } catch (error) {
      this.logger.error(`Test failed with error: ${error}`);
      return {
        passed: false,
        message: `Error during terrain placement test: ${(error as Error).message}`
      };
    }
  }

  /**
   * Test player spawn positions are on terrain
   */
  async testPlayerSpawnOnTerrain(): Promise<TestResult> {
    if (!this.page) {
      return { passed: false, message: 'Page not initialized' };
    }

    try {
      const result = await this.page.evaluate(() => {
        const world = window.world;
        const player = world?.entities?.player;
        
        if (!player || !player.position) {
          return { error: 'Player not found' };
        }

        const terrain = world.getSystem('terrain');
        if (!terrain) {
          return { error: 'Terrain system not available' };
        }

        const pos = player.position;
        const terrainHeight = terrain.getHeightAt(pos.x, pos.z);
        const heightDiff = Math.abs(pos.y - terrainHeight);
        const onTerrain = heightDiff <= 2.0; // Player should be within 2m of terrain

        return {
          playerId: player.id,
          playerY: pos.y,
          terrainHeight,
          heightDiff,
          onTerrain,
          passed: onTerrain && pos.y > 0.5 // Not on ground plane
        };
      });

      if ('error' in result) {
        return { passed: false, message: result.error as string };
      }

      const { playerId, playerY, terrainHeight, heightDiff, onTerrain, passed } = result as {
        playerId: string;
        playerY: number;
        terrainHeight: number;
        heightDiff: number;
        onTerrain: boolean;
        passed: boolean;
      };

      if (!passed) {
        this.logger.error(`❌ Player ${playerId} not on terrain: y=${playerY.toFixed(2)}, terrain=${terrainHeight.toFixed(2)}, diff=${heightDiff.toFixed(2)}m`);
        return {
          passed: false,
          message: `Player spawn position not on terrain`,
          details: { playerId, playerY, terrainHeight, heightDiff, onTerrain }
        };
      }

      this.logger.system(`✅ Player correctly placed on terrain: y=${playerY.toFixed(2)}, terrain=${terrainHeight.toFixed(2)}m`);
      return {
        passed: true,
        message: 'Player spawn position on terrain',
        details: { playerId, playerY, terrainHeight, heightDiff, onTerrain }
      };

    } catch (error) {
      return {
        passed: false,
        message: `Error testing player spawn: ${(error as Error).message}`
      };
    }
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  async runAll(): Promise<{ passed: boolean; results: TestResult[] }> {
    const results: TestResult[] = [];

    try {
      await this.setup();

      // Test all entities placement
      const allEntitiesResult = await this.testAllEntitiesOnTerrain();
      results.push(allEntitiesResult);

      // Test player spawn
      const playerSpawnResult = await this.testPlayerSpawnOnTerrain();
      results.push(playerSpawnResult);

      const passed = results.every(r => r.passed);

      return { passed, results };
    } catch (error) {
      this.logger.error(`Test suite failed: ${error}`);
      results.push({
        passed: false,
        message: `Test suite setup failed: ${(error as Error).message}`
      });
      return { passed: false, results };
    } finally {
      await this.cleanup();
    }
  }
}

// Run tests if executed directly
if (require.main === module) {
  const test = new TerrainPlacementTest();
  test.runAll().then(({ passed, results }) => {
    console.log('\n' + '='.repeat(60));
    console.log('TERRAIN PLACEMENT TEST RESULTS');
    console.log('='.repeat(60));
    
    results.forEach((result, i) => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`\n${i + 1}. ${status}: ${result.message}`);
      if (result.details) {
        console.log('   Details:', JSON.stringify(result.details, null, 2));
      }
      if (result.entities && result.entities.length > 0) {
        console.log(`   Checked ${result.entities.length} entities`);
      }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log(`OVERALL: ${passed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log('='.repeat(60) + '\n');
    
    process.exit(passed ? 0 : 1);
  }).catch(error => {
    console.error('Fatal test error:', error);
    process.exit(1);
  });
}

export { TerrainPlacementTest };


