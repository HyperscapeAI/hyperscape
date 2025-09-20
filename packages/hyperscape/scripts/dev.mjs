#!/usr/bin/env node
import 'dotenv/config'
import fs from 'fs-extra'
import path from 'path'
import { spawn } from 'child_process'
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'url'
import { createServer as createViteServer } from 'vite'
import chokidar from 'chokidar'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(dirname, '../')
const buildDir = path.join(rootDir, 'build')

// Ensure build directories exist
await fs.ensureDir(buildDir)
await fs.ensureDir(path.join(buildDir, 'public'))

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function log(prefix, message, color = colors.cyan) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`)
}

/**
 * Plugin to exclude test files
 */
const excludeTestsPlugin = {
  name: 'exclude-tests',
  setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      if (args.path.includes('__tests__') || 
          args.path.includes('/tests/') ||
          args.path.includes('.test.') ||
          args.path.includes('.spec.') ||
          args.path.includes('vitest')) {
        return { path: args.path, external: true }
      }
    })
  }
}

/**
 * Copy PhysX assets
 */
async function copyPhysXAssets() {
  try {
    const devPublicDir = path.join(rootDir, 'src/client/public')
    const buildPublicDir = path.join(rootDir, 'build/public')
    await fs.ensureDir(devPublicDir)
    await fs.ensureDir(buildPublicDir)

    let physxWasmSrc = path.join(rootDir, 'node_modules/@hyperscape/physx-js-webidl/dist/physx-js-webidl.wasm')
    let physxJsSrc = path.join(rootDir, 'node_modules/@hyperscape/physx-js-webidl/dist/physx-js-webidl.js')

    if (!await fs.pathExists(physxWasmSrc)) {
      physxWasmSrc = path.join(rootDir, '../../node_modules/@hyperscape/physx-js-webidl/dist/physx-js-webidl.wasm')
      physxJsSrc = path.join(rootDir, '../../node_modules/@hyperscape/physx-js-webidl/dist/physx-js-webidl.js')
    }

    // Fallback to checked-in prebuilt files
    if (!await fs.pathExists(physxWasmSrc)) {
      const fallbackWasm = path.join(rootDir, 'src/server/public/physx-js-webidl.wasm')
      const fallbackJs = path.join(rootDir, 'src/server/public/physx-js-webidl.js')
      if (await fs.pathExists(fallbackWasm)) {
        physxWasmSrc = fallbackWasm
      }
      if (await fs.pathExists(fallbackJs)) {
        physxJsSrc = fallbackJs
      }
    }

    // Copy to both dev and build directories
    const destinations = [
      { wasm: path.join(devPublicDir, 'physx-js-webidl.wasm'), js: path.join(devPublicDir, 'physx-js-webidl.js') },
      { wasm: path.join(buildPublicDir, 'physx-js-webidl.wasm'), js: path.join(buildPublicDir, 'physx-js-webidl.js') }
    ]

    for (const dest of destinations) {
      if (await fs.pathExists(physxWasmSrc) && !await fs.pathExists(dest.wasm)) {
        await fs.copy(physxWasmSrc, dest.wasm)
      }
      if (await fs.pathExists(physxJsSrc) && !await fs.pathExists(dest.js)) {
        await fs.copy(physxJsSrc, dest.js)
      }
    }
    
    log('PhysX', 'Assets copied successfully', colors.green)
  } catch (e) {
    log('PhysX', `Failed to copy assets: ${e.message}`, colors.yellow)
  }
}

/**
 * Start Vite Dev Server for Client
 */
async function startViteServer() {
  const port = parseInt(process.env.VITE_PORT || '3333')
  
  log('Client', `Starting Vite dev server on port ${port}...`, colors.magenta)
  
  const viteServer = await createViteServer({
    configFile: path.join(rootDir, 'vite.config.ts'),
    server: {
      port,
      hmr: {
        port
      }
    }
  })
  
  await viteServer.listen()
  
  log('Client', `✅ Vite dev server running at http://localhost:${port}`, colors.green)
  return viteServer
}

/**
 * Build Server with ESBuild
 */
let serverProcess = null
let isBuilding = false
let serverContext = null
let frameworkContext = null

async function createBuildContexts() {
  try {
    // Always recreate contexts if they don't exist or have been disposed
    if (!serverContext) {
      log('Build', 'Creating server build context...', colors.dim)
      serverContext = await esbuild.context({
        entryPoints: ['src/server/index.ts'],
        outfile: 'build/index.js',
        platform: 'node',
        format: 'esm',
        bundle: true,
        treeShaking: true,
        minify: false,
        sourcemap: true,
        packages: 'external',
        external: ['vitest'],
        target: 'node22',
        define: {
          'process.env.CLIENT': 'false',
          'process.env.SERVER': 'true',
        },
        loader: {
          '.ts': 'ts',
          '.tsx': 'tsx',
        },
        plugins: [excludeTestsPlugin],
        logLevel: 'error',
      })
    }
    
    if (!frameworkContext) {
      log('Build', 'Creating framework build context...', colors.dim)
      frameworkContext = await esbuild.context({
        entryPoints: ['src/index.ts'],
        outfile: 'build/framework.js',
        platform: 'neutral',
        format: 'esm',
        bundle: true,
        treeShaking: true,
        minify: false,
        sourcemap: true,
        packages: 'external',
        target: 'esnext',
        loader: {
          '.ts': 'ts',
          '.tsx': 'tsx',
        },
        logLevel: 'error',
      })
    }
  } catch (error) {
    log('Build', `Failed to create contexts: ${error.message}`, colors.red)
    // Reset contexts to null so they'll be recreated next time
    serverContext = null
    frameworkContext = null
    throw error
  }
  
  return { serverContext, frameworkContext }
}

async function buildAndRestartServer() {
  if (isBuilding) {
    log('Server', 'Build already in progress, skipping...', colors.yellow)
    return
  }
  
  isBuilding = true
  const startTime = Date.now()
  
  try {
    log('Server', 'Building...', colors.blue)
    
    // Try to rebuild with existing contexts first
    try {
      // Create or get existing contexts
      const contexts = await createBuildContexts()
      
      // Rebuild both bundles sequentially to avoid esbuild rebuild contention
      await contexts.frameworkContext.rebuild()
      await contexts.serverContext.rebuild()
    } catch (rebuildError) {
      // If rebuild fails, the contexts might be disposed
      if (rebuildError.message.includes('no longer running') || 
          rebuildError.message.includes('disposed')) {
        log('Build', 'Contexts were disposed, recreating...', colors.yellow)
        
        // Reset contexts to force recreation
        serverContext = null
        frameworkContext = null
        
        // Recreate contexts and rebuild
        const newContexts = await createBuildContexts()
        // Rebuild sequentially after recreation as well
        await newContexts.frameworkContext.rebuild()
        await newContexts.serverContext.rebuild()
      } else {
        // Re-throw if it's a different error
        throw rebuildError
      }
    }
    
    const buildTime = Date.now() - startTime
    log('Server', `✅ Build completed in ${buildTime}ms`, colors.green)
    
    // Kill existing server process
    if (serverProcess) {
      log('Server', 'Stopping previous server...', colors.dim)
      try {
        // For non-Windows, kill the entire process group
        if (process.platform !== 'win32' && serverProcess.pid) {
          try {
            process.kill(-serverProcess.pid, 'SIGTERM')
          } catch (e) {
            // Fallback to killing just the process
            serverProcess.kill('SIGTERM')
          }
        } else {
          serverProcess.kill('SIGTERM')
        }
        
        // Wait for process to exit with timeout
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (serverProcess && !serverProcess.killed) {
              // Force kill if still running
              try {
                if (process.platform !== 'win32' && serverProcess.pid) {
                  process.kill(-serverProcess.pid, 'SIGKILL')
                } else {
                  serverProcess.kill('SIGKILL')
                }
              } catch (e) {
                // Process might already be dead
              }
            }
            resolve()
          }, 500)
          
          serverProcess.once('exit', () => {
            clearTimeout(timeout)
            resolve()
          })
        })
      } catch (e) {
        // Process might already be dead
      }
      serverProcess = null
    }
    
    // Start new server process
    log('Server', 'Starting server on port 4444...', colors.blue)
    serverProcess = spawn('bun', [path.join(rootDir, 'build/index.js')], {
      stdio: 'inherit',
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: '4444'
      },
      // Create a new process group for better cleanup
      detached: process.platform !== 'win32'
    })
    
    serverProcess.on('error', (err) => {
      log('Server', `Process error: ${err.message}`, colors.red)
    })
    
    serverProcess.on('exit', (code, signal) => {
      if (signal !== 'SIGTERM') {
        log('Server', `Process exited with code ${code}`, colors.yellow)
      }
    })
    
  } catch (error) {
    log('Server', `Build failed: ${error.message}`, colors.red)
    
    // If build fails with service error, reset contexts
    if (error.message.includes('no longer running') || 
        error.message.includes('disposed') ||
        error.message.includes('Cannot rebuild')) {
      log('Build', 'Resetting build contexts for next attempt...', colors.yellow)
      serverContext = null
      frameworkContext = null
    }
  } finally {
    isBuilding = false
  }
}

/**
 * Setup File Watcher for Server
 */
function setupWatcher() {
  const watchPaths = [
    path.join(rootDir, 'src/**/*.ts'),
    path.join(rootDir, 'src/**/*.tsx'),
  ]
  
  // Exclude test files and client-only files from triggering server rebuilds
  const ignored = [
    '**/node_modules/**',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/tests/**',
    '**/__tests__/**',
    '**/src/client/**',  // Client files are handled by Vite
  ]
  
  log('Watcher', 'Setting up file watcher...', colors.cyan)
  
  const watcher = chokidar.watch(watchPaths, {
    ignored,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 100
    }
  })
  
  // Debounce rebuilds
  let rebuildTimeout = null
  
  const triggerRebuild = () => {
    if (rebuildTimeout) {
      clearTimeout(rebuildTimeout)
    }
    rebuildTimeout = setTimeout(() => {
      buildAndRestartServer()
    }, 300) // Wait 300ms for multiple file saves
  }
  
  watcher
    .on('change', (filepath) => {
      const relativePath = path.relative(rootDir, filepath)
      log('Watcher', `File changed: ${relativePath}`, colors.dim)
      triggerRebuild()
    })
    .on('add', (filepath) => {
      const relativePath = path.relative(rootDir, filepath)
      log('Watcher', `File added: ${relativePath}`, colors.dim)
      triggerRebuild()
    })
    .on('unlink', (filepath) => {
      const relativePath = path.relative(rootDir, filepath)
      log('Watcher', `File removed: ${relativePath}`, colors.dim)
      triggerRebuild()
    })
    .on('error', (error) => {
      log('Watcher', `Error: ${error.message}`, colors.red)
    })
  
  log('Watcher', '✅ Watching for TypeScript changes', colors.green)
  return watcher
}

/**
 * Main Development Server
 */
async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔═══════════════════════════════════════════╗
║     Hyperscape Development Server         ║
╚═══════════════════════════════════════════╝
${colors.reset}`)
  
  log('Dev', 'Starting development environment...', colors.bright)
  
  // Copy PhysX assets first
  await copyPhysXAssets()
  
  // Start everything in parallel
  const [viteServer] = await Promise.all([
    startViteServer(),
    buildAndRestartServer()
  ])
  
  // Setup file watcher for server rebuilds
  const watcher = setupWatcher()
  
  // Log final status
  console.log(`\n${colors.bright}${colors.green}═══ Development servers ready! ═══${colors.reset}\n`)
  console.log(`  ${colors.cyan}Client:${colors.reset} http://localhost:${process.env.VITE_PORT || 3333}`)
  console.log(`  ${colors.blue}Server:${colors.reset} ws://localhost:4444/ws`)
  console.log(`\n${colors.dim}Press Ctrl+C to stop all servers${colors.reset}\n`)
  
  // Track if we're already cleaning up
  let isCleaningUp = false
  
  // Cleanup on exit
  const cleanup = async (signal) => {
    // Prevent multiple cleanup calls
    if (isCleaningUp) {
      return
    }
    isCleaningUp = true
    
    console.log('\n' + colors.yellow + `Received ${signal}, shutting down gracefully...` + colors.reset)
    
    try {
      // Kill server process and its children
      if (serverProcess) {
        // For non-Windows, kill the entire process group
        if (process.platform !== 'win32' && serverProcess.pid) {
          try {
            process.kill(-serverProcess.pid, 'SIGTERM')
          } catch (e) {
            // Fallback to killing just the process
            serverProcess.kill('SIGTERM')
          }
        } else {
          serverProcess.kill('SIGTERM')
        }
        
        // Give it 2 seconds to clean up gracefully
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (serverProcess && !serverProcess.killed) {
              log('Server', 'Force killing server process...', colors.yellow)
              serverProcess.kill('SIGKILL')
            }
            resolve()
          }, 2000)
          
          serverProcess.once('exit', () => {
            clearTimeout(timeout)
            resolve()
          })
        })
      }
      
      // Dispose of esbuild contexts
      if (serverContext) {
        try {
          await serverContext.dispose()
        } catch (e) {
          // Context might already be disposed
        }
      }
      if (frameworkContext) {
        try {
          await frameworkContext.dispose()
        } catch (e) {
          // Context might already be disposed
        }
      }
      
      // Close Vite server
      if (viteServer) {
        await viteServer.close()
      }
      
      // Close file watcher
      if (watcher) {
        await watcher.close()
      }
      
      console.log(colors.green + 'Goodbye!' + colors.reset)
    } catch (error) {
      console.error(colors.red + 'Error during cleanup:' + colors.reset, error)
    } finally {
      // Force exit after a timeout to ensure we don't hang
      setTimeout(() => {
        process.exit(0)
      }, 100).unref()
    }
  }
  
  // Store cleanup globally for error handlers
  globalCleanup = cleanup
  
  // Handle various termination signals
  process.on('SIGINT', () => cleanup('SIGINT'))
  process.on('SIGTERM', () => cleanup('SIGTERM'))
  process.on('SIGUSR1', () => cleanup('SIGUSR1'))
  process.on('SIGUSR2', () => cleanup('SIGUSR2'))
  
  // Handle uncaught exceptions during runtime
  process.on('exit', (code) => {
    if (!isCleaningUp) {
      console.log(colors.dim + `Process exiting with code ${code}` + colors.reset)
    }
  })
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log('Error', `Uncaught exception: ${error.message}`, colors.red)
  console.error(error)
})

process.on('unhandledRejection', (reason, promise) => {
  log('Error', `Unhandled rejection: ${reason}`, colors.red)
  console.error(reason)
})

// Store cleanup function globally for error handlers
let globalCleanup = null

// Run the dev server
main().catch(async (error) => {
  log('Error', `Failed to start: ${error.message}`, colors.red)
  console.error(error)
  
  // Try to cleanup if we have a cleanup function
  if (globalCleanup) {
    await globalCleanup('ERROR')
  }
  
  // Force exit
  setTimeout(() => {
    process.exit(1)
  }, 100).unref()
})
