# minibot Desktop（远程薄壳）

Tauri 2 桌面应用连接 minibot WebUI，注入 `window.minibotHost`。

| 构建 | 默认 `api_base` |
|------|----------------|
| `npm run dev` / debug | `http://127.0.0.1:5173`（本地 Vite） |
| `npm run build` / release | [`https://bot.liuyidi.me`](https://bot.liuyidi.me/) |

可用 `MINIBOT_API_BASE` 或启动页覆盖；配置写入应用 data 目录下的 `server.json`。

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

## 打包（macOS）

```bash
cd desktop
npm run build          # 产出 .app + .dmg
```

产物默认在 `src-tauri/target/release/bundle/`（或环境 `CARGO_TARGET_DIR`）：

- `macos/minibot.app`
- `dmg/minibot_0.1.0_aarch64.dmg`

未签名分享时：

```bash
xattr -dr com.apple.quarantine /Applications/minibot.app
```
