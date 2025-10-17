/**
 * Database Monitor Server
 *
 * Standalone web server for monitoring PostgreSQL Docker container
 * Runs on port 5656 with a simple web UI
 */

import Fastify from 'fastify'
import cors from '@fastify/cors'
import statics from '@fastify/static'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: '.env' })
dotenv.config({ path: '../../../.env' })
dotenv.config({ path: '../../.env' })

const execAsync = promisify(exec)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 5656
const containerName = process.env.POSTGRES_CONTAINER || 'hyperscape-postgres'

// PostgreSQL connection
const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'hyperscape'}:${process.env.POSTGRES_PASSWORD || 'hyperscape_dev'}@localhost:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'hyperscape'}`

let pgPool: pg.Pool | null = null

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

async function startServer() {
  const fastify = Fastify({ logger: false })

  await fastify.register(cors, {
    origin: true,
    credentials: true,
  })

  // Serve static files (HTML UI)
  await fastify.register(statics, {
    root: path.join(__dirname, 'public/db-monitor'),
    prefix: '/',
  })

  // Initialize PostgreSQL connection
  pgPool = new pg.Pool({ connectionString })

  // Health check
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // Database status endpoint
  fastify.get('/api/status', async (_request, reply) => {
    const stats: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
    }

    try {
      // Get container status and uptime
      const { stdout: statusOut } = await execAsync(
        `docker inspect -f '{{.State.Status}}|{{.State.Health.Status}}|{{.State.StartedAt}}' ${containerName}`
      ).catch(() => ({ stdout: 'unknown|unknown|unknown' }))

      const [status, health, startedAt] = statusOut.trim().split('|')
      stats.container = {
        name: containerName,
        status,
        health,
        startedAt,
      }

      // Get container resource stats
      const { stdout: statsOut } = await execAsync(
        `docker stats ${containerName} --no-stream --format "{{.MemUsage}}|{{.CPUPerc}}"`
      ).catch(() => ({ stdout: 'N/A|N/A' }))

      const [memUsage, cpuPerc] = statsOut.trim().split('|')
      stats.resources = {
        memory: memUsage,
        cpu: cpuPerc,
      }
    } catch (err) {
      stats.containerError = (err as Error).message
    }

    // Get PostgreSQL connection stats
    if (pgPool) {
      stats.database = {
        totalConnections: pgPool.totalCount,
        idleConnections: pgPool.idleCount,
        waitingRequests: pgPool.waitingCount,
      }

      try {
        // Get database size and connection count
        const dbInfo = await pgPool.query(`
          SELECT
            pg_database_size(current_database()) as size,
            (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as active_connections,
            (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
        `)

        if (dbInfo.rows && dbInfo.rows.length > 0) {
          const row = dbInfo.rows[0]
          stats.database = {
            ...stats.database as Record<string, unknown>,
            size: parseInt(row.size, 10),
            sizeFormatted: formatBytes(parseInt(row.size, 10)),
            activeConnections: parseInt(row.active_connections, 10),
            maxConnections: parseInt(row.max_connections, 10),
          }
        }

        // Get table count
        const tableInfo = await pgPool.query(`
          SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema = 'public'
        `)

        if (tableInfo.rows && tableInfo.rows.length > 0) {
          stats.database = {
            ...stats.database as Record<string, unknown>,
            tableCount: parseInt(tableInfo.rows[0].table_count, 10),
          }
        }
      } catch (err) {
        stats.databaseError = (err as Error).message
      }
    }

    return reply.send(stats)
  })

  // Restart container
  fastify.post('/api/restart', async (_request, reply) => {
    try {
      await execAsync(`docker restart ${containerName}`)
      return reply.send({ success: true, message: 'Container restarted' })
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message })
    }
  })

  // Get logs
  fastify.get('/api/logs', async (request, reply) => {
    const query = request.query as { tail?: string }
    const tail = query.tail || '100'

    try {
      const { stdout } = await execAsync(`docker logs --tail ${tail} ${containerName}`)
      return reply.send({ logs: stdout })
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message })
    }
  })

  // Get list of tables
  fastify.get('/api/tables', async (_request, reply) => {
    if (!pgPool) {
      return reply.code(500).send({ error: 'Database not connected' })
    }

    try {
      const result = await pgPool.query(`
        SELECT
          table_name,
          (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND columns.table_name = tables.table_name) as column_count,
          pg_size_pretty(pg_total_relation_size(quote_ident(table_name)::regclass)) as size
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `)

      return reply.send({ tables: result.rows })
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message })
    }
  })

  // Get table schema
  fastify.get('/api/tables/:name/schema', async (request, reply) => {
    if (!pgPool) {
      return reply.code(500).send({ error: 'Database not connected' })
    }

    const { name } = request.params as { name: string }

    try {
      const result = await pgPool.query(`
        SELECT
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [name])

      return reply.send({ schema: result.rows })
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message })
    }
  })

  // Get table data with pagination
  fastify.get('/api/tables/:name/data', async (request, reply) => {
    if (!pgPool) {
      return reply.code(500).send({ error: 'Database not connected' })
    }

    const { name } = request.params as { name: string }
    const query = request.query as { limit?: string; offset?: string }
    const limit = parseInt(query.limit || '50', 10)
    const offset = parseInt(query.offset || '0', 10)

    try {
      // Get total count
      const countResult = await pgPool.query(`SELECT count(*) as total FROM ${name}`)
      const total = parseInt(countResult.rows[0].total, 10)

      // Get data
      const dataResult = await pgPool.query(`SELECT * FROM ${name} LIMIT $1 OFFSET $2`, [limit, offset])

      return reply.send({
        data: dataResult.rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      })
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message })
    }
  })

  // Execute SQL query (read-only)
  fastify.post('/api/query', async (request, reply) => {
    if (!pgPool) {
      return reply.code(500).send({ error: 'Database not connected' })
    }

    const { sql } = request.body as { sql: string }

    // Basic safety check - only allow SELECT queries
    const trimmedSql = sql.trim().toLowerCase()
    if (!trimmedSql.startsWith('select')) {
      return reply.code(400).send({ error: 'Only SELECT queries are allowed for safety' })
    }

    try {
      const startTime = Date.now()
      const result = await pgPool.query(sql)
      const executionTime = Date.now() - startTime

      return reply.send({
        rows: result.rows,
        rowCount: result.rowCount,
        executionTime,
      })
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`[DB Monitor] Server running on http://localhost:${PORT}`)
  console.log(`[DB Monitor] Monitoring container: ${containerName}`)
}

startServer().catch(err => {
  console.error('[DB Monitor] Failed to start:', err)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[DB Monitor] Shutting down...')
  if (pgPool) {
    await pgPool.end()
  }
  process.exit(0)
})
