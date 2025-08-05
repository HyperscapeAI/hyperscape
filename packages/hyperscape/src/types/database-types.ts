/**
 * Database Type Definitions
 * 
 * Centralized database types to eliminate casting and provide strong typing
 */

import type { Knex } from 'knex';

/**
 * Standard database query result shape
 */
export interface DatabaseRow {
  [key: string]: unknown;
}

/**
 * Configuration table row
 */
export interface ConfigRow extends DatabaseRow {
  key: string;
  value: string;
}

/**
 * Users table row
 */
export interface UserRow extends DatabaseRow {
  id: string;
  name: string;
  avatar: string | null;
  roles: string;
  createdAt: string;
}

/**
 * Entities table row
 */
export interface EntityRow extends DatabaseRow {
  id: string;
  data: string; // JSON serialized entity data
}

/**
 * Knex-based database interface with specific table types
 * This matches the structure expected by ServerNetwork and other systems
 */
export interface TypedKnexDatabase {
  // Config table operations
  (table: 'config'): Knex.QueryBuilder<ConfigRow>;
  
  // Users table operations  
  (table: 'users'): Knex.QueryBuilder<UserRow>;
  
  // Entities table operations
  (table: 'entities'): Knex.QueryBuilder<EntityRow>;
  
  // Generic table operations for any other tables
  (table: string): Knex.QueryBuilder<DatabaseRow>;
}

/**
 * Database interface for dependency injection into systems
 * This is the type that should be used in WorldOptions.db
 */
export type SystemDatabase = TypedKnexDatabase;

/**
 * Type guard to check if an object is a valid database instance
 */
export function isDatabaseInstance(db: unknown): db is SystemDatabase {
  return typeof db === 'function' && 
         db !== null && 
         typeof db === 'object' || typeof db === 'function';
}

/**
 * Database query helpers with proper return types
 */
export interface DatabaseHelpers {
  /**
   * Get configuration value by key
   */
  getConfig: (db: SystemDatabase, key: string) => Promise<string | undefined>;
  
  /**
   * Set configuration value
   */
  setConfig: (db: SystemDatabase, key: string, value: string) => Promise<void>;
  
  /**
   * Get user by ID
   */
  getUser: (db: SystemDatabase, userId: string) => Promise<UserRow | undefined>;
  
  /**
   * Create or update user
   */
  upsertUser: (db: SystemDatabase, userData: Omit<UserRow, 'createdAt'> & { createdAt?: string }) => Promise<void>;
}

/**
 * Implementation of database helpers
 */
export const dbHelpers: DatabaseHelpers = {
  async getConfig(db: SystemDatabase, key: string): Promise<string | undefined> {
    const result = await db('config').where('key', key).first();
    return result?.value;
  },

  async setConfig(db: SystemDatabase, key: string, value: string): Promise<void> {
    await db('config')
      .insert({ key, value })
      .onConflict('key')
      .merge({ value });
  },

  async getUser(db: SystemDatabase, userId: string): Promise<UserRow | undefined> {
    return await db('users').where('id', userId).first();
  },

  async upsertUser(db: SystemDatabase, userData: Omit<UserRow, 'createdAt'> & { createdAt?: string }): Promise<void> {
    const userWithTimestamp = {
      ...userData,
      createdAt: userData.createdAt || new Date().toISOString()
    };
    
    await db('users')
      .insert(userWithTimestamp)
      .onConflict('id')
      .merge(userWithTimestamp);
  }
};