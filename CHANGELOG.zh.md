# 更新日志

记录 **minibot** 面向用户的重要变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。
版本采用产品叙事用的 SemVer；包元数据可能在正式发版前暂未对齐。

English: [CHANGELOG.md](./CHANGELOG.md)

---

<!-- #region site-changelog -->
## [Unreleased]

## [1.0.20] - 2026-08-27

### 变更

- 移动端唤端 `/#/open` 页固定显示中文文案，不再受浏览器语言影响。

## [1.0.19] - 2026-08-27

### 变更

- 移动端唤端入口改为 hash 路由 `/#/open`，并移除了 Python 里专门的 `/open` 页面分发逻辑。

## [1.0.18] - 2026-08-27

### 新增

- 新增 `/open` 移动端唤端页，包含顶部引导 banner 与系统风格启动提示。

### 变更

- `/open` 现在在 iOS 和 Android 上通过 `minibot://` 唤起 App，并按平台保留不同的回退策略。

## [1.0.17] - 2026-08-25

### 新增

- 公开下载页：`https://liuyidi.me/minibot/download/`（免登录）。旧地址 `bot.liuyidi.me/#/download/` 会跳转到新页。

### 修复

- 还原 Langfuse demo 密钥跳过逻辑，恢复使用 demo 密钥时的对话 👍/👎 反馈。
- 桌面端本地引擎改用 `~/.minibot`（工作区 `~/.minibot/workspace`），不再使用 Tauri app data 下的 `engine/`。
- 对话：首条用户消息从顶部区域出现，不再贴在输入框上方。
- 技能：技能页与 `/` 面板中的内置技能标题/描述统一中英文（zh-CN / en）。

## [1.0.16] - 2026-08-23

### 修复

- 首次进入 WebUI：自动选择平台模型、预置 MCP 连接器、下载/开发笔记外链指向生产域名、设置页工作区展示、空对话布局、侧栏品牌 Logo、技能页中英文缺失项。
- macOS DMG 安装背景增加「拖到应用程序」图示。
- Langfuse：忽略 demo 密钥，避免 MLF 将 trace 写入共享 demo 项目。

## [1.0.15] - 2026-08-21

### 新增

- CLI（`minibot`）远程客户端：`status` / `sessions` / `chat`，走统一 Client API。
- Gateway bootstrap 支持 mini-auth `Authorization: Bearer`，CLI `login` 后无需共享 gateway secret 即可开聊。

## [1.0.14] - 2026-08-20

### 新增

- 设置「个人资料」在已绑定 Google 时展示账号（展示名），行为与 GitHub 一致。

### 修复

- Web 端退出登录会走 `/auth/logout` 清掉 mini-auth SSO；原先只清本地再跳登录，会被 SSO 立刻登回去。
- Web 端切换「默认权限 / 完全访问权限」会写入当前会话，完全访问下越界 `exec` 不再弹出审批。

### 变更

- 公开下载改为本机 gateway 桌面端。源码目录为 `desktop/`（由 `desktopV2/` 改名）；旧远程薄壳目录已删除。
- `liuyidi.me` 入口页改为 Direction 02：白底近黑、入口整卡、黑主按钮「打开 Agent」。
- `liuyidi.me` 首页改为 minibot 产品页：突出多端 / 多渠道 / Agent，并给出 Desktop 下载。

## [1.0.13] - 2026-08-17

### Changed

- 「复制登录链接」成功后按钮显示「已复制」约 3 秒。
- 删除未再使用的桌面 IdP 登出落地页（登出仅清本地会话）。

## [1.0.12] - 2026-08-17

### 新增

- 桌面登录：系统浏览器直接打开 `auth.liuyidi.me`，回调走 `minibot://`；等待页支持复制登录链接 / 重新发起登录。

### 变更

- 退出登录需确认；仅清除本机会话，不再打开浏览器清除账号中心登录态（再次登录可沿用已登录账号）。

## [1.0.11] - 2026-08-17

### 修复

- 桌面端不再显示红色 ``local-webui`` 调试角标（本机 gateway 对 Desktop V2 是正常形态）。

## [1.0.10] - 2026-08-17

### 新增

- 桌面本机 gateway 可通过云端 `/platform/v1` 使用平台模型：登录用户无需在 `.app` 内携带厂商 API key；短时桌面推理 token 与独立桌面日额度由 `bot.liuyidi.me` 签发与计量。

## [1.0.9] - 2026-08-15

### 新增

- Desktop V2：PyInstaller onedir 冻结本地 gateway、打进 Tauri 安装包，并通过独立的 `Publish Desktop V2` 工作流发布（经 ServerlessShip 飞书通知）。
- 桌面端：完成本地 OAuth 交接（系统浏览器 → HTTP 回调 → 应用内会话）与欢迎登录页。

## [1.0.8] - 2026-08-15

### 变更

- 工具审批改为边界策略：工作区内读写 / `write_memory` / 普通沙箱 `exec` / MCP（暂默认信任）直接执行；仅「越界/出沙箱」的 `exec`（如 `sudo`、访问 `/etc`、`~`、管道进 shell 等）弹出审批。MCP trust 开关延后。
- Web 端对话框不再提供「选择项目」；固定使用默认工作区。桌面端（native host）仍可选择本地文件夹。

## [1.0.7] - 2026-08-14

### 修复

- WebSocket / 飞书 / 微信 / 定时任务经 MessageBus 时携带 `user_id`，BusWorker 按用户绑定会话目录，避免 `unknown_chat` 与「模型正在回复」卡住。
- WebUI 在 `goal_status: idle` 与 `error` 时也会结束流式状态（不再只等 `turn_end`）。
- 修复 WebUI 生产构建因 stream hook 未使用类型导入失败的问题。

## [1.0.6] - 2026-08-14

### 修复

- 已登录请求的默认工作区改为 `users/<user_id>/workspace`，不再使用共享的服务器 `/workspace`。

## [1.0.5] - 2026-08-14

### 修复

- WebUI bootstrap 会把 mini-auth 登录账号写入短时 API/WS token，会话按用户隔离。
- WebSocket 与 REST 一样绑定用户身份，新建会话写入对应用户目录。

### 新增

- 个人资料页可展示来自 mini-auth 的 GitHub 绑定状态。

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
<!-- #endregion -->
