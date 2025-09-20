import { chromium, Browser, Page } from 'playwright';
import type { World } from '../World';

// Extend World type for player entity
interface TestWorld extends World {
  entities: World['entities'] & {
    player?: {
      position: { x: number; y: number; z: number };
      serverPosition?: { x: number; y: number; z: number };
      capsule?: {
        getRigidBodyFlags?(): number;
      };
    };
  };
}

/**
 * Aggressive multiplayer position validation test
 * This test will CRASH if the position sync is broken
 */

interface TestResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export async function runMultiplayerPositionTest(): Promise<TestResult> {
  const result: TestResult = {
    passed: true,
    errors: [],
    warnings: []
  };

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log('[TEST] Starting multiplayer position validation test...');
    
    // Launch browser
    browser = await chromium.launch({
      headless: false, // Show browser for debugging
      devtools: true
    });
    
    page = await browser.newPage();
    
    // Inject console monitoring
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      
      // Check for critical errors
      if (text.includes('fixedUpdate teleport to server position')) {
        result.errors.push(`CRITICAL: Teleport loop detected - ${text}`);
        result.passed = false;
      }
      
      if (text.includes('Position validation failed')) {
        result.errors.push(`FATAL: Position validation failed - ${text}`);
        result.passed = false;
        throw new Error('Position validation failed - stopping test');
      }
      
      if (text.includes('FATAL:')) {
        result.errors.push(text);
        result.passed = false;
      }
    });
    
    // Navigate to the game
    await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
    
    // Wait for world to initialize
    await page.waitForTimeout(3000);
    
    // Get player position from the page
    const validation = await page.evaluate(() => {
      const world = (window as { world?: TestWorld }).world;
      if (!world) {
        return { error: 'World not found' };
      }
      
      const player = world.entities.player;
      if (!player) {
        return { error: 'Player not found' };
      }
      
      const clientPos = player.position;
      const serverPos = player.serverPosition;
      
      if (!serverPos) {
        return { error: 'Server position not initialized!' };
      }
      
      const distance = Math.sqrt(
        Math.pow(clientPos.x - serverPos.x, 2) +
        Math.pow(clientPos.y - serverPos.y, 2) +
        Math.pow(clientPos.z - serverPos.z, 2)
      );
      
      return {
        clientPosition: { x: clientPos.x, y: clientPos.y, z: clientPos.z },
        serverPosition: { x: serverPos.x, y: serverPos.y, z: serverPos.z },
        distance,
        capsuleExists: !!player.capsule,
        isKinematic: player.capsule?.getRigidBodyFlags ? 
          !!(player.capsule.getRigidBodyFlags() & 1) : // eKINEMATIC = 1
          false
      };
    });
    
    // Validate results
    if ('error' in validation && validation.error) {
      result.errors.push(validation.error);
      result.passed = false;
    } else if ('clientPosition' in validation && validation.clientPosition && 
               'serverPosition' in validation && validation.serverPosition &&
               'distance' in validation && typeof validation.distance === 'number') {
      console.log('[TEST] Position validation:', validation);
      
      // Check Y=0 spawn bug
      if (Math.abs(validation.clientPosition.y) < 0.5) {
        result.errors.push(`Y=0 SPAWN BUG DETECTED! Client Y=${validation.clientPosition.y}`);
        result.passed = false;
      }
      
      // Check position divergence
      if (validation.distance > 5) {
        result.errors.push(`Position divergence too large: ${validation.distance} units`);
        result.passed = false;
      }
      
      // Check physics is kinematic
      if ('isKinematic' in validation && !validation.isKinematic) {
        result.warnings.push('Physics capsule is not kinematic - may fall');
      }
      
      // Monitor for oscillation over time
      let oscillationCount = 0;
      let lastY = validation.clientPosition.y;
      
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(100);
        
        const currentPos = await page.evaluate(() => {
          const world = (window as { world?: TestWorld }).world;
          const player = world?.entities?.player;
          return player ? player.position.y : null;
        });
        
        if (currentPos !== null) {
          const yDiff = Math.abs(currentPos - lastY);
          if (yDiff > 10) {
            oscillationCount++;
            result.warnings.push(`Oscillation detected: Y changed by ${yDiff}`);
          }
          lastY = currentPos;
        }
      }
      
      if (oscillationCount > 2) {
        result.errors.push(`OSCILLATION BUG: Position oscillating ${oscillationCount} times`);
        result.passed = false;
      }
    } else {
      result.errors.push('Unexpected validation result format');
      result.passed = false;
    }
    
    // Check console for teleport spam
    const teleportLogs = consoleLogs.filter(log => 
      log.includes('teleport to server position')
    );
    
    if (teleportLogs.length > 5) {
      result.errors.push(`TELEPORT SPAM: ${teleportLogs.length} teleports detected`);
      result.passed = false;
    }
    
  } catch (error) {
    result.errors.push(`Test failed: ${error}`);
    result.passed = false;
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
  
  // Print results
  console.log('\n========== MULTIPLAYER POSITION TEST RESULTS ==========');
  console.log(`PASSED: ${result.passed ? '✅' : '❌'}`);
  
  if (result.errors.length > 0) {
    console.log('\nERRORS:');
    result.errors.forEach(err => console.error(`  - ${err}`));
  }
  
  if (result.warnings.length > 0) {
    console.log('\nWARNINGS:');
    result.warnings.forEach(warn => console.warn(`  - ${warn}`));
  }
  
  console.log('======================================================\n');
  
  // Crash if test failed
  if (!result.passed) {
    throw new Error('MULTIPLAYER POSITION TEST FAILED - SEE ERRORS ABOVE');
  }
  
  return result;
}

// Auto-run if executed directly
runMultiplayerPositionTest()
  .then(result => {
    if (!result.passed) {
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Test crashed:', err);
    process.exit(1);
  });
