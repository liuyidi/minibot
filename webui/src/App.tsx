import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { HashRouter, Route, Routes } from "react-router-dom";

import {
  AuthForm,
  BootLoadingScreen,
  BrowserLoginWaiting,
} from "@/components/auth/BootScreens";
import { useGatewayBoot, type AppBootState } from "@/hooks/auth/useGatewayBoot";
import { AppLayout } from "@/layouts";
import { HashChangeSync } from "@/routes";
import { clearSavedSecret } from "@/lib/apis/bootstrap";
import {
  desktopSessionUrl,
  isMiniAuth,
  tokenRefreshDelayMs,
  waitForDesktopHandoff,
  waitForDesktopOpenLogin,
} from "@/lib/auth-flow";
import {
  beginDesktopLogin,
  redirectToMiniAuthLogout,
  showDesktopWelcomeOrBrowserLogin,
} from "@/lib/desktop-auth-actions";
import { getHostApi } from "@/lib/configs/runtime";
import { PORTAL } from "@/lib/configs/portal";
import { redirectLegacyDownloadHash } from "@/lib/configs/legacy-download-redirect";
import { ClientProvider } from "@/providers/ClientProvider";
import OpenPage from "@/pages/open/OpenPage";

function LegacyDownloadRedirect() {
  useEffect(() => {
    redirectLegacyDownloadHash();
  }, []);

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-sm text-muted-foreground">
      <p>Redirecting to the download page…</p>
      <a className="font-medium text-foreground underline underline-offset-4" href={PORTAL.download}>
        Continue to download
      </a>
    </main>
  );
}

export default function App() {
  if (typeof window !== "undefined") {
    const hashPath = window.location.hash
      .replace(/^#\/+/, "")
      .replace(/\/+$/, "")
      .split("?")[0];
    if (hashPath === "open") {
      return <OpenPage />;
    }
    if (hashPath === "download") {
      return <LegacyDownloadRedirect />;
    }
  }

  const { t } = useTranslation();
  const [state, setState] = useState<AppBootState>({ status: "loading" });

  const onWelcome = useCallback(() => {
    setState({ status: "desktop_welcome" });
  }, []);

  const {
    bootstrapWithSecret,
    refreshReadyClient,
    authConfigRef,
    bootSessionRef,
    isLocalDevelopmentHost,
  } = useGatewayBoot(setState, onWelcome);

  const goDesktopWelcomeOrLogin = useCallback(() => {
    void showDesktopWelcomeOrBrowserLogin({
      loginUrl: authConfigRef.current?.login_url,
      onWelcome,
    });
  }, [authConfigRef, onWelcome]);

  // Keep welcome/login URL in sync with latest auth config.
  const startDesktopLogin = useCallback(() => {
    void beginDesktopLogin({
      loginUrl: authConfigRef.current?.login_url,
      onBrowserLogin: ({ desktopLoginId, loginUrl }) =>
        setState({ status: "browser_login", desktopLoginId, loginUrl }),
    });
  }, [authConfigRef]);

  const logoutMiniAuth = useCallback(() => {
    void redirectToMiniAuthLogout({
      logoutUrl: authConfigRef.current?.logout_url,
      onDesktopWelcome: () => setState({ status: "desktop_welcome" }),
    });
  }, [authConfigRef]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const client = state.client;
    const timer = window.setTimeout(async () => {
      try {
        await refreshReadyClient(client, state.runtimeSurface);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
          if (isMiniAuth(authConfigRef.current)) {
            goDesktopWelcomeOrLogin();
            return;
          }
          setState({ status: "auth", failed: true });
          return;
        }
        setState({ status: "error", message: msg });
      }
    }, tokenRefreshDelayMs(state.tokenExpiresAt));
    return () => window.clearTimeout(timer);
  }, [authConfigRef, goDesktopWelcomeOrLogin, refreshReadyClient, state]);

  useEffect(() => {
    if (state.status !== "browser_login" || !state.desktopLoginId) return;
    const controller = new AbortController();
    const desktopLoginId = state.desktopLoginId;
    void (async () => {
      try {
        const handoff = await waitForDesktopHandoff(desktopLoginId, {
          signal: controller.signal,
        });
        window.location.assign(
          desktopSessionUrl(handoff.token, handoff.next_url || "/"),
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          message: (error as Error).message || "Desktop login handoff failed",
        });
      }
    })();
    return () => controller.abort();
  }, [state]);

  useEffect(() => {
    if (state.status !== "auth") return;
    if (!isLocalDevelopmentHost()) {
      goDesktopWelcomeOrLogin();
      return;
    }
    void (async () => {
      const host = await waitForDesktopOpenLogin();
      if (host?.openLogin) {
        setState({ status: "desktop_welcome" });
      }
    })();
  }, [goDesktopWelcomeOrLogin, isLocalDevelopmentHost, state.status]);

  const onBootInteractive = useCallback(() => {
    bootSessionRef.current?.markFirstInteractive();
  }, [bootSessionRef]);

  const handleModelNameChange = useCallback((modelName: string | null) => {
    setState((current) =>
      current.status === "ready" ? { ...current, modelName } : current,
    );
  }, []);

  const handleLogout = useCallback(() => {
    setState((current) => {
      if (current.status === "ready") {
        current.client.close();
      }
      return current;
    });
    if (isMiniAuth(authConfigRef.current)) {
      logoutMiniAuth();
      return;
    }
    clearSavedSecret();
    void (async () => {
      const host = await waitForDesktopOpenLogin();
      if (host?.openLogin) {
        setState({ status: "desktop_welcome" });
        return;
      }
      setState({ status: "auth" });
    })();
  }, [authConfigRef, logoutMiniAuth]);

  const handleNativeEngineRestart = useCallback(async (): Promise<string> => {
    const hostApi = getHostApi();
    if (!hostApi?.restartEngine) {
      throw new Error("native engine restart is unavailable");
    }
    await hostApi.restartEngine();
    if (state.status !== "ready") {
      throw new Error("native engine restart requires ready state");
    }
    const refreshed = await refreshReadyClient(state.client, state.runtimeSurface);
    return refreshed.token;
  }, [refreshReadyClient, state]);

  if (state.status === "loading") {
    return <BootLoadingScreen label={t("app.loading.connecting")} />;
  }
  if (state.status === "desktop_welcome") {
    return <BrowserLoginWaiting waiting={false} onLogin={startDesktopLogin} />;
  }
  if (state.status === "browser_login") {
    return (
      <BrowserLoginWaiting
        waiting
        loginUrl={state.loginUrl}
        onLogin={startDesktopLogin}
      />
    );
  }
  if (state.status === "auth") {
    if (!isLocalDevelopmentHost()) return null;
    return <AuthForm failed={!!state.failed} onSecret={(s) => bootstrapWithSecret(s)} />;
  }
  if (state.status === "error") {
    return (
      <div className="flex h-full w-full items-center justify-center px-4 text-center">
        <div className="flex max-w-md flex-col items-center gap-3">
          <p className="text-lg font-semibold">{t("app.error.title")}</p>
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <p className="text-xs text-muted-foreground">
            {t("app.error.gatewayHint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClientProvider
      client={state.client}
      token={state.token}
      modelName={state.modelName}
    >
      <HashRouter>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <HashChangeSync />
                <AppLayout
                  runtimeSurface={state.runtimeSurface}
                  accountDisplayName={state.accountDisplayName}
                  onModelNameChange={handleModelNameChange}
                  onLogout={handleLogout}
                  onNativeEngineRestart={handleNativeEngineRestart}
                  onInteractive={onBootInteractive}
                />
              </>
            }
          />
        </Routes>
      </HashRouter>
    </ClientProvider>
  );
}
