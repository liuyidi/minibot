#!/usr/bin/env node
/**
 * Run all WebUI commit gates (CJK i18n + file length) for staged or full scans.
 *
 * Usage:
 *   node scripts/check-webui-gates.mjs
 *   node scripts/check-webui-gates.mjs --staged
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staged = process.argv.includes("--staged");
const extra = process.argv.filter((a) => a !== "--staged" && !a.endsWith("check-webui-gates.mjs"));

const scripts = ["check-no-cjk-copy.mjs", "check-file-length.mjs"];
let failed = false;

for (const name of scripts) {
  const args = [path.join(__dirname, name)];
  if (staged) args.push("--staged");
  args.push(...extra);
  const result = spawnSync(process.execPath, args, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
