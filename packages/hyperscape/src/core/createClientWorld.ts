import { World } from './World'

import { Client } from './systems/Client'
import { ClientActions } from './systems/ClientActions'
import { ClientAudio } from './systems/ClientAudio'
import { ClientCameraSystem } from './systems/ClientCameraSystem'
import { ClientControls } from './systems/ClientControls'
import { ClientEnvironment } from './systems/ClientEnvironment'
import { ClientGraphics } from './systems/ClientGraphics'
import { ClientLiveKit } from './systems/ClientLiveKit'
import { ClientLoader } from './systems/ClientLoader'
import { ClientMovementSystem } from './systems/ClientMovementSystem'
import { ClientNetwork } from './systems/ClientNetwork'
import { ClientPointer } from './systems/ClientPointer'
import { ClientPrefs } from './systems/ClientPrefs'
import { ClientStats } from './systems/ClientStats'
import { ClientTarget } from './systems/ClientTarget'
import { ClientUI } from './systems/ClientUI'
import { Stage } from './systems/Stage'
// Commented out systems can be uncommented when implemented
// import { LODs } from './systems/LODs'
// import { Nametags } from './systems/Nametags'
// import { Particles } from './systems/Particles'
// import { Wind } from './systems/Wind'
// import { XR } from './systems/XR'

// Import unified terrain system
import { TerrainSystem } from './systems/TerrainSystem'

// Import RPG plugin
import { createRPGPlugin } from '../rpg/systems/RPGPlugin'

// Import WorldPlugin from World.ts to ensure consistency
import type { WorldPlugin } from './World'
import * as THREE from './extras/three'
import type { StageSystem } from '../types/system-interfaces'
import { LODs } from './systems/LODs'
import { Nametags } from './systems/Nametags'
import { Particles } from './systems/Particles'
import { Wind } from './systems/Wind'
import { XR } from './systems/XR'

// Module interface for dynamic imports
interface RPGModule {
  registerRPGSystems(world: World): Promise<void>
}

// Window extension for browser testing
interface WindowWithWorld extends Window {
  world: World
  THREE: typeof import('./extras/three')
}

/**
 * Load client-side plugin systems from a specified path
 */
async function loadClientPluginSystems(world: World, pluginPath: string) {
  
  // Convert absolute file system path to relative URL for web
  let webPath = pluginPath;
  if (pluginPath.startsWith('/')) {
    // Convert absolute path to relative URL
    const parts = pluginPath.split('/');
    const packagesIndex = parts.findIndex(part => part === 'packages');
    if (packagesIndex !== -1) {
      webPath = '/' + parts.slice(packagesIndex + 1).join('/');
    }
  }
  
  
  try {
    // Try multiple possible paths for plugin bundles
    const possiblePaths = [
      `/rpg/dist/rpg-plugin-bundle.js`,
      `${webPath}/rpg-plugin-bundle.js`
    ];
    
    let success = false;
    
    for (const systemLoaderUrl of possiblePaths) {
      try {
        const module = await import(systemLoaderUrl);
        if ('registerRPGSystems' in module && typeof module.registerRPGSystems === 'function') {
          // Module conforms to RPGModule interface
          const rpgModule = module as RPGModule;
          await rpgModule.registerRPGSystems(world);
          success = true;
          break;
        } else {
          console.warn(`[Client Plugin Loader] registerRPGSystems function not found in: ${systemLoaderUrl}`);
        }
              } catch {
          continue;
        }
    }
    
    if (!success) {
      throw new Error('Could not load RPG systems from any known path');
    }
    
  } catch (error) {
    console.error('[Client Plugin Loader] Error loading plugin systems:', error);
    throw error;
  }
}

/**
 * Load plugins directly from imported modules (for built-in plugins)
 */
async function loadBuiltinPlugins(world: World) {
    // Create and register RPG plugin
    console.log('[Client World] Creating RPG plugin...');
    
    
    const rpgPlugin = createRPGPlugin();
    console.log('[Client World] RPG plugin created successfully');
    
    // Register the plugin
    await registerPlugin(world, rpgPlugin);
    console.log('[Client World] RPG plugin registered successfully');
    
}

/**
 * Register a plugin with the world
 */
async function registerPlugin(world: World, plugin: WorldPlugin) {
  try {
    console.log(`[Client World] Loading plugin: ${plugin.name} ${plugin.version || ''}`);
    
    // Register systems
    await plugin.registerSystems(world);
    
    // Setup API if provided
    if (plugin.setupAPI) {
      await plugin.setupAPI(world);
    }
    
    console.log(`[Client World] Successfully loaded plugin: ${plugin.name}`);
    
  } catch (error) {
    console.error(`[Client World] Failed to load plugin ${plugin.name}:`, error);
    throw error;
  }
}

export function createClientWorld() {
  const world = new World()
  
  // Register core client systems
  world.register('client', Client);
  world.register('stage', Stage);
  world.register('livekit', ClientLiveKit);
  world.register('pointer', ClientPointer);
  world.register('prefs', ClientPrefs);
  world.register('controls', ClientControls);
  world.register('network', ClientNetwork);
  world.register('loader', ClientLoader);
  world.register('graphics', ClientGraphics);
  world.register('environment', ClientEnvironment);
  world.register('audio', ClientAudio);
  world.register('stats', ClientStats);
  world.register('actions', ClientActions);
  world.register('target', ClientTarget);
  world.register('ui', ClientUI);
  
  // Register unified core systems
  world.register('client-camera-system', ClientCameraSystem);
  world.register('client-movement-system', ClientMovementSystem);
  world.register('terrain', TerrainSystem);
  
  // Commented out systems can be uncommented when implemented
  world.register('lods', LODs)
  world.register('nametags', Nametags)
  world.register('particles', Particles)
  world.register('wind', Wind)
  world.register('xr', XR)

  // Expose world object to browser window immediately for testing
  if (typeof window !== 'undefined') {
    const windowWithWorld = window as WindowWithWorld;
    windowWithWorld.world = world;
  }

  // Add plugin registration capability directly to world instance
  Object.defineProperty(world, 'registerPlugin', {
    value: registerPlugin,
    writable: false,
    enumerable: false,
    configurable: false
  });

  // Setup THREE.js access after world initialization
  const setupStageWithTHREE = () => {
    const stageSystem = world.stage as StageSystem;
    if (stageSystem && stageSystem.scene) {
      // Assign THREE to the stage system for compatibility
      stageSystem.THREE = THREE;
    }
  };
  
  // Setup THREE.js access after world initialization
  setTimeout(setupStageWithTHREE, 200);
  
  // Create a promise that resolves when plugins are loaded
  const pluginsLoadedPromise = new Promise<void>((resolve) => {
    // Load built-in plugins (like RPG) after core systems are ready
    setTimeout(async () => {
      try {
        await loadBuiltinPlugins(world);
        
        // Update world object in browser window after plugins are loaded
        if (typeof window !== 'undefined') {
          const windowWithWorld = window as WindowWithWorld;
          windowWithWorld.world = world;
          
          // Also expose Three.js if available from stage system
          const stageSystem = world.stage as StageSystem;
          if (stageSystem && stageSystem.THREE) {
            windowWithWorld.THREE = stageSystem.THREE;
          }
        }
        
      } catch (error) {
        console.error('[Client World] Failed to load built-in plugins:', error);
        if (error instanceof Error) {
          console.error('[Client World] Error stack:', error.stack);
        }
        
        // Still expose world object even if plugins fail
        if (typeof window !== 'undefined') {
          const windowWithWorld = window as WindowWithWorld;
          windowWithWorld.world = world;
        }
      }
      resolve();
    }, 100); // Reduced timeout since we'll wait for it properly
  });
  
  // Store the promise on the world instance so it can be awaited
  (world as World & { pluginsLoadedPromise: Promise<void> }).pluginsLoadedPromise = pluginsLoadedPromise;

  // Load external plugin systems if specified
  const PLUGIN_PATH = globalThis.env?.PLUGIN_PATH;
  if (PLUGIN_PATH) {
    setTimeout(async () => {
      try {
        await loadClientPluginSystems(world, PLUGIN_PATH);
      } catch (error) {
        console.error('[Client World] Failed to load external plugin systems:', error instanceof Error ? error.message : error);
      }
    }, 100);
  }
  
  return world;
}
