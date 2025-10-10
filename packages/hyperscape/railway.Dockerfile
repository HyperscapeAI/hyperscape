# Railway Production Dockerfile for Hyperscape
# Optimized for monorepo deployment

# Stage 1: Base dependencies
FROM node:22.11.0-alpine AS base
WORKDIR /app
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    git

# Stage 2: Install dependencies
FROM base AS dependencies
WORKDIR /monorepo

# Copy root package files
COPY ../../package.json ../../bun.lock ./
COPY ../../turbo.json ./

# Copy hyperscape package files
COPY package.json ./packages/hyperscape/
COPY ../../packages/physx-js-webidl/package.json ./packages/physx-js-webidl/

# Install dependencies
RUN npm install --production=false

# Copy physx prebuilt files if available
COPY ../../packages/physx-js-webidl/ ./packages/physx-js-webidl/

# Stage 3: Build
FROM dependencies AS builder
WORKDIR /monorepo/packages/hyperscape

# Copy source code
COPY . .

# Ensure PhysX assets are available
RUN if [ ! -f "../../packages/physx-js-webidl/dist/physx-js-webidl.wasm" ]; then \
    if [ -f "src/server/public/physx-js-webidl.wasm" ]; then \
        mkdir -p ../../packages/physx-js-webidl/dist && \
        cp src/server/public/physx-js-webidl.wasm ../../packages/physx-js-webidl/dist/ && \
        cp src/server/public/physx-js-webidl.js ../../packages/physx-js-webidl/dist/; \
    fi \
fi

# Build the application
RUN npm run build

# Create production env.js
RUN mkdir -p build/public && \
    echo "window.env = {};" > build/public/env.js

# Stage 4: Production
FROM node:22.11.0-alpine AS production
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    dumb-init

# Create non-root user
RUN adduser -S nodeuser -u 1001 && \
    chown -R nodeuser:root /app

# Copy production node_modules
COPY --from=dependencies --chown=nodeuser:root /monorepo/node_modules ./node_modules
COPY --from=dependencies --chown=nodeuser:root /monorepo/packages/hyperscape/node_modules ./packages/hyperscape/node_modules
COPY --from=dependencies --chown=nodeuser:root /monorepo/packages/physx-js-webidl ./packages/physx-js-webidl

# Copy built application
COPY --from=builder --chown=nodeuser:root /monorepo/packages/hyperscape/build ./build
COPY --from=builder --chown=nodeuser:root /monorepo/packages/hyperscape/package*.json ./

# Copy PhysX files to public directory
RUN mkdir -p build/public && \
    if [ -f "packages/physx-js-webidl/dist/physx-js-webidl.wasm" ]; then \
        cp packages/physx-js-webidl/dist/physx-js-webidl.wasm build/public/ && \
        cp packages/physx-js-webidl/dist/physx-js-webidl.js build/public/; \
    fi

# Create world directory for volume mount
RUN mkdir -p /app/world /app/world/assets && \
    chown -R nodeuser:root /app/world

# Set build argument and environment variable
ARG COMMIT_HASH=unknown
ARG RAILWAY_ENVIRONMENT=production
ENV COMMIT_HASH=${COMMIT_HASH} \
    RAILWAY_ENVIRONMENT=${RAILWAY_ENVIRONMENT} \
    NODE_ENV=production \
    PORT=5555

# Expose the port (Railway will override with $PORT)
EXPOSE 5555

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-5555}/status || exit 1

# Switch to non-root user
USER nodeuser

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "build/index.js"]

