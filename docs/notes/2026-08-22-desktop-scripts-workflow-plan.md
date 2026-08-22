# Desktop CI：脚本合并 + Workflow 分级（计划）

> **前置条件：** 当前 `Publish Desktop` 全链路跑通（import → sign → notarize → DMG → GitHub Release）。
> 在此之前不改动脚本结构，避免边修 CI 边重构。

## Phase 0 — 验收门槛

- [ ] macOS aarch64 / x86_64：`Import Apple signing certificate` 成功
- [ ] `Build signed macOS release`：sidecar 布局修复 → 签名 → 公证 → DMG
- [ ] GitHub Release `desktop-v<version>` 资产可下载
- [ ] （可选）`Sync Desktop Release to OSS` 正常

---

## Phase 1 — 合并 `desktop/scripts`（行为不变，减文件数）

目标：`signing/` 从 ~9 个 shell 收到 **3～4 个入口**，README 与 CI 引用同步更新。

| 合并后 | 吸收 |
|--------|------|
| `signing/macos-p12.sh` | `openssl-pass.sh` + `import-apple-certificate.sh` + `encode-apple-certificate-for-ci.sh`（子命令：`import` / `encode`） |
| `signing/macos-sign-sidecar.sh` | `fix-macos-sidecar-layout.sh` + `sign-macos-sidecar.sh` |
| `signing/build-signed-macos.sh` | 保留为 **唯一 CI/本地发布入口** |
| `signing/notarize-macos-app.sh` | 保留；可选瘦身（去掉进度 UI，CI 用简洁日志） |
| `dmg/create-styled-dmg.sh` | 保留或并入 notarize `--dmg` 分支 |

不动：`sidecar/prepare-sidecar.sh`、`tauri/run-tauri.sh`、`deeplink/`、`dmg/generate-dmg-background.py`。

验收：本地 `encode` / `import` / `build-signed-macos.sh` 与现行为等价；`publish-desktop.yml` 只改路径、不改语义。

---

## Phase 2 — Workflow 分级（beta / 预发 / 正式 release）

原则：**只有正式 release 才走完整公证 + 公开发布**；日常与预发要快、可失败可丢弃。

### 建议三档

| 档位 | 触发 | macOS | 产物 | 发布 |
|------|------|-------|------|------|
| **Beta** | `workflow_dispatch`（channel=beta）或 push `main` 改 `desktop/**`（可选，需防抖） | ad-hoc 或仅 build `.app`，**不 import 证书、不公证** | workflow artifact，保留 7 天 | 无 GitHub Release / 无 OSS |
| **预发（RC）** | `workflow_dispatch`（channel=rc）或 tag `desktop-v*-*`（如 `-rc.1`、`-beta.1`） | Developer ID **签名**，`SKIP_NOTARIZE=1` 或异步公证 | artifact + 可选 **GitHub Pre-release** | 不同步 OSS manifest（或写 `prerelease: true`） |
| **正式 Release** | tag `v*`（与现网一致） | 完整：`import` → sign → **notarize** → DMG | GitHub Release `desktop-v<version>` | 触发 `sync-oss-desktop` |

### 实现要点

1. **拆 workflow 或单 workflow + `inputs.channel`**
   - `beta` / `rc` / `release` 三选一；默认 manual 为 `beta`，tag `v*` 强制 `release`。
2. **共享 build job**（freeze → prepare-sidecar → tauri build），用 `if` / matrix `include` 控制后续步骤。
3. **环境开关**（示例）：
   - `SKIP_NOTARIZE=1` — rc 档跳过 `notarize-macos-app.sh`
   - `SKIP_APPLE_IMPORT=1` — beta 档跳过 `import-apple-certificate.sh`
4. **并发与成本**：beta 可只打当前开发机 triple（如 aarch64），不全矩阵。
5. **文档**：更新 `desktop/scripts/README.md`、`desktop/README.zh.md`、`docs/download-releases.md` 中的触发说明（当前仍写 tauri-action 签名的需一并修正）。

### 不在本轮范围

- Windows/Linux 签名策略变更
- OSS manifest 多 channel（`releases.json` 分 beta/stable 字段）— 若产品需要再单开

---

## 执行顺序

1. Phase 0 绿灯
2. Phase 1（脚本合并，小 PR，易回滚）
3. Phase 2（workflow 分级，先 `workflow_dispatch` 三档，稳定后再考虑 `push main` 自动 beta）
