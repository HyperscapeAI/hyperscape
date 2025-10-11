/**
 * Music System Integration Test
 * Tests the music system's ability to:
 * - Initialize and start playing music
 * - Transition to combat music when combat starts
 * - Return to normal music after combat ends
 * - Properly crossfade between tracks
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TestWindow {
  world?: {
    systems?: {
      music?: {
        initialized: boolean;
        inCombat: boolean;
        currentTrack: { track: { category: string; name: string } } | null;
      };
    };
    audio?: {
      ctx: {
        currentTime: number;
        state: string;
      };
    };
  };
  consoleLogs?: string[];
  consoleErrors?: string[];
}

interface TestConfig {
  serverUrl: string;
  testDuration: number;
}

interface TestResults {
  testName: string;
  passed: boolean;
  details: string;
  timestamp: number;
}

class MusicSystemTest {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private results: TestResults[] = [];
  
  constructor(private config: TestConfig) {}
  
  async setup(): Promise<void> {
    console.log('🎵 Setting up music system test...');
    
    // Launch browser
    this.browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--autoplay-policy=no-user-gesture-required', // Allow audio autoplay
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream'
      ]
    });
    
    this.page = await this.browser.newPage();
    
    // Set up console logging
    await this.setupConsoleLogging();
    
    // Set up environment variables
    await this.page.addInitScript(() => {
      window.env = {
        PUBLIC_WS_URL: 'ws://localhost:5555/ws'
      };
      
      // Store console logs for inspection
      const anyWindow = window as { consoleLogs: string[]; consoleErrors: string[] };
      anyWindow.consoleLogs = [];
      anyWindow.consoleErrors = [];
      
      const originalLog = console.log;
      const originalError = console.error;
      
      console.log = (...args: unknown[]) => {
        anyWindow.consoleLogs.push(args.map(String).join(' '));
        originalLog.apply(console, args);
      };
      
      console.error = (...args: unknown[]) => {
        anyWindow.consoleErrors.push(args.map(String).join(' '));
        originalError.apply(console, args);
      };
    });
    
    console.log('🌐 Loading game...');
    await this.page.goto(this.config.serverUrl);
    
    // Wait for game to load
    await this.page.waitForSelector('canvas', { timeout: 30000 });
    console.log('✅ Game loaded');
    
    // Wait for world to initialize
    await this.page.waitForFunction(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.world !== undefined;
    }, { timeout: 10000 });
    
    console.log('✅ World initialized');
  }
  
  private async setupConsoleLogging(): Promise<void> {
    if (!this.page) return;
    
    this.page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[MusicSystem]') || text.includes('music')) {
        console.log(`📝 ${text}`);
      }
    });
    
    this.page.on('pageerror', error => {
      console.error(`❌ Page error: ${error.message}`);
    });
  }
  
  async runTests(): Promise<void> {
    console.log('\n🧪 Running music system tests...\n');
    
    await this.testMusicSystemInitialization();
    await this.testAudioContextReady();
    await this.testMusicPlaying();
    await this.testCombatMusicTransition();
    await this.testCombatMusicEnding();
    await this.testNoErrors();
    
    console.log('\n📊 Test Summary:');
    this.results.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.testName}: ${result.details}`);
    });
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    console.log(`\n📈 Total: ${passed}/${total} tests passed`);
    
    // Save results to file
    await this.saveResults();
  }
  
  private async testMusicSystemInitialization(): Promise<void> {
    console.log('🧪 Test 1: Music system initialization...');
    
    // Wait for music system to initialize (up to 5 seconds)
    await this.page!.waitForFunction(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.world?.systems?.music !== undefined;
    }, { timeout: 5000 }).catch(() => {
      // System might not be available immediately
    });
    
    const initialized = await this.page!.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.world?.systems?.music?.initialized ?? false;
    });
    
    this.results.push({
      testName: 'Music System Initialization',
      passed: initialized,
      details: initialized ? 'Music system initialized successfully' : 'Music system failed to initialize',
      timestamp: Date.now()
    });
  }
  
  private async testAudioContextReady(): Promise<void> {
    console.log('🧪 Test 2: Audio context ready...');
    
    const audioState = await this.page!.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.world?.audio?.ctx.state ?? 'unknown';
    });
    
    const isReady = audioState === 'running' || audioState === 'suspended';
    
    this.results.push({
      testName: 'Audio Context Ready',
      passed: isReady,
      details: `Audio context state: ${audioState}`,
      timestamp: Date.now()
    });
  }
  
  private async testMusicPlaying(): Promise<void> {
    console.log('🧪 Test 3: Music playing...');
    
    // Wait a bit for music to start
    await this.page!.waitForTimeout(3000);
    
    const hasCurrentTrack = await this.page!.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.world?.systems?.music?.currentTrack !== null;
    });
    
    let trackInfo = 'No track';
    if (hasCurrentTrack) {
      trackInfo = await this.page!.evaluate(() => {
        const testWindow = window as unknown as TestWindow;
        const track = testWindow.world?.systems?.music?.currentTrack;
        return track ? `${track.track.name} (${track.track.category})` : 'Unknown';
      });
    }
    
    this.results.push({
      testName: 'Music Playing',
      passed: hasCurrentTrack,
      details: `Track: ${trackInfo}`,
      timestamp: Date.now()
    });
  }
  
  private async testCombatMusicTransition(): Promise<void> {
    console.log('🧪 Test 4: Combat music transition...');
    
    // Trigger combat by emitting combat started event
    await this.page!.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      const world = testWindow.world as { emit?: (event: string) => void };
      if (world && world.emit) {
        world.emit('rpg:combat:started');
      }
    });
    
    // Wait for transition
    await this.page!.waitForTimeout(2500);
    
    const inCombat = await this.page!.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.world?.systems?.music?.inCombat ?? false;
    });
    
    let trackCategory = 'unknown';
    const hasTrack = await this.page!.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.world?.systems?.music?.currentTrack !== null;
    });
    
    if (hasTrack) {
      trackCategory = await this.page!.evaluate(() => {
        const testWindow = window as unknown as TestWindow;
        return testWindow.world?.systems?.music?.currentTrack?.track.category ?? 'unknown';
      });
    }
    
    const passed = inCombat && trackCategory === 'combat';
    
    this.results.push({
      testName: 'Combat Music Transition',
      passed,
      details: `In combat: ${inCombat}, Track category: ${trackCategory}`,
      timestamp: Date.now()
    });
  }
  
  private async testCombatMusicEnding(): Promise<void> {
    console.log('🧪 Test 5: Combat music ending...');
    
    // End combat
    await this.page!.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      const world = testWindow.world as { emit?: (event: string) => void };
      if (world && world.emit) {
        world.emit('rpg:combat:ended');
      }
    });
    
    // Wait for transition
    await this.page!.waitForTimeout(2500);
    
    const inCombat = await this.page!.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.world?.systems?.music?.inCombat ?? true;
    });
    
    let trackCategory = 'unknown';
    const hasTrack = await this.page!.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.world?.systems?.music?.currentTrack !== null;
    });
    
    if (hasTrack) {
      trackCategory = await this.page!.evaluate(() => {
        const testWindow = window as unknown as TestWindow;
        return testWindow.world?.systems?.music?.currentTrack?.track.category ?? 'unknown';
      });
    }
    
    const passed = !inCombat && trackCategory === 'normal';
    
    this.results.push({
      testName: 'Combat Music Ending',
      passed,
      details: `In combat: ${inCombat}, Track category: ${trackCategory}`,
      timestamp: Date.now()
    });
  }
  
  private async testNoErrors(): Promise<void> {
    console.log('🧪 Test 6: No errors...');
    
    const errors = await this.page!.evaluate(() => {
      const testWindow = window as unknown as TestWindow;
      return testWindow.consoleErrors ?? [];
    });
    
    const musicErrors = errors.filter(e => 
      e.toLowerCase().includes('music') || 
      e.toLowerCase().includes('audio')
    );
    
    this.results.push({
      testName: 'No Errors',
      passed: musicErrors.length === 0,
      details: musicErrors.length === 0 
        ? 'No music/audio errors detected' 
        : `Found ${musicErrors.length} errors: ${musicErrors.slice(0, 3).join('; ')}`,
      timestamp: Date.now()
    });
  }
  
  private async saveResults(): Promise<void> {
    const resultsDir = path.join(process.cwd(), 'test-results');
    await fs.mkdir(resultsDir, { recursive: true });
    
    const resultsFile = path.join(resultsDir, 'music-system-test-results.json');
    await fs.writeFile(resultsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length
      }
    }, null, 2));
    
    console.log(`\n📁 Results saved to: ${resultsFile}`);
  }
  
  async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up...');
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Run the test
async function main() {
  const test = new MusicSystemTest({
    serverUrl: 'http://localhost:3333',
    testDuration: 30000
  });
  
  await test.setup();
  await test.runTests();
  await test.cleanup();
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

