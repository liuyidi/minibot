#!/usr/bin/env node
/**
 * Fail if production WebUI source contains CJK (Han) literals.
 * Implements .cursor/rules/webui-ui-i18n.mdc for hard-coded Chinese/Japanese copy.
 *
 * Usage:
 *   node scripts/check-no-cjk-copy.mjs              # scan all src
 *   node scripts/check-no-cjk-copy.mjs path/a.tsx    # scan specific files
 *   node scripts/check-no-cjk-copy.mjs --staged      # git staged webui files
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBUI_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(WEBUI_ROOT, "src");
const CJK_RE = /[\u3400-\u9fff]/;

const IGNORE_DIRS = new Set([
  "i18n/locales",
  "tests",
]);

/** Machine/data allowlist (not user chrome copy). */
const IGNORE_FILES = new Set([
  // Language picker native names
  path.join(SRC_ROOT, "i18n", "config.ts"),
  // Greeting detection tokens for chat heuristics
  path.join(SRC_ROOT, "lib", "utils", "format.ts"),
]);

function shouldIgnore(absPath) {
  const rel = path.relative(SRC_ROOT, absPath).split(path.sep).join("/");
  if (!rel || rel.startsWith("..")) return true;
  if (IGNORE_FILES.has(absPath)) return true;
  for (const dir of IGNORE_DIRS) {
    if (rel === dir || rel.startsWith(`${dir}/`)) return true;
  }
  return false;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const rel = path.relative(SRC_ROOT, full).split(path.sep).join("/");
      if (IGNORE_DIRS.has(rel) || [...IGNORE_DIRS].some((d) => rel.startsWith(`${d}/`))) {
        continue;
      }
      walk(full, out);
      continue;
    }
    if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stagedWebuiFiles() {
  const repoRoot = path.resolve(WEBUI_ROOT, "..");
  let out = "";
  try {
    out = execSync("git diff --cached --name-only --diff-filter=ACMR", {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } catch {
    return [];
  }
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("webui/src/") && /\.(tsx|ts|jsx|js)$/.test(line))
    .map((line) => path.join(repoRoot, line));
}

function scanFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Skip import paths and pure comments that only document; still flag comments with UI copy.
    if (!CJK_RE.test(line)) continue;
    // Allow // eslint-disable-next-line minibot-i18n/no-cjk-copy
    if (/eslint-disable.*no-cjk-copy/.test(line)) continue;
    findings.push({
      file: path.relative(WEBUI_ROOT, filePath),
      line: i + 1,
      preview: line.trim().slice(0, 120),
    });
  }
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  let files = [];
  if (args.includes("--staged")) {
    files = stagedWebuiFiles().filter((f) => !shouldIgnore(f));
  } else if (args.length) {
    files = args
      .filter((a) => !a.startsWith("-"))
      .map((a) => path.resolve(process.cwd(), a))
      .filter((f) => f.startsWith(SRC_ROOT) && !shouldIgnore(f));
  } else {
    files = walk(SRC_ROOT).filter((f) => !shouldIgnore(f));
  }

  const all = [];
  for (const file of files) {
    if (!fs.existsSync(file) || shouldIgnore(file)) continue;
    all.push(...scanFile(file));
  }

  if (!all.length) {
    process.stdout.write("i18n CJK check: ok\n");
    process.exit(0);
  }

  process.stderr.write(
    `i18n CJK check failed: ${all.length} hard-coded CJK line(s). Use react-i18next (see .cursor/rules/webui-ui-i18n.mdc).\n\n`,
  );
  for (const hit of all.slice(0, 80)) {
    process.stderr.write(`${hit.file}:${hit.line}: ${hit.preview}\n`);
  }
  if (all.length > 80) {
    process.stderr.write(`… and ${all.length - 80} more\n`);
  }
  process.exit(1);
}

main();
