/**
 * Data Manager - Centralized Content Database
 * 
 * Provides a single point of access to all externalized data including:
 * - Items and equipment
 * - Mobs and creatures
 * - World areas and spawn points
 * - Treasure locations
 * - Banks and stores
 * - Starting items and equipment requirements
 * 
 * This system validates data on load and provides type-safe access methods.
 */

import { BANKS, GENERAL_STORES } from './banks-stores';
import { equipmentRequirements } from './EquipmentRequirements';
import { ITEMS } from './items';
import { ALL_MOBS, getMobById, getMobsByDifficulty } from './mobs';
import { STARTING_ITEMS } from './starting-items';
import { TREASURE_LOCATIONS, getAllTreasureLocations, getTreasureLocationsByDifficulty } from './treasure-locations';
import { ALL_WORLD_AREAS, STARTER_TOWNS, getMobSpawnsInArea, getNPCsInArea } from './world-areas';

import type { Item } from '../types/core';
import type { MobData } from './mobs';
import type { TreasureLocation } from './treasure-locations';
import type { MobSpawnPoint, NPCLocation, WorldArea } from './world-areas';

/**
 * Data validation results
 */
export interface DataValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  itemCount: number;
  mobCount: number;
  areaCount: number;
  treasureCount: number;
}

/**
 * Centralized Data Manager
 */
export class DataManager {
  private static instance: DataManager;
  private isInitialized = false;
  private validationResult: DataValidationResult | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager();
    }
    return DataManager.instance;
  }

  /**
   * Initialize the data manager and validate all data
   */
  public async initialize(): Promise<DataValidationResult> {
    if (this.isInitialized) {
      return this.validationResult!;
    }

    console.log('[DataManager] Initializing and validating game data...');
    
    this.validationResult = await this.validateAllData();
    this.isInitialized = true;

    if (this.validationResult.isValid) {
      console.log('[DataManager] ✅ All game data loaded and validated successfully');
      console.log(`[DataManager] 📊 Data Summary: ${this.validationResult.itemCount} items, ${this.validationResult.mobCount} mobs, ${this.validationResult.areaCount} areas, ${this.validationResult.treasureCount} treasure locations`);
    } else {
      console.error('[DataManager] ❌ Data validation failed:', this.validationResult.errors);
    }

    return this.validationResult;
  }

  /**
   * Validate all externalized data
   */
  private async validateAllData(): Promise<DataValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate items
    const itemCount = ITEMS.size;
    if (itemCount === 0) {
      errors.push('No items found in ITEMS');
    }

    // Validate mobs
    const mobCount = Object.keys(ALL_MOBS).length;
    if (mobCount === 0) {
      errors.push('No mobs found in ALL_MOBS');
    }

    // Validate world areas
    const areaCount = Object.keys(ALL_WORLD_AREAS).length;
    if (areaCount === 0) {
      errors.push('No world areas found in ALL_WORLD_AREAS');
    }

    // Validate treasure locations
    const treasureCount = Object.keys(TREASURE_LOCATIONS).length;
    if (treasureCount === 0) {
      warnings.push('No treasure locations found in TREASURE_LOCATIONS');
    }

    // Validate cross-references
    this.validateCrossReferences(errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      itemCount,
      mobCount,
      areaCount,
      treasureCount
    };
  }

  /**
   * Validate cross-references between data sets
   */
  private validateCrossReferences(errors: string[], _warnings: string[]): void {
    // Check that mob spawn points reference valid mobs
    for (const [areaId, area] of Object.entries(ALL_WORLD_AREAS)) {
      if (area.mobSpawns) {
        for (const mobSpawn of area.mobSpawns) {
          if (!ALL_MOBS[mobSpawn.mobId]) {
            errors.push(`Area ${areaId} references unknown mob: ${mobSpawn.mobId}`);
          }
        }
      }
    }

    // Check that starter items reference valid items
    for (const startingItem of STARTING_ITEMS) {
      if (!ITEMS.has(startingItem.id)) {
        errors.push(`Starting item references unknown item: ${startingItem.id}`);
      }
    }
  }

  /**
   * Get validation result
   */
  public getValidationResult(): DataValidationResult | null {
    return this.validationResult;
  }

  // =============================================================================
  // ITEM DATA ACCESS METHODS
  // =============================================================================

  /**
   * Get all items
   */
  public getAllItems(): Map<string, Item> {
    return ITEMS;
  }

  /**
   * Get item by ID
   */
  public getItem(itemId: string): Item | null {
    return ITEMS.get(itemId) || null;
  }

  /**
   * Get items by type
   */
  public getItemsByType(itemType: string): Item[] {
    return Array.from(ITEMS.values()).filter(item => item.type === itemType);
  }

  // =============================================================================
  // MOB DATA ACCESS METHODS
  // =============================================================================

  /**
   * Get all mobs
   */
  public getAllMobs(): Record<string, MobData> {
    return ALL_MOBS;
  }

  /**
   * Get mob by ID
   */
  public getMob(mobId: string): MobData | null {
    return getMobById(mobId);
  }

  /**
   * Get mobs by difficulty level
   */
  public getMobsByDifficulty(difficulty: 1 | 2 | 3): MobData[] {
    return getMobsByDifficulty(difficulty);
  }

  // =============================================================================
  // WORLD AREA DATA ACCESS METHODS
  // =============================================================================

  /**
   * Get all world areas
   */
  public getAllWorldAreas(): Record<string, WorldArea> {
    return ALL_WORLD_AREAS;
  }

  /**
   * Get starter towns
   */
  public getStarterTowns(): Record<string, WorldArea> {
    return STARTER_TOWNS;
  }

  /**
   * Get world area by ID
   */
  public getWorldArea(areaId: string): WorldArea | null {
    return ALL_WORLD_AREAS[areaId] || null;
  }

  /**
   * Get mob spawns in area
   */
  public getMobSpawnsInArea(areaId: string): MobSpawnPoint[] {
    return getMobSpawnsInArea(areaId);
  }

  /**
   * Get NPCs in area
   */
  public getNPCsInArea(areaId: string): NPCLocation[] {
    return getNPCsInArea(areaId);
  }

  // =============================================================================
  // TREASURE DATA ACCESS METHODS
  // =============================================================================

  /**
   * Get all treasure locations
   */
  public getAllTreasureLocations(): TreasureLocation[] {
    return getAllTreasureLocations();
  }

  /**
   * Get treasure locations by difficulty
   */
  public getTreasureLocationsByDifficulty(difficulty: 1 | 2 | 3): TreasureLocation[] {
    return getTreasureLocationsByDifficulty(difficulty);
  }

  /**
   * Get treasure location by ID
   */
  public getTreasureLocation(locationId: string): TreasureLocation | null {
    return TREASURE_LOCATIONS[locationId] || null;
  }

  // =============================================================================
  // STORE AND BANK DATA ACCESS METHODS
  // =============================================================================

  /**
   * Get all general stores
   */
  public getGeneralStores() {
    return GENERAL_STORES;
  }

  /**
   * Get all banks
   */
  public getBanks() {
    return BANKS;
  }

  // =============================================================================
  // EQUIPMENT AND STARTING DATA ACCESS METHODS
  // =============================================================================

  /**
   * Get equipment requirements
   */
  public getEquipmentRequirements() {
    return equipmentRequirements;
  }

  /**
   * Get starting items
   */
  public getStartingItems() {
    return STARTING_ITEMS;
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Check if data manager is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get data summary for debugging
   */
  public getDataSummary() {
    if (!this.isInitialized) {
      return 'DataManager not initialized';
    }

    return {
      items: ITEMS.size,
      mobs: Object.keys(ALL_MOBS).length,
      worldAreas: Object.keys(ALL_WORLD_AREAS).length,
      treasureLocations: Object.keys(TREASURE_LOCATIONS).length,
      stores: Object.keys(GENERAL_STORES).length,
      banks: Object.keys(BANKS).length,
      startingItems: STARTING_ITEMS.length,
      isValid: this.validationResult?.isValid || false
    };
  }
}

// Export singleton instance
export const dataManager = DataManager.getInstance();