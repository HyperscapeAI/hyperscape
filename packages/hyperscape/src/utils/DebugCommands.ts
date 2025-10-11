/**
 * Debug Commands for Browser Console
 * Exposes useful debugging functions on window.debug
 */

import type { World } from '../World';
import { modelCache } from './ModelCache';
import type { EntityManager } from '../systems/EntityManager';

export function installDebugCommands(world: World): void {
  const debug = {
    /**
     * Show model cache statistics
     */
    modelCache: () => {
      const stats = modelCache.getStats();
      console.log('📊 Model Cache Statistics:');
      console.log(`  Total cached models: ${stats.total}`);
      console.log(`  Total clones created: ${stats.totalClones}`);
      console.log(`  Average clones per model: ${(stats.totalClones / stats.total || 0).toFixed(1)}`);
      console.log(`\n  Cached models:`);
      stats.paths.forEach((path, i) => {
        console.log(`    ${i + 1}. ${path}`);
      });
      return stats;
    },
    
    /**
     * Clear model cache
     */
    clearModelCache: () => {
      modelCache.clear();
      console.log('✅ Model cache cleared');
    },
    
    /**
     * List all entities
     */
    entities: () => {
      const entityManager = world.getSystem('rpg-entity-manager') as EntityManager | undefined;
      if (!entityManager) {
        console.error('EntityManager not found');
        return [];
      }
      const entities: Array<{
        id: string;
        name: string;
        type: string;
        position: number[];
        hasMesh: boolean;
        meshType?: string;
        visible: boolean;
      }> = [];
      
      for (const [id, entity] of entityManager.getAllEntities()) {
        entities.push({
          id,
          name: entity.name,
          type: entity.type,
          position: entity.node.position.toArray(),
          hasMesh: !!entity.mesh,
          meshType: entity.mesh?.type,
          visible: entity.node.visible && (entity.mesh?.visible ?? true)
        });
      }
      
      console.table(entities);
      return entities;
    },
    
    /**
     * Teleport camera to entity
     */
    goto: (entityId: string) => {
      const entityManager = world.getSystem('rpg-entity-manager') as EntityManager | undefined;
      if (!entityManager) {
        console.error('EntityManager not found');
        return;
      }
      const entity = entityManager.getEntity(entityId);
      
      if (!entity) {
        console.error(`Entity ${entityId} not found`);
        return;
      }
      
      const pos = entity.node.position;
      world.camera.position.set(pos.x + 5, pos.y + 5, pos.z + 5);
      world.camera.lookAt(pos.x, pos.y, pos.z);
      console.log(`📍 Teleported camera to ${entity.name} at`, pos.toArray());
    },
    
    /**
     * List all items with their positions
     */
    items: () => {
      const entityManager = world.getSystem('rpg-entity-manager') as EntityManager | undefined;
      if (!entityManager) {
        console.error('EntityManager not found');
        return [];
      }
      const items: Array<{
        id: string;
        name: string;
        position: number[];
        y: string;
        hasMesh: boolean;
        visible: boolean;
      }> = [];
      
      for (const [id, entity] of entityManager.getAllEntities()) {
        if (entity.type === 'item') {
          const pos = entity.node.position;
          items.push({
            id,
            name: entity.name,
            position: pos.toArray(),
            y: pos.y.toFixed(2),
            hasMesh: !!entity.mesh,
            visible: entity.mesh?.visible ?? false
          });
        }
      }
      
      console.table(items);
      return items;
    },
    
    /**
     * Teleport to first item
     */
    gotoFirstItem: () => {
      const entityManager = world.getSystem('rpg-entity-manager') as EntityManager | undefined;
      if (!entityManager) {
        console.error('EntityManager not found');
        return;
      }
      
      for (const [id, entity] of entityManager.getAllEntities()) {
        if (entity.type === 'item') {
          debug.goto(id);
          return;
        }
      }
      
      console.error('No items found');
    }
  };
  
  // Expose on window
  (window as any).debug = debug;
  
  console.log('🛠️  Debug commands installed on window.debug');
  console.log('Available commands:');
  console.log('  debug.modelCache() - Show model cache stats');
  console.log('  debug.entities() - List all entities');
  console.log('  debug.items() - List all items');
  console.log('  debug.goto(entityId) - Teleport camera to entity');
  console.log('  debug.gotoFirstItem() - Teleport to first item');
  console.log('  debug.clearModelCache() - Clear cache');
}

