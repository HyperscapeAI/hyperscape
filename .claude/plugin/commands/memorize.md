---
description: Analyze codebase and store comprehensive memory notes about project structure, systems, and patterns
---

<!-- 
  CANONICAL LOCATION: This is the authoritative version used by the Claude plugin.
  Any duplicate at .claude/commands/memorize.md is a symlink/pointer to this file.
-->

# Memorize Command

Analyze the codebase and create comprehensive memory notes about the project structure, systems, patterns, and recent changes.

## Task

You are going to create detailed memories about the Hyperscape project by analyzing the codebase systematically. Follow these steps:

### 1. Analyze Project Structure

First, examine the monorepo structure:
- Review all packages in `packages/`
- Identify key systems in `packages/shared/src/systems/`
- Check recent git commits with `git log --oneline -20`
- Look at modified files in git status

### 2. Create Memories for Each Area

Store memories about:

**Architecture & Structure:**
- Monorepo organization (9 packages)
- Package purposes and dependencies
- Key directories and their roles

**Systems & Components:**
- ECS systems in packages/shared/src/systems/
- Client-side systems and UI
- Server-side systems and networking
- Each system's purpose and data flow

**Recent Work:**
- Recent commits and what they changed
- Current branch and work in progress
- Files that were recently modified
- Bugs fixed and features added

**Development Patterns:**
- TypeScript patterns used
- Testing approaches with Playwright
- Common code patterns
- Integration points between packages

**Technical Decisions:**
- Why certain technologies were chosen
- Architecture decisions (ECS, Three.js, SQLite)
- Performance considerations
- Security patterns (Privy auth)

### 3. Store Memories

For each important piece of information, create a memory by running:

```bash
.claude/mem0-hook.sh
```

With input like:
```json
{
  "hookEvent": "UserPromptSubmit",
  "userPrompt": "The InventorySystem in packages/shared/src/systems/ handles item management, uses Map<playerId, Item[]> for storage, and integrates with the UI through ItemSlot components"
}
```

### 4. Memory Categories

Create memories in these categories:

**Systems** (one memory per system):
- CombatSystem - How combat works
- InventorySystem - Item management
- InteractionSystem - Player interactions
- WoodcuttingSystem - Resource gathering
- NPCSystem - NPC behavior

**Packages** (one memory per package):
- @hyperscape/client - Frontend, Vite, React, Three.js
- @hyperscape/server - Backend, WebSocket, SQLite
- @hyperscape/shared - ECS systems, shared logic
- @elizaos/plugin-hyperscape - AI agent integration

**Technical Stack**:
- Three.js for 3D rendering
- Hyperscape ECS engine
- Playwright for testing
- SQLite for persistence
- Privy for authentication

**Development Guidelines**:
- No 'any' types allowed
- No mocks in tests - use real Hyperscape
- Every feature needs tests
- Types shared from packages/shared

**Current Work**:
- Branch: {current_branch}
- Recent changes: {recent_commits}
- Work in progress: {modified_files}

### 5. Output Format

After analyzing and storing memories, provide a summary:

```
📝 MEMORIES CREATED

Architecture:
✓ Monorepo structure with 9 packages
✓ Client-server architecture with shared logic
✓ ECS pattern for game systems

Systems Documented:
✓ InventorySystem - Item management
✓ CombatSystem - Player combat mechanics
✓ WoodcuttingSystem - Resource gathering
✓ InteractionSystem - World interactions
✓ NPCSystem - NPC behavior

Tech Stack:
✓ Three.js 3D rendering
✓ Hyperscape ECS engine
✓ Playwright testing
✓ SQLite persistence

Recent Work:
✓ {branch_name} - {recent_work_summary}

Total memories created: {count}
```

## Important Notes

- Be thorough - create 20-30 detailed memories
- Each memory should be specific and actionable
- Focus on "why" not just "what"
- Include context about decisions made
- Reference specific file paths
- Note integration points between systems
- Document any gotchas or tricky areas

## Usage

```bash
/memorize
```

This will trigger Claude to analyze the codebase and create comprehensive memories about the project.
