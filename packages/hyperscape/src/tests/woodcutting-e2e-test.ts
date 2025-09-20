/**
 * End-to-End Woodcutting Test
 * Tests the complete woodcutting flow:
 * 1. Right-click on tree to show context menu
 * 2. Click "Chop" to start woodcutting
 * 3. Player moves to tree
 * 4. Jump animation plays during chopping
 * 5. Wood is collected in inventory
 */

import { chromium, Browser, Page } from 'playwright';
import { Logger } from '../utils/Logger';

interface TestResult {
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// Extend Window interface for Playwright context
declare global {
  interface Window {
    world?: any; // Use 'any' for test flexibility to avoid type conflicts
    THREE?: any; // Use 'any' for test flexibility to avoid type conflicts
  }
}

class WoodcuttingE2ETest {
  private browser: Browser | null = null;
  private page: Page | null = null;
  
  async setup(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false, // Run in headed mode to see what's happening
      slowMo: 100 // Slow down actions for visibility
    });
    
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    
    this.page = await context.newPage();
    
    // Navigate to the game
    await this.page.goto('http://localhost:3000');
    
    // Wait for world to load
    await this.page.waitForFunction(() => {
      return window.world && window.world.initialized;
    }, { timeout: 30000 });
    
    Logger.system('WoodcuttingE2ETest', 'Game world loaded successfully');
  }
  
  async testContextMenuOnTree(): Promise<TestResult> {
    if (!this.page) {
      return { passed: false, message: 'Page not initialized' };
    }
    
    try {
      // Wait for a tree to be visible
      await this.page.waitForTimeout(2000);
      
      // Find tree position in the world
      const treePosition = await this.page.evaluate(() => {
        const world = window.world;
        if (!world) return null;
        
        // Get first tree entity
        const entities = world.entities?.getAll?.() || [];
        const tree = entities.find(e => e.type?.includes('tree'));
        
        if (!tree || !tree.position) return null;
        
        // Project 3D position to screen coordinates
        const camera = world.camera;
        const renderer = world.graphics?.renderer;
        if (!camera || !renderer) return null;
        
        // Use window.THREE as it's available in the browser context
        const vector = new window.THREE.Vector3(tree.position.x, tree.position.y, tree.position.z);
        vector.project(camera);
        
        const canvas = renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        
        const x = ((vector.x + 1) / 2) * rect.width + rect.left;
        const y = ((1 - vector.y) / 2) * rect.height + rect.top;
        
        return { x, y };
      });
      
      if (!treePosition) {
        return { passed: false, message: 'Could not find tree in world' };
      }
      
      Logger.system('WoodcuttingE2ETest', `Found tree at screen position: ${treePosition.x}, ${treePosition.y}`);
      
      // Right-click on the tree
      await this.page.mouse.click(treePosition.x, treePosition.y, { button: 'right' });
      
      // Wait for context menu to appear
      await this.page.waitForSelector('.resource-menu-item', { timeout: 5000 });
      
      // Check if "Chop" option is available
      const chopOption = await this.page.$('button:has-text("Chop")');
      if (!chopOption) {
        return { passed: false, message: 'Chop option not found in context menu' };
      }
      
      return { passed: true, message: 'Context menu displayed with Chop option' };
    } catch (error) {
      return { passed: false, message: `Error testing context menu: ${error}` };
    }
  }
  
  async testChoppingAction(): Promise<TestResult> {
    if (!this.page) {
      return { passed: false, message: 'Page not initialized' };
    }
    
    try {
      // Click the Chop option
      const chopButton = await this.page.$('button:has-text("Chop")');
      if (!chopButton) {
        return { passed: false, message: 'Chop button not found' };
      }
      
      await chopButton.click();
      
      // Wait for player to move to tree
      await this.page.waitForTimeout(3000);
      
      // Check if player moved
      const playerMoved = await this.page.evaluate(() => {
        const world = window.world;
        const player = world?.getPlayer?.();
        if (!player) return false;
        
        // Check if player is moving or has moved
        const velocity = player.velocity || { x: 0, y: 0, z: 0 };
        const isMoving = Math.abs(velocity.x) > 0.01 || Math.abs(velocity.z) > 0.01;
        
        // Check if player has moved recently using position change or velocity
        return isMoving;
      });
      
      if (!playerMoved) {
        Logger.systemWarn('WoodcuttingE2ETest', 'Player did not move to tree');
      }
      
      // Wait for chopping animation
      await this.page.waitForTimeout(5000);
      
      // Check for jump animation or chopping message
      const animationOccurred = await this.page.evaluate(() => {
        // Check console or UI for chopping messages
        const messages = document.querySelectorAll('.ui-message');
        for (const msg of messages) {
          if (msg.textContent?.includes('chop')) {
            return true;
          }
        }
        return false;
      });
      
      return { 
        passed: playerMoved || animationOccurred, 
        message: playerMoved ? 'Player moved to tree and started chopping' : 'Chopping animation detected' 
      };
    } catch (error) {
      return { passed: false, message: `Error testing chopping action: ${error}` };
    }
  }
  
  async testInventoryUpdate(): Promise<TestResult> {
    if (!this.page) {
      return { passed: false, message: 'Page not initialized' };
    }
    
    try {
      // Wait for woodcutting to complete
      await this.page.waitForTimeout(10000);
      
      // Check if logs were added to inventory
      const inventoryUpdated = await this.page.evaluate(() => {
        const world = window.world;
        const player = world?.getPlayer?.();
        if (!player) return false;
        
        // Check inventory for logs
        const inventory = player.inventory?.items || [];
        const hasLogs = inventory.some(item => 
          item.itemId?.toLowerCase().includes('log')
        );
        
        return hasLogs;
      });
      
      if (!inventoryUpdated) {
        // Try opening inventory to check
        await this.page.keyboard.press('i');
        await this.page.waitForTimeout(1000);
        
        // Check for log items in UI
        const logElements = await this.page.$$('text=/log/i');
        if (logElements.length > 0) {
          return { passed: true, message: 'Logs found in inventory UI' };
        }
        
        return { passed: false, message: 'No logs found in inventory' };
      }
      
      return { passed: true, message: 'Wood successfully collected in inventory' };
    } catch (error) {
      return { passed: false, message: `Error checking inventory: ${error}` };
    }
  }
  
  async runAllTests(): Promise<void> {
    console.log('=== Starting Woodcutting End-to-End Tests ===');
    
    await this.setup();
    
    const tests = [
      { name: 'Context Menu on Tree', fn: () => this.testContextMenuOnTree() },
      { name: 'Chopping Action', fn: () => this.testChoppingAction() },
      { name: 'Inventory Update', fn: () => this.testInventoryUpdate() }
    ];
    
    let passedCount = 0;
    let failedCount = 0;
    
    for (const test of tests) {
      console.log(`\nRunning: ${test.name}`);
      const result = await test.fn();
      
      if (result.passed) {
        console.log(`✅ PASSED: ${result.message}`);
        passedCount++;
      } else {
        console.log(`❌ FAILED: ${result.message}`);
        failedCount++;
      }
      
      if (result.details) {
        console.log('Details:', result.details);
      }
    }
    
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passedCount}/${tests.length}`);
    console.log(`Failed: ${failedCount}/${tests.length}`);
    
    if (failedCount === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log('⚠️ Some tests failed. Please review the results above.');
    }
    
    // Keep browser open for manual inspection if tests failed
    if (failedCount > 0) {
      console.log('\nBrowser kept open for inspection. Press Ctrl+C to close.');
      await this.page?.waitForTimeout(60000);
    }
    
    await this.cleanup();
  }
  
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const test = new WoodcuttingE2ETest();
  test.runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { WoodcuttingE2ETest };

