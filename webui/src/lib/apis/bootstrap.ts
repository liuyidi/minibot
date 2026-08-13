import type { AuthConfigResponse, BootstrapResponse } from "@/lib/types";
import { fetchWithTimeout } from "./http";

const SECRET_STORAGE_KEY = "minibot-webui.bootstrap-secret";

/** Read a previously saved bootstrap secret from localStorage. */
export function loadSavedSecret(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(SECRET_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Persist the bootstrap secret so page reloads don't re-prompt. */
export function saveSecret(secret: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SECRET_STORAGE_KEY, secret);
  } catch {
    // ignore storage errors (private mode, etc.)
  }
}

/** Clear the saved bootstrap secret (sign out). */
export function clearSavedSecret(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SECRET_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function authHeaders(secret: string): Record<string, string> {
  return {
    "X-Minibot-Auth": secret,
  };
}

async function fetchJson<T>(url: string, timeoutMs?: number): Promise<T> {
  const res = await fetchWithTimeout(
    url,
    {
      method: "GET",
      credentials: "same-origin",
    },
    timeoutMs,
  );
  if (!res.ok) {
    throw new Error(`request failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Fetch the public auth mode used by the gateway. */
export async function fetchAuthConfig(
  baseUrl: string = "",
  timeoutMs?: number,
): Promise<AuthConfigResponse> {
  return fetchJson<AuthConfigResponse>(`${baseUrl}/auth/config`, timeoutMs);
}

/**
 * Fetch a short-lived token + the WebSocket path from the gateway's
 * ``/webui/bootstrap`` endpoint.
 */
export async function fetchBootstrap(
  baseUrl: string = "",
  secret: string = "",
  timeoutMs?: number,
): Promise<BootstrapResponse> {
  const headers: Record<string, string> = secret ? authHeaders(secret) : {};
  const res = await fetchWithTimeout(`${baseUrl}/webui/bootstrap`, {
    method: "GET",
    credentials: "same-origin",
    headers,
  }, timeoutMs);
  if (!res.ok) {
    throw new Error(`bootstrap failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as BootstrapResponse;
  if (!body.token || !body.ws_path) {
    throw new Error("bootstrap response missing token or ws_path");
  }
  return body;
}

function devGatewayPort(): string {
  const env = (import.meta as {
    env?: { VITE_MINIBOT_WS_PORT?: string };
  }).env;
  return env?.VITE_MINIBOT_WS_PORT ?? "8766";
}

/** Vite defaults to 5173; when occupied it increments (5174, …). Dev WS must
 * talk to the gateway directly because Vite does not proxy ``/ws``. */
function isViteDevServerPort(port: string): boolean {
  const n = Number(port);
  return Number.isInteger(n) && n >= 5173 && n < 5200;
}

/** Derive a WebSocket URL from the current window location and the server-provided path.
 *
 * Keeps the path segment exactly as the server registered it: the root ``/``
 * stays ``/`` and non-root paths are not given an extra trailing slash. This
 * matters because some WS servers dispatch handshakes based on the literal
 * path, not a normalised form.
 */
export function deriveWsUrl(
  wsPath: string,
  token: string,
  wsUrl?: string | null,
): string {
  const query = `?token=${encodeURIComponent(token)}`;
  const path = wsPath && wsPath.startsWith("/") ? wsPath : `/${wsPath || ""}`;
  if (typeof window !== "undefined" && isViteDevServerPort(window.location.port)) {
    const host = window.location.hostname.includes(":")
      ? `[${window.location.hostname}]`
      : window.location.hostname;
    const gatewayPort = devGatewayPort();
    return `ws://${host}:${gatewayPort}${path}${query}`;
  }
  if (wsUrl && /^(wss?|minibot-host):\/\//i.test(wsUrl)) {
    const join = wsUrl.includes("?") ? "&" : "?";
    return `${wsUrl}${join}token=${encodeURIComponent(token)}`;
  }
  if (typeof window === "undefined") {
    return `ws://127.0.0.1:8766${path}${query}`;
  }
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  return `${scheme}://${host}${path}${query}`;
}
