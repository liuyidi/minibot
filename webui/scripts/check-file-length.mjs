#!/usr/bin/env node
/**
 * Enforce WebUI production file length (see .cursor/rules/webui-component-structure.mdc).
 *
 * Soft target: ≤350 lines (prefer split).
 * Soft band: 351–400 allowed when a split is genuinely awkward (no allowlist needed).
 * Hard fail: >400 unless listed in file-length-allowlist.json with a frozen max
 *            (debt may shrink but must not grow; drop from allowlist when ≤400).
 *
 * Excludes: webui/src/tests/**
 *
 * Usage:
 *   node scripts/check-file-length.mjs
 *   node scripts/check-file-length.mjs path/a.tsx
 *   node scripts/check-file-length.mjs --staged
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBUI_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(WEBUI_ROOT, "src");
const ALLOWLIST_PATH = path.join(__dirname, "file-length-allowlist.json");

const SOFT_MAX = 350;
const HARD_MAX = 400;

const IGNORE_DIRS = new Set(["tests"]);

function loadAllowlist() {
  const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
  /** @type {Map<string, { max: number, reason?: string }>} */
  const map = new Map();
  for (const [rel, entry] of Object.entries(raw)) {
    const max = typeof entry === "number" ? entry : Number(entry?.max);
    if (!Number.isFinite(max) || max < 1) {
      throw new Error(`Invalid allowlist max for ${rel}`);
    }
    map.set(rel.split(path.sep).join("/"), {
      max,
      reason: typeof entry === "object" ? entry.reason : undefined,
    });
  }
  return map;
}

function shouldIgnore(absPath) {
  const rel = path.relative(SRC_ROOT, absPath).split(path.sep).join("/");
  if (!rel || rel.startsWith("..")) return true;
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

function lineCount(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!text) return 0;
  // Count newline-terminated lines; trailing content without final \n still counts as a line.
  const parts = text.split(/\r?\n/);
  return parts.length - (parts[parts.length - 1] === "" ? 1 : 0);
}

function evaluate(filePath, allowlist) {
  const rel = path.relative(SRC_ROOT, filePath).split(path.sep).join("/");
  const lines = lineCount(filePath);
  const allowed = allowlist.get(rel);

  if (allowed && lines <= HARD_MAX) {
    return {
      rel,
      lines,
      kind: "stale-allowlist",
      message: `${rel}: ${lines} lines ≤ ${HARD_MAX}; remove from file-length-allowlist.json`,
    };
  }

  if (lines <= SOFT_MAX) return null;

  if (lines <= HARD_MAX) {
    return {
      rel,
      lines,
      kind: "soft",
      message: `${rel}: ${lines} lines (soft target ${SOFT_MAX}; hard ${HARD_MAX} — OK if genuinely hard to split)`,
    };
  }

  if (!allowed) {
    return {
      rel,
      lines,
      kind: "error",
      message: `${rel}: ${lines} lines > ${HARD_MAX}. Split the file (target ≤${SOFT_MAX}), or temporarily add to webui/scripts/file-length-allowlist.json with max=${lines} only if unavoidable.`,
    };
  }

  if (lines > allowed.max) {
    return {
      rel,
      lines,
      kind: "error",
      message: `${rel}: ${lines} lines > allowlist max ${allowed.max}. Do not grow debt files; split toward ≤${SOFT_MAX}.`,
    };
  }

  return {
    rel,
    lines,
    kind: "allowlisted",
    message: `${rel}: ${lines}/${allowed.max} lines (allowlisted debt)`,
  };
}

function main() {
  const args = process.argv.slice(2);
  const allowlist = loadAllowlist();
  let files = [];
  if (args.includes("--staged")) {
    files = stagedWebuiFiles().filter((f) => !shouldIgnore(f));
  } else if (args.some((a) => !a.startsWith("-"))) {
    files = args
      .filter((a) => !a.startsWith("-"))
      .map((a) => path.resolve(process.cwd(), a))
      .filter((f) => f.startsWith(SRC_ROOT) && !shouldIgnore(f));
  } else {
    files = walk(SRC_ROOT).filter((f) => !shouldIgnore(f));
  }

  const soft = [];
  const allowlisted = [];
  const stale = [];
  const errors = [];

  for (const file of files) {
    if (!fs.existsSync(file) || shouldIgnore(file)) continue;
    const result = evaluate(file, allowlist);
    if (!result) continue;
    if (result.kind === "soft") soft.push(result);
    else if (result.kind === "allowlisted") allowlisted.push(result);
    else if (result.kind === "stale-allowlist") stale.push(result);
    else if (result.kind === "error") errors.push(result);
  }

  if (soft.length) {
    process.stderr.write(
      `file-length soft band (${SOFT_MAX + 1}–${HARD_MAX}): ${soft.length} file(s)\n`,
    );
    for (const hit of soft) process.stderr.write(`  ${hit.message}\n`);
  }

  if (allowlisted.length && !args.includes("--staged")) {
    process.stderr.write(`file-length allowlisted debt: ${allowlisted.length} file(s)\n`);
    for (const hit of allowlisted.slice(0, 30)) {
      process.stderr.write(`  ${hit.message}\n`);
    }
  }

  if (stale.length) {
    process.stderr.write(
      `file-length stale allowlist entries (remove when ≤${HARD_MAX}): ${stale.length}\n`,
    );
    for (const hit of stale) process.stderr.write(`  ${hit.message}\n`);
  }

  if (errors.length) {
    process.stderr.write(
      `file-length check failed: ${errors.length} file(s) over ${HARD_MAX} (or grew past allowlist max). See .cursor/rules/webui-component-structure.mdc.\n\n`,
    );
    for (const hit of errors) process.stderr.write(`${hit.message}\n`);
    process.exit(1);
  }

  process.stdout.write("file-length check: ok\n");
  process.exit(0);
}

main();
