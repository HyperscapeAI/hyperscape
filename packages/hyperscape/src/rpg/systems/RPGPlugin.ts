 
/**
 * RPG Plugin for Hyperscape
 * Encapsulates all RPG system registration and API setup
 * This maintains clean separation between core and RPG code
 */

/* eslint-env node */

// Import RPG System Loader for API setup
import { World } from '../../core/World';
import { registerRPGSystems } from './RPGSystemLoader';

/**
 * Plugin interface for extending Hyperscape worlds
 */
interface WorldPlugin {
  name: string;
  version?: string;
  registerSystems: (world: World) => void | Promise<void>;
  setupAPI?: (world: World) => void | Promise<void>;
}

/**
 * Create the RPG plugin instance
 */
export function createRPGPlugin(): WorldPlugin {
  return {
    name: 'RPG',
    version: '1.0.0',
    
    registerSystems: async () => {
      // System registration is handled by setupAPI -> registerRPGSystems
      // This method is kept for compatibility but does nothing
    },
    
    setupAPI: async (world: World) => {
      // Set up the RPG API using the existing system loader
      await registerRPGSystems(world);
      
      // RPG API initialized successfully
      console.log('[RPG Plugin] RPG API initialized successfully');
    }
  };
}