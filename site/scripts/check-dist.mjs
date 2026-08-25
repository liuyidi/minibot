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
if (!portal.includes("Minibot")) {
  throw new Error("portal is missing the Minibot brand");
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
if (!portal.includes("/minibot/download/")) {
  throw new Error("portal is missing the Desktop download CTA");
}
if (!portal.includes("下载 App") && !portal.includes("Download App")) {
  throw new Error("portal is missing the App download CTA");
}
if (!portal.includes("CLI") && !portal.includes("cli")) {
  throw new Error("portal is missing CLI surface copy");
}
if (!portal.includes("多模型") && !portal.includes("Models")) {
  throw new Error("portal is missing the multi-model pillar");
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
  if (slug === "minikb" && !overview.includes("ui-preview")) {
    throw new Error("minikb overview is missing the UI screenshot");
  }
  if (slug === "mini-langfuse" && !overview.includes("ui-preview")) {
    throw new Error("mini-langfuse overview is missing the UI screenshot");
  }
  mustRead(`${slug}/changelog/index.html`);
}

for (const surface of ["web", "desktop", "app", "cli"]) {
  const page = mustRead(`minibot/${surface}/index.html`);
  if (!page.includes("/minibot/download/")) {
    throw new Error(`minibot/${surface} is missing download link`);
  }
}
const webPage = mustRead("minibot/web/index.html");
if (!webPage.includes("web-preview")) {
  throw new Error("minibot/web is missing web-preview screenshot");
}
const desktopPage = mustRead("minibot/desktop/index.html");
if (!desktopPage.includes("desktop-preview")) {
  throw new Error("minibot/desktop is missing desktop-preview screenshot");
}
const appPage = mustRead("minibot/app/index.html");
if (!appPage.includes("shot-strip")) {
  throw new Error("minibot/app is missing drag-scroll screenshot strip");
}
for (const shot of ["app-login", "app-chat", "app-sessions", "app-profile"]) {
  if (!appPage.includes(shot)) {
    throw new Error(`minibot/app is missing ${shot} screenshot`);
  }
}
const cliPage = mustRead("minibot/cli/index.html");
if (!cliPage.includes("shot-placeholder")) {
  throw new Error("minibot/cli is missing screenshot placeholder");
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
mustRead("minibot/web-preview.png");
mustRead("minibot/desktop-preview.png");
mustRead("minibot/app-login.png");
mustRead("minibot/app-chat.png");
mustRead("minibot/app-sessions.png");
mustRead("minibot/app-profile.png");
mustRead("minikb/ui-preview.png");
mustRead("mini-langfuse/ui-preview.png");
mustRead("minibot/download/index.html");
mustRead("brand/minibot_mark.svg");

const downloadPage = mustRead("minibot/download/index.html");
if (!downloadPage.includes("选择适合你的设备") && !downloadPage.includes("Pick your device")) {
  throw new Error("download page is missing platform section copy");
}

const assetsDir = join(dist, "assets");
if (!existsSync(assetsDir)) {
  throw new Error("dist assets directory is missing");
}
const { readdirSync } = await import("node:fs");
function* walkJs(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) yield* walkJs(path);
    else if (name.name.endsWith(".js")) yield path;
  }
}
const downloadJs = [...walkJs(assetsDir)].map((path) => readFileSync(path, "utf8"));
const assetHasManifest = downloadJs.some((src) =>
  src.includes("downloads.liuyidi.me/minibot/releases.json"),
);
if (!assetHasManifest) {
  throw new Error("download page JS is missing the releases manifest URL");
}
if (!downloadJs.some((src) => src.includes("macos-client-preview") && src.includes("app-chat"))) {
  throw new Error("download page JS is missing platform screenshots");
}
if (!downloadJs.some((src) => src.includes("uv sync --all-extras") && src.includes("uv run minibot"))) {
  throw new Error("download page JS is missing CLI install commands");
}

const minibotPage = mustRead("minibot/index.html");
if (!minibotPage.includes("/minibot/download/")) {
  throw new Error("minibot overview is missing the download link");
}
for (const slug of ["minikb", "mini-langfuse", "mini-auth", "serverless-ship"]) {
  if (!minibotPage.includes(`/${slug}/changelog/`)) {
    throw new Error(`unified sidebar missing /${slug}/changelog/ on minibot page`);
  }
}

console.log(`check-dist ok (${distRel}, latest ${version[1]})`);
