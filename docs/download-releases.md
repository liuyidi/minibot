# Download releases

The WebUI reads a release manifest at runtime. Keep the WebUI separate from the
large install artifacts: upload versioned artifacts and the manifest to object
storage, then set `VITE_MINIBOT_RELEASES_URL` to the public manifest URL when
building the WebUI. The local `/releases.json` remains a safe development
fallback.

## Recommended hosting

Use Tencent Cloud COS behind CDN with `downloads.liuyidi.me`:

```text
minibot/
  releases.json
  android/minibot-android-v1.0.4.apk
  macos/minibot-0.1.0-aarch64.dmg
  windows/minibot-0.1.0-x64-setup.exe
```

The `releases.json` served from OSS should contain absolute artifact URLs, for
example:

```json
{
  "android": {
    "version": "1.0.4",
    "fileName": "minibot-android-v1.0.4.apk",
    "size": "80 MB",
    "url": "https://downloads.liuyidi.me/minibot/android/minibot-android-v1.0.4.apk"
  }
}
```

Set a platform's `url` to `null` until its public package is ready. The UI then
shows it as coming soon rather than exposing a broken download link.

## Automated publishing

1. Install and configure [ossutil](https://help.aliyun.com/zh/oss/developer-reference/ossutil-overview/).
   Use a RAM user with `oss:PutObject` limited to this release bucket; do not
   use an account-owner AccessKey.
2. Copy `scripts/oss-release.env.example` to `scripts/oss-release.env`, fill in
   the bucket, regional endpoint, and public CDN/custom-domain URL. Do not add
   `scripts/oss-release.env` to Git.
3. Export the RAM user's `OSS_ACCESS_KEY_ID` and `OSS_ACCESS_KEY_SECRET` in
   your shell or secure CI secret store.
4. Run a dry run, then publish:

```bash
cd /path/to/minibot
source scripts/oss-release.env
scripts/publish-oss-releases.sh --version 1.0.4 \
  --android /path/to/minibot-android-v1.0.4.apk --dry-run

scripts/publish-oss-releases.sh --version 1.0.4 \
  --android /path/to/minibot-android-v1.0.4.apk \
  --macos /path/to/minibot-1.0.4-aarch64.dmg
```

The script uploads versioned artifacts, updates `webui/public/releases.json`,
and uploads that manifest to `oss://<bucket>/minibot/releases.json`.

## Release checklist

- Android: rename the existing APK from `deepseek-chat-1.0.4-release.apk` to
  `minibot-android-v1.0.4.apk`, upload it to COS, then set `android.url`.
- macOS: release a signed and notarized `.dmg` or `.zip`, not the `.app`
  directory. Publish separate Apple Silicon and Intel artifacts when needed.
- iOS: set `ios.url` to the App Store or TestFlight join URL; do not host an
  ad-hoc IPA as a normal public download.
- Windows: publish an Authenticode-signed installer before setting
  `windows.url`.
- Use immutable versioned filenames and publish checksums alongside artifacts.

The QR code on the download page always encodes
`https://bot.liuyidi.me/#/download/`, so it remains valid across releases and
can highlight the appropriate mobile platform after scanning.
