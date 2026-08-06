import type { CliAppInfo, McpPresetInfo, SettingsPayload } from "@/lib/types";

export type SettingsSectionKey =
  | "overview"
  | "appearance"
  | "models"
  | "image"
  | "voice"
  | "browser"
  | "apps"
  | "automations"
  | "skills"
  | "channels"
  | "runtime"
  | "advanced";

export type LocalDensity = "comfortable" | "compact";
export type LocalActivityMode = "auto" | "expanded";
export type AppsKindFilter = "all" | "cli" | "mcp";
export type AppsCatalogItem =
  | { id: string; kind: "cli"; app: CliAppInfo }
  | { id: string; kind: "mcp"; preset: McpPresetInfo };

export interface LocalPreferences {
  density: LocalDensity;
  activityMode: LocalActivityMode;
  codeWrap: boolean;
  brandLogos: boolean;
}

export type PendingRestartSection = "runtime" | "browser" | "image";
export type PendingRestartSections = Record<PendingRestartSection, boolean>;
export type RestartAwarePayload = {
  requires_restart?: boolean;
  surface?: SettingsPayload["surface"];
  runtime_surface?: SettingsPayload["runtime_surface"];
  runtime_capabilities?: SettingsPayload["runtime_capabilities"];
};
export type ProviderApiType = "auto" | "chat_completions" | "responses";
export type ProviderForm = { apiKey: string; apiBase: string; apiType: ProviderApiType };
export type CustomMcpTransport = "stdio" | "streamableHttp" | "sse";

export interface CustomMcpForm {
  name: string;
  transport: CustomMcpTransport;
  command: string;
  args: string;
  url: string;
  env: string;
  headers: string;
  toolTimeout: string;
}
