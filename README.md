# Hyperscape

**A real-time 3D multiplayer engine for building virtual worlds**

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.180-green)](https://threejs.org/)
[![Documentation](https://img.shields.io/badge/docs-online-success)](https://docs.hyperscape.xyz)

Hyperscape is a powerful game engine built on Three.js that enables developers to create immersive 3D multiplayer experiences with physics, voice chat, VR/AR support, and AI agent integration. Build everything from virtual worlds and metaverse experiences to multiplayer games with a robust Entity Component System and real-time networking.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 22.11.0
- **Bun** >= 1.0.0 (recommended) or npm >= 10.0.0
- Modern browser with WebGL 2.0 support

### Installation

```bash
# Clone the repository
git clone https://github.com/HyperscapeAI/hyperscape.git
cd hyperscape

# Install dependencies
bun install

# Build all packages
bun run build

# Start the development server
bun run dev
```

### Access the Application

- **Client**: http://localhost:3333
- **Server WebSocket**: ws://localhost:5555/ws
- **Documentation**: `bun run docs:dev` → http://localhost:3000

---

## ✨ Features

### 🎮 Core Engine
- **Entity Component System (ECS)** - Flexible, performant architecture for game objects
- **Real-time Multiplayer** - WebSocket-based networking with optimized state synchronization
- **Physics Simulation** - NVIDIA PhysX integration for realistic physics and collisions
- **3D Graphics** - Built on Three.js with post-processing and custom shader support

### 🌐 Networking & Multiplayer
- **Voice Chat** - Integrated LiveKit for spatial voice communication
- **Real-time State Sync** - Efficient binary protocol with msgpackr
- **Authoritative Server** - Server-side validation and anti-cheat
- **Scalable Architecture** - Supports 50-100+ concurrent players

### 🎨 Content & Assets
- **VRM Avatars** - Full support for VRM 1.0 character models
- **Asset System** - Dynamic loading and management of 3D models, textures, and audio
- **Procedural Generation** - Tools for AI-powered content creation
- **Asset Forge** - Built-in asset generation and management tools

### 🤖 AI Integration
- **ElizaOS Plugin** - AI agents can join worlds and interact naturally
- **Agent Actions** - Full API for AI-driven gameplay and interactions
- **LLM Integration** - OpenAI and Anthropic support for intelligent NPCs
- **MeshyAI Support** - 3D model generation from text prompts

### 📱 Cross-Platform
- **Web** - Runs in any modern browser (Chrome, Firefox, Safari)
- **Mobile** - iOS and Android support via Capacitor
- **Desktop** - Electron support for native desktop apps
- **VR/AR** - WebXR support for immersive experiences

### 🛠️ Developer Experience
- **TypeScript First** - Fully typed API with excellent IDE support
- **Hot Module Replacement** - Fast development iteration
- **Comprehensive Testing** - Playwright-based visual testing framework
- **API Documentation** - Auto-generated docs from TypeDoc
- **CLI Tools** - Command-line interface for world management

---

## 📦 Package Structure

This is a monorepo using Turborepo with the following packages:

```
hyperscape/
├── packages/
│   ├── shared/              # Core engine - ECS, systems, networking
│   │   └── @hyperscape/shared (v0.13.0)
│   ├── client/              # Web client - React, Three.js rendering
│   │   └── @hyperscape/client (v0.13.0)
│   ├── server/              # Game server - Fastify, WebSocket, database
│   │   └── @hyperscape/server (v0.13.0)
│   ├── asset-forge/         # Asset generation and management tools
│   ├── plugin-hyperscape/   # ElizaOS integration for AI agents
│   ├── plugin-vercel-ai-gateway/  # AI gateway for LLM routing
│   ├── docs-site/           # Documentation website (Docusaurus)
│   └── physx-js-webidl/     # PhysX WebAssembly bindings
├── scripts/                 # Build and deployment scripts
└── docs/                    # Additional documentation
```

### Package Overview

#### **@hyperscape/shared** (Core Engine)
The heart of Hyperscape - contains all core systems, ECS architecture, and shared logic:

- **Entity Component System** - Flexible game object architecture
- **Network Protocol** - Binary serialization with msgpackr
- **Systems** - Inventory, combat, interaction, movement, and more
- **World Management** - Scene, entity, and state management
- **Physics Integration** - PhysX wrapper and collision handling
- **CLI** - Command-line tools for world creation and management

#### **@hyperscape/client** (Frontend)
Web-based client for rendering and user interaction:

- **3D Rendering** - Three.js scene management and optimization
- **React UI** - Modern component-based interface
- **Input Handling** - Keyboard, mouse, touch, and gamepad support
- **Authentication** - Privy integration for wallet and social login
- **VRM Avatars** - Character model loading and animation
- **Post-Processing** - Bloom, SSAO, and custom effects

#### **@hyperscape/server** (Backend)
Authoritative game server and networking:

- **Fastify Server** - High-performance HTTP and WebSocket
- **Database** - PostgreSQL/SQLite with migrations
- **Authentication** - JWT and Privy validation
- **State Management** - Server-side game state and validation
- **Asset Serving** - CDN integration and static file serving
- **LiveKit Integration** - Voice chat room management

---

## 🎯 Core Concepts

### Entity Component System (ECS)

Hyperscape uses an ECS architecture where:

- **Entities** are unique identifiers (IDs)
- **Components** are data containers attached to entities
- **Systems** process entities with specific component combinations

Example:
```typescript
import { World } from '@hyperscape/shared';

// Create world
const world = new World();

// Create entity with components
const player = world.createEntity({
  position: { x: 0, y: 0, z: 0 },
  health: { current: 100, max: 100 },
  inventory: { slots: 28, items: [] }
});

// Systems automatically process matching entities
world.update(deltaTime);
```

### Real-time Networking

Client-server architecture with authoritative server:

1. **Client sends input** → Server validates and processes
2. **Server updates state** → Broadcasts to connected clients
3. **Clients render** → Interpolate and predict for smooth gameplay

### World Configuration

Worlds are defined in JSON/TypeScript configuration files:

```typescript
export default {
  name: "My World",
  spawn: { x: 0, y: 0, z: 0 },
  entities: [
    {
      type: "tree",
      position: { x: 10, y: 0, z: 10 },
      model: "assets/models/tree.glb"
    }
  ],
  systems: ["MovementSystem", "PhysicsSystem", "RenderSystem"]
}
```

---

## 🛠️ Development

### Available Scripts

#### Root Level Commands

```bash
# Development
bun run dev              # Start all packages in development mode
bun run build            # Build all packages
bun run test             # Run all tests
bun run lint             # Lint all packages

# Documentation
bun run docs:generate    # Generate API docs from TypeScript
bun run docs:dev         # Start documentation dev server
bun run docs:build       # Build static documentation site
bun run docs:serve       # Serve built documentation

# Cleanup
bun run clean            # Clean all build artifacts
```

#### Package-Specific Commands

```bash
# Shared package
cd packages/shared
bun run dev              # Watch mode with auto-rebuild
bun run build            # Build framework
bun run test             # Run unit tests

# Client
cd packages/client
bun run dev              # Vite dev server with HMR
bun run build            # Production build
bun run preview          # Preview production build

# Server
cd packages/server
bun run dev              # Dev server with auto-restart
bun run build            # Build server
bun run start            # Start production server
```

### Development Workflow

1. **Start development servers**:
   ```bash
   bun run dev
   ```
   - Shared: Rebuilds on file changes
   - Client: http://localhost:3333 with HMR
   - Server: ws://localhost:5555/ws with auto-restart

2. **Make changes** to any package - changes automatically trigger rebuilds

3. **Test your changes**:
   ```bash
   bun run test
   ```

4. **Generate documentation**:
   ```bash
   bun run docs:generate
   bun run docs:dev
   ```

### Creating a New World

```bash
# Using the CLI
cd packages/shared
bun run hyperscape create-world my-world

# Or manually create packages/server/world/config.ts
```

---

## 🧪 Testing

Hyperscape uses **real gameplay testing** with Playwright - no mocks, no simulations.

### Testing Philosophy

- ✅ **Visual Testing** - Screenshot analysis and pixel detection
- ✅ **Browser Automation** - Playwright controls real game instances
- ✅ **System Integration** - Test real ECS systems and data
- ✅ **Multiplayer Scenarios** - Test client-server interactions
- ❌ **No Mocks** - Test real code, real systems, real gameplay

### Running Tests

```bash
# Run all tests
bun run test

# Run tests for specific package
cd packages/shared
bun run test

# Run with UI
bun run test --ui

# Generate coverage
bun run test --coverage
```

### Writing Tests

```typescript
import { test, expect } from '@playwright/test';

test('player can move in world', async ({ page }) => {
  // Navigate to game
  await page.goto('http://localhost:3333');
  
  // Wait for world to load
  await page.waitForSelector('.world-loaded');
  
  // Press movement key
  await page.keyboard.press('W');
  
  // Check player position changed
  const position = await page.evaluate(() => {
    return window.world.getPlayerPosition();
  });
  
  expect(position.z).toBeGreaterThan(0);
});
```

---

## 🤖 AI Agent Integration

### ElizaOS Plugin

AI agents can join Hyperscape worlds and interact naturally:

```typescript
import { HyperscapePlugin } from '@hyperscape/plugin-hyperscape';

// Configure Eliza with Hyperscape plugin
const agent = new Agent({
  plugins: [new HyperscapePlugin({
    serverUrl: 'ws://localhost:5555/ws',
    worldId: 'my-world'
  })]
});

// Agent can now:
// - Move around the world
// - Interact with objects
// - Chat with players
// - Use items and equipment
// - Make autonomous decisions
```

### Available Agent Actions

- **Movement**: Navigate to positions, follow entities
- **Interaction**: Click objects, use tools, gather resources
- **Combat**: Attack enemies, use abilities, manage health
- **Inventory**: Pick up items, equip gear, manage storage
- **Social**: Chat with players, emote, voice communication
- **World Queries**: Get nearby entities, check state, read data

---

## 📱 Mobile Development

### iOS

```bash
# Build and open in Xcode
cd packages/client
bun run build
bun run cap:sync:ios
bun run ios

# Development mode (no rebuild)
bun run ios:dev
```

**Requirements**:
- macOS with Xcode 15+
- Apple Developer account ($99/year for App Store)
- Physical device or simulator

### Android

```bash
# Build and open in Android Studio
cd packages/client
bun run build
bun run cap:sync:android
bun run android

# Development mode (no rebuild)
bun run android:dev
```

**Requirements**:
- Android Studio with SDK 24+
- Google Play Developer account ($25 one-time)
- Physical device or emulator

---

## 🌐 Deployment

### Cloudflare (Recommended)

```bash
# Deploy client to Cloudflare Pages
cd packages/client
bun run deploy:prod

# Deploy server to Cloudflare Workers
cd packages/server
bun run deploy:prod
```

### Environment Variables

**Client (.env)**:
```bash
PUBLIC_WS_URL=wss://your-server.com/ws
PUBLIC_CDN_URL=https://your-cdn.com
PUBLIC_PRIVY_APP_ID=your_privy_app_id
```

**Server (.env)**:
```bash
DATABASE_URL=postgresql://user:pass@host/db
PRIVY_APP_SECRET=your_secret
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
```

See [Deployment Guide](#-deployment--configuration-guide) section below for comprehensive setup instructions.

---

## 📖 Documentation

### Online Documentation

- **API Documentation**: https://docs.hyperscape.xyz
- **GitHub Repository**: https://github.com/HyperscapeAI/hyperscape
- **Issues & Support**: https://github.com/HyperscapeAI/hyperscape/issues

### Local Documentation

```bash
# Generate and serve docs locally
bun run docs:generate
bun run docs:dev
# Visit http://localhost:3000
```

### Code Documentation

All TypeScript code is documented with TSDoc comments:

```typescript
/**
 * Creates a new entity in the world
 * @param components - Initial component data
 * @returns The entity ID
 */
createEntity(components: ComponentData): EntityId {
  // ...
}
```

---

## 🏗️ Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 | UI framework |
| **3D Graphics** | Three.js 0.180 | WebGL rendering |
| **Physics** | PhysX (WASM) | Collision detection |
| **Networking** | WebSocket | Real-time communication |
| **Server** | Fastify | HTTP and WebSocket server |
| **Database** | PostgreSQL/SQLite | Persistent storage |
| **Voice** | LiveKit | Spatial voice chat |
| **Auth** | Privy | Wallet & social login |
| **AI** | ElizaOS | AI agent framework |
| **Mobile** | Capacitor | Native iOS/Android |
| **Build** | Turborepo | Monorepo orchestration |
| **Types** | TypeScript 5.9 | Type safety |

### System Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │         │   Browser    │         │   ElizaOS   │
│   Client    │◄───────►│   Client     │◄───────►│   Agent     │
└──────┬──────┘         └──────┬───────┘         └──────┬──────┘
       │                       │                        │
       │              WebSocket (Binary msgpackr)       │
       │                       │                        │
       └───────────────────────┴────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Game Server       │
                    │   (Fastify)         │
                    │   - ECS World       │
                    │   - State Manager   │
                    │   - Physics Sim     │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   PostgreSQL/SQLite │
                    │   - Player Data     │
                    │   - World State     │
                    │   - Persistence     │
                    └─────────────────────┘
```

### Request Flow

1. **Client Input** → User presses key/clicks mouse
2. **Input Event** → Serialized and sent to server via WebSocket
3. **Server Validation** → Checks if action is valid
4. **ECS Processing** → Systems process the action
5. **State Update** → World state is modified
6. **Database Persist** → Changes saved to database
7. **Broadcast** → State delta sent to all clients
8. **Client Render** → Three.js updates scene

---

## 🎨 Asset Pipeline

### 3D Models

Supported formats:
- **GLTF/GLB** - Preferred format (optimized)
- **FBX** - Converted to GLTF
- **OBJ** - Legacy support

### Textures

- **PNG** - Lossless with alpha
- **JPEG** - Lossy for photos
- **WebP** - Modern format (best compression)

### Asset Management

```bash
# Sync assets from git submodule
cd packages/server
bun run assets:sync

# Deploy to CDN (Cloudflare R2)
bun run assets:deploy

# Verify assets
bun run assets:verify
```

### AI-Generated Assets

```bash
# Generate 3D model from text
cd packages/asset-forge
bun run generate-model "medieval sword"

# Generate texture
bun run generate-texture "rusty metal"

# Process and optimize
bun run optimize-assets
```

---

## 🐛 Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# Kill process on port
lsof -ti:3333 | xargs kill -9
lsof -ti:5555 | xargs kill -9
```

**Build Errors**
```bash
# Clean and rebuild
bun run clean
rm -rf node_modules
bun install
bun run build
```

**Database Connection Issues**
```bash
# Check DATABASE_URL in .env
# For local dev, ensure PostgreSQL is running
# Or use SQLite: DATABASE_URL=sqlite://./world/db.sqlite
```

**WebSocket Connection Failed**
- Check PUBLIC_WS_URL in client .env
- Ensure server is running: `bun run dev:server`
- Check firewall/network settings

**Asset Loading Errors**
- Verify PUBLIC_CDN_URL is correct
- Run `bun run assets:verify`
- Check browser console for CORS errors

### Debug Mode

```bash
# Enable debug logging
DEBUG=hyperscape:* bun run dev

# Client-side debugging
localStorage.setItem('debug', 'hyperscape:*')
```

### Performance Issues

- **Low FPS**: Reduce graphics quality in settings
- **High Memory**: Restart server, clear browser cache
- **Network Lag**: Check ping, use wired connection
- **Physics Stutter**: Reduce entity count, optimize colliders

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/hyperscape.git`
3. Create a branch: `git checkout -b feature/my-feature`
4. Make changes and test: `bun run test`
5. Commit: `git commit -m "Add my feature"`
6. Push: `git push origin feature/my-feature`
7. Open a Pull Request

### Code Style

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint with strict rules
- **Formatting**: Prettier with 2-space indentation
- **Types**: No `any`, prefer explicit types
- **Testing**: All features must have tests

### Commit Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: bug fix
docs: documentation changes
test: add/update tests
refactor: code refactoring
perf: performance improvements
```

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0**.

See [LICENSE](LICENSE) file for details.

### Third-Party Licenses

- Three.js - MIT License
- React - MIT License
- PhysX - BSD 3-Clause License
- See individual packages for more details

---

## 🙏 Acknowledgments

- **Three.js** - Amazing 3D library
- **NVIDIA PhysX** - Industry-leading physics engine
- **ElizaOS** - AI agent framework
- **LiveKit** - Real-time voice infrastructure
- **Privy** - Seamless authentication
- **Vercel** - Development infrastructure

---

## 🚀 Deployment & Configuration Guide

This comprehensive guide covers production deployment to Cloudflare, database setup with Neon, authentication with Privy, Farcaster miniapp configuration, and mobile app deployment for iOS and Android.

### Table of Contents
- [1. Cloudflare CI/CD Setup](#1-cloudflare-cicd-setup)
- [2. Neon PostgreSQL Database Setup](#2-neon-postgresql-database-setup)
- [3. Privy Authentication Setup](#3-privy-authentication-setup)
- [4. Farcaster Miniapp Configuration](#4-farcaster-miniapp-configuration)
- [5. iOS App Deployment](#5-ios-app-deployment)
- [6. Android App Deployment](#6-android-app-deployment)
- [7. Additional Configuration](#7-additional-configuration)

---

### 1. Cloudflare CI/CD Setup

#### Overview
Deploy both client (Cloudflare Pages) and server (Cloudflare Workers) to Cloudflare's global network.

#### Prerequisites
- Cloudflare account with Pages and Workers enabled
- GitHub repository connected to Cloudflare
- Wrangler CLI: `npm install -g wrangler`

#### Get API Credentials

```bash
# Login to Cloudflare
wrangler login

# Get Account ID
wrangler whoami
```

#### Generate API Token

1. Visit https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use template: **Edit Cloudflare Workers**
4. Required permissions:
   - Account → Workers Scripts → Edit
   - Account → Pages → Edit
   - Account → R2 → Edit
5. Create and save token securely

#### GitHub Secrets

Add to `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions`:

```bash
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_PROJECT_NAME=hyperscape-client
CLOUDFLARE_SERVER_NAME=hyperscape-server
PRODUCTION_URL=https://hyperscape-client.pages.dev
```

#### Deploy

```bash
# Manual deployment
cd packages/client
bun run deploy:prod

cd packages/server
bun run deploy:prod

# Or use GitHub Actions
# Go to Actions → Deploy to Cloudflare → Run workflow
```

---

### 2. Neon PostgreSQL Database Setup

#### Create Neon Account

1. Visit https://console.neon.tech/signup
2. Create project: `hyperscape-production`
3. Select region closest to users
4. Choose PostgreSQL 16

#### Get Connection String

1. Dashboard → Connection Details
2. Copy **Connection String (pooled)**
3. Format: `postgresql://user:pass@host.pooler.neon.tech/db?sslmode=require`

#### Configure Environment

**Local (.env)**:
```bash
DATABASE_URL=postgresql://user:pass@host.neon.tech/db?sslmode=require
```

**Cloudflare Workers**:
```bash
cd packages/server
wrangler secret put DATABASE_URL
# Paste connection string
```

#### Run Migrations

```bash
cd packages/server
bun run build
bun run start
# Migrations run automatically on startup
```

---

### 3. Privy Authentication Setup

#### Create Privy Account

1. Visit https://dashboard.privy.io/
2. Create app: `Hyperscape`
3. Enable login methods:
   - ✅ Email
   - ✅ Wallet
   - ✅ Farcaster

#### Get Credentials

- **App ID**: Dashboard → Settings → App ID (public)
- **App Secret**: Dashboard → API Secrets → Create (private)

#### Configure Redirect URLs

Settings → Allowed Origins:
```
http://localhost:3333
https://hyperscape-client.pages.dev
https://your-domain.com
```

Settings → Redirect URIs:
```
http://localhost:3333/
https://hyperscape-client.pages.dev/
hyperscape://oauth-callback
```

#### Environment Variables

**Client**:
```bash
PUBLIC_PRIVY_APP_ID=clxxxxxxxxxxxxxx
```

**Server**:
```bash
PRIVY_APP_ID=clxxxxxxxxxxxxxx
PRIVY_APP_SECRET=your_secret
```

---

### 4. Farcaster Miniapp Configuration

#### Register Farcaster App

1. Visit https://warpcast.com/~/developers
2. Create app: `Hyperscape`
3. Request permissions:
   - Read user profile
   - Post casts (optional)

#### Frame Manifest

Create `packages/client/public/frame-manifest.json`:

```json
{
  "name": "Hyperscape",
  "version": "1.0.0",
  "iconUrl": "https://your-domain.com/icon.png",
  "splashImageUrl": "https://your-domain.com/splash.png",
  "homeUrl": "https://your-domain.com",
  "frameUrl": "https://your-domain.com",
  "webhookUrl": "https://api.your-domain.com/webhooks/farcaster"
}
```

#### Environment Variables

```bash
# Client
PUBLIC_ENABLE_FARCASTER=true
PUBLIC_FC_APP_ID=your_fc_app_id

# Server
FC_APP_SECRET=your_fc_secret
FC_SIGNER_UUID=your_signer_uuid
```

---

### 5. iOS App Deployment

#### Prerequisites
- macOS with Xcode 15+
- Apple Developer Account ($99/year)

#### Apple Developer Setup

1. Enroll at https://developer.apple.com/programs/
2. Create App ID: `com.hyperscape.app`
3. Create provisioning profiles (development + distribution)

#### Build

```bash
cd packages/client
bun run build
bun run cap:sync:ios
bun run ios
```

#### TestFlight

1. Xcode → Product → Archive
2. Distribute → App Store Connect
3. Upload build
4. App Store Connect → TestFlight → Add build
5. Invite testers

---

### 6. Android App Deployment

#### Prerequisites
- Android Studio with SDK 24+
- Google Play Developer Account ($25 one-time)

#### Create Signing Key

```bash
cd packages/client/android/app
keytool -genkey -v \
  -keystore hyperscape-release-key.jks \
  -alias hyperscape \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

#### Build Release

```bash
cd packages/client
bun run build
bun run cap:sync:android
cd android
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

#### Upload to Play Console

1. Visit https://play.google.com/console
2. Create app → Upload AAB
3. Complete store listing
4. Submit for review

---

### 7. Additional Configuration

#### Cloudflare R2 (CDN)

```bash
# Create bucket
wrangler r2 bucket create hyperscape-assets

# Enable public access
# Dashboard → R2 → Settings → Public Access

# Upload assets
cd packages/server
bun run assets:deploy
```

#### Custom Domains

**Client (Pages)**:
- Dashboard → Pages → Custom domains
- Add: `play.yourgame.com`

**Server (Workers)**:
- Dashboard → Workers → Domains
- Add: `api.yourgame.com`

#### Complete Environment Variables

See [Environment Variables](#environment-variables) section above for all required variables.

---

## 📞 Support

- **Documentation**: https://docs.hyperscape.xyz
- **GitHub Issues**: https://github.com/HyperscapeAI/hyperscape/issues
- **Discussions**: https://github.com/HyperscapeAI/hyperscape/discussions

---

**Built with ❤️ by the Hyperscape team**

*Create immersive 3D experiences. Build virtual worlds. Push the boundaries of what's possible in the browser.*
