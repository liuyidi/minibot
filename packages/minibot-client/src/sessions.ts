import { type FetchLike, requestJson, fetchWithTimeout, ApiError } from "./http.js";
import type { SessionSummary, TurnResult, WebuiThreadPayload } from "./types.js";

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function normalizeSessionKey(idOrKey: string): string {
  const raw = idOrKey.trim();
  if (!raw) return raw;
  return raw.includes(":") ? raw : `websocket:${raw}`;
}

function bareId(idOrKey: string): string {
  const key = normalizeSessionKey(idOrKey);
  const idx = key.indexOf(":");
  return idx >= 0 ? key.slice(idx + 1) : key;
}

export class SessionsApi {
  constructor(
    private readonly getBaseUrl: () => string,
    private readonly getToken: () => string,
    private readonly fetchImpl: FetchLike,
  ) {}

  private base(): string {
    return this.getBaseUrl().replace(/\/$/, "");
  }

  private token(): string {
    const t = this.getToken();
    if (!t) throw new ApiError(401, "Not bootstrapped: call client.bootstrap() first");
    return t;
  }

  async list(): Promise<SessionSummary[]> {
    type Row = {
      id?: string;
      key?: string;
      title?: string;
      preview?: string;
      workspace_path?: string;
      created_at?: string | null;
      updated_at?: string | null;
    };
    const body = await requestJson<{ sessions: Row[] }>(
      this.fetchImpl,
      `${this.base()}/api/sessions`,
      { headers: authHeaders(this.token()) },
    );
    return (body.sessions || []).map((s) => {
      const id = s.id || (s.key ? bareId(s.key) : "");
      const key = normalizeSessionKey(s.key || id);
      return {
        id,
        key,
        title: s.title ?? "",
        preview: s.preview ?? "",
        workspace_path: s.workspace_path,
        created_at: s.created_at ?? null,
        updated_at: s.updated_at ?? null,
      };
    });
  }

  async create(opts?: { title?: string; workspace_path?: string | null }): Promise<SessionSummary> {
    const body = await requestJson<{
      id: string;
      key?: string;
      title?: string;
      preview?: string;
      workspace_path?: string;
      created_at?: string | null;
      updated_at?: string | null;
    }>(this.fetchImpl, `${this.base()}/api/sessions`, {
      method: "POST",
      headers: {
        ...authHeaders(this.token()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: opts?.title ?? "",
        workspace_path: opts?.workspace_path ?? null,
      }),
    });
    const id = body.id;
    return {
      id,
      key: normalizeSessionKey(body.key || id),
      title: body.title ?? "",
      preview: body.preview ?? "",
      workspace_path: body.workspace_path,
      created_at: body.created_at ?? null,
      updated_at: body.updated_at ?? null,
    };
  }

  async getThread(idOrKey: string): Promise<WebuiThreadPayload | null> {
    const key = normalizeSessionKey(idOrKey);
    const res = await fetchWithTimeout(
      this.fetchImpl,
      `${this.base()}/api/sessions/${encodeURIComponent(key)}/webui-thread`,
      { headers: authHeaders(this.token()) },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = typeof res.text === "function" ? (await res.text()).trim() : "";
      throw new ApiError(res.status, text || `HTTP ${res.status}`);
    }
    return (await res.json()) as WebuiThreadPayload;
  }

  async delete(idOrKey: string): Promise<void> {
    const key = normalizeSessionKey(idOrKey);
    await requestJson(
      this.fetchImpl,
      `${this.base()}/api/sessions/${encodeURIComponent(key)}/delete`,
      { headers: authHeaders(this.token()) },
    );
  }

  /** Sync turn (non-streaming). Prefer WS for Chat UX. */
  async turn(idOrKey: string, content: string): Promise<TurnResult> {
    const id = bareId(idOrKey);
    return requestJson<TurnResult>(
      this.fetchImpl,
      `${this.base()}/api/sessions/${encodeURIComponent(id)}/turns`,
      {
        method: "POST",
        headers: {
          ...authHeaders(this.token()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      },
    );
  }
}
