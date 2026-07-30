# 程小帮对齐路线图（Chengxiaobang Parity Roadmap）

> 生成日期：2026-07-26  
> 目标：把 chengxiaobang（TS/Bun 桌面 agent）已具备的核心能力按 phase 移植/对齐到 minibot（Python/FastAPI），语言与运行时保持不变；只对齐**功能语义**，不复制 TS 代码。

## 1. 结论

minibot 当前形态是"OpenAI-compat 单栈的极小 ReAct + 单文件 memory + MCP preset + 基础工具集"。程小帮在此之上多了：审批体系、file-change 追踪、SQLite 化 session、全局 SSE、按 token 压缩、多 provider、定时任务、subagent、goal、类型化 memory、slash 命令分层、MCP OAuth、插件、技能市场、专家、项目授信、知识库/图像/OCR/计算机操控/知识库/日志分片/更新迁移。

本路线图**不覆盖**桌面端才需要的能力（Electron 主进程、计算机操控、UBT/Sentry、订阅/edition、企业 MCD 更新、门户市场代理、知识库服务端接入）。这些只在必要时再单独立项。

## 2. 分层与优先级

三档 P0/P1/P2，前置依赖越靠前越硬：

- **P0 基础短板**：不做审批/持久化/SSE 就永远只能当 demo。
- **P1 从对话工具到任务助手**：cron + subagent + goal + memory 升级 + slash 分层。
- **P2 生态与集成**：MCP OAuth、插件、技能市场、专家、项目授信。

不属于对齐目标（明确 out-of-scope）：computer-use、知识库服务端、UBT、edition、桌面更新、门户市场服务端代理、Feishu/Lark CLI 深度集成。

## 3. Phase 一览

> **能力抽象层总纲**：`plans/2026-07-26-abstractions-plugin-skill-slash-expert.md` + `specs/2026-07-26-abstractions-plugin-skill-slash-expert-design.md`。它统筹 P1-A / P1-11 / P2-12 / P2-13 / P2-15 五个 phase，把 Skill / Slash / MCP / Plugin / Expert 说清楚并锁死跨 phase 的公共接口——**开工前必读**。

| Phase | 主题 | 对齐 chengxiaobang 模块 | Plan 文档 | Spec 文档 |
|---|---|---|---|---|
| P0-1 | Approval Queue + Policy + Smart Approval | `approval-policy.ts`, `approval-queue.ts`, `smart-approval.ts` | `plans/2026-07-26-p0-1-approval-system.md` | `specs/2026-07-26-p0-1-approval-system-design.md` |
| P0-2 | File-change 追踪 + Revert | `tools/file-change.ts`, `file-change-revert.ts` | `plans/2026-07-26-p0-2-file-change-revert.md` | `specs/2026-07-26-p0-2-file-change-revert-design.md` |
| P0-3 | Session 存储 → SQLite（payload 分列） | `apps/backend/src/repository/*`（sql.js） | `plans/2026-07-26-p0-3-sqlite-sessions.md` | `specs/2026-07-26-p0-3-sqlite-sessions-design.md` |
| P0-4 | Global SSE Event Stream | `agent/pi-events.ts`, `api/routes/runs.ts`, `docs/global-sse-event-stream.md` | `plans/2026-07-26-p0-4-global-sse.md` | `specs/2026-07-26-p0-4-global-sse-design.md` |
| P0-5 | Compaction 升级（token + micro） | `agent/compaction.ts`, `micro-compact.ts`, `context-usage.ts` | `plans/2026-07-26-p0-5-compaction.md` | `specs/2026-07-26-p0-5-compaction-design.md` |
| P0-6 | Provider 多后端（Anthropic / Azure / Bedrock） | `providers/*`（nanobot 版） | `plans/2026-07-26-p0-6-multi-providers.md` | `specs/2026-07-26-p0-6-multi-providers-design.md` |
| **P1-A** | **Skills 升级为一等公民**（清单注入 + skill() 工具 + 多来源） | `agent/system-reminders.ts` 的 ModelVisibleSkill；nanobot `skills.py` | `plans/2026-07-26-p1-a-skills-first-class.md` | `specs/2026-07-26-p1-a-skills-first-class-design.md` |
| P1-7 | Cron / 定时任务 | `tasks/*`, `tools/schedule-tools.ts`, `docs/scheduled-tasks.md` | `plans/2026-07-26-p1-7-cron.md` | `specs/2026-07-26-p1-7-cron-design.md` |
| P1-8 | Subagent (Task 工具) | `agent/subagent-definitions.ts`, `tools/subagent-tools.ts`, `docs/subagents.md` | `plans/2026-07-26-p1-8-subagent.md` | `specs/2026-07-26-p1-8-subagent-design.md` |
| P1-9 | Goal（会话长期目标 + 自动续跑） | `goals/*`, `tools/goal-tools.ts`, `docs/goal.md` | `plans/2026-07-26-p1-9-goal.md` | `specs/2026-07-26-p1-9-goal-design.md` |
| P1-10 | Memory 多文件 + 类型化 | `tools/memory-tools.ts`, `docs/memory.md` | `plans/2026-07-26-p1-10-memory.md` | `specs/2026-07-26-p1-10-memory-design.md` |
| P1-11 | Todo / Plan / Slash 分层（多来源加载） | `tools/todo-tools.ts`, `plan-tools.ts`, `slash-command-service.ts` | `plans/2026-07-26-p1-11-slash-layering.md` | `specs/2026-07-26-p1-11-slash-layering-design.md` |
| P2-12 | MCP 增强（OAuth + 变量替换 + 插件声明 + overlay） | `mcp/*`, `mcp/oauth/*` | `plans/2026-07-26-p2-12-mcp-enhance.md` | `specs/2026-07-26-p2-12-mcp-enhance-design.md` |
| P2-13 | Plugin 系统（打包 + 生命周期） | `tools/plugin-service.ts`, `plugin-commands.ts` | `plans/2026-07-26-p2-13-plugins.md` | `specs/2026-07-26-p2-13-plugins-design.md` |
| P2-14 | Skill Market（本地/远程镜像） | `tools/skill-market-service.ts` | `plans/2026-07-26-p2-14-skill-market.md` | `specs/2026-07-26-p2-14-skill-market-design.md` |
| P2-15 | Expert（会话级 overlay + systemPrompt） | `experts/*`, `docs/expert.md` | `plans/2026-07-26-p2-15-expert.md` | `specs/2026-07-26-p2-15-expert-design.md` |
| P2-16 | Project + CLAUDE.md + Trust | `agent/project-instructions.ts`, `project-approval-trust.ts`, `tools/project-tools.ts` | `plans/2026-07-26-p2-16-project-trust.md` | `specs/2026-07-26-p2-16-project-trust-design.md` |

## 4. 依赖关系图

```
P0-3 SQLite ──┬─> P0-4 Global SSE ──> P1-7 Cron ──> P1-9 Goal
              │                              │
              ├─> P1-8 Subagent ─────────────┤
              │                              │
              └─> P0-1 Approval ─────────────┴─> P1-11 Slash 分层
P0-2 File-change ──> P0-1 Approval（联动）
P0-5 Compaction 独立
P0-6 Providers 独立（可最早做）
P1-10 Memory 独立（也可尽早）

# 能力抽象层链路（Plugin/Skill/Slash/Expert 同构 overlay）
P1-A Skills 一等公民 ──┐
P1-11 Slash 多来源  ────┼─> P2-13 Plugin ──> P2-15 Expert
P2-12 MCP overlay ─────┘

P2-* 均依赖 P0/P1 大部分完成
```

**抽象层关键顺序**：`P1-A → P1-11 → P2-12 → P2-13 → P2-15`。P1-A 是这条链的第一块，把 Skill 从"简易 loader"升级到有 registry / 有 `skill()` 工具 / 有 overlay 接口的一等公民，后续 phase 都在这些接口上叠加。

## 5. 里程碑（建议节奏）

- **M1（P0 全部 + P1-A）**：完成后 minibot 具备"审批 + 持久化 + 全局事件 + 智能压缩 + 多 provider + Skill 一等公民"，成为可靠的对话内核，并锁定 Skill overlay 接口。
- **M2（P1 全部 + P1-11 多来源 slash）**：完成后 minibot 变身"任务助手"：能定时、能派生子任务、能长期目标续跑、能长期记忆、有分层 slash。
- **M3（P2 全部）**：完成后 minibot 具备"生态可扩展"：MCP OAuth/插件/技能市场/专家/项目授信。整个 Plugin/Skill/Slash/Expert 抽象体系落地完毕。

M1 是必须；M2 决定产品体验；M3 决定生态。

## 6. 通用交付约定

每个 phase 必须产出：

1. `specs/<date>-<phase>-<name>-design.md`——设计文档（数据模型、接口契约、状态机、错误路径、迁移策略）；
2. `plans/<date>-<phase>-<name>.md`——分 Task 的实现清单（每 Task 一组 `- [ ]` 步骤 + 文件清单 + 测试项）；
3. 单元测试放在 `tests/`，收工前 `pytest -q` 全绿；
4. Runner 合同（handle_turn）不变，能力以**工具或后台服务**形式接入；
5. 无 breaking：改动优先增字段、增路由；旧字段兼容一个 phase。

## 7. 快速索引

- 现状基线：`docs-plan/minibot-current-status.md`（在 nanobot 仓）
- Chengxiaobang 关键文档（阅读顺序）：
  1. `apps/backend/src/agent/agent-runner.ts` —— 主 loop 与事件翻译
  2. `docs/architecture.md` —— 三层架构
  3. `docs/scheduled-tasks.md` / `docs/goal.md` / `docs/subagents.md` / `docs/memory.md`
  4. `docs/global-sse-event-stream.md` / `docs/context-compaction.md`
  5. `docs/portal-market.md` / `docs/expert.md`（P2 阶段再看）

## 8. 独立平台产品（不属于 minibot 对齐，独立立项）

**minikb（知识库平台）**：与 minibot 并列的独立后端服务；minibot 侧只做"库列表 + 检索测试 + 工具调用"，核心平台能力（原始文档、切片、检索、QA、评估、多数据源、代码沙箱等）在 minikb 独立仓/子目录实现。

- 总设计：`specs/2026-07-26-minikb-platform-design.md`
- 实施计划：`plans/2026-07-26-minikb-platform.md`（KB-P0..P8）
- minibot 集成层：`specs/2026-07-26-minikb-integration-design.md` + `plans/2026-07-26-minikb-integration.md`（对应 KB-P7）

与本 roadmap 的耦合：只在 P2-13 Plugin 落地后打包为 `knowledge-base` 内置插件；可与 P2-15 Expert 组合成 `kb-researcher` 专家。
