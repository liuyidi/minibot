# nanobot ↔ Hermes / Claude Code Harness — 差距与实施计划

> **落盘路径：** [`docs-plan/hermes-harness-gap.md`](./hermes-harness-gap.md)
> **范围：** 面向"把 nanobot 打造成一个 Claude Code 级工程化 agent harness"的功能差距分析与分阶段落地方案。**不覆盖** IM 渠道、Pairing、Desktop、Bridge —— 那些走 [`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md)。
> **参照对象：** Anthropic 官方 Claude Code CLI 的 agent 运行时（下文简称 "Hermes"），依据是当前会话可观测到的工具集、skill 目录、systemReminder 契约与 UX 原语。
>
> 编写约定与 [`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md) 保持一致：每个 Phase 含 目标 / 子步骤 / **模块影响表** / **对核心链路影响等级** / 验收。

---

## 目录

1. [Goal](#goal)
2. [Baseline：nanobot 已具备的 harness 能力](#baselinenanobot-已具备的-harness-能力)
3. [差距总览（17 项）](#差距总览17-项)
4. [影响等级约定](#影响等级约定)
5. [实施 Phase](#实施-phase)
   - [Phase H0 — 权限模型 + settings.json](#phase-h0--权限模型--settingsjson)
   - [Phase H1 — Plan Mode](#phase-h1--plan-mode)
   - [Phase H2 — Workflow 编排 + Structured Output](#phase-h2--workflow-编排--structured-output)
   - [Phase H3 — Worktree 隔离 + Subagent Isolation](#phase-h3--worktree-隔离--subagent-isolation)
   - [Phase H4 — 用户可声明式 Hooks](#phase-h4--用户可声明式-hooks)
   - [Phase H5 — Skills 懒加载协议](#phase-h5--skills-懒加载协议)
   - [Phase H6 — TaskList / ReportFindings UX 契约](#phase-h6--tasklist--reportfindings-ux-契约)
   - [Phase H7 — Browser / Preview MCP](#phase-h7--browser--preview-mcp)
   - [Phase H8 — Session 管理套件](#phase-h8--session-管理套件)
   - [Phase H9 — Compact Protocol 与 Budget 追踪](#phase-h9--compact-protocol-与-budget-追踪)
   - [Phase H10 — NotebookEdit + 强制 Read-before-Write](#phase-h10--notebookedit--强制-read-before-write)
6. [模块影响生命周期总览](#模块影响生命周期总览)
7. [不做（Non-Goals）](#不做non-goals)
8. [执行方式建议](#执行方式建议)

---

## Goal

把 nanobot 从"聊天型 agent 框架"升级为"工程化编辑 agent harness"，缩短与 Claude Code / Hermes 的差距。**衡量口径不是"是否能调 LLM 做事"**（nanobot 已能），而是：

- **能不能让人放心把它对着一个 repo 跑写操作** —— 权限模型 / 审批 / 只读 Plan Mode
- **能不能编排多 agent 并输出可解析的结果** —— Workflow + Structured Output
- **能不能作为 IDE/Web 里的一等交互原语** —— TaskList / Findings / Plan / Preview / Session 管理
- **能不能可靠地在长 session 下工作** —— Compact 协议 / Budget / Worktree

阶段完成度按里程碑给出，不锁时间。

---

## Baseline：nanobot 已具备的 harness 能力

对照 Hermes，nanobot **底盘完整度约 65–70%**：

| 能力 | 位置 | 状态 |
|---|---|---|
| Agent 主循环 + 多轮工具调用 | [`nanobot/agent/loop.py`](../nanobot/agent/loop.py), [`runner.py`](../nanobot/agent/runner.py) | ✅ 已有（状态机 + hook + trace） |
| Provider 抽象 | [`nanobot/providers/`](../nanobot/providers/) | ✅ Anthropic / OpenAI Responses / Compat / Azure / Bedrock / Copilot / Codex / Fallback |
| MCP 集成 | [`nanobot/agent/tools/mcp.py`](../nanobot/agent/tools/mcp.py) | ✅ stdio server |
| Subagent | [`nanobot/agent/subagent.py`](../nanobot/agent/subagent.py) | ⚠️ 有，但同 CWD、无 schema、无 pipeline |
| Skills 装载 | [`nanobot/agent/skills.py`](../nanobot/agent/skills.py) + [`nanobot/skills/`](../nanobot/skills/) | ⚠️ 启动期读取到 context，非按需展开 |
| Hook 体系 | [`nanobot/agent/hook.py`](../nanobot/agent/hook.py) | ⚠️ 仅 Python 内部接口，用户不可声明式挂 |
| Memory / 会话持久化 | [`nanobot/agent/memory.py`](../nanobot/agent/memory.py) + [`nanobot/session/`](../nanobot/session/) | ✅ Dream two-phase、TTL compact |
| Sandbox | [`nanobot/agent/tools/sandbox.py`](../nanobot/agent/tools/sandbox.py) | ✅ 可插拔 |
| Cron | [`nanobot/cron/`](../nanobot/cron/), [`nanobot/agent/tools/cron.py`](../nanobot/agent/tools/cron.py) | ✅ |
| 渠道 | [`nanobot/channels/`](../nanobot/channels/) | ✅（本 plan 不动） |
| WebUI + Gateway + OpenAI 兼容 API | [`nanobot/webui/`](../nanobot/webui/), [`nanobot/api/`](../nanobot/api/) | ✅ |

---

## 差距总览（17 项）

按用户可感知程度 × 落地价值综合排序。**Phase 分配见后**。

| # | 差距 | Hermes 侧原语 | nanobot 现状 | 归属 Phase |
|---|---|---|---|---|
| 1 | 结构化权限 + 审批 UI | permission mode、allow-rule、settings.json | 仅 sandbox + pairing | **H0** |
| 2 | Plan Mode | `EnterPlanMode` / `ExitPlanMode` + plan file | 无独立"只读探索 + 审批"态 | **H1** |
| 3 | Workflow 编排 | `Workflow`：pipeline/parallel/phase/budget/journal/resume | 仅 `spawn` 单发 subagent | **H2** |
| 4 | Structured tool-response | subagent `schema` 强制 JSON Schema | 无 schema 校验层 | **H2** |
| 5 | Worktree 隔离 | `EnterWorktree` / subagent `isolation:"worktree"` | subagent 同 CWD | **H3** |
| 6 | 声明式用户 Hooks | settings.json 挂 shell 到 PreToolUse/Stop/SessionStart | Python 内部 hook，用户不可写 | **H4** |
| 7 | Skills 懒加载 | listing → `Skill` 工具装载 → `<command-name>` 标记 | 启动期塞 context | **H5** |
| 8 | Subagent 上下文屏蔽 | SUBAGENT-STOP 元规则、系统提示按角色差异化 | 无 | **H5** |
| 9 | TaskList 一等对象 | `TaskCreate` / `TaskUpdate` UI 契约 | 有 `long_task`，无轻量 TODO 面板 | **H6** |
| 10 | ReportFindings / 结构化 review 输出 | `ReportFindings` 工具契约 | 无 | **H6** |
| 11 | Browser / Preview MCP | `preview_*` 一整套 | 无 | **H7** |
| 12 | 跨 session 管理 | `list_sessions` / `search_transcripts` / `archive` / cross-session send | 单会话 | **H8** |
| 13 | Compact 协议 | 上限临近自动摘要 + harness 层协商 | 有 `autocompact.py`，无 UI 契约 | **H9** |
| 14 | Budget / cost 追踪 | `budget.spent()`、每 agent effort/model 覆写 | 无 | **H9** |
| 15 | NotebookEdit | 一等工具 | 无 | **H10** |
| 16 | Read-before-Write 强约束 | harness 强制 | `file_state.py` 是提示级 | **H10** |
| 17 | 高层 skill/workflow 封装 | `deep-research` / `code-review` / `security-review` 等 | 无对等成套 | 由 H2/H5 承载后自然衍生 |

---

## 影响等级约定

与 [`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md) 对齐：

| 等级 | 含义 |
|---|---|
| **L0** | 只加新文件 / 新工具，不改热路径 |
| **L1** | 改 `agent/tools/*` 表面或 `providers/*` 表面，`loop.py`/`runner.py` 不动 |
| **L2** | 改 `loop.py` 或 `runner.py` 的状态机 / 上下文构造 |
| **L3** | 改 `config/schema.py` 或跨模块契约（channel/webui/session 同时改） |

**约束：** L2/L3 每 Phase 至多一次，且必须先落配置骨架 + 单测再改热路径。

---

## 实施 Phase

### Phase H0 — 权限模型 + settings.json

**目标：** 让 nanobot 有"每个工具/每个路径/每条 shell 前缀"三档 allow-rule，并把决策落在配置文件里。

**为什么先做：** 是把 nanobot 放到 repo 上跑写操作的**准入前提**。后续 Plan Mode / Hooks / Workflow 都会调这一层的判决。

**子步骤：**

1. 在 [`nanobot/config/schema.py`](../nanobot/config/schema.py) 新增 `PermissionsConfig`：
   - `mode`: `plan | ask | acceptEdits | bypassPermissions`
   - `allow`: `list[str]`，形如 `Bash(git status)`、`Edit(src/**)`、`mcp__*`
   - `deny`: `list[str]`（优先级更高）
   - `askAdditions`: `list[str]`（session 内追加，落回 `~/.nanobot/settings.local.json`）
2. 新增 [`nanobot/security/permissions.py`](../nanobot/security/permissions.py)：
   - `PermissionResolver` — 输入 `(tool_name, tool_input)`，输出 `allow | deny | ask`
   - Bash 前缀匹配、Edit/Write 走 glob
3. 在 [`nanobot/agent/runner.py`](../nanobot/agent/runner.py) tool-call 前统一走 resolver；`ask` 挂到现有 `pairing` 或新 WebUI 审批通道
4. WebUI 加"Permission Approvals" 面板（`nanobot/webui/settings_api.py` 已有半个骨架）

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `config/schema.py` | 新增 `PermissionsConfig`（camelCase 别名） |
| `security/permissions.py` | 新文件 |
| `agent/runner.py` | tool-call 前判决 hook |
| `agent/tools/context.py` | 传递 resolver 决议结果 |
| `webui/settings_api.py` | 审批 REST + WS 事件 |

**热路径影响：L2**（触及 `runner.py`）

**验收：**
- `deny: ["Bash(rm *)"]` 命中时 tool call 直接短路
- `mode:"plan"` 下所有写工具返回 read-only 错误
- session 内 approval 可持久化回 `settings.local.json`
- 现有 pytest 全绿 + 至少 6 条新 permission 单测

---

### Phase H1 — Plan Mode

**目标：** 加一个新的 turn 意图态"Plan"，agent 只读探索 + 写 `plan.md` + 通过 `exit_plan_mode` 工具请求批准；批准后进入实施态。

**为什么：** Claude Code 里 Plan Mode 是最能拉齐"用户意图 ↔ agent 实施"的原语，nanobot 现在只有运行状态无意图状态。

**依赖：** Phase H0（Plan Mode 的"只读"由 permission `mode:"plan"` 兜底）。

**子步骤：**

1. 扩展 [`nanobot/agent/loop.py`](../nanobot/agent/loop.py) `TurnState`：加 `PLAN_DRAFTING` / `PLAN_AWAITING_APPROVAL` / `IMPLEMENTING`
2. 新增两个内置工具：
   - `enter_plan_mode`：切换态 + 挂上 permission `plan`
   - `exit_plan_mode`：把 plan file 路径提交给 UI 等待批准
3. WebUI 侧：Plan 审批弹窗（accept → 切 `acceptEdits`；reject → 回 draft）
4. 增加 skill [`nanobot/skills/planning/SKILL.md`](../nanobot/skills/planning/SKILL.md)，教 model "复杂/多文件/需架构决策"时先进 Plan Mode

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `agent/loop.py` | `TurnState` 扩展 + 状态转移 |
| `agent/tools/` | 新增 `plan_mode.py`（两个工具） |
| `webui/*` | Plan 审批弹窗 + REST |
| `skills/planning/` | 新 skill 目录 |

**热路径影响：L2**

**验收：**
- Plan Mode 下 `Edit/Write/apply_patch` 返回 policy 拒绝
- `exit_plan_mode` 触发 UI 审批事件；接受后 permission 自动切换
- 端到端单测：一个"多文件重构"请求跑完 draft → approve → implement

---

### Phase H2 — Workflow 编排 + Structured Output

**目标：** 提供 `Workflow` 一等原语，支持 `pipeline / parallel / phase / schema-forced output / budget / resume`。

**为什么：** subagent 目前只能单发；review / research / migration 类任务在 Hermes 靠 Workflow 拿到"扇出 + 逐 item 流水 + 结构化归并"能力，这是 harness 差距最扎眼的一项。

**依赖：** H0（Workflow 里的 tool call 也走 permission）。

**子步骤：**

1. 新增 [`nanobot/agent/workflow/`](../nanobot/agent/workflow/) 目录：
   - `engine.py`：脚本运行器（复用 `subagent.SubagentManager`）
   - `dsl.py`：`agent() / parallel() / pipeline() / phase() / log()` API
   - `journal.py`：JSONL 记录，用于 resume
   - `budget.py`：token 计数 + 硬上限
2. 在 [`nanobot/providers/base.py`](../nanobot/providers/base.py) 增加 `tool_choice.forced_json_schema` 通道；OpenAI Responses / Anthropic 侧接线
3. `SubagentManager.spawn(spec, schema=..., isolation=..., effort=..., model=...)` 接入并透传
4. 新增内置工具 `workflow_run(script_path, args)`
5. **不做** 完整 JS 脚本引擎；DSL 采用 Python，语义靠近 Hermes 版但对外发布只支持"注册型 workflow"（`nanobot/skills/workflows/*.py`）

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `agent/workflow/` | 新目录 |
| `agent/subagent.py` | `spawn` 增加 `schema/isolation/effort/model` 参数 |
| `providers/*` | 强制 JSON Schema 输出通道 |
| `agent/tools/spawn.py` | 增加 `workflow_run` 变体 |

**热路径影响：L1**（`runner.py` 不动，`subagent.py` 表面扩） **+** provider 表面 L1

**验收：**
- 三个 workflow 冒烟：`code-review` / `deep-research` / `migrate-files`
- schema forced 输出：违 schema 时自动重试
- `budget.total=200k` 超限时 `agent()` 抛异常
- 通过 `journal.jsonl` 恢复：改脚本尾部再跑，前缀命中缓存

---

### Phase H3 — Worktree 隔离 + Subagent Isolation

**目标：** subagent / workflow 里并行改文件时能自动开 git worktree，跑完自动清理。

**依赖：** H2（Workflow 引擎产生并行改动的场景）。

**子步骤：**

1. 新增 [`nanobot/agent/isolation/worktree.py`](../nanobot/agent/isolation/worktree.py)：`create/remove`，非 git 仓库回退到临时目录 + rsync
2. 在 `SubagentManager.spawn` 增加 `isolation="worktree"`：接线 CWD、`WorkspaceScope`、清理 hook
3. 新增内置工具 `enter_worktree` / `exit_worktree`（面向单 agent 交互式用）
4. 与 H0 permission 联动：worktree 内允许更宽 allow-rule

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `agent/isolation/` | 新目录 |
| `agent/subagent.py` | isolation 分支 |
| `agent/tools/` | `worktree.py` |
| `security/workspace_access.py` | 支持嵌套 scope |

**热路径影响：L1**

**验收：**
- 2 个并行 subagent 各自改同一文件不冲突
- 无改动的 worktree 自动清理
- 非 git 目录回退路径走通

---

### Phase H4 — 用户可声明式 Hooks

**目标：** 用户能在 `~/.nanobot/settings.json` 里挂 shell hook 到 `PreToolUse / PostToolUse / SessionStart / Stop / UserPromptSubmit`。

**依赖：** H0 的 settings.json 骨架。

**子步骤：**

1. 扩展 `settings.json` schema：`hooks: {eventName: [{matcher, command, timeoutMs}]}`
2. 新增 [`nanobot/agent/user_hooks.py`](../nanobot/agent/user_hooks.py)：在 `AgentHook` 上挂一层通用调度器；stdout / stderr → 反馈给 agent（`user-prompt-submit-hook` 类似 Hermes 语义）
3. runner 在既有事件点触发 hook；PreToolUse 非零退出 → 中止 tool call
4. 加安全护栏：hook 命令白名单前缀 + timeout

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `config/schema.py` | `HooksConfig` |
| `agent/user_hooks.py` | 新文件 |
| `agent/runner.py` | 事件点挂钩 |
| `agent/hook.py` | 复用 `CompositeHook` |

**热路径影响：L2**

**验收：**
- Bash tool 前挂 `ruff check` hook，失败即拦
- Stop hook 写审计日志
- Hook 超时被杀，agent 得到明确错误

---

### Phase H5 — Skills 懒加载协议

**目标：** skills 不再启动期全塞 context，而是"listing 常驻 + 按需 `Skill` 工具触发装载 + 装载后打 `<command-name>` 标记"。同时给 subagent 一套隔离的 skill 集。

**子步骤：**

1. [`nanobot/agent/skills.py`](../nanobot/agent/skills.py) 拆两层：`SkillIndex`（只读元数据） + `SkillLoader`（按 slug 展开正文）
2. 新增内置工具 `skill(name, args?)`：展开 skill 正文进 context 并注入 `<command-name>` 系统提示
3. Subagent 侧：默认 skill 集 = 空 + 白名单参数；对齐 Hermes `SUBAGENT-STOP` 语义
4. Skill frontmatter 支持 `whenToUse`、`type: rigid|flexible`
5. 迁移现有 [`nanobot/skills/`](../nanobot/skills/) 目录使其符合新协议

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `agent/skills.py` | 拆分 + 懒加载 |
| `agent/tools/` | `skill.py` 新工具 |
| `agent/subagent.py` | skill 白名单参数 |
| `skills/*/SKILL.md` | frontmatter 迁移 |

**热路径影响：L2**（改 `context.py` 装配路径）

**验收：**
- 冷启动 system prompt 体积下降 ≥60%
- 调 `skill("planning")` 后模型能看到正文
- Subagent 默认看不到未白名单 skill

---

### Phase H6 — TaskList / ReportFindings UX 契约

**目标：** 落地 harness 层的**结构化 UX 原语**：TaskList（`create/update/list/get`）、Findings（review 结果）、Chapter/TOC。

**依赖：** WebUI 端。

**子步骤：**

1. 新增 `nanobot/session/tasks.py`：TaskList 状态机（pending/in_progress/completed），持久化在 session 目录
2. 新增内置工具：`task_create / task_update / task_list / task_get`
3. WebUI 侧：右栏 Task 面板 + 顶部 chapter TOC
4. 新增 `report_findings` 工具：接受结构化 finding 数组，走 WebUI 渲染
5. `long_task.py` 与 TaskList 复用同一 store，保留兼容

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `session/tasks.py` | 新文件 |
| `agent/tools/tasks.py` | 新工具 |
| `agent/tools/report_findings.py` | 新工具 |
| `webui/*` | Task 面板 + Findings 视图 |

**热路径影响：L1**

**验收：**
- 一次 review workflow 产生 findings 表格可直接点开对应 file:line
- Task 面板与 model 视图一致（同一 store）

---

### Phase H7 — Browser / Preview MCP

**目标：** 让 agent 能启动本项目 dev server、截图、点击、注入 JS、看 console log —— 用于前端任务自证。

**子步骤：**

1. 内置 MCP server [`nanobot/mcp_servers/browser/`](../nanobot/mcp_servers/browser/)：基于 Playwright
2. 工具族：`preview_start / stop / list / click / fill / eval / inspect / screenshot / console_logs / logs / network / resize / snapshot`
3. 项目侧配置：`.nanobot/launch.json`（对齐 Hermes `.claude/launch.json`）
4. Sandbox：允许 host `localhost:*`，其它域名走 permission ask

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `mcp_servers/browser/` | 新目录 |
| `agent/tools/mcp.py` | 内置 server 注册 |
| `config/schema.py` | `launchJson` 路径配置 |

**热路径影响：L0**

**验收：**
- 一次前端改动：agent 启 dev server → 截图 → 确认 UI → 报完成

---

### Phase H8 — Session 管理套件

**目标：** `list_sessions / search_transcripts / archive_session / send_message(cross-session) / set_title / get_session / list_events`。

**子步骤：**

1. [`nanobot/session/`](../nanobot/session/) 增加 index 表（sqlite 或 JSONL）：sessionId, title, cwd, branch, worktree, model, updatedAt
2. 全文检索：sqlite FTS5
3. 内置工具族（对齐 Hermes 命名）
4. WebUI 侧：session 列表 + 归档筛选

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `session/index.py` | 新 |
| `agent/tools/session_mgmt.py` | 新 |
| `webui/*` | session 列表面板 |

**热路径影响：L1**

**验收：**
- 归档一个 session 后仍可从 archived 列表恢复
- 跨 session 发消息在目标 session 显示"来源"链接

---

### Phase H9 — Compact Protocol 与 Budget 追踪

**目标：** 与 UI/harness 层协商的 compact 语义 + budget 追踪。

**子步骤：**

1. [`nanobot/agent/autocompact.py`](../nanobot/agent/autocompact.py) 增加"边界事件"：`before_compact / after_compact`，webui 显示 divider
2. 新增 `budget` context 对象：token 累计 + 每 tool call 记录；Workflow 引擎共享
3. 提供 `AgentRunSpec.budget` 字段：`total: int | None`，超限 tool call 直接抛 `BudgetExceeded`
4. Provider 层的 usage 汇报统一化

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `agent/autocompact.py` | 边界事件 |
| `agent/runner.py` | budget 累计 |
| `agent/workflow/budget.py` | 与主 loop 共享 |
| `providers/base.py` | usage 结构统一 |

**热路径影响：L2**

**验收：**
- Compact 后 UI 显示"session summary" divider
- Budget 硬上限触发时错误 stack 明确

---

### Phase H10 — NotebookEdit + 强制 Read-before-Write

**目标：** 补上 Notebook 支持 + 把 `file_state.py` 的"必须先 Read"从提示级升为强约束。

**子步骤：**

1. 新增内置工具 `notebook_edit`（replace / insert / delete cell），基于 nbformat
2. [`nanobot/agent/tools/file_state.py`](../nanobot/agent/tools/file_state.py) 从"提示级"改为"未读即拒"，配合 Edit/Write
3. 增补 mtime 校验：读时快照 + 写时对比，冲突时报错

**模块影响表：**

| 模块 | 变更 |
|---|---|
| `agent/tools/notebook_edit.py` | 新 |
| `agent/tools/file_state.py` | 强约束 |
| `agent/tools/filesystem.py` | 接线校验 |

**热路径影响：L1**

**验收：**
- 未先 Read 直接 Edit 被拒
- Notebook cell CRUD 单测通过

---

## 模块影响生命周期总览

| 模块 | H0 | H1 | H2 | H3 | H4 | H5 | H6 | H7 | H8 | H9 | H10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `config/schema.py` | ✳️ | | | | ✳️ | | | ✳️ | | | |
| `agent/loop.py` | | ✳️ | | | | | | | | | |
| `agent/runner.py` | ✳️ | | | | ✳️ | | | | | ✳️ | |
| `agent/subagent.py` | | | ✳️ | ✳️ | | ✳️ | | | | | |
| `agent/skills.py` | | | | | | ✳️ | | | | | |
| `agent/hook.py` | | | | | ✳️ | | | | | | |
| `agent/tools/*` | ✳️ | ✳️ | ✳️ | ✳️ | | ✳️ | ✳️ | | ✳️ | | ✳️ |
| `agent/workflow/` | | | ✳️(new) | | | | | | | ✳️ | |
| `agent/isolation/` | | | | ✳️(new) | | | | | | | |
| `providers/base.py` | | | ✳️ | | | | | | | ✳️ | |
| `security/*` | ✳️ | | | ✳️ | | | | | | | |
| `session/*` | | | | | | | ✳️ | | ✳️ | | |
| `webui/*` | ✳️ | ✳️ | | | | | ✳️ | | ✳️ | ✳️ | |
| `mcp_servers/` | | | | | | | | ✳️(new) | | | |
| `skills/*/SKILL.md` | | ✳️(new) | | | | ✳️ | | | | | |

热路径累计：L2 触及 4 次（H0/H1/H4/H9）—— 符合"每 Phase 至多一次 L2/L3"约束。

---

## 不做（Non-Goals）

- **IM 渠道 / Pairing / Desktop 相关** —— 走 [`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md)
- **完整 JS Workflow 引擎（Hermes 是内嵌 JS）** —— H2 用 Python 注册型 workflow，DSL 语义对齐即可
- **Claude Design 集成 / DesignSync** —— 不是核心 harness 差距
- **Managed Agents 云端托管** —— 与本项目"本地 agent 框架"定位不符
- **完全 1:1 复刻 Hermes system-reminder / tool 名称** —— 语义对齐、命名可本地化

---

## 执行方式建议

- 按 Phase 顺序：**H0 → H1 → H2**（三者构成"最小可用工程化 agent"）后可对外说"nanobot 具备 Claude Code 级 agent 能力的核心子集"
- H3/H4 是**扩容项**，可与 H2 并行做
- H5/H6/H7/H8/H9/H10 是**用户可感知项**，按团队精力抓 2~3 个即可显著缩差
- 每个 Phase 结束：
  - `pytest` 全绿
  - 更新本文件相应 Phase 的"完成度"（🔄 → ✅）
  - 若涉及 config schema 变更，同步 [`docs/`](../docs/) 用户文档

### Phase 完成度追踪

| Phase | 状态 |
|---|---|
| H0 权限模型 | 🔲 未开始 |
| H1 Plan Mode | 🔲 未开始 |
| H2 Workflow + Schema | 🔲 未开始 |
| H3 Worktree | 🔲 未开始 |
| H4 用户 Hooks | 🔲 未开始 |
| H5 Skills 懒加载 | 🔲 未开始 |
| H6 Task/Findings UX | 🔲 未开始 |
| H7 Browser MCP | 🔲 未开始 |
| H8 Session 管理 | 🔲 未开始 |
| H9 Compact + Budget | 🔲 未开始 |
| H10 Notebook + Read-guard | 🔲 未开始 |
