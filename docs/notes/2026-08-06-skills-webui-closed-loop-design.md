# Skills WebUI Closed Loop — Design

**Date:** 2026-08-06  
**Scope:** P0 “Skills 最小闭环” (option A + requires availability + prompt filter)

## Goal

Make the product WebUI Skills surface usable: list shows correct Available/Unavailable, detail opens with SKILL.md body and requirements. Keep API and system-prompt injection on one availability model.

## Non-goals

- Enable/disable persistence, delete workspace skills, skills.sh marketplace
- `$skill-name` explicit activation
- Visual redesign of Skills page / hiding the sidebar entry

## API contract (match WebUI `SkillSummary` / `SkillDetail`)

### `GET /api/webui/skills`

```json
{
  "skills": [
    {
      "name": "github",
      "description": "...",
      "source": "builtin",
      "available": false,
      "unavailable_reason": "CLI: gh"
    }
  ]
}
```

- Return **all** discovered skills (builtin + workspace overrides).
- Do not require `enabled` / `deletable` this round (UI ignores them).

### `GET /api/webui/skills/{name}`

- 200: `SkillDetail` = summary fields + `requirements` + `raw_markdown` (full SKILL.md including frontmatter).
- 404: unknown name.

`requirements`:

```json
{
  "bins": ["gh"],
  "env": ["GITHUB_TOKEN"],
  "missing_bins": ["gh"],
  "missing_env": ["GITHUB_TOKEN"]
}
```

## Availability

Parse frontmatter `requires` (YAML nested or `metadata` JSON with `nanobot` / `openclaw` payload, matching nanobot).

- `available` when `missing_bins` and `missing_env` are empty.
- `unavailable_reason` like `CLI: gh, ENV: GITHUB_TOKEN` (omit when available).

Workspace resolution for list/detail: prefer newest session workspace when present, else default workspace (current list route behavior).

## Prompt injection

Same registry helpers as API:

- Active (always) bodies: only `always && available`.
- Catalog summary: only `available` skills not already in always set; **omit** unavailable entirely.

## Architecture

Centralize in `SkillsRegistry` (`minibot/agent/skills.py`): requirements, availability, webui list/detail serialization, filtered always/catalog. Routes and `build_system_prompt` call these helpers (no duplicated which/env checks).

## Testing

- Unit: requires parsing; available true/false; catalog/always filtering.
- API: list shape; detail 200/404; `raw_markdown` present.
- Context: unavailable always skill not in `# Active Skills`.

## Success

- Skills page: no false “Unavailable” for skills without unmet requires.
- Clicking a skill loads detail (description, requirements, raw markdown).
- Prompt does not inject unavailable always skills or list them in the catalog.
