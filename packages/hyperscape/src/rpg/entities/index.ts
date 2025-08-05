/**
 * RPG Entity System - Server-authoritative entities
 * Replaces the .hyp app system with full server control
 */

// Re-export types from shared types
export type {
  RPGEntityConfig,
  EntityInteractionData,
  BaseEntityData,
  PlayerEntityData,
  BankEntityData,
  ItemEntityConfig,
  MobEntityConfig,
  NPCEntityConfig,
  ResourceEntityConfig,
  HeadstoneEntityConfig,
  HeadstoneData,
  HealthComponent,
  EntityCombatComponent,
  VisualComponent,
  BankStorageItem,
  Component
} from '../types/entities';

// Export entity classes
export { RPGEntity } from './RPGEntity';

// Specialized base classes
export { CombatantEntity } from './CombatantEntity';
export { InteractableEntity } from './InteractableEntity';
export { StorageEntity } from './StorageEntity';

// Concrete entity classes
export { ItemEntity } from './ItemEntity';
export { MobEntity } from './MobEntity';
export { ResourceEntity } from './ResourceEntity';
export { NPCEntity } from './NPCEntity';
export { PlayerEntity } from './PlayerEntity';
export { BankEntity } from './BankEntity';
export { HeadstoneEntity } from './HeadstoneEntity';