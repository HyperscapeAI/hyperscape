# Hyperscape Dev Plugin

A comprehensive Claude Code plugin for Hyperscape monorepo development with intelligent context awareness, persistent memory, and automated rule validation.

## Features

### 🧠 Context Awareness (PreToolUse)
Before every edit, write, or task, the plugin:
- **Retrieves relevant memories** from previous sessions via mem0.ai
- **Maps monorepo structure** showing all 9 packages and their purposes
- **Finds related files** including type definitions, tests, and imports
- **Provides contextual guidance** specific to the file type (System, Test, Shared package)
- **Shows cross-package dependencies** to prevent breaking changes

### 💾 Memory Integration (mem0.ai)
Persistent conversation memory that:
- **Stores context** on every prompt submission
- **Searches memories** before providing assistance
- **Maintains history** across multiple Claude Code sessions
- **Identifies users** by git email for personal memory storage
- **Provides relevant context** automatically at session start

### ✅ Rule Validation (PostToolUse)
After every file edit, automatically validates:
- **TypeScript strong typing** - No `any` types, prefer classes over interfaces
- **Test requirements** - No mocks/spies, must use Playwright
- **Code quality** - No TODOs, complete production code only
- **General standards** - All rules from `.cursor/rules/`

### 🎯 Slash Commands
Three powerful commands for memory management:

- **`/memorize`** - Automatically analyze codebase and create 20-30 comprehensive memories
  - Scans all systems, packages, and recent changes
  - Creates categorized memories about architecture, patterns, and decisions
  - Perfect for onboarding or after major refactors

- **`/remember <text>`** - Store an explicit memory for future reference
  - Quick way to capture important decisions
  - Add context about patterns, gotchas, or preferences
  - Memories persist across all sessions

- **`/update-rules`** - Sync `.cursor/rules/` with stored memories
  - Analyzes all memories and updates existing rules
  - Creates new rule files for discovered patterns
  - Keeps documentation in sync with actual practices
  - Living documentation that evolves with the project

## Installation

### Using Claude Code Plugin Command

```bash
# From within the Hyperscape directory
/plugin install local
```

### Manual Installation

1. Ensure you have the `.claude/plugin/` directory in your project root
2. Add the mem0.ai API key to your `.env` file:
   ```bash
   MEM0_API_KEY=your-api-key-here
   ```
3. Configure permissions in `.claude/settings.local.json`

## Plugin Structure

```
.claude/
├── plugin/
│   ├── plugin.json      # Plugin metadata and configuration
│   ├── hooks/
│   │   └── hooks.json   # Hook event mappings
│   ├── README.md        # This file
│   └── CHANGELOG.md     # Version history
├── context-hook.sh      # PreToolUse: Context awareness
├── mem0-hook.sh         # UserPromptSubmit/SessionEnd/Stop: Memory
├── validate-hook.sh     # PostToolUse: Rule validation
└── settings.json        # Project hook configuration
```

## How It Works

### Hook Execution Flow

1. **User submits prompt** → UserPromptSubmit hook
   - Searches mem0.ai for relevant memories
   - Stores new prompt for future context

2. **Before file edit** → PreToolUse hook
   - Retrieves memories related to target file
   - Shows monorepo structure and package info
   - Finds related files (types, tests, imports)
   - Provides file-type-specific guidance

3. **After file edit** → PostToolUse hook
   - Validates TypeScript typing rules
   - Checks for forbidden patterns (any, mocks, TODOs)
   - Reports violations with line numbers

4. **Session ends** → SessionEnd/Stop hooks
   - Stores session summary in mem0.ai
   - Preserves context for next session

## Example Output

### Context Awareness (Before Edit)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 RELEVANT MEMORIES FROM PREVIOUS SESSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Working on Hyperscape multiplayer game engine
• Recently fixed woodcutting and combat systems
• Using Three.js for 3D rendering
• Testing with Playwright and visual verification

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 MONOREPO STRUCTURE CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Packages in this monorepo:
  📦 @hyperscape/client
     Location: packages/client
     Purpose: Frontend 3D game client (Vite, React, Three.js)

  📦 @hyperscape/server
     Location: packages/server
     Purpose: Backend game server (Node.js, SQLite, WebSocket)

  📦 @hyperscape/shared
     Location: packages/shared
     Purpose: Shared code (ECS systems, game logic)
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 RELATED FILES IN MONOREPO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Type definitions:
  📘 packages/shared/src/types.ts
  📘 packages/server/src/types.ts

Files that might import/reference this:
  🔗 packages/shared/src/systems/SystemLoader.ts
  🔗 packages/shared/src/systems/index.ts
```

### Rule Validation (After Edit)

```
❌ VALIDATION FAILED: File contains forbidden 'any' type

Violations found:
5:function processData(data: any): any {
21:  checkPlayer(entity: any): void {

Rule: TypeScript Strong Typing - NO 'any' or 'unknown' types allowed
See: .cursor/rules/typescript-strong-typing.mdc
```

## Configuration

### Environment Variables

Required in `.env`:
```bash
MEM0_API_KEY=m0-xxxxxxxxxxxxx  # mem0.ai API key
```

### Hook Scripts Location

All hook scripts are in `.claude/`:
- `context-hook.sh` - Pre-edit context retrieval
- `mem0-hook.sh` - Memory storage/retrieval
- `validate-hook.sh` - Post-edit validation

### Permissions

Add to `.claude/settings.local.json`:
```json
{
  "permissions": {
    "allow": [
      "Bash(.claude/context-hook.sh)",
      "Bash(.claude/mem0-hook.sh)",
      "Bash(.claude/validate-hook.sh)"
    ]
  }
}
```

## Customization

### Modify Validation Rules

Edit [.claude/validate-hook.sh](../.claude/validate-hook.sh) to:
- Add new file type validations
- Customize error messages
- Change validation strictness
- Add project-specific rules

### Modify Context Retrieval

Edit [.claude/context-hook.sh](../.claude/context-hook.sh) to:
- Customize memory search queries
- Add more package context
- Change file relationship detection
- Modify guidance messages

### Modify Memory Storage

Edit [.claude/mem0-hook.sh](../.claude/mem0-hook.sh) to:
- Change what gets stored
- Adjust memory retrieval count
- Customize memory formatting
- Add memory filtering

## Cursor Rules Integration

This plugin enforces rules from `.cursor/rules/`:
- `typescript-strong-typing.mdc` - Strong typing requirements
- `testing.mdc` - Real testing with Playwright
- `general.mdc` - Code quality standards
- `packages.mdc` - Monorepo package guidelines

## Requirements

- **Claude Code** >= 2.0.13 (hooks support)
- **Node.js** >= 18.0.0 (for bash scripts)
- **mem0.ai API Key** (free tier available)
- **Git** (for user identification)

## Troubleshooting

### Hooks not executing

1. Check permissions in `.claude/settings.local.json`
2. Verify hook scripts are executable: `chmod +x .claude/*.sh`
3. Check logs in stderr output

### No memories returned

1. Verify `MEM0_API_KEY` in `.env`
2. Check git email is set: `git config user.email`
3. Test API connection: `curl -H "Authorization: Token $MEM0_API_KEY" https://api.mem0.ai/v2/memories/search/`

### Validation errors

Review `.cursor/rules/` for current standards. The plugin enforces:
- No `any` types
- No mocks in tests
- Complete production code only

## Version History

See [CHANGELOG.md](CHANGELOG.md)

## License

MIT - See project root LICENSE file

## Support

For issues or questions:
- Check [.claude/README.md](../.claude/README.md) for detailed hook documentation
- Review `.cursor/rules/` for coding standards
- Report issues to the Hyperscape team

---

**Plugin Version**: 1.0.0
**Claude Code Version**: >= 2.0.13
**Last Updated**: October 16, 2025
