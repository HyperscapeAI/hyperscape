#!/bin/bash
# dev-rebuild.sh - Clean rebuild of Hyperscape development environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════╗"
echo "║   Hyperscape Clean Rebuild                 ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

cd "$ROOT_DIR"

# Confirm action
echo -e "${YELLOW}⚠️  This will:${NC}"
echo -e "  • Stop all containers"
echo -e "  • Remove all containers"
echo -e "  • Remove all images"
echo -e "  • Rebuild from scratch"
echo -e "  • Preserve database volumes"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cancelled${NC}"
    exit 0
fi

echo -e "${BLUE}Stopping all services...${NC}"
docker-compose down

echo -e "${BLUE}Removing old images...${NC}"
docker-compose rm -f

echo -e "${BLUE}Rebuilding images (no cache)...${NC}"
docker-compose build --no-cache

echo -e "${BLUE}Starting services...${NC}"
docker-compose up -d

echo -e "${BLUE}Waiting for services to be ready...${NC}"
sleep 15

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✓ Rebuild complete!                     ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📍 Access points:${NC}"
echo -e "  🎮 Client:    ${GREEN}http://localhost:3333${NC}"
echo -e "  🔌 Server:    ${GREEN}http://localhost:5555${NC}"
echo -e "  📦 CDN:       ${GREEN}http://localhost:8080${NC}"
echo ""
