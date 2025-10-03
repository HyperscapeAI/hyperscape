import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Define which env variables are exposed to client
  envPrefix: 'PUBLIC_', // Only expose env vars starting with PUBLIC_
  
  root: path.resolve(__dirname, 'src/client'),
  publicDir: 'public',
  
  build: {
    outDir: path.resolve(__dirname, 'build/public'),
    emptyOutDir: true,
    target: 'esnext', // Support top-level await
    minify: false, // Disable minification for debugging
    sourcemap: true, // Enable source maps for better debugging
    rollupOptions: {
      input: path.resolve(__dirname, 'src/client/index.html')
    }
  },
  
  esbuild: {
    target: 'esnext' // Support top-level await
  },
  
  define: {
    'process.env': '{}', // Replace process.env with empty object
    'process': 'undefined' // Replace process with undefined
  },
  server: {
    port: Number(process.env.VITE_PORT) || 3333,
    open: false,
    host: true,
    // Silence noisy missing source map warnings for vendored libs
    sourcemapIgnoreList(relativeSourcePath, _sourcemapPath) {
      return /src\/libs\/(stats-gl|three-custom-shader-material)\//.test(relativeSourcePath)
    },
    proxy: {
      // Forward asset requests to Fastify server so asset:// resolves during Vite dev
      '/world-assets': {
        target: process.env.SERVER_ORIGIN || 'http://localhost:4444',
        changeOrigin: true,
      },
      // Expose server-provided public envs in dev
      '/env.js': {
        target: process.env.SERVER_ORIGIN || 'http://localhost:4444',
        changeOrigin: true,
      },
      // Optional: forward WS to server if needed
      '/ws': {
        target: process.env.SERVER_ORIGIN?.replace('http', 'ws') || 'ws://localhost:4444',
        ws: true,
        changeOrigin: true,
      },
    }
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@client': path.resolve('./src/client'),
      '@core': path.resolve('./src/core'),
      '@types': path.resolve('./src/types'),
    },
    dedupe: ['three']
  },
  
  optimizeDeps: {
    include: ['three', 'react', 'react-dom'],
    exclude: ['@playwright/test'], // Exclude Playwright from optimization
    esbuildOptions: {
      target: 'esnext' // Support top-level await
    }
  },
}) 