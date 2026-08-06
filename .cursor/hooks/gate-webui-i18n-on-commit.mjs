#!/usr/bin/env node
/**
 * Cursor beforeShellExecution: deny `git commit` when staged webui fails gates
 * (CJK i18n + file length).
 * Input: JSON on stdin. Output: { permission, user_message?, agent_message? }
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

function reply(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

let raw = "";
try {
  raw = fs.readFileSync(0, "utf8");
} catch {
  raw = "";
}

let command = "";
try {
  command = String(JSON.parse(raw || "{}").command || "");
} catch {
  reply({ permission: "allow" });
  process.exit(0);
}

if (!/\bgit(?:\s+-C\s+\S+)?\s+commit\b/.test(command)) {
  reply({ permission: "allow" });
  process.exit(0);
}

const script = path.join(REPO_ROOT, "webui/scripts/check-webui-gates.mjs");
if (!fs.existsSync(script)) {
  reply({ permission: "allow" });
  process.exit(0);
}

const result = spawnSync(process.execPath, [script, "--staged"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
});

if (result.status === 0) {
  reply({ permission: "allow" });
  process.exit(0);
}

const detail = `${result.stderr || ""}${result.stdout || ""}`.trim().slice(0, 2000);
reply({
  permission: "deny",
  user_message:
    "Commit blocked: WebUI gate failed (i18n CJK or file length). See .cursor/rules/webui-ui-i18n.mdc and webui-component-structure.mdc.",
  agent_message: detail || "webui gates failed",
});
process.exit(0);
