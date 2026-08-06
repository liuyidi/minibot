/** CLI apps and MCP preset catalog payloads. */

export interface AppPackageRef {
  manager: string;
  name?: string;
}

export interface AppCapability {
  type: "cli" | "mcp" | "skill" | string;
  entry_point?: string;
  package?: AppPackageRef;
  path?: string;
  transport?: string;
  command?: string;
  args?: string[];
  url?: string;
  fields?: Array<{
    name: string;
    target?: string;
    required?: boolean;
    secret?: boolean;
    env_var?: string | null;
  }>;
}

export interface AppPlan {
  supported: boolean;
  strategy?: string;
  managed_paths?: string[];
  verification?: string[];
}

export interface AppTrust {
  registry: string;
  level: string;
  review_status: string;
}

export interface AppManifest {
  schema: "agent-app.v1" | string;
  id: string;
  display_name: string;
  version?: string;
  description: string;
  category: string;
  source: string;
  logo_url?: string | null;
  brand_color?: string | null;
  docs_url?: string | null;
  capabilities: AppCapability[];
  install: AppPlan;
  remove: AppPlan;
  trust: AppTrust;
}

export interface CliAppInfo {
  name: string;
  display_name: string;
  category: string;
  description: string;
  requires: string;
  source: string;
  entry_point: string;
  install_supported: boolean;
  installed: boolean;
  available: boolean;
  status: "installed" | "missing" | "available" | "unsupported" | "not_installed" | string;
  logo_url?: string | null;
  brand_color?: string | null;
  skill_installed: boolean;
  manifest?: AppManifest;
}

export interface CliAppsPayload {
  apps: CliAppInfo[];
  installed_count: number;
  catalog_updated_at?: string | null;
  last_action?: {
    ok: boolean;
    message: string;
    installed?: boolean;
    removed?: boolean;
    output?: string | null;
    still_available?: boolean;
    verification?: string[];
    verification_failed?: string[];
  };
}

export interface McpPresetField {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
  configured: boolean;
  placeholder?: string;
  env_var?: string | null;
}

export interface McpPresetInfo {
  name: string;
  display_name: string;
  category: string;
  description: string;
  docs_url: string;
  transport: "stdio" | "streamableHttp" | "sse" | "oauth" | string;
  requires: string;
  note: string;
  install_supported: boolean;
  installed: boolean;
  configured: boolean;
  available: boolean;
  status: "not_installed" | "configured" | "missing_credentials" | "missing_dependency" | "coming_soon" | string;
  logo_url?: string | null;
  brand_color?: string | null;
  required_fields: McpPresetField[];
  connection_summary: string;
  tool_count?: number;
  tool_names?: string[];
  checked_at?: string | null;
  error?: string | null;
  enabled_tools?: string[];
  source?: "preset" | "custom" | string;
  manifest?: AppManifest;
}

export interface McpPresetsPayload {
  presets: McpPresetInfo[];
  installed_count: number;
  requires_restart?: boolean;
  hot_reload?: {
    ok: boolean;
    message: string;
    added?: string[];
    changed?: string[];
    removed?: string[];
    retried?: string[];
    connected?: string[];
    configured?: string[];
    failed?: string[];
    tools_removed?: number;
    requires_restart?: boolean;
  };
  last_action?: {
    ok: boolean;
    message: string;
    installed?: boolean;
    removed?: boolean;
    managed_paths_removed?: string[];
    verification?: string[];
    verification_failed?: string[];
    tool_count?: number;
    tool_names?: string[];
    checked_at?: string | null;
    error?: string | null;
  };
}
