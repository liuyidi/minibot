import type { SettingsPayload } from "@/lib/types";

export type SettingsSectionKey =
  | "profile"
  | "overview"
  | "appearance"
  | "models"
  | "image"
  | "voice"
  | "browser"
  | "runtime"
  | "advanced";

export type LocalDensity = "comfortable" | "compact";
export type LocalActivityMode = "auto" | "expanded";

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

export type SettingsPageProps = {
  theme: "light" | "dark";
  initialSection?: SettingsSectionKey;
  initialSettings?: SettingsPayload | null;
  showSidebar?: boolean;
  onToggleTheme: () => void;
  onBackToChat: () => void;
  onModelNameChange: (modelName: string | null) => void;
  onSettingsChange?: (payload: SettingsPayload) => void;
  onRefreshSettings?: () => Promise<SettingsPayload | null>;
  onWorkspaceSettingsChange?: () => void | Promise<void>;
  onSectionChange?: (section: SettingsSectionKey) => void;
  onLogout?: () => void;
  onRestart?: () => void;
  onNativeEngineRestart?: () => Promise<string>;
  isRestarting?: boolean;
  hostChromeInset?: boolean;
};
