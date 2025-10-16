#!/bin/bash
# dev-stop.sh - Stop Hyperscape development environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════╗"
echo "║   Stopping Hyperscape Development         ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

cd "$ROOT_DIR"

# Parse arguments
REMOVE_VOLUMES=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--volumes)
            REMOVE_VOLUMES=true
            shift
            ;;
        *)
            echo -e "${YELLOW}Unknown option: $1${NC}"
            echo "Usage: $0 [-v|--volumes]"
            echo "  -v, --volumes    Remove volumes (database data will be lost)"
            exit 1
            ;;
    esac
done

if [ "$REMOVE_VOLUMES" = true ]; then
    echo -e "${YELLOW}⚠️  Stopping and removing volumes (database data will be lost)...${NC}"
    docker-compose down -v
    echo -e "${GREEN}✓ Stopped all services and removed volumes${NC}"
else
    echo -e "${BLUE}Stopping services...${NC}"
    docker-compose down
    echo -e "${GREEN}✓ Stopped all services (volumes preserved)${NC}"
fi

echo ""
echo -e "${BLUE}💡 Tips:${NC}"
echo -e "  Start again:       ${YELLOW}./docker/scripts/dev-start.sh${NC}"
echo -e "  Remove volumes:    ${YELLOW}$0 --volumes${NC}"
echo -e "  View containers:   ${YELLOW}docker ps -a${NC}"
echo ""
