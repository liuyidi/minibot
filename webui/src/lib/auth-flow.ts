import type { AuthConfigResponse } from "@/lib/types";

const TOKEN_REFRESH_MARGIN_MS = 30_000;
const TOKEN_REFRESH_MIN_DELAY_MS = 5_000;

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

export function buildLoginRedirect(loginUrl: string | null | undefined): string {
  const base = loginUrl ?? "/auth/login";
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}next=${encodeURIComponent(currentLocationForNext())}`;
}

export function buildLogoutRedirect(logoutUrl: string | null | undefined): string {
  const base = logoutUrl ?? "/auth/logout";
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}next=${encodeURIComponent("/")}`;
}

export function isMiniAuth(config: AuthConfigResponse | null): boolean {
  return config?.auth_provider === "mini_auth";
}
