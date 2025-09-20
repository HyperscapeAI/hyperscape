#!/usr/bin/env node

/**
 * Bot Movement Monitor
 * 
 * This script connects to a running Hyperscape server and monitors
 * the ServerBot's movement in real-time, providing detailed statistics.
 */

import WebSocket from 'ws';
import { readPacket, writePacket } from './build/packets.js';

const PORT = process.env.PORT || 4444;
const WS_URL = `ws://localhost:${PORT}/ws`;

console.log('🔍 Bot Movement Monitor');
console.log('========================');
console.log(`Connecting to ${WS_URL}...`);

// Track bot data
let botEntity = null;
let positions = [];
let lastPosition = null;
let totalDistance = 0;
let startTime = Date.now();

// Connect as a monitoring client
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ Connected to server');
  console.log('⏳ Waiting for snapshot...\n');
});

ws.on('message', (data) => {
  const result = readPacket(data);
  if (!result) return;
  
  const [method, payload] = result;
  
  switch (method) {
    case 'snapshot':
      handleSnapshot(payload);
      break;
    case 'entityAdded':
      handleEntityAdded(payload);
      break;
    case 'entityModified':
      handleEntityModified(payload);
      break;
    case 'entityRemoved':
      if (payload === botEntity?.id) {
        console.log('❌ Bot disconnected');
        botEntity = null;
      }
      break;
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('\n👋 Disconnected from server');
  printFinalStats();
  process.exit(0);
});

function handleSnapshot(data) {
  console.log('📦 Received snapshot');
  
  // Look for bot in initial entities
  if (data.entities) {
    for (const entity of data.entities) {
      if (entity.name?.includes('🤖') || entity.name?.includes('Bot')) {
        botEntity = entity;
        console.log(`🤖 Found bot in snapshot: ${entity.name} (${entity.id})`);
        if (entity.position) {
          updatePosition(entity.position);
        }
        break;
      }
    }
  }
  
  if (!botEntity) {
    console.log('⏳ Bot not spawned yet, waiting...');
  }
  
  startMonitoring();
}

function handleEntityAdded(entity) {
  if (entity.name?.includes('🤖') || entity.name?.includes('Bot')) {
    botEntity = entity;
    console.log(`\n🤖 Bot spawned: ${entity.name} (${entity.id})`);
    if (entity.position) {
      updatePosition(entity.position);
    }
  }
}

function handleEntityModified(data) {
  if (!botEntity || data.id !== botEntity.id) return;
  
  const changes = data.changes || data;
  
  // Update position if provided
  if (changes.p) {
    updatePosition(changes.p);
  }
  
  // Log emote changes
  if (changes.e) {
    const emoteMap = {
      'idle': '🧍 Idle',
      'walk': '🚶 Walking',
      'run': '🏃 Running',
      'jump': '🦘 Jumping'
    };
    console.log(`  Animation: ${emoteMap[changes.e] || changes.e}`);
  }
}

function updatePosition(pos) {
  const [x, y, z] = pos;
  const newPos = { x, y, z, time: Date.now() };
  
  if (lastPosition) {
    const dx = x - lastPosition.x;
    const dz = z - lastPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    totalDistance += distance;
    
    const timeDelta = (newPos.time - lastPosition.time) / 1000;
    const speed = timeDelta > 0 ? distance / timeDelta : 0;
    
    // Only log significant movement
    if (distance > 0.1) {
      console.log(`📍 Position: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) | Δ: ${distance.toFixed(2)}m | Speed: ${speed.toFixed(1)}m/s`);
    }
  } else {
    console.log(`📍 Initial position: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
  }
  
  lastPosition = newPos;
  positions.push(newPos);
}

function startMonitoring() {
  console.log('\n📊 Monitoring bot movement...');
  console.log('Press Ctrl+C to stop\n');
  
  // Print stats every 10 seconds
  setInterval(() => {
    if (!botEntity) {
      console.log('⏳ Still waiting for bot to spawn...');
      return;
    }
    
    printStats();
  }, 10000);
}

function printStats() {
  const runtime = (Date.now() - startTime) / 1000;
  const avgSpeed = positions.length > 1 ? 
    totalDistance / ((positions[positions.length - 1].time - positions[0].time) / 1000) : 0;
  
  console.log('\n--- Statistics ---');
  console.log(`Runtime: ${runtime.toFixed(0)}s`);
  console.log(`Total distance: ${totalDistance.toFixed(1)}m`);
  console.log(`Average speed: ${avgSpeed.toFixed(2)}m/s`);
  console.log(`Position updates: ${positions.length}`);
  
  // Check if bot is stuck
  if (positions.length > 10) {
    const recent = positions.slice(-10);
    const recentDistance = recent.reduce((sum, pos, i) => {
      if (i === 0) return 0;
      const prev = recent[i - 1];
      const dx = pos.x - prev.x;
      const dz = pos.z - prev.z;
      return sum + Math.sqrt(dx * dx + dz * dz);
    }, 0);
    
    if (recentDistance < 0.5) {
      console.log('⚠️  Bot appears to be stuck!');
    } else {
      console.log('✅ Bot is moving normally');
    }
  }
  console.log('------------------\n');
}

function printFinalStats() {
  if (positions.length < 2) {
    console.log('📊 Insufficient data for statistics');
    return;
  }
  
  console.log('\n📊 Final Statistics');
  console.log('===================');
  printStats();
  
  // Movement heatmap
  if (positions.length > 0) {
    const minX = Math.min(...positions.map(p => p.x));
    const maxX = Math.max(...positions.map(p => p.x));
    const minZ = Math.min(...positions.map(p => p.z));
    const maxZ = Math.max(...positions.map(p => p.z));
    
    console.log('\n📍 Movement Range:');
    console.log(`  X: ${minX.toFixed(1)} to ${maxX.toFixed(1)} (${(maxX - minX).toFixed(1)}m)`);
    console.log(`  Z: ${minZ.toFixed(1)} to ${maxZ.toFixed(1)} (${(maxZ - minZ).toFixed(1)}m)`);
    
    const avgY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
    console.log(`  Avg Y (height): ${avgY.toFixed(2)}m`);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping monitor...');
  ws.close();
});


