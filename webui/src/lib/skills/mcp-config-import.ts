import type { UpsertMcpPresetBody } from "@/lib/apis/api";

export type McpTransport = "stdio" | "streamableHttp" | "sse";
export type UpsertMcpBody = UpsertMcpPresetBody;

export type CustomMcpForm = {
  name: string;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  env: string;
  headers: string;
  toolTimeout: string;
};

export const DEFAULT_CUSTOM_MCP_FORM: CustomMcpForm = {
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  url: "",
  env: "",
  headers: "",
  toolTimeout: "30",
};

function asStringRecord(value: unknown, field: string): Record<string, string> {
  if (value == null || value === "") return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be a JSON object`);
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string") {
      throw new Error(`${field}.${key} must be a string`);
    }
    out[key] = entry;
  }
  return out;
}

function parseJsonObject(raw: string, field: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${field} must be valid JSON`);
  }
  return asStringRecord(parsed, field);
}

function parseArgs(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Args must be a JSON array");
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Args must be a JSON array of strings");
  }
  return parsed;
}

function parseToolTimeout(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Tool timeout must be a positive number");
  }
  return Math.floor(value);
}

function inferTransport(entry: Record<string, unknown>): McpTransport {
  const explicit = entry.type ?? entry.transport;
  if (explicit === "stdio" || explicit === "sse" || explicit === "streamableHttp") {
    return explicit;
  }
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  if (url) {
    return url.replace(/\/+$/, "").endsWith("/sse") ? "sse" : "streamableHttp";
  }
  return "stdio";
}

/** Build an upsert body from the custom MCP form. Throws on invalid advanced JSON. */
export function customMcpFormToUpsertBody(form: CustomMcpForm): UpsertMcpBody {
  const name = form.name.trim();
  if (!name) throw new Error("Server name is required");
  const remote = form.transport !== "stdio";
  if (remote && !form.url.trim()) throw new Error("URL is required");
  if (!remote && !form.command.trim()) throw new Error("Command is required");

  const body: UpsertMcpBody = {
    id: name,
    label: name,
    enabled: true,
    type: form.transport,
    command: remote ? "" : form.command.trim(),
    args: remote ? [] : parseArgs(form.args),
    url: remote ? form.url.trim() : "",
    env: parseJsonObject(form.env, "Env"),
    headers: remote ? parseJsonObject(form.headers, "Headers") : {},
  };
  const timeout = parseToolTimeout(form.toolTimeout);
  if (timeout !== undefined) body.tool_timeout = timeout;
  return body;
}

/**
 * Parse Cursor/Claude-style mcp.json into upsert bodies.
 * Expects `{ "mcpServers": { "<id>": { command|url, ... } } }`.
 */
export function parseMcpConfigImport(raw: string): UpsertMcpBody[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("mcp.json must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("mcp.json must be an object");
  }
  const servers = (parsed as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error('mcp.json must include an "mcpServers" object');
  }

  const bodies: UpsertMcpBody[] = [];
  for (const [id, value] of Object.entries(servers as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`mcpServers.${id} must be an object`);
    }
    const entry = value as Record<string, unknown>;
    const transport = inferTransport(entry);
    const command = typeof entry.command === "string" ? entry.command.trim() : "";
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    const args = Array.isArray(entry.args)
      ? entry.args.filter((item): item is string => typeof item === "string")
      : [];
    if (transport === "stdio" && !command) {
      throw new Error(`mcpServers.${id} needs a command`);
    }
    if (transport !== "stdio" && !url) {
      throw new Error(`mcpServers.${id} needs a url`);
    }
    const body: UpsertMcpBody = {
      id,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : id,
      enabled: entry.enabled === false ? false : true,
      type: transport,
      command: transport === "stdio" ? command : "",
      args: transport === "stdio" ? args : [],
      url: transport === "stdio" ? "" : url,
      env: asStringRecord(entry.env, `mcpServers.${id}.env`),
      headers: asStringRecord(entry.headers, `mcpServers.${id}.headers`),
    };
    if (typeof entry.tool_timeout === "number" && Number.isFinite(entry.tool_timeout)) {
      body.tool_timeout = Math.floor(entry.tool_timeout);
    }
    bodies.push(body);
  }
  if (bodies.length === 0) {
    throw new Error("mcpServers is empty");
  }
  return bodies;
}
