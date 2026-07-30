# nanobot Desktop（方案 A：引擎宿主）

Tauri 2 桌面应用会**自动拉起**本机 `nanobot gateway`，注入 `window.nanobotHost`，再打开 gateway 内置 WebUI（`runtime_surface=native`）。

## 架构

```text
Tauri App
  ├─ EngineService: spawn / probe / restart / exit-kill
  ├─ 注入 window.nanobotHost
  └─ navigate → http://127.0.0.1:18765
         ↓
nanobot gateway --runtime-surface native --websocket-port 18765
```

## 前置条件

1. [Rust](https://rustup.rs/)（`cargo` 可用）
2. Node.js + npm
3. 本机已安装 `nanobot`（`command -v nanobot`），或设置 `NANOBOT_BIN` / `NANOBOT_PYTHON`

## 使用

```bash
cd desktop
npm install
npm run dev
```

首次启动会：

1. 解析 `nanobot` 可执行文件及其 shebang Python
2. 用内置 `engine_launcher.py` 调用 `_run_gateway(..., runtime_surface=native)`，并启用 websocket `:18765`
3. 轮询 `/webui/bootstrap` 直到就绪
4. 注入 `nanobotHost` 并打开 WebUI

日志写在应用 data 目录下的 `logs/engine.log`。

## Host API（已注入）

| 方法 | 作用 |
|---|---|
| `getRuntimeInfo` | 引擎状态 / 路径 / api_base |
| `restartEngine` | 重启 gateway 并重新打开 WebUI |
| `pickFolder` | 原生目录选择 |
| `openLogs` | 打开日志目录 |
| `exportDiagnostics` | 导出诊断文本 |

## 打包（macOS）

```bash
cd desktop
npm run build          # 产出 .app + .dmg
```

产物默认在 `src-tauri/target/release/bundle/`（本环境也会复制到 `desktop/dist-bundle/`）：

- `macos/nanobot.app` — 可直接双击运行
- `dmg/nanobot_0.1.0_aarch64.dmg` — 安装盘

未签名分享时，若 macOS 提示「已损坏 / 无法验证开发者」：右键打开，或执行：

```bash
xattr -dr com.apple.quarantine /Applications/nanobot.app
```

> App 仍依赖本机已安装的 `nanobot`（PATH / `NANOBOT_BIN`）。这不是离线一体包。

## 与方案 B 的区别

| | B 薄壳 | A 引擎宿主（当前） |
|---|---|---|
| gateway | 用户自己启动 | App 自动拉起 |
| 端口 | 默认连 8765 | 独立 18765 |
| `nanobotHost` | 无 | 有 |
| `runtime_surface` | browser | native |

## V2 未做

- 打包内置 Python / 离线分发
- Unix socket + `nanobot-host://` WebSocket 桥
