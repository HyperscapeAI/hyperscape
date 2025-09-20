import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Game engine testing configuration
    globals: true,
    environment: 'jsdom',
    setupFiles: [resolve(__dirname, './src/__tests__/setup.ts')],
    
    // Include patterns - exclude Playwright tests
    include: ['src/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'src/tests/**', // Exclude playwright tests in src/tests
      '**/tests/**',
      'packages/hyperscape/src/tests/**',
      '**/*.spec.{js,ts,mjs}', // Exclude .spec files (Playwright convention)
      'rpg-world/**/*.spec.js', // Explicitly exclude Playwright specs
      'rpg-world/test-geometric-validation.spec.js', // Specific exclusion
      'rpg-world/test-dynamic-items-real.spec.js', // Specific exclusion  
      'rpg-world/test-weapon-grip-system.spec.js', // Specific exclusion
      'e2e/**',
      'tests/e2e/**',
      '**/__tests__/**/*.spec.{js,ts,mjs}',
      './src/tests/*.spec.ts'
    ],
    
    // Performance optimizations for physics/rendering tests
    // Use forks instead of threads to avoid Three.js multiple instance warnings
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
      }
    },
    
    // Timeout for complex simulations
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'src/**/*.{test,spec}.{js,ts}',
        'src/__tests__/**',
        'src/types/**',
        'scripts/**',
        'build/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      }
    },
    
    // Custom reporters for game metrics
    reporters: ['default', resolve(__dirname, './src/__tests__/reporters/game-metrics-reporter.ts')],
    
    // WebGL/Canvas mocking
    deps: {
      optimizer: {
        web: {
          include: ['three', '@pixiv/three-vrm'],
        },
      },
    },
    
    // Benchmarking for performance tests
    benchmark: {
      include: ['**/*.bench.{js,ts}'],
      reporters: ['default'],
    }
  },
  
  resolve: {
    alias: {
      '@core': resolve(__dirname, './src/core'),
      '@client': resolve(__dirname, './src/client'),
      '@server': resolve(__dirname, './src/server'),
      '@world': resolve(__dirname, './src/world'),
      '@types': resolve(__dirname, './src/types'),
      '@test': resolve(__dirname, './src/__tests__'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
  },
  
  // ESBuild options for faster test compilation
  esbuild: {
    target: 'es2022',
    format: 'esm',
  },
  
  // Define globals for game engine
  define: {
    'import.meta.vitest': 'undefined',
    '__PHYSICS_WASM_URL__': JSON.stringify('/src/core/physx-js-webidl.wasm'),
    '__ASSETS_URL__': JSON.stringify('https://assets.hyperscape.io/'),
  }
}); 