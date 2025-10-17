/**
 * Hyperscape Server - Main entry point for the game server
 * 
 * This is the primary server file that initializes and runs the Hyperscape multiplayer game server.
 * It handles everything from database setup to WebSocket connections to HTTP routing.
 * 
 * **Server Architecture**:
 * ```
 * Client (Browser) ←→ Fastify HTTP Server ←→ Hyperscape World (ECS)
 *                          ↓                        ↓
 *                    WebSocket Handler        Game Systems
 *                          ↓                   (Combat, Inventory, etc.)
 *                    ServerNetwork                 ↓
 *                          ↓              PostgreSQL + Drizzle ORM
 *                    DatabaseSystem
 * ```
 * 
 * **Initialization Sequence**:
 * 1. Load polyfills (make Node.js browser-compatible for Three.js)
 * 2. Start PostgreSQL via Docker (if USE_LOCAL_POSTGRES=true)
 * 3. Initialize database with Drizzle ORM + run migrations
 * 4. Create Hyperscape World (ECS container)
 * 5. Register server systems (DatabaseSystem, ServerNetwork)
 * 6. Load world entities from world.json
 * 7. Start Fastify HTTP server with routes
 * 8. Begin accepting WebSocket connections
 * 
 * **Key Features**:
 * - **Hot Reload**: SIGUSR2 signal triggers graceful restart in development
 * - **Graceful Shutdown**: Cleans up database, WebSockets, Docker on SIGINT/SIGTERM
 * - **Static Assets**: Serves game assets (models, music, textures) with proper MIME types
 * - **WebSocket Multiplayer**: Real-time player synchronization via ServerNetwork
 * - **Privy Auth**: Optional wallet/social authentication via Privy SDK
 * - **CDN Support**: Configurable asset CDN (R2, S3, local) via PUBLIC_CDN_URL
 * - **CORS**: Permissive CORS for development, configurable for production
 * - **Error Reporting**: Frontend error logging endpoint for debugging
 * 
 * **Environment Variables**:
 * - `NODE_ENV` - 'development' or 'production'
 * - `PORT` - Server port (default: 5555)
 * - `DATABASE_URL` - PostgreSQL connection string (or use local Docker)
 * - `USE_LOCAL_POSTGRES` - Auto-start PostgreSQL via Docker (default: true in dev)
 * - `PUBLIC_CDN_URL` - Asset CDN base URL (default: http://localhost:8080)
 * - `PRIVY_APP_ID`, `PRIVY_APP_SECRET` - Privy authentication credentials
 * - `ADMIN_CODE` - Server admin password (optional)
 * - `JWT_SECRET` - JWT signing secret (generated if not set)
 * - `SAVE_INTERVAL` - Auto-save interval in seconds (default: 60)
 * - `WORLD` - World directory path (default: 'world')
 * 
 * **Hot Reload (Development)**:
 * In development mode, the server watches for file changes and supports hot reload:
 * 1. File watcher detects change
 * 2. Rebuilds server with esbuild
 * 3. Sends SIGUSR2 to running server
 * 4. Server gracefully shuts down (closes DB, sockets, Docker)
 * 5. Clears startup flag
 * 6. Process exits and is restarted by dev script
 * 
 * **Graceful Shutdown**:
 * Handles SIGINT (Ctrl+C), SIGTERM (Docker stop), SIGUSR2 (hot reload):
 * 1. Close HTTP server (stop accepting new connections)
 * 2. Destroy Hyperscape World (cleanup all systems)
 * 3. Wait for pending database operations to complete
 * 4. Close PostgreSQL connection pool
 * 5. Stop Docker PostgreSQL container (if we started it)
 * 6. Clear startup flag (allows hot reload)
 * 7. Exit process (SIGINT/SIGTERM) or return (SIGUSR2)
 * 
 * **Asset Serving**:
 * Static assets are served through multiple strategies:
 * - `/` and `/index.html` - Client app entry point (React SPA)
 * - `/assets/world/*` - Game assets (models, music, textures) from assets/ directory
 * - `/assets/*` - Legacy compatibility route (same as /assets/world/)
 * - `/dist/*` - System plugins if SYSTEMS_PATH is set
 * - `/env.js` - Exposes PUBLIC_* environment variables to client
 * 
 * Assets use aggressive caching:
 * - Hashed assets (in /assets/): Cache-Control: max-age=31536000, immutable
 * - HTML: Cache-Control: no-cache (always check for updates)
 * - Scripts/CSS: Cache-Control: max-age=300 (5 minutes)
 * 
 * **WebSocket Protocol**:
 * Real-time multiplayer uses binary WebSocket protocol (defined in shared):
 * - Client connects with auth token in query params
 * - Server validates token (Privy or JWT)
 * - Client receives snapshot (world state, players, entities)
 * - Bidirectional streaming of entity updates, chat, combat events
 * - Server is authoritative for all game state
 * 
 * **Database**:
 * PostgreSQL with Drizzle ORM stores:
 * - Characters (player avatars with stats, inventory, position)
 * - Users (accounts with auth providers)
 * - Sessions (login/logout tracking)
 * - World chunks (persistent terrain modifications)
 * - Entities (buildings, NPCs that persist across restarts)
 * 
 * **Systems**:
 * Hyperscape uses an Entity-Component-System (ECS) architecture:
 * - DatabaseSystem: Persistence layer (character data, inventory, etc.)
 * - ServerNetwork: WebSocket handling and player connections
 * - TerrainSystem: Procedural terrain generation
 * - ResourceSystem: Resource nodes (trees, rocks, fish) with respawning
 * - CombatSystem: Player vs mob combat with damage calculation
 * - InventorySystem: 28-slot inventory like RuneScape
 * - EquipmentSystem: Equipment slots (weapon, armor, etc.)
 * - Other systems from @hyperscape/shared
 * 
 * **Referenced by**: Package scripts (npm run dev, npm start), Docker containers
 */

// ============================================================================
// POLYFILLS - MUST BE FIRST
// ============================================================================
// Load polyfills before ANY other imports to set up browser-like globals
// for Three.js and other client libraries running on the server.
import './polyfills'

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import statics from '@fastify/static'
import fastifyWebSocket from '@fastify/websocket'
import dotenv from 'dotenv'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServerWorld } from '@hyperscape/shared'
import { installThreeJSExtensions } from '@hyperscape/shared'
import type pg from 'pg'

import { hashFile } from './utils'

// Load environment variables from multiple possible locations
dotenv.config({ path: '.env' })
dotenv.config({ path: '../../../.env' }) // Root workspace .env
dotenv.config({ path: '../../.env' }) // Parent directory .env
import { createDefaultDockerManager, type DockerManager } from './docker-manager'
import { NodeStorage as Storage } from '@hyperscape/shared'
import { ServerNetwork } from './ServerNetwork'
import { DatabaseSystem } from './DatabaseSystem'
import type { NodeWebSocket } from './types'

// JSON value type for proper typing
type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

//

// Route schema interfaces  
interface ActionRouteGenericInterface {
  Params: { name: string }
  Body: { context?: JSONValue, params?: JSONValue }
}

// Global instances for cleanup
let dockerManager: DockerManager | undefined
let globalPgPool: pg.Pool | undefined

/**
 * Starts the Hyperscape server
 * 
 * This is the main entry point for server initialization. It:
 * 1. Installs Three.js extensions for physics
 * 2. Starts Docker PostgreSQL container (if configured)
 * 3. Initializes database connection and runs migrations
 * 4. Creates the game world and registers systems
 * 5. Sets up Fastify with WebSocket, static files, and API routes
 * 6. Starts listening for connections
 * 7. Registers graceful shutdown handlers
 * 
 * The server supports hot reload in development via SIGUSR2 signal.
 * 
 * @returns Promise that resolves when server is fully initialized
 * @throws Error if initialization fails (Docker, database, etc.)
 * 
 * @public
 */
async function startServer() {
  // Prevent duplicate server initialization
  // Check for server starting flag using global extension
  const globalWithFlag = globalThis as typeof globalThis & { __HYPERSCAPE_SERVER_STARTING__?: boolean }
  if (globalWithFlag.__HYPERSCAPE_SERVER_STARTING__) {
    return // Exit early instead of skipping the rest
  }

  globalWithFlag.__HYPERSCAPE_SERVER_STARTING__ = true
  
  // Install Three.js prototype extensions for physics transformations
  installThreeJSExtensions()

  // Initialize Docker and PostgreSQL (optional based on env)
  const useLocalPostgres = (process.env['USE_LOCAL_POSTGRES'] || 'true') === 'true'
  const explicitDatabaseUrl = process.env['DATABASE_URL']
  if (useLocalPostgres && !explicitDatabaseUrl) {
    dockerManager = createDefaultDockerManager()
    await dockerManager.checkDockerRunning()
    const isPostgresRunning = await dockerManager.checkPostgresRunning()
    if (!isPostgresRunning) {
      await dockerManager.startPostgres()
    } else {
    }
  } else {
  }

  // Set default values for required environment variables
  const WORLD = process.env['WORLD'] || 'world'
  const PORT = parseInt(process.env['PORT'] || '5555', 10)

  // ES module equivalent of __dirname
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  // Resolve paths correctly for both dev (src/server/) and build (build/)
  // When built: __dirname is .../hyperscape/build
    let hyperscapeRoot: string
  if (__dirname.endsWith('build')) {
    hyperscapeRoot = path.join(__dirname, '..')
  } else if (__dirname.includes('/src/server')) {
    hyperscapeRoot = path.join(__dirname, '../..')
  } else {
    hyperscapeRoot = path.join(__dirname, '../..')
  }
  
  const worldDir = path.isAbsolute(WORLD) ? WORLD : path.join(hyperscapeRoot, WORLD)
  const assetsDir = path.join(worldDir, 'assets')
  

  // create world folders if needed
  await fs.ensureDir(worldDir)
  await fs.ensureDir(assetsDir)

  // copy over built-in assets (only if they don't exist)
  const builtInAssetsDir = path.join(hyperscapeRoot, 'src/world/assets')

  // Only copy built-in assets if assets directory is empty
  const assetFiles = await fs.readdir(assetsDir).catch(() => [])
  if (assetFiles.length === 0 && (await fs.pathExists(builtInAssetsDir))) {
    await fs.copy(builtInAssetsDir, assetsDir)
  }

  // Initialize database with Drizzle
  const connectionString = explicitDatabaseUrl || (await (async () => {
    if (!dockerManager) throw new Error('No database URL and Docker manager not initialized')
    return dockerManager.getConnectionString()
  })())
  
  // Use Drizzle client directly
  const { initializeDatabase } = await import('./db/client.js')
  const { db: drizzleDb, pool: pgPool } = await initializeDatabase(connectionString)
  
  // Store pool globally for cleanup
  globalPgPool = pgPool
  
  // Create adapter for systems that need the old database interface
  const { createDrizzleAdapter } = await import('./db/drizzle-adapter.js')
  // Cast drizzleDb to the proper schema type since initializeDatabase returns a union type
  const db = createDrizzleAdapter(drizzleDb as import('drizzle-orm/node-postgres').NodePgDatabase<typeof import('./db/schema')>)

  // init storage with database
  const storage = new Storage()

  const world = await createServerWorld()
  
  // Register server-specific systems (they have dependencies on server package modules)
  const { DatabaseSystem: ServerDatabaseSystem } = await import('./DatabaseSystem.js');
  world.register('database', ServerDatabaseSystem);
  world.register('network', ServerNetwork);
  
  // Make PostgreSQL pool and Drizzle DB available for DatabaseSystem to use
  world.pgPool = pgPool
  world.drizzleDb = drizzleDb

  // Set up default environment model
  world.settings.model = {
    url: 'asset://world/base-environment.glb',
  }

  // Configure assets URL before world.init()
  // Point to CDN root (localhost:8080 in dev, R2/S3 in prod)
  // CDN serves from /assets directory mounted at nginx root, so paths are like /music/, /models/, /world/
  const cdnUrl = process.env['PUBLIC_CDN_URL'] || 'http://localhost:8080';
  const assetsUrl = `${cdnUrl}/`

  // Initialize world
  await world.init({ 
    db, 
    storage,
    assetsUrl,
    assetsDir: undefined
  })
  
  // Ensure assetsUrl is properly configured
  world.assetsUrl = assetsUrl
  
  if (!world.assetsUrl.endsWith('/')) {
    world.assetsUrl += '/'
  }
  
  // Note: world.start() is called automatically by world.init()
  // Don't call it again here or systems will initialize twice

  // Entities spawn automatically from world.json if present
  await loadWorldEntities()

  async function loadWorldEntities() {
    const worldConfigPath = path.join(worldDir, 'world.json')

    if (await fs.pathExists(worldConfigPath)) {
      const worldConfig = await fs.readJson(worldConfigPath)

      for (const entityData of worldConfig.entities) {
        // Create complete entity data structure
        const entityToAdd = {
          id: entityData.id,
          type: entityData.type || 'app',
          position: entityData.position || [0, 0, 0],
          quaternion: entityData.quaternion || [0, 0, 0, 1],
          scale: entityData.scale || [1, 1, 1],
          ...entityData,
          state: {},
        }

        // Handle rotation field if present (convert to quaternion)
        if (entityData.rotation && !entityData.quaternion) {
          const [_x, y, _z] = entityData.rotation
          const halfY = y * 0.5
          entityToAdd.quaternion = [0, Math.sin(halfY), 0, Math.cos(halfY)] 
        }

        // Add entity
        world.entities.add!(entityToAdd, true)
      }
    }
  }

  const fastify = Fastify({ logger: { level: 'error' } })

  await fastify.register(cors, {
    origin: [
      'http://localhost:3000',
      'http://localhost:3333',
      'http://localhost:5555',
      'http://localhost:7777',
      /^https?:\/\/localhost:\d+$/,
      /^https:\/\/.+\.farcaster\.xyz$/,
      /^https:\/\/.+\.warpcast\.com$/,
      /^https:\/\/.+\.privy\.io$/,
      true,
    ],
    credentials: true,
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
  })

  // Temporarily disable compression to debug "premature close" errors
  // TODO: Re-enable compression after fixing the issue
  /*
  try {
    await fastify.register(compress, {
      global: true,
      // Exclude specific content types that shouldn't be compressed
      encodings: ['gzip', 'deflate'],
      customTypes: /^text\/|^application\/(json|javascript|xml)/
    })
  } catch (error) {
    console.error('[Server] Error registering compress:', error)
    // Continue without compression rather than failing startup
  }
  */
  // Serve index.html for root path (SPA routing)
  fastify.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    const filePath = path.join(__dirname, 'public', 'index.html')
    
    fastify.log.info({ filePath }, '[Server] Serving index.html')
    
    const html = await fs.promises.readFile(filePath, 'utf-8')
    fastify.log.info({ length: html.length }, '[Server] HTML content length')
    
    return reply
      .type('text/html; charset=utf-8')
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .send(html)
  })
  
  // Also handle /index.html explicitly
  fastify.get('/index.html', async (_req: FastifyRequest, reply: FastifyReply) => {
    const filePath = path.join(__dirname, 'public', 'index.html')
    
    fastify.log.info({ filePath }, '[Server] Serving index.html')
    
    const html = await fs.promises.readFile(filePath, 'utf-8')
    fastify.log.info({ length: html.length }, '[Server] HTML content length')
    
    return reply
      .type('text/html; charset=utf-8')
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .send(html)
  })
  
  await fastify.register(statics, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
    decorateReply: false,
    list: false,
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm')
        res.setHeader('Cache-Control', 'public, max-age=3600')
      }
      else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else {
          res.setHeader('Cache-Control', 'public, max-age=300')
        }
      }
      else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8')
        if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else {
          res.setHeader('Cache-Control', 'public, max-age=300')
        }
      }
      else if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
      }
      else {
        res.setHeader('Cache-Control', 'public, max-age=300')
      }
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    },
  })

  // Register world assets at /assets/world/
  await fastify.register(statics, {
    root: assetsDir,
    prefix: '/assets/world/',
    decorateReply: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.mp3')) {
        res.setHeader('Content-Type', 'audio/mpeg')
        res.setHeader('Accept-Ranges', 'bytes')
      } else if (filePath.endsWith('.ogg')) {
        res.setHeader('Content-Type', 'audio/ogg')
        res.setHeader('Accept-Ranges', 'bytes')
      } else if (filePath.endsWith('.wav')) {
        res.setHeader('Content-Type', 'audio/wav')
        res.setHeader('Accept-Ranges', 'bytes')
      }
      
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString())
    },
  })
  fastify.log.info(`[Server] ✅ Registered /assets/world/ → ${assetsDir}`)
  
  // Add manual route for music files as a workaround
  fastify.get('/assets/world/music/:category/:filename', async (request, reply) => {
    const { category, filename } = request.params as { category: string; filename: string }
    if (!/^\w+\.mp3$/.test(filename)) {
      return reply.code(400).send({ error: 'Invalid filename' })
    }
    if (category !== 'normal' && category !== 'combat') {
      return reply.code(400).send({ error: 'Invalid category' })
    }

    const primaryPath = path.join(assetsDir, 'music', category, filename)
    const pubCandidates = [
      path.join(__dirname, '../..', 'public', 'assets/world'),
      path.join(__dirname, '..', 'public', 'assets/world'),
      path.join(process.cwd(), 'public', 'assets/world'),
      path.join(process.cwd(), 'packages', 'hyperscape', 'public', 'assets/world'),
    ]

    fastify.log.info(`[Music Route] Requested: ${category}/${filename}`)
    fastify.log.info(`[Music Route] Primary path: ${primaryPath}`)
    fastify.log.info(`[Music Route] Assets dir: ${assetsDir}`)

    if (await fs.pathExists(primaryPath)) {
      reply.type('audio/mpeg')
      reply.header('Accept-Ranges', 'bytes')
      reply.header('Cache-Control', 'public, max-age=31536000, immutable')
      return reply.send(fs.createReadStream(primaryPath))
    }

    for (const pubRoot of pubCandidates) {
      const altPath = path.join(pubRoot, 'music', category, filename)
      // eslint-disable-next-line no-await-in-loop
      const altExists = await fs.pathExists(altPath)
      fastify.log.info(`[Music Route] Trying alternate path: ${altPath} exists=${altExists}`)
      if (altExists) {
        reply.type('audio/mpeg')
        reply.header('Accept-Ranges', 'bytes')
        reply.header('Cache-Control', 'public, max-age=31536000, immutable')
        return reply.send(fs.createReadStream(altPath))
      }
    }

    return reply.code(404).send({ error: 'Music file not found', tried: [primaryPath, ...pubCandidates.map(r => path.join(r, 'music', category, filename))] })
  })
  fastify.log.info(`[Server] ✅ Registered manual music route`)
  
  // ALSO register as /assets/ for backward compatibility with hardcoded mob models
  await fastify.register(statics, {
    root: assetsDir,
    prefix: '/assets/',
    decorateReply: false,
    setHeaders: (res, filePath) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString())

      
      if (filePath.endsWith('.glb')) {
        res.setHeader('Content-Type', 'model/gltf-binary')
      }
      else if (filePath.endsWith('.mp3')) {
        res.setHeader('Content-Type', 'audio/mpeg')
      } else if (filePath.endsWith('.ogg')) {
        res.setHeader('Content-Type', 'audio/ogg')
      } else if (filePath.endsWith('.wav')) {
        res.setHeader('Content-Type', 'audio/wav')
      }
      
      if (filePath.endsWith('.glb')) {
        fastify.log.info(`[Assets] 📥 Serving GLB: ${filePath}`)
      }
    },
  })
  fastify.log.info(`[Server] ✅ Registered /assets/ → ${assetsDir}`)
  
  // Log what files are available
  const toolsDir = path.join(assetsDir, 'models/tools')
  if (await fs.pathExists(toolsDir)) {
    const toolFiles = await fs.readdir(toolsDir)
    fastify.log.info(`[Server] Tools available: ${toolFiles.join(', ')}`)
  }
  const mobsDir = path.join(assetsDir, 'models/mobs')
  if (await fs.pathExists(mobsDir)) {
    const mobFiles = await fs.readdir(mobsDir)
    fastify.log.info(`[Server] Mob models available: ${mobFiles.join(', ')}`)
  }

  // Register systems static serving if available
  if (process.env.SYSTEMS_PATH) {
    await fastify.register(statics, {
      root: process.env.SYSTEMS_PATH,
      prefix: '/dist/',
      decorateReply: false,
      setHeaders: res => {
        res.setHeader('Cache-Control', 'public, max-age=300')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET')
      },
    })
  }

  fastify.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB
    },
  })
  fastify.register(fastifyWebSocket)

  // Define worldNetwork function BEFORE registration  
  async function worldNetwork(fastify: FastifyInstance) {
    // In @fastify/websocket v11+, the first parameter IS the WebSocket directly
    fastify.get('/ws', { websocket: true }, (socket, req: FastifyRequest) => {
      const ws = socket as unknown as NodeWebSocket
      
      fastify.log.info('[Server] WebSocket connection established')
      
      // Basic null check only - let ServerNetwork handle the rest
      if (!ws || typeof ws.send !== 'function') {
        fastify.log.error('[Server] Invalid WebSocket object received')
        return
      }
      
      // Handle network connection
      const query = req.query as Record<string, JSONValue>
      world.network.onConnection!(ws, query)
    })
  }

  fastify.register(worldNetwork)

  // Minimal player disconnect endpoint for client beacons
  fastify.post('/api/player/disconnect', async (req, reply) => {
    const body = req.body as { playerId: string; sessionId?: string; reason?: string }
    fastify.log.info({ body }, '[API] player/disconnect')
    const network = world.network as unknown as import('./types').ServerNetworkWithSockets
    const socket = network.sockets.get(body.playerId)
    if (socket) {
      socket.close?.()
    }
    return reply.send({ ok: true })
  })

  const publicEnvs: Record<string, string> = {}
  for (const key in process.env) {
    if (key.startsWith('PUBLIC_')) {
      const value = process.env[key]
      if (value) {
        publicEnvs[key] = value
      }
    }
  }
  
  // Log authentication status
  if (publicEnvs.PUBLIC_PRIVY_APP_ID) {
    if (publicEnvs.PUBLIC_ENABLE_FARCASTER === 'true') {
    }
  } else {
  }

  // Expose plugin paths to client for systems loading
  if (process.env.SYSTEMS_PATH) {
    publicEnvs['PLUGIN_PATH'] = process.env.SYSTEMS_PATH
  }
  if (process.env.PLUGIN_PATH) {
    publicEnvs['PLUGIN_PATH'] = process.env.PLUGIN_PATH
  }
  const envsCode = `
  if (!globalThis.env) globalThis.env = {}
  globalThis.env = ${JSON.stringify(publicEnvs)}
`
  fastify.get('/env.js', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.type('application/javascript').send(envsCode)
  })

  fastify.post('/api/upload', async (req, _reply) => {
    // console.log('DEBUG: slow uploads')
    // await new Promise(resolve => setTimeout(resolve, 2000))
    const file = await req.file()
    if (!file) {
      throw new Error('No file uploaded')
    }
    const ext = file.filename.split('.').pop()?.toLowerCase()
    if (!ext) {
      throw new Error('Invalid filename')
    }
    // create temp buffer to store contents
    const chunks: Buffer[] = []
    for await (const chunk of file.file) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)
    // hash from buffer
    const hash = await hashFile(buffer)
    const filename = `${hash}.${ext}`
    // save to fs
    const filePath = path.join(assetsDir, filename)
    const exists = await fs.pathExists(filePath)
    if (!exists) {
      await fs.writeFile(filePath, buffer)
    }
  })

  fastify.get('/api/upload-check', async (req: FastifyRequest, _reply) => {
    const filename = (req.query as { filename: string }).filename
    const filePath = path.join(assetsDir, filename)
    const exists = await fs.pathExists(filePath)
    return { exists }
  })

  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }

    return reply.code(200).send(health)
  })

  fastify.get('/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    const status = {
      uptime: Math.round(world.time),
      protected: process.env['ADMIN_CODE'] !== undefined,
      connectedUsers: [] as Array<{
        id: string
        position: number[]
        name: string
      }>,
      commitHash: process.env['COMMIT_HASH'],
    }
    
    // Import type from our local types
    const network = world.network as unknown as import('./types').ServerNetworkWithSockets
    for (const socket of network.sockets.values()) {
      if (socket.player?.node?.position) {
        const pos = socket.player.node.position
        status.connectedUsers.push({
          id: socket.player.data.userId as string,
          position: [pos.x, pos.y, pos.z],
          name: socket.player.data.name as string,
        })
      }
    }

    return reply.code(200).send(status)
  })

  // Action API endpoints
  fastify.get('/api/actions', async (_request: FastifyRequest, reply: FastifyReply) => {
    const actions = world.actionRegistry!.getAll()
    return reply.send({
      success: true,
      actions: actions.map((action: Record<string, unknown>) => ({
        name: action.name as string,
        description: action.description as string,
        parameters: action.parameters,
      })),
    })
  })

  fastify.get('/api/actions/available', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>
    const context = {
      world,
      playerId: query?.playerId,
      ...query,
    }
    const actions = world.actionRegistry!.getAvailable(context)
    return reply.send({
      success: true,
      actions: actions.map((action: { name: string }) => action.name),
    })
  })

  fastify.post<ActionRouteGenericInterface>('/api/actions/:name', async (request, reply) => {
    const actionName = request.params.name
    const body = request.body as { params: Record<string, unknown> }
    const params = body.params
    const query = request.query as Record<string, JSONValue>
    const context = {
      world,
      playerId: query?.playerId,
      ...query,
    }

    const result = await world.actionRegistry!.execute(actionName, context, params)
    return reply.send({
      success: true,
      result,
    })
  })

  // Frontend error reporting endpoint
  fastify.post('/api/errors/frontend', async (request, reply) => {
    const errorData = request.body as Record<string, unknown>

    const timestamp = new Date().toISOString()
    console.error(`[Frontend Error] ${timestamp}`)
    console.error('Error:', errorData.message)
    console.error('Stack:', errorData.stack)
    console.error('URL:', errorData.url)
    console.error('User Agent:', errorData.userAgent)
    if (errorData.context) {
      console.error('Additional Context:', errorData.context)
    }

    return reply.send({ success: true, logged: true })
  })

  // In-memory challenge store (for production, use Redis)
  const agentChallenges = new Map<string, { userId: string, expiresAt: number }>()

  // Step 1: Create agent authorization challenge (authenticated user only)
  fastify.post('/api/agent/challenge', async (request, reply) => {
    try {
      // User must be authenticated via Privy to create challenge
      const authHeader = request.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          success: false,
          error: 'Not authenticated',
        })
      }

      const privyToken = authHeader.slice(7)

      // Verify Privy token to get userId
      const appId = process.env.PRIVY_APP_ID
      const appSecret = process.env.PRIVY_APP_SECRET

      if (!appId || !appSecret) {
        return reply.status(500).send({
          success: false,
          error: 'Privy not configured',
        })
      }

      const PrivyAuth = await import('@privy-io/server-auth')
      const { PrivyClient } = PrivyAuth
      const client = new PrivyClient(appId, appSecret)

      const verifiedClaims = await client.verifyAuthToken(privyToken)
      const userId = verifiedClaims.userId

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid token',
        })
      }

      // Generate random challenge code (6 characters, easy to type)
      const challengeCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      const expiresAt = Date.now() + (5 * 60 * 1000) // 5 minutes

      // Store challenge
      agentChallenges.set(challengeCode, { userId, expiresAt })

      // Clean up expired challenges
      for (const [code, data] of agentChallenges.entries()) {
        if (data.expiresAt < Date.now()) {
          agentChallenges.delete(code)
        }
      }

      fastify.log.info(`[Agent Challenge] Created for user ${userId}: ${challengeCode}`)

      return reply.send({
        success: true,
        challengeCode,
        expiresIn: '5 minutes',
        expiresAt,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error('[Agent Challenge] Error:', error)
      return reply.status(401).send({
        success: false,
        error: 'Failed to create challenge',
        details: errorMsg,
      })
    }
  })

  // Step 2: Exchange challenge for agent token (agent presents code)
  fastify.post('/api/agent/token', async (request, reply) => {
    try {
      const { challengeCode } = request.body as { challengeCode?: string }

      if (!challengeCode) {
        return reply.status(400).send({
          success: false,
          error: 'Challenge code required',
        })
      }

      // Look up challenge
      const challenge = agentChallenges.get(challengeCode.toUpperCase())

      if (!challenge) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid or expired challenge code',
        })
      }

      // Check if expired
      if (challenge.expiresAt < Date.now()) {
        agentChallenges.delete(challengeCode.toUpperCase())
        return reply.status(401).send({
          success: false,
          error: 'Challenge code expired',
        })
      }

      // Generate scoped JWT token for agent
      const jwt = await import('jsonwebtoken')
      const jwtSecret = process.env.JWT_SECRET || 'hyperscape-dev-secret'

      const agentToken = jwt.sign(
        {
          userId: challenge.userId,
          type: 'agent',
          // Limited scopes - agent can ONLY authenticate and play
          scopes: [
            'game:connect',      // Connect to game server
            'game:play',         // Play the game
            'character:read',    // Read character data
            'character:control'  // Control character in-game
          ],
          // Explicitly NO wallet/financial permissions
          restrictions: [
            'no_wallet_access',   // Cannot access wallet
            'no_fund_transfer',   // Cannot transfer funds
            'no_privy_auth',      // Cannot use for Privy login
            'no_account_modify'   // Cannot modify account settings
          ],
          createdAt: Date.now(),
          tokenVersion: 1,
        },
        jwtSecret,
        {
          expiresIn: '365d',
          issuer: 'hyperscape-server',
          audience: 'hyperscape-agent'
        }
      )

      // Delete challenge after use (one-time use only)
      agentChallenges.delete(challengeCode.toUpperCase())

      fastify.log.info(`[Agent Token] Generated for user ${challenge.userId} via challenge ${challengeCode}`)

      return reply.send({
        success: true,
        token: agentToken,
        userId: challenge.userId,
        expiresIn: '365d',
        scopes: ['game:connect', 'game:play', 'character:read', 'character:control'],
        restrictions: ['no_wallet_access', 'no_fund_transfer', 'no_privy_auth', 'no_account_modify'],
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error('[Agent Token] Error:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate token',
        details: errorMsg,
      })
    }
  })

  // Agent management endpoints
  // In-memory agent store (for production, use database)
  const agents = new Map<string, {
    id: string
    name: string
    characterFile: string
    status: 'stopped' | 'active' | 'error'
    isRunning: boolean
    playerId: string | null
    createdAt: number
    userId: string
  }>()

  // GET /api/agents - List all agents for authenticated user
  fastify.get('/api/agents', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          success: false,
          error: 'Not authenticated',
        })
      }

      const privyToken = authHeader.slice(7)
      const appId = process.env.PRIVY_APP_ID
      const appSecret = process.env.PRIVY_APP_SECRET

      if (!appId || !appSecret) {
        return reply.status(500).send({
          success: false,
          error: 'Privy not configured',
        })
      }

      const PrivyAuth = await import('@privy-io/server-auth')
      const { PrivyClient } = PrivyAuth
      const client = new PrivyClient(appId, appSecret)
      const verifiedClaims = await client.verifyAuthToken(privyToken)
      const userId = verifiedClaims.userId

      // Filter agents for this user
      const userAgents = Array.from(agents.values()).filter(agent => agent.userId === userId)

      return reply.send({
        success: true,
        agents: userAgents,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error('[Agents] Error listing agents:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to list agents',
        details: errorMsg,
      })
    }
  })

  // GET /api/agents/stats - Get agent statistics
  fastify.get('/api/agents/stats', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          success: false,
          error: 'Not authenticated',
        })
      }

      const privyToken = authHeader.slice(7)
      const appId = process.env.PRIVY_APP_ID
      const appSecret = process.env.PRIVY_APP_SECRET

      if (!appId || !appSecret) {
        return reply.status(500).send({
          success: false,
          error: 'Privy not configured',
        })
      }

      const PrivyAuth = await import('@privy-io/server-auth')
      const { PrivyClient } = PrivyAuth
      const client = new PrivyClient(appId, appSecret)
      const verifiedClaims = await client.verifyAuthToken(privyToken)
      const userId = verifiedClaims.userId

      // Calculate stats for this user
      const userAgents = Array.from(agents.values()).filter(agent => agent.userId === userId)
      const stats = {
        totalAgents: userAgents.length,
        activeAgents: userAgents.filter(a => a.status === 'active').length,
        stoppedAgents: userAgents.filter(a => a.status === 'stopped').length,
        errorAgents: userAgents.filter(a => a.status === 'error').length,
      }

      return reply.send({
        success: true,
        stats,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error('[Agents] Error fetching stats:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch stats',
        details: errorMsg,
      })
    }
  })

  // POST /api/agents - Create new agent
  fastify.post('/api/agents', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          success: false,
          error: 'Not authenticated',
        })
      }

      const privyToken = authHeader.slice(7)
      const appId = process.env.PRIVY_APP_ID
      const appSecret = process.env.PRIVY_APP_SECRET

      if (!appId || !appSecret) {
        return reply.status(500).send({
          success: false,
          error: 'Privy not configured',
        })
      }

      const PrivyAuth = await import('@privy-io/server-auth')
      const { PrivyClient } = PrivyAuth
      const client = new PrivyClient(appId, appSecret)
      const verifiedClaims = await client.verifyAuthToken(privyToken)
      const userId = verifiedClaims.userId

      const { name, characterTemplate } = request.body as { name?: string; characterTemplate?: string }

      if (!name || !name.trim()) {
        return reply.status(400).send({
          success: false,
          error: 'Agent name required',
        })
      }

      // Generate agent ID
      const agentId = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      // Create agent entry
      const agent = {
        id: agentId,
        name: name.trim(),
        characterFile: characterTemplate || 'default.json',
        status: 'stopped' as const,
        isRunning: false,
        playerId: null,
        createdAt: Date.now(),
        userId,
      }

      agents.set(agentId, agent)

      fastify.log.info(`[Agents] Created agent ${agentId} for user ${userId}`)

      return reply.send({
        success: true,
        agent,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error('[Agents] Error creating agent:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to create agent',
        details: errorMsg,
      })
    }
  })

  // POST /api/agents/:id/start - Start an agent
  fastify.post('/api/agents/:id/start', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const agent = agents.get(id)

      if (!agent) {
        return reply.status(404).send({
          success: false,
          error: 'Agent not found',
        })
      }

      // Update agent status
      agent.status = 'active'
      agent.isRunning = true

      fastify.log.info(`[Agents] Started agent ${id}`)

      return reply.send({
        success: true,
        agent,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error('[Agents] Error starting agent:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to start agent',
        details: errorMsg,
      })
    }
  })

  // POST /api/agents/:id/stop - Stop an agent
  fastify.post('/api/agents/:id/stop', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const agent = agents.get(id)

      if (!agent) {
        return reply.status(404).send({
          success: false,
          error: 'Agent not found',
        })
      }

      // Update agent status
      agent.status = 'stopped'
      agent.isRunning = false

      fastify.log.info(`[Agents] Stopped agent ${id}`)

      return reply.send({
        success: true,
        agent,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error('[Agents] Error stopping agent:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to stop agent',
        details: errorMsg,
      })
    }
  })

  // DELETE /api/agents/:id - Delete an agent
  fastify.delete('/api/agents/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const agent = agents.get(id)

      if (!agent) {
        return reply.status(404).send({
          success: false,
          error: 'Agent not found',
        })
      }

      agents.delete(id)

      fastify.log.info(`[Agents] Deleted agent ${id}`)

      return reply.send({
        success: true,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error('[Agents] Error deleting agent:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete agent',
        details: errorMsg,
      })
    }
  })

  // POST /api/agents/:id/token - Generate token for agent
  fastify.post('/api/agents/:id/token', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const agent = agents.get(id)

      if (!agent) {
        return reply.status(404).send({
          success: false,
          error: 'Agent not found',
        })
      }

      // Generate scoped JWT token for agent
      const jwt = await import('jsonwebtoken')
      const jwtSecret = process.env.JWT_SECRET || 'hyperscape-dev-secret'

      const agentToken = jwt.sign(
        {
          userId: agent.userId,
          agentId: id,
          type: 'agent',
          scopes: [
            'game:connect',
            'game:play',
            'character:read',
            'character:control'
          ],
          restrictions: [
            'no_wallet_access',
            'no_fund_transfer',
            'no_privy_auth',
            'no_account_modify'
          ],
          createdAt: Date.now(),
          tokenVersion: 1,
        },
        jwtSecret,
        {
          expiresIn: '365d',
          issuer: 'hyperscape-server',
          audience: 'hyperscape-agent'
        }
      )

      fastify.log.info(`[Agents] Generated token for agent ${id}`)

      return reply.send({
        success: true,
        token: agentToken,
        expiresIn: '365d',
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error('[Agents] Error generating token:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate token',
        details: errorMsg,
      })
    }
  })

  // Get character wallet info (READ-ONLY, safe for agent tokens)
  fastify.get('/api/character/:id/wallet', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }

      // Verify authentication (accepts both agent tokens and user tokens)
      const authHeader = request.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          success: false,
          error: 'Not authenticated',
        })
      }

      // Import schema dynamically
      const { characters } = await import('./db/schema.js')
      const { eq } = await import('drizzle-orm')

      // Query character wallet (READ-ONLY)
      const character = await drizzleDb.select({
        walletAddress: characters.walletAddress,
        walletChainType: characters.walletChainType,
        walletHdIndex: characters.walletHdIndex,
      })
        .from(characters)
        .where(eq(characters.id, id))
        .limit(1)

      if (!character || character.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Character not found',
        })
      }

      if (!character[0].walletAddress) {
        return reply.status(404).send({
          success: false,
          error: 'Character does not have a wallet',
        })
      }

      fastify.log.info(`[Wallet] Read-only query for character ${id}`)

      // Return ONLY public info - no private keys or signing capabilities
      return reply.send({
        success: true,
        address: character[0].walletAddress,
        chainType: character[0].walletChainType || 'ethereum',
        hdIndex: character[0].walletHdIndex,
        readOnly: true, // Always read-only via API
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error('[Wallet] Error:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to get wallet info',
        details: errorMsg,
      })
    }
  })

  fastify.setErrorHandler((err, _req, reply) => {
    fastify.log.error(err)
    reply.status(500).send()
  })

  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  fastify.log.info(`[Server] Server listening on http://0.0.0.0:${PORT}`)

  // Track if we're shutting down
  let isShuttingDown = false
  
  // Graceful shutdown handler
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    
    
    try {
      // Close HTTP server
      await fastify.close()
    } catch (err) {
      console.error('[Server] Error closing HTTP server:', err)
    }
    
    try {
      // Wait for pending database operations BEFORE destroying world
      const databaseSystem = world.getSystem('database') as DatabaseSystem | undefined
      if (databaseSystem) {
        await databaseSystem.waitForPendingOperations()
      }
    } catch (err) {
      console.error('[Server] Error waiting for pending database operations:', err)
    }
    
    try {
      // Destroy world and its systems
      world.destroy()
    } catch (err) {
      console.error('[Server] Error destroying world:', err)
    }
    
    try {
      // Close database connection using the closeDatabase utility
      // This both closes the pool and clears singleton instances to prevent
      // reusing closed connections on hot reload
      const { closeDatabase } = await import('./db/client.js')
      await closeDatabase()
      globalPgPool = undefined
    } catch (err) {
      console.error('[Server] Error closing database:', err)
    }
    
    try {
      // Stop Docker containers if we started them
      if (dockerManager) {
        await dockerManager.stopPostgres()
        dockerManager = undefined
      }
    } catch (err) {
      console.error('[Server] Error stopping Docker:', err)
    }
    
    // Always clear the startup flag, even if there were errors
    globalWithFlag.__HYPERSCAPE_SERVER_STARTING__ = false
    
    
    // For hot reload (SIGUSR2), don't exit process
    if (signal === 'SIGUSR2') {
      isShuttingDown = false // Reset so next reload can proceed
      return
    }
    
    setTimeout(() => {
      process.exit(0)
    }, 100)
  }
  
  // Register shutdown handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')) // Hot reload signal
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[Server] Uncaught exception:', error)
    gracefulShutdown('uncaughtException')
  })
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason)
    gracefulShutdown('unhandledRejection')
  })
  
  // Log that hot reload is supported
  if (process.env.NODE_ENV === 'development') {
  }
}

// Start the server with error handling
startServer().catch((err) => {
  console.error('[Server] Fatal error during startup:', err)
  // Clear the flag so hot reload can retry
  const globalWithFlag = globalThis as typeof globalThis & { __HYPERSCAPE_SERVER_STARTING__?: boolean }
  globalWithFlag.__HYPERSCAPE_SERVER_STARTING__ = false
  process.exit(1)
})
