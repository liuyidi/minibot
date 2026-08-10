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

for (const platform of ["android", "macos"]) {
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
    url: `${publicBaseUrl}/${prefix}/${platform}/${file}`,
  };
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
