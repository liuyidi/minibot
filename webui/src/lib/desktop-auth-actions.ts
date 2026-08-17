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
 * WorkBuddy-style: clear only the local minibot session.
 * Do not open a browser or hit mini-auth /logout.
 */
export async function redirectToMiniAuthLogout(options: {
  logoutUrl: string | null | undefined;
  onDesktopWelcome: () => void;
  onWebSignedOut: () => void;
}): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch(buildLogoutRedirect(options.logoutUrl, { local: true }), {
      method: "GET",
      credentials: "same-origin",
    });
  } catch {
    // Best-effort local clear.
  }
  clearSavedSecret();
  const host = await waitForDesktopOpenLogin();
  if (host?.openLogin) {
    options.onDesktopWelcome();
    return;
  }
  options.onWebSignedOut();
}
