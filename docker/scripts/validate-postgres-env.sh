#!/bin/bash
# validate-postgres-env.sh - Validate PostgreSQL environment variables
# This script ensures required variables are set before starting postgres

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

MISSING_VARS=()

# Check required environment variables
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
    echo -e "${RED}✗ ERROR: Required PostgreSQL environment variables are not set:${NC}" >&2
    for var in "${MISSING_VARS[@]}"; do
        echo -e "${RED}  - $var${NC}" >&2
    done
    echo "" >&2
    echo -e "${YELLOW}Fix: Add these variables to your .env file:${NC}" >&2
    echo -e "${YELLOW}  POSTGRES_USER=your_username${NC}" >&2
    echo -e "${YELLOW}  POSTGRES_PASSWORD=your_password${NC}" >&2
    echo -e "${YELLOW}  POSTGRES_DB=hyperscape${NC}" >&2
    echo "" >&2
    echo -e "${YELLOW}See .env.docker.example for reference${NC}" >&2
    exit 1
fi

# Validate that variables are not just whitespace
if [[ -z "${POSTGRES_USER// }" ]] || [[ -z "${POSTGRES_PASSWORD// }" ]] || [[ -z "${POSTGRES_DB// }" ]]; then
    echo -e "${RED}✗ ERROR: PostgreSQL environment variables cannot be empty or whitespace${NC}" >&2
    exit 1
fi

echo "✓ PostgreSQL environment variables validated"
echo "  POSTGRES_USER=$POSTGRES_USER"
echo "  POSTGRES_DB=$POSTGRES_DB"

# Execute the original postgres entrypoint with all arguments
exec docker-entrypoint.sh "$@"
