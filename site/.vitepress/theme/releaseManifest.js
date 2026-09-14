export const RELEASE_MANIFEST_URL = "https://downloads.liuyidi.me/minibot/releases.json";

export const EMPTY_MANIFEST = {
  android: { version: null, url: null },
  ios: { version: null, url: null },
  macos: { version: null, url: null, intelUrl: null },
  windows: { version: null, url: null },
  linux: { version: null, url: null },
};

export function mergeManifest(base, payload) {
  if (!payload || typeof payload !== "object") return base;
  return {
    android: { ...base.android, ...payload.android },
    ios: { ...base.ios, ...payload.ios },
    macos: { ...base.macos, ...payload.macos },
    windows: { ...base.windows, ...payload.windows },
    linux: { ...base.linux, ...payload.linux },
  };
}
