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

import * as THREE from './extras/three'

// Import unified terrain system
import { TerrainSystem } from './systems/TerrainSystem'

// Import RPG systems loader
import { registerSystems } from './systems/SystemLoader'

import type { StageSystem } from './types/system-interfaces'
import { LODs } from './systems/LODs'
import { Nametags } from './systems/Nametags'
import { Particles } from './systems/Particles'
import { Wind } from './systems/Wind'
import { XR } from './systems/XR'

// Module interface for dynamic imports
interface Module {
  registerSystems(world: World): Promise<void>
}

// Window extension for browser testing
interface WindowWithWorld extends Window {
  world: World
  THREE
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
      `/dist/rpg-plugin-bundle.js`,
      `${webPath}/rpg-plugin-bundle.js`
    ];
    
    let success = false;
    
    for (const systemLoaderUrl of possiblePaths) {
      try {
        const module = await import(systemLoaderUrl);
        if ('registerSystems' in module && typeof module.registerSystems === 'function') {
          // Module conforms to Module interface
          const rpgModule = module as Module;
          await rpgModule.registerSystems(world);
          success = true;
          break;
        } else {
          console.warn(`[Client Plugin Loader] registerSystems function not found in: ${systemLoaderUrl}`);
        }
              } catch {
          continue;
        }
    }
    
    if (!success) {
      throw new Error('Could not load systems from any known path');
    }
    
  } catch (error) {
    console.error('[Client Plugin Loader] Error loading plugin systems:', error);
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
  
  // Create a promise that resolves when RPG systems are loaded
  const systemsLoadedPromise = new Promise<void>((resolve) => {
    // Register RPG game systems after core systems are ready
    setTimeout(async () => {
      try {
        console.log('[Client World] Registering RPG game systems...');
        await registerSystems(world);
        console.log('[Client World] RPG game systems registered successfully');
        
        // Update world object in browser window after systems are loaded
        if (typeof window !== 'undefined') {
          const windowWithWorld = window as unknown as WindowWithWorld;
          windowWithWorld.world = world;
          
          // Also expose Three.js if available from stage system
          const stageSystem = world.stage as StageSystem;
          if (stageSystem && stageSystem.THREE) {
            windowWithWorld.THREE = stageSystem.THREE;
          }
        }
        
      } catch (error) {
        console.error('[Client World] Failed to register RPG game systems:', error);
        if (error instanceof Error) {
          console.error('[Client World] Error stack:', error.stack);
        }
        
        // Still expose world object even if systems fail
        if (typeof window !== 'undefined') {
          const windowWithWorld = window as unknown as WindowWithWorld;
          windowWithWorld.world = world;
        }
      }
      resolve();
    }, 100); // Reduced timeout since we'll wait for it properly
  });
  
  // Store the promise on the world instance so it can be awaited
  (world as World & { systemsLoadedPromise: Promise<void> }).systemsLoadedPromise = systemsLoadedPromise;

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
