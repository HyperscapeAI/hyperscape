#!/bin/bash
# docker-dev.sh - One-command setup for Hyperscape Docker development
# This is the main entry point - just run: ./docker-dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
cat << "EOF"
╔═══════════════════════════════════════════╗
║                                           ║
║        🚀 HYPERSCAPE DOCKER DEV 🚀        ║
║                                           ║
║     AI-Generated RuneScape-Style RPG      ║
║                                           ║
╚═══════════════════════════════════════════╝
EOF
echo -e "${NC}"

cd "$SCRIPT_DIR"

# Parse command line arguments
COMMAND=${1:-start}

case $COMMAND in
    start)
        echo -e "${BLUE}Starting Hyperscape development environment...${NC}"
        ./docker/scripts/dev-start.sh
        ;;

    stop)
        echo -e "${BLUE}Stopping Hyperscape development environment...${NC}"
        ./docker/scripts/dev-stop.sh "${@:2}"
        ;;

    restart)
        echo -e "${BLUE}Restarting Hyperscape development environment...${NC}"
        ./docker/scripts/dev-stop.sh
        ./docker/scripts/dev-start.sh
        ;;

    rebuild)
        echo -e "${BLUE}Rebuilding Hyperscape development environment...${NC}"
        ./docker/scripts/dev-rebuild.sh
        ;;

    logs)
        echo -e "${BLUE}Viewing logs...${NC}"
        ./docker/scripts/dev-logs.sh "${@:2}"
        ;;

    shell)
        SERVICE=${2:-server}
        echo -e "${BLUE}Opening shell in $SERVICE container...${NC}"
        docker-compose exec "$SERVICE" sh
        ;;

    status)
        echo -e "${BLUE}Service status:${NC}"
        docker-compose ps
        echo ""
        echo -e "${BLUE}Resource usage:${NC}"
        docker stats --no-stream
        ;;

    clean)
        echo -e "${YELLOW}⚠️  This will remove all containers, images, and volumes!${NC}"
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}Cleaning up Docker resources...${NC}"
            docker-compose down -v
            docker-compose rm -f
            echo -e "${GREEN}✓ Cleanup complete${NC}"
        else
            echo -e "${YELLOW}Cancelled${NC}"
        fi
        ;;

    test)
        SERVICE=${2:-server}
        echo -e "${BLUE}Running tests in $SERVICE...${NC}"
        docker-compose run --rm "$SERVICE" bun run test
        ;;

    help|--help|-h)
        cat << HELP
${BOLD}Hyperscape Docker Development${NC}

${BOLD}USAGE:${NC}
    ./docker-dev.sh [COMMAND] [OPTIONS]

${BOLD}COMMANDS:${NC}
    ${GREEN}start${NC}           Start the development environment (default)
    ${GREEN}stop${NC}            Stop all services
                     ${YELLOW}--volumes${NC}  Also remove data volumes
    ${GREEN}restart${NC}         Restart all services
    ${GREEN}rebuild${NC}         Clean rebuild of all images
    ${GREEN}logs${NC}            View logs
                     ${YELLOW}[service]${NC}  View specific service logs
                     ${YELLOW}-f${NC}         Follow log output
    ${GREEN}shell${NC}           Open shell in container
                     ${YELLOW}[service]${NC}  Container to access (default: server)
    ${GREEN}status${NC}          Show service status and resource usage
    ${GREEN}test${NC}            Run tests
                     ${YELLOW}[service]${NC}  Service to test (default: server)
    ${GREEN}clean${NC}           Remove all Docker resources (WARNING: destructive)
    ${GREEN}help${NC}            Show this help message

${BOLD}SERVICES:${NC}
    server          Game backend (port 5555)
    client          Frontend (port 3333)
    postgres        Database (port 5432)
    cdn             Static assets (port 8080)
    shared          Shared library builder

${BOLD}EXAMPLES:${NC}
    ${CYAN}# Start everything${NC}
    ./docker-dev.sh start

    ${CYAN}# View server logs${NC}
    ./docker-dev.sh logs server -f

    ${CYAN}# Open shell in server container${NC}
    ./docker-dev.sh shell server

    ${CYAN}# Run tests${NC}
    ./docker-dev.sh test

    ${CYAN}# Stop and clean up${NC}
    ./docker-dev.sh stop --volumes

${BOLD}ACCESS POINTS:${NC}
    🎮 Client:    ${GREEN}http://localhost:3333${NC}
    🔌 Server:    ${GREEN}http://localhost:5555${NC}
    📦 CDN:       ${GREEN}http://localhost:8080${NC}
    🗄️  Database:  ${GREEN}localhost:5432${NC}

${BOLD}DOCUMENTATION:${NC}
    Full guide:   ${CYAN}DOCKER.md${NC}
    Main README:  ${CYAN}README.md${NC}
    Project docs: ${CYAN}CLAUDE.md${NC}

HELP
        ;;

    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        echo -e "Run ${CYAN}./docker-dev.sh help${NC} for usage information"
        exit 1
        ;;
esac
