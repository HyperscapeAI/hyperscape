// Load polyfills before any other imports
import './polyfills'

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import statics from '@fastify/static'
import ws from '@fastify/websocket'
import dotenv from 'dotenv'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { installThreeJSExtensions } from '../physics/vector-conversions'

// Load environment variables from multiple possible locations
dotenv.config({ path: '.env' })
dotenv.config({ path: '../../../.env' }) // Root workspace .env
dotenv.config({ path: '../../.env' }) // Parent directory .env

import { createServerWorld } from '../createServerWorld'
import type { Settings } from '../types'
import type { NodeWebSocket } from '../types/network-types'
import { hashFile } from '../utils-server'
import { getDB } from './db'
import { Storage } from './Storage'

// JSON value type for proper typing
type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

//

// Route schema interfaces  
interface ActionRouteGenericInterface {
  Params: { name: string }
  Body: { context?: JSONValue, params?: JSONValue }
}

// Wrap server initialization in async function to avoid top-level await
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

  // Set default values for required environment variables
  const WORLD = process.env['WORLD'] || 'world'
  const PORT = parseInt(process.env['PORT'] || '4444', 10)

  // ES module equivalent of __dirname
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  const _rootDir = path.join(__dirname, '../..')
  // Use absolute path if WORLD is absolute, otherwise relative to the hyperscape package root (not rootDir)
  const worldDir = path.isAbsolute(WORLD) ? WORLD : path.join(__dirname, '../..', WORLD)
  const assetsDir = path.join(worldDir, 'assets')

  // create world folders if needed
  await fs.ensureDir(worldDir)
  await fs.ensureDir(assetsDir)

  // copy over built-in assets (only if they don't exist)
  const hyperscapeRoot = path.join(__dirname, '../..') // From build/server to hyperscape root
  const builtInAssetsDir = path.join(hyperscapeRoot, 'src/world/assets')

  // Only copy built-in assets if assets directory is empty
  const assetFiles = await fs.readdir(assetsDir).catch(() => [])
  if (assetFiles.length === 0 && (await fs.exists(builtInAssetsDir))) {
    await fs.copy(builtInAssetsDir, assetsDir)
  }

  // init db
  const db = await getDB(path.join(worldDir, '/db.sqlite'))

  // init storage
  const storage = new Storage(path.join(worldDir, '/storage.json'))

  const world = await createServerWorld()

  world.assetsUrl = process.env['PUBLIC_ASSETS_URL'] || '/world-assets/'

  // Ensure assetsUrl ends with slash for proper URL resolution
  if (!world.assetsUrl.endsWith('/')) {
    world.assetsUrl += '/'
  }

  // Set up default environment if no settings exist
  // Check if world settings has model property
  const settingsWithModel = world.settings as Settings & { model?: { url: string } }
  if (!settingsWithModel.model) {
    // Set default environment model in settings for ServerEnvironment system
    settingsWithModel.model = {
      url: 'asset://base-environment.glb',
    }
  }

  // Also configure for client preloading
  // Set default environment model if not present in settings
  const modelSetting = world.settings?.model
  const hasModelUrl = typeof modelSetting === 'object' && modelSetting?.url
  if (!hasModelUrl) {
    const settings = world.settings
    if (settings) {
      settings.model = {
        url: 'asset://base-environment.glb',
      }
    }
  }

  // Initialize world if method exists
  const worldWithInit = world
  if (worldWithInit.init) {
    await worldWithInit.init({ db, storage, assetsDir })
  }

  // Entities spawn automatically from world.json if present
  await loadWorldEntities()

  async function loadWorldEntities() {
    const worldConfigPath = path.join(worldDir, 'world.json')

    if (await fs.exists(worldConfigPath)) {
      const worldConfig = await fs.readJson(worldConfigPath)

      for (const entityData of worldConfig.entities) {
        try {
          // Create complete entity data structure
          const entityToAdd = {
            id: entityData.id,
            type: entityData.type || 'app',
            position: entityData.position || [0, 0, 0],
            quaternion: entityData.quaternion || [0, 0, 0, 1], // Convert rotation to quaternion
            scale: entityData.scale || [1, 1, 1],
            ...entityData,
            state: {}, // Initialize empty state
          }

          // Handle rotation field if present (convert to quaternion)
          if (entityData.rotation && !entityData.quaternion) {
            // For now, assume rotation is Euler angles in radians and convert to quaternion
            // This is a simplified conversion - for a more accurate conversion, use Three.js Euler.setFromVector3
            const [_x, y, _z] = entityData.rotation
            // Create a basic quaternion from Y rotation (most common case)
            const halfY = y * 0.5
            entityToAdd.quaternion = [0, Math.sin(halfY), 0, Math.cos(halfY)] 
          }

          // Add entity if method exists
          const entitiesWithAdd = world.entities as { add?: (data: unknown, local?: boolean) => unknown }
          if (entitiesWithAdd.add) {
            entitiesWithAdd.add(entityToAdd, true)
          }
        } catch (entityError) {
          console.error(`[Server] Failed to spawn entity ${entityData.id}:`, entityError)
        }
      }
    }
  }

  const fastify = Fastify({ logger: { level: 'error' } })

  try {
    await fastify.register(cors, {
      origin: [
        'http://localhost:3000',
        'http://localhost:5555',
        'http://localhost:7777',
        /^https?:\/\/localhost:\d+$/,
        true, // Allow all origins in development
      ],
      credentials: true,
      methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    })
  } catch (error) {
    fastify.log.error('[Server] Error registering CORS:', error)
    throw error
  }

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
    try {
      // In built version, __dirname points to build/, so public is at build/public
      const filePath = path.join(__dirname, 'public', 'index.html')
      
      fastify.log.info('[Server] Serving index.html from:', filePath)
      
      // Check if the HTML file exists
      if (!fs.existsSync(filePath)) {
        fastify.log.error('[Server] HTML file not found at:', filePath)
        throw new Error('Client HTML file not found')
      }

      // Read the file using async method
      const html = await fs.promises.readFile(filePath, 'utf-8')
      fastify.log.info('[Server] HTML content length:', html.length)
      
      // Use Fastify's type() method and return the response
      return reply
        .type('text/html; charset=utf-8')
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .send(html)
    } catch (error) {
      fastify.log.error('[Server] Error serving HTML:', error)
      return reply.code(500).send('Internal Server Error')
    }
  })
  
  // Also handle /index.html explicitly
  fastify.get('/index.html', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const filePath = path.join(__dirname, 'public', 'index.html')
      
      fastify.log.info('[Server] Serving index.html from:', filePath)
      
      if (!fs.existsSync(filePath)) {
        fastify.log.error('[Server] HTML file not found at:', filePath)
        throw new Error('Client HTML file not found')
      }

      const html = await fs.promises.readFile(filePath, 'utf-8')
      fastify.log.info('[Server] HTML content length:', html.length)
      
      return reply
        .type('text/html; charset=utf-8')
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .send(html)
    } catch (error) {
      fastify.log.error('[Server] Error serving HTML:', error)
      return reply.code(500).send('Internal Server Error')
    }
  })
  
  try {
    await fastify.register(statics, {
      root: path.join(__dirname, 'public'),
      prefix: '/',
      decorateReply: false,
      // Don't serve directory listings or index files
      list: false,
      index: false,
      setHeaders: (res, filePath) => {
        // Set appropriate MIME type for WASM files
        if (filePath.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm')
          res.setHeader('Cache-Control', 'public, max-age=3600') // 1 hour
        }
        // Set appropriate MIME type and caching for JavaScript files
        else if (filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          // Vite-generated assets in /assets/ have content hashes
          if (filePath.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') // 1 year
          } else {
            res.setHeader('Cache-Control', 'public, max-age=300') // 5 minutes
          }
        }
        // CSS files
        else if (filePath.endsWith('.css')) {
          res.setHeader('Content-Type', 'text/css; charset=utf-8')
          if (filePath.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          } else {
            res.setHeader('Cache-Control', 'public, max-age=300')
          }
        }
        // HTML files should not be cached
        else if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
        }
        // Other static assets
        else {
          res.setHeader('Cache-Control', 'public, max-age=300') // 5 minutes
        }
        // CORS headers for shared array buffer support
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      },
    })
  } catch (error) {
    fastify.log.error('[Server] Error registering static public:', error)
    throw error
  }

  // Register world assets at /world-assets/ to avoid conflict with Vite's /assets/
  try {
    await fastify.register(statics, {
      root: assetsDir,
      prefix: '/world-assets/',
      decorateReply: false,
      setHeaders: res => {
        // all assets are hashed & immutable so we can use aggressive caching
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') // 1 year
        res.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString()) // older browsers
      },
    })
  } catch (error) {
    fastify.log.error('[Server] Error registering world assets:', error)
    throw error
  }

  // Register systems static serving if available
  if (process.env.SYSTEMS_PATH) {
    try {
      await fastify.register(statics, {
        root: process.env.SYSTEMS_PATH,
        prefix: '/dist/',
        decorateReply: false,
        setHeaders: res => {
          // Allow client to load JS modules
          res.setHeader('Cache-Control', 'public, max-age=300') // 5 minutes
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET')
        },
      })
          } catch (error) {
        fastify.log.error('[Server] Error registering static systems:', error)
      // Don't throw - systems are optional
    }
  }

  fastify.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB
    },
  })
  fastify.register(ws)

  // Define worldNetwork function BEFORE registration  
  async function worldNetwork(fastify: FastifyInstance) {
    type FastifySocketConnection = { socket: NodeWebSocket; on?: (event: string, cb: (...args: unknown[]) => void) => void }
    fastify.get('/ws', { websocket: true }, (connection: FastifySocketConnection, req: FastifyRequest) => {
      // The WebSocket is directly on the connection object in Fastify v5
      const socketCandidate = (connection as unknown as { socket?: unknown }).socket ?? (connection as unknown as unknown)
      const socket = socketCandidate as unknown as NodeWebSocket
      
      // Debug logging to understand the structure
      fastify.log.info('[Server] WebSocket connection established')
      fastify.log.info('[Server] Connection type:', typeof connection)
      fastify.log.info('[Server] Connection.socket exists?', !!connection.socket)
      fastify.log.info('[Server] Connection has .on method?', typeof connection.on === 'function')
      
      // Handle network connection if server network exists
      const worldWithNetwork = world
      if (
        worldWithNetwork.network &&
        'onConnection' in worldWithNetwork.network &&
        worldWithNetwork.network.onConnection &&
        socket && (typeof (socket as unknown as { on?: Function; addEventListener?: Function }).on === 'function' ||
                    typeof (socket as unknown as { on?: Function; addEventListener?: Function }).addEventListener === 'function')
      ) {
        const query = (req.query ?? {}) as Record<string, JSONValue>
        worldWithNetwork.network.onConnection(socket, query)
      } else {
        fastify.log.error('[Server] WebSocket missing or invalid; skipping onConnection')
      }
    })
  }

  fastify.register(worldNetwork)

  // Minimal player disconnect endpoint for client beacons
  fastify.post('/api/player/disconnect', async (req, reply) => {
    try {
      const body = (req.body ?? {}) as { playerId?: string; sessionId?: string; reason?: string }
      fastify.log.info('[API] player/disconnect', body)
      // Attempt to close socket if present
      const sockets = world.network && 'sockets' in world.network ? (world.network as unknown as { sockets: Map<string, import('../Socket').Socket> }).sockets : undefined
      const socket = sockets?.get(body.playerId || '')
      if (socket) {
        socket.close()
      }
      return reply.send({ ok: true })
    } catch (err) {
      fastify.log.error('[API] player/disconnect failed', err)
      return reply.code(200).send({ ok: true })
    }
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
    const exists = await fs.exists(filePath)
    if (!exists) {
      await fs.writeFile(filePath, buffer)
    }
  })

  fastify.get('/api/upload-check', async (req: FastifyRequest, _reply) => {
    const filename = (req.query as { filename: string }).filename
    const filePath = path.join(assetsDir, filename)
    const exists = await fs.exists(filePath)
    return { exists }
  })

  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Basic health check
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      }

      return reply.code(200).send(health)
    } catch (error) {
      console.error('Health check failed:', error)
      return reply.code(503).send({
        status: 'error',
        timestamp: new Date().toISOString(),
      })
    }
  })

  fastify.get('/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = {
        uptime: Math.round(world.time),
        protected: process.env['ADMIN_CODE'] !== undefined ? true : false,
        connectedUsers: [] as Array<{
          id: string
          position: number[]
          name: string
        }>,
        commitHash: process.env['COMMIT_HASH'],
      }
      // Iterate through network sockets if they exist (server network only)
      const sockets = world.network && 'sockets' in world.network ? world.network.sockets : new Map()
      for (const socket of sockets.values()) {
        status.connectedUsers.push({
          id: socket.player.data.userId,
          position: socket.player.node.position.current.toArray(),
          name: socket.player.data.name,
        })
      }

      return reply.code(200).send(status)
    } catch (error) {
      console.error('Status failed:', error)
      return reply.code(503).send({
        status: 'error',
        timestamp: new Date().toISOString(),
      })
    }
  })

  // Action API endpoints
  fastify.get('/api/actions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get all actions if action registry exists
      const actions = world.actionRegistry?.getAll() || []
      return reply.send({
        success: true,
        actions: actions.map((action: Record<string, unknown>) => ({
          name: action.name as string,
          description: action.description as string,
          parameters: action.parameters,
        })),
      })
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  fastify.get('/api/actions/available', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as Record<string, unknown>
      const context = {
        world,
        playerId: query?.playerId,
        ...query,
      }
      // Get available actions if action registry exists
      const actions = world.actionRegistry?.getAvailable(context) || []
      return reply.send({
        success: true,
        actions: actions.map((action: { name: string }) => action.name),
      })
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  fastify.post<ActionRouteGenericInterface>('/api/actions/:name', async (request, reply) => {
    try {
      const actionName = request.params.name
      const params = request.body?.params || {}
      const query = request.query as Record<string, JSONValue>
      const context = {
        world,
        playerId: query?.playerId,
        ...query,
      }

      // Execute action if action registry exists
      if (!world.actionRegistry?.execute) {
        return reply.code(500).send({ error: 'Action registry not available' })
      }
      const result = await world.actionRegistry.execute(actionName, context, params as Record<string, unknown>)
      return reply.send({
        success: true,
        result,
      })
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Action execution failed',
      })
    }
  })

  // Frontend error reporting endpoint
  fastify.post('/api/errors/frontend', async (request, reply) => {
    try {
      const errorData = request.body as Record<string, unknown>

      // Log the frontend error with full context
      const timestamp = new Date().toISOString()
      const logEntry = {
        timestamp,
        source: 'frontend',
        ...errorData,
      }

      // Log the frontend error
      console.error(`[Frontend Error] ${timestamp}`)
      console.error('Error:', errorData.message)
      console.error('Stack:', errorData.stack)
      console.error('URL:', errorData.url)
      console.error('User Agent:', errorData.userAgent)
      if (errorData.context) {
        console.error('Additional Context:', errorData.context)
      }

      // Store error in database if needed (optional)
      try {
        const _errorLog = {
          timestamp: Date.now(),
          source: 'frontend',
          level: 'error',
          data: JSON.stringify(logEntry),
        }

        // You can uncomment this to store errors in the database
        // db.prepare('INSERT INTO error_logs (timestamp, source, level, data) VALUES (?, ?, ?, ?)').run(
        //   errorLog.timestamp, errorLog.source, errorLog.level, errorLog.data
        // );
      } catch (dbError) {
        console.error('[Database] Failed to store frontend error:', dbError)
      }

      return reply.send({ success: true, logged: true })
    } catch (error) {
    fastify.log.error('[API] Failed to process frontend error:', error)
      return reply.code(500).send({
        success: false,
        error: 'Failed to log frontend error',
      })
    }
  })

  fastify.setErrorHandler((err, _req, reply) => {
    fastify.log.error(err)
    reply.status(500).send()
  })

  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' })
    fastify.log.info(`[Server] Server listening on http://0.0.0.0:${PORT}`)
  } catch (err) {
    fastify.log.error(err)
    fastify.log.error(`failed to launch on port ${PORT}`)
    process.exit(1)
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await fastify.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await fastify.close()
    process.exit(0)
  })
}

// Start the server
startServer().catch(error => {
  console.error('[Server] Failed to start server:', error)
  process.exit(1)
})
