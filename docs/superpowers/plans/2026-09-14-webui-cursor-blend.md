# CursorBlend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `<CursorBlend>` wrapper that shows a DeepSeek-style difference-blend cursor circle over marked text, wired to the ThreadShell empty hero.

**Architecture:** Module-singleton `cursorBlendRuntime` (ref-count, canvas on `document.body`, rAF lerp). React `CursorBlend` sets `data-cursor="blend"` and acquire/release. Styles live on the canvas element, not in `globals.css`.

**Tech Stack:** React 18+, TypeScript, Vitest + Testing Library, Canvas 2D

## Global Constraints

- Directory: `webui/src/components/effects/cursor-blend/`
- No `globals.css` changes
- Disable on `prefers-reduced-motion: reduce` or `pointer: coarse`
- Canvas: fixed fullscreen, `pointer-events: none`, `mix-blend-mode: difference`, white circle radius 32
- Do not commit unless the user asks (user rule overrides plan commit steps)

---

### Task 1: Runtime + CursorBlend + tests

**Files:**
- Create: `webui/src/components/effects/cursor-blend/cursorBlendRuntime.ts`
- Create: `webui/src/components/effects/cursor-blend/CursorBlend.tsx`
- Create: `webui/src/components/effects/cursor-blend/index.ts`
- Test: `webui/src/tests/cursor-blend.test.tsx`

**Interfaces:**
- Produces: `acquire(): void`, `release(): void`, `__resetCursorBlendRuntimeForTests(): void`, `CursorBlend` component

- [ ] **Step 1: Write failing tests** in `cursor-blend.test.tsx` covering: `data-cursor="blend"`, single canvas for two mounts, canvas removed on last unmount, reduced-motion skips canvas
- [ ] **Step 2: Run** `cd webui && npm test -- --run src/tests/cursor-blend.test.tsx` — expect FAIL
- [ ] **Step 3: Implement runtime + component**
- [ ] **Step 4: Re-run tests — expect PASS**

### Task 2: Wire ThreadShell hero

**Files:**
- Modify: `webui/src/components/thread/ThreadShell.tsx` (empty-state `h1`)

- [ ] **Step 1: Replace `h1` with `<CursorBlend as="h1" className=...>`**
- [ ] **Step 2: Run** `cd webui && npm test -- --run src/tests/thread-shell.test.tsx src/tests/cursor-blend.test.tsx` — expect PASS

## Spec coverage

| Spec item | Task |
|-----------|------|
| CursorBlend API / polymorphic `as` | 1 |
| Singleton canvas + ref-count | 1 |
| Styles colocated | 1 |
| reduced-motion / coarse pointer | 1 |
| ThreadShell hero | 2 |
| Vitest behavior tests | 1 |
