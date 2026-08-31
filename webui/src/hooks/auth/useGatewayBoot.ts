import { useCallback, useEffect, useRef } from "react";

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
  isMiniAuth,
} from "@/lib/auth-flow";
import { MinibotClient } from "@/lib/apis/minibot-client";
import {
  createRuntimeHost,
  getHostApi,
  toRuntimeSurface,
} from "@/lib/configs/runtime";
import { showDesktopWelcomeOrBrowserLogin } from "@/lib/desktop-auth-actions";
import {
  classifyBootError,
  createWebBootSession,
  type WebBootSession,
} from "@/lib/telemetry";
import type { AuthConfigResponse, RuntimeSurface } from "@/lib/types";

export type AppBootState =
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

type SetBootState = (
  value: AppBootState | ((current: AppBootState) => AppBootState),
) => void;

/**
 * Gateway auth/bootstrap flow with Phase 1 web-boot telemetry.
 * Keeps App.tsx under the file-length gate.
 */
export function useGatewayBoot(
  setState: SetBootState,
  onWelcome: () => void,
): {
  bootstrapWithSecret: (secret: string) => () => void;
  refreshReadyClient: (
    client: MinibotClient,
    fallbackSurface: RuntimeSurface,
  ) => Promise<{ token: string; url: string }>;
  authConfigRef: React.MutableRefObject<AuthConfigResponse | null>;
  bootstrapSecretRef: React.MutableRefObject<string>;
  bootSessionRef: React.MutableRefObject<WebBootSession | null>;
  isLocalDevelopmentHost: () => boolean;
} {
  const authConfigRef = useRef<AuthConfigResponse | null>(null);
  const bootstrapSecretRef = useRef("");
  const bootSessionRef = useRef<WebBootSession | null>(null);

  const goDesktopWelcomeOrLogin = useCallback(() => {
    void showDesktopWelcomeOrBrowserLogin({
      loginUrl: authConfigRef.current?.login_url,
      onWelcome,
    });
  }, [onWelcome]);

  const ensureBoot = useCallback((): WebBootSession => {
    if (!bootSessionRef.current || bootSessionRef.current.isFinished()) {
      bootSessionRef.current = createWebBootSession({
        appVersion: "1.0.20",
      });
    }
    return bootSessionRef.current;
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
    [goDesktopWelcomeOrLogin, setState],
  );

  const bootstrapWithSecret = useCallback(
    (secret: string) => {
      let cancelled = false;
      const session = ensureBoot();
      (async () => {
        setState({ status: "loading" });
        session.begin("bootstrap");
        try {
          const boot = await fetchBootstrap("", secret);
          if (cancelled) return;
          session.markOk("bootstrap");
          if (secret) saveSecret(secret);
          else if (isMiniAuth(authConfigRef.current)) clearSavedSecret();
          const url = deriveWsUrl(boot.ws_path, boot.token, boot.ws_url);
          const runtimeSurface =
            getHostApi() !== null ? "native" : toRuntimeSurface(boot.runtime_surface);
          const runtimeHost = createRuntimeHost(runtimeSurface, boot.runtime_capabilities);
          const shouldReconnect = !isMiniAuth(authConfigRef.current);
          session.begin("client_ready");
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
          session.markOk("client_ready");
          session.markFirstPaint();
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
          const { code, message } = classifyBootError(e);
          if (msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
            session.markFail("bootstrap", code, message);
            if (isMiniAuth(authConfigRef.current) || !isLocalDevelopmentHost()) {
              goDesktopWelcomeOrLogin();
              return;
            }
            setState({ status: "auth", failed: true });
          } else {
            session.markFail("bootstrap", code, message);
            setState({ status: "error", message: msg });
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    },
    [ensureBoot, goDesktopWelcomeOrLogin, refreshReadyClient, setState],
  );

  useEffect(() => {
    let cancelled = false;
    const session = ensureBoot();
    (async () => {
      session.begin("auth_config");
      try {
        const config = await fetchAuthConfig("");
        if (cancelled) return;
        session.markOk("auth_config");
        authConfigRef.current = config;
        if (config.auth_provider === "mini_auth") {
          if (config.authenticated) {
            clearSavedSecret();
            bootstrapWithSecret("");
          } else {
            // Waiting on login UI — not a boot failure.
            goDesktopWelcomeOrLogin();
          }
          return;
        }
        bootstrapWithSecret(loadSavedSecret());
      } catch (e) {
        if (cancelled) return;
        authConfigRef.current = null;
        const { code, message } = classifyBootError(e);
        if (!isLocalDevelopmentHost()) {
          session.markFail("auth_config", code, message);
          goDesktopWelcomeOrLogin();
          return;
        }
        // Local: fall through to secret bootstrap (auth_config optional).
        session.markOk("auth_config", { degraded: true, error: message });
        bootstrapWithSecret(loadSavedSecret());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapWithSecret, ensureBoot, goDesktopWelcomeOrLogin]);

  return {
    bootstrapWithSecret,
    refreshReadyClient,
    authConfigRef,
    bootstrapSecretRef,
    bootSessionRef,
    isLocalDevelopmentHost,
  };
}
