import { World } from './World'

import { Server } from './systems/Server'
import { ServerLiveKit } from './systems/ServerLiveKit'
import { ServerNetwork } from './systems/ServerNetwork'
import { ServerLoader } from './systems/ServerLoader'
import { ServerEnvironment } from './systems/ServerEnvironment'
import { ServerMonitor } from './systems/ServerMonitor'

// Import unified terrain system
import { TerrainSystem } from './systems/TerrainSystem'

// Import RPG systems loader
import { registerSystems } from './systems/SystemLoader'

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
  
  console.log('[Server World] Core systems registered');
  
  // Register RPG game systems
  try {
    console.log('[Server World] Registering RPG game systems...');
    await registerSystems(world);
    console.log('[Server World] RPG game systems registered successfully');
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
