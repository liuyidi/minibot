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

if (!portal.includes("/minikb/") || !portal.includes("/mini-langfuse/") || !portal.includes("/mini-auth/") || !portal.includes("/serverless-ship/")) {
  throw new Error("portal is missing sibling overview links");
}

const products = [
  ["minibot", "核心能力"],
  ["minikb", "核心能力"],
  ["mini-langfuse", "核心能力"],
  ["mini-auth", "核心能力"],
  ["serverless-ship", "核心能力"],
];
for (const [slug, marker] of products) {
  const overview = mustRead(`${slug}/index.html`);
  if (!overview.includes(marker)) {
    throw new Error(`${slug} overview is missing ${marker}`);
  }
  if (!overview.includes(`/${slug}/changelog`)) {
    throw new Error(`${slug} overview is missing the changelog link`);
  }
  mustRead(`${slug}/changelog/index.html`);
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
