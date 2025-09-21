import { World } from './World'

import { Server } from './systems/Server'
import { ServerEnvironment } from './systems/ServerEnvironment'
import { ServerLiveKit } from './systems/ServerLiveKit'
import { ServerLoader } from './systems/ServerLoader'
import { ServerMonitor } from './systems/ServerMonitor'
import { ServerNetwork } from './systems/ServerNetwork'

// Import unified terrain system
import { TerrainSystem } from './systems/TerrainSystem'

// Import multiplayer movement systems
import { DeltaCompressionSystem } from './systems/DeltaCompressionSystem'

// Import RPG systems loader
import { registerSystems } from './systems/SystemLoader'
// Test systems removed - consolidated into MovementValidationSystem
import { ServerBot } from './systems/ServerBot'
import { ServerPositionValidator } from './systems/ServerPositionValidator'

export async function createServerWorld() {
    const world = new World()
  
  // Register core server systems
    world.register('server', Server);
  world.register('livekit', ServerLiveKit);
  world.register('network', ServerNetwork);
  world.register('loader', ServerLoader);
  world.register('environment', ServerEnvironment);
  world.register('monitor', ServerMonitor);
  
  // Register core terrain system
  world.register('terrain', TerrainSystem);
  
  // Register position validation system (must come after terrain)
  world.register('position-validator', ServerPositionValidator);
  
  // Register unified movement systems
  world.register('delta-compression', DeltaCompressionSystem);
  
  // Do not register client systems on server; server exposes only RPG systems via SystemLoader when enabled
  
    
  // Register RPG game systems
  try {
        await registerSystems(world);
        
    // Register server test systems
    // Test systems consolidated into MovementValidationSystem (registered in SystemLoader)
    world.register('server-bot', ServerBot);
      } catch (error) {
    console.error('[Server World] Failed to register RPG game systems:', error);
    if (error instanceof Error) {
      console.error('[Server World] Error stack:', error.stack);
    }
    throw error; // Re-throw to prevent server from starting with incomplete systems
  }
  
    
  return world;
}
