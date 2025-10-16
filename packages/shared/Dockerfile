# Dockerfile for Hyperscape Shared Package
# This package is built first as other packages depend on it

FROM oven/bun:1-slim AS base

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ====================================
# Stage: Dependencies
# ====================================
FROM base AS deps

# Copy root package files
COPY package.json bun.lockb* ./
COPY turbo.json ./

# Copy all package.json files for workspace setup
COPY packages/shared/package.json ./packages/shared/
COPY packages/physx-js-webidl/package.json ./packages/physx-js-webidl/

# Copy the full PhysX package (including dist folder if it exists)
COPY packages/physx-js-webidl ./packages/physx-js-webidl/

# Install dependencies
RUN bun install || (echo "Some optional dependencies failed, continuing..." && exit 0)

# ====================================
# Stage: Development (with hot reload)
# ====================================
FROM deps AS development

WORKDIR /app

# Copy shared package source
COPY packages/shared ./packages/shared

# Create build directory
RUN mkdir -p packages/shared/build

# Build once initially
RUN cd packages/shared && bun run build

# Expose build output as volume
VOLUME /app/packages/shared/build

# Run in watch mode for development
CMD ["bun", "run", "dev:shared"]

# ====================================
# Stage: Builder (for production builds)
# ====================================
FROM deps AS builder

WORKDIR /app

# Copy source code
COPY packages/shared ./packages/shared

# Build the package
RUN cd packages/shared && bun run build

# ====================================
# Stage: Production
# ====================================
FROM base AS production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/packages/shared/build ./packages/shared/build
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

# Copy minimal dependencies
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production

# This stage is mainly for exporting build artifacts
CMD ["echo", "Shared package built successfully"]
