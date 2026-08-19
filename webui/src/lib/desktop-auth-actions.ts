import { clearSavedSecret } from "@/lib/apis/bootstrap";
import {
  absoluteAuthUrl,
  buildLoginRedirect,
  buildLogoutRedirect,
  fetchDesktopAuthorizeUrl,
  newDesktopLoginId,
  waitForDesktopOpenLogin,
} from "@/lib/auth-flow";

export type DesktopBrowserLoginStart = {
  /** Set for HTTP loopback handoff; null when using minibot:// callback. */
  desktopLoginId: string | null;
  /** Absolute URL opened in the system browser (for copy / retry). */
  loginUrl: string;
};

/** Open system-browser OAuth, or fall back to in-window login redirect. */
export async function beginDesktopLogin(options: {
  loginUrl: string | null | undefined;
  onBrowserLogin: (start: DesktopBrowserLoginStart) => void;
  /** Prefer HTTP loopback + handoff (e.g. tauri:dev without scheme). */
  preferLoopback?: boolean;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const host = await waitForDesktopOpenLogin();
  if (host?.openLogin) {
    if (!options.preferLoopback) {
      try {
        const { authorize_url } = await fetchDesktopAuthorizeUrl();
        options.onBrowserLogin({
          desktopLoginId: null,
          loginUrl: authorize_url,
        });
        await host.openLogin(authorize_url);
        return;
      } catch {
        // Fall through to loopback handoff.
      }
    }
    const desktopLoginId = newDesktopLoginId();
    const relative = buildLoginRedirect(options.loginUrl, {
      desktop: true,
      desktopLoginId,
      next: "/",
    });
    const absolute = absoluteAuthUrl(relative);
    options.onBrowserLogin({ desktopLoginId, loginUrl: absolute });
    await host.openLogin(absolute);
    return;
  }
  window.location.assign(buildLoginRedirect(options.loginUrl));
}

/** Prefer native welcome screen when host bridge is available. */
export async function showDesktopWelcomeOrBrowserLogin(options: {
  loginUrl: string | null | undefined;
  onWelcome: () => void;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const host = await waitForDesktopOpenLogin();
  if (host?.openLogin) {
    options.onWelcome();
    return;
  }
  window.location.assign(buildLoginRedirect(options.loginUrl));
}

/**
 * Sign out of mini-auth.
 * - Desktop: clear only the local minibot session (reuse browser IdP login).
 * - Web: top-level navigate to `/auth/logout` so mini-auth SSO is cleared too.
 *   Local-only clear + `/auth/login` would immediately SSO the user back in.
 */
export async function redirectToMiniAuthLogout(options: {
  logoutUrl: string | null | undefined;
  onDesktopWelcome: () => void;
}): Promise<void> {
  if (typeof window === "undefined") return;
  clearSavedSecret();
  const host = await waitForDesktopOpenLogin();
  if (host?.openLogin) {
    try {
      await fetch(buildLogoutRedirect(options.logoutUrl, { local: true }), {
        method: "GET",
        credentials: "same-origin",
      });
    } catch {
      // Best-effort local clear.
    }
    options.onDesktopWelcome();
    return;
  }
  window.location.assign(buildLogoutRedirect(options.logoutUrl, { next: "/" }));
}
