/**
 * TestApiClient — API helper for E2E setup/teardown.
 *
 * Uses raw fetch so E2E has zero build-time coupling to the webui bundle.
 */

import "./env";

const API_BASE = process.env.MINIBOT_API_URL ?? "http://127.0.0.1:18766";
const AUTH_SECRET = process.env.E2E_AUTH_SECRET ?? "e2e-test-secret";

export interface TestSession {
  id: string;
  title?: string;
  chatId?: string;
}

export interface BootstrapResponse {
  token: string;
  ws_path: string;
  expires_in: number;
  model_name?: string;
}

export class TestApiClient {
  private token: string | null = null;
  private createdSessionIds: string[] = [];

  async bootstrap(): Promise<BootstrapResponse> {
    const res = await fetch(`${API_BASE}/webui/bootstrap`, {
      headers: { "X-Minibot-Auth": AUTH_SECRET },
    });
    if (!res.ok) {
      throw new Error(`bootstrap failed: HTTP ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as BootstrapResponse;
    if (!body.token) {
      throw new Error("bootstrap response missing token");
    }
    this.token = body.token;
    return body;
  }

  async createSession(title: string): Promise<TestSession> {
    const res = await this.authedFetch("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      throw new Error(`create session failed: HTTP ${res.status} ${await res.text()}`);
    }
    const session = (await res.json()) as TestSession;
    if (session.id) {
      this.createdSessionIds.push(session.id);
    }
    return session;
  }

  async deleteSession(id: string): Promise<void> {
    const res = await this.authedFetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`delete session failed: HTTP ${res.status} ${await res.text()}`);
    }
    this.createdSessionIds = this.createdSessionIds.filter((sid) => sid !== id);
  }

  async cleanup(): Promise<void> {
    for (const id of [...this.createdSessionIds]) {
      try {
        await this.deleteSession(id);
      } catch {
        // ignore — session may already be gone
      }
    }
    this.createdSessionIds = [];
  }

  getToken(): string | null {
    return this.token;
  }

  private async authedFetch(path: string, init?: RequestInit): Promise<Response> {
    if (!this.token) {
      await this.bootstrap();
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((init?.headers as Record<string, string>) ?? {}),
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return fetch(`${API_BASE}${path}`, { ...init, headers });
  }
}

export function e2eAuthSecret(): string {
  return AUTH_SECRET;
}
