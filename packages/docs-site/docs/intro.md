# Introduction

Welcome to the **Hyperscape** API documentation!

Hyperscape is a powerful real-time 3D multiplayer engine for building virtual worlds and immersive experiences. Built on Three.js with React, it provides a complete Entity Component System, physics simulation, voice chat, and AI agent integration.

## What is Hyperscape?

Hyperscape enables developers to create:
- **Virtual Worlds** - Immersive 3D environments with multiplayer support
- **Games** - RPGs, adventures, social experiences, and more
- **Metaverse Experiences** - Interactive spaces with voice, avatars, and AI
- **Simulations** - Training environments, visualizations, and demos

## Documentation Structure

This documentation is automatically generated from TypeScript source code using TypeDoc and includes:

### **[@hyperscape/shared](./api/@hyperscape/shared.md)** - Core Engine
The heart of Hyperscape containing:
- **Entity Component System (ECS)** - Game object architecture
- **Network Protocol** - Binary serialization and state sync
- **Core Systems** - Movement, physics, inventory, combat, and more
- **World Management** - Scene, entity, and state handling
- **CLI Tools** - Command-line utilities for development

### **[@hyperscape/client](./api/@hyperscape/client.md)** - Frontend
Web-based client for rendering and interaction:
- **3D Rendering** - Three.js scene management
- **React UI** - Component-based interface
- **Input Handling** - Keyboard, mouse, touch, gamepad
- **Authentication** - Privy wallet and social login
- **VRM Avatars** - Character models and animation

### **[@hyperscape/server](./api/@hyperscape/server.md)** - Backend
Authoritative game server:
- **Fastify Server** - HTTP and WebSocket endpoints
- **Database** - PostgreSQL/SQLite with migrations
- **State Management** - Server-side validation
- **Authentication** - JWT and session management
- **LiveKit Integration** - Voice chat rooms

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **3D Graphics** | Three.js 0.180 | WebGL rendering |
| **UI Framework** | React 18 | Component-based UI |
| **Physics** | PhysX (WASM) | Collision detection |
| **Networking** | WebSocket + msgpackr | Real-time binary protocol |
| **Server** | Fastify | High-performance HTTP/WS |
| **Database** | PostgreSQL/SQLite | Persistent storage |
| **Voice** | LiveKit | Spatial voice chat |
| **Auth** | Privy | Wallet & social login |
| **AI Agents** | ElizaOS | AI integration framework |
| **Mobile** | Capacitor | iOS/Android support |
| **Language** | TypeScript 5.9 | Type-safe development |

## Key Features

✨ **Entity Component System** - Flexible, performant game architecture  
🌐 **Real-time Multiplayer** - WebSocket with optimized state sync  
🎮 **Physics Simulation** - NVIDIA PhysX for realistic interactions  
🎨 **VRM Avatar Support** - Full character model integration  
🗣️ **Voice Chat** - Spatial audio with LiveKit  
🤖 **AI Agent Integration** - ElizaOS plugin for autonomous NPCs  
📱 **Cross-Platform** - Web, iOS, Android, Desktop  
🔧 **TypeScript First** - Fully typed with excellent IDE support  

## Getting Started

### Quick Start

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Start development server
bun run dev
```

Visit http://localhost:3333 to see the client.

### Explore the API

Browse the API documentation for each package using the sidebar navigation:

Each package includes detailed documentation for:
- **Classes** - Core objects and their methods
- **Interfaces** - Type definitions and contracts
- **Functions** - Utility and helper functions
- **Types** - Type aliases and definitions
- **Enums** - Enumerated constants

### Documentation Features

- 🔍 **Search** - Full-text search across all APIs
- 📖 **Examples** - Code examples in TSDoc comments
- 🔗 **Cross-References** - Links between related types
- 🏷️ **Type Information** - Complete type signatures
- 📝 **Comments** - Inline documentation from source

## Development Resources

- **Main Repository**: https://github.com/HyperscapeAI/hyperscape
- **Issues & Support**: https://github.com/HyperscapeAI/hyperscape/issues
- **README**: Complete guide available in the repository
- **Contributing**: Contribution guidelines available in the repository

## Auto-Generated Documentation

This documentation is automatically generated from TypeScript source code using TypeDoc. 

The generation process:
1. **TSDoc Comments** - Developers write documentation in code
2. **TypeDoc** - Extracts types and comments
3. **Markdown** - Generates markdown files
4. **Docusaurus** - Renders beautiful documentation site

To regenerate documentation:
```bash
bun run docs:generate
bun run docs:dev
```

---

**Ready to build?** Start exploring the API documentation using the sidebar! 🚀

