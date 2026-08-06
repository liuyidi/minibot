import type {
  AutomationsPayload,
  AutomationUpdatePayload,
  PendingApproval,
  ChatSummary,
  CliAppsPayload,
  FilePreviewPayload,
  ImageGenerationSettingsUpdate,
  McpPresetsPayload,
  ModelConfigurationCreate,
  ModelConfigurationUpdate,
  NetworkSafetySettingsUpdate,
  ProviderModelsPayload,
  ProviderSettingsUpdate,
  SessionDeleteResult,
  SessionAutomationsPayload,
  SettingsPayload,
  SettingsUpdate,
  SidebarStatePayload,
  SkillDetail,
  SkillsPayload,
  SlashCommand,
  TranscriptionSettingsUpdate,
  WebSearchSettingsUpdate,
  WorkspacesPayload,
  WebuiThreadPersistedPayload,
  WorkspaceScopePayload,
  ContextUsagePayload,
} from "./types";
import { fetchWithTimeout } from "./http";

const API_READ_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
  timeoutMs: number = 0,
): Promise<T> {
  const res = await fetchWithTimeout(
    url,
    {
      ...(init ?? {}),
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      credentials: "same-origin",
    },
    timeoutMs,
  );
  if (!res.ok) {
    const text = typeof res.text === "function" ? (await res.text()).trim() : "";
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  const contentType = res.headers?.get?.("content-type") ?? "";
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    const text = typeof res.text === "function" ? await res.text() : "";
    const isHtml = text.trimStart().toLowerCase().startsWith("<!doctype");
    throw new ApiError(
      res.status,
      isHtml
        ? "Gateway returned WebUI HTML instead of JSON. Restart minibot and try again."
        : "Gateway returned a non-JSON response.",
    );
  }
  return (await res.json()) as T;
}

function mcpValuesHeader(values: Record<string, unknown>): HeadersInit | undefined {
  const payload: Record<string, unknown> = {};
  Object.entries(values).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) payload[key] = trimmed;
      return;
    }
    payload[key] = value;
  });
  if (!Object.keys(payload).length) return undefined;
  return { "X-Minibot-MCP-Values": JSON.stringify(payload) };
}

function automationValuesHeader(values: AutomationUpdatePayload): HeadersInit {
  return { "X-Minibot-Automation-Values": encodeURIComponent(JSON.stringify(values)) };
}

function splitKey(key: string): { channel: string; chatId: string } {
  const idx = key.indexOf(":");
  if (idx === -1) return { channel: "", chatId: key };
  return { channel: key.slice(0, idx), chatId: key.slice(idx + 1) };
}

export async function listSessions(
  token: string,
  base: string = "",
): Promise<ChatSummary[]> {
  type Row = {
    key?: string;
    id?: string;
    created_at: string | null;
    updated_at: string | null;
    title?: string;
    preview?: string;
    run_started_at?: number | null;
    workspace_scope?: WorkspaceScopePayload | null;
  };
  const body = await request<{ sessions: Row[] }>(
    `${base}/api/sessions`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
  return body.sessions.map((s) => {
    const key = s.key || s.id || "";
    const fullKey = key.includes(":") ? key : `websocket:${key}`;
    return {
      key: fullKey,
      ...splitKey(fullKey),
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      title: s.title ?? "",
      preview: s.preview ?? "",
      runStartedAt: s.run_started_at ?? null,
      workspaceScope: s.workspace_scope ?? null,
    };
  });
}

/** Pending human-in-the-loop approvals for one chat. */
export async function fetchPendingApprovals(
  token: string,
  chatId: string,
  base: string = "",
): Promise<PendingApproval[]> {
  const query = new URLSearchParams({ session_id: chatId, pending_only: "true" });
  const payload = await request<{ approvals?: PendingApproval[] }>(
    `${base}/api/approvals?${query}`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
  return Array.isArray(payload.approvals) ? payload.approvals : [];
}

/** Submit a human thumbs-up/down score for one completed assistant trace. */
export async function submitSessionScore(
  token: string,
  sessionId: string,
  traceId: string,
  value: boolean,
  base: string = "",
): Promise<void> {
  await request(
    `${base}/api/sessions/${encodeURIComponent(sessionId)}/score`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "user-feedback",
        data_type: "BOOLEAN",
        value: value ? 1 : 0,
        string_value: value ? "true" : "false",
        trace_id: traceId,
      }),
    },
  );
}

/** Store the optional reason and note supplied after a thumbs-down. */
export async function submitSessionFeedbackDetail(
  token: string,
  sessionId: string,
  traceId: string,
  reason: string,
  comment: string,
  base: string = "",
): Promise<void> {
  await request(
    `${base}/api/sessions/${encodeURIComponent(sessionId)}/score`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "user-feedback-reason",
        data_type: "CATEGORICAL",
        string_value: reason,
        comment: comment.trim() || undefined,
        trace_id: traceId,
      }),
    },
  );
}

/** Disk-backed WebUI display thread snapshot (separate from agent session). */
export interface FetchWebuiThreadOptions {
  limit?: number;
  direction?: "latest";
  before?: string | null;
}

export async function fetchWebuiThread(
  token: string,
  key: string,
  optionsOrBase?: FetchWebuiThreadOptions | string,
  base: string = "",
): Promise<WebuiThreadPersistedPayload | null> {
  const options = typeof optionsOrBase === "string" ? undefined : optionsOrBase;
  const resolvedBase = typeof optionsOrBase === "string" ? optionsOrBase : base;
  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  if (options?.direction) params.set("direction", options.direction);
  if (options?.before) params.set("before", options.before);
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  const url = `${resolvedBase}/api/sessions/${encodeURIComponent(key)}/webui-thread${suffix}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "same-origin",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  return (await res.json()) as WebuiThreadPersistedPayload;
}

export async function fetchFilePreview(
  token: string,
  key: string,
  path: string,
  base: string = "",
): Promise<FilePreviewPayload> {
  const query = new URLSearchParams();
  query.set("path", path);
  return request<FilePreviewPayload>(
    `${base}/api/sessions/${encodeURIComponent(key)}/file-preview?${query}`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchContextUsage(
  token: string,
  key: string,
  draft: string = "",
  base: string = "",
): Promise<ContextUsagePayload> {
  const params = new URLSearchParams();
  if (draft.trim()) params.set("draft", draft);
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  return request<ContextUsagePayload>(
    `${base}/api/sessions/${encodeURIComponent(key)}/context-usage${suffix}`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchSessionAutomations(
  token: string,
  key: string,
  base: string = "",
): Promise<SessionAutomationsPayload> {
  return request<SessionAutomationsPayload>(
    `${base}/api/sessions/${encodeURIComponent(key)}/automations`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchAutomations(
  token: string,
  base: string = "",
): Promise<AutomationsPayload> {
  return request<AutomationsPayload>(
    `${base}/api/webui/automations`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function runAutomationAction(
  token: string,
  action: "enable" | "disable" | "delete" | "run",
  id: string,
  base: string = "",
): Promise<AutomationsPayload> {
  const query = new URLSearchParams();
  query.set("id", id);
  return request<AutomationsPayload>(
    `${base}/api/webui/automations/${action}?${query}`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function updateAutomation(
  token: string,
  id: string,
  values: AutomationUpdatePayload,
  base: string = "",
): Promise<AutomationsPayload> {
  const query = new URLSearchParams();
  query.set("id", id);
  return request<AutomationsPayload>(
    `${base}/api/webui/automations/update?${query}`,
    token,
    {
      headers: automationValuesHeader(values),
    },
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchSkills(
  token: string,
  base: string = "",
): Promise<SkillsPayload> {
  return request<SkillsPayload>(
    `${base}/api/webui/skills`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchSkillDetail(
  token: string,
  name: string,
  base: string = "",
): Promise<SkillDetail> {
  return request<SkillDetail>(
    `${base}/api/webui/skills/${encodeURIComponent(name)}`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function deleteSession(
  token: string,
  key: string,
  optionsOrBase?: { deleteAutomations?: boolean } | string,
  base: string = "",
): Promise<SessionDeleteResult> {
  const options = typeof optionsOrBase === "string" ? undefined : optionsOrBase;
  const resolvedBase = typeof optionsOrBase === "string" ? optionsOrBase : base;
  const query = new URLSearchParams();
  if (options?.deleteAutomations) query.set("delete_automations", "true");
  const suffix = query.toString() ? `?${query}` : "";
  return request<SessionDeleteResult>(
    `${resolvedBase}/api/sessions/${encodeURIComponent(key)}/delete${suffix}`,
    token,
  );
}

export async function fetchSettings(
  token: string,
  base: string = "",
): Promise<SettingsPayload> {
  return request<SettingsPayload>(
    `${base}/api/settings`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchSettingsUsage(
  token: string,
  base: string = "",
): Promise<NonNullable<SettingsPayload["usage"]>> {
  return request<NonNullable<SettingsPayload["usage"]>>(
    `${base}/api/settings/usage`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export interface VersionCheckResult {
  updateAvailable: {
    currentVersion: string;
    latestVersion: string;
    pypiUrl?: string;
  } | null;
}

export async function checkVersion(
  token: string,
  base: string = "",
): Promise<VersionCheckResult> {
  return request<VersionCheckResult>(
    `${base}/api/settings/version-check`,
    token,
    undefined,
    10_000,
  );
}

export async function fetchWorkspaces(
  token: string,
  base: string = "",
): Promise<WorkspacesPayload> {
  return request<WorkspacesPayload>(
    `${base}/api/workspaces`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchCliApps(
  token: string,
  base: string = "",
): Promise<CliAppsPayload> {
  return request<CliAppsPayload>(
    `${base}/api/settings/cli-apps`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchInstalledCliApps(
  token: string,
  base: string = "",
): Promise<CliAppsPayload> {
  return request<CliAppsPayload>(
    `${base}/api/settings/cli-apps?installed_only=1`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function runCliAppAction(
  token: string,
  action: "install" | "update" | "uninstall" | "test",
  name: string,
  base: string = "",
): Promise<CliAppsPayload> {
  const query = new URLSearchParams();
  query.set("name", name);
  return request<CliAppsPayload>(`${base}/api/settings/cli-apps/${action}?${query}`, token);
}

export async function fetchMcpPresets(
  token: string,
  base: string = "",
): Promise<McpPresetsPayload> {
  return request<McpPresetsPayload>(
    `${base}/api/settings/mcp-presets`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchProviderModels(
  token: string,
  provider: string,
  base: string = "",
): Promise<ProviderModelsPayload> {
  const query = new URLSearchParams();
  query.set("provider", provider);
  return request<ProviderModelsPayload>(
    `${base}/api/settings/provider-models?${query}`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function runMcpPresetAction(
  token: string,
  action: "enable" | "remove" | "test",
  name: string,
  values: Record<string, string> = {},
  base: string = "",
): Promise<McpPresetsPayload> {
  const query = new URLSearchParams();
  query.set("name", name);
  return request<McpPresetsPayload>(
    `${base}/api/settings/mcp-presets/${action}?${query}`,
    token,
    { headers: mcpValuesHeader(values) },
  );
}

export async function saveCustomMcpServer(
  token: string,
  values: Record<string, string>,
  base: string = "",
): Promise<McpPresetsPayload> {
  return request<McpPresetsPayload>(
    `${base}/api/settings/mcp-presets/custom`,
    token,
    { headers: mcpValuesHeader(values) },
  );
}

export async function importMcpConfig(
  token: string,
  config: string,
  base: string = "",
): Promise<McpPresetsPayload> {
  return request<McpPresetsPayload>(
    `${base}/api/settings/mcp-presets/import`,
    token,
    { headers: mcpValuesHeader({ config }) },
  );
}

export async function updateMcpServerTools(
  token: string,
  name: string,
  enabledTools: string[],
  base: string = "",
): Promise<McpPresetsPayload> {
  return request<McpPresetsPayload>(
    `${base}/api/settings/mcp-presets/tools`,
    token,
    { headers: mcpValuesHeader({ name, enabled_tools: enabledTools }) },
  );
}

export async function listSlashCommands(
  token: string,
  base: string = "",
): Promise<SlashCommand[]> {
  type Row = {
    command: string;
    title: string;
    description: string;
    icon: string;
    arg_hint?: string;
  };
  const body = await request<{ commands: Row[] }>(
    `${base}/api/commands`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
  return body.commands
    .filter((command) => !["/stop", "/restart"].includes(command.command))
    .map((command) => ({
      command: command.command,
      title: command.title,
      description: command.description,
      icon: command.icon,
      argHint: command.arg_hint ?? "",
    }));
}

export async function fetchSidebarState(
  token: string,
  base: string = "",
): Promise<SidebarStatePayload> {
  return request<SidebarStatePayload>(
    `${base}/api/webui/sidebar-state`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function updateSidebarState(
  token: string,
  state: SidebarStatePayload,
  base: string = "",
): Promise<SidebarStatePayload> {
  return request<SidebarStatePayload>(`${base}/api/webui/sidebar-state/update`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
}

export async function updateSettings(
  token: string,
  update: SettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const body: Record<string, string | number> = {};
  if (update.model !== undefined) body.model = update.model;
  if (update.provider !== undefined) body.provider = update.provider;
  if (update.timezone !== undefined) body.timezone = update.timezone;
  if (update.botName !== undefined) body.bot_name = update.botName;
  return request<SettingsPayload>(`${base}/api/settings/update`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createModelConfiguration(
  token: string,
  configuration: ModelConfigurationCreate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  if (configuration.name !== undefined) query.set("name", configuration.name);
  query.set("label", configuration.label);
  query.set("provider", configuration.provider);
  query.set("model", configuration.model);
  return request<SettingsPayload>(
    `${base}/api/settings/model-configurations/create?${query}`,
    token,
  );
}

export async function updateModelConfiguration(
  token: string,
  configuration: ModelConfigurationUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("name", configuration.name);
  if (configuration.label !== undefined) query.set("label", configuration.label);
  if (configuration.provider !== undefined) query.set("provider", configuration.provider);
  if (configuration.model !== undefined) query.set("model", configuration.model);
  if (configuration.contextWindowTokens !== undefined) {
    query.set("context_window_tokens", String(configuration.contextWindowTokens));
  }
  return request<SettingsPayload>(
    `${base}/api/settings/model-configurations/update?${query}`,
    token,
  );
}

export async function activatePlatformModel(
  token: string,
  modelId: string,
  base: string = "",
): Promise<SettingsPayload> {
  return request<SettingsPayload>(
    `${base}/api/settings/platform-models/${encodeURIComponent(modelId)}/activate`,
    token,
    { method: "POST" },
  );
}

export async function activateModelConfiguration(
  token: string,
  presetId: string,
  base: string = "",
): Promise<SettingsPayload> {
  return request<SettingsPayload>(
    `${base}/api/settings/model-configurations/${encodeURIComponent(presetId)}/activate`,
    token,
    { method: "POST" },
  );
}

export async function updateProviderSettings(
  token: string,
  update: ProviderSettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const body: Record<string, string> = { provider: update.provider };
  if (update.apiKey !== undefined) body.api_key = update.apiKey;
  if (update.apiBase !== undefined) body.api_base = update.apiBase;
  return request<SettingsPayload>(`${base}/api/settings/update`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function loginProviderOAuth(
  token: string,
  provider: string,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("provider", provider);
  return request<SettingsPayload>(
    `${base}/api/settings/provider/oauth-login?${query}`,
    token,
  );
}

export async function logoutProviderOAuth(
  token: string,
  provider: string,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("provider", provider);
  return request<SettingsPayload>(
    `${base}/api/settings/provider/oauth-logout?${query}`,
    token,
  );
}

export async function updateWebSearchSettings(
  token: string,
  update: WebSearchSettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("provider", update.provider);
  if (update.apiKey !== undefined) query.set("api_key", update.apiKey);
  if (update.baseUrl !== undefined) query.set("base_url", update.baseUrl);
  if (update.maxResults !== undefined) query.set("max_results", String(update.maxResults));
  if (update.timeout !== undefined) query.set("timeout", String(update.timeout));
  if (update.useJinaReader !== undefined) {
    query.set("use_jina_reader", String(update.useJinaReader));
  }
  return request<SettingsPayload>(
    `${base}/api/settings/web-search/update?${query}`,
    token,
  );
}

export async function updateNetworkSafetySettings(
  token: string,
  update: NetworkSafetySettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("webui_allow_local_service_access", String(update.webuiAllowLocalServiceAccess));
  query.set("webui_default_access_mode", update.webuiDefaultAccessMode);
  return request<SettingsPayload>(
    `${base}/api/settings/network-safety/update?${query}`,
    token,
  );
}

export async function updateImageGenerationSettings(
  token: string,
  update: ImageGenerationSettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("enabled", String(update.enabled));
  query.set("provider", update.provider);
  query.set("model", update.model);
  query.set("default_aspect_ratio", update.defaultAspectRatio);
  query.set("default_image_size", update.defaultImageSize);
  query.set("max_images_per_turn", String(update.maxImagesPerTurn));
  return request<SettingsPayload>(
    `${base}/api/settings/image-generation/update?${query}`,
    token,
  );
}

export async function updateTranscriptionSettings(
  token: string,
  update: TranscriptionSettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("enabled", String(update.enabled));
  query.set("provider", update.provider);
  query.set("model", update.model);
  query.set("language", update.language);
  query.set("max_duration_sec", String(update.maxDurationSec));
  query.set("max_upload_mb", String(update.maxUploadMb));
  return request<SettingsPayload>(
    `${base}/api/settings/transcription/update?${query}`,
    token,
  );
}
