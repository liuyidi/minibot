# Download releases

The WebUI reads a release manifest at runtime. Keep the WebUI separate from the
large install artifacts: upload versioned artifacts and the manifest to object
storage, then set `VITE_MINIBOT_RELEASES_URL` to the public manifest URL when
building the WebUI. The local `/releases.json` remains a safe development
fallback.

## Recommended hosting

Use object storage (Aliyun OSS or Tencent COS) behind CDN, for example
`downloads.liuyidi.me`:

```text
minibot/
  releases.json
  android/minibot-android-v1.0.4.apk
  macos/minibot-1.0.0-beta.1-….dmg
  windows/minibot-1.0.0-beta.1-…-setup.exe
  linux/minibot-1.0.0-beta.1-….deb
```

The `releases.json` served from OSS should contain absolute artifact URLs, for
example:

```json
{
  "macos": {
    "version": "1.0.0-beta.1",
    "fileName": "minibot-1.0.0-beta.1-….dmg",
    "url": "https://downloads.liuyidi.me/minibot/macos/…"
  },
  "windows": { "version": null, "url": null },
  "linux": { "version": null, "url": null }
}
```

Set a platform's `url` to `null` until its public package is ready. The UI then
shows it as coming soon rather than exposing a broken download link.

## Automated desktop publishing (recommended)

1. Push to `main` with changes under `desktop/**` (or run **Publish Desktop** /
   push `desktop-v*`) → draft GitHub Release with
   macOS / Windows / Linux installers.
2. Review the draft, then **Publish** the release on GitHub.
3. Workflow **Sync Desktop Release to OSS**
   (`.github/workflows/sync-oss-desktop.yml`) downloads the assets and runs
   `scripts/sync-desktop-release-to-oss.sh`, which uploads installers and updates
   `minibot/releases.json` on OSS.

Configure repository **Variables**: `OSS_BUCKET`, `OSS_REGION`, `OSS_ENDPOINT`,
`OSS_PUBLIC_BASE_URL` (optional `OSS_PREFIX`, `OSS_OBJECT_ACL`).

Configure repository **Secrets**: `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`
(RAM user with `oss:PutObject` on this bucket only).

You can also re-run sync manually: Actions → Sync Desktop Release to OSS →
provide tag `desktop-v…`.

## Manual publishing

1. Install and configure [ossutil](https://help.aliyun.com/zh/oss/developer-reference/ossutil-overview/).
2. Copy `scripts/oss-release.env.example` to `scripts/oss-release.env`, fill in
   bucket / endpoint / public CDN URL. Do not commit secrets.
3. Export `OSS_ACCESS_KEY_ID` and `OSS_ACCESS_KEY_SECRET`, then:

```bash
cd /path/to/minibot
source scripts/oss-release.env
scripts/publish-oss-releases.sh --version 1.0.0-beta.1 \
  --macos /path/to/app.dmg \
  --windows /path/to/setup.exe \
  --linux /path/to/app.deb
```

Or sync from an already-published GitHub release:

```bash
scripts/sync-desktop-release-to-oss.sh --tag desktop-v1.0.0-beta.1
```

## Release checklist

- macOS: prefer Apple Silicon `.dmg` (CI also builds Intel).
- Windows: NSIS `.exe` installer; Authenticode sign before treating as production.
- Linux: prefer `.deb` (AppImage / rpm also accepted by the sync script).
- Android / iOS: still published separately; iOS should link App Store / TestFlight.
- Use immutable versioned filenames; keep `releases.json` Cache-Control: no-cache.

The QR code on the download page always encodes
`https://bot.liuyidi.me/#/download/`, so it remains valid across releases.
