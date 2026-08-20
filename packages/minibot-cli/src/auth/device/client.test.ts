import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeviceFlowClient } from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createDeviceFlowClient", () => {
  it("sends device context headers when starting device flow", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          device_code: "dev",
          user_code: "USER-CODE",
          verification_uri: "https://example.com/device",
          verification_uri_complete: "https://example.com/device?user_code=USER-CODE",
          expires_in: 900,
          interval: 5
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("process", {
      version: "v22.23.1"
    } as typeof process);

    const client = createDeviceFlowClient("https://auth.example", "minibot", {
      deviceLabel: "DdeMacBook-Pro.local @ minibot-cli v1.0.0 darwin (arm64)",
      userAgent: "DdeMacBook-Pro.local @ minibot-cli v1.0.0 darwin (arm64)"
    });

    await client.startDeviceFlow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(String(url)).toBe("https://auth.example/oauth/device/start");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-device-label": "DdeMacBook-Pro.local @ minibot-cli v1.0.0 darwin (arm64)",
      "user-agent": "DdeMacBook-Pro.local @ minibot-cli v1.0.0 darwin (arm64)"
    });
  });
});
