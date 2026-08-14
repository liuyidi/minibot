# 更新日志

记录 **minibot** 面向用户的重要变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。
版本采用产品叙事用的 SemVer；包元数据可能在正式发版前暂未对齐。

English: [CHANGELOG.md](./CHANGELOG.md)

---

## [Unreleased]

## [1.0.4] - 2026-08-14

## [1.0.4] - 2026-08-14

### 修复

- 个人资料页在鉴权信息加载完成前，不再短暂显示兜底名 `minibot`。

### 新增

- 按用户隔离 IM 配置、工作区与可观测标签，并在启动时迁移旧数据。

## [1.0.3] - 2026-08-14

### 新增

- 设置页新增个人资料：可编辑昵称、随机默认头像，以及用户 ID / 注册时间。
- 个人资料页预留 Token 用量看板前端，默认隐藏，待后端接口就绪后再打开。
- mini-auth 账号信息透传用户 ID 与注册时间，供账号详情展示。

### 变更

- 侧边栏账号菜单可直接进入个人资料，并展示本地头像。

## [1.0.2] - 2026-08-13

### 变更

- 生产认证切换为 mini-auth 全链路，回调地址可在反代后保持 HTTPS。
- 生产主机关闭旧的 gateway 密码兜底，`bot.liuyidi.me` 直接进入共享登录流程。

### 修复

- ECS 部署 workflow 兼容当前仓库检出方式与 `.env` 读取方式。
- 在阿里云 / 腾讯云反代场景下，认证跳转不再退回到 `http://` 回调地址。

## [1.0.1] - 2026-08-13

### 新增

- 各端 version 统一。
- 对话框支持 `/compact` 命令压缩上下文。
- 支持统一的 Web / Server GitHub Actions 部署到 ECS，并通过飞书通知。

---

## [1.0.0] - 2026-08-11

### 新增

- 用 Rust 封装桌面端，覆盖 macOS / Windows / Linux，并补齐下载页、整体构建与打包流程。
- 新增构建与部署自动化：借助 GitHub Actions、webhooks 和 ServerlessShip，把部署通知同步到飞书。

---

## [0.9.0] - 2026-08-09

### 新增

- Composer 支持 Cursor 风格的 `/` 技能选择与 `@` 提及 chips。

### 修复

- 消息气泡中 mention chips 与后续文字重叠。
- WebUI 生产构建的 TypeScript 错误。

---

## [0.8.0] - 2026-08-06

### 新增

- Skills · Connectors 中心：搜索、分区、安装 / 自定义 / 导入。
- Skills WebUI 闭环：available / detail API 与 prompt 过滤。
- Heartbeat（默认 1h）与 Dream 薄巩固（默认关 / 2d）系统定时任务。
- WebUI 侧栏会话置顶、归档、重命名持久化。

### 变更

- Settings 改为轻量壳 + 分区页面，结构更清晰。
- Automations API 加固（origin / POST 变更 / 删会话级联）。

### 修复

- 工具结果泄漏到对话正文。
- 侧栏持久化改用正确的 POST 变更路径。

---

## [0.7.0] - 2026-08-06

### 新增

- 平台内置多 slot 模型（`.env.models`），Models 单选与 Auto（首个有 key 的 slot）。
- 身份锚定；对话实际模型解析尊重 Auto / 平台选择。

---

## [0.6.0] - 2026-08-06

### 新增

- 对话内媒体 / 文件预览（Phase 8.1）。

### 变更

- WebUI Composer 附件与文件相关体验打磨。

---

## [0.5.1] - 2026-08-05

### 新增

- IM 频道卡片：编辑 / 删除菜单与启用开关。

### 变更

- 侧栏拆成 **对话** 与 **频道**；IM 扫码接入更快。
- 单体仓库品牌与命名统一为 minibot。

---

## [0.5.0] - 2026-08-05

### 新增

- 飞书频道：扫码接入与私聊配对。
- 微信（iLink）频道：扫码登录与私聊配对。
- IM 频道、定时任务、技能、知识库提升到主侧栏。

---

## [0.4.0] - 2026-08-05

### 新增

- `exec` 工具可选 **E2B** 云微虚拟机后端（默认仍为本地）。

---

## [0.3.1] - 2026-08-05

### 新增

- 日用量 LLM 预算 kill-switch；触顶后在 WebUI 可见。
- 可观测评分 score queue 接线。

---

## [0.3.0] - 2026-08-03

### 新增

- 高风险工具 Human-in-the-loop（HITL）审批（持久化 + REST / WebSocket 卡片）。详见 [docs/human-in-the-loop.md](./docs/human-in-the-loop.md)。

---

## [0.2.0] - 2026-07-31

### 新增

- Desktop 作为远程薄壳，复用同一套 minibot REST + WebSocket。

### 修复

- 关闭 WebSocket permessage-deflate，兼容 iOS `URLSessionWebSocketTask`。

---

## [0.1.0] - 2026-07-30

首个对外可演示的完整切片（相对 `0.0.x` 骨架与能力补齐）。

### 新增

- 用户 model preset 失败时的 **Fallback** 切换（toast / runtime 可见）。
- 共享客户端包（`@liuyidi/minibot-client`）。
- 公开 `/status` 网关健康与可用性页。
- 可选 mini-langfuse 软旁路可观测（默认关）。
- 可选 minikb 知识库工具 + Knowledge UI。

---

## [0.0.10] - 2026-07-28

### 新增

- Provider registry；**Anthropic** Messages 实现（chat + 流式）。
- Dev UI Providers 页；配置导入向导 MVP。

---

## [0.0.9] - 2026-07-27

### 新增

- WebSocket **流式**回复（`delta` / `reasoning_*` / `stream_end`）。
- 生成中 **Stop** 中断本轮。

---

## [0.0.8] - 2026-07-26

### 新增

- Cron / 自动化：按时触发 agent 回合（`at` / `every` / `cron`）。
- Automations Dev UI（`/ui/automations.html`）。

---

## [0.0.7] - 2026-07-25

### 新增

- 用户 **Model presets**（BYOK）：新建 / 切换 / 激活 OpenAI 兼容端点。
- Settings 侧栏 Model 区。

---

## [0.0.6] - 2026-07-24

### 新增

- **MCP** 服务预设（stdio / SSE / HTTP），工具注入 Agent Registry。
- MCP Insight UI（模板 / Invoke / pipeline）。

---

## [0.0.5] - 2026-07-22

### 新增

- **Memory** 文件读写与 system 注入。
- **Skills** 发现（内置 + 工作区）并注入 Agent 上下文。
- Memory / Skills Dev UI 页。

---

## [0.0.4] - 2026-07-18

### 新增

- Context 组装（identity / workspace bootstrap 文件）。
- 长会话 **上下文压缩**（summary + 保留最近消息）。
- Context usage 与 `/ui/context.html`。

---

## [0.0.3] - 2026-07-14

### 新增

- 同步子代理 **spawn**（阻塞等待子 agent，结果回流父 turn）。

---

## [0.0.2] - 2026-07-08

### 新增

- 真实 coding 工具：文件系统读写改、本地 **exec**、网页搜索 / 抓取。
- Chat **工具调用卡片**（过程旁白 + done 卡片；事后回放）。
- Workspace 边界与基础工具安全拒绝。

---

## [0.0.1] - 2026-07-01

### 新增

- 本地优先 **FastAPI** Agent 运行时（AgentLoop + MessageBus + ReAct Runner）。
- 多会话 **JSONL** 历史；OpenAI 兼容 Provider。
- 内嵌 Dev UI（`/ui/` Chat / Trace / Runtime 等）与产品 WebUI 路径骨架。
- 配置密钥后的 bootstrap 鉴权（`X-Minibot-Auth` / Bearer）。
