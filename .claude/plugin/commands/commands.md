# Hyperscape Development Commands

This plugin provides the following commands for Hyperscape development workflow:

## Available Commands

### /memorize
Stores important information to persistent memory using mem0.ai integration.

**Usage:** `/memorize <information to remember>`

**Example:** `/memorize The InteractionSystem uses a radius of 2 units for woodcutting`

See [memorize.md](./memorize.md) for full documentation.

---

### /remember
Retrieves relevant information from persistent memory based on a query.

**Usage:** `/remember <query>`

**Example:** `/remember how does woodcutting work?`

See [remember.md](./remember.md) for full documentation.

---

### /update-rules
Updates and validates development rules against .cursor/rules/ directory structure.

**Usage:** `/update-rules`

See [update-rules.md](./update-rules.md) for full documentation.

---

## Quick Reference

| Command | Purpose | Example |
|---------|---------|---------|
| `/memorize` | Store information | `/memorize Player inventory capacity is 28 slots` |
| `/remember` | Retrieve information | `/remember what is the inventory capacity?` |
| `/update-rules` | Validate rules | `/update-rules` |

## Getting Help

For detailed information about each command, refer to the individual command files in this directory or use the command name followed by `--help`.
