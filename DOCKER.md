# Docker Development Guide

Complete guide for developing Hyperscape using Docker. This is the **recommended development setup** for team collaboration and easy onboarding.

## 🎯 Why Docker?

- **Zero local dependencies** - No need to install Node, Bun, PostgreSQL, or other tools
- **Consistent environments** - Everyone runs the exact same setup
- **Isolated & clean** - No conflicts with other projects
- **Hot-reload enabled** - Changes reflect instantly during development
- **Easy cleanup** - Remove everything with one command
- **Production parity** - Development mirrors production closely

## 📋 Prerequisites

Only 2 things needed:

1. **Docker Desktop** (includes docker-compose)
   - Mac: https://docs.docker.com/desktop/install/mac-install/
   - Windows: https://docs.docker.com/desktop/install/windows-install/
   - Linux: https://docs.docker.com/desktop/install/linux-install/

2. **Git** - To clone the repository

That's it! No Node.js, Bun, PostgreSQL, or other tools required locally.

## 🚀 Quick Start (30 seconds)

```bash
# 1. Clone and enter directory
git clone <repository-url>
cd hyperscape

# 2. Copy environment file and set required variables
cp .env.docker.example .env

# 3. Generate strong secrets (REQUIRED!)
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
echo "POSTGRES_USER=hyperscape" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)" >> .env
echo "POSTGRES_DB=hyperscape" >> .env

# 4. Start everything!
./docker-dev.sh start

# 5. Wait for services to be healthy (~30-60 seconds)
# Then open your browser:
# 🎮 Game Client:  http://localhost:3333
# 🔌 Server API:   http://localhost:5555
```

**Important**: Docker Compose will **fail immediately** if required environment variables are not set, with clear error messages telling you what's missing.

That's it! The game is now running with hot-reload enabled.

## 🏗️ Architecture Overview

The Docker setup runs 5 interconnected services:

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Client   │  │ Server   │  │ Shared   │  │  CDN   │ │
│  │ :3333    │◄─┤ :5555    │◄─┤ (builds) │  │ :8080  │ │
│  │ (Vite)   │  │ (Bun)    │  │          │  │(nginx) │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│       │             │                            │      │
│       └─────────────┼────────────────────────────┘      │
│                     │                                    │
│                ┌────▼────────┐                          │
│                │  PostgreSQL │                          │
│                │    :5432    │                          │
│                └─────────────┘                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Services Explained

| Service | Purpose | Port | Hot Reload |
|---------|---------|------|------------|
| **shared** | Builds shared TypeScript package | - | ✅ Yes |
| **server** | Game backend (WebSocket, API, physics) | 5555 | ✅ Yes |
| **client** | Web frontend (Vite dev server) | 3333 | ✅ Yes |
| **cdn** | Serves static assets (models, textures) | 8080 | ✅ Yes |
| **postgres** | Database (player data, world state) | 5432 | - |

## 📂 File Structure

```
hyperscape/
├── docker-compose.yml              # Service orchestration
├── docker-dev.sh                   # Main entry script
├── .env                           # Your environment config
├── .env.docker.example            # Template for .env
├── .dockerignore                  # Files to exclude from Docker
│
├── docker/
│   └── scripts/                   # Helper scripts
│       ├── dev-start.sh          # Startup logic
│       ├── dev-stop.sh           # Shutdown logic
│       ├── dev-rebuild.sh        # Rebuild images
│       └── dev-logs.sh           # Log viewing
│
└── packages/
    ├── shared/
    │   └── Dockerfile             # Shared package builder
    ├── server/
    │   ├── Dockerfile.dev         # Server dev environment
    │   └── docker/cdn/            # CDN nginx config
    └── client/
        └── Dockerfile.dev         # Client dev environment
```

## 🎮 Common Commands

### Starting & Stopping

```bash
# Start all services (builds images if needed)
./docker-dev.sh start

# Stop all services (keeps data)
./docker-dev.sh stop

# Stop and remove data volumes (⚠️ deletes database)
./docker-dev.sh stop --volumes

# Restart everything
./docker-dev.sh restart
```

### Viewing Logs

```bash
# View all logs
./docker-dev.sh logs

# View specific service logs
./docker-dev.sh logs server
./docker-dev.sh logs client
./docker-dev.sh logs postgres

# Follow logs in real-time (Ctrl+C to exit)
./docker-dev.sh logs server -f

# View last 50 lines
./docker-dev.sh logs server --tail 50
```

### Service Status

```bash
# Check service health and ports
./docker-dev.sh status

# Direct docker-compose status
docker-compose ps

# Resource usage (CPU, memory)
docker stats
```

### Rebuilding

```bash
# Rebuild all images from scratch
./docker-dev.sh rebuild

# Rebuild specific service
docker-compose build server
docker-compose up -d server

# Force rebuild without cache
docker-compose build --no-cache shared
```

### Interactive Shells

```bash
# Open shell in server container
./docker-dev.sh shell server

# Open shell in client container
./docker-dev.sh shell client

# Run commands in container
docker-compose exec server bun run test
docker-compose exec client npm run lint
```

### Running Tests

```bash
# Run server tests
./docker-dev.sh test server

# Run all tests
docker-compose exec server bun run test

# Run specific test file
docker-compose exec server bun test path/to/test.ts
```

### Database Access

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U hyperscape -d hyperscape

# Dump database
docker-compose exec postgres pg_dump -U hyperscape hyperscape > backup.sql

# Restore database
docker-compose exec -T postgres psql -U hyperscape hyperscape < backup.sql

# Reset database (⚠️ destructive)
./docker-dev.sh stop --volumes
./docker-dev.sh start
```

### Cleanup

```bash
# Remove all Docker resources (⚠️ destructive)
./docker-dev.sh clean

# Manual cleanup
docker-compose down -v              # Stop and remove volumes
docker-compose rm -f                # Remove containers
docker system prune -a              # Remove unused images
```

## 🔧 Configuration

### Environment Variables

The `.env` file controls service configuration:

```bash
# Copy template
cp .env.docker.example .env

# Edit as needed
nano .env  # or use your editor
```

**Key variables:**

```bash
# Node environment
NODE_ENV=development

# Ports (change if conflicts)
CLIENT_PORT=3333
SERVER_PORT=5555
POSTGRES_PORT=5432
CDN_PORT=8080

# PostgreSQL
POSTGRES_USER=hyperscape
POSTGRES_PASSWORD=hyperscape_dev
POSTGRES_DB=hyperscape

# Server config
JWT_SECRET=hyperscape-docker-dev-secret
SAVE_INTERVAL=60

# Public URLs (for client)
PUBLIC_WS_URL=ws://localhost:5555/ws
PUBLIC_API_URL=http://localhost:5555/api
PUBLIC_CDN_URL=http://localhost:8080

# Features
PUBLIC_PLAYER_COLLISION=false
PUBLIC_MAX_UPLOAD_SIZE=12

# Optional: LiveKit (voice chat)
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# Optional: Privy (authentication)
PRIVY_APP_ID=
PRIVY_APP_SECRET=
```

### Port Conflicts

If ports are already in use:

```bash
# Check what's using a port
lsof -i :3333
lsof -i :5555

# Kill process on port
lsof -ti:3333 | xargs kill -9

# Or change ports in .env
CLIENT_PORT=3334
SERVER_PORT=5556
```

Then restart:
```bash
./docker-dev.sh restart
```

## 🔒 Environment Variable Validation

### Automatic Validation

Docker Compose automatically validates required environment variables using entrypoint scripts:

**PostgreSQL Service** (`validate-postgres-env.sh`):
- Checks: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Fails immediately if any are missing or empty
- Provides clear error messages with examples

**Server Service** (`validate-server-env.sh`):
- Checks: `JWT_SECRET`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Validates JWT_SECRET is at least 32 characters
- Warns if secrets are too weak
- Fails before constructing DATABASE_URL if credentials are invalid

### Expected Behavior

```bash
# Missing JWT_SECRET
./docker-dev.sh start
# Output:
# ✗ ERROR: Required server environment variables are not set:
#   - JWT_SECRET
#
# Fix: Add these variables to your .env file:
#   JWT_SECRET=$(openssl rand -base64 32)
```

This **fail-fast** approach prevents:
- Running with weak/default credentials
- Malformed DATABASE_URL connections
- Silent failures from missing configuration
- Debugging obscure runtime errors

## 🐛 Troubleshooting

### Missing Environment Variables

**Error**: Container exits immediately with "Required environment variables are not set"

**Solution**:
```bash
# Check your .env file
cat .env

# Add missing variables
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
echo "POSTGRES_USER=hyperscape" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)" >> .env
echo "POSTGRES_DB=hyperscape" >> .env

# Restart
./docker-dev.sh restart
```

### Services Won't Start

**Check Docker is running:**
```bash
docker --version
docker-compose --version
```

**Check for port conflicts:**
```bash
# Find what's using ports
lsof -i :3333 :5555 :5432 :8080

# Kill conflicting processes
./docker-dev.sh stop --volumes
lsof -ti:3333 :5555 :5432 :8080 | xargs kill -9
```

**Check service logs:**
```bash
# See what's failing
./docker-dev.sh logs server -f
./docker-dev.sh logs shared -f
```

### TypeScript Errors in Shared Package

If you see errors like `Cannot find module '@hyperscape/physx-js-webidl'`:

```bash
# Rebuild shared package with PhysX
./docker-dev.sh rebuild
```

This ensures the PhysX types are properly copied into the Docker container.

### Database Connection Issues

```bash
# Check PostgreSQL is running
./docker-dev.sh status

# Check database logs
./docker-dev.sh logs postgres

# Reset database
./docker-dev.sh stop --volumes
./docker-dev.sh start
```

### Hot Reload Not Working

**For server changes:**
```bash
# Check shared package is building
./docker-dev.sh logs shared -f

# Manually trigger rebuild
docker-compose exec shared touch src/index.ts
```

**For client changes:**
```bash
# Check Vite HMR logs
./docker-dev.sh logs client -f

# Hard refresh browser
# Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)
```

### Build Failures

```bash
# Clear everything and rebuild
./docker-dev.sh clean
docker system prune -a -f
./docker-dev.sh start
```

### Out of Memory

If Docker runs out of memory:

1. Open Docker Desktop → Settings → Resources
2. Increase memory to at least **4GB**
3. Restart Docker Desktop
4. Restart services: `./docker-dev.sh restart`

### Permission Issues (Linux)

```bash
# Fix file permissions
sudo chown -R $USER:$USER .

# Or run Docker without sudo
sudo usermod -aG docker $USER
newgrp docker
```

## 🔥 Hot Reload Details

### What Gets Hot-Reloaded?

| File Type | Reload Method | Speed |
|-----------|---------------|-------|
| **Client TypeScript/React** | Vite HMR | ⚡ Instant |
| **Client CSS** | Vite HMR | ⚡ Instant |
| **Server TypeScript** | Auto-rebuild + restart | 🔄 ~2-3s |
| **Shared TypeScript** | Auto-rebuild → triggers server rebuild | 🔄 ~3-5s |
| **Docker config** | Manual rebuild required | 🛠️ Manual |

### How It Works

1. **File Change Detected**
   - Docker mounts source directories as volumes
   - Chokidar watches for file changes

2. **Shared Package** (if shared code changed)
   - ESBuild rebuilds `framework.js`
   - TypeScript type checks
   - Server and client detect new build

3. **Server** (if server code changed)
   - Server rebuilds automatically
   - Process restarts
   - WebSocket reconnects

4. **Client** (if client code changed)
   - Vite HMR updates browser
   - No page reload needed
   - State preserved when possible

## 🎯 Development Workflow

### Typical Development Session

```bash
# 1. Start your day
./docker-dev.sh start
./docker-dev.sh logs server -f  # Keep this running in a terminal

# 2. Make changes to code
# Edit files in your IDE as usual

# 3. Watch logs for errors
# Terminal shows build output and errors

# 4. Test in browser
open http://localhost:3333

# 5. Run tests when ready
./docker-dev.sh test server

# 6. End of day
./docker-dev.sh stop
```

### Working on Server Code

```bash
# Edit server files
packages/server/src/systems/CombatSystem.ts

# Watch server logs
./docker-dev.sh logs server -f

# Server rebuilds automatically
# WebSocket reconnects automatically
# Refresh browser if needed
```

### Working on Client Code

```bash
# Edit client files
packages/client/src/components/Inventory.tsx

# Watch client logs
./docker-dev.sh logs client -f

# Vite HMR updates instantly
# No browser refresh needed
```

### Working on Shared Code

```bash
# Edit shared files
packages/shared/src/entities/Player.ts

# Watch shared build
./docker-dev.sh logs shared -f

# Shared rebuilds → Server rebuilds → Client hot-reloads
# Full cycle takes ~5 seconds
```

### Adding Dependencies

```bash
# Add to package.json first
nano packages/server/package.json

# Rebuild to install
./docker-dev.sh rebuild

# Or rebuild just that service
docker-compose build server
docker-compose up -d server
```

## 📊 Performance Tips

### Faster Builds

```bash
# Use BuildKit (faster builds)
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Add to ~/.bashrc or ~/.zshrc to make permanent
```

### Reduce Memory Usage

```bash
# Stop unused services
docker-compose stop postgres  # If not using DB features
docker-compose stop cdn        # If not loading assets

# Or start only what you need
docker-compose up -d shared server client
```

### Clean Up Disk Space

```bash
# Remove old images and containers
docker system prune -a

# Remove old volumes (⚠️ loses data)
docker volume prune
```

## 🔒 Security Notes

### Development Only

This Docker setup is **for development only**, not production:

- Requires strong JWT secrets (no defaults)
- Requires explicit database credentials (no defaults)
- Exposes ports to localhost only
- No SSL/TLS encryption (use reverse proxy in production)
- Debug logging enabled

### IMPORTANT: Required Environment Variables

The following variables **MUST** be set in your `.env` file - Docker Compose will fail if they're missing:

- `JWT_SECRET` - Strong random secret (min 32 chars) - Generate with: `openssl rand -base64 32`
- `POSTGRES_USER` - PostgreSQL username
- `POSTGRES_PASSWORD` - PostgreSQL password
- `POSTGRES_DB` - PostgreSQL database name

**No default values are provided** to prevent accidentally running with weak credentials.

### Environment Variables

Never commit `.env` with real secrets:

```bash
# .env is gitignored by default
# Copy .env.docker.example to .env
cp .env.docker.example .env

# Then edit .env with your secrets
# Generate strong JWT secret:
openssl rand -base64 32

# Each developer has their own .env
# Never commit .env to git!
```

### API Keys

The `.env.docker.example` file contains placeholders for API keys:

- `MESHY_API_KEY=msy_YOUR_MESHY_API_KEY_HERE` - Get from https://www.meshy.ai/
- `AI_GATEWAY_API_KEY=vck_YOUR_VERCEL_AI_GATEWAY_KEY_HERE` - Get from Vercel
- `OPENAI_API_KEY=` - Get from OpenAI

**Replace these placeholders** with your real keys in your local `.env` file. Never commit real API keys!

## 🤝 Team Collaboration

### Onboarding New Developers

Send them this:

```bash
# 1. Install Docker Desktop
https://docs.docker.com/desktop/

# 2. Clone repository
git clone <repository-url>
cd hyperscape

# 3. Start everything
cp .env.docker.example .env
./docker-dev.sh start

# 4. Open game
http://localhost:3333

# Done! You're running the full stack.
```

### Syncing Changes

```bash
# Pull latest code
git pull origin main

# Rebuild if dependencies changed
./docker-dev.sh rebuild

# Or just restart if only code changed
./docker-dev.sh restart
```

### Sharing Database State

```bash
# Export database
docker-compose exec postgres pg_dump -U hyperscape hyperscape > team-state.sql

# Share team-state.sql with team

# Team member imports
docker-compose exec -T postgres psql -U hyperscape hyperscape < team-state.sql
```

## 🚢 Production Deployment

This Docker setup is development-only. For production:

1. See [README.md](README.md) Deployment section
2. Use proper CI/CD (GitHub Actions included)
3. Deploy to Cloudflare Workers/Pages
4. Use Neon PostgreSQL (not Docker postgres)
5. Enable authentication (Privy)
6. Use proper secrets management

## 📚 Additional Resources

- **Main README**: [README.md](README.md) - Full project documentation
- **Game Design**: [CLAUDE.md](CLAUDE.md) - Complete game mechanics
- **Helper Script**: Run `./docker-dev.sh help` for quick reference
- **Docker Compose Docs**: https://docs.docker.com/compose/
- **Troubleshooting**: See above or ask the team

## 💡 Tips & Tricks

### Faster Terminal Access

Create shell aliases:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias hd='./docker-dev.sh'
alias hd-logs='./docker-dev.sh logs server -f'
alias hd-shell='./docker-dev.sh shell server'
alias hd-restart='./docker-dev.sh restart'

# Now use short commands
hd start
hd-logs
hd restart
```

### Multi-Terminal Setup

Recommended layout:

```
┌─────────────────┬─────────────────┐
│                 │                 │
│  Code Editor    │  Server Logs    │
│  (VS Code etc)  │  (hd logs -f)   │
│                 │                 │
├─────────────────┼─────────────────┤
│                 │                 │
│  Browser        │  Terminal       │
│  (localhost:    │  (commands)     │
│   3333)         │                 │
│                 │                 │
└─────────────────┴─────────────────┘
```

### VS Code Integration

Install Docker extension:
- View containers in sidebar
- See logs in VS Code
- Attach to containers
- Debug inside containers

### Watch Multiple Logs

```bash
# Terminal 1: Server
./docker-dev.sh logs server -f

# Terminal 2: Client
./docker-dev.sh logs client -f

# Terminal 3: Shared
./docker-dev.sh logs shared -f
```

---

## 🎉 You're Ready!

Start developing with:

```bash
./docker-dev.sh start
```

Open your browser to **http://localhost:3333** and start coding!

All your file changes will hot-reload automatically. Check logs with `./docker-dev.sh logs -f`.

Happy coding! 🚀
