#!/usr/bin/env node

import { chromium } from 'playwright';

// Start server
console.log('Starting server...');
const { spawn } = await import('child_process');
const server = spawn('bun', ['run', 'dev'], {
  cwd: '/Users/shawwalters/hyperscape',
  detached: false,
  stdio: ['ignore', 'pipe', 'pipe']
});

// Wait for server
await new Promise(resolve => setTimeout(resolve, 10000));

const browser = await chromium.launch({ 
  headless: false
});

const page = await browser.newPage();

// Track critical logs
let avatarAttached = false;
let avatarPosition = null;

page.on('console', msg => {
  const text = msg.text();
  
  if (text.includes('Avatar attached to world.stage.scene')) {
    avatarAttached = true;
    console.log('✅ Avatar attached to scene');
  }
  
  if (text.includes('Avatar Y=')) {
    const match = text.match(/Avatar Y=([\d.]+), Base Y=([\d.]+)/);
    if (match) {
      const avatarY = parseFloat(match[1]);
      const baseY = parseFloat(match[2]);
      avatarPosition = { avatarY, baseY };
      
      if (Math.abs(avatarY - baseY) < 5) {
        console.log(`✅ Avatar at correct height: Y=${avatarY}, Base Y=${baseY}`);
      } else {
        console.log(`❌ Avatar at wrong height: Y=${avatarY}, Base Y=${baseY}`);
      }
    }
  }
  
  if (text.includes('ERROR') || text.includes('CRITICAL')) {
    console.log('⚠️', text);
  }
});

console.log('Navigating to http://localhost:3333...');
await page.goto('http://localhost:3333');

// Wait for game to load
await page.waitForTimeout(15000);

// Check avatar visibility
const result = await page.evaluate(() => {
  const world = window.world;
  if (!world) return { error: 'No world' };
  
  let localPlayer = null;
  let avatarInfo = null;
  
  // Find local player
  world.entities.items.forEach((entity) => {
    if (entity.isPlayer && entity.base) {
      // Check if this is likely the local player (has most properties)
      if (entity._avatar || entity.cam) {
        localPlayer = {
          id: entity.id,
          position: entity.position.toArray(),
          hasAvatar: !!entity._avatar,
          hasInstance: !!(entity._avatar && entity._avatar.instance),
        };
        
        if (entity._avatar && entity._avatar.instance && entity._avatar.instance.raw) {
          const scene = entity._avatar.instance.raw.scene;
          if (scene) {
            avatarInfo = {
              hasParent: !!scene.parent,
              parentName: scene.parent ? scene.parent.name : 'NONE',
              visible: scene.visible,
              position: scene.position.toArray(),
              worldPosition: scene.getWorldPosition(new THREE.Vector3()).toArray()
            };
          }
        }
      }
    }
  });
  
  // Count visible skinned meshes
  let skinnedMeshCount = 0;
  if (world.stage && world.stage.scene) {
    world.stage.scene.traverse((obj) => {
      if (obj.isSkinnedMesh && obj.visible) {
        skinnedMeshCount++;
      }
    });
  }
  
  return { localPlayer, avatarInfo, skinnedMeshCount };
});

console.log('\n=== AVATAR CHECK ===');
console.log(JSON.stringify(result, null, 2));

// Analyze results
if (!result.localPlayer) {
  console.log('❌ No local player found!');
} else {
  console.log('✅ Local player found');
  
  if (!result.localPlayer.hasAvatar) {
    console.log('❌ Player has no avatar!');
  } else if (!result.localPlayer.hasInstance) {
    console.log('❌ Avatar has no instance!');
  } else {
    console.log('✅ Avatar instance exists');
    
    if (result.avatarInfo) {
      if (!result.avatarInfo.hasParent) {
        console.log('❌ Avatar scene has NO PARENT!');
      } else {
        console.log('✅ Avatar scene has parent:', result.avatarInfo.parentName);
      }
      
      const worldY = result.avatarInfo.worldPosition[1];
      const playerY = result.localPlayer.position[1];
      
      if (Math.abs(worldY - playerY) < 5) {
        console.log(`✅ Avatar at correct position: Y=${worldY.toFixed(2)} (player: ${playerY.toFixed(2)})`);
      } else {
        console.log(`❌ Avatar at WRONG position: Y=${worldY.toFixed(2)} (player: ${playerY.toFixed(2)})`);
      }
    }
  }
}

if (result.skinnedMeshCount > 0) {
  console.log(`✅ ${result.skinnedMeshCount} visible skinned meshes in scene`);
} else {
  console.log('❌ NO visible skinned meshes!');
}

// Take screenshot
await page.screenshot({ path: '/tmp/avatar-verify.png' });
console.log('\nScreenshot saved to /tmp/avatar-verify.png');

console.log('\nBrowser open for inspection. Press Ctrl+C to exit.');
await new Promise(() => {}); // Keep running



