---
description: Update workspace Cursor rules based on development patterns and decisions
---

<!-- 
  CANONICAL LOCATION: This is the authoritative version used by the Claude plugin.
  Any duplicate at .claude/commands/update-rules.md is a symlink/pointer to this file.
-->

# Update Rules Command

Analyze stored memories and automatically update or create rules in `.cursor/rules/` to reflect learned patterns, decisions, and best practices.

## Task

You are going to retrieve all stored memories and use them to update the project's development rules in `.cursor/rules/`. This ensures that rules stay synchronized with the team's actual practices and decisions.

### Process

#### 1. Retrieve All Memories

Search mem0.ai for all relevant memories:

```bash
curl --request POST \
  --url https://api.mem0.ai/v2/memories/search/ \
  --header "Authorization: Token $MEM0_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "query": "hyperscape development patterns decisions rules",
    "filters": {
      "OR": [
        { "user_id": "'$(git config user.email)'" }
      ]
    },
    "limit": 100
  }'
```

#### 2. Categorize Memories

Group memories into categories:

**TypeScript Patterns:**
- Type definitions and usage
- Preferred patterns (classes vs interfaces)
- Type safety requirements

**Testing Standards:**
- Test frameworks and approaches
- Visual testing requirements
- Coverage expectations

**Architecture Decisions:**
- System design patterns
- Package organization
- Integration patterns

**Code Quality:**
- Naming conventions
- Documentation standards
- Performance guidelines

**Project-Specific:**
- Domain rules
- Business logic constraints
- Technical constraints

#### 3. Update Existing Rules

For each rule file in `.cursor/rules/`, analyze if memories suggest updates:

**typescript-strong-typing.mdc:**
- Add specific type patterns from memories
- Document common type definitions
- Update forbidden patterns

**testing.mdc:**
- Add project-specific test patterns
- Document visual testing proxies
- Update test requirements

**general.mdc:**
- Add workflow improvements
- Document common gotchas
- Update file organization rules

**Existing custom rules:**
- Enhance with learned patterns
- Add examples from actual code
- Update based on recent decisions

#### 4. Create New Rules

If memories reveal new patterns not covered by existing rules, create new rule files:

**{system-name}.mdc** - For specific systems:
```markdown
---
globs: packages/shared/src/systems/{SystemName}.ts
---
# {SystemName} Development Rules

## Purpose
{what_this_system_does}

## Key Patterns
{patterns_from_memories}

## Common Gotchas
{problems_encountered}

## Examples
{code_examples_from_memories}
```

**{package-name}.mdc** - For specific packages:
```markdown
---
globs: packages/{package-name}/**/*.ts
---
# {Package Name} Guidelines

## Package Purpose
{package_purpose}

## Key Dependencies
{dependencies_from_memories}

## Development Patterns
{patterns_specific_to_package}
```

#### 5. Rule Update Format

When updating rules, follow this format:

```markdown
---
alwaysApply: true
globs: {file_patterns}
---
# Rule Title

## Core Principles

### 1. {Principle from memories}
- {Details}
- {Examples}
- {Rationale}

## Learned Patterns

{patterns_extracted_from_memories}

## Common Mistakes

{gotchas_from_memories}

## Examples

### Good Examples
\`\`\`typescript
{example_from_actual_code}
\`\`\`

### Bad Examples
\`\`\`typescript
{anti_pattern_from_memories}
\`\`\`

## References
- Memory: "{memory_quote}"
- Source: {file_path_if_available}
- Date: {when_pattern_was_established}
```

#### 6. Output Summary

After updating rules, provide:

```
📋 RULES UPDATED FROM MEMORIES

Updated Existing Rules:
✓ typescript-strong-typing.mdc
  • Added pattern: {pattern}
  • Updated section: {section}
  • Based on {count} memories

✓ testing.mdc
  • Added: Visual testing proxy colors
  • Updated: Test requirements
  • Based on {count} memories

Created New Rules:
✓ combat-system.mdc
  • Covers: Combat damage calculations
  • Based on {count} memories
  • Applies to: packages/shared/src/systems/CombatSystem.ts

✓ inventory-patterns.mdc
  • Covers: Item management patterns
  • Based on {count} memories
  • Applies to: **/Inventory*.ts

Memory Insights Applied:
• {insight_1}
• {insight_2}
• {insight_3}

Total memories analyzed: {count}
Rules updated: {count}
Rules created: {count}
```

### Memory-to-Rule Mapping

**Decision memories** → Architecture rules
- "We chose X because Y" → Document in relevant rule

**Pattern memories** → Code pattern rules
- "Always use X for Y" → Add to pattern section

**Gotcha memories** → Warning sections
- "Watch out for X when doing Y" → Add to gotchas

**Performance memories** → Performance rules
- "X is faster than Y" → Document optimization

**Integration memories** → Integration rules
- "X must happen before Y" → Document dependencies

### Important Considerations

**Don't:**
- Remove existing rules without good reason
- Contradict established patterns
- Add overly specific one-off rules
- Include personal preferences as hard rules

**Do:**
- Generalize patterns from memories
- Provide clear rationale
- Include concrete examples
- Reference source of pattern
- Update existing rules before creating new ones
- Keep rules actionable and specific

### Validation

After updating rules, validate:

1. **No conflicts** - New rules don't contradict existing ones
2. **Clear rationale** - Each rule has a "why"
3. **Actionable** - Rules are specific enough to follow
4. **Examples** - Include code examples where helpful
5. **Scope** - Globs target the right files

## Usage

```bash
/update-rules
```

Or with specific focus:

```bash
/update-rules testing
/update-rules typescript
/update-rules systems
```

## Example Workflow

1. Developer uses `/memorize` to document the codebase
2. Team uses `/remember` to capture decisions over weeks
3. Periodically run `/update-rules` to codify patterns
4. Rules stay in sync with actual practices
5. New team members have up-to-date guidelines

## Output Files

Updated/created files in `.cursor/rules/`:
- Existing `.mdc` files are enhanced
- New `.mdc` files for specific patterns
- Each file includes memory references
- Clear examples from actual code

This creates a living documentation system where rules evolve with the project.
