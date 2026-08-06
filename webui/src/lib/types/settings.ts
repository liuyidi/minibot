/** Settings GET payload and mutation DTOs. */

import type {
  RestartBehavior,
  RuntimeCapabilities,
  RuntimeSurface,
  SettingsApplyStatus,
} from "./runtime";
import type { WebuiDefaultAccessMode } from "./session";

export interface SettingsPayload {
  surface?: RuntimeSurface;
  runtime_surface?: RuntimeSurface;
  runtime_capabilities?: RuntimeCapabilities;
  apply_state?: {
    status: SettingsApplyStatus;
    sections: string[];
  };
  restart_behavior_by_section?: Record<string, RestartBehavior>;
  observability?: {
    langfuse_enabled: boolean;
    langfuse_configured: boolean;
    langfuse_host?: string;
  };
  agent: {
    model: string;
    provider: string;
    resolved_provider: string | null;
    has_api_key: boolean;
    model_preset: string | null;
    max_tokens: number;
    context_window_tokens: number;
    temperature: number;
    reasoning_effort: string | null;
    timezone: string;
    bot_name: string;
    bot_icon: string;
    tool_hint_max_length: number;
    exec_sandbox?: string;
  };
  active_platform_model?: string;
  platform_models?: Array<{
    id: string;
    label: string;
    provider: string;
    model: string;
    api_base: string;
    source: "platform";
    available: boolean;
    context_window_tokens?: number;
  }>;
  model_presets: Array<{
    name: string;
    label: string;
    active: boolean;
    is_default: boolean;
    model: string;
    provider: string;
    max_tokens: number;
    context_window_tokens: number;
    temperature: number;
    reasoning_effort: string | null;
  }>;
  providers: Array<{
    name: string;
    label: string;
    configured: boolean;
    configured_via?: "user" | "platform" | "both" | null;
    auth_type?: "api_key" | "oauth";
    api_key_required?: boolean;
    api_key_hint?: string | null;
    api_base?: string | null;
    default_api_base?: string | null;
    model_selectable?: boolean;
    api_type?: "auto" | "chat_completions" | "responses";
    oauth_account?: string | null;
    oauth_expires_at?: number | null;
    oauth_login_supported?: boolean;
  }>;
  web_search: {
    provider: string;
    api_key_hint?: string | null;
    base_url?: string | null;
    max_results: number;
    timeout: number;
    providers: Array<{
      name: string;
      label: string;
      credential: "none" | "api_key" | "base_url";
    }>;
  };
  web: {
    enable: boolean;
    proxy?: string | null;
    user_agent?: string | null;
    search: {
      max_results: number;
      timeout: number;
    };
    fetch: {
      use_jina_reader: boolean;
    };
  };
  image_generation: {
    enabled: boolean;
    provider: string;
    provider_configured: boolean;
    model: string;
    default_aspect_ratio: string;
    default_image_size: string;
    max_images_per_turn: number;
    save_dir: string;
    providers: Array<{
      name: string;
      label: string;
      configured: boolean;
      auth_type?: "api_key" | "oauth";
      api_key_hint?: string | null;
      api_base?: string | null;
      default_api_base?: string | null;
    }>;
  };
  transcription?: {
    enabled: boolean;
    provider: string;
    provider_configured: boolean;
    model: string;
    language: string | null;
    max_duration_sec: number;
    max_upload_mb: number;
    providers: Array<{
      name: string;
      label: string;
      configured: boolean;
      api_key_hint?: string | null;
      api_base?: string | null;
      default_api_base?: string | null;
    }>;
  };
  runtime: {
    config_path: string;
    workspace_path: string;
    gateway_host: string;
    gateway_port: number;
    heartbeat: {
      enabled: boolean;
      interval_s: number;
      keep_recent_messages: number;
    };
    dream: {
      schedule: string;
    };
    unified_session: boolean;
  };
  usage?: {
    days: Array<{
      date: string;
      prompt_tokens: number;
      completion_tokens: number;
      cached_tokens: number;
      total_tokens: number;
      provider_tokens?: number;
      estimated_tokens?: number;
      requests: number;
      provider_requests?: number;
      estimated_requests?: number;
      sources?: Record<
        "user" | "api" | "cron" | "dream" | "system" | string,
        {
          prompt_tokens: number;
          completion_tokens: number;
          cached_tokens: number;
          total_tokens: number;
          provider_tokens?: number;
          estimated_tokens?: number;
          requests: number;
          provider_requests?: number;
          estimated_requests?: number;
        }
      >;
    }>;
    total_tokens: number;
    total_tokens_30d: number;
    total_tokens_365d: number;
    peak_day_tokens: number;
    current_streak_days: number;
    longest_streak_days: number;
    active_days_30d: number;
    requests_30d: number;
    updated_at?: string | null;
  };
  advanced: {
    restrict_to_workspace: boolean;
    workspace_sandbox?: {
      restrict_to_workspace: boolean;
      workspace_root: string;
      level: "off" | "application" | "system" | string;
      enforced: boolean;
      provider: string;
      provider_label: string;
      summary: string;
    };
    ssrf_whitelist_count: number;
    webui_allow_local_service_access: boolean;
    allow_local_preview_access?: boolean;
    webui_default_access_mode: WebuiDefaultAccessMode;
    private_service_protection_enabled: boolean;
    mcp_server_count: number;
    exec_enabled: boolean;
    exec_sandbox?: string | null;
    exec_path_prepend_set: boolean;
    exec_path_append_set: boolean;
  };
  requires_restart: boolean;
  restart_required_sections?: Array<"runtime" | "browser" | "image">;
  version?: {
    current: string;
  };
}

export interface SettingsUpdate {
  model?: string;
  provider?: string;
  modelPreset?: string | null;
  contextWindowTokens?: number;
  timezone?: string;
  botName?: string;
  botIcon?: string;
  toolHintMaxLength?: number;
}

export interface ModelConfigurationCreate {
  name?: string;
  label: string;
  provider: string;
  model: string;
}

export interface ModelConfigurationUpdate {
  name: string;
  label?: string;
  provider?: string;
  model?: string;
  contextWindowTokens?: number;
}

export interface ProviderSettingsUpdate {
  provider: string;
  apiKey?: string;
  apiBase?: string;
  apiType?: "auto" | "chat_completions" | "responses";
}

export interface WebSearchSettingsUpdate {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  maxResults?: number;
  timeout?: number;
  useJinaReader?: boolean;
}

export interface NetworkSafetySettingsUpdate {
  webuiAllowLocalServiceAccess: boolean;
  webuiDefaultAccessMode: WebuiDefaultAccessMode;
}

export interface ImageGenerationSettingsUpdate {
  enabled: boolean;
  provider: string;
  model: string;
  defaultAspectRatio: string;
  defaultImageSize: string;
  maxImagesPerTurn: number;
}

export interface TranscriptionSettingsUpdate {
  enabled: boolean;
  provider: string;
  model: string;
  language: string;
  maxDurationSec: number;
  maxUploadMb: number;
}
