import { describe, expect, it, vi } from "vitest";

import { resolveWsUrl, fetchBootstrap } from "./bootstrap.js";
import { createClient } from "./createClient.js";
import { ApiError } from "./http.js";

describe("resolveWsUrl", () => {
  it("joins http baseUrl to ws", () => {
    const url = resolveWsUrl({
      baseUrl: "http://10.0.2.2:8766",
      token: "abc",
      wsPath: "/ws",
    });
    expect(url).toBe("ws://10.0.2.2:8766/ws?token=abc");
  });

  it("uses https → wss", () => {
    const url = resolveWsUrl({
      baseUrl: "https://bot.example.com",
      token: "t",
      wsPath: "ws",
    });
    expect(url).toBe("wss://bot.example.com/ws?token=t");
  });

  it("prefers explicit ws_url", () => {
    const url = resolveWsUrl({
      baseUrl: "http://127.0.0.1:8766",
      token: "t",
      wsPath: "/ws",
      wsUrl: "ws://custom/ws",
    });
    expect(url).toBe("ws://custom/ws?token=t");
  });
});

describe("createClient", () => {
  it("requires baseUrl", () => {
    expect(() => createClient({ baseUrl: "" })).toThrow(/baseUrl/);
  });

  it("bootstrap + sessions.list", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/webui/bootstrap")) {
        return new Response(
          JSON.stringify({
            token: "tok",
            ws_path: "/ws",
            expires_in: 3600,
            model_name: "gpt-4o-mini",
            runtime_surface: "minibot",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/api/sessions")) {
        return new Response(
          JSON.stringify({
            sessions: [
              {
                id: "s1",
                key: "websocket:s1",
                title: "Hi",
                preview: "…",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("missing", { status: 404 });
    });

    const client = createClient({
      baseUrl: "http://127.0.0.1:8766",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const boot = await client.bootstrap();
    expect(boot.token).toBe("tok");
    expect(client.token).toBe("tok");

    const sessions = await client.sessions.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("s1");
    expect(sessions[0].key).toBe("websocket:s1");
  });

  it("fetchBootstrap sends minibot auth header", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ token: "t", ws_path: "/ws", expires_in: 1 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await fetchBootstrap({
      baseUrl: "http://127.0.0.1:8766",
      secret: "sekrit",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Minibot-Auth"]).toBe("sekrit");
  });

  it("maps HTML error to ApiError", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("<!doctype html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    const client = createClient({
      baseUrl: "http://127.0.0.1:8766",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.health()).rejects.toBeInstanceOf(ApiError);
  });
});
