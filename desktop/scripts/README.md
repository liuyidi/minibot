# desktop/scripts

桌面端构建与发布辅助脚本，按用途分子目录维护。

## 目录结构

```text
scripts/
├── tauri/          # Tauri CLI 入口
├── sidecar/        # PyInstaller sidecar 准备（本地 + CI 共用）
├── signing/        # macOS Developer ID 签名与公证
├── deeplink/       # 开发态 minibot:// 协议注册
├── dmg/            # macOS DMG 安装包脚本
└── README.md       # 本文件
```

## tauri/

| 文件 | 作用 |
|------|------|
| `run-tauri.sh` | 包装 `tauri` CLI，把 `~/.cargo/bin`、`/opt/homebrew/bin` 加入 PATH。`package.json` 的 `dev` / `build` / `build:app` 均通过它调用。 |

## sidecar/

| 文件 | 作用 |
|------|------|
| `prepare-sidecar.sh` | 将仓库根目录 `dist/sidecar/<triple>/minibot-sidecar/` 复制到 `src-tauri/resources/minibot-sidecar/`，供 Tauri 打进安装包。**本地打包与 GitHub Actions CI 都会调用。** |

用法：

```bash
# 在 desktop/ 目录下，freeze 之后
./scripts/sidecar/prepare-sidecar.sh                  # 自动检测本机 triple
./scripts/sidecar/prepare-sidecar.sh aarch64-apple-darwin
```

前置条件：先执行仓库根目录 `./scripts/freeze-minibot-sidecar.sh <triple>`。

## signing/

| 文件 | 作用 |
|------|------|
| `build-signed-macos.sh` | **本地 macOS 正式打包主入口**：读取 `apple-signing.env` → codesign 预检 → prepare sidecar → 签名 sidecar 内 Mach-O → `npm run build` → 验证签名/公证票。需在 Terminal.app 运行（非 Cursor agent）。 |
| `notarize-macos-app.sh` | 对已签名的 `.app` 提交公证，**每 15s 轮询状态 + 预估进度条 + 中文提示**；通过后 staple，可选 `--dmg`。 |
| `fix-macos-sidecar-layout.sh` | Tauri 打包后恢复 PyInstaller `Python` 符号链接（避免公证报 invalid signature）。 |
| `import-apple-certificate.sh` | CI 导入 `.p12` 到临时钥匙串（`openssl` 校验后再 `security import`）。 |
| `encode-apple-certificate-for-ci.sh` | 本地生成 GitHub secret `APPLE_CERTIFICATE` 的一行 base64。 |
| `sign-macos-sidecar.sh` | 对 PyInstaller onedir 内 Mach-O 做 Developer ID + hardened runtime 签名；`Python.framework` 按 bundle 规则签。 |
| `entitlements.sidecar.plist` | sidecar 可执行文件所需的 entitlements（Python 运行时）。 |
| `apple-signing.env.example` | 本地签名变量模板；复制为同目录 `apple-signing.env`（已 gitignore）。 |
| `apple-signing.env` | 本地密钥（勿提交）。 |

用法：

```bash
cp scripts/signing/apple-signing.env.example scripts/signing/apple-signing.env
# 编辑 apple-signing.env 填入 Developer ID / Team ID / Apple ID / App 专用密码

cd desktop
./scripts/signing/build-signed-macos.sh               # 本机 triple
./scripts/signing/build-signed-macos.sh aarch64-apple-darwin

# 若 .app 已签好，只需公证（带进度提示）：
./scripts/signing/notarize-macos-app.sh src-tauri/target/release/bundle/macos/minibot.app --dmg
```

CI 不在此目录跑 shell：GitHub Actions 在 `tauri-action` 步骤注入同名 secrets（`APPLE_*`），由 Tauri CLI 完成导入证书、签名、公证。`tauri.conf.json` 中 `signingIdentity: "-"` 保留给本地 ad-hoc；CI 用 `APPLE_SIGNING_IDENTITY` 覆盖。

| 变量 | 本地 | GitHub Actions |
|------|------|----------------|
| `APPLE_SIGNING_IDENTITY` | `apple-signing.env` | secret |
| `APPLE_TEAM_ID` | 同上 | secret |
| `APPLE_ID` | 同上 | secret |
| `APPLE_PASSWORD` | App 专用密码 | secret |
| `APPLE_CERTIFICATE` | 通常省略（用钥匙串） | base64 `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | 通常省略 | `.p12` 导出密码 |

## deeplink/

| 文件 | 作用 |
|------|------|
| `register-url-scheme.sh` | 用 debug `.app` 通过 `lsregister` 向 Launch Services 注册 `minibot://`。**`npm run dev` 不会注册自定义 URL scheme**；调试 OAuth 浏览器回调（`minibot://auth/callback`）前需先跑一次。 |

用法：

```bash
cd desktop
./scripts/deeplink/register-url-scheme.sh
# 若无 debug .app 会先 tauri build --debug --bundles app，再注册并 open minibot://auth/done 测试
```

开发态若未注册协议，仍可用 loopback 兜底：`http://127.0.0.1:8766/auth/login?desktop=1&…`（见 `desktop/README.zh.md` §2）。

## dmg/

| 文件 | 作用 |
|------|------|
| `create-styled-dmg.sh` | 对已签名/已公证的 `.app` 直接调开源 **create-dmg**（不重签、不二次公证），由 Finder 和 create-dmg 放置真实的 `.app` 与 `Applications` 图标。 |

用法：

```bash
cd minibot
# 本地 ad-hoc：
cd desktop && npm run build

# 已签名 .app 后（与 notarize-macos-app.sh --dmg 相同）：
./scripts/dmg/create-styled-dmg.sh path/to/minibot.app
```

**CI 注意：** GitHub Actions 默认 `CI=true`，Tauri 会给 create-dmg 传 `--skip-jenkins`，DMG 会缺少背景与 Applications 拖放布局（[create-dmg#72](https://github.com/create-dmg/create-dmg/issues/72)、[tauri#9920](https://github.com/tauri-apps/tauri/issues/9920)）。`publish-desktop.yml` 在 macOS 签名步骤设 `CI: false`；若 DMG 打包 flaky，可改回 `true` 并改用 plain `hdiutil` DMG。

如需调整 DMG 窗口或图标位置，只修改 `create-styled-dmg.sh` 与 `src-tauri/tauri.conf.json` 中的坐标；不要把真实应用图标画进背景图。

## 典型流程

### 本地 ad-hoc 打包（无 Developer ID）

```bash
# 仓库根：freeze
./scripts/freeze-minibot-sidecar.sh
cd desktop
./scripts/sidecar/prepare-sidecar.sh
npm run build
```

### 本地 Developer ID 签名 + 公证

```bash
# 仓库根：freeze（若尚未 freeze）
./scripts/freeze-minibot-sidecar.sh
cd desktop
./scripts/signing/build-signed-macos.sh
```

### CI 发布

见 [`.github/workflows/publish-desktop.yml`](../../.github/workflows/publish-desktop.yml)：`freeze` → `sidecar/prepare-sidecar.sh` → `tauri-action`（注入 `APPLE_*` secrets）。
