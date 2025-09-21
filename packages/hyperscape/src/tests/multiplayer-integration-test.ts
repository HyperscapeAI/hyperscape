/**
 * Comprehensive multiplayer integration test
 * Tests the full client-server movement system with prediction and reconciliation
 */

import { chromium, Browser, Page } from 'playwright';
import { NetworkSimulator } from './helpers/NetworkSimulator';
import * as fs from 'fs/promises';
import * as path from 'path';

// Type declarations for window object used in tests
interface TestWindow {
  world?: {
    getSystem(name: string): { getStats?(): unknown } | undefined;
    entities?: {
      player?: {
        position?: { x: number; y: number; z: number };
      };
      players?: Map<string, unknown>;
      items?: Map<string, unknown>;
    };
  };
  consoleLogs?: string[];
  __HYPERSCAPE_WORLD__?: unknown;
}

interface TestConfig {
  serverUrl: string;
  clientCount: number;
  testDuration: number;
  networkConditions: {
    latency: number;
    jitter: number;
    packetLoss: number;
  };
}

interface TestMetrics {
  avgFPS: number;
  avgLatency: number;
  teleportCount: number;
  predictionErrors: number;
  corrections: number;
  bandwidthUsed: number;
  testsPassed: number;
  totalTests: number;
}

class MultiplayerIntegrationTest {
  private browser: Browser | null = null;
  private pages: Page[] = [];
  private networkSimulator: NetworkSimulator;
  private metrics: TestMetrics = {
    avgFPS: 0,
    avgLatency: 0,
    teleportCount: 0,
    predictionErrors: 0,
    corrections: 0,
    bandwidthUsed: 0,
    testsPassed: 0,
    totalTests: 0
  };
  
  constructor(private config: TestConfig) {
    this.networkSimulator = new NetworkSimulator();
  }
  
  async setup(): Promise<void> {
    console.log('🚀 Setting up multiplayer integration test...');
    
    // Launch browser
    this.browser = await chromium.launch({
      headless: false, // Set to true for CI
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Create multiple client pages
    for (let i = 0; i < this.config.clientCount; i++) {
      const page = await this.browser.newPage();
      
      // Set WebSocket URL environment variable before loading page
      await page.addInitScript(() => {
        // The frontend is on port 3333 but WebSocket backend is on 4444
        window.env = {
          PUBLIC_WS_URL: 'ws://localhost:4444/ws'
        };
      });
      
      await page.goto(this.config.serverUrl);
      
      // Wait for game to load
      await page.waitForSelector('canvas', { timeout: 10000 });
      
      // Inject test utilities
      await this.injectTestUtilities(page);
      
      // Wait for WebSocket connection with better debugging
      console.log(`⏳ Waiting for WebSocket connection for client ${i + 1}...`);
      
      // First wait for world to exist
      await page.waitForFunction(
        () => {
          return window.world != null;
        },
        { timeout: 10000 }
      );
      
      // Debug world state
      const worldState = await page.evaluate(() => {
        const ws = window.world?.network?.ws;
        return {
          worldExists: !!window.world,
          networkExists: window.world ? !!window.world.network : false,
          networkType: window.world?.network ? typeof window.world.network : 'none',
          hasWs: window.world?.network ? !!window.world.network.ws : false,
          wsReadyState: ws ? ws.readyState : -1,
          wsStateText: ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState] || 'UNKNOWN' : 'NO_WS',
          hasSocket: window.world?.network ? !!window.world.network.socket : false,
          wsUrl: window.env?.PUBLIC_WS_URL || 'not set'
        };
      });
      console.log(`World state for client ${i + 1}:`, worldState);
      
      // If WebSocket is in CONNECTING state, wait a bit and check again
      if (worldState.wsReadyState === 0) {
        await this.wait(2000);
        const updatedState = await page.evaluate(() => {
          const ws = window.world?.network?.ws;
          return {
            wsReadyState: ws ? ws.readyState : -1,
            wsStateText: ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState] || 'UNKNOWN' : 'NO_WS',
          };
        });
        console.log(`Updated WebSocket state after wait:`, updatedState);
      }
      
      // Then wait for connection
      await page.waitForFunction(
        () => {
          // Check if world exists and has network
          if (!window.world) return false;
          if (!window.world.network) return false;
          
          // Check WebSocket connection state
          // WebSocket.OPEN = 1
          if (window.world.network.ws && window.world.network.ws.readyState === 1) {
            return true;
          }
          
          // Also check for socket property (might be named differently)
          if (window.world.network.socket?.connected === true) {
            return true;
          }
          
          // Check generic connected flag
          if (window.world.network.connected === true) {
            return true;
          }
          
          return false;
        },
        { timeout: 15000 }
      );
      
      // Wait for player entity to be created
      console.log(`⏳ Waiting for player entity for client ${i + 1}...`);
      
      // Debug entities state
      const entitiesState = await page.evaluate(() => {
        const entities = window.world?.entities;
        if (!entities) return { hasEntities: false };
        
        let playerCount = 0;
        let firstPlayerId: string | null = null;
        if (entities.players && entities.players instanceof Map) {
          playerCount = entities.players.size;
          if (playerCount > 0) {
            firstPlayerId = Array.from(entities.players.keys())[0] as string | null;
          }
        }
        
        return {
          hasEntities: true,
          hasPlayer: !!entities.player,
          playerType: entities.player ? typeof entities.player : 'none',
          playersMapSize: playerCount,
          firstPlayerId: firstPlayerId,
          allKeys: Object.keys(entities),
          entityCount: entities.getAll ? entities.getAll().length : -1
        };
      });
      console.log(`Entities state for client ${i + 1}:`, entitiesState);
      
      // If no player entity but players exist in map, use first player for testing
      if (!entitiesState.hasPlayer && entitiesState.playersMapSize && entitiesState.playersMapSize > 0) {
        console.log(`Using first player from players map for client ${i + 1}`);
        await page.evaluate(() => {
          const entities = window.world?.entities;
          if (entities && entities.players && entities.players instanceof Map && entities.players.size > 0) {
            // Get first player from map
            const firstPlayer = Array.from(entities.players.values())[0];
            entities.player = firstPlayer;
            console.log('Set entities.player to first player from map');
          }
        });
      }
      
      // Wait for player (either from initial assignment or our manual set)
      await page.waitForFunction(
        () => {
          return window.world?.entities?.player != null || 
                 (window.world?.entities?.players && window.world.entities.players.size > 0);
        },
        { timeout: 10000 }
      );
      
      this.pages.push(page);
      console.log(`✅ Client ${i + 1} connected and player created`);
    }
    
    // Apply baseline network conditions
    this.networkSimulator.setConditions({
      latency: this.config.networkConditions.latency,
      jitter: this.config.networkConditions.jitter,
      packetLoss: this.config.networkConditions.packetLoss,
      packetDuplication: 0,
      packetReordering: 0,
      bandwidth: 0
    });

    // Give clients time to stabilize
    await this.wait(2000);
  }
  
  async runTests(): Promise<void> {
    console.log('🧪 Running integration tests...');
    
    await this.testBasicMovement();
    await this.testClientPrediction();
    await this.testServerReconciliation();
    await this.testHighLatency();
    await this.testPacketLoss();
    await this.testMultipleClients();
    await this.testAntiCheat();
    await this.testPerformance();
    
    console.log('✅ All tests completed');
  }
  
  /**
   * Test 1: Basic Movement
   */
  async testBasicMovement(): Promise<void> {
    console.log('📍 Test 1: Basic Movement');
    this.metrics.totalTests++;
    
    const page = this.pages[0];
    
    // Get initial position and debug info
    const debugInfo = await page.evaluate(() => {
      const world = window.world;
      const player = world?.entities?.player;
      const hasClientInput = world?.getSystem ? !!world.getSystem('client-input') : false;
      const hasNetwork = !!world?.network;
      const networkConnected = world?.network?.socket?.connected || 
                             world?.network?.ws?.readyState === 1 || // WebSocket.OPEN
                             world?.network?.connected || false;
      
      return {
        worldExists: !!world,
        playerExists: !!player,
        playerType: player ? typeof player : 'none',
        hasPosition: player ? 'position' in player : false,
        hasClientInput,
        hasNetwork,
        networkConnected,
        position: player && player.position ? {
          x: player.position.x,
          y: player.position.y,
          z: player.position.z
        } : null
      };
    });
    
    console.log('Debug info:', debugInfo);
    
    const initialPos = debugInfo.position;
    if (!initialPos) {
      console.error('❌ Could not get player position');
      return;
    }
    
    // Try direct network send first as a debug test
    await page.evaluate(() => {
      const world = window.world;
      if (world?.network?.send) {
        const player = world.entities?.player;
        if (player && player.position) {
          const currentPos = player.position;
                    world.network.send('moveRequest', {
            target: [currentPos.x, currentPos.y, currentPos.z - 20],
            runMode: false
          });
        }
      }
    });
    
    await this.wait(500);
    
    // Also try keyboard input
    console.log('Pressing KeyW...');
    await page.keyboard.down('KeyW');
    await this.wait(1000);
    await page.keyboard.up('KeyW');
    console.log('Released KeyW');
    
    // Wait a bit more for movement to process
    await this.wait(1000);
    
    // Get new position
    const newPos = await page.evaluate(() => {
      const player = window.world?.entities?.player;
      return player ? {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z
      } : null;
    });
    
    if (!newPos) {
      throw new Error('Failed to get new player position after movement');
    }
    
    // Verify movement
    const distance = Math.sqrt(
      Math.pow(newPos.x - initialPos.x, 2) + 
      Math.pow(newPos.z - initialPos.z, 2)
    );
    
    // Check server logs for move request processing
    const moveRequestsReceived = await page.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.consoleLogs?.filter((log: string) => 
        log.includes('onMoveRequest') || log.includes('Setting move target')
      ).length || 0;
    });
    
    if (distance < 1) {
      // Movement failed - gather diagnostic info
      const diagnostics = {
        initialPos,
        newPos,
        expectedMinDistance: 1,
        actualDistance: distance,
        moveRequestsReceived,
        networkConnected: debugInfo.networkConnected,
        hasClientInput: debugInfo.hasClientInput
      };
      
      throw new Error(`Player did not move! Expected movement > 1m but got ${distance.toFixed(2)}m. Diagnostics: ${JSON.stringify(diagnostics, null, 2)}`);
    }
    
    if (distance > 100) {
      throw new Error(`Player teleported too far! Expected movement < 100m but got ${distance.toFixed(2)}m`);
    }
    
    console.log(`✅ Basic movement: Player moved ${distance.toFixed(2)}m`);
    this.metrics.testsPassed++;
  }
  
  /**
   * Test 2: Client Prediction
   */
  async testClientPrediction(): Promise<void> {
    console.log('📍 Test 2: Client Prediction');
    this.metrics.totalTests++;
    
    const page = this.pages[0];
    
    // Set test network conditions
    this.networkSimulator.setConditions({
      latency: this.config.networkConditions.latency,
      jitter: this.config.networkConditions.jitter,
      packetLoss: this.config.networkConditions.packetLoss
    });
    
    // Check prediction system
    const predictionStats = await page.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      const prediction = testWindow.world?.getSystem('client-prediction');
      return prediction?.getStats ? prediction.getStats() : null;
    });
    
    if (!predictionStats) {
      // Client prediction isn't implemented yet - this is expected for now
      console.warn('⚠️ Client prediction system not found (not yet implemented)');
      return; // Skip this test for now
    }
    
    // Move with prediction
    await page.keyboard.down('KeyW');
    await this.wait(500);
    await page.keyboard.up('KeyW');
    
    // Get updated stats
    const newStats = await page.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      const prediction = testWindow.world?.getSystem('client-prediction');
      return prediction?.getStats ? prediction.getStats() : null;
    });
    
    const stats = newStats as { bufferSize?: number; predictionErrors?: number };
    if (stats && stats.bufferSize && stats.bufferSize > 0) {
      console.log(`✅ Client prediction active: ${stats.bufferSize} frames buffered`);
      this.metrics.testsPassed++;
      this.metrics.predictionErrors = stats.predictionErrors || 0;
    } else {
      console.error('❌ Client prediction not working');
    }
    
    // Reset to perfect conditions
    this.networkSimulator.setConditions({
      latency: 0, jitter: 0, packetLoss: 0, packetDuplication: 0, packetReordering: 0, bandwidth: 0
    });
  }
  
  /**
   * Test 3: Server Reconciliation
   */
  async testServerReconciliation(): Promise<void> {
    console.log('📍 Test 3: Server Reconciliation');
    this.metrics.totalTests++;
    
    const page = this.pages[0];
    
    // Force a desync
    await page.evaluate(() => {
      const player = window.world?.entities?.player;
      if (player) {
        // Artificially move player
        player.position.x += 10;
      }
    });
    
    // Wait for reconciliation
    await this.wait(1000);
    
    // Check if corrected
    const correctionStats = await page.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      const prediction = testWindow.world?.getSystem('client-prediction');
      return prediction?.getStats ? prediction.getStats() : null;
    });
    
    const corrStats = correctionStats as { corrections?: number };
    if (corrStats && corrStats.corrections && corrStats.corrections > 0) {
      console.log(`✅ Server reconciliation: ${corrStats.corrections} corrections applied`);
      this.metrics.testsPassed++;
      this.metrics.corrections = corrStats.corrections;
    } else {
      console.error('❌ Server reconciliation not working');
    }
  }
  
  /**
   * Test 4: High Latency
   */
  async testHighLatency(): Promise<void> {
    console.log('📍 Test 4: High Latency (200ms)');
    this.metrics.totalTests++;
    
    const page = this.pages[0];
    
    // Set high latency
    this.networkSimulator.setConditions({ latency: 200 });
    
    // Test movement under high latency
    const _startTime = Date.now();
    await page.keyboard.down('KeyW');
    await this.wait(1000);
    await page.keyboard.up('KeyW');
    
    // Check for smooth movement
    const movementData = await page.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      const player = testWindow.world?.entities?.player;
      const logs = testWindow.consoleLogs || [];
      const teleports = logs.filter(log => log.includes('Teleporting')).length;
      
      return {
        position: player ? player.position : null,
        teleportCount: teleports
      };
    });
    
    if (movementData.teleportCount < 5) {
      console.log(`✅ High latency handling: Only ${movementData.teleportCount} teleports`);
      this.metrics.testsPassed++;
    } else {
      console.error(`❌ Too many teleports under high latency: ${movementData.teleportCount}`);
    }
    
    this.metrics.teleportCount += movementData.teleportCount;
    
    // Reset to perfect conditions
    this.networkSimulator.setConditions({
      latency: 0, jitter: 0, packetLoss: 0, packetDuplication: 0, packetReordering: 0, bandwidth: 0
    });
  }
  
  /**
   * Test 5: Packet Loss
   */
  async testPacketLoss(): Promise<void> {
    console.log('📍 Test 5: Packet Loss (10%)');
    this.metrics.totalTests++;
    
    const page = this.pages[0];
    
    // Set packet loss
    this.networkSimulator.setConditions({ packetLoss: 0.1 });
    
    // Test movement with packet loss
    await page.keyboard.down('KeyW');
    await this.wait(2000);
    await page.keyboard.up('KeyW');
    
    // Check input system stats
    const inputStats = await page.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      const input = testWindow.world?.getSystem('client-input');
      return input?.getStats ? input.getStats() : null;
    });
    
    const inStats = inputStats as { acknowledgmentRate?: number };
    if (inStats && inStats.acknowledgmentRate) {
      const ackRate = inStats.acknowledgmentRate;
      if (ackRate > 0.85) { // Should handle 10% loss well
        console.log(`✅ Packet loss handling: ${(ackRate * 100).toFixed(1)}% acknowledgment rate`);
        this.metrics.testsPassed++;
      } else {
        console.error(`❌ Poor packet loss handling: ${(ackRate * 100).toFixed(1)}% acknowledgment rate`);
      }
    }
    
    // Reset to perfect conditions
    this.networkSimulator.setConditions({
      latency: 0, jitter: 0, packetLoss: 0, packetDuplication: 0, packetReordering: 0, bandwidth: 0
    });
  }
  
  /**
   * Test 6: Multiple Clients
   */
  async testMultipleClients(): Promise<void> {
    if (this.pages.length < 2) {
      console.log('⚠️ Skipping multi-client test (need at least 2 clients)');
      return;
    }
    
    console.log('📍 Test 6: Multiple Clients');
    this.metrics.totalTests++;
    
    // Move both clients
    const movements = this.pages.slice(0, 2).map(async (page, index) => {
      // Move in different directions
      const key = index === 0 ? 'KeyW' : 'KeyS';
      await page.keyboard.down(key);
      await this.wait(1000);
      await page.keyboard.up(key);
    });
    
    await Promise.all(movements);
    
    // Check if clients see each other
    const visibilityData = await this.pages[0].evaluate(() => {
      const testWindow = window as unknown as TestWindow & { world: { entities: { getAll(): unknown[]; player?: unknown } } };
      const entities = testWindow.world.entities;
      let otherPlayers = 0;
      let totalEntities = 0;
      const playerPositions: Array<{ x: number; y: number; z: number }> = [];
      
      const list = entities.getAll();
      for (const entity of list) {
        totalEntities++;
        const e = entity as { type?: string; position?: { x: number; y: number; z: number } };
        if (e.type === 'player') {
          if (entity !== entities.player) {
            otherPlayers++;
          }
          if (e.position) {
            playerPositions.push({ x: e.position.x, y: e.position.y, z: e.position.z });
          }
        }
      }
      
      return {
        otherPlayersVisible: otherPlayers > 0,
        otherPlayerCount: otherPlayers,
        totalEntities,
        playerPositions,
        expectedOtherPlayers: 1 // We expect to see 1 other player in a 2-player test
      };
    });
    
    if (!visibilityData.otherPlayersVisible) {
      throw new Error(`Multiple clients test failed: No other players visible! Expected ${visibilityData.expectedOtherPlayers} but found ${visibilityData.otherPlayerCount}. Total entities: ${visibilityData.totalEntities}`);
    }
    
    if (visibilityData.otherPlayerCount !== visibilityData.expectedOtherPlayers) {
      console.warn(`⚠️ Unexpected player count: Found ${visibilityData.otherPlayerCount} other players, expected ${visibilityData.expectedOtherPlayers}`);
    }
    
    console.log(`✅ Multiple clients: ${visibilityData.otherPlayerCount} other player(s) visible`);
    this.metrics.testsPassed++;
  }
  
  /**
   * Test 7: Anti-Cheat
   */
  async testAntiCheat(): Promise<void> {
    console.log('📍 Test 7: Anti-Cheat');
    this.metrics.totalTests++;
    
    const page = this.pages[0];
    
    // Try to teleport (should be detected)
    const cheatDetected = await page.evaluate(() => {
      const player = window.world?.entities?.player;
      if (!player) {
        throw new Error('No player entity found for anti-cheat test');
      }
      
      // Attempt teleport
      const oldPos = player.position.clone();
      player.position.x += 1000;
      
      // Wait for server correction
      return new Promise(resolve => {
        setTimeout(() => {
          const distance = player.position.distanceTo(oldPos);
          resolve(distance < 100); // Should be corrected back
        }, 1000);
      });
    });
    
    if (!cheatDetected) {
      throw new Error('Anti-cheat failed: Teleport was not detected or corrected by server');
    }
    
    console.log('✅ Anti-cheat: Teleport detected and corrected');
    this.metrics.testsPassed++;
  }
  
  /**
   * Test 8: Performance
   */
  async testPerformance(): Promise<void> {
    console.log('📍 Test 8: Performance');
    this.metrics.totalTests++;
    
    const page = this.pages[0];
    
    // Measure FPS during movement
    const perfData = await page.evaluate(() => {
      return new Promise<{ avgFPS: number; minFPS: number; maxFPS: number }>(resolve => {
        const frames: number[] = [];
        let lastTime = performance.now();
        let frameCount = 0;
        
        const measureFrame = () => {
          const now = performance.now();
          const delta = now - lastTime;
          
          if (delta > 0) {
            frames.push(1000 / delta);
          }
          
          lastTime = now;
          frameCount++;
          
          if (frameCount < 60) {
            requestAnimationFrame(measureFrame);
          } else {
            const avgFPS = frames.reduce((a, b) => a + b, 0) / frames.length;
            const minFPS = Math.min(...frames);
            const maxFPS = Math.max(...frames);
            resolve({
              avgFPS,
              minFPS,
              maxFPS
            });
          }
        };
        
        requestAnimationFrame(measureFrame);
      });
    });
    
    const fps = perfData?.avgFPS || 0;
    this.metrics.avgFPS = fps;
    
    const MIN_ACCEPTABLE_FPS = 30; // Lower threshold for CI environments
    const GOOD_FPS = 50;
    
    if (fps < MIN_ACCEPTABLE_FPS) {
      throw new Error(`Performance test failed: FPS too low! Got ${fps.toFixed(1)} FPS, minimum required is ${MIN_ACCEPTABLE_FPS} FPS. Min: ${perfData.minFPS?.toFixed(1)}, Max: ${perfData.maxFPS?.toFixed(1)}`);
    }
    
    if (fps > GOOD_FPS) {
      console.log(`✅ Performance: Excellent - ${fps.toFixed(1)} FPS average`);
    } else {
      console.log(`⚠️ Performance: Acceptable - ${fps.toFixed(1)} FPS average (above minimum ${MIN_ACCEPTABLE_FPS} FPS)`);
    }
    this.metrics.testsPassed++;
  }
  
  /**
   * Inject test utilities into page
   */
  private async injectTestUtilities(page: Page): Promise<void> {
    await page.evaluate(() => {
      const testWindow = window as unknown as TestWindow & { __HYPERSCAPE_WORLD__?: unknown };
      // Store console logs
      testWindow.consoleLogs = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        testWindow.consoleLogs!.push(args.join(' '));
        originalLog.apply(console, args);
      };
      
      // Expose world for testing - the client sets window.world directly
      // Check both possible locations
      const checkWorld = setInterval(() => {
        const world = (window as any).world || testWindow.__HYPERSCAPE_WORLD__;
        if (world) {
          testWindow.world = world as TestWindow['world'];
                    clearInterval(checkWorld);
        }
      }, 100);
    });
  }
  
  /**
   * Helper to wait
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Generate report
   */
  async generateReport(): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      config: this.config,
      metrics: this.metrics,
      successRate: (this.metrics.testsPassed / this.metrics.totalTests) * 100,
      status: this.metrics.testsPassed === this.metrics.totalTests ? 'PASSED' : 'FAILED'
    };
    
    // Console output
    console.log('\n' + '='.repeat(60));
    console.log('📊 MULTIPLAYER INTEGRATION TEST REPORT');
    console.log('='.repeat(60));
    console.log(`⏰ Timestamp: ${report.timestamp}`);
    console.log(`🎮 Clients: ${this.config.clientCount}`);
    console.log(`🌐 Network: ${this.config.networkConditions.latency}ms latency, ${this.config.networkConditions.packetLoss * 100}% loss`);
    console.log('-'.repeat(60));
    console.log(`✅ Tests Passed: ${this.metrics.testsPassed}/${this.metrics.totalTests}`);
    console.log(`📈 Success Rate: ${report.successRate.toFixed(1)}%`);
    console.log(`🎯 FPS: ${this.metrics.avgFPS.toFixed(1)}`);
    console.log(`📡 Latency: ${this.metrics.avgLatency.toFixed(1)}ms`);
    console.log(`⚡ Teleports: ${this.metrics.teleportCount}`);
    console.log(`🔧 Corrections: ${this.metrics.corrections}`);
    console.log(`❌ Prediction Errors: ${this.metrics.predictionErrors}`);
    console.log('-'.repeat(60));
    console.log(`📋 Status: ${report.status}`);
    console.log('='.repeat(60));
    
    // Save to file
    const reportPath = path.join(process.cwd(), 'test-results', 'multiplayer-integration-report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📁 Report saved to: ${reportPath}`);
  }
  
  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up...');
    
    for (const page of this.pages) {
      await page.close();
    }
    
    if (this.browser) {
      await this.browser.close();
    }
    
    console.log('✅ Cleanup complete');
  }
  
  /**
   * Run full test suite
   */
  async run(): Promise<boolean> {
    try {
      await this.setup();
      await this.runTests();
      await this.generateReport();
      
      const allPassed = this.metrics.testsPassed === this.metrics.totalTests;
      if (!allPassed) {
        const failedCount = this.metrics.totalTests - this.metrics.testsPassed;
        throw new Error(`${failedCount} test(s) failed! See report above for details.`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      if (error instanceof Error) {
        console.error('Stack trace:', error.stack);
      }
      
      // Generate report even on failure to show partial results
      try {
        await this.generateReport();
      } catch (reportError) {
        console.error('Failed to generate report:', reportError);
      }
      
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

/**
 * Main entry point
 */
export async function runMultiplayerIntegrationTest(): Promise<void> {
  const config: TestConfig = {
    serverUrl: process.env.SERVER_URL || 'http://localhost:3333',
    clientCount: parseInt(process.env.CLIENT_COUNT || '2'),
    testDuration: parseInt(process.env.TEST_DURATION || '30'),
    networkConditions: {
      latency: parseInt(process.env.LATENCY || '50'),
      jitter: parseInt(process.env.JITTER || '10'),
      packetLoss: parseFloat(process.env.PACKET_LOSS || '0.02')
    }
  };
  
  console.log('🚀 Starting Multiplayer Integration Test');
  console.log('Configuration:', config);
  
  const test = new MultiplayerIntegrationTest(config);
  const success = await test.run();
  
  process.exit(success ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMultiplayerIntegrationTest().catch(console.error);
}
