# minibot vs OpenClaw — 能力差距

> 评估日：2026-08-05  
> 对照：[README「能做什么」](../../README.md) 八项 × [OpenClaw 文档](https://docs.openclaw.ai/) 公开产品面  
> 进度单源：[`../migration.md`](../migration.md)、[`../status.md`](../status.md)

覆盖率为相对 OpenClaw **同维能力的主观粗估**，非代码行数或测试通过率。minibot 文档定位是学习向 agent 实验室，不是 OpenClaw 功能百分比竞赛。

## 粗估

| 尺子 | 覆盖 |
|------|------|
| 整体产品面 | ~30–40% |
| 核心 Agent 闭环 | ~55–65% |
| IM / 多端产品面 | ~15% |

**尺子含义**

- **核心 Agent 闭环** = 单用户、WebUI、本地工具、会话持久化能否稳定跑通一轮。
- **整体产品** = 再加 IM 广度、官方多端、插件市场、浏览器/媒体、多 agent、运维 daemon。

## 一句话

就「对话 → 模型 → 工具 → 会话/记忆 → cron」这条主链，minibot 已接近可用的轻量运行时；相对 OpenClaw，缺口主要在频道广度、设备节点、浏览器/媒体、多 agent、插件生态与运维产品化——不是再补一个工具就能追平。

## README 八项对照

| 能力 | 覆盖 | minibot | OpenClaw | 差距要点 |
|------|------|---------|----------|----------|
| Agent 对话 | ~70% | WS 流式、多会话、对话/频道分流；Composer 仍缺队列/重试/@ 文件等 | Control UI + 多端；block streaming、steering、中途插话 | 核心闭环可用；产品级聊天气泡与命令面仍薄 |
| 多模型 | ~55% | OpenAI 兼容 + Anthropic；平台多 slot builtins + Auto 首可用；preset + fallback；Azure/Bedrock/OAuth stub | 广 provider 矩阵；Codex/Copilot 等 plugin harness；按 model 选 runtime | 日常切模型 + 运营方内置够用；平台 Auto 尚无跨模型失败切换；订阅制/Harness/全量 provider 仍差 |
| 工具执行 | ~40% | fs / shell(E2B) / web / MCP / sync spawn；HITL 审批 | 上述 + browser / apply_patch / nodes / media / code mode / tool search / swarm | coding+MCP 主路径在；浏览器、设备节点、媒体生成几乎空白 |
| 记忆与技能 | ~35% | JSONL 会话、workspace memory、Skills；可选 minikb | Active Memory 溯源、Dreaming、ClawHub、Skill Workshop、per-agent skills | 有「能用的 memory/skills」；缺市场与记忆治理深度 |
| 定时任务 | ~50% | Cron / Automations MVP（创建、启停、立即跑） | cron + heartbeat + TaskFlow 耐久编排 + standing orders | 定时触发 agent 有了；自主 heartbeat / 可恢复长任务未齐 |
| IM 频道 | ~15% | 飞书、微信（iLink）；pairing 雏形 | WhatsApp/Telegram/Discord/Slack/iMessage/Signal/Matrix/Teams… 插件化 20+ | 最大产品差距：频道广度与路由/多账号 binding |
| 可观测 | ~35% | mini-langfuse 旁路 + `trace.html` | Gateway doctor、Control UI、节点健康、运维诊断成熟 | 学习向可视化有；生产运维面仍弱 |
| 多端入口 | ~35% | 本仓 WebUI + minibot-react-native（同协议） | 官方 Web + macOS/iOS/Android Nodes（相机/语音/Canvas） | 有客户端协议；缺官方 Nodes / 设备动作面 |

## README 之外的大块缺口

| OpenClaw 能力 | 严重度 | minibot 现状 |
|---------------|--------|--------------|
| Multi-agent routing（多 agent + bindings） | 大 | 基本单 agent；A2A 仅 roadmap（见 [`../roadmap/a2a-agents.md`](../roadmap/a2a-agents.md)） |
| Plugin / ClawHub 生态 | 大 | 无 marketplace；MCP/preset 本地配置 |
| Browser automation + 云浏览器 | 大 | Phase 19 可选；未做 |
| Media（图/音/视频/TTS）+ 转写 | 大 | Phase 8 / 19 未做 |
| Long task / Goal / TaskFlow | 中 | Phase 12 待写短计划 |
| OpenAI 兼容 `/v1` API | 中 | Phase 7 未做 |
| Daemon onboard / doctor / 官方 App | 中 | 本地 `minibot` 进程 + Docker demo |

## 怎么读这个差距

### 已接近的

- ReAct loop + session lock + bus
- 流式 / reasoning / Stop
- fs · shell · web · MCP · cron
- memory / skills / compaction
- HITL 工具审批、fallback

### 刻意后置的（见 migration checklist）

- 全量 IM Gateway（Phase 15）
- 多用户 / Pairing（Phase 14）
- Long goal（Phase 12）
- TTS + 云浏览器（Phase 19）
- Trajectory / ACP（Phase 20）

### 更近的参照系

行为对照是 **nanobot**（Python 轻量网关），不是 OpenClaw 全量产品。相对 nanobot WebUI 路径：核心已大多落地；相对 OpenClaw：仍是子集 + 实验室。

## 若只追 README 体验

优先补齐不会立刻变成 OpenClaw，但会明显缩小「日常好用」差距：

1. Phase 8 media / commands
2. Composer P0（队列 / 重试 / 复制）
3. Phase 7 `/v1`
4. Phase 12 long goal
5. 再视需要扩频道

追平频道与 Nodes / ClawHub 属于另一条产品线量级。

## 来源

- [`../../README.md`](../../README.md)
- [`../migration.md`](../migration.md)
- [`../status.md`](../status.md)
- [OpenClaw 首页](https://docs.openclaw.ai/)
- [OpenClaw Tools overview](https://docs.openclaw.ai/tools)
