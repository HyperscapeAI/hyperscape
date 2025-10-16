#!/bin/bash
# dev-start.sh - Start Hyperscape development environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════╗"
echo "║   Hyperscape Docker Development Setup     ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

cd "$ROOT_DIR"

# Check if .env exists, if not copy from example
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from .env.docker.example...${NC}"
    cp .env.docker.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
    echo -e "${YELLOW}⚠️  Please review and update .env with your configuration${NC}"
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi

echo -e "${BLUE}Building Docker images...${NC}"
docker-compose build

echo -e "${BLUE}Starting services...${NC}"
docker-compose up -d

echo -e "${BLUE}Waiting for services to be ready...${NC}"

# Configurable timeout and poll interval
TIMEOUT=${HEALTHCHECK_TIMEOUT:-120}
POLL_INTERVAL=${HEALTHCHECK_POLL_INTERVAL:-2}

# Helper function for health checks with timeout
# NOTE: Only predefined check types are supported for security (no arbitrary command execution)
wait_for_service() {
    local service_name=$1
    local check_type=$2
    local timeout=$TIMEOUT
    local elapsed=0

    echo -e "${BLUE}⏳ Waiting for $service_name...${NC}"

    while [ $elapsed -lt $timeout ]; do
        local check_passed=0

        # Execute predefined health checks based on type
        case "$check_type" in
            postgres_healthy)
                docker-compose ps postgres 2>/dev/null | grep -q '(healthy)' && check_passed=1
                ;;
            cdn_http)
                curl -sf http://localhost:8080/health >/dev/null 2>&1 && check_passed=1
                ;;
            shared_build)
                # First check if container is running, then check for build artifact
                if docker-compose ps shared 2>/dev/null | grep -q 'Up'; then
                    docker-compose exec -T shared test -f /app/packages/shared/build/framework.js >/dev/null 2>&1 && check_passed=1
                fi
                ;;
            server_ready)
                curl -sf http://localhost:5555 >/dev/null 2>&1 || nc -z localhost 5555 >/dev/null 2>&1 && check_passed=1
                ;;
            client_http)
                curl -sf http://localhost:3333 >/dev/null 2>&1 && check_passed=1
                ;;
            *)
                echo -e "${RED}✗ ERROR: Unknown check type '$check_type'${NC}" >&2
                return 2
                ;;
        esac

        if [ $check_passed -eq 1 ]; then
            echo -e "${GREEN}✓ $service_name is ready (${elapsed}s)${NC}"
            return 0
        fi

        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
    done

    echo -e "${RED}✗ $service_name failed to become ready after ${timeout}s${NC}"
    echo -e "${YELLOW}Check logs with: docker-compose logs $(echo "$service_name" | tr '[:upper:]' '[:lower:]' | awk '{print $1}')${NC}"
    return 1
}

# Wait for PostgreSQL using docker-compose health check
wait_for_service "PostgreSQL" "postgres_healthy"

# Wait for CDN (nginx health endpoint)
wait_for_service "CDN" "cdn_http"

# Wait for shared package build (check if build artifact exists after container is running)
wait_for_service "Shared Package" "shared_build"

# Wait for server (check health endpoint or port)
wait_for_service "Server" "server_ready"

# Wait for client (check Vite dev server)
wait_for_service "Client" "client_http"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   🚀 Hyperscape is running!               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📍 Access points:${NC}"
echo -e "  🎮 Client:    ${GREEN}http://localhost:3333${NC}"
echo -e "  🔌 Server:    ${GREEN}http://localhost:5555${NC}"
echo -e "  📦 CDN:       ${GREEN}http://localhost:8080${NC}"
echo -e "  🗄️  Database:  ${GREEN}localhost:5432${NC}"
echo ""
echo -e "${BLUE}📋 Useful commands:${NC}"
echo -e "  View logs:         ${YELLOW}docker-compose logs -f${NC}"
echo -e "  View server logs:  ${YELLOW}docker-compose logs -f server${NC}"
echo -e "  View client logs:  ${YELLOW}docker-compose logs -f client${NC}"
echo -e "  Stop all:          ${YELLOW}docker-compose down${NC}"
echo -e "  Restart:           ${YELLOW}docker-compose restart${NC}"
echo -e "  Rebuild:           ${YELLOW}docker-compose up --build${NC}"
echo ""
echo -e "${GREEN}✨ Happy coding!${NC}"
