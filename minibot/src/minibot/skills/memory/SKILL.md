---
name: memory
description: Long-term memory via memory/MEMORY.md and read_memory / write_memory tools. Dream may also consolidate MEMORY.md periodically.
always: true
---

# Memory

## Files

- `memory/MEMORY.md` — durable facts (user preferences, project context, decisions).
- `SOUL.md` / `USER.md` / `AGENTS.md` — workspace identity (edit with file tools when the user asks).

## Tools

- `read_memory` — load MEMORY.md
- `write_memory(content, mode="replace"|"append")` — update MEMORY.md

## When to write

Persist durable facts the user wants remembered across sessions (names, prefs, recurring constraints).
Do **not** dump full chat transcripts into MEMORY.md.

## Dream

minibot may run a periodic Dream consolidation pass that also updates MEMORY.md via `write_memory`. Prefer concise durable bullets; Dream will merge later if needed.
