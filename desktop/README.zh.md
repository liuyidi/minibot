# minibot Desktop（远程薄壳）

[English](./README.md) | 简体中文

[![Publish Desktop](https://github.com/liuyidi/minibot/actions/workflows/publish-desktop.yml/badge.svg)](https://github.com/liuyidi/minibot/actions/workflows/publish-desktop.yml)

Tauri 2 桌面应用连接 minibot WebUI，注入 `window.minibotHost`。

| 构建 | 默认 `api_base` |
|------|----------------|
| `npm run dev` / debug | `http://127.0.0.1:5173`（本地 Vite） |
| `npm run build` / release | [`https://bot.liuyidi.me`](https://bot.liuyidi.me/) |

可用 `MINIBOT_API_BASE` 或启动页覆盖；配置写入应用 data 目录下的 `server.json`。
Release 包会忽略其中的 localhost / `127.0.0.1`（避免沿用 `tauri:dev` 留下的地址而出现 `local-webui` 角标），并写回生产默认。

## 架构

```text
Tauri App
  ├─ 读取 api_base（MINIBOT_API_BASE → server.json → 构建默认）
  ├─ 探测 /webui/bootstrap（HTTPS 失败时可回退 HTTP IP）
  ├─ 注入 window.minibotHost
  └─ navigate → api_base/
```

不拉起本机 Python / minibot 进程。

## 使用

```bash
cd desktop
npm install
# 需本机 WebUI：cd ../webui && npm run dev
npm run dev
```

指向线上或其他地址：

```bash
MINIBOT_API_BASE=https://bot.liuyidi.me npm run dev
MINIBOT_API_BASE=http://127.0.0.1:8766 npm run dev
```

本地 Vite 顶栏会显示 `local-webui` 调试角标；生产域名不会。

连接失败时可在启动页修改服务地址。

## Host API（已注入）

| 方法 | 作用 |
|---|---|
| `getRuntimeInfo` | 连接状态 / api_base |
| `reconnect` / `restartEngine` | 重新探测并刷新 WebUI |
| `pickFolder` | 原生目录选择 |
| `openLogs` | 打开桌面端日志目录 |
| `exportDiagnostics` | 导出诊断文本 |

## 打包（macOS 本地）

```bash
cd desktop
npm run build          # 产出 .app + .dmg，并复制到 dist-bundle/
```

产物目录：`desktop/dist-bundle/`（已 gitignore）：

- `minibot.app`
- `minibot_1.0.0-beta.2_aarch64.dmg`

底层 Tauri 产物仍在 `src-tauri/target/release/bundle/`（或环境 `CARGO_TARGET_DIR`）；可用 `npm run collect-bundle` 单独再拷一次。

未签名分享时：

```bash
xattr -dr com.apple.quarantine /Applications/minibot.app
```

## 打包（CI：macOS / Windows / Linux）

GitHub Actions 工作流：[`.github/workflows/publish-desktop.yml`](../.github/workflows/publish-desktop.yml)。

- **自动**：`main` 上变更 `desktop/**`（或本 workflow 文件）并 push
- **手动**：Actions → **Publish Desktop** → Run workflow
- **打 tag**：`git tag desktop-v1.0.0-beta.2 && git push origin desktop-v1.0.0-beta.2`

会在 `macos-latest`（arm64 + x64）、`ubuntu-22.04`、`windows-latest` 上并行 `tauri build`，并直接发布 GitHub Release（`desktop-v__VERSION__`，版本取自 `src-tauri/tauri.conf.json`）。未配置签名/公证；正式分发前请在 Release 里核对产物。

发布流程会在 GitHub Release 发布完成后自动同步到 OSS，正常情况下不需要再手动点同步。
同时会自动发送飞书发布通知，方便快速确认这次桌面版本是否已经完成。

发布完成后，工作流 **Sync Desktop Release to OSS** 会把 macOS / Windows / Linux 安装包同步到阿里云 OSS，并更新下载页读取的 `releases.json`（需配置仓库 Variables/Secrets，见 `docs/download-releases.md`）。

Windows MSI（WiX）只接受数字版号。应用仍用 semver（如 `1.0.0-beta.2`），但 `tauri.conf.json` 里 `bundle.windows.wix.version` 需同步为数字形式（当前 `1.0.0.1`）。升到 `beta.N` 时把该字段改成 `1.0.0.N`。
