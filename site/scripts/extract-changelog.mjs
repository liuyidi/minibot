import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(siteRoot, "..");
const sourcePath = join(repoRoot, "CHANGELOG.zh.md");
const outDir = join(siteRoot, ".generated");
const outPath = join(outDir, "changelog.inc.md");
const githubBlob = "https://github.com/liuyidi/minibot/blob/main";

const source = readFileSync(sourcePath, "utf8");
const start = "<!-- #region site-changelog -->";
const end = "<!-- #endregion -->";
const startAt = source.indexOf(start);
const endAt = source.indexOf(end);
if (startAt < 0 || endAt < 0 || endAt <= startAt) {
  throw new Error(
    "CHANGELOG.zh.md is missing <!-- #region site-changelog --> / <!-- #endregion -->",
  );
}

let body = source.slice(startAt + start.length, endAt).trim();
body = body.replace(/\]\(\.\//g, `](${githubBlob}/`);

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, `${body}\n`);
console.log(`wrote ${outPath}`);
