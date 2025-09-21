#!/usr/bin/env node
/**
 * Simple Development Server Manager
 * 
 * Starts both Vite and the server, properly manages their lifecycle
 */

import 'dotenv/config'
import { spawn, exec } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.chdir(path.join(__dirname, '../'))

// Track our child processes
const children = []

// Colors for output
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

console.log(`${colors.bright}${colors.cyan}
╔═══════════════════════════════════════════╗
║     Hyperscape Development Server         ║
╚═══════════════════════════════════════════╝
${colors.reset}`)

// Clean up any orphaned processes from previous runs
console.log(`${colors.dim}Cleaning up orphaned processes...${colors.reset}`)
await execAsync('lsof -ti :4444 | xargs kill -9 2>/dev/null').catch(() => {})
await execAsync('lsof -ti :3333 | xargs kill -9 2>/dev/null').catch(() => {})
await new Promise(resolve => setTimeout(resolve, 500)) // Brief pause to ensure ports are freed

// Function to spawn a child and track it
function spawnChild(name, command, args, opts = {}) {
  console.log(`${colors.blue}[${name}]${colors.reset} Starting...`)
  
  const child = spawn(command, args, {
    stdio: 'inherit',
    ...opts
  })
  
  children.push({ name, process: child })
  
  child.on('exit', (code, signal) => {
    console.log(`${colors.yellow}[${name}]${colors.reset} Exited (code: ${code}, signal: ${signal})`)
    // Remove from children array
    const index = children.findIndex(c => c.process === child)
    if (index !== -1) {
      children.splice(index, 1)
    }
  })
  
  child.on('error', (err) => {
    console.error(`${colors.red}[${name}]${colors.reset} Error: ${err.message}`)
  })
  
  return child
}

// Helper to kill process tree
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

// Cleanup function
async function cleanup(signal) {
  console.log(`\n${colors.yellow}Received ${signal}, shutting down...${colors.reset}`)
  
  // First, try graceful shutdown
  for (const { name, process } of children) {
    console.log(`${colors.dim}Stopping ${name}...${colors.reset}`)
    if (process.pid) {
      process.kill('SIGTERM')
    }
  }
  
  // Give them 2 seconds to shut down gracefully
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Force kill any remaining using process tree kill
  for (const { name, process } of children) {
    if (process.pid && !process.killed) {
      console.log(`${colors.yellow}Force killing ${name}...${colors.reset}`)
      await killProcessTree(process.pid)
    }
  }
  
  // Also cleanup ports directly
  console.log(`${colors.dim}Cleaning up ports...${colors.reset}`)
  await execAsync('lsof -ti :4444 | xargs kill -9 2>/dev/null').catch(() => {})
  await execAsync('lsof -ti :3333 | xargs kill -9 2>/dev/null').catch(() => {})
  
  console.log(`${colors.green}Shutdown complete${colors.reset}`)
  process.exit(0)
}

// Register signal handlers
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(signal => {
  process.on(signal, () => cleanup(signal))
})

// Handle process exit
process.on('exit', () => {
  // Emergency kill all children
  for (const { process } of children) {
    try {
      if (process.pid) {
        process.kill('SIGKILL')
        // Also try to kill the process tree on Unix
        if (process.platform !== 'win32') {
          execAsync(`pkill -9 -P ${process.pid}`).catch(() => {})
        }
      }
    } catch (e) {
      // Ignore
    }
  }
})

// Start the server (with build and watch)
const serverChild = spawnChild('Server', 'bun', ['scripts/build-and-run-server.mjs'], {
  env: {
    ...process.env,
    PORT: '4444',
    NODE_ENV: 'development'
  }
})

// Wait a bit for server to start, then start Vite
setTimeout(() => {
  const viteChild = spawnChild('Vite', 'bun', ['x', 'vite', '--host', '--port', process.env.VITE_PORT || '3333'], {
    env: {
      ...process.env,
      VITE_PORT: process.env.VITE_PORT || '3333'
    }
  })
  
  // Show ready message after a delay
  setTimeout(() => {
    console.log(`\n${colors.bright}${colors.green}═══ Development servers ready! ═══${colors.reset}\n`)
    console.log(`  ${colors.cyan}Client:${colors.reset} http://localhost:${process.env.VITE_PORT || 3333}`)
    console.log(`  ${colors.blue}Server:${colors.reset} ws://localhost:4444/ws`)
    console.log(`\n${colors.dim}Press Ctrl+C to stop all servers${colors.reset}\n`)
  }, 3000)
}, 2000)

// Keep the process running
process.stdin.resume()

