# minibot Desktop V2（本机 gateway）

[English](./README.md) | 简体中文

> 与 `desktop/`（远程薄壳）并存的实验目录。  
> 设计：[`docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md`](../docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md)  
> 计划：[`docs/superpowers/plans/2026-08-14-desktop-v2-local-gateway.md`](../docs/superpowers/plans/2026-08-14-desktop-v2-local-gateway.md)

**默认连本机 `http://127.0.0.1:8766`**，由壳拉起本地 minibot，WebUI 由该 gateway 提供。会话 / 配置落在 Tauri app data 的 `engine/`（`MINIBOT_SERVER_DATA_DIR`）。

## 整体架构

```text
┌─────────────────────┐     拉起       ┌──────────────────────────────┐
│  desktopV2 (Tauri)  │ ─────────────► │  minibot sidecar / PATH      │
│  WebView + host     │   127.0.0.1    │  FastAPI + 内嵌 WebUI dist   │
│  bridge             │ ◄───────────── │  数据 → {app_data}/engine    │
└─────────┬───────────┘                └──────────────┬───────────────┘
          │ openLogin（系统浏览器）                     │
          ▼                                           │ OAuth 回调
┌─────────────────────┐                               │（HTTP，本机）
│  mini-auth          │ ──────────────────────────────┘
│  auth.liuyidi.me    │     → /auth/desktop/done + handoff
└─────────────────────┘     → WebUI 轮询 /auth/desktop/handoff
```

引擎查找顺序（Rust `resolve_sidecar_command`）：

1. `MINIBOT_SIDECAR` — 可执行文件绝对路径（开发覆盖）
2. **打包内** PyInstaller onedir：`resources/minibot-sidecar/`
3. PATH 上的 `minibot`

## 1. 本地开发

```bash
# 终端 A — gateway（PATH / MINIBOT_SIDECAR 可用时可省略）
cd minibot
MINIBOT_SERVER_AUTH_PROVIDER=mini_auth \
MINIBOT_SERVER_MINI_AUTH_BASE_URL=https://auth.liuyidi.me \
MINIBOT_SERVER_REQUIRE_AUTH=true \
uv run --no-sync python -m minibot

# 终端 B — 壳
cd desktopV2
npm install
npm run dev
```

常用环境变量：

| 变量 | 作用 |
|---|---|
| `MINIBOT_API_BASE` | Gateway 地址（默认 `http://127.0.0.1:8766`） |
| `MINIBOT_SIDECAR` | 强制指定引擎二进制（冻结产物或 uv 入口） |

## 2. 登录流程（系统浏览器）

未登录桌面显示欢迎 / Sign in。**即便是正式安装包，本机 gateway 仍监听 `127.0.0.1:8766`**（不是 `bot.liuyidi.me`）；只有身份提供方是公网 `auth.liuyidi.me`。

完整链路：

1. WebUI 检测到 `minibotHost.openLogin` → 生成 `desktop_login_id` → 系统浏览器打开本机  
   `http://127.0.0.1:8766/auth/login?desktop=1&desktop_login_id=…&next=…`  
   （`absoluteAuthUrl` = WebView 的 `window.location.origin`，即本地 gateway）
2. Gateway 302 到 mini-auth（`https://auth.liuyidi.me/oauth/authorize`）；登录完成后 **redirect_uri** 仍回到本机  
   `http://127.0.0.1:8766/auth/mini-auth/callback`（会话交接走 HTTP loopback，不依赖 `minibot://`）。  
   该 callback 必须在 mini-auth 客户端白名单中。
3. 回调写入短期 handoff，浏览器跳到 `/auth/desktop/done`。
4. 应用内 WebUI 轮询 `GET /auth/desktop/handoff?id=…`，再打开  
   `/auth/desktop/session?token=…` 写 cookie。
5. 可选：`minibot://auth/done` 仅用于**聚焦窗口**（不做第二次 PKCE）。macOS 上  
   `tauri:dev` **不会**注册自定义协议 — 需打一次 `.app` 并注册：

```bash
cd desktopV2 && ./scripts/register-url-scheme.sh
```

注意：Cursor 注入的 `HTTP_PROXY` 可能干扰本机 gateway 连 `auth.liuyidi.me`（gateway 对 mini-auth 的 httpx 使用 `trust_env=False`）。

## 3. 冻结 sidecar（PyInstaller onedir）

在**仓库根目录**执行（若无 WebUI dist 会先构建）：

```bash
./scripts/freeze-minibot-sidecar.sh              # 本机 triple
./scripts/freeze-minibot-sidecar.sh aarch64-apple-darwin
```

产物：

```text
dist/sidecar/<triple>/minibot-sidecar/
  minibot-sidecar          # 启动器
  _internal/               # Python + 内嵌 webui-dist + 包数据
```

冒烟：

```bash
BIN=dist/sidecar/aarch64-apple-darwin/minibot-sidecar/minibot-sidecar
MINIBOT_SERVER_HOST=127.0.0.1 MINIBOT_SERVER_PORT=8767 \
  MINIBOT_SERVER_REQUIRE_AUTH=false "$BIN" &
curl -fsS http://127.0.0.1:8767/health
```

规格与入口：`minibot/packaging/pyinstaller/`。

## 4. 打进 Tauri 包（本地打包）

```bash
# freeze 之后
cd desktopV2
./scripts/prepare-sidecar.sh                    # 或传入 <triple>
npm run build:app                               # 仅 .app
# npm run build                                 # app + dmg + collect
```

`prepare-sidecar.sh` 把 onedir 拷到 `src-tauri/resources/minibot-sidecar/`  
（已 gitignore；写入 `tauri.conf.json` 的 `bundle.resources`）。安装包内解析该路径时 label 为 `bundled`。

## 5. CI 发布 + 飞书通知

工作流：[`.github/workflows/publish-desktop-v2.yml`](../.github/workflows/publish-desktop-v2.yml)

| | |
|---|---|
| 触发 | 仅手动 `workflow_dispatch`（下载页切换前） |
| 矩阵 | macOS arm64 / macOS x86_64（`macos-13`）/ Linux / Windows |
| 步骤 | `uv sync` → 构建 WebUI → freeze → prepare → `tauri-action` |
| Release tag | `desktop-v2-v__VERSION__`（**不**与薄壳 `v*` 冲突） |
| 通知 | 成功后 → ServerlessShip → 飞书（`channel: GitHub Release (Desktop V2)`） |

薄壳仍走 [`.github/workflows/publish-desktop.yml`](../.github/workflows/publish-desktop.yml)（`desktop/`，tag `v*`）。

下载页切到 V2 安装包需等 CI 产物验证通过后再做。

## 与 V1 对比

| | desktop (V1) | desktopV2 |
|---|---|---|
| 默认 API | `bot.liuyidi.me` | `127.0.0.1:8766` |
| 进程 | 不拉起 | sidecar / `minibot` |
| 登录 | Web 同源 | 系统浏览器 + HTTP handoff（可选 `minibot://` 聚焦） |
| bundle id | `me.liuyidi.minibot.desktop` | `me.liuyidi.minibot.desktopv2` |
| 发布 | `Publish Desktop` → `v*` | `Publish Desktop V2` → `desktop-v2-v*` |
