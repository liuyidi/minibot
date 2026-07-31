# minibot Desktop（远程薄壳）

Tauri 2 桌面应用直接连接远程 minibot 服务（默认 `http://116.62.35.76:8766`），注入 `window.minibotHost`，并打开服务端 WebUI。

> 说明：大陆网络访问未备案域名的 `https://bot.liuyidi.me` 常在 TLS 握手阶段被重置；演示默认改走 ECS 开放的 `:8766` HTTP。若 HTTPS 探测失败会自动回退到该地址。

## 架构

```text
Tauri App
  ├─ 读取 api_base（MINIBOT_API_BASE → server.json → 默认）
  ├─ 探测 /webui/bootstrap（HTTPS 失败时可回退 HTTP IP）
  ├─ 注入 window.minibotHost
  └─ navigate → http://116.62.35.76:8766/
```

不拉起本机 Python / minibot 进程。

## 使用

```bash
cd desktop
npm install
npm run dev
```

本地调试可指向本机服务：

```bash
MINIBOT_API_BASE=http://127.0.0.1:8766 npm run dev
```

连接失败时可在启动页修改服务地址；配置写入应用 data 目录下的 `server.json`。

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
