# docs-plan

Engineering roadmaps and phase plans for nanobot → minibot work. Product-facing docs stay in [`docs/`](../docs/).

> 主路线图 `minibot-fastapi-migration.md` 已升级到 **v3.4**（2026-07-24）：**Phase 1 为主线**；Composer UX 仅小插队；含学习优先、Insight UI DoD、Composer backlog。
>
> **术语提示**：本目录里出现两个 "Hermes"，指向不同对象：
> - [`hermes-harness-gap.md`](./hermes-harness-gap.md) 里的 "Hermes" = **Claude Code CLI** 内部昵称（agent harness 对标）
> - [`nous-hermes-parity.md`](./nous-hermes-parity.md) 里的 "Hermes" = **Nous Research Hermes Agent**（跨平台 self-improving agent 对标）

| Plan | Scope |
|------|--------|
| [`minibot-current-status.md`](./minibot-current-status.md) | What minibot already implements + where config lives (baseline before Phase 0) |
| [`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md) | **v3.4** — 唯一可执行主路线图；Phase 1 下一主线；Composer UX 小插队 |
| [`devui-nextjs-migration.md`](./devui-nextjs-migration.md) | **延期** — Dev UI 纯 HTML → Next.js（static export）；优先级最低 |
| [`phase-3a-context.md`](./phase-3a-context.md) | Phase 3a context 组装 + compaction（当前主线） |
| [`devui-trace-pipeline.md`](./devui-trace-pipeline.md) | Dev UI Trace 数据链路：runner 埋点 → REST/WS → localStorage → `/ui/trace.html` |
| [`phase-10-langfuse.md`](./phase-10-langfuse.md) | Phase 10 detail: Langfuse observability wired as a side-channel translator over `AgentRunResult.trace` |
| [`hermes-harness-gap.md`](./hermes-harness-gap.md) | nanobot ↔ Claude Code Harness 差距分析与 Phase H0–H10 实施计划 |
| [`nous-hermes-parity.md`](./nous-hermes-parity.md) | minibot ↔ Nous Research Hermes Agent 对标扩展 Phase 15–20（IM Gateway / FTS / 自创 Skill / Backend 抽象 / TTS / Trajectory） |
