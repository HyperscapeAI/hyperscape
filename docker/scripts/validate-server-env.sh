#!/bin/bash
# validate-server-env.sh - Validate server environment variables before startup
# Ensures JWT_SECRET and database credentials are set

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

MISSING_VARS=()

# Check JWT_SECRET
if [ -z "$JWT_SECRET" ]; then
    MISSING_VARS+=("JWT_SECRET")
fi

# Check database credentials for DATABASE_URL construction
if [ -z "$POSTGRES_USER" ]; then
    MISSING_VARS+=("POSTGRES_USER")
fi

if [ -z "$POSTGRES_PASSWORD" ]; then
    MISSING_VARS+=("POSTGRES_PASSWORD")
fi

if [ -z "$POSTGRES_DB" ]; then
    MISSING_VARS+=("POSTGRES_DB")
fi

# If any variables are missing, fail with clear error
if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}✗ ERROR: Required server environment variables are not set:${NC}" >&2
    for var in "${MISSING_VARS[@]}"; do
        echo -e "${RED}  - $var${NC}" >&2
    done
    echo "" >&2
    echo -e "${YELLOW}Fix: Add these variables to your .env file:${NC}" >&2

    if [[ " ${MISSING_VARS[@]} " =~ " JWT_SECRET " ]]; then
        echo -e "${YELLOW}  JWT_SECRET=\$(openssl rand -base64 32)${NC}" >&2
    fi

    if [[ " ${MISSING_VARS[@]} " =~ " POSTGRES_USER " ]]; then
        echo -e "${YELLOW}  POSTGRES_USER=hyperscape${NC}" >&2
    fi

    if [[ " ${MISSING_VARS[@]} " =~ " POSTGRES_PASSWORD " ]]; then
        echo -e "${YELLOW}  POSTGRES_PASSWORD=\$(openssl rand -base64 24)${NC}" >&2
    fi

    if [[ " ${MISSING_VARS[@]} " =~ " POSTGRES_DB " ]]; then
        echo -e "${YELLOW}  POSTGRES_DB=hyperscape${NC}" >&2
    fi

    echo "" >&2
    echo -e "${YELLOW}See .env.docker.example for reference${NC}" >&2
    exit 1
fi

# Validate JWT_SECRET strength (minimum 32 characters recommended)
if [ ${#JWT_SECRET} -lt 32 ]; then
    echo -e "${YELLOW}⚠️  WARNING: JWT_SECRET is shorter than 32 characters (currently ${#JWT_SECRET})${NC}" >&2
    echo -e "${YELLOW}   For production, use: openssl rand -base64 32${NC}" >&2
fi

# Validate that variables are not just whitespace
if [[ -z "${JWT_SECRET// }" ]] || [[ -z "${POSTGRES_USER// }" ]] || [[ -z "${POSTGRES_PASSWORD// }" ]] || [[ -z "${POSTGRES_DB// }" ]]; then
    echo -e "${RED}✗ ERROR: Environment variables cannot be empty or whitespace${NC}" >&2
    exit 1
fi

echo -e "${GREEN}✓ Server environment variables validated${NC}"
echo "  JWT_SECRET: [hidden - ${#JWT_SECRET} chars]"
echo "  POSTGRES_USER: $POSTGRES_USER"
echo "  POSTGRES_DB: $POSTGRES_DB"
echo "  DATABASE_URL: postgresql://$POSTGRES_USER:***@postgres:5432/$POSTGRES_DB"

# Execute the actual server command
exec "$@"
