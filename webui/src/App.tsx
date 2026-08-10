import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { HashRouter, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/layouts";
import { HashChangeSync } from "@/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearSavedSecret,
  deriveWsUrl,
  fetchAuthConfig,
  fetchBootstrap,
  loadSavedSecret,
  saveSecret,
} from "@/lib/apis/bootstrap";
import { MinibotClient } from "@/lib/apis/minibot-client";
import {
  createRuntimeHost,
  getHostApi,
  toRuntimeSurface,
} from "@/lib/configs/runtime";
import type { AuthConfigResponse, RuntimeSurface } from "@/lib/types";
import { ClientProvider } from "@/providers/ClientProvider";

type BootState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "auth"; failed?: boolean }
  | {
      status: "ready";
      client: MinibotClient;
      token: string;
      tokenExpiresAt: number;
      modelName: string | null;
      runtimeSurface: RuntimeSurface;
    };

const TOKEN_REFRESH_MARGIN_MS = 30_000;
const TOKEN_REFRESH_MIN_DELAY_MS = 5_000;

function bootstrapTokenExpiresAt(expiresInSeconds: number): number {
  return Date.now() + Math.max(0, expiresInSeconds) * 1000;
}

function tokenRefreshDelayMs(expiresAt: number): number {
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

function buildLoginRedirect(loginUrl: string | null | undefined): string {
  const base = loginUrl ?? "/auth/login";
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}next=${encodeURIComponent(currentLocationForNext())}`;
}

function buildLogoutRedirect(logoutUrl: string | null | undefined): string {
  const base = logoutUrl ?? "/auth/logout";
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}next=${encodeURIComponent("/")}`;
}

function isMiniAuth(config: AuthConfigResponse | null): boolean {
  return config?.auth_provider === "mini_auth";
}

function AuthForm({
  failed,
  onSecret,
}: {
  failed: boolean;
  onSecret: (secret: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const secret = value.trim();
    if (!secret) return;
    setSubmitting(true);
    onSecret(secret);
  };

  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-lg font-semibold">{t("app.auth.title")}</p>
          <p className="text-sm text-muted-foreground">{t("app.auth.hint")}</p>
        </div>
        {failed && (
          <p className="text-center text-sm text-destructive">
            {t("app.auth.invalid")}
          </p>
        )}
        <Input
          type="password"
          placeholder={t("app.auth.placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={submitting}
          autoFocus
        />
        <Button
          type="submit"
          className="w-full"
          disabled={!value.trim() || submitting}
        >
          {t("app.auth.submit")}
        </Button>
      </form>
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  const [state, setState] = useState<BootState>({ status: "loading" });
  const bootstrapSecretRef = useRef("");
  const authConfigRef = useRef<AuthConfigResponse | null>(null);

  const redirectToMiniAuth = useCallback(
    (mode: "login" | "logout") => {
      if (typeof window === "undefined") return;
      const config = authConfigRef.current;
      const target =
        mode === "login"
          ? buildLoginRedirect(config?.login_url)
          : buildLogoutRedirect(config?.logout_url);
      window.location.assign(target);
    },
    [],
  );

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
          redirectToMiniAuth("login");
        }
        throw error;
      }
    },
    [redirectToMiniAuth],
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
          });
        } catch (e) {
          if (cancelled) return;
          const msg = (e as Error).message;
          if (msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
            if (isMiniAuth(authConfigRef.current)) {
              redirectToMiniAuth("login");
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
    [refreshReadyClient, redirectToMiniAuth],
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
            redirectToMiniAuth("login");
            return;
          }
          setState({ status: "auth", failed: true });
          return;
        }
        setState({ status: "error", message: msg });
      }
    }, tokenRefreshDelayMs(state.tokenExpiresAt));
    return () => window.clearTimeout(timer);
  }, [redirectToMiniAuth, refreshReadyClient, state]);

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
            redirectToMiniAuth("login");
          }
          return;
        }
        bootstrapWithSecret(loadSavedSecret());
      } catch {
        if (cancelled) return;
        authConfigRef.current = null;
        bootstrapWithSecret(loadSavedSecret());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapWithSecret, redirectToMiniAuth]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-in fade-in-0 duration-300">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-foreground/60" />
            </span>
            {t("app.loading.connecting")}
          </div>
        </div>
      </div>
    );
  }
  if (state.status === "auth") {
    return (
      <AuthForm
        failed={!!state.failed}
        onSecret={(s) => bootstrapWithSecret(s)}
      />
    );
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
      redirectToMiniAuth("logout");
      return;
    }
    clearSavedSecret();
    setState({ status: "auth" });
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
