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
if (portal.includes("核心能力")) {
  throw new Error("portal HTML looks like the overview page");
}
if (portal.includes('class="grain"') || portal.includes("class='grain'")) {
  throw new Error("portal still has decorative grain");
}
if (portal.includes("fonts.googleapis.com") || portal.includes("Instrument Serif")) {
  throw new Error("portal still loads marketing fonts");
}

const live = [
  "https://bot.liuyidi.me/",
  "https://mlf.liuyidi.me/",
  "https://kb.liuyidi.me/ui/",
  "https://auth.liuyidi.me/",
  "https://serverless-ship.liuyidi.me/",
];
for (const href of live) {
  if (!portal.includes(href)) {
    throw new Error(`portal is missing live entry ${href}`);
  }
}

if (!portal.includes("打开 Agent") && !portal.includes("Open Agent")) {
  throw new Error("portal is missing the primary Agent CTA");
}
if (!portal.includes("#/download/") && !portal.includes("#/download")) {
  throw new Error("portal is missing the Desktop download CTA");
}
if (!portal.includes('class="pillars"') && !portal.includes("class='pillars'")) {
  throw new Error("portal is missing capability pillars");
}
if (!portal.includes("macos-client-preview")) {
  throw new Error("portal is missing the desktop screenshot");
}
if (!portal.includes('class="entry"') && !portal.includes("class='entry'")) {
  throw new Error("portal is missing entry tiles");
}

if (!portal.includes("/minibot/")) {
  throw new Error("portal is missing the overview link");
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
  if (slug === "minikb" || slug === "mini-langfuse" || slug === "minibot") {
    if (!overview.includes(">简介<") && !overview.includes("简介</p>")) {
      throw new Error(`${slug} sidebar should keep 简介`);
    }
  } else if (slug === "mini-auth" || slug === "serverless-ship") {
    if (!overview.includes("功能介绍")) {
      throw new Error(`${slug} should use 功能介绍`);
    }
  }
  if (slug === "minibot" && !overview.includes("macos-client-preview")) {
    throw new Error("minibot overview is missing the desktop screenshot");
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

if (existsSync(join(dist, "v0.1/index.html"))) {
  throw new Error("v0.1 preview must be removed after promotion");
}
mustRead("minibot/macos-client-preview.png");

const minibotPage = mustRead("minibot/index.html");
for (const slug of ["minikb", "mini-langfuse", "mini-auth", "serverless-ship"]) {
  if (!minibotPage.includes(`/${slug}/changelog/`)) {
    throw new Error(`unified sidebar missing /${slug}/changelog/ on minibot page`);
  }
}

console.log(`check-dist ok (${distRel}, latest ${version[1]})`);
