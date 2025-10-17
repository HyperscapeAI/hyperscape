---
description: Store an explicit memory for future sessions using mem0.ai integration
---

# Remember Command

Store an explicit memory that you want Claude to remember for future sessions.

## Task

You are helping the user create an explicit memory that will be stored in mem0.ai for future reference.

### What to Do

1. **Ask the user what they want to remember** if no argument was provided
2. **Format the memory clearly and specifically**
3. **Store it using the mem0-hook.sh script**
4. **Confirm the memory was stored**

### Examples

**User says:** `/remember The authentication uses Privy with JWT tokens, never store passwords`

**You respond:**
```
Storing memory: "The authentication uses Privy with JWT tokens, never store passwords"

✓ Memory stored successfully

This will now be available in future sessions when working on authentication-related code.
```

**User says:** `/remember`

**You respond:**
```
What would you like me to remember?

Examples:
• Technical decisions ("We chose SQLite over PostgreSQL for easier deployment")
• Important patterns ("Always use non-null assertions for ECS component access")
• Gotchas ("The InteractionSystem must run before InventorySystem")
• Project context ("Client uses Vite dev server on port 5173")
• Team preferences ("Prefer classes over interfaces for type definitions")

Please tell me what you'd like to remember.
```

### Memory Categories

Good things to remember:

**Technical Decisions:**
- Why specific technologies were chosen
- Trade-offs that were considered
- Performance considerations

**Code Patterns:**
- Preferred coding styles
- Common patterns to use
- Patterns to avoid

**Project Structure:**
- How packages are organized
- Where to find specific functionality
- Integration points

**Workflows:**
- How to test features
- Deployment processes
- Common commands

**Important Context:**
- Business logic rules
- Domain knowledge
- User preferences

### Storage Process

Store the memory by running:

```bash
echo '{
  "hookEvent": "UserPromptSubmit",
  "userPrompt": "{user_memory_text}"
}' | .claude/mem0-hook.sh
```

### Output Format

After storing, respond with:

```
📝 Memory Stored

"{memory_text}"

Category: {inferred_category}
Relevance: {when_this_will_be_useful}

This memory will be retrieved automatically when:
• Working on {relevant_files_or_systems}
• Discussing {relevant_topics}
• Making changes to {relevant_areas}

Total memories in your store: {approximate_count}
```

## Usage

With argument:
```bash
/remember The CombatSystem damage calculation uses player.attack * weapon.damage / target.defense
```

Without argument (interactive):
```bash
/remember
```

## Important Notes

- Memories are user-specific (tied to git email)
- Be specific - vague memories aren't helpful
- Include context about when/why this matters
- Reference specific files or systems when relevant
- Use clear, searchable language
- One concept per memory (don't combine unrelated things)

## Advanced Usage

**Remember with category:**
```
/remember [PERFORMANCE] The InventorySystem uses Map instead of Array for O(1) lookups
```

**Remember with tags:**
```
/remember #testing #playwright All tests must use real Hyperscape instances, no mocks allowed
```

**Remember with reference:**
```
/remember (packages/shared/src/systems/CombatSystem.ts:45) Critical: damage calculation must clamp to 0-9999 range
```
