import 'dotenv-flow/config'
import fs from 'fs-extra'
import path from 'path'
import { fork, execSync } from 'child_process'
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'url'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'

const dev = process.argv.includes('--dev')
const typecheck = !process.argv.includes('--no-typecheck')
const serverOnly = process.argv.includes('--server-only')
const dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(dirname, '../')
const buildDir = path.join(rootDir, 'build')

// Ensure build directories exist
await fs.ensureDir(buildDir)
await fs.emptyDir(path.join(buildDir, 'public'))

/**
 * TypeScript Plugin for ESBuild
 */
const typescriptPlugin = {
  name: 'typescript',
  setup(build) {
    // Handle .ts and .tsx files
    build.onResolve({ filter: /\.tsx?$/ }, args => {
      return {
        path: path.resolve(args.resolveDir, args.path),
        namespace: 'file',
      }
    })
  },
}

/**
 * Plugin to exclude test files
 */
const excludeTestsPlugin = {
  name: 'exclude-tests',
  setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      // Exclude test files and test directories
      if (args.path.includes('__tests__') || 
          args.path.includes('/tests/') ||
          args.path.includes('.test.') ||
          args.path.includes('.spec.') ||
          args.path.includes('mockWorld') ||
          args.path.includes('test-utils') ||
          args.path === 'vitest' ||
          args.path.includes('vitest/')) {
        return { path: args.path, external: true }
      }
    })
    
    build.onLoad({ filter: /\.tsx?$/ }, async (args) => {
      const fs = await import('fs')
      let contents = await fs.promises.readFile(args.path, 'utf8')
      
      // Remove any vitest imports
      contents = contents.replace(/import\s+.*?\s+from\s+['"]vitest['"]/g, '')
      contents = contents.replace(/from\s+['"]vitest['"]/g, 'from "node:test"')
      
      return {
        contents,
        loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts'
      }
    })
  }
}

/**
 * Run TypeScript Type Checking
 */
async function runTypeCheck() {
  if (!typecheck) return
  
  console.log('Running TypeScript type checking...')
  try {
    execSync('npx tsc --noEmit -p tsconfig.build.json', { 
      stdio: 'inherit',
      cwd: rootDir 
    })
    console.log('Type checking passed ✓')
  } catch (error) {
    console.error('Type checking failed!')
    // if (!dev) {
    //   process.exit(1)
    // }
  }
}

/**
 * Build Client
 */
const clientPublicDir = path.join(rootDir, 'src/client/public')
const clientBuildDir = path.join(rootDir, 'build/public')
const clientHtmlSrc = path.join(rootDir, 'src/client/public/index.html')
const clientHtmlDest = path.join(rootDir, 'build/public/index.html')

async function buildClient() {
  const clientCtx = await esbuild.context({
    entryPoints: [
      'src/client/index.tsx',
      'src/client/particles.ts'
    ],
    entryNames: '/[name]-[hash]',
    outdir: clientBuildDir,
    platform: 'browser',
    format: 'esm',
    bundle: true,
    treeShaking: true,
    minify: !dev,
    sourcemap: true,
    metafile: true,
    jsx: 'automatic',
    jsxImportSource: 'react',
    external: [
      'better-sqlite3',
      'knex',
      'fs',
      'path',
      'crypto',
      'stream',
      'util',
      'os',
      'child_process'
    ],
    define: {
      'process.env.NODE_ENV': dev ? '"development"' : '"production"',
      'import.meta.env.PUBLIC_WS_URL': JSON.stringify(process.env.PUBLIC_WS_URL || ''),
      'import.meta.env.LIVEKIT_URL': JSON.stringify(process.env.LIVEKIT_URL || ''),
      'import.meta.env.LIVEKIT_API_KEY': JSON.stringify(process.env.LIVEKIT_API_KEY || ''),
      // Don't include API secret in client bundle - it should only be on server
      // 'import.meta.env.LIVEKIT_API_SECRET': JSON.stringify(process.env.LIVEKIT_API_SECRET || ''),
      // Also define window versions for backward compatibility
      'window.PUBLIC_WS_URL': JSON.stringify(process.env.PUBLIC_WS_URL || ''),
      'window.LIVEKIT_URL': JSON.stringify(process.env.LIVEKIT_URL || ''),
    },
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
      '.js': 'jsx',
      '.jsx': 'jsx',
    },
    alias: {
      react: 'react',
    },
    plugins: [
      polyfillNode({}),
      typescriptPlugin,

      {
        name: 'client-finalize-plugin',
        setup(build) {
          build.onEnd(async result => {
            if (result.errors.length > 0) return
            
            // Copy public files
            await fs.copy(clientPublicDir, clientBuildDir)
            
            // Copy PhysX WASM from physx-js-webidl npm package
            // Try local node_modules first, then fallback to root workspace
            let physxWasmSrc = path.join(rootDir, 'node_modules/@hyperscape/physx-js-webidl/dist/physx-js-webidl.wasm')
            if (!await fs.pathExists(physxWasmSrc)) {
              physxWasmSrc = path.join(rootDir, '../../node_modules/@hyperscape/physx-js-webidl/dist/physx-js-webidl.wasm')
            }
            const physxWasmDest = path.join(rootDir, 'build/public/physx-js-webidl.wasm')
            
            // Ensure WASM file exists
            if (await fs.pathExists(physxWasmSrc)) {
              await fs.copy(physxWasmSrc, physxWasmDest)
              console.log('✓ Copied PhysX WASM file from node_modules to build/public/')
            } else {
              console.error('✗ PhysX WASM file not found at:', physxWasmSrc)
              console.error('  Make sure physx-js-webidl npm package is installed')
              throw new Error('PhysX WASM file missing from node_modules')
            }
            
            // Find output files
            const metafile = result.metafile
            const outputFiles = Object.keys(metafile.outputs)
            const jsPath = outputFiles
              .find(file => file.includes('/index-') && file.endsWith('.js'))
              ?.split('build/public')[1]
            const particlesPath = outputFiles
              .find(file => file.includes('/particles-') && file.endsWith('.js'))
              ?.split('build/public')[1]
            
            if (jsPath && particlesPath) {
              // Inject into HTML
              let htmlContent = await fs.readFile(clientHtmlSrc, 'utf-8')
              htmlContent = htmlContent.replace('{jsPath}', jsPath)
              htmlContent = htmlContent.replace('{particlesPath}', particlesPath)
              htmlContent = htmlContent.replaceAll('{buildId}', Date.now().toString())
              await fs.writeFile(clientHtmlDest, htmlContent)
            }
          })
        },
      },
    ],
  })
  
  if (dev) {
    await clientCtx.watch()
  }
  
  const buildResult = await clientCtx.rebuild()
  await fs.writeFile(
    path.join(buildDir, 'client-meta.json'), 
    JSON.stringify(buildResult.metafile, null, 2)
  )
  
  return clientCtx
}

/**
 * Build Framework Library
 */
async function buildFramework() {
  const frameworkCtx = await esbuild.context({
    entryPoints: ['src/index.ts'],
    outfile: 'build/framework.js',
    platform: 'neutral',
    format: 'esm',
    bundle: true,
    treeShaking: true,
    minify: !dev,
    sourcemap: true,
    packages: 'external',
    target: 'esnext',
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    plugins: [typescriptPlugin],
  })
  
  await frameworkCtx.rebuild()
  return frameworkCtx
}

/**
 * Build Server
 */
let serverProcess

async function buildServer() {
  const serverCtx = await esbuild.context({
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
    plugins: [
      typescriptPlugin,
      excludeTestsPlugin,
      {
        name: 'server-finalize-plugin',
        setup(build) {
          build.onEnd(async result => {
            if (result.errors.length > 0) return
            
            // PhysX JS is now loaded from npm package, no need to copy JS file
            
            // Copy WASM from physx-js-webidl npm package
            // Try local node_modules first, then fallback to root workspace
            let physxWasmSrc = path.join(rootDir, 'node_modules/@hyperscape/physx-js-webidl/dist/physx-js-webidl.wasm')
            if (!await fs.pathExists(physxWasmSrc)) {
              physxWasmSrc = path.join(rootDir, '../../node_modules/@hyperscape/physx-js-webidl/dist/physx-js-webidl.wasm')
            }
            const physxWasmDest = path.join(rootDir, 'build/public/physx-js-webidl.wasm')
            
            // Ensure WASM file exists
            if (await fs.pathExists(physxWasmSrc)) {
              await fs.copy(physxWasmSrc, physxWasmDest)
              console.log('✓ Copied PhysX WASM file from node_modules to build/public/')
            } else {
              console.error('✗ PhysX WASM file not found at:', physxWasmSrc)
              console.error('  Make sure physx-js-webidl npm package is installed')
              throw new Error('PhysX WASM file missing from node_modules')
            }
            
            // Restart server in dev mode
            if (dev) {
              serverProcess?.kill('SIGTERM')
              serverProcess = fork(path.join(rootDir, 'build/index.js'))
            }
          })
        },
      },
    ],
  })
  
  if (dev) {
    await serverCtx.watch()
  } else {
    await serverCtx.rebuild()
  }
  
  return serverCtx
}

/**
 * Generate TypeScript Declaration Files
 */
async function generateDeclarations() {
  if (!typecheck) return
  
  console.log('Generating TypeScript declarations...')
  try {
    execSync('npx tsc -p tsconfig.build.json', {
      stdio: 'inherit',
      cwd: rootDir
    })
    
    // Create proper framework.d.ts by re-exporting from the compiled index.d.ts
    const frameworkDeclaration = `// TypeScript declarations for Hyperscape Framework
// Re-export everything from the main index module
export * from './index';
`
    await fs.writeFile(path.join(rootDir, 'build/framework.d.ts'), frameworkDeclaration)
    
    // Create a simple server index.d.ts that points to the generated declarations
    const serverIndexDeclaration = `// TypeScript declarations for Hyperscape
// Server entry point (startup script)
export {};

`
    await fs.writeFile(path.join(rootDir, 'build/server-index.d.ts'), serverIndexDeclaration)
    console.log('Declaration files generated ✓')
  } catch (error) {
    console.error('Declaration generation failed!')
    if (!dev) {
      process.exit(1)
    }
  }
}

/**
 * Watch TypeScript files for changes
 */
async function watchTypeScript() {
  if (!dev || !typecheck) return
  
  const { spawn } = await import('child_process')
  const tscWatch = spawn('npx', ['tsc', '--noEmit', '--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
    cwd: rootDir
  })
  
  process.on('exit', () => {
    tscWatch.kill()
  })
}

/**
 * Main Build Process
 */
async function main() {
  console.log(`Building Hyperscape in ${dev ? 'development' : 'production'} mode...`)
 
  if (!dev) {
    await generateDeclarations()
  } else {
    await runTypeCheck()
  }
  
  // Build framework, client and server
  let frameworkCtx, clientCtx, serverCtx
  if (serverOnly) {
    [frameworkCtx, serverCtx] = await Promise.all([
      buildFramework(),
      buildServer()
    ])
  } else {
    [frameworkCtx, clientCtx, serverCtx] = await Promise.all([
      buildFramework(),
      buildClient(),
      buildServer()
    ])
  }
  
  // Start type checking watcher in dev mode
  if (dev) {
    watchTypeScript()
    console.log('Watching for changes...')
  } else {
    console.log('Build completed successfully!')
    process.exit(0)
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  serverProcess?.kill('SIGTERM')
  process.exit(0)
})

process.on('SIGTERM', () => {
  serverProcess?.kill('SIGTERM')
  process.exit(0)
})

// Run the build
main().catch(error => {
  console.error('Build failed:', error)
  process.exit(1)
}) 