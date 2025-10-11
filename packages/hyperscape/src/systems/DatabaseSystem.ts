import { ITEMS } from '../data/items'
import {
  EquipmentRow,
  EquipmentSaveItem,
  InventoryRow,
  InventorySaveItem,
  ItemRow,
  PlayerRow,
  PlayerSessionRow,
  SQLiteDatabase,
  WorldChunkRow,
} from '../types/database'
import type { World } from '../types/index'
import { SystemBase } from './SystemBase'

export class DatabaseSystem extends SystemBase {
  private db: SQLiteDatabase | null = null
  private dbPath: string

  private getDb(): SQLiteDatabase {
    if (!this.db) {
      throw new Error('[DatabaseSystem] Database not initialized - call init() first')
    }
    return this.db
  }

  constructor(world: World) {
    super(world, {
      name: 'rpg-database',
      dependencies: {
        required: [], // Foundational system - no dependencies
        optional: [], // Self-contained database layer
      },
      autoCleanup: true,
    })

    // Use appropriate database path based on environment
    const serverWorld = this.world as { isServer?: boolean }
    if (serverWorld.isServer) {
      // Will be resolved in initializeDependencies() with dynamic imports
      this.dbPath = 'world/db.sqlite'
    } else {
      this.dbPath = ':memory:'
    }
  }

  private async initializeDependencies(): Promise<void> {
    const serverWorld = this.world as { isServer?: boolean }
    if (serverWorld.isServer) {
      // Dynamically import Node.js modules only for server
      const fs = await import('fs-extra')
      const path = await import('node:path')
      
      // Set up the proper database path
      const envWorld = process.env['WORLD'] || 'world'
      const worldDir = path.isAbsolute(envWorld) ? envWorld : path.join(process.cwd(), envWorld)
      
      // Ensure the world directory exists before opening the database
      try {
        fs.ensureDirSync(worldDir)
      } catch (_err) {
        // best effort; opening DB will throw if still missing
      }
      
      // Align DB filename with server usage
      this.dbPath = path.join(worldDir, 'db.sqlite')
      
      // Check if there's an existing raw database connection we can reuse
      const worldWithRawDb = this.world as { rawDb?: SQLiteDatabase }
      if (worldWithRawDb.rawDb) {
        // Reuse the existing raw database connection from the world
        this.db = worldWithRawDb.rawDb
        console.log('DatabaseSystem', 'Reusing existing raw database connection from world')
        return
      }

      const isBun = typeof process !== 'undefined' && !!(process as unknown as { versions?: { bun?: string } }).versions?.bun
      // Ensure directory still exists (in case constructor path resolution changed)
      try {
        fs.ensureDirSync(path.dirname(this.dbPath))
      } catch {}
      if (isBun) {
        const bunSqlite = (await import('bun:sqlite')) as unknown as { Database: new (path: string) => unknown }
        const BunDatabase = bunSqlite.Database
        const bunDb = new BunDatabase(this.dbPath) as unknown as {
          prepare?: (sql: string) => unknown
          query?: (sql: string) => unknown
          exec: (sql: string) => unknown
          close: () => unknown
        }

        // Create a thin adapter to our SQLiteDatabase interface
        const adapter: SQLiteDatabase = {
          prepare: (sql: string) => {
            const stmt = (bunDb.prepare ? bunDb.prepare(sql) : bunDb.query!(sql)) as unknown as {
              get: (...params: unknown[]) => unknown
              all: (...params: unknown[]) => unknown[]
              run: (...params: unknown[]) => unknown
            }
            return {
              get: <T = Record<string, unknown>>(...params: unknown[]): T | undefined => stmt.get(...params) as T | undefined,
              all: <T = Record<string, unknown>>(...params: unknown[]): T[] => stmt.all(...params) as T[],
              run: (...params: unknown[]) => {
                const result = stmt.run(...params) as { changes?: number; lastInsertRowid?: number } | void
                if (result && typeof result === 'object') {
                  return {
                    changes: Number((result as { changes?: number }).changes ?? 0),
                    lastInsertRowid: Number((result as { lastInsertRowid?: number }).lastInsertRowid ?? 0),
                  }
                }
                return { changes: 0, lastInsertRowid: 0 }
              },
            }
          },
          exec: (sql: string) => {
            bunDb.exec(sql)
          },
          close: () => {
            bunDb.close()
          },
          pragma: <T = unknown>(name: string, value?: string | number | boolean): T => {
            const sql = value === undefined ? `PRAGMA ${name}` : `PRAGMA ${name}=${String(value)}`
            try {
              const stmt = (bunDb.prepare ? bunDb.prepare(sql) : bunDb.query!(sql)) as unknown as { get: () => T }
              return stmt.get()
            } catch {
              bunDb.exec(sql)
              return undefined as unknown as T
            }
          },
        }

        this.db = adapter
        this.db.pragma('journal_mode = WAL')
        this.db.pragma('synchronous = NORMAL')
        this.db.pragma('foreign_keys = ON')
        this.db.pragma('busy_timeout = 5000')
        
        // Store the raw database connection on the world for sharing
        const worldToShare = this.world as { rawDb?: SQLiteDatabase }
        worldToShare.rawDb = adapter
        
        console.log('DatabaseSystem', 'Initialized SQLite via bun:sqlite with WAL mode')
      } else {
        // Node.js runtime: use better-sqlite3
        const better = (await import('better-sqlite3')) as unknown as { default?: new (path: string) => unknown } & (new (path: string) => unknown)
        const BetterSqlite3 = (better as unknown as { default?: new (path: string) => unknown }).default ?? (better as unknown as new (path: string) => unknown)
        const nodeDb = new (BetterSqlite3 as new (path: string) => unknown)(this.dbPath) as unknown as {
          prepare: (sql: string) => unknown
          exec: (sql: string) => unknown
          close: () => unknown
          pragma: (name: string) => unknown
        }

        const adapter: SQLiteDatabase = {
          prepare: (sql: string) => {
            const stmt = nodeDb.prepare(sql) as unknown as {
              get: (...params: unknown[]) => unknown
              all: (...params: unknown[]) => unknown[]
              run: (...params: unknown[]) => unknown
            }
            return {
              get: <T = Record<string, unknown>>(...params: unknown[]): T | undefined => stmt.get(...params) as T | undefined,
              all: <T = Record<string, unknown>>(...params: unknown[]): T[] => stmt.all(...params) as T[],
              run: (...params: unknown[]) => {
                const result = stmt.run(...params) as { changes?: number; lastInsertRowid?: number } | void
                if (result && typeof result === 'object') {
                  return {
                    changes: Number((result as { changes?: number }).changes ?? 0),
                    lastInsertRowid: Number((result as { lastInsertRowid?: number }).lastInsertRowid ?? 0),
                  }
                }
                return { changes: 0, lastInsertRowid: 0 }
              },
            }
          },
          exec: (sql: string) => {
            nodeDb.exec(sql)
          },
          close: () => {
            nodeDb.close()
          },
          pragma: <T = unknown>(name: string, value?: string | number | boolean): T => {
            // better-sqlite3 supports .pragma("key = value") or .pragma("key")
            if (value === undefined) {
              return (nodeDb.pragma(`PRAGMA ${name}`) as unknown) as T
            }
            nodeDb.exec(`PRAGMA ${name}=${String(value)}`)
            return undefined as unknown as T
          },
        }

        this.db = adapter
        this.db.pragma('journal_mode', 'WAL')
        this.db.pragma('synchronous', 'NORMAL')
        this.db.pragma('foreign_keys', 'ON')
        this.db.pragma('busy_timeout', 5000)
        
        // Store the raw database connection on the world for sharing
        const worldToShare = this.world as { rawDb?: SQLiteDatabase }
        worldToShare.rawDb = adapter
        
        console.log('DatabaseSystem', 'Initialized SQLite via better-sqlite3 with WAL mode')
      }
    } else {
      console.warn('DatabaseSystem', 'Running on client - creating mock database')
      this.db = this.createMockDatabase()
    }
  }

  async init(): Promise<void> {
    await this.initializeDependencies()

    if (!this.db) {
      throw new Error('[DatabaseSystem] Database initialization failed')
    }

    try {
      // Check if we're using mock database by trying to actually use it
      let isMockDatabase = false
      try {
        // Try to prepare and execute a simple query
        const testQuery = this.getDb().prepare('SELECT 1 as test')
        const result = testQuery.get()
        isMockDatabase = !result || result === null
      } catch {
        // If prepare or get throws, it's a mock database
        isMockDatabase = true
      }

      if (!isMockDatabase) {
        // Run database migrations only for real database
        await this.runMigrations()

        // Seed initial data if needed
        await this.seedInitialData()

        console.log('DatabaseSystem', 'Database initialized successfully')
      } else {
        console.log('DatabaseSystem', 'Mock database initialized - skipping migrations and seeding')
      }
    } catch (error) {
      console.error(
        'DatabaseSystem',
        'Database initialization failed:',
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  start(): void {
    console.log('DatabaseSystem', 'Database system started')
  }

  // --- Characters API (now the primary player data store) ---
  getCharacters(accountId: string): Array<{ id: string; name: string }> {
    try {
      const rows = this.getDb()
        .prepare('SELECT id, name FROM rpg_characters WHERE accountId = ? ORDER BY createdAt ASC')
        .all(accountId) as Array<{ id: string; name: string }>
      return rows || []
    } catch {
      return []
    }
  }

  createCharacter(accountId: string, id: string, name: string): boolean {
    try {
      // Create character with default stats (same as old rpg_players defaults)
      this.getDb()
        .prepare(`INSERT INTO rpg_characters (
          id, accountId, name, 
          combatLevel, attackLevel, strengthLevel, defenseLevel, constitutionLevel, rangedLevel,
          woodcuttingLevel, fishingLevel, firemakingLevel, cookingLevel,
          attackXp, strengthXp, defenseXp, constitutionXp, rangedXp,
          woodcuttingXp, fishingXp, firemakingXp, cookingXp,
          health, maxHealth, coins,
          positionX, positionY, positionZ,
          createdAt, lastLogin
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id, accountId, name,
          1, 1, 1, 1, 10, 1, // combat, attack, strength, defense, constitution, ranged
          1, 1, 1, 1, // woodcutting, fishing, firemaking, cooking
          0, 0, 0, 1154, 0, // XP: attack, strength, defense, constitution, ranged
          0, 0, 0, 0, // XP: woodcutting, fishing, firemaking, cooking
          100, 100, 0, // health, maxHealth, coins
          0, 10, 0, // positionX, positionY (safe default), positionZ
          Date.now(), Date.now() // createdAt, lastLogin
        )
      return true
    } catch (err) {
      console.error('[DatabaseSystem] Failed to create character:', err)
      return false
    }
  }

  destroy(): void {
    // Close database connection safely
    if (this.db) {
      try {
        // Close database connection if method exists
        if ('close' in this.db) {
          this.db.close()
        }
        console.log('DatabaseSystem', 'Database connection closed')
      } catch (error) {
        console.error(
          'DatabaseSystem',
          'Error closing database:',
          error instanceof Error ? error : new Error(String(error))
        )
      }
    }

    // Database reference will be cleaned up by parent

    // Call parent cleanup (handles any managed resources)
    super.destroy()
  }

  private async runMigrations(): Promise<void> {
    // Create tables if they don't exist
    await this.executeMigrationSQL('create_players_table')
    await this.executeMigrationSQL('create_items_table')
    await this.executeMigrationSQL('create_inventory_table')
    await this.executeMigrationSQL('create_equipment_table')
    await this.executeMigrationSQL('create_world_chunks_table')
    await this.executeMigrationSQL('create_player_sessions_table')
    await this.executeMigrationSQL('create_chunk_activity_table')
    await this.executeMigrationSQL('create_characters_table')
    await this.executeMigrationSQL('expand_characters_table_noop')
    
    // Conditionally add columns to rpg_characters if they don't exist
    await this.ensureCharactersColumns()

    // Add missing columns to existing tables
    try {
      // Check if lastActivity column exists
      const tableInfo = this.getDb().prepare('PRAGMA table_info(rpg_player_sessions)').all()
      const hasLastActivity = tableInfo.some((col: Record<string, unknown>) => col.name === 'lastActivity')

      if (!hasLastActivity) {
        await this.executeMigrationSQL('add_lastActivity_to_sessions')
        // Update existing rows with current timestamp
        this.getDb().prepare(`UPDATE rpg_player_sessions SET lastActivity = ? WHERE lastActivity = 0`).run(Date.now())
        console.log('DatabaseSystem', 'Added missing lastActivity column to rpg_player_sessions table')
      }
    } catch (_error) {
      // If the table doesn't exist, it will be created with the column
      console.log('DatabaseSystem', 'Player sessions table will be created with all columns')
    }

    // Check if needsReset column exists in rpg_world_chunks
    try {
      const chunkTableInfo = this.getDb().prepare('PRAGMA table_info(rpg_world_chunks)').all()
      const hasNeedsReset = chunkTableInfo.some((col: Record<string, unknown>) => col.name === 'needsReset')

      if (!hasNeedsReset) {
        // Add the needsReset column to existing table
        this.getDb().prepare(`ALTER TABLE rpg_world_chunks ADD COLUMN needsReset INTEGER DEFAULT 0`).run()
        console.log('DatabaseSystem', 'Added missing needsReset column to rpg_world_chunks table')
      }
    } catch (_error) {
      // If the table doesn't exist, it will be created with the column
      console.log('DatabaseSystem', 'World chunks table will be created with all columns')
    }
  }

  private async ensureCharactersColumns(): Promise<void> {
    try {
      const tableInfo = this.getDb().prepare('PRAGMA table_info(rpg_characters)').all() as Array<{ name: string }>
      const existingColumns = new Set(tableInfo.map(col => col.name))
      
      const columnsToAdd = [
        { name: 'combatLevel', sql: 'ALTER TABLE rpg_characters ADD COLUMN combatLevel INTEGER DEFAULT 1' },
        { name: 'attackLevel', sql: 'ALTER TABLE rpg_characters ADD COLUMN attackLevel INTEGER DEFAULT 1' },
        { name: 'strengthLevel', sql: 'ALTER TABLE rpg_characters ADD COLUMN strengthLevel INTEGER DEFAULT 1' },
        { name: 'defenseLevel', sql: 'ALTER TABLE rpg_characters ADD COLUMN defenseLevel INTEGER DEFAULT 1' },
        { name: 'constitutionLevel', sql: 'ALTER TABLE rpg_characters ADD COLUMN constitutionLevel INTEGER DEFAULT 10' },
        { name: 'rangedLevel', sql: 'ALTER TABLE rpg_characters ADD COLUMN rangedLevel INTEGER DEFAULT 1' },
        { name: 'woodcuttingLevel', sql: 'ALTER TABLE rpg_characters ADD COLUMN woodcuttingLevel INTEGER DEFAULT 1' },
        { name: 'fishingLevel', sql: 'ALTER TABLE rpg_characters ADD COLUMN fishingLevel INTEGER DEFAULT 1' },
        { name: 'firemakingLevel', sql: 'ALTER TABLE rpg_characters ADD COLUMN firemakingLevel INTEGER DEFAULT 1' },
        { name: 'cookingLevel', sql: 'ALTER TABLE rpg_characters ADD COLUMN cookingLevel INTEGER DEFAULT 1' },
        { name: 'attackXp', sql: 'ALTER TABLE rpg_characters ADD COLUMN attackXp INTEGER DEFAULT 0' },
        { name: 'strengthXp', sql: 'ALTER TABLE rpg_characters ADD COLUMN strengthXp INTEGER DEFAULT 0' },
        { name: 'defenseXp', sql: 'ALTER TABLE rpg_characters ADD COLUMN defenseXp INTEGER DEFAULT 0' },
        { name: 'constitutionXp', sql: 'ALTER TABLE rpg_characters ADD COLUMN constitutionXp INTEGER DEFAULT 1154' },
        { name: 'rangedXp', sql: 'ALTER TABLE rpg_characters ADD COLUMN rangedXp INTEGER DEFAULT 0' },
        { name: 'woodcuttingXp', sql: 'ALTER TABLE rpg_characters ADD COLUMN woodcuttingXp INTEGER DEFAULT 0' },
        { name: 'fishingXp', sql: 'ALTER TABLE rpg_characters ADD COLUMN fishingXp INTEGER DEFAULT 0' },
        { name: 'firemakingXp', sql: 'ALTER TABLE rpg_characters ADD COLUMN firemakingXp INTEGER DEFAULT 0' },
        { name: 'cookingXp', sql: 'ALTER TABLE rpg_characters ADD COLUMN cookingXp INTEGER DEFAULT 0' },
        { name: 'health', sql: 'ALTER TABLE rpg_characters ADD COLUMN health INTEGER DEFAULT 100' },
        { name: 'maxHealth', sql: 'ALTER TABLE rpg_characters ADD COLUMN maxHealth INTEGER DEFAULT 100' },
        { name: 'coins', sql: 'ALTER TABLE rpg_characters ADD COLUMN coins INTEGER DEFAULT 0' },
        { name: 'positionX', sql: 'ALTER TABLE rpg_characters ADD COLUMN positionX REAL DEFAULT 0' },
        { name: 'positionY', sql: 'ALTER TABLE rpg_characters ADD COLUMN positionY REAL DEFAULT 10' },
        { name: 'positionZ', sql: 'ALTER TABLE rpg_characters ADD COLUMN positionZ REAL DEFAULT 0' },
        { name: 'lastLogin', sql: 'ALTER TABLE rpg_characters ADD COLUMN lastLogin INTEGER DEFAULT 0' },
      ]
      
      for (const col of columnsToAdd) {
        if (!existingColumns.has(col.name)) {
          try {
            this.getDb().exec(col.sql)
            console.log(`[DatabaseSystem] Added column ${col.name} to rpg_characters`)
          } catch (err) {
            // Ignore errors (column might have been added by concurrent migration)
          }
        }
      }
    } catch (err) {
      console.error('[DatabaseSystem] Failed to ensure rpg_characters columns:', err)
    }
  }

  private async executeMigrationSQL(migrationName: string): Promise<void> {
    const migrations: Record<string, string> = {
      create_players_table: `
        CREATE TABLE IF NOT EXISTS rpg_players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
          playerId TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          combatLevel INTEGER DEFAULT 1,
          attackLevel INTEGER DEFAULT 1,
          strengthLevel INTEGER DEFAULT 1,
          defenseLevel INTEGER DEFAULT 1,
          constitutionLevel INTEGER DEFAULT 10,
          rangedLevel INTEGER DEFAULT 1,
          attackXp INTEGER DEFAULT 0,
          strengthXp INTEGER DEFAULT 0,
          defenseXp INTEGER DEFAULT 0,
          constitutionXp INTEGER DEFAULT 1154,
          rangedXp INTEGER DEFAULT 0,
          health INTEGER DEFAULT 100,
          maxHealth INTEGER DEFAULT 100,
          coins INTEGER DEFAULT 0,
          positionX REAL DEFAULT 0,
          positionY REAL DEFAULT 0,
          positionZ REAL DEFAULT 0,
          lastLogin INTEGER DEFAULT 0,
          createdAt INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `,
      create_items_table: `
        CREATE TABLE IF NOT EXISTS rpg_items (
          id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
          type TEXT NOT NULL,
          description TEXT,
          value INTEGER DEFAULT 0,
          weight REAL DEFAULT 0,
          stackable INTEGER DEFAULT 0,
          tradeable INTEGER DEFAULT 1,
          attackLevel INTEGER,
          strengthLevel INTEGER,
          defenseLevel INTEGER,
          rangedLevel INTEGER,
          attackBonus INTEGER DEFAULT 0,
          strengthBonus INTEGER DEFAULT 0,
          defenseBonus INTEGER DEFAULT 0,
          rangedBonus INTEGER DEFAULT 0,
          heals INTEGER
        )
      `,
      create_inventory_table: `
          CREATE TABLE IF NOT EXISTS rpg_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
          playerId TEXT NOT NULL,
          itemId TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
          slotIndex INTEGER DEFAULT -1,
          metadata TEXT,
          FOREIGN KEY (playerId) REFERENCES rpg_players(playerId) ON DELETE CASCADE
        )
      `,
      create_equipment_table: `
          CREATE TABLE IF NOT EXISTS rpg_equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
          playerId TEXT NOT NULL,
          slotType TEXT NOT NULL,
          itemId TEXT,
            quantity INTEGER DEFAULT 1,
          UNIQUE(playerId, slotType),
          FOREIGN KEY (playerId) REFERENCES rpg_players(playerId) ON DELETE CASCADE
        )
      `,
      create_world_chunks_table: `
        CREATE TABLE IF NOT EXISTS rpg_world_chunks (
          chunkX INTEGER NOT NULL,
          chunkZ INTEGER NOT NULL,
          data TEXT NOT NULL,
          lastActive INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          playerCount INTEGER DEFAULT 0,
          version INTEGER DEFAULT 1,
          needsReset INTEGER DEFAULT 0,
          PRIMARY KEY (chunkX, chunkZ)
        )
      `,
      create_player_sessions_table: `
        CREATE TABLE IF NOT EXISTS rpg_player_sessions (
          id TEXT PRIMARY KEY,
          playerId TEXT NOT NULL,
          sessionStart INTEGER NOT NULL,
          sessionEnd INTEGER,
          playtimeMinutes INTEGER DEFAULT 0,
          reason TEXT,
          lastActivity INTEGER DEFAULT 0,
          FOREIGN KEY (playerId) REFERENCES rpg_players(playerId) ON DELETE CASCADE
        )
      `,
      create_chunk_activity_table: `
        CREATE TABLE IF NOT EXISTS rpg_chunk_activity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chunkX INTEGER NOT NULL,
          chunkZ INTEGER NOT NULL,
          playerId TEXT NOT NULL,
          entryTime INTEGER NOT NULL,
          exitTime INTEGER,
          FOREIGN KEY (playerId) REFERENCES rpg_players(playerId) ON DELETE CASCADE
        )
      `,
      add_lastActivity_to_sessions: `
        ALTER TABLE rpg_player_sessions 
        ADD COLUMN lastActivity INTEGER DEFAULT 0;
        
        UPDATE rpg_player_sessions 
        SET lastActivity = (strftime('%s', 'now') * 1000) 
        WHERE lastActivity = 0;
      `,
      create_characters_table: `
        CREATE TABLE IF NOT EXISTS rpg_characters (
          id TEXT PRIMARY KEY,
          accountId TEXT NOT NULL,
          name TEXT NOT NULL,
          createdAt INTEGER DEFAULT (strftime('%s','now') * 1000)
        );
        CREATE INDEX IF NOT EXISTS idx_characters_account ON rpg_characters(accountId);
      `,
      expand_characters_table_noop: `
        -- Migration handled via post-create column checks below
        SELECT 1;
      `,
    }

    const sql = migrations[migrationName]
    if (!sql) {
      throw new Error(`Unknown migration: ${migrationName}`)
    }

    try {
      this.getDb().exec(sql)
    } catch (error) {
      console.error(`[DatabaseSystem] Migration failed: ${migrationName}`, error)
      throw error
    }
  }

  private async seedInitialData(): Promise<void> {
    try {
      // Check if items table is empty and seed basic items
      const countQuery = this.db?.prepare('SELECT COUNT(*) as count FROM rpg_items')
      if (!countQuery) {
        console.warn('DatabaseSystem', 'Cannot seed data - database not properly initialized')
        return
      }

      const itemCount = countQuery.get() as { count: number } | null
      if (!itemCount) {
        console.warn('DatabaseSystem', 'Cannot get item count - skipping seeding')
        return
      }

      if (itemCount.count === 0) {
        // Convert externalized item data to database format
        const items = Array.from(ITEMS.values()).map((item, index) => ({
          id: parseInt(item.id) || index + 1, // Use parsed ID or fallback to index
          name: item.name,
          type: item.type.toLowerCase(),
          description: item.description || '',
          value: item.value || 0,
          weight: item.weight || 0,
          stackable: item.stackable ? 1 : 0,
          attackLevel: item.requirements?.skills?.attack || null,
          defenseLevel: item.requirements?.skills?.defense || null,
          rangedLevel: item.requirements?.skills?.ranged || null,
          attackBonus: item.bonuses?.attack || 0,
          defenseBonus: item.bonuses?.defense || 0,
          rangedBonus: item.bonuses?.ranged || 0,
          heals: item.healAmount || null,
        }))

        const insertItem = this.db?.prepare(`
          INSERT INTO rpg_items (id, name, type, description, value, weight, stackable, attackLevel, defenseLevel, rangedLevel, attackBonus, defenseBonus, rangedBonus, heals)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        if (!insertItem) {
          console.warn('DatabaseSystem', 'Cannot prepare insert statement - skipping seeding')
          return
        }

        for (const item of items) {
          insertItem.run(
            item.id,
            item.name,
            item.type,
            item.description,
            item.value,
            item.weight,
            item.stackable || 0,
            item.attackLevel || null,
            item.defenseLevel || null,
            item.rangedLevel || null,
            item.attackBonus || 0,
            item.defenseBonus || 0,
            item.rangedBonus || 0,
            item.heals || null
          )
        }

        console.log(`[DatabaseSystem] Seeded ${items.length} items from externalized data`)
      }
    } catch (error) {
      console.warn('DatabaseSystem', 'Failed to seed initial data:', { error })
      // Don't throw - this is not critical for mock databases
    }
  }

  // Player data methods with proper typing (now uses rpg_characters as primary table)
  getPlayer(playerId: string): PlayerRow | null {
    try {
      // Query rpg_characters using characterId (which IS the playerId in character-select mode)
      const result = this.getDb()
        .prepare(`SELECT * FROM rpg_characters WHERE id = ?`)
        .get(playerId) as PlayerRow | undefined

      // Map column names to PlayerRow interface (rpg_characters has slightly different names)
      if (result) {
        return {
          ...result,
          playerId: String(result.id), // Map id to playerId for compatibility
        } as unknown as PlayerRow
      }
      return null
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error getting player data:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return null
    }
  }

  savePlayer(playerId: string, data: Partial<PlayerRow>): void {
    try {
      // Save to rpg_characters using characterId (playerId)
      const existing = this.getPlayer(playerId)

      if (existing) {
        this.updatePlayer(playerId, data)
      } else {
        // Character should already exist from character creation; if not, log warning
        console.warn(`[DatabaseSystem] Attempted to save non-existent character ${playerId}, creating with defaults`)
        this.createNewPlayer(playerId, data)
      }
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error saving player data:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
    }
  }

  private createNewPlayer(playerId: string, data: Partial<PlayerRow>): void {
    // Insert into rpg_characters (merged table) - accountId is required
    // If this is called, it means character wasn't created via createCharacter, so we need accountId
    // For now, use a placeholder; ideally this should never be called in character-select mode
    const accountId = 'unknown'
    const insertPlayer = this.getDb().prepare(`
      INSERT INTO rpg_characters (
        id, accountId, name, 
        combatLevel, attackLevel, strengthLevel, defenseLevel, constitutionLevel, rangedLevel,
        woodcuttingLevel, fishingLevel, firemakingLevel, cookingLevel,
        attackXp, strengthXp, defenseXp, constitutionXp, rangedXp,
        woodcuttingXp, fishingXp, firemakingXp, cookingXp,
        health, maxHealth, coins,
        positionX, positionY, positionZ,
        createdAt, lastLogin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    insertPlayer.run(
      playerId,
      accountId,
      data.name || `Player_${playerId}`,
      data.combatLevel || 1,
      data.attackLevel || 1,
      data.strengthLevel || 1,
      data.defenseLevel || 1,
      data.constitutionLevel || 10,
      data.rangedLevel || 1,
      1, 1, 1, 1, // woodcutting, fishing, firemaking, cooking
      data.attackXp || 0,
      data.strengthXp || 0,
      data.defenseXp || 0,
      data.constitutionXp || 1154,
      data.rangedXp || 0,
      0, 0, 0, 0, // woodcutting, fishing, firemaking, cooking XP
      data.health || 100,
      data.maxHealth || 100,
      data.coins || 0,
      data.positionX || 0,
      data.positionY || 10,
      data.positionZ || 0,
      Date.now(),
      Date.now()
    )

    // Initialize starting equipment
    this.initializeStartingEquipment(playerId)
  }

  private updatePlayer(playerId: string, data: Partial<PlayerRow>): void {
    const fields: string[] = []
    const values: (string | number)[] = []

    // Build dynamic update query (now targets rpg_characters)
    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'playerId' && value !== undefined) {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    })

    if (fields.length === 0) return

    values.push(playerId)

    const updateQuery = `UPDATE rpg_characters SET ${fields.join(', ')} WHERE id = ?`
    this.getDb()
      .prepare(updateQuery)
      .run(...values)
  }

  private initializeStartingEquipment(playerId: string): void {
    // Give starting bronze sword
    const insertEquipment = this.getDb().prepare(`
      INSERT INTO rpg_equipment (playerId, slotType, itemId, quantity)
      VALUES (?, ?, ?, ?)
    `)

    insertEquipment.run(playerId, 'weapon', '1', 1)
  }

  // Inventory methods with proper typing
  getPlayerInventory(playerId: string): InventoryRow[] {
    try {
      const results = this.getDb()
        .prepare(
          `
        SELECT * FROM rpg_inventory WHERE playerId = ? ORDER BY slotIndex
      `
        )
        .all(playerId) as InventoryRow[]

      return results.map(row => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
      }))
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error getting inventory:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return []
    }
  }

  savePlayerInventory(playerId: string, inventory: InventorySaveItem[]): void {
    try {
      // Clear existing inventory
      this.getDb().prepare('DELETE FROM rpg_inventory WHERE playerId = ?').run(playerId)

      // Insert new inventory items
      const insertItem = this.getDb().prepare(`
        INSERT INTO rpg_inventory (playerId, itemId, quantity, slotIndex, metadata)
        VALUES (?, ?, ?, ?, ?)
    `)

      for (const item of inventory) {
        insertItem.run(
          playerId,
          item.itemId,
          item.quantity || 1,
          item.slotIndex || -1,
          item.metadata ? JSON.stringify(item.metadata) : null
        )
      }
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error saving inventory:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
    }
  }

  // Equipment methods with proper typing
  getPlayerEquipment(playerId: string): EquipmentRow[] {
    try {
      const results = this.getDb()
        .prepare(
          `
        SELECT * FROM rpg_equipment WHERE playerId = ?
      `
        )
        .all(playerId) as EquipmentRow[]

      return results
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error getting equipment:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return []
    }
  }

  savePlayerEquipment(playerId: string, equipment: EquipmentSaveItem[]): void {
    try {
      // Clear existing equipment
      this.getDb().prepare('DELETE FROM rpg_equipment WHERE playerId = ?').run(playerId)

      // Insert new equipment
      const insertEquipment = this.getDb().prepare(`
        INSERT INTO rpg_equipment (playerId, slotType, itemId, quantity)
        VALUES (?, ?, ?, ?)
    `)

      for (const item of equipment) {
        insertEquipment.run(playerId, item.slotType, item.itemId, item.quantity || 1)
      }
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error saving equipment:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
    }
  }

  // Item methods with proper typing
  getItem(itemId: number): ItemRow | null {
    try {
      const result = this.getDb().prepare('SELECT * FROM rpg_items WHERE id = ?').get(itemId) as ItemRow | undefined
      return result || null
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error getting item:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return null
    }
  }

  getAllItems(): ItemRow[] {
    try {
      const results = this.getDb().prepare('SELECT * FROM rpg_items ORDER BY id').all() as ItemRow[]
      return results
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error getting all items:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return []
    }
  }

  // World chunk methods with proper typing
  getWorldChunk(chunkX: number, chunkZ: number): WorldChunkRow | null {
    try {
      const result = this.getDb()
        .prepare(
          `
        SELECT chunkX, chunkZ, data, lastActive, playerCount, version 
        FROM rpg_world_chunks WHERE chunkX = ? AND chunkZ = ?
      `
        )
        .get(chunkX, chunkZ) as WorldChunkRow | undefined

      if (result) {
        return result
      }

      return null
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error getting world chunk:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return null
    }
  }

  saveWorldChunk(chunkData: {
    chunkX: number
    chunkZ: number
    biome?: string
    heightData?: number[]
    chunkSeed?: number
    lastActiveTime?: number | Date
    playerCount?: number
    data?: string
  }): void {
    try {
      // First check if we need a simple save (matching the simple table schema)
      if (chunkData.data) {
        // Simple save for compatibility with existing table structure
        const upsertChunk = this.getDb().prepare(`
          INSERT OR REPLACE INTO rpg_world_chunks (
            chunkX, chunkZ, data, lastActive, playerCount, version
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `)

        upsertChunk.run(
          chunkData.chunkX,
          chunkData.chunkZ,
          chunkData.data,
          chunkData.lastActiveTime ? new Date(chunkData.lastActiveTime).getTime() : Date.now(),
          chunkData.playerCount || 0,
          1 // version
        )
      } else {
        // Extended save - need to create JSON data from individual fields
        const dataObject = {
          biome: chunkData.biome || 'grassland',
          heightData: chunkData.heightData || [],
          chunkSeed: chunkData.chunkSeed || 0,
        }

        const upsertChunk = this.getDb().prepare(`
          INSERT OR REPLACE INTO rpg_world_chunks (
            chunkX, chunkZ, data, lastActive, playerCount, version
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `)

        upsertChunk.run(
          chunkData.chunkX,
          chunkData.chunkZ,
          JSON.stringify(dataObject),
          chunkData.lastActiveTime ? new Date(chunkData.lastActiveTime).getTime() : Date.now(),
          chunkData.playerCount || 0,
          1 // version
        )
      }
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error saving world chunk:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
    }
  }

  getInactiveChunks(inactiveMinutes: number = 15): WorldChunkRow[] {
    try {
      const cutoffTime = new Date(Date.now() - inactiveMinutes * 60 * 1000).toISOString()
      const results = this.getDb()
        .prepare(
          `
        SELECT chunkX, chunkZ, data, lastActive, playerCount, version 
        FROM rpg_world_chunks 
        WHERE lastActive < ? AND playerCount = 0
      `
        )
        .all(cutoffTime) as WorldChunkRow[]

      return results
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error getting inactive chunks:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return []
    }
  }

  markChunkForReset(chunkX: number, chunkZ: number): void {
    try {
      this.getDb()
        .prepare(
          `
        UPDATE rpg_world_chunks SET needsReset = 1 WHERE chunkX = ? AND chunkZ = ?
      `
        )
        .run(chunkX, chunkZ)
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error marking chunk for reset:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
    }
  }

  resetChunk(chunkX: number, chunkZ: number): void {
    try {
      this.getDb()
        .prepare(
          `
        DELETE FROM rpg_world_chunks WHERE chunkX = ? AND chunkZ = ?
      `
        )
        .run(chunkX, chunkZ)
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error resetting chunk:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
    }
  }

  updateChunkPlayerCount(chunkX: number, chunkZ: number, playerCount: number): void {
    try {
      this.getDb()
        .prepare(
          `
        UPDATE rpg_world_chunks 
        SET playerCount = ?, lastActive = ? 
        WHERE chunkX = ? AND chunkZ = ?
      `
        )
        .run(playerCount, Date.now(), chunkX, chunkZ)
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error updating chunk player count:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
    }
  }

  // Session tracking methods with proper typing
  createPlayerSession(sessionData: Omit<PlayerSessionRow, 'id' | 'sessionId'>): string {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // First ensure the player exists (create a default player if not)
      const playerExists = this.getDb()
        .prepare('SELECT playerId FROM rpg_players WHERE playerId = ?')
        .get(sessionData.playerId);
      
      if (!playerExists) {
        // Create a default player record with correct column names
        this.getDb()
          .prepare(`
            INSERT OR IGNORE INTO rpg_players (
              playerId, name, combatLevel, attackLevel, strengthLevel, 
              defenseLevel, constitutionLevel, rangedLevel,
              attackXp, strengthXp, defenseXp, constitutionXp, rangedXp,
              health, maxHealth, coins, 
              positionX, positionY, positionZ, lastLogin
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            sessionData.playerId,
            `Player_${sessionData.playerId.substring(0, 8)}`, // name
            1, // combatLevel
            1, // attackLevel
            1, // strengthLevel
            1, // defenseLevel
            10, // constitutionLevel
            1, // rangedLevel
            0, // attackXp
            0, // strengthXp
            0, // defenseXp
            1154, // constitutionXp
            0, // rangedXp
            100, // health
            100, // maxHealth
            0, // coins
            0, // positionX
            0, // positionY
            0, // positionZ
            Date.now() // lastLogin
          );
        
        console.log(`DatabaseSystem: Created default player record for ${sessionData.playerId}`);
      }

      // Now create the session
      this.getDb()
        .prepare(
          `
        INSERT INTO rpg_player_sessions (id, playerId, sessionStart, sessionEnd, playtimeMinutes, reason)
        VALUES (?, ?, ?, ?, ?, ?)
    `
        )
        .run(
          sessionId,
          sessionData.playerId,
          sessionData.sessionStart,
          sessionData.sessionEnd,
          sessionData.playtimeMinutes,
          sessionData.reason
        )

      return sessionId
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error creating player session:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return ''
    }
  }

  updatePlayerSession(sessionId: string, updates: Partial<PlayerSessionRow>): void {
    try {
      const fields: string[] = []
      const values: (string | number | null)[] = []

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          fields.push(`${key} = ?`)
          values.push(value)
        }
      })

      if (fields.length === 0) return

      values.push(sessionId)

      const updateQuery = `UPDATE rpg_player_sessions SET ${fields.join(', ')} WHERE id = ?`
      this.getDb()
        .prepare(updateQuery)
        .run(...values)
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error updating player session:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
    }
  }

  getActivePlayerSessions(): PlayerSessionRow[] {
    try {
      const results = this.getDb()
        .prepare(
          `
        SELECT * FROM rpg_player_sessions WHERE sessionEnd IS NULL
    `
        )
        .all() as Array<Record<string, unknown>>

      // Map database rows to interface, ensuring sessionId is mapped
      return results.map(row => ({
        id: row.id as string,
        sessionId: row.id as string, // Map id to sessionId for compatibility
        playerId: row.playerId as string,
        sessionStart: row.sessionStart as number,
        sessionEnd: row.sessionEnd as number | null,
        playtimeMinutes: row.playtimeMinutes as number,
        reason: row.reason as string | null,
        lastActivity: row.lastActivity as number,
      }))
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error getting active sessions:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return []
    }
  }

  endPlayerSession(sessionId: string, reason?: string): void {
    try {
      this.getDb()
        .prepare(
          `
      UPDATE rpg_player_sessions 
        SET sessionEnd = ?, reason = ? 
        WHERE id = ?
      `
        )
        .run(Date.now(), reason || 'normal', sessionId)
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error ending player session:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
    }
  }

  recordChunkEntry(chunkX: number, chunkZ: number, playerId: string): number {
    try {
      const result = this.getDb()
        .prepare(
          `
        INSERT INTO rpg_chunk_activity (chunkX, chunkZ, playerId, entryTime)
      VALUES (?, ?, ?, ?)
      `
        )
        .run(chunkX, chunkZ, playerId, Date.now())

      return result.lastInsertRowid as number
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error recording chunk entry:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return 0
    }
  }

  recordChunkExit(activityId: number): void {
    try {
      this.getDb()
        .prepare(
          `
        UPDATE rpg_chunk_activity SET exitTime = ? WHERE id = ?
      `
        )
        .run(Date.now(), activityId)
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error recording chunk exit:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
    }
  }

  getChunkPlayerCount(chunkX: number, chunkZ: number): number {
    try {
      const result = this.getDb()
        .prepare(
          `
        SELECT COUNT(*) as count 
        FROM rpg_chunk_activity 
        WHERE chunkX = ? AND chunkZ = ? AND exitTime IS NULL
    `
        )
        .get(chunkX, chunkZ) as { count: number }

      return result.count
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error getting chunk player count:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return 0
    }
  }

  cleanupOldSessions(daysOld: number = 7): number {
    try {
      const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000
      const result = this.getDb()
        .prepare(
          `
        DELETE FROM rpg_player_sessions WHERE sessionEnd < ?
      `
        )
        .run(cutoffTime)

      return result.changes
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error cleaning up old sessions:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return 0
    }
  }

  cleanupOldChunkActivity(daysOld: number = 30): number {
    try {
      const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000
      const result = this.getDb()
        .prepare(
          `
        DELETE FROM rpg_chunk_activity WHERE entryTime < ?
      `
        )
        .run(cutoffTime)

      return result.changes
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error cleaning up old chunk activity:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return 0
    }
  }

  getDatabaseStats(): {
    playerCount: number
    activeSessionCount: number
    chunkCount: number
    activeChunkCount: number
    totalActivityRecords: number
  } {
    try {
      // Handle potentially null results from queries
      const playerCount = this.getDb().prepare('SELECT COUNT(*) as count FROM rpg_players').get() as {
        count: number
      } | null
      const activeSessionCount = this.getDb()
        .prepare('SELECT COUNT(*) as count FROM rpg_player_sessions WHERE sessionEnd IS NULL')
        .get() as { count: number } | null
      const chunkCount = this.getDb().prepare('SELECT COUNT(*) as count FROM rpg_world_chunks').get() as {
        count: number
      } | null
      const activeChunkCount = this.getDb()
        .prepare('SELECT COUNT(*) as count FROM rpg_world_chunks WHERE playerCount > 0')
        .get() as { count: number } | null
      const activityRecords = this.getDb().prepare('SELECT COUNT(*) as count FROM rpg_chunk_activity').get() as {
        count: number
      } | null

      return {
        playerCount: playerCount?.count ?? 0,
        activeSessionCount: activeSessionCount?.count ?? 0,
        chunkCount: chunkCount?.count ?? 0,
        activeChunkCount: activeChunkCount?.count ?? 0,
        totalActivityRecords: activityRecords?.count ?? 0,
      }
    } catch (_error) {
      console.error(
        'DatabaseSystem',
        'Error getting database stats:',
        _error instanceof Error ? _error : new Error(String(_error))
      )
      return {
        playerCount: 0,
        activeSessionCount: 0,
        chunkCount: 0,
        activeChunkCount: 0,
        totalActivityRecords: 0,
      }
    }
  }

  private createMockDatabase(): SQLiteDatabase {
    // Simple mock database for client-side testing
    // Return mock implementations that handle common operations safely
    const mockStatement = {
      get: () => null,
      all: () => [],
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
      iterate: function* () {
        yield* []
      },
      pluck: () => mockStatement,
      expand: () => mockStatement,
      raw: () => mockStatement,
      columns: () => [],
      safeIntegers: () => mockStatement,
      bind: () => mockStatement,
    }

    return {
      prepare: (_sql: string) => mockStatement,
      exec: (_sql: string) => this,
      close: () => {},
      pragma: (_key: string, _value?: unknown) => {},
      transaction: (fn: Function) => fn,
      inTransaction: false,
      memory: true,
      readonly: false,
      name: ':memory:',
      open: true,
    } as SQLiteDatabase
  }
}
