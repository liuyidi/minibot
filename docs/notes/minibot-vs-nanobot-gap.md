# minibot vs nanobot — 能力差距

> 评估日：2026-08-05  
> 对照对象：本地 [`nanobot`](https://github.com/HKUDS/nanobot)（minibot 迁移的行为参照）  
> 进度单源：[`../migration.md`](../migration.md)、[`../status.md`](../status.md)  
> 更远参照：[`minibot-vs-openclaw-gap.md`](./minibot-vs-openclaw-gap.md)

minibot 以 nanobot 为**行为参照重写** FastAPI 运行时，目标是让 WebUI 可默认只打 minibot（`:8766`）。覆盖率为相对 nanobot **同维能力的主观粗估**。

## 粗估

| 尺子 | 覆盖 |
|------|------|
| WebUI 主路径（会话 / 流式 / 工具 / 设置 / cron / MCP） | ~70–80% |
| 完整产品面（频道 / CLI / SDK / media / goals / Dream） | ~45–55% |
| IM 频道广度 | ~15%（飞书 + 微信 vs 17 个频道包） |

migration 门票口径：MSV=2+6 可切 WebUI 后端；**MSV=4 后可称「和 nanobot WebUI 对等」**；MSV=9 正式切换。当前约 **MSV≈6.5**（核心主链已通，Phase 8/9/7/12 等未齐）。

## 一句话

**核心 Agent 闭环（Loop / Runner / 流式 / fs·shell·web·MCP / memory·skills / cron / HITL）已大体对齐 nanobot WebUI 可用路径**；差距集中在：频道全家桶、OpenAI `/v1`、media/转写、Dream 与 long-goal、async subagent、CLI/SDK/插件化、以及 Composer / Settings 产品抛光。

## 分维对照

| 维度 | 覆盖 | minibot | nanobot | 差距要点 |
|------|------|---------|---------|----------|
| Agent 闭环 | ~85% | Loop + Bus + JSONL + session lock + ReAct Runner | 同构：Loop / Runner / Bus / session | 主链齐；细节策略与 slash 面仍少 |
| 流式 / Stop | ~80% | `delta` / reasoning / abort；WebUI+DevUI | 同类 multiplex WS | Composer 队列下一条、重试/复制等未齐 |
| 文件系统 / shell / web | ~75% | read/write/edit/list、grep/find、exec（local/E2B）、web_search/fetch | 另有 `apply_patch`、exec sessions、`bwrap` sandbox、更多搜索后端 | 缺 apply_patch、长 exec session、搜索后端广度 |
| Subagent | ~50% | sync `spawn`（深度 2） | `spawn` + SubagentManager；async 更完整 | Phase 2.5 async 未做 |
| MCP | ~75% | presets、stdio/SSE/HTTP、动态工具、mcp.html | presets + Cursor import + Settings 全流程 | Cursor 导入 / 设置深度略弱 |
| Memory / Skills | ~55% | MEMORY.md + read/write_memory；内置少量 skills | **Dream** 两阶段巩固 + `/dream*`；skills 市场（skills.sh） | 缺 Dream；缺技能市场 |
| Cron / Automations | ~70% | Automations REST + Dev UI | cron tool + automations + heartbeat cron + `nanobot trigger` | 缺 heartbeat 模板任务、本地 trigger CLI |
| Long goal | ~10% | WS 有 `goal_status` 痕迹；无完整工具 | `create_goal` / `update_goal` + `/goal` | **Phase 12 未做** |
| Providers | ~55% | OpenAI-compat 族 + Anthropic + preset fallback；平台多 slot + Auto 首可用；Azure/Bedrock stub | 40+ registry；Codex/Copilot/xAI OAuth；Responses API；图生/转写 provider | OAuth / 云厂商 / 媒体 provider 大缺口；平台 Auto 无跨模型失败切换 |
| OpenAI `/v1` API | 0% | 未暴露 | `nanobot serve`：`/v1/chat/completions` + `/v1/models` | **Phase 7** |
| IM 频道 | ~15% | 飞书、微信 + pairing 雏形 | 17 包：Telegram/Discord/Slack/WhatsApp/… | 刻意后置 Phase 15；非 WebUI 对等阻塞项 |
| Pairing / 多用户 | ~30% | 频道级 Feishu/Weixin pairing | 全局 pairing store + Settings 审批 + `/pairing` | Phase 14 独立评估 |
| 可观测 | ~45% | mini-langfuse 旁路 + `trace.html`（导出自检页已取消） | optional Langfuse + Settings usage | 跨会话看 Langfuse UI 即可 |
| WebUI 产品 | ~65% | 会话/流式/工具卡/HITL/Settings 子集/频道/Automations/Skills | media 附件、语音、file-preview、slash、技能市场、OAuth、完整 Settings | **Phase 8** + Composer UX 剩余 |
| Dev UI / 学习面 | **超集** | 大量 `/ui/*.html` 正常+异常对照 | 无对等实验室页 | minibot **强于** nanobot（设计目标） |
| CLI / SDK | ~10% | `minibot` 起服务 + 少量 cli_chat | `gateway`/`webui`/`agent`/`serve`/`plugins`/`provider login` + Python SDK | 产品入口差距大 |
| 安全 | ~60% | workspace + SSRF + HITL + E2B | workspace + SSRF + `bwrap` + network safety 开关 | sandbox 形态不同；策略配置 UI 待补 |
| 知识库 | **超集** | 可选 minikb 工具 + Knowledge Dev UI | 无内置 minikb | minibot 特有 |

## nanobot 有、minibot 明显缺的（按影响）

### 阻塞「日常 WebUI 对等体验」的

1. **Phase 8** — media / file-preview / slash commands / 转写 / `/model` 等  
2. **Composer UX 剩余** — 队列下一条、复制、重试、@ 文件、diff 预览  
3. **Phase 7** — `/v1/chat/completions` + `/v1/models`（对接外部客户端）  
4. **Dream 记忆巩固** — nanobot 长期记忆差异化能力  
5. **Phase 12** — long task / sustained goal  

### 产品广度（可不阻塞 WebUI 主路径）

| 项 | nanobot | minibot |
|----|---------|---------|
| IM 频道全家桶 | 17 包插件化 | 飞书 + 微信 |
| CLI 全家桶 + 服务安装 | ✅ | ❌ |
| Python SDK | ✅ | ❌ |
| apply_patch / exec sessions | ✅ | ❌ |
| 图生 / 转写 / 语音录制链路 | ✅ | UI 壳或 stub |
| Skills 市场 | ✅ | 本地 catalog |
| Provider OAuth（Codex/Copilot/xAI） | ✅ | ❌ |
| Heartbeat + `nanobot trigger` | ✅ | ❌ |
| Session 导出/导入 | ✅（能力面更全） | Phase 13 未做 |
| Async subagent | ✅ | Phase 2.5 未做 |

## minibot 有、nanobot 没有（或更弱）的

- **Dev UI Insight 实验室**（race / tools / mcp pipeline / runtime fault inject 等）— 学习优先产物  
- **HITL 审批卡片**做成一等公民（持久化 + REST/WS + WebUI/DevUI）  
- **E2B** 作为 exec backend 选项  
- **minikb** 只读知识库转发  
- **mini-langfuse** 作为一等旁路集成（nanobot 是 optional Langfuse extra）

## 对照 migration checklist（未实现）

摘自 [`../migration.md`](../migration.md) §B（与 nanobot 对等相关）：

| 优先级 | 项 | 与 nanobot 关系 |
|--------|----|-----------------|
| 下一主线 | Composer / Phase 8（`/v1` 放最后） | 产品对话优先；`nanobot serve` 对齐后置 |
| 体感 | Composer UX 剩余 | 对齐 WebUI 好用度 |
| 收尾 | Phase 8 media/commands/… | **WebUI 对等关键路径** |
| 收尾 | Phase 12 long goal | 对齐 goals |
| 收尾 | Phase 13 session 导出导入 | 对齐会话可携 |
| 收尾 | Phase 2.5 async subagent | 对齐异步委派 |
| 收尾 | Phase 9 正式切换 | deprecate legacy 路径 |
| 低优 | Phase 14 pairing / 15 IM Gateway… | 对齐频道与多用户 |

## 建议读法

1. 若问题是「**WebUI 日常对话能不能换 minibot**」→ 主链已接近；还差 Phase 8 + Composer 抛光 +（按需）`/v1`。  
2. 若问题是「**能不能替代整份 nanobot 网关**」→ 还差频道全家桶、CLI/SDK、Dream、goals、媒体与 provider 广度，量级接近半个产品。  
3. 若问题是「**学懂 agent 怎么跑**」→ minibot Dev UI 已超过 nanobot；差距文档本身也是学习产物。

## 来源

- minibot：[`../status.md`](../status.md)、[`../migration.md`](../migration.md)、代码树 `minibot/src/minibot/`、`webui/`  
- nanobot：本地 `/Users/liuyidi/github/nanobot` 的 `README.md` / `AGENTS.md`、`nanobot/channels|agent/tools|providers|api|cli`
