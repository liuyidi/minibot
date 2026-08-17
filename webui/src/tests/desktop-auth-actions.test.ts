import { afterEach, describe, expect, it, vi } from "vitest";

import { beginDesktopLogin } from "@/lib/desktop-auth-actions";

describe("beginDesktopLogin", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "minibotHost");
    vi.unstubAllGlobals();
  });

  it("opens the mini-auth authorize URL from the gateway", async () => {
    const openLogin = vi.fn(async () => undefined);
    window.minibotHost = {
      getRuntimeInfo: async () => ({
        surface: "native",
        app_version: "1.0.0",
        engine_status: "ready",
        data_dir: "/tmp",
        logs_dir: "/tmp",
        config_path: "/tmp/config.json",
        workspace_path: "/tmp/workspace",
        python: "python",
      }),
      restartEngine: async () => undefined,
      pickFolder: async () => null,
      openLogs: async () => undefined,
      exportDiagnostics: async () => "",
      openLogin,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          authorize_url: "https://auth.example/oauth/authorize?redirect_uri=minibot",
        }),
      })),
    );

    const onBrowserLogin = vi.fn();
    await beginDesktopLogin({
      loginUrl: "/auth/login",
      onBrowserLogin,
    });

    expect(openLogin).toHaveBeenCalledWith(
      "https://auth.example/oauth/authorize?redirect_uri=minibot",
    );
    expect(onBrowserLogin).toHaveBeenCalledWith({
      desktopLoginId: null,
      loginUrl: "https://auth.example/oauth/authorize?redirect_uri=minibot",
    });
    const opened = String(openLogin.mock.calls[0]?.[0] ?? "");
    expect(opened).not.toContain("127.0.0.1");
  });
});
