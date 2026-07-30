import { fetchBootstrap, fetchHealth, resolveWsUrl } from "./bootstrap.js";
import { type FetchLike, ApiError } from "./http.js";
import { SessionsApi } from "./sessions.js";
import type { BootstrapResponse } from "./types.js";
import { MinibotWsClient, type WebSocketConstructor } from "./ws.js";

export interface CreateClientOptions {
  /** Absolute gateway origin, e.g. ``http://127.0.0.1:8766`` (required for RN). */
  baseUrl: string;
  /** Optional gateway secret (``X-Minibot-Auth``). */
  getSecret?: () => string | Promise<string | undefined> | undefined;
  fetch?: FetchLike;
  WebSocket?: WebSocketConstructor;
  socketFactory?: (url: string) => WebSocket;
  /** Log inbound WS frames. */
  debug?: boolean;
  reconnect?: boolean;
}

export interface MinibotClient {
  readonly baseUrl: string;
  readonly token: string | null;
  readonly bootstrapInfo: BootstrapResponse | null;
  /** L0 — fetch token + prepare WS URL. */
  bootstrap: () => Promise<BootstrapResponse>;
  health: () => Promise<{ status: string; runtime?: string }>;
  sessions: SessionsApi;
  /**
   * L2 multiplex client. Call ``bootstrap()`` first (or pass url via reconnect).
   * Lazy: created on first access after bootstrap, or call ``ensureWs()``.
   */
  readonly ws: MinibotWsClient;
  /** Rebuild WS with current token (after bootstrap / reauth). */
  ensureWs: () => MinibotWsClient;
}

function defaultFetch(): FetchLike {
  if (typeof fetch === "undefined") {
    throw new Error("fetch is not available; pass options.fetch");
  }
  return fetch.bind(globalThis);
}

export function createClient(options: CreateClientOptions): MinibotClient {
  const baseUrl = (options.baseUrl || "").replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("createClient: baseUrl is required (e.g. http://127.0.0.1:8766)");
  }
  const fetchImpl = options.fetch ?? defaultFetch();

  let token: string | null = null;
  let bootstrapInfo: BootstrapResponse | null = null;
  let wsClient: MinibotWsClient | null = null;

  const sessions = new SessionsApi(
    () => baseUrl,
    () => token || "",
    fetchImpl,
  );

  async function bootstrap(): Promise<BootstrapResponse> {
    const secret = (await options.getSecret?.()) || "";
    const info = await fetchBootstrap({
      baseUrl,
      secret,
      fetchImpl,
    });
    token = info.token;
    bootstrapInfo = info;
    const wsUrl = resolveWsUrl({
      baseUrl,
      token: info.token,
      wsPath: info.ws_path,
      wsUrl: info.ws_url,
    });
    if (wsClient) {
      wsClient.updateUrl(wsUrl);
    } else {
      wsClient = new MinibotWsClient({
        url: wsUrl,
        reconnect: options.reconnect,
        debug: options.debug,
        WebSocketImpl: options.WebSocket,
        socketFactory: options.socketFactory,
        onReauth: async () => {
          const again = await bootstrap();
          return resolveWsUrl({
            baseUrl,
            token: again.token,
            wsPath: again.ws_path,
            wsUrl: again.ws_url,
          });
        },
      });
    }
    return info;
  }

  function ensureWs(): MinibotWsClient {
    if (!wsClient) {
      if (!token || !bootstrapInfo) {
        throw new ApiError(401, "Call bootstrap() before using client.ws");
      }
      const wsUrl = resolveWsUrl({
        baseUrl,
        token,
        wsPath: bootstrapInfo.ws_path,
        wsUrl: bootstrapInfo.ws_url,
      });
      wsClient = new MinibotWsClient({
        url: wsUrl,
        reconnect: options.reconnect,
        debug: options.debug,
        WebSocketImpl: options.WebSocket,
        socketFactory: options.socketFactory,
      });
    }
    return wsClient;
  }

  const client: MinibotClient = {
    get baseUrl() {
      return baseUrl;
    },
    get token() {
      return token;
    },
    get bootstrapInfo() {
      return bootstrapInfo;
    },
    bootstrap,
    health: () => fetchHealth(fetchImpl, baseUrl),
    sessions,
    get ws() {
      return ensureWs();
    },
    ensureWs,
  };

  return client;
}
