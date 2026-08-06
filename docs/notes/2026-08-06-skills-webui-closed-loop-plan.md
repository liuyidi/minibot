# Skills WebUI Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `/api/webui/skills` (+ detail) with WebUI types and filter unavailable skills from system-prompt always/catalog injection.

**Architecture:** Extend `SkillsRegistry` as the single source for requires/availability and webui payloads; wire list/detail routes and `build_system_prompt`.

**Tech Stack:** Python 3.11, FastAPI, pytest, PyYAML for frontmatter.

## Global Constraints

- Match WebUI `SkillSummary` / `SkillDetail` field names exactly.
- No enable/disable, marketplace, or `$skill` activation this round.
- Catalog and always injection omit unavailable skills; list API still returns them with `available: false`.

---

## File map

| File | Role |
|------|------|
| `minibot/src/minibot/agent/skills.py` | requires, availability, webui payloads, filtered always/catalog |
| `minibot/src/minibot/api/routes/misc.py` | list payload + `GET /api/webui/skills/{name}` |
| `minibot/src/minibot/agent/context.py` | already uses registry; pick up filtered helpers |
| `minibot/pyproject.toml` | declare `pyyaml` dependency |
| `minibot/tests/test_skills_webui_closed_loop.py` | new API + registry + prompt tests |
| `minibot/tests/test_memory_skills_phase3b.py` | adjust if always/catalog expectations change |

---

### Task 1: Registry availability + webui serialization (TDD)

- [ ] Write failing tests for requires / available / webui_summary / webui_detail / always+catalog filter
- [ ] Implement in `skills.py` (YAML frontmatter; bins via `shutil.which`; env via `os.environ`)
- [ ] Make tests pass; add `pyyaml` to `pyproject.toml` if imported
- [ ] Commit

### Task 2: HTTP routes

- [ ] Write failing API tests: list has `available`; detail 200/404; `raw_markdown`
- [ ] Implement `GET /api/webui/skills/{name}`; change list to webui-shaped payload
- [ ] Pass tests; commit

### Task 3: Prompt path + docs note

- [ ] Confirm `build_system_prompt` uses filtered always/catalog (fix registry methods)
- [ ] Update `docs/notes/webui-surface-priority.md` Skills row to done
- [ ] Run focused pytest; commit
