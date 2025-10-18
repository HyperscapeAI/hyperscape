# Hyperscape Monorepo - Package Documentation

**Last Updated**: 2025-10-16
**Maintainer**: Hyperscape AI Team

## Overview

Hyperscape is an AI-powered 3D multiplayer game engine with RPG elements, built as a TypeScript monorepo using Bun workspaces. The project consists of 8 packages organized into client/server architecture with specialized tooling for asset generation, physics, documentation, and AI agent integration.

---

## Package Index

1. **[@hyperscape/shared](#hyperscapeshared)** - Core 3D multiplayer game engine
2. **[@hyperscape/client](#hyperscapeclient)** - Browser client application
3. **[@hyperscape/server](#hyperscapeserver)** - Multiplayer game server
4. **[@elizaos/plugin-hyperscape](#elizaosplugin-hyperscape)** - AI agent integration plugin
5. **[@elizaos/plugin-vercel-ai-gateway](#elizaosplugin-vercel-ai-gateway)** - Vercel AI Gateway integration
6. **[asset-forge](#asset-forge)** - AI-powered 3D asset generation system
7. **[@hyperscape/physx-js-webidl](#hyperscapephysx-js-webidl)** - Physics engine bindings
8. **[@hyperscape/docs](#hyperscapedocs)** - Documentation site

---

## Package Details

### @hyperscape/shared

**Purpose**: Core 3D multiplayer game engine library shared between client and server.

**Location**: `packages/shared/`

**Main Exports**:
- `createClientWorld()` - Creates browser client world
- `createServerWorld()` - Creates Node.js server world
- `createViewerWorld()` - Creates lightweight viewer world
- `createNodeClientWorld()` - Creates headless Node.js client
- `World` - Central game world container and ECS coordinator
- `System` - Base class for all game systems
- `Entity`, `PlayerLocal`, `PlayerRemote` - Entity classes

**Key Features**:
- **Entity Component System (ECS)** architecture for game objects
- **Three.js integration** for 3D graphics rendering
- **PhysX physics** via WASM (client) and Node.js bindings (server)
- **Authoritative server** architecture with client prediction
- **Real-time voice chat** via LiveKit integration
- **VRM avatar support** with @pixiv/three-vrm
- **WebSocket networking** with msgpackr binary protocol
- **React UI system** with styled-components and Yoga layout
- **Privy authentication** for wallet/social login

**Tech Stack**:
- Three.js ^0.180.0 - 3D graphics
- PhysX - Physics simulation
- React 18 - UI rendering
- Fastify - HTTP server
- Better-sqlite3 - Local persistence
- Knex + SQLite3 - Database ORM
- msgpackr - Binary serialization

**Build System**:
- Custom esbuild-based build via `scripts/build.mjs`
- Dual output: server bundle and client bundle
- TypeScript with type declarations

**Used By**:
- @hyperscape/client
- @hyperscape/server
- @elizaos/plugin-hyperscape

**Entry Points**:
- Main: `build/framework.js` (server + client)
- Client-only: `build/framework.client.js`
- Types: `build/framework.d.ts`
- CLI: `build/cli.js` (hyperscape command)

**Scripts**:
```bash
bun run dev          # Development build with watch mode
bun run build        # Production build
bun run test         # Run vitest tests
bun run test:e2e     # Run Playwright E2E tests
```

---

### @hyperscape/client

**Purpose**: Browser-based 3D game client application.

**Location**: `packages/client/`

**Main Functionality**:
- Renders 3D game world using Three.js and @hyperscape/shared
- Handles player input (keyboard, mouse, touch)
- WebSocket connection to game server
- Privy authentication (wallet or social login)
- Character selection screen
- React UI overlay (inventory, chat, settings)
- Farcaster Frame v2 support for social media embeds
- iOS/Android mobile app via Capacitor

**Key Features**:
- **Authentication Flow**:
  - Privy crypto wallet or email/social login
  - Character selection with pre-world WebSocket
  - Player token persistence
- **3D Rendering**:
  - Three.js scene rendering
  - VRM avatar support
  - Post-processing effects (postprocessing package)
- **Mobile Support**:
  - Capacitor for iOS/Android
  - Touch controls
  - Native app compilation

**Tech Stack**:
- Vite - Build tool and dev server
- React 18 - UI framework
- @hyperscape/shared - Game engine
- @privy-io/react-auth - Authentication
- Three.js - 3D graphics
- styled-components - UI styling
- Capacitor - Mobile app wrapper

**Environment Variables**:
```
PUBLIC_PRIVY_APP_ID       # Privy authentication
PUBLIC_WS_URL            # WebSocket server (default: ws://localhost:5555/ws)
PUBLIC_CDN_URL           # Asset CDN URL
PUBLIC_ENABLE_FARCASTER  # Enable Farcaster frames
PUBLIC_APP_URL           # Public app URL
PUBLIC_API_URL           # API server URL
```

**Build Output**: `dist/` directory with static HTML/JS/CSS

**Scripts**:
```bash
bun run dev              # Vite dev server (port 3333)
bun run build            # Production build
bun run preview          # Preview production build
bun run ios              # Build and open iOS app
bun run android          # Build and open Android app
bun run deploy           # Deploy to Cloudflare Pages
```

**Used By**: End users (browser), iOS app, Android app

---

### @hyperscape/server

**Purpose**: Authoritative multiplayer game server with database and WebSocket networking.

**Location**: `packages/server/`

**Main Functionality**:
- Authoritative game simulation using @hyperscape/shared
- WebSocket server for real-time multiplayer
- HTTP API endpoints for game state queries
- PostgreSQL database with Drizzle ORM
- Static asset serving (models, textures, audio)
- Privy authentication validation
- World persistence and auto-save
- Docker-based PostgreSQL management

**Architecture**:
```
Client (Browser) ←→ Fastify HTTP Server ←→ Hyperscape World (ECS)
                         ↓                        ↓
                   WebSocket Handler        Game Systems
                         ↓                   (Combat, Inventory, etc.)
                   ServerNetwork                 ↓
                         ↓              PostgreSQL + Drizzle ORM
                   DatabaseSystem
```

**Initialization Sequence**:
1. Load Node.js polyfills for Three.js compatibility
2. Start PostgreSQL via Docker (if `USE_LOCAL_POSTGRES=true`)
3. Initialize database with Drizzle ORM + run migrations
4. Create Hyperscape World (ECS container)
5. Register server systems (DatabaseSystem, ServerNetwork)
6. Load world entities from world.json
7. Start Fastify HTTP server
8. Begin accepting WebSocket connections

**Key Features**:
- **Hot Reload**: SIGUSR2 signal triggers graceful restart in dev
- **Graceful Shutdown**: Cleans up database, WebSockets, Docker
- **Static Assets**: Serves game assets with proper MIME types
- **WebSocket Multiplayer**: Real-time player synchronization
- **Privy Auth**: Optional wallet/social authentication
- **CDN Support**: Configurable asset CDN (R2, S3, local)
- **CORS**: Permissive CORS for development
- **Error Reporting**: Frontend error logging endpoint

**Environment Variables**:
```
NODE_ENV              # 'development' or 'production'
PORT                  # Server port (default: 5555)
DATABASE_URL          # PostgreSQL connection string
USE_LOCAL_POSTGRES    # Auto-start PostgreSQL via Docker (default: true in dev)
PUBLIC_CDN_URL        # Asset CDN base URL
PRIVY_APP_ID          # Privy app ID
PRIVY_APP_SECRET      # Privy secret
ADMIN_CODE            # Server admin password
JWT_SECRET            # JWT signing secret
SAVE_INTERVAL         # Auto-save interval in seconds (default: 60)
WORLD                 # World directory path (default: 'world')
```

**Tech Stack**:
- Fastify - HTTP server
- @hyperscape/shared - Game engine
- @fastify/websocket - WebSocket support
- @fastify/static - Static file serving
- @privy-io/server-auth - Authentication
- PostgreSQL + pg - Database
- source-map-support - Error stack traces

**Build Output**: `dist/index.js` (single server bundle)

**Scripts**:
```bash
bun run dev              # Development server with hot reload
bun run build            # Production build
bun run start            # Run production server
bun run cdn:up           # Start local CDN (Docker)
bun run assets:sync      # Sync assets from git
bun run deploy           # Deploy to Cloudflare Workers
```

**Used By**: Clients connect via WebSocket, AI agents via plugin-hyperscape

---

### @elizaos/plugin-hyperscape

**Purpose**: Connect ElizaOS AI agents to Hyperscape 3D worlds.

**Location**: `packages/plugin-hyperscape/`

**Main Functionality**:
- Enables autonomous AI agents to join virtual worlds
- Navigate environments and interact with objects
- Chat with users and other agents
- Perform actions like human players
- Visual testing framework for RPG features

**Key Components**:

**Actions** (what agents can do):
- `perception` - Scan environment and identify entities
- `goto` - Navigate to specific entities/locations
- `use` - Use/activate items or objects
- `unuse` - Stop using an item
- `stop` - Stop current movement
- `walk_randomly` - Wander around randomly
- `ambient` - Perform ambient behaviors (idle, emotes)
- `build` - Place and modify world entities (builder role)
- `reply` - Respond to chat messages
- `ignore` - Ignore messages/users

**Providers** (context for decision-making):
- `world` - World state, entities, environment info
- `emote` - Available emotes and gestures
- `actions` - Available agent actions
- `character` - Agent character state (health, inventory)
- `banking` - Bank inventory access
- `skills` - RPG skills (woodcutting, fishing, etc.)

**Service**:
- `HyperscapeService` - Manages world connection, state sync, action execution

**Events**:
- Listens for world events (chat, entity spawns, etc.)
- Routes events to agent decision-making system

**Testing Framework**:
- Real Hyperscape instances with Playwright
- Three.js scene hierarchy testing
- Visual testing with colored cube proxies
- Screenshot analysis
- Multimodal verification (data + visual)

**Visual Testing Proxies**:
- 🔴 Red cubes = Players
- 🟢 Green cubes = Goblins
- 🔵 Blue cubes = Items
- 🟡 Yellow cubes = Trees
- 🟣 Purple cubes = Banks
- 🟨 Yellow-green = Stores

**Tech Stack**:
- @elizaos/core - AI agent framework
- @hyperscape/shared - Game engine
- Playwright - Browser automation
- Three.js - 3D scene access
- Zustand - State management
- WebSocket - Server connection

**Configuration**:
```typescript
DEFAULT_HYPERSCAPE_WS_URL: "ws://localhost:5555/ws"
```

**Scripts**:
```bash
bun run build            # Build plugin
bun run dev              # Development with watch mode
bun run test             # Unit tests (Vitest)
bun run test:visual      # Visual RPG tests (Playwright)
bun run test:agents      # Multi-agent tests
bun run agents:start     # Start agent instance
```

**Used By**: ElizaOS agent configurations, character definitions

---

### @elizaos/plugin-vercel-ai-gateway

**Purpose**: Route AI requests through Vercel's AI Gateway for ElizaOS.

**Location**: `packages/plugin-vercel-ai-gateway/`

**Main Functionality**:
- Integrates Vercel AI Gateway with ElizaOS
- Routes OpenAI API calls through Vercel's infrastructure
- Token usage tracking and management
- Cost optimization and caching

**Key Features**:
- OpenAI API integration via `@ai-sdk/openai`
- Vercel AI SDK (`ai` package)
- Token counting with `js-tiktoken`
- Type-safe with TypeScript

**Tech Stack**:
- @ai-sdk/openai ^2.0.32
- @elizaos/core ^1.6.1
- ai ^5.0.47
- js-tiktoken ^1.0.21

**Scripts**:
```bash
bun run build         # Build plugin via build.ts
bun run dev           # Development with watch mode
bun run type-check    # TypeScript type checking
```

**Used By**: ElizaOS agents that need AI Gateway routing

---

### asset-forge

**Purpose**: AI-powered 3D asset generation system for Hyperscape RPG.

**Location**: `packages/asset-forge/`

**Main Functionality**:
- Generate 3D models from text descriptions
- AI-powered rigging and fitting systems
- Armor fitting to character models
- Weapon rigging with hand pose detection
- Sprite generation from 3D models
- Asset library management
- Batch generation workflows

**Key Features**:

**AI-Powered Generation**:
- GPT-4 + Meshy.ai for 3D model generation
- DALL-E for concept art
- Support for weapons, armor, characters, items
- Material variants (bronze, steel, mithril, etc.)
- Batch generation capabilities

**3D Asset Management**:
- Interactive Three.js viewer
- Asset library with categorization
- Metadata management
- GLB/GLTF format support

**Advanced Rigging & Fitting**:
- Armor fitting system (auto-fit to characters)
- Hand rigging with AI pose detection
- Weight transfer and mesh deformation
- Bone mapping and skeleton alignment

**Processing Tools**:
- Sprite generation from 3D models
- Vertex color extraction
- T-pose extraction from animated models
- Asset normalization and optimization

**Tech Stack**:
- React 18 + TypeScript
- Three.js + React Three Fiber + Drei
- Zustand + Immer for state
- OpenAI API + Meshy.ai API
- TensorFlow.js + MediaPipe (hand detection)
- Express.js backend
- Tailwind CSS
- Vite build tool

**Environment Variables**:
```
VITE_OPENAI_API_KEY   # OpenAI API key
VITE_MESHY_API_KEY    # Meshy.ai API key
```

**Architecture**:
```
asset-forge/
├── src/                    # React application
│   ├── components/         # UI components
│   ├── services/          # AI, fitting, rigging services
│   ├── pages/             # Application pages
│   ├── hooks/             # Custom React hooks
│   └── store/             # Zustand state management
├── server/                # Express.js backend
│   ├── api.mjs           # API endpoints
│   └── services/         # Backend services
└── gdd-assets/           # Generated 3D assets
```

**Scripts**:
```bash
bun run dev                    # Start frontend + backend
bun run dev:frontend           # Frontend only
bun run dev:backend            # Backend only
bun run build                  # Production build
bun run assets:audit           # Audit asset quality
bun run assets:normalize       # Normalize asset formats
bun run assets:extract-tpose   # Extract T-pose from animations
```

**Used By**:
- Game designers creating RPG assets
- Developers generating game content
- @hyperscape/server for asset deployment

---

### @hyperscape/physx-js-webidl

**Purpose**: Node.js and browser-compatible WASM bindings for NVIDIA PhysX 5.6.0.

**Location**: `packages/physx-js-webidl/`

**Main Functionality**:
- Provides JavaScript/WASM bindings for PhysX physics engine
- Enables physics simulation in both browser and Node.js
- Pre-compiled WASM module for fast loading
- Full PhysX API access via WebIDL bindings

**Key Features**:
- PhysX 5.6.0 support
- WASM compilation for browser
- Node.js native bindings
- Pre-built binaries (no compilation needed in most cases)
- Docker-based build system

**Build Process**:
- Checks for existing pre-built files
- Falls back to compiling from source if needed
- Docker container for reproducible builds
- Output: `physx-js-webidl.js`, `physx-js-webidl.wasm`, `physx-js-webidl.d.ts`

**Tech Stack**:
- NVIDIA PhysX 5.6.0 (C++)
- Emscripten (C++ to WASM compiler)
- WebIDL bindings generator
- Docker for build environment

**Exports**:
```json
{
  ".": "./dist/physx-js-webidl.js",
  "./dist/*": "./dist/*"
}
```

**Scripts**:
```bash
bun run build           # Build (uses pre-built if available)
bun run build:force     # Force rebuild from source
bun run build:debug     # Debug build
bun run build:docker    # Build in Docker container
bun run clean           # Clean build artifacts
```

**Used By**:
- @hyperscape/shared (both client and server)
- Provides physics simulation for all Hyperscape worlds

**Output Files**:
- `dist/physx-js-webidl.js` - JavaScript bindings
- `dist/physx-js-webidl.wasm` - WebAssembly module
- `dist/physx-js-webidl.d.ts` - TypeScript declarations

---

### @hyperscape/docs

**Purpose**: Documentation website for Hyperscape using Docusaurus.

**Location**: `packages/docs-site/`

**Main Functionality**:
- Hosts comprehensive Hyperscape documentation
- API documentation generated from TypeDoc
- User guides and tutorials
- Component reference
- Architecture documentation

**Tech Stack**:
- Docusaurus 3.9.1 - Documentation framework
- React 18 - UI framework
- MDX - Markdown with React components
- Prism - Syntax highlighting

**Architecture**:
```
docs-site/
├── docs/              # Documentation markdown files
│   └── api/          # Auto-generated API docs (from TypeDoc)
├── src/              # Custom React components
└── docusaurus.config.js  # Site configuration
```

**Build Process**:
1. Root-level TypeDoc runs and generates `docs/api/` markdown
2. Docusaurus builds static site from markdown + MDX
3. Output to `build/` directory

**Scripts**:
```bash
bun run start            # Development server
bun run build            # Production build
bun run serve            # Serve production build
bun run clear            # Clear cache
```

**Used By**:
- Developers learning Hyperscape API
- Users reading documentation
- CI/CD for documentation deployment

**Root-Level Documentation Scripts**:
```bash
bun run docs:generate    # Generate API docs with TypeDoc
bun run docs:dev         # Run dev server
bun run docs:build       # Build docs site
bun run docs:clean       # Clean API docs
```

---

## Package Dependencies Graph

```
Root Monorepo (@hyperscape/hyperscape)
├── @hyperscape/shared (core engine)
│   └── @hyperscape/physx-js-webidl
│
├── @hyperscape/client (browser client)
│   ├── @hyperscape/shared
│   └── @hyperscape/physx-js-webidl
│
├── @hyperscape/server (game server)
│   └── @hyperscape/shared
│
├── @elizaos/plugin-hyperscape (AI agents)
│   └── @hyperscape/shared
│
├── @elizaos/plugin-vercel-ai-gateway (AI gateway)
│   └── @elizaos/core
│
├── asset-forge (asset generation)
│   └── (independent - generates assets used by server)
│
├── @hyperscape/physx-js-webidl (physics)
│   └── (independent - used by shared)
│
└── @hyperscape/docs (documentation)
    └── (independent - documents all packages)
```

## Workspace Scripts

From root `package.json`:

```bash
# Build
bun run build              # Build all packages
bun run build:shared       # Build shared only
bun run build:client       # Build client only
bun run build:server       # Build server only

# Development
bun run dev                # Run all in dev mode (Turbo)
bun run dev:shared         # Dev mode for shared
bun run dev:client         # Dev mode for client
bun run dev:server         # Dev mode for server
bun run dev:reset          # Clean rebuild + dev

# Testing
bun run test               # Run all tests (Turbo)

# Mobile
bun run ios                # iOS app
bun run android            # Android app
bun run cap:sync           # Sync Capacitor

# Documentation
bun run docs:generate      # Generate API docs (TypeDoc)
bun run docs:dev           # Docs dev server
bun run docs:build         # Build docs site

# CDN
bun run cdn:up             # Start local CDN (Docker)
bun run cdn:down           # Stop local CDN

# Cleanup
bun run clean              # Clean all build artifacts
```

## Technology Stack Summary

**Core Technologies**:
- **Language**: TypeScript 5.9.2
- **Runtime**: Bun 1.0.0 (Node.js 22.11.0+)
- **Package Manager**: Bun workspaces
- **Build Tools**: Vite, esbuild, Turbo (monorepo)

**3D Graphics**:
- Three.js 0.180.0 - 3D rendering
- @pixiv/three-vrm - VRM avatar support
- postprocessing - Post-processing effects
- three-mesh-bvh - BVH acceleration

**Physics**:
- NVIDIA PhysX 5.6.0 (via @hyperscape/physx-js-webidl)

**Frontend**:
- React 18 - UI framework
- styled-components - CSS-in-JS
- Vite - Build tool and dev server
- yoga-layout - UI layout engine

**Backend**:
- Fastify 5 - HTTP server
- PostgreSQL + pg - Database
- better-sqlite3 - Local SQLite
- @fastify/websocket - WebSocket support
- msgpackr - Binary serialization

**AI & ML**:
- @elizaos/core - AI agent framework
- OpenAI API (GPT-4, DALL-E)
- Meshy.ai API - 3D generation
- TensorFlow.js - ML inference
- MediaPipe - Hand pose detection

**Authentication**:
- @privy-io/react-auth - Client auth
- @privy-io/server-auth - Server auth
- jsonwebtoken - JWT tokens

**Testing**:
- Vitest - Unit testing
- Playwright - E2E testing
- @vitest/ui - Test UI
- @vitest/coverage-v8 - Coverage

**Mobile**:
- Capacitor 7 - Native wrapper
- @capacitor/ios - iOS support
- @capacitor/android - Android support

**Documentation**:
- Docusaurus 3.9.1 - Docs site
- TypeDoc 0.28.14 - API docs generation
- typedoc-plugin-markdown - Markdown output

**DevOps**:
- Docker - Local PostgreSQL, CDN
- Turbo - Monorepo task runner
- ESLint - Linting
- Prettier - Code formatting

## Architecture Patterns

**Entity Component System (ECS)**:
- `World` - Central container
- `Entity` - Game objects
- `System` - Game logic
- `Component` - Data on entities

**Client-Server Architecture**:
- Server is authoritative
- Client prediction for responsiveness
- WebSocket for real-time sync
- Binary protocol (msgpackr)

**Plugin Architecture (ElizaOS)**:
- Services - Long-lived state
- Actions - Discrete tasks
- Providers - Context injection
- Events - World event handlers

**Testing Philosophy**:
- Real tests, no mocks
- Visual verification with Playwright
- Three.js scene introspection
- Colored cube proxies for visual debugging

## Development Workflow

**Starting Development**:
```bash
# 1. Install dependencies
bun install

# 2. Build shared package first
bun run build:shared

# 3. Start development
bun run dev  # Runs all packages in dev mode
```

**Development Mode**:
- Turbo runs all package dev scripts concurrently
- Shared has watch mode for rebuilds
- Client has Vite HMR
- Server has hot reload (SIGUSR2)

**Testing Workflow**:
```bash
# Unit tests
bun run test

# E2E tests (shared)
cd packages/shared && bun run test:e2e

# Visual RPG tests (plugin-hyperscape)
cd packages/plugin-hyperscape && bun run test:visual

# Multi-agent tests
cd packages/plugin-hyperscape && bun run test:agents
```

**Build for Production**:
```bash
# Build all
bun run build

# Or build individually
bun run build:shared
bun run build:client
bun run build:server
```

**Deployment**:
```bash
# Client to Cloudflare Pages
cd packages/client && bun run deploy

# Server to Cloudflare Workers
cd packages/server && bun run deploy

# Documentation
bun run docs:build
```

## Key Files and Locations

**Configuration**:
- `package.json` - Root workspace config
- `turbo.json` - Turbo monorepo config
- `tsconfig.json` - TypeScript config
- `.env` - Environment variables
- `eslint.config.js` - ESLint rules

**Documentation**:
- `README.md` - Main project README
- `CLAUDE.md` - Cursor rules and development guidelines
- `LORE.md` - Game world and lore
- `packages/*/README.md` - Package-specific docs
- `packages/docs-site/` - Full documentation site

**Testing**:
- `packages/shared/__tests__/` - Shared tests
- `packages/plugin-hyperscape/__tests__/` - Plugin tests
- `test-results/` - Playwright output
- `logs/` - Test error logs

**Build Artifacts**:
- `packages/shared/build/` - Shared build output
- `packages/client/dist/` - Client build output
- `packages/server/dist/` - Server build output
- `packages/asset-forge/dist/` - Asset forge build
- `packages/docs-site/build/` - Docs build output

## Common Issues and Solutions

**Build Issues**:
- Always build `@hyperscape/shared` first
- Clean and rebuild: `bun run clean && bun run build`
- Check TypeScript errors: `turbo run lint`

**Physics Issues**:
- PhysX WASM may need rebuilding: `cd packages/physx-js-webidl && bun run build:force`
- Pre-built files should work in most cases

**Database Issues**:
- PostgreSQL: `cd packages/server && bun run cdn:up`
- Reset database: Delete `packages/server/world/` and restart

**Asset Issues**:
- Sync from git: `cd packages/server && bun run assets:sync`
- CDN: `bun run cdn:up` for local asset server

**Port Conflicts**:
- Client: 3333 (Vite)
- Server: 5555 (Fastify)
- CDN: 8080 (Nginx)
- Docs: 3000 (Docusaurus)

---

## Summary

This monorepo provides a complete AI-powered 3D multiplayer game platform with:

1. **Core Engine** (@hyperscape/shared) - Full-featured 3D engine with ECS, physics, networking
2. **Client** (@hyperscape/client) - Browser/mobile client with React UI
3. **Server** (@hyperscape/server) - Authoritative multiplayer server
4. **AI Agents** (plugin-hyperscape) - ElizaOS integration for autonomous agents
5. **Asset Generation** (asset-forge) - AI-powered 3D content creation
6. **Physics** (physx-js-webidl) - NVIDIA PhysX for realistic physics
7. **Documentation** (docs-site) - Comprehensive docs and API reference
8. **AI Gateway** (plugin-vercel-ai-gateway) - Vercel AI routing

All packages are TypeScript-based, use Bun for runtime/package management, and follow strict typing and testing standards as defined in CLAUDE.md.
