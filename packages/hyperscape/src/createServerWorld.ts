import { World } from './World'

import { Server } from './systems/Server'
import { ServerEnvironment } from './systems/ServerEnvironment'
import { ServerLiveKit } from './systems/ServerLiveKit'
import { ServerLoader } from './systems/ServerLoader'
import { ServerMonitor } from './systems/ServerMonitor'
import { ServerNetwork } from './systems/ServerNetwork'

// Import unified terrain system
import { TerrainSystem } from './systems/TerrainSystem'

// Import RPG systems loader
import { registerSystems } from './systems/SystemLoader'
// Test systems removed - consolidated into MovementValidationSystem
import { ServerBot } from './systems/ServerBot'

export async function createServerWorld() {
  console.log('[Server World] Creating server world...');
  const world = new World()
  
  // Register core server systems
  console.log('[Server World] Registering core server systems...');
  world.register('server', Server);
  world.register('livekit', ServerLiveKit);
  world.register('network', ServerNetwork);
  world.register('loader', ServerLoader);
  world.register('environment', ServerEnvironment);
  world.register('monitor', ServerMonitor);
  
  // Register core terrain system
  world.register('terrain', TerrainSystem);
  
  // Do not register client systems on server; server exposes only RPG systems via SystemLoader when enabled
  
  console.log('[Server World] Core systems registered');
  
  // Register RPG game systems
  try {
    console.log('[Server World] Registering RPG game systems...');
    await registerSystems(world);
    console.log('[Server World] RPG game systems registered successfully');
    
    // Register server test systems
    // Test systems consolidated into MovementValidationSystem (registered in SystemLoader)
    world.register('server-bot', ServerBot);
    console.log('[Server World] All test systems registered');
  } catch (error) {
    console.error('[Server World] Failed to register RPG game systems:', error);
    if (error instanceof Error) {
      console.error('[Server World] Error stack:', error.stack);
    }
    throw error; // Re-throw to prevent server from starting with incomplete systems
  }
  
  console.log('[Server World] Server world created successfully');
  
  return world;
}
