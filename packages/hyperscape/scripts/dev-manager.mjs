#!/usr/bin/env node
/**
 * Development Process Manager
 * 
 * This script manages the lifecycle of all development processes (Vite, Server, etc.)
 * with proper cleanup and shutdown handling.
 */

import 'dotenv/config'
import fs from 'fs-extra'
import path from 'path'
import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import * as os from 'os'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '../')

// Process tracking
const processes = new Map()
const pidDir = path.join(os.tmpdir(), 'hyperscape-dev')

// Ensure PID directory exists
await fs.ensureDir(pidDir)

// Colors for console
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
 * Kill a process tree (process and all its children)
 */
async function killProcessTree(pid) {
  if (!pid) return
  
  try {
    if (process.platform === 'win32') {
      // Windows: use taskkill to kill process tree
      await execAsync(`taskkill /pid ${pid} /T /F`).catch(() => {})
    } else {
      // Unix: Find all child processes and kill them
      try {
        // Get all child PIDs
        const { stdout } = await execAsync(`pgrep -P ${pid}`)
        const childPids = stdout.trim().split('\n').filter(p => p)
        
        // Kill children first
        for (const childPid of childPids) {
          await killProcessTree(parseInt(childPid))
        }
      } catch (e) {
        // No children or pgrep not available
      }
      
      // Kill the parent process
      try {
        process.kill(pid, 'SIGKILL')
      } catch (e) {
        // Process might already be dead
      }
    }
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Kill any process using the specified port
 */
async function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`)
      const lines = stdout.trim().split('\n')
      const pids = new Set()
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && pid !== '0') pids.add(pid)
      }
      for (const pid of pids) {
        await execAsync(`taskkill /PID ${pid} /F`).catch(() => {})
      }
    } else {
      const { stdout } = await execAsync(`lsof -ti :${port}`)
      const pids = stdout.trim().split('\n').filter(pid => pid)
      for (const pid of pids) {
        process.kill(parseInt(pid), 'SIGKILL')
      }
    }
  } catch (e) {
    // No process on port or command failed
  }
}

/**
 * Clean up any orphaned processes from previous runs
 */
async function cleanupOrphans() {
  log('Cleanup', 'Checking for orphaned processes...', colors.dim)
  
  // Check PID files
  const pidFiles = await fs.readdir(pidDir).catch(() => [])
  for (const file of pidFiles) {
    if (file.startsWith('hyperscape-')) {
      const pidFile = path.join(pidDir, file)
      try {
        const pid = parseInt(await fs.readFile(pidFile, 'utf8'))
        if (!isNaN(pid)) {
          // Check if process is still running
          try {
            process.kill(pid, 0) // Check if process exists
            // Process exists, kill it
            await killProcessTree(pid)
            log('Cleanup', `Killed orphaned process ${pid}`, colors.yellow)
          } catch (e) {
            // Process doesn't exist
          }
        }
        await fs.remove(pidFile)
      } catch (e) {
        // Ignore
      }
    }
  }
  
  // Also kill anything on our ports
  await killProcessOnPort(4444)
  await killProcessOnPort(3333)
}

/**
 * Spawn a managed process
 */
function spawnManaged(name, command, args, options = {}) {
  log(name, `Starting ${command} ${args.join(' ')}`, colors.blue)
  
  const proc = spawn(command, args, {
    stdio: 'pipe',
    ...options,
    // Don't detach - we want to maintain control
    detached: false
  })
  
  if (!proc.pid) {
    throw new Error(`Failed to spawn ${name}`)
  }
  
  // Save PID
  const pidFile = path.join(pidDir, `hyperscape-${name}-${proc.pid}.pid`)
  fs.writeFileSync(pidFile, proc.pid.toString())
  
  // Track process
  processes.set(name, {
    process: proc,
    pid: proc.pid,
    pidFile,
    name,
    startTime: Date.now()
  })
  
  // Handle output
  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n')
    lines.forEach(line => {
      if (line.trim()) {
        console.log(`[${name}] ${line}`)
      }
    })
  })
  
  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n')
    lines.forEach(line => {
      if (line.trim()) {
        console.error(`[${name}] ${line}`)
      }
    })
  })
  
  // Handle exit
  proc.on('exit', (code, signal) => {
    log(name, `Process exited (code: ${code}, signal: ${signal})`, colors.yellow)
    
    // Remove PID file
    fs.remove(pidFile).catch(() => {})
    
    // Remove from tracking
    processes.delete(name)
    
    // If this was unexpected and we're not shutting down, restart it
    if (!isShuttingDown && code !== 0 && signal !== 'SIGKILL' && signal !== 'SIGTERM') {
      log(name, 'Unexpected exit, restarting in 2 seconds...', colors.yellow)
      setTimeout(() => {
        if (!isShuttingDown) {
          restartProcess(name)
        }
      }, 2000)
    }
  })
  
  proc.on('error', (err) => {
    log(name, `Process error: ${err.message}`, colors.red)
  })
  
  return proc
}

/**
 * Process restart handlers
 */
const processConfigs = {
  'vite': {
    command: 'bun',
    args: ['x', 'vite', '--host', '--port', process.env.VITE_PORT || '3333'],
    cwd: rootDir,
    env: {
      ...process.env,
      VITE_PORT: process.env.VITE_PORT || '3333'
    }
  },
  'server': {
    command: 'bun',
    args: ['scripts/build-and-run-server.mjs'],
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: '4444'
    }
  }
}

function restartProcess(name) {
  const config = processConfigs[name]
  if (!config) {
    log('Manager', `Unknown process: ${name}`, colors.red)
    return
  }
  
  const existing = processes.get(name)
  if (existing) {
    log(name, 'Process already running, killing first...', colors.yellow)
    killProcessTree(existing.pid)
  }
  
  spawnManaged(name, config.command, config.args, config)
}

/**
 * Health check for processes
 */
async function healthCheck() {
  for (const [name, info] of processes.entries()) {
    try {
      // Check if process is still alive
      process.kill(info.pid, 0)
    } catch (e) {
      // Process is dead
      log('Health', `Process ${name} (${info.pid}) is dead`, colors.red)
      processes.delete(name)
      
      // Clean up PID file
      await fs.remove(info.pidFile).catch(() => {})
      
      // Restart if not shutting down
      if (!isShuttingDown) {
        restartProcess(name)
      }
    }
  }
}

// Start health checks
const healthInterval = setInterval(healthCheck, 5000)

/**
 * Shutdown handling
 */
let isShuttingDown = false

async function shutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true
  
  console.log(`\n${colors.yellow}Received ${signal}, shutting down...${colors.reset}`)
  
  // Stop health checks
  clearInterval(healthInterval)
  
  // Kill all managed processes
  const killPromises = []
  for (const [name, info] of processes.entries()) {
    log('Shutdown', `Killing ${name} (${info.pid})...`, colors.dim)
    killPromises.push(killProcessTree(info.pid))
  }
  
  await Promise.all(killPromises)
  
  // Clean up PID files
  const pidFiles = await fs.readdir(pidDir).catch(() => [])
  for (const file of pidFiles) {
    if (file.startsWith('hyperscape-')) {
      await fs.remove(path.join(pidDir, file)).catch(() => {})
    }
  }
  
  console.log(`${colors.green}Shutdown complete${colors.reset}`)
  process.exit(0)
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGHUP', () => shutdown('SIGHUP'))
process.on('SIGUSR1', () => shutdown('SIGUSR1'))
process.on('SIGUSR2', () => shutdown('SIGUSR2'))

// Emergency cleanup on exit
process.on('exit', () => {
  if (!isShuttingDown) {
    console.log(colors.yellow + 'Emergency shutdown...' + colors.reset)
    // Synchronously kill all processes
    for (const [name, info] of processes.entries()) {
      try {
        process.kill(info.pid, 'SIGKILL')
      } catch (e) {
        // Ignore
      }
    }
  }
})

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(colors.red + 'Uncaught exception:' + colors.reset, error)
  shutdown('uncaughtException')
})

process.on('unhandledRejection', (reason) => {
  console.error(colors.red + 'Unhandled rejection:' + colors.reset, reason)
  shutdown('unhandledRejection')
})

/**
 * Main entry point
 */
async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔═══════════════════════════════════════════╗
║   Hyperscape Development Process Manager  ║
╚═══════════════════════════════════════════╝
${colors.reset}`)
  
  // Clean up orphans
  await cleanupOrphans()
  
  // Copy PhysX assets
  await copyPhysXAssets()
  
  // Start processes
  restartProcess('server')
  
  // Wait a bit for server to initialize before starting Vite
  setTimeout(() => {
    restartProcess('vite')
  }, 2000)
  
  // Log status
  setTimeout(() => {
    console.log(`\n${colors.bright}${colors.green}═══ Development environment ready! ═══${colors.reset}\n`)
    console.log(`  ${colors.cyan}Client:${colors.reset} http://localhost:${process.env.VITE_PORT || 3333}`)
    console.log(`  ${colors.blue}Server:${colors.reset} ws://localhost:4444/ws`)
    console.log(`\n${colors.dim}Press Ctrl+C to stop all servers${colors.reset}\n`)
  }, 5000)
}

/**
 * Copy PhysX assets (from original dev.mjs)
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

// Start the manager
main().catch(error => {
  console.error(colors.red + 'Failed to start:' + colors.reset, error)
  process.exit(1)
})
