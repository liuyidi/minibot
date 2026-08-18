# minibot Desktop V2（本机 gateway）

[English](./README.md) | 简体中文

> 默认桌面端。`desktop/` 远程薄壳已退役。  
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
| `MINIBOT_SERVER_PLATFORM_PROXY_BASE_URL` | 云端平台模型代理（默认 `https://bot.liuyidi.me`） |
| `MINIBOT_ENV_MODELS` | 可选本地 `.env.models`（**仅开发 BYOK**，不要用来给用户发密钥） |

**对外桌面端：** 平台模型走云端 `/platform/v1` 代理，`.app` 内不含厂商 key。  
不要把运营方的 `.env.models` 分发给最终用户。

## 2. 登录流程（系统浏览器）

未登录桌面显示欢迎 / Sign in。**即便是正式安装包，本机 gateway 仍监听 `127.0.0.1:8766`**（不是 `bot.liuyidi.me`）；只有身份提供方是公网 `auth.liuyidi.me`。

完整链路（正式包，推荐）：

1. WebUI 检测到 `minibotHost.openLogin` → `GET /auth/desktop/authorize` 拿到带 **`minibot://auth/callback`** 的 authorize URL → 系统浏览器直接打开 `https://auth.liuyidi.me/oauth/authorize?…`（地址栏不出现本机 IP）。
2. 桌面停留在「登录中…」等待页，可 **复制登录链接** / **重新发起登录**。
3. 登录完成后浏览器回调 `minibot://auth/callback?code&state` → 壳 `POST /auth/desktop/complete` → WebView 打开 `/auth/desktop/session?token=…` 写 cookie。
4. 可选：`minibot://auth/done` 仅用于聚焦窗口。

开发态兜底（`tauri:dev` 未注册协议时）：仍可用 loopback  
`http://127.0.0.1:8766/auth/login?desktop=1&desktop_login_id=…` → HTTP callback → `/auth/desktop/handoff` 轮询。

### 退出登录

确认对话框后只清本机 minibot 会话（`/auth/logout?local=1`），**不**打开浏览器清 IdP。再次登录时可沿用浏览器里已登录的账号。

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

### 打开未公证的 macOS 安装包

CI 使用 ad-hoc 签名（`signingIdentity: "-"`）。从 GitHub 下载后若仍提示「已损坏」：

```bash
# 把 minibot V2.app 拖进 /Applications 之后
xattr -cr "/Applications/minibot V2.app"
# 若仍提示已损坏：
codesign --force --deep --sign - "/Applications/minibot V2.app"
open "/Applications/minibot V2.app"
```

## 5. CI 发布 + 飞书通知

工作流：[`.github/workflows/publish-desktop-v2.yml`](../.github/workflows/publish-desktop-v2.yml)

| | |
|---|---|
| 触发 | 统一 **Release** tag `v*`，或手动 `workflow_dispatch` |
| 矩阵 | macOS arm64 / macOS x86_64（`macos-15-intel`）/ Linux / Windows |
| 步骤 | `uv sync` → 构建 WebUI → freeze → prepare → `tauri-action` |
| Release tag | `desktop-v2-v__VERSION__`（**不**与编排 tag `v*` 冲突） |
| OSS | 发布成功后自动跑 **Sync Desktop Release to OSS** |
| 通知 | 成功后 → ServerlessShip → 飞书；OSS 同步再发一次 |

已退役薄壳仍在 [`.github/workflows/publish-desktop.yml`](../.github/workflows/publish-desktop.yml)（`desktop/`，**仅手动**）。

公开下载页：`https://bot.liuyidi.me/#/download/`（清单 `https://downloads.liuyidi.me/minibot/releases.json`）。

## 与已退役 V1 对比

| | desktop (V1，已退役) | desktopV2（默认） |
|---|---|---|
| 默认 API | `bot.liuyidi.me` | `127.0.0.1:8766` |
| 进程 | 不拉起 | sidecar / `minibot` |
| 登录 | Web 同源 | 系统浏览器 + HTTP handoff（可选 `minibot://` 聚焦） |
| bundle id | `me.liuyidi.minibot.desktop` | `me.liuyidi.minibot.desktopv2` |
| 发布 | `Publish Desktop`（手动） | `Publish Desktop V2` → `desktop-v2-v*` + OSS |
