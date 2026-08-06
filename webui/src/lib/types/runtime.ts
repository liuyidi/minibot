/** Bootstrap and host/runtime capability types. */

export interface BootstrapResponse {
  token: string;
  ws_path: string;
  ws_url?: string | null;
  expires_in: number;
  model_name?: string | null;
  runtime_surface?: RuntimeSurface;
  runtime_capabilities?: RuntimeCapabilities;
}

export type RuntimeSurface = "browser" | "native";
export type RestartBehavior = "none" | "nextTurn" | "engineRestart" | "appRestart";
export type SettingsApplyStatus =
  | "idle"
  | "pending"
  | "applying"
  | "restarting_engine"
  | "requires_app_restart";

export interface RuntimeCapabilities {
  can_restart_engine: boolean;
  can_pick_folder: boolean;
  can_open_logs: boolean;
  can_export_diagnostics: boolean;
}
