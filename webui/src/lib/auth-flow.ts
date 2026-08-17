import type { AuthConfigResponse } from "@/lib/types";
import { getHostApi, type MinibotHostApi } from "@/lib/configs/runtime";

const TOKEN_REFRESH_MARGIN_MS = 30_000;
const TOKEN_REFRESH_MIN_DELAY_MS = 5_000;
const HANDOFF_POLL_MS = 800;

export function bootstrapTokenExpiresAt(expiresInSeconds: number): number {
  return Date.now() + Math.max(0, expiresInSeconds) * 1000;
}

export function tokenRefreshDelayMs(expiresAt: number): number {
  const remaining = Math.max(0, expiresAt - Date.now());
  const margin = Math.min(
    TOKEN_REFRESH_MARGIN_MS,
    Math.max(1_000, remaining / 2),
  );
  return Math.max(TOKEN_REFRESH_MIN_DELAY_MS, remaining - margin);
}

function currentLocationForNext(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function newDesktopLoginId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `desk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildLoginRedirect(
  loginUrl: string | null | undefined,
  options?: {
    desktop?: boolean;
    desktopLoginId?: string;
    next?: string;
  },
): string {
  const base = loginUrl ?? "/auth/login";
  const join = base.includes("?") ? "&" : "?";
  const next = options?.next ?? currentLocationForNext();
  const desktop = options?.desktop ? "&desktop=1" : "";
  const handoff = options?.desktopLoginId
    ? `&desktop_login_id=${encodeURIComponent(options.desktopLoginId)}`
    : "";
  return `${base}${join}next=${encodeURIComponent(next)}${desktop}${handoff}`;
}

export function absoluteAuthUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (typeof window === "undefined") return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${window.location.origin}${path}`;
}

export function desktopSessionUrl(token: string, nextUrl = "/"): string {
  const next = nextUrl.startsWith("/") ? nextUrl : `/${nextUrl}`;
  return `/auth/desktop/session?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
}

export type DesktopHandoffPayload = {
  token: string;
  expires_in: number;
  next_url: string;
};

/** Poll until the system-browser OAuth callback stores a handoff token. */
export async function waitForDesktopHandoff(
  desktopLoginId: string,
  options?: { signal?: AbortSignal; intervalMs?: number },
): Promise<DesktopHandoffPayload> {
  const intervalMs = options?.intervalMs ?? HANDOFF_POLL_MS;
  const url = `/auth/desktop/handoff?id=${encodeURIComponent(desktopLoginId)}`;
  for (;;) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const res = await fetch(url, {
      credentials: "same-origin",
      signal: options?.signal,
    });
    if (res.status === 200) {
      return (await res.json()) as DesktopHandoffPayload;
    }
    if (res.status !== 404) {
      throw new Error(`Desktop handoff failed (HTTP ${res.status})`);
    }
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => resolve(), intervalMs);
      options?.signal?.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }
}

function hasTauriBridge(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return w.__TAURI__ != null || w.__TAURI_INTERNALS__ != null;
}

/** Wait for desktop host openLogin when running inside Tauri WebView. */
export async function waitForDesktopOpenLogin(
  timeoutMs = 2500,
): Promise<MinibotHostApi | null> {
  const existing = getHostApi();
  if (existing?.openLogin) return existing;
  if (!hasTauriBridge()) return existing;

  return await new Promise((resolve) => {
    const started = Date.now();
    const finish = (host: MinibotHostApi | null) => {
      window.removeEventListener("minibot-host-ready", onReady);
      window.clearInterval(timer);
      resolve(host);
    };
    const onReady = () => {
      const host = getHostApi();
      if (host?.openLogin) finish(host);
    };
    window.addEventListener("minibot-host-ready", onReady);
    const timer = window.setInterval(() => {
      const host = getHostApi();
      if (host?.openLogin) {
        finish(host);
        return;
      }
      if (Date.now() - started >= timeoutMs) finish(getHostApi());
    }, 40);
  });
}

export function buildLogoutRedirect(
  logoutUrl: string | null | undefined,
  options?: { next?: string; local?: boolean },
): string {
  const base = logoutUrl ?? "/auth/logout";
  const join = base.includes("?") ? "&" : "?";
  const next = options?.next ?? "/";
  const local = options?.local ? "&local=1" : "";
  return `${base}${join}next=${encodeURIComponent(next)}${local}`;
}

export function isMiniAuth(config: AuthConfigResponse | null): boolean {
  return config?.auth_provider === "mini_auth";
}
