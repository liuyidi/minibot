import { ApiError, type FetchLike, fetchWithTimeout, requestJson } from "./http.js";
import type { BootstrapResponse } from "./types.js";

export interface BootstrapOptions {
  baseUrl: string;
  secret?: string;
  fetchImpl: FetchLike;
  timeoutMs?: number;
}

/** GET /webui/bootstrap (also works with /auth/bootstrap). */
export async function fetchBootstrap(options: BootstrapOptions): Promise<BootstrapResponse> {
  const base = options.baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (options.secret) {
    headers["X-Minibot-Auth"] = options.secret;
  }
  const res = await fetchWithTimeout(
    options.fetchImpl,
    `${base}/webui/bootstrap`,
    { method: "GET", headers },
    options.timeoutMs,
  );
  if (!res.ok) {
    throw new ApiError(res.status, `bootstrap failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as BootstrapResponse;
  if (!body.token || !body.ws_path) {
    throw new ApiError(0, "bootstrap response missing token or ws_path");
  }
  return body;
}

/**
 * Build an absolute WebSocket URL for RN / Node / browser.
 *
 * Prefer ``bootstrap.ws_url`` when the server sends one; otherwise join
 * ``baseUrl`` + ``ws_path`` + ``?token=``.
 */
export function resolveWsUrl(options: {
  baseUrl: string;
  token: string;
  wsPath: string;
  wsUrl?: string | null;
}): string {
  const query = `token=${encodeURIComponent(options.token)}`;
  const path =
    options.wsPath && options.wsPath.startsWith("/")
      ? options.wsPath
      : `/${options.wsPath || "ws"}`;

  if (options.wsUrl && /^(wss?|minibot-host):\/\//i.test(options.wsUrl)) {
    const join = options.wsUrl.includes("?") ? "&" : "?";
    return `${options.wsUrl}${join}${query}`;
  }

  const base = options.baseUrl.replace(/\/$/, "");
  if (/^https?:\/\//i.test(base)) {
    const wsBase = base.replace(/^http/i, "ws");
    return `${wsBase}${path}?${query}`;
  }

  // Relative / empty baseUrl (browser same-origin) — caller should pass absolute baseUrl on RN.
  const host =
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { location?: { host?: string; protocol?: string } }).location?.host ===
      "string"
      ? (globalThis as { location: { host: string; protocol: string } }).location
      : null;
  if (host) {
    const scheme = host.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${host.host}${path}?${query}`;
  }
  return `ws://127.0.0.1:8766${path}?${query}`;
}

export async function fetchHealth(
  fetchImpl: FetchLike,
  baseUrl: string,
): Promise<{ status: string; runtime?: string }> {
  const base = baseUrl.replace(/\/$/, "");
  return requestJson(fetchImpl, `${base}/health`, { method: "GET" }, 10_000);
}
