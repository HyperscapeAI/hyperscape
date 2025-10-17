# Claude Code Hooks - Complete Integration

This directory contains Claude Code hooks configuration with three powerful integrations:
1. **Context Awareness** - Pre-edit memory retrieval and monorepo understanding
2. **mem0.ai** - Persistent conversation memory and context retrieval
3. **Rule Validation** - Automatic validation of code against Cursor rules

## Overview

### Context Awareness Hook (NEW!)

The context awareness hook runs **BEFORE** every edit/write/task and provides:
- **Memory retrieval** - Searches mem0.ai for relevant past context
- **Monorepo structure** - Shows all packages and their purposes
- **Related files** - Finds type definitions, tests, and imports
- **Contextual guidance** - Provides specific advice based on file type
- **Cross-package awareness** - Helps understand dependencies

### mem0.ai Integration

The mem0.ai integration automatically:
- **Stores conversation context** when you submit prompts
- **Retrieves relevant memories** from previous sessions
- **Maintains session history** across multiple Claude Code instances
- **Provides contextual awareness** based on your past work

### Rule Validation

The validation hook automatically:
- **Validates TypeScript files** against strong typing rules
- **Checks test files** for forbidden mocks/spies/stubs
- **Enforces code quality** standards from `.cursor/rules/`
- **Provides immediate feedback** on rule violations

## Files

- **settings.json** - Claude Code hooks configuration (commit this to repo)
- **settings.local.json** - Local permissions configuration (do not commit)
- **context-hook.sh** - Pre-edit context retrieval and monorepo awareness
- **mem0-hook.sh** - The hook script that interfaces with mem0.ai API
- **validate-hook.sh** - The hook script that validates files against rules

## Setup

### 1. API Key Configuration

The mem0.ai API key is stored in the root `.env` file:

```bash
MEM0_API_KEY=m0-1a25M3lc7JFqFyZNLKVjTJB0odXK2mRzEkyM9uiQ
```

### 2. Hook Events

The integration hooks into three Claude Code lifecycle events:

- **UserPromptSubmit** - Fires when you submit a prompt
  - Searches for relevant memories from past conversations
  - Displays relevant context at the start of the session
  - Stores the new prompt for future reference

- **SessionEnd** - Fires when a Claude Code session ends
  - Stores a summary of the session

- **Stop** - Fires when Claude Code completes a response
  - Stores completion context

### 3. User Identification

The hook uses your git email as the user ID for mem0.ai:

```bash
USER_ID=$(git config user.email)
```

This ensures your memories are personal and not shared across users.

## How It Works

### Storing Memories

When you submit a prompt, the hook:

1. Extracts your prompt text
2. Creates a conversation message pair (user + assistant)
3. Sends it to mem0.ai's v1 API endpoint
4. mem0.ai processes and stores the context

### Retrieving Memories

Before storing a new memory, the hook:

1. Searches mem0.ai's v2 API with your prompt as the query
2. Filters results by your user ID
3. Displays up to 5 relevant memories
4. Provides this context at the start of your session

Example output:
```
📝 Relevant context from memory:
• Working on Hyperscape multiplayer game engine
• Recently fixed woodcutting and combat systems
• Using Three.js for 3D rendering
• Database schema changes in progress
• Testing with Playwright and visual verification
```

## Testing

Test the integration manually:

```bash
# Test storing a memory
echo '{"hookEvent":"UserPromptSubmit","userPrompt":"I am working on feature X"}' | .claude/mem0-hook.sh

# Test retrieving memories
echo '{"hookEvent":"UserPromptSubmit","userPrompt":"What was I working on?"}' | .claude/mem0-hook.sh
```

## API Endpoints

The hook uses two mem0.ai endpoints:

### Store Memory (v1)
```bash
POST https://api.mem0.ai/v1/memories/
Authorization: Token <API_KEY>
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "user_id": "user@example.com",
  "version": "v2"
}
```

### Search Memories (v2)
```bash
POST https://api.mem0.ai/v2/memories/search/
Authorization: Token <API_KEY>
Content-Type: application/json

{
  "query": "What am I working on?",
  "filters": {
    "OR": [{"user_id": "user@example.com"}]
  }
}
```

## Troubleshooting

### Hook not running

1. Ensure the script is executable:
   ```bash
   chmod +x .claude/mem0-hook.sh
   ```

2. Check Claude Code permissions in `.claude/settings.local.json`

3. Verify the API key is set in `.env`

### No memories returned

1. Check that memories are being stored:
   ```bash
   curl --request POST \
     --url https://api.mem0.ai/v2/memories/search/ \
     --header "Authorization: Token $MEM0_API_KEY" \
     --header "Content-Type: application/json" \
     --data '{"query": "test", "filters": {"OR": [{"user_id": "your-email"}]}}'
   ```

2. Verify your user ID matches:
   ```bash
   git config user.email
   ```

### Hook errors

Check the logs in stderr output when running Claude Code. The hook logs all operations:
```
[mem0-hook] User prompt submitted: ...
[mem0-hook] Searching memories for user: ...
[mem0-hook] Storing memory for user: ...
```

## Privacy & Security

- Memories are stored per user (identified by git email)
- API key should be kept secure in `.env` (not committed)
- All communication uses HTTPS
- Memories are stored on mem0.ai's servers
- You can delete memories through mem0.ai's API or dashboard

---

# Rule Validation Hook

The validation hook (`validate-hook.sh`) automatically checks your code against the project's Cursor rules after every file edit.

## What Gets Validated

### TypeScript Files (.ts, .tsx)

✅ **Checks for:**
- ❌ `any` type usage (FORBIDDEN)
- ⚠️  `unknown` type usage (discouraged, use sparingly)
- ⚠️  `interface` declarations (prefer classes or type aliases)
- ⚠️  Property existence checks like `'prop' in obj` (discouraged)

**Rules enforced:**
- `.cursor/rules/typescript-strong-typing.mdc`
- Strong type assumptions over runtime checks
- Classes over interfaces for better runtime type info

### Test Files (*test.ts, *spec.ts)

✅ **Checks for:**
- ❌ Mock/spy/stub usage (FORBIDDEN: `jest.fn`, `sinon.`, `vi.fn`)
- ⚠️  Missing Playwright usage (tests should use real browser automation)

**Rules enforced:**
- `.cursor/rules/testing.mdc`
- Real code only - no test framework abstractions
- Must use Hyperscape and Playwright for testing

### All Files

✅ **Checks for:**
- ⚠️  TODO/FIXME comments (discouraged - write complete code)
- ⚠️  Example/placeholder/temp code (discouraged)

**Rules enforced:**
- `.cursor/rules/general.mdc`
- Production code only
- No shortcuts or incomplete implementations

## Validation Output

### When validation passes:
```
[validate-hook] ✅ All validations passed for: YourFile.ts
{"allow": true}
```

### When validation fails:
```
❌ VALIDATION FAILED: File contains forbidden 'any' type

Violations found:
5:function processData(data: any): any {
21:  checkPlayer(entity: any): void {

Rule: TypeScript Strong Typing - NO 'any' or 'unknown' types allowed
See: .cursor/rules/typescript-strong-typing.mdc

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  VALIDATION WARNINGS/ERRORS DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Key rules to remember:
  • NO 'any' types - use specific types instead
  • NO mocks/spies in tests - use real Hyperscape instances
  • NO TODO comments - write complete production code
  • Prefer classes over interfaces for type definitions
```

Note: The hook still allows the edit to proceed (`{"allow": true}`) but provides immediate feedback to fix issues.

## Testing the Validation Hook

Test with a file that violates rules:

```bash
# Create a test file with violations
cat > /tmp/test-bad.ts << 'EOF'
function processData(data: any): any {
  return data;
}
EOF

# Test the validation
echo '{"toolName":"Edit","file_path":"/tmp/test-bad.ts"}' | .claude/validate-hook.sh
```

Test with a compliant file:

```bash
# Create a good test file
cat > /tmp/test-good.ts << 'EOF'
import type { Player } from './types';

function processPlayer(player: Player): Player {
  return player;
}
EOF

# Test the validation
echo '{"toolName":"Edit","file_path":"/tmp/test-good.ts"}' | .claude/validate-hook.sh
```

## Customizing Validation Rules

Edit [validate-hook.sh](validate-hook.sh) to:
- Add new file type validations
- Customize error messages
- Add project-specific rules
- Change validation strictness

The validation logic reads rules from `.cursor/rules/`:
- `typescript-strong-typing.mdc` - TypeScript rules
- `testing.mdc` - Test file rules
- `general.mdc` - General coding standards

## Hook Configuration

The validation hook is configured in `settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/validate-hook.sh"
          }
        ]
      }
    ]
  }
}
```

This runs validation after every Edit, Write, or NotebookEdit operation.

---

## Advanced Configuration

### Customize memory storage

Edit [mem0-hook.sh](mem0-hook.sh) to customize:
- What context gets stored
- When memories are created
- How many memories are retrieved
- Memory formatting and display

### Add more hook events

Available Claude Code hook events:
- `PreToolUse` - Before any tool is called
- `PostToolUse` - After any tool completes
- `UserPromptSubmit` - When user submits a prompt
- `Notification` - When Claude sends a notification
- `Stop` - When Claude completes a response
- `SubagentStop` - When a subagent completes
- `SessionStart` - When a session begins
- `SessionEnd` - When a session ends

Edit `settings.json` to add more hooks.

## Resources

- [Claude Code Hooks Documentation](https://docs.claude.com/en/docs/claude-code/hooks-guide)
- [mem0.ai API Documentation](https://docs.mem0.ai)
- [GitButler's Claude Code Hooks Guide](https://blog.gitbutler.com/automate-your-ai-workflows-with-claude-code-hooks)

## Contributing

To improve this integration:

1. Test thoroughly with real conversations
2. Add error handling for network failures
3. Implement memory cleanup/archival
4. Add memory importance scoring
5. Create a dashboard for viewing stored memories

---

**Last Updated**: October 16, 2025
**mem0.ai API Version**: v1 (store), v2 (search)
**Claude Code Version**: 1.7+ (hooks support)
