import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distRel = process.argv[2] ?? ".vitepress/dist";
const dist = join(siteRoot, distRel);
const repoRoot = join(siteRoot, "..");

function mustRead(rel) {
  const path = join(dist, rel);
  if (!existsSync(path)) {
    throw new Error(`missing ${rel} under ${distRel}`);
  }
  return readFileSync(path, "utf8");
}

const portal = mustRead("index.html");
if (!portal.includes("liuyidi.me")) {
  throw new Error("portal is missing the brand");
}
if (!portal.includes("/minibot/")) {
  throw new Error("portal is missing the overview link");
}
if (portal.includes("核心能力")) {
  throw new Error("portal HTML looks like the overview page");
}

const overview = mustRead("minibot/index.html");
if (!overview.includes("核心能力")) {
  throw new Error("overview is missing 核心能力");
}
if (!overview.includes("/minibot/changelog")) {
  throw new Error("overview is missing the changelog link");
}

const changelog = mustRead("minibot/changelog/index.html");
const source = readFileSync(join(repoRoot, "CHANGELOG.zh.md"), "utf8");
const version = source.match(/## \[(\d+\.\d+\.\d+)\]/);
if (!version) {
  throw new Error("CHANGELOG.zh.md has no released version heading");
}
if (!changelog.includes(version[1])) {
  throw new Error(`changelog page is missing version ${version[1]}`);
}

mustRead("v0.1/index.html");

console.log(`check-dist ok (${distRel}, latest ${version[1]})`);
