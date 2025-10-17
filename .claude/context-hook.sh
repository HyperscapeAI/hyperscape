#!/bin/bash

# Context awareness hook for Claude Code
# Ensures memories are retrieved and relevant files are analyzed before edits/planning

set -e

# Read the hook input JSON from stdin
INPUT=$(cat)

# Load environment variables
if [ -f "$(dirname "$0")/../../.env" ]; then
  source "$(dirname "$0")/../../.env"
fi

# Configuration
# Configuration (from environment)
PROJECT_ROOT="${PROJECT_ROOT:-.}"
MEM0_API_KEY="${MEM0_API_KEY}"
MEM0_API_URL="${MEM0_API_URL:-https://api.mem0.ai}"

# Validate required configuration
if [ -z "$MEM0_API_KEY" ]; then
  log "ERROR: MEM0_API_KEY environment variable must be set"
  echo '{"allow": false, "error": "Missing MEM0_API_KEY"}'
  exit 1
fi

# Extract relevant data
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // .filePath // empty')
TOOL_DESCRIPTION=$(echo "$INPUT" | jq -r '.description // empty')

# Get user ID
USER_ID=$(git config user.email 2>/dev/null || echo "hyperscape-dev")

# Log function
log() {
  echo "[context-hook] $1" >&2
}

# Function to check required dependencies
check_dependencies() {
  local required_tools=(
    "curl"
    "jq"
    "git"
    "find"
    "grep"
    "sed"
    "basename"
    "dirname"
    "cat"
    "head"
    "cut"
    "sort"
  )
  
  local missing_tools=()
  
  for tool in "${required_tools[@]}"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      missing_tools+=("$tool")
      log "ERROR: Required tool '$tool' is not installed or not in PATH"
    fi
  done
  
  if [ ${#missing_tools[@]} -gt 0 ]; then
    local missing_list=$(printf ", %s" "${missing_tools[@]}")
    missing_list=${missing_list:2}  # Remove leading ", "
    
    log "ERROR: Missing required tools: $missing_list"
    log "Please install the missing tools and ensure they are in your PATH"
    
    echo "{\"allow\": false, \"error\": \"Missing required dependencies: $missing_list\"}"
    exit 1
  fi
  
  log "All required dependencies are available"
}

# Function to search memories
search_memories() {
  local query="$1"

  if [ -z "$query" ]; then
    return
  fi

  # Create the search payload
  SEARCH_PAYLOAD=$(jq -n \
    --arg user_id "$USER_ID" \
    --arg query "$query" \
    '{
      query: $query,
      filters: {
        OR: [
          { user_id: $user_id }
        ]
      }
    }')

  # Search memories
  MEMORIES=$(curl -s --request POST \
    --url "$MEM0_API_URL/v2/memories/search/" \
    --header "Authorization: Token $MEM0_API_KEY" \
    --header "Content-Type: application/json" \
    --data "$SEARCH_PAYLOAD" 2>/dev/null || echo '{"results":[]}')

  echo "$MEMORIES"
}

# Function to map monorepo structure
get_monorepo_context() {
  cd "$PROJECT_ROOT"

  cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 MONOREPO STRUCTURE CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Packages in this monorepo:
EOF

  # List all packages with their purposes
  for pkg in packages/*/package.json; do
    if [ -f "$pkg" ]; then
      pkg_name=$(jq -r '.name // "unknown"' "$pkg" 2>/dev/null)
      pkg_desc=$(jq -r '.description // "No description"' "$pkg" 2>/dev/null)
      pkg_dir=$(dirname "$pkg")

      echo "  📦 $pkg_name"
      echo "     Location: $pkg_dir"
      echo "     Purpose: $pkg_desc"
      echo ""
    fi
  done

  cat <<EOF

Key directories:
  • packages/client/     - Frontend 3D game client (Vite, React, Three.js)
  • packages/server/     - Backend game server (Node.js, SQLite, WebSocket)
  • packages/shared/     - Shared code (ECS systems, game logic)
  • packages/plugin-hyperscape/ - ElizaOS AI agent integration
  • .cursor/rules/       - Development rules and standards

EOF
}

# Function to find related files based on context
find_related_files() {
  local target_file="$1"

  if [ -z "$target_file" ]; then
    return
  fi

  cd "$PROJECT_ROOT"

  # Get the base filename without extension
  local base_name=$(basename "$target_file" | sed 's/\.[^.]*$//')
  local file_dir=$(dirname "$target_file")

  log "Finding files related to: $base_name"

  cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 RELATED FILES IN MONOREPO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

  # Find type definitions
  echo "Type definitions:"
  find packages \( -name "types.ts" -o -name "types" \) -type d 2>/dev/null | head -5 | while read f; do
    echo "  📘 $f"
  done
  echo ""

  # Find test files if this is a source file
  if [[ ! "$target_file" =~ test ]]; then
    echo "Related test files:"
    find packages -name "*${base_name}*.test.ts" -o -name "*${base_name}*.spec.ts" 2>/dev/null | head -3 | while read f; do
      echo "  🧪 $f"
    done
    echo ""
  fi

  # Find files importing/exporting similar names
  if [ -n "$base_name" ]; then
    echo "Files that might import/reference this:"
    grep -r "from.*$base_name" packages --include="*.ts" --include="*.tsx" 2>/dev/null | cut -d: -f1 | sort -u | head -5 | while read f; do
      echo "  🔗 $f"
    done
    echo ""
  fi

  # Show package-specific context
  if [[ "$target_file" =~ packages/([^/]+) ]]; then
    local pkg="${BASH_REMATCH[1]}"
    echo "Package context: packages/$pkg"

    if [ -f "packages/$pkg/README.md" ]; then
      echo "  📖 Has README.md"
    fi

    if [ -f "packages/$pkg/tsconfig.json" ]; then
      echo "  ⚙️  Has tsconfig.json"
    fi
    echo ""
  fi

  cat <<EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

# Function to provide contextual guidance
provide_guidance() {
  local tool="$1"
  local file="$2"

  cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 CONTEXTUAL GUIDANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before proceeding with $tool:

1. 📚 Review relevant memories above for context
2. 🔍 Check related files in the monorepo structure
3. 📋 Verify compliance with .cursor/rules/
4. 🧪 Consider if tests need to be updated
5. 🔗 Check for cross-package dependencies

Key rules to remember:
  • NO 'any' types - use specific types from types.ts files
  • NO mocks in tests - use real Hyperscape instances
  • Share types across packages from shared/types
  • Keep packages modular and self-contained
  • Every feature needs Playwright tests

EOF

  # File-specific guidance
  if [[ "$file" =~ \.test\.ts$ ]] || [[ "$file" =~ \.spec\.ts$ ]]; then
    cat <<EOF
🧪 TEST FILE GUIDANCE:
  • Must use Playwright and real Hyperscape world
  • Use visual testing with colored cube proxies
  • Check Three.js scene hierarchy for verification
  • Save logs to /logs folder for debugging
  • All tests must pass before moving on

EOF
  elif [[ "$file" =~ System\.ts$ ]]; then
    cat <<EOF
⚙️  SYSTEM FILE GUIDANCE:
  • This is an ECS system - check packages/shared/src/systems/
  • Systems should be stateless and operate on components
  • Use world.getComponent() to access entity data
  • Consider system execution order and dependencies
  • Test with real game scenarios in Playwright

EOF
  elif [[ "$file" =~ packages/shared ]]; then
    cat <<EOF
📦 SHARED PACKAGE GUIDANCE:
  • This code is shared between client and server
  • Keep it framework-agnostic (no DOM, no Node.js APIs)
  • Define types that can be imported by other packages
  • Changes here affect multiple packages
  • Run tests for both client and server

EOF
  fi

  cat <<EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
}

# Main logic
main() {
  # Check all required dependencies before proceeding
  check_dependencies
  
  # Only run for Edit, Write, and Task tools
  if [ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ] && [ "$TOOL_NAME" != "Task" ]; then
    echo '{"allow": true}'
    exit 0
  fi

  log "PreToolUse hook triggered for $TOOL_NAME"

  # Build search query from file path and description
  local search_query=""
  if [ -n "$FILE_PATH" ]; then
    local filename=$(basename "$FILE_PATH")
    search_query="$filename"
    log "Searching memories related to: $filename"
  elif [ -n "$TOOL_DESCRIPTION" ]; then
    search_query="$TOOL_DESCRIPTION"
    log "Searching memories for: $TOOL_DESCRIPTION"
  fi

  # Retrieve relevant memories
  if [ -n "$search_query" ]; then
    MEMORIES=$(search_memories "$search_query")
    MEMORY_COUNT=$(echo "$MEMORIES" | jq -r '.results | length' 2>/dev/null || echo "0")

    if [ "$MEMORY_COUNT" -gt 0 ]; then
      cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 RELEVANT MEMORIES FROM PREVIOUS SESSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
      echo "$MEMORIES" | jq -r '.results[] | "• " + .memory' | head -10
      echo ""
      cat <<EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
    else
      log "No relevant memories found for: $search_query"
    fi
  fi

  # Provide monorepo context
  get_monorepo_context

  # Find related files if we have a target file
  if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
    find_related_files "$FILE_PATH"
  fi

  # Provide contextual guidance
  provide_guidance "$TOOL_NAME" "$FILE_PATH"

  # Allow the operation to proceed
  echo '{"allow": true}'
}

main
