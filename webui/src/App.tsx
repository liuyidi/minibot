import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { HashRouter, Route, Routes } from "react-router-dom";

import {
  AuthForm,
  BootLoadingScreen,
  BrowserLoginWaiting,
} from "@/components/auth/BootScreens";
import { AppLayout } from "@/layouts";
import { HashChangeSync } from "@/routes";
import {
  clearSavedSecret,
  deriveWsUrl,
  fetchAuthConfig,
  fetchBootstrap,
  loadSavedSecret,
  saveSecret,
} from "@/lib/apis/bootstrap";
import { accountDisplayName } from "@/lib/auth-account";
import {
  bootstrapTokenExpiresAt,
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
import { MinibotClient } from "@/lib/apis/minibot-client";
import {
  createRuntimeHost,
  getHostApi,
  toRuntimeSurface,
} from "@/lib/configs/runtime";
import type { AuthConfigResponse, RuntimeSurface } from "@/lib/types";
import { ClientProvider } from "@/providers/ClientProvider";
import OpenPage from "@/pages/open/OpenPage";

type BootState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "auth"; failed?: boolean }
  | { status: "desktop_welcome" }
  | {
      status: "browser_login";
      desktopLoginId: string | null;
      loginUrl: string | null;
    }
  | {
      status: "ready";
      client: MinibotClient;
      token: string;
      tokenExpiresAt: number;
      modelName: string | null;
      runtimeSurface: RuntimeSurface;
      accountDisplayName: string | null;
    };

function isLocalDevelopmentHost(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export default function App() {
  if (typeof window !== "undefined" && window.location.hash.replace(/^#\/+/, "") === "open") {
    return <OpenPage />;
  }

  const { t } = useTranslation();
  const [state, setState] = useState<BootState>({ status: "loading" });
  const bootstrapSecretRef = useRef("");
  const authConfigRef = useRef<AuthConfigResponse | null>(null);

  const startDesktopLogin = useCallback(() => {
    void beginDesktopLogin({
      loginUrl: authConfigRef.current?.login_url,
      onBrowserLogin: ({ desktopLoginId, loginUrl }) =>
        setState({ status: "browser_login", desktopLoginId, loginUrl }),
    });
  }, []);

  const goDesktopWelcomeOrLogin = useCallback(() => {
    void showDesktopWelcomeOrBrowserLogin({
      loginUrl: authConfigRef.current?.login_url,
      onWelcome: () => setState({ status: "desktop_welcome" }),
    });
  }, []);

  const logoutMiniAuth = useCallback(() => {
    void redirectToMiniAuthLogout({
      logoutUrl: authConfigRef.current?.logout_url,
      onDesktopWelcome: () => setState({ status: "desktop_welcome" }),
    });
  }, []);

  const refreshReadyClient = useCallback(
    async (client: MinibotClient, fallbackSurface: RuntimeSurface) => {
      try {
        const boot = await fetchBootstrap("", bootstrapSecretRef.current);
        const url = deriveWsUrl(boot.ws_path, boot.token, boot.ws_url);
        const runtimeSurface = getHostApi() !== null
          ? "native"
          : boot.runtime_surface
            ? toRuntimeSurface(boot.runtime_surface)
            : fallbackSurface;
        const runtimeHost = createRuntimeHost(runtimeSurface, boot.runtime_capabilities);
        const tokenExpiresAt = bootstrapTokenExpiresAt(boot.expires_in);
        if (runtimeHost.socketFactory) {
          client.updateUrl(url, runtimeHost.socketFactory);
        } else {
          client.updateUrl(url);
        }
        setState((current) =>
          current.status === "ready" && current.client === client
            ? {
                ...current,
                token: boot.token,
                tokenExpiresAt,
                modelName: boot.model_name ?? current.modelName,
                runtimeSurface,
              }
            : current,
        );
        return { token: boot.token, url };
      } catch (error) {
        if (isMiniAuth(authConfigRef.current)) {
          goDesktopWelcomeOrLogin();
        }
        throw error;
      }
    },
    [goDesktopWelcomeOrLogin],
  );

  const bootstrapWithSecret = useCallback(
    (secret: string) => {
      let cancelled = false;
      (async () => {
        setState({ status: "loading" });
        try {
          const boot = await fetchBootstrap("", secret);
          if (cancelled) return;
          if (secret) saveSecret(secret);
          else if (isMiniAuth(authConfigRef.current)) clearSavedSecret();
          const url = deriveWsUrl(boot.ws_path, boot.token, boot.ws_url);
          const runtimeSurface =
            getHostApi() !== null ? "native" : toRuntimeSurface(boot.runtime_surface);
          const runtimeHost = createRuntimeHost(runtimeSurface, boot.runtime_capabilities);
          const shouldReconnect = !isMiniAuth(authConfigRef.current);
          const client = new MinibotClient({
            url,
            reconnect: shouldReconnect,
            socketFactory: runtimeHost.socketFactory,
            onReauth: shouldReconnect
              ? async () => {
                  try {
                    const refreshed = await refreshReadyClient(client, runtimeSurface);
                    return refreshed.url;
                  } catch {
                    return null;
                  }
                }
              : undefined,
          });
          bootstrapSecretRef.current = secret;
          client.connect();
          setState({
            status: "ready",
            client,
            token: boot.token,
            tokenExpiresAt: bootstrapTokenExpiresAt(boot.expires_in),
            modelName: boot.model_name ?? null,
            runtimeSurface,
            accountDisplayName: accountDisplayName(authConfigRef.current),
          });
        } catch (e) {
          if (cancelled) return;
          const msg = (e as Error).message;
          if (msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
            if (isMiniAuth(authConfigRef.current) || !isLocalDevelopmentHost()) {
              goDesktopWelcomeOrLogin();
              return;
            }
            setState({ status: "auth", failed: true });
          } else {
            setState({ status: "error", message: msg });
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    },
    [refreshReadyClient, goDesktopWelcomeOrLogin],
  );

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
  }, [goDesktopWelcomeOrLogin, refreshReadyClient, state]);

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
    let cancelled = false;
    (async () => {
      try {
        const config = await fetchAuthConfig("");
        if (cancelled) return;
        authConfigRef.current = config;
        if (config.auth_provider === "mini_auth") {
          if (config.authenticated) {
            clearSavedSecret();
            bootstrapWithSecret("");
          } else {
            goDesktopWelcomeOrLogin();
          }
          return;
        }
        bootstrapWithSecret(loadSavedSecret());
      } catch {
        if (cancelled) return;
        authConfigRef.current = null;
        if (!isLocalDevelopmentHost()) {
          goDesktopWelcomeOrLogin();
          return;
        }
        bootstrapWithSecret(loadSavedSecret());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapWithSecret, goDesktopWelcomeOrLogin]);

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
  }, [goDesktopWelcomeOrLogin, state.status]);

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

  const handleModelNameChange = (modelName: string | null) => {
    setState((current) =>
      current.status === "ready" ? { ...current, modelName } : current,
    );
  };

  const handleLogout = () => {
    if (state.status === "ready") {
      state.client.close();
    }
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
  };

  const handleNativeEngineRestart = async (): Promise<string> => {
    const hostApi = getHostApi();
    if (!hostApi?.restartEngine) {
      throw new Error("native engine restart is unavailable");
    }
    await hostApi.restartEngine();
    const refreshed = await refreshReadyClient(state.client, state.runtimeSurface);
    return refreshed.token;
  };

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
                />
              </>
            }
          />
        </Routes>
      </HashRouter>
    </ClientProvider>
  );
}
