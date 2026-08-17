import { clearSavedSecret } from "@/lib/apis/bootstrap";
import {
  absoluteAuthUrl,
  buildLoginRedirect,
  buildLogoutRedirect,
  newDesktopLoginId,
  waitForDesktopOpenLogin,
} from "@/lib/auth-flow";

/** Open system-browser OAuth, or fall back to in-window login redirect. */
export async function beginDesktopLogin(options: {
  loginUrl: string | null | undefined;
  onBrowserLogin: (desktopLoginId: string) => void;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const host = await waitForDesktopOpenLogin();
  if (host?.openLogin) {
    const desktopLoginId = newDesktopLoginId();
    options.onBrowserLogin(desktopLoginId);
    const relative = buildLoginRedirect(options.loginUrl, {
      desktop: true,
      desktopLoginId,
      next: "/",
    });
    await host.openLogin(absoluteAuthUrl(relative));
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
 * Clear WebView session locally, then IdP-logout in the system browser.
 * Browser-only clients keep using an in-window logout redirect.
 */
export async function redirectToMiniAuthLogout(options: {
  logoutUrl: string | null | undefined;
  onDesktopWelcome: () => void;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const host = await waitForDesktopOpenLogin();
  if (host?.openLogin) {
    try {
      await fetch(buildLogoutRedirect(options.logoutUrl, { local: true }), {
        method: "GET",
        credentials: "same-origin",
      });
    } catch {
      // Best-effort; still leave the app on the welcome screen.
    }
    clearSavedSecret();
    options.onDesktopWelcome();
    const browserLogout = buildLogoutRedirect(options.logoutUrl, {
      next: "/auth/desktop/logged-out",
    });
    await host.openLogin(absoluteAuthUrl(browserLogout));
    return;
  }
  window.location.assign(buildLogoutRedirect(options.logoutUrl));
}
