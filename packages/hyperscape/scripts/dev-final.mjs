#!/usr/bin/env node
/**
 * Final Dev Server Solution
 * 
 * This is a complete rewrite focusing on:
 * 1. Guaranteed process cleanup
 * 2. Memory leak prevention
 * 3. Proper signal handling
 */

import { spawn, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '../')

// Change to package directory
process.chdir(rootDir)

// Colors
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

// PID tracking file
const pidFile = path.join(os.tmpdir(), 'hyperscape-dev.pid')

// Kill all processes on the given ports and any stored PIDs
function killEverything() {
  console.log(`${colors.yellow}Killing all processes...${colors.reset}`)
  
  // Kill any stored PIDs
  if (fs.existsSync(pidFile)) {
    try {
      const pids = fs.readFileSync(pidFile, 'utf8').split('\n').filter(Boolean)
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid), 'SIGKILL')
        } catch (e) {
          // Process might already be dead
        }
      }
      fs.unlinkSync(pidFile)
    } catch (e) {
      // Ignore
    }
  }
  
  // Kill anything on our ports
  try {
    if (process.platform === 'win32') {
      execSync('netstat -ano | findstr :4444 | findstr LISTENING | for /f "tokens=5" %a in (\'more\') do taskkill /PID %a /F', { stdio: 'ignore' })
      execSync('netstat -ano | findstr :3333 | findstr LISTENING | for /f "tokens=5" %a in (\'more\') do taskkill /PID %a /F', { stdio: 'ignore' })
    } else {
      execSync('lsof -ti :4444 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' })
      execSync('lsof -ti :3333 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' })
    }
  } catch (e) {
    // Ignore
  }
  
  // Kill all bun processes as a last resort
  try {
    if (process.platform !== 'win32') {
      execSync('pkill -9 bun 2>/dev/null || true', { stdio: 'ignore' })
    }
  } catch (e) {
    // Ignore
  }
}

// Track child processes
const children = []
let isShuttingDown = false

// Store PIDs
function storePid(pid) {
  if (!pid) return
  const pids = fs.existsSync(pidFile) 
    ? fs.readFileSync(pidFile, 'utf8').split('\n').filter(Boolean) 
    : []
  pids.push(pid.toString())
  fs.writeFileSync(pidFile, pids.join('\n'))
}

// Spawn a child process and track it
function spawnChild(name, cmd, args, options = {}) {
  console.log(`${colors.blue}[${name}]${colors.reset} Starting...`)
  
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    ...options,
    // Important: Don't detach, we want to maintain control
    detached: false
  })
  
  if (child.pid) {
    storePid(child.pid)
    children.push({ name, process: child, pid: child.pid })
  }
  
  child.on('exit', (code, signal) => {
    console.log(`${colors.yellow}[${name}]${colors.reset} Exited (code: ${code}, signal: ${signal})`)
    const index = children.findIndex(c => c.process === child)
    if (index !== -1) {
      children.splice(index, 1)
    }
    
    // If not shutting down and it crashed, restart after delay
    if (!isShuttingDown && code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
      console.log(`${colors.yellow}[${name}]${colors.reset} Crashed, restarting in 2 seconds...`)
      setTimeout(() => {
        if (!isShuttingDown) {
          spawnChild(name, cmd, args, options)
        }
      }, 2000)
    }
  })
  
  child.on('error', (err) => {
    console.error(`${colors.red}[${name}]${colors.reset} Error: ${err.message}`)
  })
  
  return child
}

// Guaranteed cleanup
async function cleanup(signal) {
  if (isShuttingDown) return
  isShuttingDown = true
  
  console.log(`\n${colors.yellow}Received ${signal}, shutting down...${colors.reset}`)
  
  // First attempt: graceful shutdown
  for (const { name, process } of children) {
    if (process && !process.killed) {
      console.log(`${colors.dim}Stopping ${name}...${colors.reset}`)
      try {
        process.kill('SIGTERM')
      } catch (e) {
        // Ignore
      }
    }
  }
  
  // Wait 1 second
  await new Promise(r => setTimeout(r, 1000))
  
  // Second attempt: force kill remaining
  for (const { process, pid } of children) {
    if (process && !process.killed) {
      try {
        process.kill('SIGKILL')
      } catch (e) {
        // Ignore
      }
    }
    // Also try PID directly
    if (pid) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch (e) {
        // Ignore
      }
    }
  }
  
  // Nuclear option: kill everything
  killEverything()
  
  console.log(`${colors.green}Cleanup complete${colors.reset}`)
  
  // Exit hard
  process.exit(0)
}

// Signal handlers
process.on('SIGINT', () => cleanup('SIGINT'))
process.on('SIGTERM', () => cleanup('SIGTERM'))
process.on('SIGHUP', () => cleanup('SIGHUP'))

// Emergency exit handler
process.on('exit', () => {
  if (!isShuttingDown) {
    killEverything()
  }
})

// Uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`${colors.red}Uncaught exception:${colors.reset}`, error)
  cleanup('uncaughtException')
})

process.on('unhandledRejection', (reason) => {
  console.error(`${colors.red}Unhandled rejection:${colors.reset}`, reason)
  cleanup('unhandledRejection')
})

// Build script for server
const buildScript = `
import * as esbuild from 'esbuild'
import path from 'path'

const excludeTestsPlugin = {
  name: 'exclude-tests',
  setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      if (args.path.includes('__tests__') || 
          args.path.includes('/tests/') ||
          args.path.includes('.test.') ||
          args.path.includes('.spec.')) {
        return { path: args.path, external: true }
      }
    })
  }
}

async function build() {
  console.log('[Build] Building server...')
  
  await Promise.all([
    esbuild.build({
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
    }),
    esbuild.build({
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
  ])
  
  console.log('[Build] ✅ Build complete')
}

build().catch(err => {
  console.error('[Build] Failed:', err)
  process.exit(1)
})
`

// Main
async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔═══════════════════════════════════════════╗
║     Hyperscape Development Server         ║
╚═══════════════════════════════════════════╝
${colors.reset}`)
  
  // Clean up any previous runs
  killEverything()
  
  // Ensure directories exist
  await fs.promises.mkdir('build/public', { recursive: true }).catch(() => {})
  
  // Copy PhysX assets
  console.log(`${colors.dim}Copying PhysX assets...${colors.reset}`)
  try {
    const physxWasm = 'node_modules/@hyperscape/physx-js-webidl/dist/physx-js-webidl.wasm'
    const physxJs = 'node_modules/@hyperscape/physx-js-webidl/dist/physx-js-webidl.js'
    if (fs.existsSync(physxWasm)) {
      fs.copyFileSync(physxWasm, 'build/public/physx-js-webidl.wasm')
      fs.copyFileSync(physxJs, 'build/public/physx-js-webidl.js')
    }
  } catch (e) {
    // Ignore
  }
  
  // Build server first
  console.log(`${colors.blue}Building server...${colors.reset}`)
  execSync(`bun -e "${buildScript.replace(/"/g, '\\"')}"`, { 
    stdio: 'inherit',
    cwd: rootDir 
  })
  
  // Start server with environment controls
  spawnChild('Server', 'bun', ['build/index.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: '4444',
      DISABLE_BOTS: process.env.DISABLE_BOTS || 'false',  // Allow bots but can be disabled
      NODE_ENV: 'development',
      MAX_BOT_COUNT: '1',  // Limit to 1 bot to prevent memory issues
    }
  })
  
  // Wait for server to start
  await new Promise(r => setTimeout(r, 2000))
  
  // Start Vite
  spawnChild('Vite', 'bun', ['x', 'vite', '--host', '--port', process.env.VITE_PORT || '3333'], {
    cwd: rootDir,
    env: {
      ...process.env,
      VITE_PORT: process.env.VITE_PORT || '3333'
    }
  })
  
  // Show ready message
  setTimeout(() => {
    console.log(`\n${colors.bright}${colors.green}═══ Development servers ready! ═══${colors.reset}\n`)
    console.log(`  ${colors.cyan}Client:${colors.reset} http://localhost:${process.env.VITE_PORT || 3333}`)
    console.log(`  ${colors.blue}Server:${colors.reset} ws://localhost:4444/ws`)
    console.log(`\n${colors.dim}Press Ctrl+C to stop all servers (guaranteed cleanup)${colors.reset}\n`)
  }, 3000)
  
  // Keep process alive
  process.stdin.resume()
}

// Start
main().catch(error => {
  console.error(`${colors.red}Failed to start:${colors.reset}`, error)
  cleanup('error')
})
