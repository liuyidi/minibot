import { context, trace, type Span } from "@opentelemetry/api";

import type { WebBootEvent, WebBootSessionSummary } from "./bootTypes";

export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `wb_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }
  return `wb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function detectColdStart(): boolean {
  if (typeof performance === "undefined") return true;
  const nav = performance.getEntriesByType?.("navigation")?.[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (nav?.type === "reload" || nav?.type === "navigate") return true;
  if (nav?.type === "back_forward") return false;
  return true;
}

export function detectBuildChannel(): string {
  try {
    const mode = (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE;
    return mode === "production" ? "stable" : "dev";
  } catch {
    return "dev";
  }
}

export function detectAppVersion(): string {
  try {
    const v = (import.meta as ImportMeta & { env?: { VITE_APP_VERSION?: string } }).env
      ?.VITE_APP_VERSION;
    if (v) return v;
  } catch {
    // ignore
  }
  return "0.0.0";
}

export function defaultEmit(payload: WebBootEvent | WebBootSessionSummary): void {
  if (typeof console !== "undefined" && typeof console.info === "function") {
    console.info("[web-boot]", JSON.stringify(payload));
  }
}

export function childCtx(parent: Span | null) {
  if (!parent) return context.active();
  return trace.setSpan(context.active(), parent);
}

/** Classify common bootstrap/auth errors into stable codes. */
export function classifyBootError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error ?? "unknown");
  if (message.includes("timed out") || message.includes("Timeout")) {
    return { code: "timeout", message };
  }
  if (message.includes("HTTP 401")) return { code: "bootstrap_401", message };
  if (message.includes("HTTP 403")) return { code: "bootstrap_403", message };
  if (message.includes("HTTP ")) {
    const m = message.match(/HTTP (\d+)/);
    return { code: `http_${m?.[1] ?? "error"}`, message };
  }
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return { code: "network", message };
  }
  return { code: "unknown", message };
}
