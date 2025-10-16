#!/bin/bash
# dev-logs.sh - View logs from Hyperscape services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd "$ROOT_DIR"

# Parse arguments
SERVICE=""
FOLLOW=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        server|client|shared|postgres|cdn)
            SERVICE=$1
            shift
            ;;
        *)
            echo -e "${YELLOW}Usage: $0 [service] [-f|--follow]${NC}"
            echo "Services: server, client, shared, postgres, cdn"
            echo "  -f, --follow    Follow log output"
            exit 1
            ;;
    esac
done

if [ "$FOLLOW" = true ]; then
    if [ -z "$SERVICE" ]; then
        echo -e "${BLUE}Following logs from all services...${NC}"
        docker-compose logs -f
    else
        echo -e "${BLUE}Following logs from $SERVICE...${NC}"
        docker-compose logs -f "$SERVICE"
    fi
else
    if [ -z "$SERVICE" ]; then
        echo -e "${BLUE}Showing logs from all services...${NC}"
        docker-compose logs --tail=100
    else
        echo -e "${BLUE}Showing logs from $SERVICE...${NC}"
        docker-compose logs --tail=100 "$SERVICE"
    fi
fi
