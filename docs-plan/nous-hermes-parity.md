# minibot ↔ Nous Research Hermes Agent — 对标计划（Phase 15–20）

> **落盘路径：** [`docs-plan/nous-hermes-parity.md`](./nous-hermes-parity.md)
> **对标对象：** [Nous Research Hermes Agent](https://github.com/nousresearch/hermes-agent)（"self-improving AI agent"，MIT）
> **配套：**
> - 主 plan：[`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md)（Phase 0–14）
> - 术语区分：本文件对标的是 **Nous Research 出品的开源 agent**；仓库里另有 [`hermes-harness-gap.md`](./hermes-harness-gap.md) 内部把 **Claude Code CLI harness** 昵称为 "Hermes"，两者**不是同一个东西**，请勿混淆
>
> **本文件的定位：** 主 plan Phase 0–14 完成后仍存在的能力缺口清单，用 Phase 15–20 承接。**不阻塞主 plan**；仅在决定"minibot 要对标 Nous Hermes"时启动。

---

## 目录

1. [背景：为什么单开这份文件](#背景为什么单开这份文件)
2. [Nous Hermes 的核心能力清单](#nous-hermes-的核心能力清单)
3. [差距对齐表](#差距对齐表)
4. [Phase 15 — IM Gateway（多平台入口）](#phase-15--im-gateway多平台入口)
5. [Phase 16 — 会话 FTS 搜索 + 自搜 tool](#phase-16--会话-fts-搜索--自搜-tool)
6. [Phase 17 — Skill 自主创建 + 用户建模](#phase-17--skill-自主创建--用户建模)
7. [Phase 18 — 执行 Backend 抽象层](#phase-18--执行-backend-抽象层)
8. [Phase 19 — TTS + 云浏览器 tools](#phase-19--tts--云浏览器-tools)
9. [Phase 20 — Trajectory 训练数据管线](#phase-20--trajectory-训练数据管线)
10. [模块生命周期总览](#模块生命周期总览)
11. [Non-Goals（明确不做）](#non-goals明确不做)
12. [执行方式建议](#执行方式建议)
13. [Phase checklist](#phase-checklist)

---

## 背景：为什么单开这份文件

主 plan（`minibot-fastapi-migration.md` v3）的定位是**"nanobot WebUI 后端的现代化重写"**——聚焦本地 coding + 单人使用。Phase 0-14 全部做完后，能力覆盖度约为 Nous Hermes 的 **51%**（估算见下文差距表）。

Nous Hermes 的差异化卖点是**"self-improving cross-platform AI agent"**：
- **跨 IM 平台**（Telegram/Discord/Slack/WhatsApp/Signal/Email/CLI）+ 语音转写 + 跨平台对话延续
- **自主学习循环**（从经验创建 skill → 使用中改进 → 主动持久化 → 搜索历史）
- **执行 backend 多样性**（local/Docker/SSH/Singularity/Modal/Daytona，含 serverless hibernation）
- **Trajectory 训练数据副产品**（对齐 Nous Research 训练 tool-calling 模型的需求）

**主 plan 不覆盖上面这些**（Phase 1-14 明确排除 IM 与多平台）。所以本文件用 Phase 15-20 补齐，把覆盖度从 51% 拉到约 **90%**。

---

## Nous Hermes 的核心能力清单

依据 [GitHub repo README](https://github.com/nousresearch/hermes-agent)（2026-07 快照）：

| 大类 | 能力 |
|------|------|
| **多入口** | Telegram / Discord / Slack / WhatsApp / Signal / Email / CLI；语音转写；跨平台对话延续 |
| **模型无关** | Nous Portal / OpenRouter / OpenAI / Custom；`hermes model` 一键切 |
| **自主学习** | 从经验创建 skill；使用中改进；主动持久化；FTS5 会话搜索 |
| **用户建模** | Honcho dialectic user modeling（跨 session 用户画像） |
| **Subagent** | 并行 workstream + Python RPC 调 tool |
| **Cron** | 自然语言创建 → 任意平台送达 |
| **执行 backend** | 6 个：local / Docker / SSH / Singularity / Modal / Daytona |
| **TUI** | 多行编辑 + slash 补全 + 中断 + 流式 tool 输出 |
| **工具生态** | 40+ 内置 + Nous Portal（300+ 模型 + Firecrawl + FAL + OpenAI TTS + Browser Use） |
| **MCP** | 有（optional-mcps） |
| **权限** | Command approval / DM pairing / container isolation |
| **配置迁移** | `hermes claw migrate` 从 OpenClaw 导入 |
| **训练** | `batch_runner.py` + `trajectory_compressor.py`（生产训练数据） |
| **平台** | Linux / macOS / WSL2 / Termux / **Windows PowerShell** |
| **ACP 协议** | `acp_adapter/`（agent 间通信） |
| **agentskills.io 标准** | 兼容 |

---

## 差距对齐表

按主 plan（v3）Phase 0-14 全部完成后，对齐 Nous Hermes 逐项打分：

| # | 能力域 | Nous Hermes | v3 完成后的 minibot | 差距 | 归属 |
|---|--------|-------------|---------------------|------|------|
| 1 | 多平台 IM | ✅ 7 平台 | ❌ 主 plan 明确不做 | 🔴 大 | **Phase 15** |
| 2 | 语音转写（IM 输入） | ✅ 每平台 | ⚠️ Phase 8 有 STT tool，但未挂 IM | 🟠 中 | **Phase 15** |
| 3 | 会话 FTS 搜索 | ✅ FTS5 | ❌ 无 | 🟠 中 | **Phase 16** |
| 4 | Agent 自搜历史 tool | ✅ | ❌ 无 | 🟠 中 | **Phase 16** |
| 5 | Skill 自主创建 | ✅ | ⚠️ Phase 3b 只加载静态 SKILL.md | 🟠 中 | **Phase 17** |
| 6 | Skill 使用中改进 | ✅ | ❌ 无 | 🟠 中 | **Phase 17** |
| 7 | Dialectic 用户建模 | ✅ Honcho | ⚠️ Phase 3b MEMORY.md 是静态记忆 | 🟠 中 | **Phase 17** |
| 8 | 执行 backend 多样性 | ✅ 6 个 | ⚠️ 只有 local + Unix bwrap | 🔴 大 | **Phase 18** |
| 9 | Serverless hibernation | ✅ Modal/Daytona | ❌ 无 | 🟢 小（Phase 18 之上） | **Phase 18** |
| 10 | TTS（agent 说话） | ✅ OpenAI TTS | ❌ 未列 | 🟡 小 | **Phase 19** |
| 11 | 云浏览器 | ✅ Browser Use | ❌ 未列 | 🟠 中 | **Phase 19** |
| 12 | Trajectory 数据管线 | ✅ | ❌ 未列 | 🟠 中（Nous 特色，可选） | **Phase 20** |
| 13 | ACP 协议 | ✅ | ❌ 未列 | 🟡 小（可放 Phase 20 或独立） | **Phase 20** |
| 14 | 模型无关 | ✅ | ✅ Phase 6 已对齐 | 🟢 无 | — |
| 15 | Subagent | ✅ | ✅ Phase 1.5 | 🟢 无 | — |
| 16 | Cron | ✅ | ✅ Phase 4 | 🟢 无 | — |
| 17 | MCP | ✅ | ✅ Phase 5 | 🟢 无 | — |
| 18 | 工具丰富度（基础） | ✅ 40+ | ✅ Phase 1+5 ~15-20 个 | 🟡 小（数量差距） | — |
| 19 | 权限 / pairing | ✅ | ✅ Phase 11 / Phase 14 | 🟢 无 | — |
| 20 | 平台（Windows / Termux） | ✅ | ⚠️ Phase 1 "Windows 后续" | 🟠 中 | 未单列，Phase 18 顺带 |

**覆盖度估算**：主 plan Phase 0-14 完成 = 51%；再做 Phase 15-20 = **90%**。

---

## 影响等级约定

沿用主 plan 的模块 ID（M-Loop / M-Runner / M-Prov / …）和图标：

| 标记 | 含义 |
|------|------|
| 🆕 新建 | 新文件/新子系统 |
| 🔧 改实现 | 内部换血，对外 API 尽量兼容 |
| ⚠️ 改合同 | 函数签名 / 事件形状 / REST 字段变化 |
| 🔌 接线 | 调用关系改道 |
| — 不动 | 本步不碰 |

**热路径影响：** 🟢 无 / 🟡 低 / 🟠 中 / 🔴 高

---

## Phase 15 — IM Gateway（多平台入口）

**目标：** 让 minibot 成为"跨平台可达的 agent"，而不仅是 WebUI 里的 agent。
**依赖：** 主 plan Phase 0-9 完成（Loop 稳定、streaming 就绪）。
**MSV：** Phase 15（独立可切换，不阻塞其他）

**说明**：主 plan 明确"IM 走 legacy nanobot gateway"。Phase 15 是**推翻这一决定**的补丁——如果不做 Phase 15，minibot 永远是"WebUI-only agent"。

### 子步骤

| 子步骤 | 改什么 | 模块影响 |
|--------|--------|----------|
| **15.1** channels 骨架移植 | 从 nanobot 移植 `channels/base.py` 及 `manager.py`；auto-discovery 走 pkgutil + entry-point | M-Ch 🆕（新模块） |
| **15.2** 三个先行 channel | Telegram + Discord + Email（覆盖 Nous Hermes 高流量场景） | M-Ch 🆕、M-Bus 🔌 |
| **15.3** channel → MessageBus 接线 | 复用主 plan Phase 0.4 已建的 bus；`InboundMessage.channel` 字段区分来源 | M-Bus ⚠️ 改合同（加 `channel` 字段） |
| **15.4** 跨平台 session 延续 | 同一 user_id 在 Telegram/Discord 视为同一 session；`~/.minibot/user_channels.jsonl` 存 user → channels 映射 | M-Sess ⚠️ 改合同、M-Ch 🔧 |
| **15.5** 语音消息自动转写 | 复用主 plan Phase 8.4 的 transcribe（groq/openai/assemblyai）；channel 层自动把 voice → text | M-Ch 🔧 |
| **15.6** 出站分发 | Loop outbound 事件按 channel 分发；每 channel 独立 formatter（Telegram markdown、Discord embed 等） | M-Loop 🔌、M-Ch 🔧 |
| **15.7** 二阶段：补齐 4 个 | Slack、WhatsApp、Signal、CLI（CLI 走 stdin/stdout） | M-Ch 🆕 |

### 模块影响表

| 模块 | 变更 | 说明 |
|------|------|------|
| **M-Ch**（新建） | 🆕 新建 `channels/` 子系统 | base + manager + 具体 channel |
| M-Bus | ⚠️ 改合同 | `InboundMessage` 加 `channel: str` |
| M-Sess | ⚠️ 改合同 | Session 加 `channels: list[str]` 元数据 |
| M-Loop | 🔌 接线 | outbound 按 channel 分发 |
| M-API | — 不动 | WebUI 走原路径 |
| M-Cfg | 🔧 改实现 | 每个 channel 的 credentials 配置节 |

### 热路径影响

🟠 中：入站消息路径多了一层 channel adapter，但只是薄适配层。

### 验收

- 用 Telegram bot 向 minibot 说 "list files"，能收到工具执行结果
- 从 Telegram 开始的对话，切到 Discord 继续问 "上一个命令结果是什么"，agent 能延续
- 发一条语音消息到 Telegram → 自动转写 → 走通同一 Loop

### 工作量估算

**这是本文件最重的 Phase**。相当于主 plan Phase 1-4 之和。建议：
- 15.1-15.3（骨架 + 三个 channel）作为**MSV 15**
- 15.7（补齐剩余 4 个）作为独立后续小 Phase

---

## Phase 16 — 会话 FTS 搜索 + 自搜 tool

**目标：** agent 能搜索自己历史对话（"上次我们讨论 auth 时决定用什么方案？"）。
**依赖：** 主 plan Phase 0.1（JSONL 会话持久化已有）。
**MSV：** 16

### 子步骤

| 子步骤 | 改什么 | 模块影响 |
|--------|--------|----------|
| **16.1** SQLite FTS5 索引 | `~/.minibot/sessions/index.db`：字段 `session_id / turn_id / role / content / t_created / workspace` | M-Sess 🆕 index 子模块 |
| **16.2** 增量索引 | Loop 每 turn 结束后 append 索引；进程启动时补索引未 seen 的 session | M-Sess 🔧、M-Loop 🔌 |
| **16.3** search_history tool | agent 侧 tool：`search_history(query, workspace=None, since=None, limit=10) -> list[SessionHit]` | M-Tools 🆕 |
| **16.4** LLM 摘要 | 命中多 turn 时可选二次调 LLM 摘要（避免拉整段对话进 context） | M-Tools 🔧、M-Prov 🔌 |
| **16.5** WebUI 搜索栏 | 复用同一 index，前端加"搜索历史"入口 | M-API 🔌 |

### 模块影响表

| 模块 | 变更 |
|------|------|
| M-Sess | 🆕 index 子模块 |
| M-Loop | 🔌 turn 结束后 append 索引 |
| M-Tools | 🆕 `search_history` tool |
| M-API | 🔌 `/api/sessions/search?q=...` |

### 热路径影响

🟡 低：索引是 append-only 异步的；search tool 走独立 SQLite 查询。

### 验收

- 建 3 个 session 覆盖不同话题，`search_history("auth")` 返回相关 turn
- 索引损坏时优雅降级（返回空 + 日志 warning，不 crash）
- 增量索引在 1000 session / 10 万 turn 规模下 P99 查询 < 200ms

---

## Phase 17 — Skill 自主创建 + 用户建模

**目标：** 让 minibot 从"静态 skill 加载器"升级为"self-improving agent"。
**依赖：** 主 plan Phase 3b（Skills 基础加载）。
**MSV：** 17

### 子步骤

| 子步骤 | 改什么 | 模块影响 |
|--------|--------|----------|
| **17.1** create_skill tool | agent 侧 tool：`create_skill(name, description, trigger, body) -> path`；写入 `~/.minibot/skills/<name>/SKILL.md` | M-Tools 🆕 |
| **17.2** update_skill tool | `update_skill(name, patch) -> diff` | M-Tools 🆕 |
| **17.3** skill 触发统计 | SkillsRegistry 记录每个 skill 被匹配次数、命中效果（agent 事后自评） | M-Ctx 🔧 |
| **17.4** persist_hint 机制 | Loop 在特定事件后（如"复杂多文件重构完成"）向 agent 注入 system reminder："你可能想把刚才的做法记为 skill" | M-Loop 🔧 |
| **17.5** 用户建模（简化版 dialectic） | `~/.minibot/user_model.md`：agent 每 N turn 主动更新用户偏好/背景；下一 turn 注入 context | M-Ctx 🆕、M-Loop 🔧 |
| **17.6** 严格评估门槛 | agent 创建的 skill 需要通过"最近 3 次匹配到时是否真被用户接受"评估，否则自动降级或删除 | M-Ctx 🔧 |

### 模块影响表

| 模块 | 变更 |
|------|------|
| M-Tools | 🆕 3 个 skill 生命周期 tool |
| M-Ctx | 🆕 user_model + 触发统计 |
| M-Loop | 🔧 persist_hint 事件点 + user_model 注入 |

### 热路径影响

🟠 中：context 组装多了一层（user_model.md 注入），但和 Phase 3a 的 context.py 天然融合。

### 验收

- 用户连续问 3 次类似问题后，agent 主动创建 skill；下次匹配时正确触发
- user_model.md 内容跨 session 稳定演进（新 session 能看到旧偏好）
- 让 agent "忘掉某个 skill"能被清理

### 风险与限制

- **不追求 Honcho 完整 dialectic 模型**（那涉及独立后端服务）；本 Phase 用"文件驱动的简化版"够本地单人场景
- Skill 自主创建质量高度依赖 LLM 判断，需要在 skill 目录加"用户可否决"机制

---

## Phase 18 — 执行 Backend 抽象层

**目标：** shell / exec 类工具可插拔多 backend，最少支持 local + Docker + SSH。
**依赖：** 主 plan Phase 1.4（shell 工具 + Unix 沙箱）。
**MSV：** 18

### 子步骤

| 子步骤 | 改什么 | 模块影响 |
|--------|--------|----------|
| **18.1** ExecutorBackend 抽象 | `agent/executors/base.py`：`async def run(cmd, cwd, env, timeout) -> ExecResult`；`async def read_file(path)`、`write_file(path, content)`、`list_dir(path)` | M-Exec 🆕（新模块） |
| **18.2** LocalBackend | 现有 shell / filesystem 逻辑迁入 | M-Tools 🔌、M-Exec 🔌 |
| **18.3** DockerBackend | 通过 `docker exec` 到容器；文件走 `docker cp` 或挂载卷 | M-Exec 🆕 |
| **18.4** SSHBackend | 通过 asyncssh 到远端；文件走 SFTP | M-Exec 🆕 |
| **18.5** 工具层解耦 | shell / filesystem 工具**只调 backend**，不再直接 subprocess | M-Tools ⚠️ 改合同（backend 参数） |
| **18.6** Session backend 绑定 | Session 元数据加 `executor_backend: LocalConfig \| DockerConfig \| SSHConfig` | M-Sess ⚠️ 改合同 |
| **18.7** Windows 兜底 | LocalBackend on Windows 走 PowerShell，跳过 bwrap 沙箱 | M-Exec 🔧 |
| **18.8**（可选） ModalBackend | serverless hibernation，参考 Nous Hermes 的 modal.com 集成 | M-Exec 🆕 |
| **18.9**（可选） DaytonaBackend | 同上，另一 serverless 方案 | M-Exec 🆕 |

### 模块影响表

| 模块 | 变更 |
|------|------|
| **M-Exec**（新建） | 🆕 `agent/executors/` 子系统 |
| M-Tools | ⚠️ 改合同（shell/fs 工具走 backend） |
| M-Sess | ⚠️ 改合同（session 绑 backend） |
| M-Sec | 🔧 权限校验按 backend 差异化（远端 backend 可放宽 workspace 边界） |

### 热路径影响

🟠 中：工具执行路径改为经 backend；本地场景性能应无差异（LocalBackend 是薄封装）。

### 验收

- Local + Docker 各自完成一个"读改仓库文件"任务
- SSH backend 连远端 VPS，agent 能执行 `ls`、`grep`
- Windows local backend 至少支持 filesystem + PowerShell shell
- backend 切换时 session 元数据自动记录，重启后延续

### 与主 plan Phase 1 的关系

Phase 1.4 shell 沙箱是 v3 里"Local backend 的初版"。Phase 18 把它一般化。**建议做 Phase 18 时把 Phase 1.4 的沙箱代码迁到 `executors/local.py`**，而不是保留两处。

---

## Phase 19 — TTS + 云浏览器 tools

**目标：** 让 agent 能"说话"和"上网真跑浏览器"。
**依赖：** 主 plan Phase 1（web fetch/search 已有）+ Phase 5（MCP 可用）。
**MSV：** 19（两个独立小工具，可并行）

### 子步骤

| 子步骤 | 改什么 | 模块影响 |
|--------|--------|----------|
| **19.1** TTS tool | `agent/tools/tts.py`：调 OpenAI TTS API 或 ElevenLabs；输出 mp3 URL 或 attachment；WS 事件 `audio_message` | M-Tools 🆕、M-API 🔌 |
| **19.2** 云浏览器 MCP 或 tool | Option A: 内嵌 Playwright（本地）；Option B: 接入 Browser Use / browserless.io（云端） | M-Tools 🆕、M-Cfg 🔧 |
| **19.3** WebUI audio 播放 | 前端识别 audio message 类型并 inline 播放 | M-API 🔌 |
| **19.4** 云浏览器权限守卫 | 复用 Phase 1.1 security；云浏览器请求域名走 permission ask（Phase 11 联动） | M-Sec 🔌 |

### 模块影响表

| 模块 | 变更 |
|------|------|
| M-Tools | 🆕 2 个新 tool |
| M-Cfg | 🔧 TTS / 浏览器 provider 配置 |
| M-API | 🔌 audio message WS 事件 |
| M-Sec | 🔌 云浏览器域名 ask |

### 热路径影响

🟢 无：都是新 tool，走既有 tool 执行路径。

### 验收

- agent 说"给我读一下摘要" → 返回 audio message，WebUI 可播放
- agent 说"打开 https://... 截个图" → 走浏览器 tool，返回截图

---

## Phase 20 — Trajectory 训练数据管线

**目标：** 让 minibot 成为"生产 tool-calling 训练数据的工具"，对齐 Nous Hermes 的研究定位。
**依赖：** 主 plan Phase 10（trace 结构完整）。
**MSV：** 20（研究向，非生产必需）

### 子步骤

| 子步骤 | 改什么 | 模块影响 |
|--------|--------|----------|
| **20.1** trajectory 格式定义 | `~/.minibot/trajectories/<id>.jsonl`：每 turn 完整 messages + tool_calls + tool_results；schema 对齐 OpenAI fine-tune 格式或 sharegpt | M-Sess 🆕 子模块 |
| **20.2** batch runner | CLI：`minibot trajectory batch --prompts prompts.jsonl --out trajs/` 跑一批任务并落 trajectory | M-CLI 🆕（`cli/`） |
| **20.3** trajectory 压缩器 | `trajectory_compressor.py`：把冗余步骤（重复读同一文件、tool 报错重试）压缩，保留成功路径 | M-Obs 🔧（trace_schema 复用） |
| **20.4** export 工具 | `minibot trajectory export --format {openai-ft, sharegpt, jsonl}` | M-CLI 🔧 |
| **20.5** ACP 适配器（可选） | `acp_adapter/`：接入 Nous ACP 协议，让 minibot 可作为 ACP-compliant agent | M-Bus 🆕 adapter |

### 模块影响表

| 模块 | 变更 |
|------|------|
| M-Sess | 🆕 trajectory 存储 |
| M-CLI | 🆕 `minibot trajectory` 子命令 |
| M-Obs | 🔧 复用 trace_schema |
| M-Bus | 🆕 ACP adapter（可选） |

### 热路径影响

🟢 无：完全旁路，跑批任务自成一路。

### 验收

- 用 100 条 prompt 跑 batch，生成 100 个 trajectory 文件
- 压缩后文件大小 ≤ 原始 70%，关键 tool call 序列保留
- 导出为 openai-ft 格式，可直接投递到 fine-tune API

### 与主 plan 的关系

**Phase 20 是最"Nous 特色"的部分**——如果你只想要产品级 agent，跳过 Phase 20 无影响；如果你想让 minibot 参与开源模型社区（作为训练数据工具），Phase 20 必做。

---

## 模块生命周期总览

**Phase 15-20 中各模块被改的频次：**

| 模块 | Phase 15 | Phase 16 | Phase 17 | Phase 18 | Phase 19 | Phase 20 |
|------|:--------:|:--------:|:--------:|:--------:|:--------:|:--------:|
| M-Ch（新） | 🆕 | | | | | |
| M-Exec（新） | | | | 🆕 | | |
| M-CLI | | | | | | 🆕 |
| M-Bus | ⚠️ | | | | | 🆕 |
| M-Sess | ⚠️ | 🆕 | | ⚠️ | | 🆕 |
| M-Loop | 🔌 | 🔌 | 🔧 | | | |
| M-Tools | | 🆕 | 🆕 | ⚠️ | 🆕 | |
| M-Ctx | | | 🆕 | | | |
| M-API | | 🔌 | | | 🔌 | |
| M-Cfg | 🔧 | | | | 🔧 | |
| M-Prov | | 🔌 | | | | |
| M-Sec | | | | 🔧 | 🔌 | |
| M-Obs | | | | | | 🔧 |

**热路径累计：**
- Phase 15 🟠、Phase 16 🟡、Phase 17 🟠、Phase 18 🟠、Phase 19 🟢、Phase 20 🟢
- 四次 🟠 都是**接线级**（不改 Runner ReAct 循环），符合主 plan 的"每 Phase 至多一次 L2"约束

---

## Non-Goals（明确不做）

- ❌ **完整 Honcho 后端服务集成**（Phase 17 用简化文件驱动版）
- ❌ **完整 6 个执行 backend**（Phase 18 只要求 Local + Docker + SSH，Modal/Daytona 作为可选）
- ❌ **Nous Portal 完整对接**（这是 Nous 商业产品；minibot 用户可自选任意 provider）
- ❌ **`hermes claw migrate` 等价物**（主 plan Phase 6.4 从 nanobot 导入已够）
- ❌ **agentskills.io 标准的写侧对接**（先做单机自主创建，社区标准适配作为后续）
- ❌ **Native Windows 完整支持**（Phase 18.7 只做兜底；完整 Windows 支持另开独立 Phase）
- ❌ **Termux / Android 端**（用户量太小，独立评估）

---

## 执行方式建议

- **不需要按 15→20 顺序**：Phase 15/16/17/18 相互独立，可并行
- **Phase 19 是"打包礼物"**：两个独立小 tool，任何时候都能塞
- **Phase 20 是"选做题"**：只有当你要参与 Nous 训练数据生态时才做

### 战略性建议

一个真正对标 Nous Hermes 的**执行顺序**：

```text
主 plan Phase 0-9 完成         → MSV=9（webui 默认切 minibot）
主 plan Phase 10-13 完成       → 全能 WebUI agent
─────────────────────────────  ← 分水岭：这里可以停
Phase 15 (IM Gateway 三平台先行) → 从 "WebUI agent" 变成 "跨平台 agent"
Phase 16 (FTS 搜索)              → self-search 能力
Phase 17 (Skill 自创 + 用户建模) → self-improving 能力
Phase 18 (Backend 抽象)          → 可部署多样性
Phase 19 (TTS / 浏览器)          → 感官扩展
Phase 20 (Trajectory)            → 研究工具化
主 plan Phase 14 (多用户)        → 最后做
```

**关键决策点**：Phase 15 是"从 minibot 变成 Hermes"的分水岭。做了它就承诺了跨平台运维（多个 IM API 的 rate limit、断连、消息去重等），运维复杂度上一个台阶。不做它就承认 minibot 是"WebUI-only agent"。

---

## Phase checklist

- [ ] **Phase 15** — IM Gateway（多平台入口）
  - [ ] 15.1 channels 骨架
  - [ ] 15.2 Telegram + Discord + Email
  - [ ] 15.3 channel → MessageBus 接线
  - [ ] 15.4 跨平台 session 延续
  - [ ] 15.5 语音自动转写
  - [ ] 15.6 出站分发 formatter
  - [ ] 15.7 补齐 Slack / WhatsApp / Signal / CLI
- [ ] **Phase 16** — 会话 FTS 搜索
  - [ ] 16.1 SQLite FTS5 索引
  - [ ] 16.2 增量索引
  - [ ] 16.3 search_history tool
  - [ ] 16.4 LLM 摘要
  - [ ] 16.5 WebUI 搜索栏
- [ ] **Phase 17** — Skill 自创 + 用户建模
  - [ ] 17.1 create_skill tool
  - [ ] 17.2 update_skill tool
  - [ ] 17.3 触发统计
  - [ ] 17.4 persist_hint 事件
  - [ ] 17.5 user_model.md
  - [ ] 17.6 skill 评估门槛
- [ ] **Phase 18** — 执行 Backend 抽象
  - [ ] 18.1 ExecutorBackend 抽象
  - [ ] 18.2 LocalBackend
  - [ ] 18.3 DockerBackend
  - [ ] 18.4 SSHBackend
  - [ ] 18.5 工具层解耦
  - [ ] 18.6 Session backend 绑定
  - [ ] 18.7 Windows 兜底
  - [ ] 18.8 ModalBackend（可选）
  - [ ] 18.9 DaytonaBackend（可选）
- [ ] **Phase 19** — TTS + 云浏览器
  - [ ] 19.1 TTS tool
  - [ ] 19.2 云浏览器 tool/MCP
  - [ ] 19.3 WebUI audio 播放
  - [ ] 19.4 浏览器权限守卫
- [ ] **Phase 20** — Trajectory 数据管线
  - [ ] 20.1 trajectory 格式
  - [ ] 20.2 batch runner
  - [ ] 20.3 压缩器
  - [ ] 20.4 export
  - [ ] 20.5 ACP adapter（可选）

---

## 完成后的覆盖度估算

| 阶段 | 覆盖 Nous Hermes 能力 |
|------|-----------------------|
| minibot 当前 | ~10% |
| 主 plan Phase 0-14 完成 | ~51% |
| + Phase 15（IM 三平台先行） | ~68% |
| + Phase 16 + 17 | ~78% |
| + Phase 18 | ~85% |
| + Phase 19 + 20 | **~90%** |

剩下 10% 是 Nous 商业生态特有（Nous Portal、Honcho 后端、Managed Agents 等），不宜追求 1:1 覆盖。

---

## 参考

- [Nous Research Hermes Agent (GitHub)](https://github.com/nousresearch/hermes-agent)
- [Nous Portal](https://portal.nousresearch.com/)（Hermes 依赖的模型/工具网关）
- [Honcho](https://honcho.dev/)（Hermes 用于 dialectic user modeling 的后端）
- [agentskills.io](https://agentskills.io/)（Hermes 兼容的 skill 开放标准）
- 主 plan：[`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md)
- 术语区分：[`hermes-harness-gap.md`](./hermes-harness-gap.md) 里的 "Hermes" 是 Claude Code CLI 昵称，与本文件对标的 Nous Hermes 无关
