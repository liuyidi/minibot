# minibot Desktop (thin remote shell)

[简体中文](./README.zh.md) | English

[![Publish Desktop](https://github.com/liuyidi/minibot/actions/workflows/publish-desktop.yml/badge.svg)](https://github.com/liuyidi/minibot/actions/workflows/publish-desktop.yml)

Tauri 2 desktop app that loads the minibot WebUI and injects `window.minibotHost`.

| Build | Default `api_base` |
|------|----------------|
| `npm run dev` / debug | `http://127.0.0.1:5173` (local Vite) |
| `npm run build` / release | [`https://bot.liuyidi.me`](https://bot.liuyidi.me/) |

Override with `MINIBOT_API_BASE` or the startup screen; config is stored as `server.json` under the app data directory.
Release builds ignore localhost / `127.0.0.1` in that file (so a leftover `tauri:dev` URL does not keep the `local-webui` badge) and rewrite to the production default.

## Architecture

```text
Tauri App
  ├─ resolve api_base (MINIBOT_API_BASE → server.json → build default)
  ├─ probe /webui/bootstrap (HTTPS may fall back to HTTP IP)
  ├─ inject window.minibotHost
  └─ navigate → api_base/
```

Does not start a local Python / minibot process.

## Usage

```bash
cd desktop
npm install
# Local WebUI required: cd ../webui && npm run dev
npm run dev
```

Point at production or another host:

```bash
MINIBOT_API_BASE=https://bot.liuyidi.me npm run dev
MINIBOT_API_BASE=http://127.0.0.1:8766 npm run dev
```

Local Vite shows a `local-webui` debug badge in the top bar; production hosts do not.

If connection fails, change the server URL on the startup screen.

## Host API (injected)

| Method | Purpose |
|---|---|
| `getRuntimeInfo` | Connection status / api_base |
| `reconnect` / `restartEngine` | Re-probe and reload WebUI |
| `pickFolder` | Native folder picker |
| `openLogs` | Open desktop log directory |
| `exportDiagnostics` | Export diagnostics text |

## Packaging (local macOS)

```bash
cd desktop
npm run build          # produces .app + .dmg, copies to dist-bundle/
```

Output directory: `desktop/dist-bundle/` (gitignored):

- `minibot.app`
- `minibot_1.0.0-beta.2_aarch64.dmg`

Underlying Tauri artifacts remain under `src-tauri/target/release/bundle/` (or `CARGO_TARGET_DIR`); run `npm run collect-bundle` to copy again.

When sharing an unsigned build:

```bash
xattr -dr com.apple.quarantine /Applications/minibot.app
```

## Packaging (CI: macOS / Windows / Linux)

GitHub Actions workflow: [`.github/workflows/publish-desktop.yml`](../.github/workflows/publish-desktop.yml).

- **Automatic**: push to `main` that touches `desktop/**` (or this workflow file)
- **Manual**: Actions → **Publish Desktop** → Run workflow
- **Tag**: `git tag desktop-v1.0.0-beta.2 && git push origin desktop-v1.0.0-beta.2`

Builds in parallel on `macos-latest` (arm64 + x64), `ubuntu-22.04`, and `windows-latest` via `tauri build`, then publishes a GitHub Release (`desktop-v__VERSION__` from `src-tauri/tauri.conf.json`). Signing/notarization is not configured; verify artifacts in the Release before wider distribution.

After the GitHub Release is published, the pipeline syncs artifacts to OSS automatically in most cases (no manual sync click).
It also sends a Feishu release notification so you can confirm the desktop build finished.

The **Sync Desktop Release to OSS** workflow uploads macOS / Windows / Linux installers to Aliyun OSS and updates the `releases.json` used by the download page (see `docs/download-releases.md` for Variables/Secrets).

Windows MSI (WiX) only accepts numeric versions. The app still uses semver (e.g. `1.0.0-beta.2`), but `bundle.windows.wix.version` in `tauri.conf.json` must stay numeric (currently `1.0.0.1`). For `beta.N`, set that field to `1.0.0.N`.
