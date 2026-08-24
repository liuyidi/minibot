# minibot Desktop（本机 gateway）

[English](./README.md) | 简体中文

> 默认桌面端。  
> 设计：[`docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md`](../docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md)  
> 发布流程：[`docs/release-process.md`](../docs/release-process.md)

**默认连本机 `http://127.0.0.1:8766`**，由壳拉起本地 minibot，WebUI 由该 gateway 提供。会话 / 配置落在 `~/.minibot`（`MINIBOT_SERVER_DATA_DIR`；可用 `MINIBOT_HOME` 覆盖）。

## 整体架构

```text
┌─────────────────────┐     拉起       ┌──────────────────────────────┐
│  desktop (Tauri)    │ ─────────────► │  minibot sidecar / PATH      │
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
cd desktop
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

要在开发机测试 **`minibot://` 浏览器回调**（与正式包一致），需先注册 URL scheme：

```bash
cd desktop
./scripts/deeplink/register-url-scheme.sh
```

`npm run dev` 本身不会向系统注册 `minibot://`；上述脚本会构建 debug `.app` 并用 `lsregister` 注册。详见 [`scripts/README.md`](./scripts/README.md)。

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
cd desktop
./scripts/sidecar/prepare-sidecar.sh              # 或传入 <triple>
npm run build:app                                 # 仅 .app（ad-hoc）
# npm run build                                   # app + dmg（ad-hoc）
```

脚本目录说明：[`scripts/README.md`](./scripts/README.md)。

打包产物统一在 `src-tauri/target/release/bundle/`（macOS：`macos/minibot.app`、`dmg/minibot_*.dmg`）。  
Renderer 静态文件在同目录树的 `src-tauri/target/frontend-dist/`（构建中间产物，勿当安装包取用）。

`sidecar/prepare-sidecar.sh` 把 onedir 拷到 `src-tauri/resources/minibot-sidecar/`  
（已 gitignore；写入 `tauri.conf.json` 的 `bundle.resources`）。安装包内解析该路径时 label 为 `bundled`。

### macOS 正式签名 + 公证（Developer ID）

密钥不要进 Git。复制 `scripts/signing/apple-signing.env.example` → `scripts/signing/apple-signing.env`（已 gitignore），填入 Apple 开发者凭据后：

```bash
cd desktop
./scripts/signing/build-signed-macos.sh           # 本机 triple
# ./scripts/signing/build-signed-macos.sh aarch64-apple-darwin
```

该脚本会：codesign 预检 → prepare sidecar → **签名 sidecar 内 Mach-O** → `npm run build`（Tauri 签名 app 并公证）→ 验证产物。请在 **Terminal.app** 运行（Cursor agent 无法访问钥匙串）。

| 变量 | 本地打包 | GitHub Actions |
|---|---|---|
| `APPLE_SIGNING_IDENTITY` | 需要 | 同名 secret |
| `APPLE_TEAM_ID` | 需要 | 同名 secret |
| `APPLE_ID` | 需要 | 同名 secret |
| `APPLE_PASSWORD` | App 专用密码 | 同名 secret |
| `APPLE_CERTIFICATE` | 通常不需要（用钥匙串） | base64 `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | 通常不需要 | `.p12` 导出密码 |

CI 在 [`.github/workflows/publish-desktop.yml`](../.github/workflows/publish-desktop.yml) 的 `tauri-action` 步骤注入上述 secrets 后，Release 里的 macOS 包即为 Developer ID 签名并公证的包。`tauri.conf.json` 中 `signingIdentity: "-"` 保留给本地 ad-hoc；CI 由 `APPLE_SIGNING_IDENTITY` 环境变量覆盖。

### 打开 ad-hoc 本地包

本地 `npm run build`（未走 `build-signed-macos.sh`）为 ad-hoc 签名。若 Gatekeeper 提示「已损坏」：

```bash
# 把 minibot.app 拖进 /Applications 之后
xattr -cr "/Applications/minibot.app"
# 若仍提示已损坏：
codesign --force --deep --sign - "/Applications/minibot.app"
open "/Applications/minibot.app"
```

## 5. CI 发布 + 飞书通知

工作流：[`.github/workflows/publish-desktop.yml`](../.github/workflows/publish-desktop.yml)

| | |
|---|---|
| 触发 | 统一 **Release** tag `v*`，或手动 `workflow_dispatch` |
| 矩阵 | macOS arm64 / macOS x86_64（`macos-15-intel`）/ Linux / Windows |
| 步骤 | `uv sync` → 构建 WebUI → freeze → `sidecar/prepare-sidecar.sh` → `tauri-action` |
| Release tag | `desktop-v__VERSION__`（**不**与编排 tag `v*` 冲突） |
| OSS | 发布成功后自动跑 **Sync Desktop Release to OSS** |
| 通知 | 成功后 → ServerlessShip → 飞书；OSS 同步再发一次 |

公开下载页：`https://liuyidi.me/minibot/download/`（清单 `https://downloads.liuyidi.me/minibot/releases.json`）。

已安装包身份：应用名 `minibot`，bundle id `me.liuyidi.minibot.desktop`，GitHub tag `desktop-v*`。
