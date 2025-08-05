import { World } from './World'

import { Server } from './systems/Server'
import { ServerLiveKit } from './systems/ServerLiveKit'
import { ServerNetwork } from './systems/ServerNetwork'
import { ServerLoader } from './systems/ServerLoader'
import { ServerEnvironment } from './systems/ServerEnvironment'
import { ServerMonitor } from './systems/ServerMonitor'

// Import unified terrain system
import { TerrainSystem } from './systems/TerrainSystem'

// Import WorldPlugin from World.ts instead of redefining it
import type { WorldPlugin } from './World';

/**
 * Load built-in plugins (like RPG) directly from imported modules
 */
async function loadBuiltinPlugins(world: World) {
  try {
    // Dynamic import RPG plugin to avoid static dependency
    const { createRPGPlugin } = await import('../rpg/systems/RPGPlugin');
    const rpgPlugin = createRPGPlugin();
    
    // Register the plugin
    await registerPlugin(world, rpgPlugin);
    
  } catch (error) {
    console.error('[Server World] Failed to load built-in RPG plugin:', error);
    throw error;
  }
}

/**
 * Register a plugin with the world
 */
async function registerPlugin(world: World, plugin: WorldPlugin) {
  try {
    console.log(`[Server World] Loading plugin: ${plugin.name} ${plugin.version || ''}`);
    
    // Register systems
    await plugin.registerSystems(world);
    
    // Setup API if provided
    if (plugin.setupAPI) {
      await plugin.setupAPI(world);
    }
    
    console.log(`[Server World] Successfully loaded plugin: ${plugin.name}`);
    
  } catch (error) {
    console.error(`[Server World] Failed to load plugin ${plugin.name}:`, error);
    throw error;
  }
}

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
  
  // Add plugin registration capability
  // Note: This extends the World instance with a registerPlugin method
  const extendedWorld = world as World & { registerPlugin: typeof registerPlugin };
  extendedWorld.registerPlugin = registerPlugin;
  
  // Load built-in plugins (like RPG) after core systems are ready
  // Properly await plugins on server to ensure systems are available before continuing
  try {
    console.log('[Server World] Loading built-in plugins...');
    await loadBuiltinPlugins(world);
    console.log('[Server World] Built-in plugins loaded successfully');
  } catch (error) {
    console.error('[Server World] Failed to load built-in plugins:', error);
    if (error instanceof Error) {
      console.error('[Server World] Error stack:', error.stack);
    }
    throw error; // Re-throw to prevent server from starting with incomplete plugins
  }
  
  console.log('[Server World] Server world created successfully');
  return world;
}
