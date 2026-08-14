# minibot Desktop V2 (local gateway)

[简体中文](./README.zh.md) | English

> Experimental tree copied from `desktop/`, evolved on `feature/desktopv2`.  
> Design: [`docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md`](../docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md)  
> Plan: [`docs/superpowers/plans/2026-08-14-desktop-v2-local-gateway.md`](../docs/superpowers/plans/2026-08-14-desktop-v2-local-gateway.md)

Coexists with `desktop/` (remote thin shell). **Defaults to `http://127.0.0.1:8766`** and tries to spawn a local minibot engine.

## Develop

```bash
# Terminal A (if auto-spawn fails)
cd minibot && uv run minibot

# Terminal B
cd desktopV2
npm install
npm run dev
```

Spawn order: `MINIBOT_SIDECAR` → bundled PyInstaller onedir → `minibot` on `PATH`.

Engine data: `{app_data}/engine` via `MINIBOT_SERVER_DATA_DIR`.

## Bundle local sidecar

```bash
# From repo root
./scripts/freeze-minibot-sidecar.sh
cd desktopV2 && ./scripts/prepare-sidecar.sh
npm run build:app   # or: npm run tauri build
```

`prepare-sidecar.sh` copies `dist/sidecar/<triple>/minibot-sidecar/` into
`src-tauri/resources/minibot-sidecar/` (gitignored; Tauri `bundle.resources`).

## vs V1

| | desktop (V1) | desktopV2 |
|---|---|---|
| Default | `bot.liuyidi.me` | `127.0.0.1:8766` |
| Process | none | sidecar / `minibot` |
| Auth | same-origin Web | system browser + `minibot://` (TODO) |
| Bundle id | `me.liuyidi.minibot.desktop` | `me.liuyidi.minibot.desktopv2` |
