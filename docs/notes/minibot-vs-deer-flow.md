# minibot vs DeerFlow — 架构对照

> 评估日：2026-08-18  
> 对照对象：[bytedance/deer-flow](https://github.com/bytedance/deer-flow/tree/main) **2.0 主线**（与 v1 Deep Research 无代码共用）  
> minibot 进度单源：[`../status.md`](../status.md)、[`../migration.md`](../migration.md)  
> 近邻对照：[`minibot-vs-nanobot-gap.md`](./minibot-vs-nanobot-gap.md)、[`minibot-vs-openclaw-gap.md`](./minibot-vs-openclaw-gap.md)  
> 远期架构：[`../roadmap/minibot-cursor-style-architecture.md`](../roadmap/minibot-cursor-style-architecture.md)

这不是覆盖率竞赛。nanobot 是 minibot 的行为参照；OpenClaw 是更远的产品天花板。DeerFlow 2.0 是另一条路线：**长程 Super Agent Harness**。两边能力清单大量重叠，架构哲学几乎相反。

## 一句话

minibot 是本地优先、单进程的个人 agent 运行时（nanobot 行为参照 + 学习实验室）。DeerFlow 2.0 是字节开源的长程 harness：LangGraph 编排、多服务拓扑、可恢复执行、生产级沙箱与插件。真正差的不是「有没有 Skills / MCP / 飞书」，而是**执行有没有从会话里拆出来**。

## 产品定位

| | minibot | DeerFlow 2.0 |
|--|---------|--------------|
| 默认假设 | 一个人、一台机器、会话即执行 | 多人、多 worker、执行必须可抢占可恢复 |
| 复杂度放哪 | Loop / Runner 尽量不动；能力外溢到 channel / tool / skill / MCP | Harness 做厚；App 只做 Gateway 和 IM |
| 失败怎么处理 | 停轮、HITL 审批、preset fallback | lease 过期接管、checkpoint 冲突、工具调用序列修复 |
| 入口 | Web、Dev UI、Tauri Desktop、React Native、CLI、飞书 / 微信 | Web、TUI、嵌入式 Python SDK、Claude Code skill、多 IM |
| 数据根 | `~/.minibot`（JSONL 会话 + workspace） | `config.yaml` + `.deer-flow` / 用户桶 + checkpoint store |
| 默认监听 | FastAPI `:8766`（API + WS + 静态 UI） | Nginx `:2026` → Gateway `:8001` + Next.js `:3000` |

## 相同点

两边都已经不是「聊天框调一次 LLM」，而是同一套 agent 基础设施：

| 能力 | 两边怎么做 |
|------|------------|
| Python 后端 + TS 前端 | FastAPI 网关；聊天 UI 流式输出；Docker 可一键起 |
| 工具闭环 | 读改文件、shell、web search/fetch、MCP（stdio / SSE / HTTP） |
| Skills | `SKILL.md` 包；内置 + 用户自定义；进 agent 上下文 |
| 沙箱执行 | 本机 backend + 云隔离（两边都接 E2B） |
| 子代理 | 主 agent 可委派子任务（深度 / 并发模型不同） |
| 记忆 + 压缩 | 跨会话记忆文件；长线程 summarize / compact |
| 定时任务 | cron / scheduled run 走同一套 agent 生命周期 |
| IM | 飞书 + 微信 iLink；扫码 / 长连接，不强制公网回调 |
| 可观测 | 可选 Langfuse 上报 LLM / tool / session |

## 分维对照

| 维度 | minibot | DeerFlow 2.0 |
|------|---------|--------------|
| Agent 内核 | 自研 `AgentLoop` + ReAct `AgentRunner`；per-session `asyncio.Lock` | LangGraph `lead_agent` + middleware 链 |
| 状态 / 恢复 | JSONL 会话；进程内锁 | checkpoint、run ownership heartbeat、跨 worker lease |
| 前端协议 | Vite SPA；自研 multiplex WebSocket | Next.js 16；LangGraph SDK / SSE |
| 沙箱 | local（可选 bwrap）/ E2B | local / Docker / AIO / K8s provisioner / E2B |
| Subagent | 同步 `spawn`，最大深度 2；async 在路线图（Phase 2.5） | 异步后台、隔离 graph、并发上限、独立 `execution_id` |
| Memory | `MEMORY.md` + 薄 Dream cron | DeerMem 事实库 / FTS；可选 mem0、Honcho、OpenViking |
| Skills 工程 | 内置 catalog + workspace；无扫描器 | 渐进加载、slash 激活、SkillScan、Lark CLI 集成包 |
| HITL | 高风险工具暂停 + 持久化审批卡（一等公民） | `ask_clarification`；可选 RBAC；本机 bash 默认关闭 |
| IM 广度 | 飞书、微信 + pairing | Telegram / Slack / 飞书 / 微信 / 企微 / 钉钉 / Buzz 等 |
| 知识 / 产物 | 可选 [minikb](https://github.com/liuyidi/minikb) 检索工具 | 上传转 Markdown、artifacts 面板、workspace diff |
| 浏览器 | 无（OpenClaw 对照里记为 Phase 19） | 可选 Playwright 操作级浏览器（点击 / 填表 / 截图） |
| 扩展模型 | tool / skill / MCP / channel | 再加 Python plugin：middleware、lifecycle、HTTP router |
| 客户端 | Web / Desktop / App / CLI | Web / TUI / 嵌入式 Python SDK / Claude Code skill |
| 可观测 | [mini-langfuse](https://github.com/liuyidi/mini-langfuse) 旁路 | LangSmith / Langfuse / Monocle |
| 部署 | 单镜像；ECS demo 栈 | Compose + Helm；多实例 scheduler 需 Postgres |

## minibot 更强 / 更特有

- 启动面极小：一个进程、一套 `~/.minibot`，适合本机和面试 demo。
- HITL 审批是运行时一等公民：高风险工具先停再跑（见 [`../human-in-the-loop.md`](../human-in-the-loop.md)）。
- Dev UI 实验室（race / MCP / fault inject）面向把 agent 看懂。
- Desktop + React Native 共用同一 REST/WS 协议（见 [`../client-api.md`](../client-api.md)）。
- 和 mini-langfuse / minikb / mini-auth 是同一产品族。

## DeerFlow 更强 / 更完整

- 长程任务：plan mode、session goals、hidden continuation、产物面板。
- 执行可恢复：checkpoint、lease、多 worker、K8s 沙箱。
- 子代理是真后台隔离，不是同步阻塞 `spawn`。
- Skills / Memory / MCP / 浏览器 / 插件都按生产系统在做。
- IM 和模型接入面更宽（Codex CLI、Claude Code OAuth、ACP）。

## 架构哲学

```text
minibot 当前
  Web / Desktop / IM
        │  REST + WebSocket
        ▼
  FastAPI :8766
        │
        ▼
  AgentLoop（session lock）→ Runner → LLM / Tools
        │
        ▼
  ~/.minibot  JSONL + workspace

DeerFlow 2.0
  Browser :2026 (Nginx)
        ├─ /          → Next.js :3000
        └─ /api/*     → Gateway :8001
                          │
                          ▼
                    LangGraph lead_agent
                          ├─ middleware / skills / memory
                          ├─ subagents（隔离 graph）
                          └─ sandbox（local / Docker / K8s / E2B）
                          │
                          ▼
                    checkpoint store（SQLite / Postgres）
```

相对 [`../roadmap/minibot-cursor-style-architecture.md`](../roadmap/minibot-cursor-style-architecture.md)：DeerFlow 已经更接近「会话、运行、沙箱、调度分层」；minibot v2 草案写了 durable workflow + worker pool，当前未到。

## 怎么读

1. 若问题是「**学 agent 闭环、做个人助手 / IM 机器人、保持代码可讲清楚**」→ 看 minibot。
2. 若问题是「**长程研究/出活、多租户、K8s 沙箱、可恢复后台任务**」→ 看 DeerFlow。
3. 若问题是「**minibot 要不要往 DeerFlow 靠**」→ 不要抄 LangGraph 全家桶；要对齐的是分层（会话 ≠ 执行、沙箱隔离、可恢复 run），这已经写在 Cursor-style v2 草案里。

## 来源

- minibot：[`../../README.md`](../../README.md)、[`../../AGENTS.md`](../../AGENTS.md)、[`../status.md`](../status.md)、`minibot/src/minibot/`（`agent/loop.py`、`agent/tools/spawn.py`、`agent/memory.py`、channels、HITL）
- DeerFlow：2026-08-18 的 `main` README、`AGENTS.md`、`backend/AGENTS.md`、`frontend/AGENTS.md`（<https://github.com/bytedance/deer-flow/tree/main>）
