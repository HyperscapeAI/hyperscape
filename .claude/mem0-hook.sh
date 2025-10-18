#!/bin/bash

# mem0.ai integration hook for Claude Code
# This hook stores conversation context and retrieves relevant memories

set -e

# Read the hook input JSON from stdin
INPUT=$(cat)

# Load environment variables from .claude/.env
SCRIPT_DIR="$(dirname "$0")"
if [ -f "$SCRIPT_DIR/.env" ]; then
  source "$SCRIPT_DIR/.env"
fi

# mem0.ai API configuration
MEM0_API_KEY="${MEM0_API_KEY}"
MEM0_API_URL="https://api.mem0.ai"

# Validate required configuration
if [ -z "$MEM0_API_KEY" ]; then
  echo "[mem0-hook] ERROR: MEM0_API_KEY environment variable must be set" >&2
  echo "[mem0-hook] Please add MEM0_API_KEY to your .env file" >&2
  exit 1
fi

# Extract relevant data from the hook input
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hookEvent // empty')
USER_PROMPT=$(echo "$INPUT" | jq -r '.userPrompt // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // empty')

# Get user ID (use git user email or default)
USER_ID=$(git config user.email 2>/dev/null || echo "hyperscape-dev")

# Log function
log() {
  echo "[mem0-hook] $1" >&2
}

# Function to store memory
store_memory() {
  local content="$1"

  if [ -z "$content" ]; then
    return
  fi

  log "Storing memory for user: $USER_ID"

  # Create the API payload
  PAYLOAD=$(jq -n \
    --arg user_id "$USER_ID" \
    --arg user_content "$content" \
    --arg assistant_content "Acknowledged and stored context." \
    '{
      messages: [
        {
          role: "user",
          content: $user_content
        },
        {
          role: "assistant",
          content: $assistant_content
        }
      ],
      user_id: $user_id,
      version: "v2"
    }')

  # Store the memory with proper error handling
  RESPONSE=$(curl -sS --fail --request POST \
    --url "$MEM0_API_URL/v1/memories/" \
    --header "Authorization: Token ***" \
    --header "Content-Type: application/json" \
    --data "$PAYLOAD" 2>&1)
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    log "Failed to store memory (curl exit code: $EXIT_CODE)"
    log "Response: ${RESPONSE:0:200}" # Log first 200 chars, avoiding token exposure
  fi
}

# Function to search memories
search_memories() {
  local query="$1"

  if [ -z "$query" ]; then
    return
  fi

  log "Searching memories for user: $USER_ID"

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

  # Search memories and return results
  MEMORIES=$(curl -s --request POST \
    --url "$MEM0_API_URL/v2/memories/search/" \
    --header "Authorization: Token $MEM0_API_KEY" \
    --header "Content-Type: application/json" \
    --data "$SEARCH_PAYLOAD")

  # Check if we got relevant memories
  MEMORY_COUNT=$(echo "$MEMORIES" | jq -r '.results | length' 2>/dev/null || echo "0")

  if [ "$MEMORY_COUNT" -gt 0 ]; then
    log "Found $MEMORY_COUNT relevant memories"
    echo "$MEMORIES" | jq -r '.results[] | "• " + .memory' | head -5
  fi
}

# Handle different hook events
case "$HOOK_EVENT" in
  "UserPromptSubmit")
    # Store the user's prompt as context
    if [ -n "$USER_PROMPT" ]; then
      log "User prompt submitted: ${USER_PROMPT:0:50}..."

      # Search for relevant memories first
      RELEVANT_CONTEXT=$(search_memories "$USER_PROMPT")

      # Store the new context
      store_memory "$USER_PROMPT"

      # If we found relevant memories, provide them as context
      if [ -n "$RELEVANT_CONTEXT" ]; then
        log "Providing relevant context from memory"
        echo "📝 Relevant context from memory:"
        echo "$RELEVANT_CONTEXT"
        echo ""
      fi
    fi
    ;;

  "SessionEnd"|"Stop")
    # Store session summary
    log "Session ended - storing session context"
    SUMMARY="Session completed with ${TOOL_NAME:-various} operations"
    store_memory "$SUMMARY"
    ;;

  *)
    # For other events, just log
    log "Hook event: $HOOK_EVENT"
    ;;
esac

# Return success to allow the operation to proceed
echo '{"allow": true}'
