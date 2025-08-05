#!/usr/bin/env node

import { program } from 'commander'
import { resolve, join, dirname } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

program
  .name('hyperscape')
  .description('Hyperscape 3D multiplayer world engine')
  .version('1.0.0')

program
  .command('start')
  .description('Start a Hyperscape world server')
  .option('-w, --world <path>', 'Path to world directory', '.')
  .option('-p, --port <port>', 'Server port', '4444')
  .option('--dev', 'Run in development mode with file watching')
  .action(async (options) => {
    const worldPath = resolve(options.world)
    const port = parseInt(options.port, 10)
    
    // Validate world directory
    if (!existsSync(worldPath)) {
      console.error(`❌ World directory does not exist: ${worldPath}`)
      process.exit(1)
    }
    
    // Check for world.json
    const worldJsonPath = join(worldPath, 'world.json')

    if (!existsSync(worldJsonPath)) {
      console.error(`❌ Invalid world directory: ${worldPath}`)
      console.error('World directory must contain world.json')
      process.exit(1)
    }
    
    
    // Set environment variables
    process.env.WORLD = worldPath
    process.env.PORT = port.toString()
    
    if (options.dev) {
      process.env.NODE_ENV = 'development'
    }
    
    // Import and start the server
    try {
      await import('./server/index.js')
    } catch (_error) {
      console.error('❌ Failed to start server:', _error)
      process.exit(1)
    }
  })

program
  .command('build')
  .description('Build Hyperscape for production')
  .option('-w, --world <path>', 'Path to world directory', '.')
  .action(async (options) => {
    const worldPath = resolve(options.world)
    
    
    process.env.WORLD = worldPath
    
    try {
      const { execSync } = await import('child_process')
      const packageDir = resolve(__dirname, '..')
      execSync('npm run build', { stdio: 'inherit', cwd: packageDir })
    } catch (_error) {
      console.error('❌ Build failed:', _error)
      process.exit(1)
    }
  })

program
  .command('init <worldName>')
  .description('Initialize a new Hyperscape world')
  .action(async (worldName) => {
    const worldPath = resolve(worldName)
    
    if (existsSync(worldPath)) {
      console.error(`❌ Directory already exists: ${worldPath}`)
      process.exit(1)
    }
    
    
    try {
      const { mkdirSync, writeFileSync, cpSync: _cpSync } = await import('fs')
      
      // Create directory structure
      mkdirSync(worldPath, { recursive: true })
      mkdirSync(join(worldPath, 'assets'), { recursive: true })
      
      // Create world.json
      const worldConfig = {
        spawn: {
          position: [0, 2, 0],
          rotation: [0, 0, 0]
        }
      }
      writeFileSync(join(worldPath, 'world.json'), JSON.stringify(worldConfig, null, 2))
      
      
    } catch (_error) {
      console.error('❌ Failed to create world:', _error)
      process.exit(1)
    }
  })

program.parse()