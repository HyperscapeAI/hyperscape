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

import THREE from './extras/three'
import { HeightmapPathfinding } from './systems/HeightmapPathfinding'
// Test systems removed - consolidated into MovementValidationSystem

// Import unified terrain system
import { TerrainSystem } from './systems/TerrainSystem'
import { Physics } from './systems/Physics'

// Import RPG systems loader
import { registerSystems } from './systems/SystemLoader'
// ClientMovementFix removed - integrated into core movement systems
import { ClientDiagnostics } from './systems/ClientDiagnostics'
import { AvatarFix } from './systems/AvatarFix'
import { RaycastTestSystem } from './systems/RaycastTestSystem'
import { InteractionSystem } from './systems/InteractionSystem'

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
  THREE: typeof THREE
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
  // Core physics (creates environment ground plane and layer masks)
  world.register('physics', Physics);
  
  // Register unified core systems
  world.register('client-camera-system', ClientCameraSystem);
  
  // Register simple ground for testing (comment out when using full terrain)
  // world.register('simple-ground', SimpleGroundSystem);
  world.register('terrain', TerrainSystem);
  
  // Register heightmap-based pathfinding (only activates with terrain)
  world.register('heightmap-pathfinding', HeightmapPathfinding);
  
  // Register comprehensive movement test system only when explicitly enabled
  const shouldEnableMovementTest =
    (typeof window !== 'undefined' && (window as unknown as { __ENABLE_MOVEMENT_TEST__?: boolean }).__ENABLE_MOVEMENT_TEST__ === true)
  
  if (shouldEnableMovementTest) {
    // Movement test consolidated into MovementValidationSystem (registered in SystemLoader)
  }
  
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
        
        // Register client helper systems
        // world.register('client-movement-fix', ClientMovementFix); // Disabled for now
        world.register('client-diagnostics', ClientDiagnostics);
        // world.register('avatar-fix', AvatarFix); // Disabled - avatar is properly managed in PlayerLocal
        
        // Temporarily disable raycast test system to prevent canvas/ground plane conflicts
        // if (typeof window !== 'undefined' && (window as any).__ENABLE_RAYCAST_TEST__) {
        //     world.register('raycast-test', RaycastTestSystem);
        //     console.log('[Client World] Raycast test system registered');
        // }
        
        console.log('[Client World] Client helper systems registered');
        
        // Update world object in browser window after systems are loaded
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
        console.error('[Client World] Failed to register RPG game systems:', error);
        if (error instanceof Error) {
          console.error('[Client World] Error stack:', error.stack);
        }
        
        // Still expose world object even if systems fail
        if (typeof window !== 'undefined') {
          const windowWithWorld = window as WindowWithWorld;
          windowWithWorld.world = world;
        }
      }
      resolve();
    }, 100); // Reduced timeout since we'll wait for it properly
  });
  
  // Store the promise on the world instance so it can be awaited
  (world as World & { systemsLoadedPromise: Promise<void> }).systemsLoadedPromise = systemsLoadedPromise;

  
  return world;
}
