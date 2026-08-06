import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveWsUrl, fetchBootstrap } from "@/lib/apis/bootstrap";

describe("bootstrap helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("prefers the server-provided websocket URL over the current dev host", () => {
    expect(deriveWsUrl("/", "tok en", "ws://127.0.0.1:8765/")).toBe(
      "ws://127.0.0.1:8765/?token=tok%20en",
    );
  });

  it("overrides the server-provided websocket URL when on Vite dev ports", () => {
    for (const port of ["5173", "5174"]) {
      vi.stubGlobal("window", {
        location: {
          port,
          hostname: "192.168.1.100",
          protocol: "http:",
        },
      });
      expect(deriveWsUrl("/", "tok", "ws://127.0.0.1:8765/")).toBe(
        "ws://192.168.1.100:8766/?token=tok",
      );
    }
  });

  it("preserves the host socket bridge URL", () => {
    expect(deriveWsUrl("/", "tok en", "minibot-host://engine/")).toBe(
      "minibot-host://engine/?token=tok%20en",
    );
  });

  it("falls back to the current window host for legacy bootstrap payloads", () => {
    expect(deriveWsUrl("/", "tok")).toBe(
      "ws://localhost:3000/?token=tok",
    );
  });

  it("times out when the bootstrap endpoint never responds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    const pending = expect(fetchBootstrap("", "", 25)).rejects.toThrow(
      "Request timed out after 25ms",
    );
    await vi.advanceTimersByTimeAsync(25);

    await pending;
  });
});
