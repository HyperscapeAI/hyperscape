import type { PluginMigration } from '../types/database';
import type { SystemDatabase } from '../types/database-types';

// Raw SQLite interfaces (bun:sqlite preferred; better-sqlite3 fallback)
export type RawStmt = {
  get: (...params: unknown[]) => unknown
  all: (...params: unknown[]) => unknown[]
  run: (...params: unknown[]) => { changes?: number } | void
}
export type RawDB = {
  prepare: (sql: string) => RawStmt
  exec: (sql: string) => unknown
  close: () => unknown
  pragma?: (name: string, value?: string | number | boolean) => unknown
}

async function openRawDatabase(filePath: string): Promise<RawDB> {
  const isBun = typeof process !== 'undefined' && !!(process as unknown as { versions?: { bun?: string } }).versions?.bun
  if (isBun) {
    const bunSqlite = (await import('bun:sqlite')) as unknown as { Database: new (path: string) => { prepare: (sql: string) => RawStmt; query?: (sql: string) => RawStmt; exec: (sql: string) => unknown; close: () => unknown } }
    const DB = bunSqlite.Database
    const bunDb = new DB(filePath)
    return {
      prepare: (sql: string) => bunDb.prepare ? bunDb.prepare(sql) : (bunDb.query as (sql: string) => RawStmt)(sql),
      exec: (sql: string) => bunDb.exec(sql),
      close: () => bunDb.close(),
      pragma: (name: string, value?: string | number | boolean) => {
        const sql = value === undefined ? `PRAGMA ${name}` : `PRAGMA ${name}=${String(value)}`
        try {
          const stmt = bunDb.prepare ? bunDb.prepare(sql) : (bunDb.query as (sql: string) => RawStmt)(sql)
          return (stmt as unknown as { get: () => unknown }).get()
        } catch {
          bunDb.exec(sql)
          return undefined
        }
      },
    }
  }
  const better = (await import('better-sqlite3')) as unknown as { default?: new (path: string) => { prepare: (sql: string) => RawStmt; exec: (sql: string) => unknown; close: () => unknown; pragma: (sql: string) => unknown } } & (new (path: string) => { prepare: (sql: string) => RawStmt; exec: (sql: string) => unknown; close: () => unknown; pragma: (sql: string) => unknown })
  const Ctor = (better as { default?: new (path: string) => unknown }).default ?? (better as unknown as new (path: string) => unknown)
  const nodeDb = new (Ctor as new (path: string) => { prepare: (sql: string) => RawStmt; exec: (sql: string) => unknown; close: () => unknown; pragma: (sql: string) => unknown })(filePath)
  return {
    prepare: (sql: string) => nodeDb.prepare(sql),
    exec: (sql: string) => nodeDb.exec(sql),
    close: () => nodeDb.close(),
    pragma: (name: string, value?: string | number | boolean) => {
      if (value === undefined) return (nodeDb.pragma(`PRAGMA ${name}`) as unknown)
      nodeDb.exec(`PRAGMA ${name}=${String(value)}`)
      return undefined
    },
  }
}

// Minimal query builder to satisfy SystemDatabase without bringing Knex
function createSystemDatabase(raw: RawDB): SystemDatabase {
  type WhereCond = { key: string; value: unknown }
  const esc = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '')

  class QueryBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
    private _table: string
    private _where: WhereCond[] = []
    private _columns: string[] | undefined

    constructor(table: string) {
      this._table = esc(table)
    }

    where(key: string, value: unknown): this {
      this._where.push({ key: esc(key), value })
      return this
    }

    select(columns?: string | string[]): this {
      if (Array.isArray(columns)) this._columns = columns.map(esc)
      else if (typeof columns === 'string') this._columns = [esc(columns)]
      return this
    }

    async first(): Promise<T | undefined> {
      const rows = await this._all<T>(true)
      return rows[0]
    }

    async insert(data: Record<string, unknown> | Record<string, unknown>[]): Promise<void> {
      const rows = Array.isArray(data) ? data : [data]
      for (const row of rows) {
        const keys = Object.keys(row).map(esc)
        const placeholders = keys.map(() => '?').join(',')
        const sql = `INSERT INTO ${this._table} (${keys.join(',')}) VALUES (${placeholders})`
        const stmt = raw.prepare(sql)
        stmt.run(...keys.map(k => (row as Record<string, unknown>)[k]))
      }
    }

    async update(data: Record<string, unknown>): Promise<number> {
      const keys = Object.keys(data).map(esc)
      const setClause = keys.map(k => `${k} = ?`).join(', ')
      const whereClause = this._where.length ? ` WHERE ${this._where.map(w => `${w.key} = ?`).join(' AND ')}` : ''
      const sql = `UPDATE ${this._table} SET ${setClause}${whereClause}`
      const params = keys.map(k => (data as Record<string, unknown>)[k]).concat(this._where.map(w => w.value))
      const stmt = raw.prepare(sql)
      const res = stmt.run(...params)
      return Number((res && typeof res === 'object' ? (res as { changes?: number }).changes : 0) ?? 0)
    }

    async delete(): Promise<number> {
      const whereClause = this._where.length ? ` WHERE ${this._where.map(w => `${w.key} = ?`).join(' AND ')}` : ''
      const sql = `DELETE FROM ${this._table}${whereClause}`
      const params = this._where.map(w => w.value)
      const stmt = raw.prepare(sql)
      const res = stmt.run(...params)
      return Number((res && typeof res === 'object' ? (res as { changes?: number }).changes : 0) ?? 0)
    }

    then<TResult1 = T[], TResult2 = never>(onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
      return this._all<T>(false).then(onfulfilled, onrejected) as unknown as Promise<TResult1 | TResult2>
    }

    catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T[] | TResult> {
      return this._all<T>(false).catch(onrejected)
    }

    private async _all<R>(limitOne: boolean): Promise<R[]> {
      const cols = this._columns?.length ? this._columns!.join(',') : '*'
      const whereClause = this._where.length ? ` WHERE ${this._where.map(w => `${w.key} = ?`).join(' AND ')}` : ''
      const limit = limitOne ? ' LIMIT 1' : ''
      const sql = `SELECT ${cols} FROM ${this._table}${whereClause}${limit}`
      const stmt = raw.prepare(sql)
      const rows = stmt.all(...this._where.map(w => w.value)) as unknown as R[]
      return rows || []
    }
  }

  const dbFunc = ((table: string) => new QueryBuilder(table)) as unknown as SystemDatabase
  return dbFunc
}

async function hasTable(raw: RawDB, name: string): Promise<boolean> {
  try {
    const rows = raw.prepare(`PRAGMA table_info(${name})`).all()
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

// Global registry for plugin migrations
const pluginMigrations: Record<string, PluginMigration[]> = {};

export function registerPluginMigrations(pluginName: string, migrations: PluginMigration[]): void {
  pluginMigrations[pluginName] = migrations;
  console.log(`[DB] Registered ${migrations.length} migrations for plugin: ${pluginName}`);
}

// Legacy function signature removed; plugin migrations handled by raw runner below

let dbInstance: SystemDatabase | undefined
let rawDbInstance: RawDB | undefined

export async function getDB(path: string): Promise<SystemDatabase> {
  if (!dbInstance) {
    try {
      console.log('[DB] Initializing SQLite database at:', path)
      const raw = await openRawDatabase(path)
      try { raw.pragma && raw.pragma('journal_mode', 'WAL') } catch {}
      try { raw.pragma && raw.pragma('synchronous', 'NORMAL') } catch {}
      try { raw.pragma && raw.pragma('foreign_keys', 'ON') } catch {}
      try { raw.pragma && raw.pragma('busy_timeout', 5000) } catch {}
      const systemDb = createSystemDatabase(raw)
      await migrateRaw(raw, systemDb)
      dbInstance = systemDb
      rawDbInstance = raw
    } catch (error) {
      console.error('[DB] Error initializing database:', error instanceof Error ? error.message : String(error))
      console.error('[DB] Full error:', error)
      console.log('[DB] Falling back to mock database for development')
      dbInstance = createMockSystemDatabase()
    }
  }
  return dbInstance!
}

export function getRawDB(): RawDB | undefined {
  return rawDbInstance
}

async function migrateRaw(raw: RawDB, systemDb: SystemDatabase): Promise<void> {
  // Ensure config table exists
  raw.exec(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)`)
  const vRow = (raw.prepare('SELECT value FROM config WHERE key = ?').get('version') as { value?: string } | undefined)
  let version = Number.parseInt(vRow?.value ?? '0', 10) || 0

  const migrations: Array<(db: RawDB) => Promise<void>> = [
    async db => {
      db.exec(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        roles TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        avatar TEXT
      )`)
    },
    async db => { try { db.exec(`ALTER TABLE users ADD COLUMN vrm TEXT`) } catch {} },
    async db => {
      try {
        const cols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>
        const hasVRM = cols.some(c => c.name === 'vrm')
        const hasAvatar = cols.some(c => c.name === 'avatar')
        if (hasVRM && !hasAvatar) db.exec(`ALTER TABLE users RENAME COLUMN vrm TO avatar`)
      } catch {}
    },
    async db => {
      try {
        const cfg = db.prepare(`SELECT value FROM config WHERE key = 'config'`).get() as { value?: string } | undefined
        if (cfg?.value) {
          db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES ('settings', ?)`).run(cfg.value)
          db.prepare(`DELETE FROM config WHERE key = 'config'`).run()
        }
      } catch {}
    },
    async db => {
      try {
        const has = await hasTable(db, 'entities')
        if (has) {
          const rows = db.prepare('SELECT id, data FROM entities').all() as Array<{ id: string; data: string }>
          for (const row of rows) {
            try {
              const data = JSON.parse(row.data) as Record<string, unknown>
              if (!('scale' in data)) {
                (data as { scale: [number, number, number] }).scale = [1, 1, 1]
                db.prepare('UPDATE entities SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id)
              }
            } catch {}
          }
        } else {
          console.log('[DB] Migration #5: entities table does not exist, skipping scale field update')
        }
      } catch {}
    },
    async db => {
      db.exec(`CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        createdAt TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedAt TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`)
    },
  ]

  for (let i = version; i < migrations.length; i++) {
    console.log(`[DB] running migration #${i + 1}...`)
    await migrations[i](raw)
    raw.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('version', String(i + 1))
    version = i + 1
  }
  
  // Plugin migrations after core
  await runPluginMigrationsRaw(raw, systemDb)
  console.log('[DB] All migrations completed')
}

async function runPluginMigrationsRaw(raw: RawDB, systemDb: SystemDatabase): Promise<void> {
  for (const [pluginName, migrations] of Object.entries(pluginMigrations)) {
    const table = `${pluginName}_migrations`
    try {
      raw.exec(`CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, executed_at INTEGER DEFAULT (strftime('%s','now')))`)
    } catch {}
    const rows = (raw.prepare(`SELECT name FROM ${table}`).all() as Array<{ name: string }>) || []
    const executed = new Set(rows.map(r => r.name))
    for (const m of migrations) {
      if (!executed.has(m.name)) {
        console.log(`[DB] Running plugin migration: ${pluginName}.${m.name}`)
        await m.up(systemDb as unknown)
        try { raw.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(m.name) } catch {}
      }
    }
  }
}

// Remove old Knex-style migrations and mock

function createMockSystemDatabase(): SystemDatabase {
  const mockQueryBuilder = {
    where: (_key: string, _value: unknown) => mockQueryBuilder,
    first: async () => undefined,
    select: (_columns?: string | string[]) => mockQueryBuilder,
    update: async (_data: unknown) => 0,
    delete: async () => 0,
    insert: async (_data: unknown) => {}
  } as unknown as { where: (k: string, v: unknown) => unknown; first: () => Promise<unknown>; select: (c?: unknown) => unknown; update: (d: unknown) => Promise<number>; delete: () => Promise<number>; insert: (d: unknown) => Promise<void> } & PromiseLike<unknown[]>;

  ;(mockQueryBuilder as unknown as { then: Function }).then = (onfulfilled: (v: unknown[]) => unknown, onrejected?: (e: unknown) => unknown) => Promise.resolve([]).then(onfulfilled, onrejected)
  ;(mockQueryBuilder as unknown as { catch: Function }).catch = (onrejected: (e: unknown) => unknown) => Promise.resolve([]).catch(onrejected)

  const mockFunction = ((tableName: string) => {
    console.log(`[DB Mock] Query on table: ${tableName}`)
    return mockQueryBuilder
  }) as unknown as SystemDatabase

  return mockFunction
}
