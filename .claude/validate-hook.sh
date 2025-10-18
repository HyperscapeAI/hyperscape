#!/bin/bash

# File validation hook for Claude Code
# Validates edited files against Cursor rules before proceeding

set -e

# Read the hook input JSON from stdin
INPUT=$(cat)

# Extract relevant data from the hook input
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // .filePath // empty')

# Get the project root
PROJECT_ROOT="/Users/home/scape/hyperscape"
RULES_DIR="$PROJECT_ROOT/.cursor/rules"

# Log function
log() {
  echo "[validate-hook] $1" >&2
}

# Function to check if a file matches a glob pattern
matches_glob() {
  local file="$1"
  local pattern="$2"

  # Convert glob to regex pattern
  case "$file" in
    $pattern) return 0 ;;
    *) return 1 ;;
  esac
}

# Function to validate TypeScript files
validate_typescript() {
  local file="$1"

  log "Validating TypeScript file: $file"

  # Check for 'any' type usage (forbidden)
  if grep -n '\bany\b' "$file" 2>/dev/null | grep -v '// @ts-' | grep -v 'eslint-disable' > /dev/null; then
    echo "❌ VALIDATION FAILED: File contains forbidden 'any' type"
    echo ""
    echo "Violations found:"
    grep -n '\bany\b' "$file" | grep -v '// @ts-' | grep -v 'eslint-disable' | head -5
    echo ""
    echo "Rule: TypeScript Strong Typing - NO 'any' or 'unknown' types allowed"
    echo "See: .cursor/rules/typescript-strong-typing.mdc"
    echo ""
    return 1
  fi

  # Check for 'unknown' type (should be rare)
  if grep -n '\bunknown\b' "$file" 2>/dev/null | grep -v 'as unknown as' | grep -v '// @ts-' > /dev/null; then
    log "⚠️  WARNING: File contains 'unknown' type - use sparingly"
  fi

  # Check for interface usage (prefer classes or types)
  if grep -n '^\s*interface\s' "$file" 2>/dev/null > /dev/null; then
    log "⚠️  WARNING: File uses interfaces - prefer classes or type aliases"
    echo ""
    echo "Consider using classes or type aliases instead:"
    grep -n '^\s*interface\s' "$file" | head -3
    echo ""
    echo "Rule: TypeScript Strong Typing - Prefer classes over interfaces"
  fi

  # Check for property existence checks (discouraged)
  if grep -n "'\w\+' in \|hasOwnProperty" "$file" 2>/dev/null > /dev/null; then
    log "⚠️  WARNING: File uses property existence checks - make strong type assumptions instead"
    echo ""
    grep -n "'\w\+' in \|hasOwnProperty" "$file" | head -3
    echo ""
  fi

  log "✅ TypeScript validation passed"
  return 0
}

# Function to validate test files
validate_test_file() {
  local file="$1"

  log "Validating test file: $file"

  # Check for mock/spy usage (forbidden)
  if grep -niE '\b(mock|spy|stub|jest\.fn|sinon\.|vi\.fn)\b' "$file" 2>/dev/null | grep -v '// Real' > /dev/null; then
    echo "❌ VALIDATION FAILED: Test file contains mocks/spies/stubs"
    echo ""
    echo "Violations found:"
    grep -niE '\b(mock|spy|stub|jest\.fn|sinon\.|vi\.fn)\b' "$file" | head -5
    echo ""
    echo "Rule: Real code only - No mocks, spies, or test framework abstractions"
    echo "See: .cursor/rules/testing.mdc"
    echo ""
    return 1
  fi

  # Check for Playwright usage (required)
  if ! grep -q 'playwright\|page\.' "$file" 2>/dev/null; then
    log "⚠️  WARNING: Test file may not be using Playwright"
    echo ""
    echo "Rule: All tests MUST use Hyperscape and Playwright"
  fi

  log "✅ Test validation passed"
  return 0
}

# Function to validate general rules
validate_general_rules() {
  local file="$1"

  log "Validating general rules for: $file"

  # Check for TODO comments (discouraged)
  if grep -n '\bTODO\b|\bFIXME\b' "$file" 2>/dev/null > /dev/null; then
    log "⚠️  WARNING: File contains TODO/FIXME comments"
    echo ""
    grep -n '\bTODO\b|\bFIXME\b' "$file" | head -3
    echo ""
    echo "Rule: Always write production code - implement fully instead of leaving TODOs"
  fi

  # Check for example/placeholder code
  if grep -ni '\bexample\b|\bplaceholder\b|\btemp\b' "$file" 2>/dev/null | grep -v 'Example:' | grep -v '@example' > /dev/null; then
    log "⚠️  WARNING: File may contain example/placeholder code"
    echo ""
    grep -ni '\bexample\b|\bplaceholder\b|\btemp\b' "$file" | grep -v 'Example:' | grep -v '@example' | head -3
    echo ""
  fi

  log "✅ General rules validation passed"
  return 0
}

# Main validation logic
validate_file() {
  local file="$1"

  # Skip if file doesn't exist
  if [ ! -f "$file" ]; then
    log "File not found, skipping validation: $file"
    return 0
  fi

  # Get file extension
  local ext="${file##*.}"
  local filename=$(basename "$file")

  log "Validating file: $filename"

  # Always apply general rules
  validate_general_rules "$file" || return 1

  # Apply specific rules based on file type
  case "$ext" in
    ts|tsx)
      validate_typescript "$file" || return 1

      # Additional validation for test files
      if [[ "$filename" == *test* ]] || [[ "$filename" == *spec* ]]; then
        validate_test_file "$file" || return 1
      fi
      ;;
    js|jsx)
      log "⚠️  WARNING: JavaScript file detected - consider using TypeScript"
      validate_general_rules "$file" || return 1
      ;;
    *)
      log "Skipping validation for file type: $ext"
      ;;
  esac

  log "✅ All validations passed for: $filename"
  return 0
}

# Handle the hook event
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "NotebookEdit" ]; then
  if [ -n "$FILE_PATH" ]; then
    log "PostToolUse hook triggered for $TOOL_NAME on $FILE_PATH"

    # Validate the file
    if validate_file "$FILE_PATH"; then
      echo '{"allow": true}'
      exit 0
    else
      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "⚠️  VALIDATION WARNINGS/ERRORS DETECTED"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo ""
      echo "Please review the validation output above and fix any issues."
      echo "You can find the full rules in: .cursor/rules/"
      echo ""
      echo "Key rules to remember:"
      echo "  • NO 'any' types - use specific types instead"
      echo "  • NO mocks/spies in tests - use real Hyperscape instances"
      echo "  • NO TODO comments - write complete production code"
      echo "  • Prefer classes over interfaces for type definitions"
      echo ""

      # Allow the edit to proceed but warn the user
      echo '{"allow": true}'
      exit 0
    fi
  else
    log "No file path provided, skipping validation"
    echo '{"allow": true}'
    exit 0
  fi
else
  # Not a file edit, allow through
  echo '{"allow": true}'
  exit 0
fi
