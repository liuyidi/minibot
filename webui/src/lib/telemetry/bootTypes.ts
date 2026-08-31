import type { Tracer } from "@opentelemetry/api";

import type { ClientContext, GeoContext } from "./clientContext";

export type WebBootStage =
  | "js_boot"
  | "auth_config"
  | "bootstrap"
  | "client_ready"
  | "first_paint"
  | "first_interactive";

export type WebBootEventName =
  | "web_boot_start"
  | "web_auth_config_ok"
  | "web_auth_config_fail"
  | "web_bootstrap_ok"
  | "web_bootstrap_fail"
  | "web_client_ready"
  | "web_first_paint"
  | "web_first_interactive"
  | "web_boot_complete"
  | "web_boot_failed";

export type WebBootStatus = "ok" | "fail" | "pending";

export interface WebBootEvent {
  event: WebBootEventName;
  boot_id: string;
  trace_id: string | null;
  ts: string;
  stage: WebBootStage;
  duration_ms: number | null;
  status: WebBootStatus;
  app_version: string;
  platform: "web";
  build_channel: string;
  cold_start: boolean;
  error_code: string | null;
  error_message: string | null;
  extra?: Record<string, unknown>;
}

export interface WebBootSessionSummary {
  event: "web_boot_complete" | "web_boot_failed";
  boot_id: string;
  trace_id: string | null;
  ts: string;
  status: "ok" | "fail";
  app_version: string;
  platform: "web";
  build_channel: string;
  cold_start: boolean;
  total_ms: number;
  stage_durations: Partial<Record<WebBootStage, number>>;
  error_code: string | null;
  error_message: string | null;
  first_error_stage: WebBootStage | null;
  /** Device / OS / browser / soft-geo attached to the root span. */
  client_context?: Record<string, string | number | boolean>;
}

export interface WebBootSessionOptions {
  appVersion?: string;
  buildChannel?: string;
  coldStart?: boolean;
  /** Override clock (tests). */
  now?: () => number;
  /** Override emit sink (tests / console). */
  emit?: (payload: WebBootEvent | WebBootSessionSummary) => void;
  /** Inject tracer (tests). Empty disables OTel export. */
  tracer?: Tracer | null;
  /** Disable OTel provider init (tests). */
  enableOtel?: boolean;
  /** Inject / skip client device+OS context (tests). */
  clientContext?: ClientContext | null;
  /** Inject / skip geo lookup (tests). Pass null to disable network. */
  geoLookup?: (() => Promise<GeoContext>) | null;
}

export const STAGE_OK_EVENT: Record<WebBootStage, WebBootEventName> = {
  js_boot: "web_boot_start",
  auth_config: "web_auth_config_ok",
  bootstrap: "web_bootstrap_ok",
  client_ready: "web_client_ready",
  first_paint: "web_first_paint",
  first_interactive: "web_first_interactive",
};
