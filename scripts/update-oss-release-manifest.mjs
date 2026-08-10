import { readFile, writeFile } from "node:fs/promises";

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value == null) {
    throw new Error(`Invalid argument: ${key ?? ""}`);
  }
  options.set(key.slice(2), value);
}

const manifestPath = options.get("manifest");
if (!manifestPath) throw new Error("--manifest is required");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const publicBaseUrl = options.get("public-base-url")?.replace(/\/$/, "");
const prefix = options.get("prefix")?.replace(/^\/+|\/+$/g, "");

const DESKTOP_PLATFORMS = ["android", "macos", "windows", "linux"];

function artifactUrl(platform, file) {
  return `${publicBaseUrl}/${prefix}/${platform}/${file}`;
}

for (const platform of DESKTOP_PLATFORMS) {
  const file = options.get(platform);
  if (!file) continue;
  const version = options.get(`${platform}-version`);
  const size = options.get(`${platform}-size`);
  if (!version || !publicBaseUrl || !prefix) {
    throw new Error(`Missing URL, version, or prefix for ${platform}`);
  }
  manifest[platform] = {
    ...manifest[platform],
    version,
    ...(size ? { size } : {}),
    fileName: file,
    url: artifactUrl(platform, file),
  };
}

// Optional second macOS build (Intel / x64), stored alongside Apple Silicon primary.
const macosIntel = options.get("macos-intel");
if (macosIntel) {
  const version = options.get("macos-intel-version") || options.get("macos-version") || manifest.macos?.version;
  const size = options.get("macos-intel-size");
  if (!version || !publicBaseUrl || !prefix) {
    throw new Error("Missing URL, version, or prefix for macos-intel");
  }
  manifest.macos = {
    ...manifest.macos,
    version,
    intelFileName: macosIntel,
    intelUrl: artifactUrl("macos", macosIntel),
    ...(size ? { intelSize: size } : {}),
  };
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
