import { describe, expect, it } from "vitest";

import {
  classifyBootError,
  createWebBootSession,
  type WebBootEvent,
  type WebBootSessionSummary,
} from "@/lib/telemetry";

describe("web boot telemetry (otel)", () => {
  it("emits a complete stage timeline with total_ms", () => {
    let t = 0;
    const events: Array<WebBootEvent | WebBootSessionSummary> = [];
    const session = createWebBootSession({
      appVersion: "1.0.20",
      buildChannel: "dev",
      coldStart: true,
      now: () => t,
      emit: (payload) => events.push(payload),
      enableOtel: false,
      geoLookup: null,
      clientContext: null,
    });

    t = 10;
    session.begin("auth_config");
    t = 40;
    session.markOk("auth_config");

    t = 40;
    session.begin("bootstrap");
    t = 140;
    session.markOk("bootstrap");

    t = 140;
    session.begin("client_ready");
    t = 180;
    session.markOk("client_ready");

    t = 200;
    session.markFirstPaint();
    t = 250;
    session.markFirstInteractive();

    expect(session.isFinished()).toBe(true);
    expect(session.bootId.startsWith("wb_")).toBe(true);

    const complete = events.find((e) => e.event === "web_boot_complete") as
      | WebBootSessionSummary
      | undefined;
    expect(complete).toBeTruthy();
    expect(complete?.total_ms).toBe(250);
    expect(complete?.stage_durations.auth_config).toBe(30);
    expect(complete?.stage_durations.bootstrap).toBe(100);
    expect(complete?.stage_durations.client_ready).toBe(40);
    expect(complete?.error_code).toBeNull();
  });

  it("records first_error_stage on failure", () => {
    let t = 0;
    const events: Array<WebBootEvent | WebBootSessionSummary> = [];
    const session = createWebBootSession({
      now: () => t,
      emit: (payload) => events.push(payload),
      enableOtel: false,
      geoLookup: null,
      clientContext: null,
    });
    t = 5;
    session.begin("bootstrap");
    t = 55;
    session.markFail("bootstrap", "bootstrap_401", "HTTP 401");

    const failed = events.find((e) => e.event === "web_boot_failed") as
      | WebBootSessionSummary
      | undefined;
    expect(failed?.status).toBe("fail");
    expect(failed?.error_code).toBe("bootstrap_401");
    expect(failed?.first_error_stage).toBe("bootstrap");
    expect(failed?.total_ms).toBe(55);
    expect(session.isFinished()).toBe(true);

    session.markOk("client_ready");
    expect(events.filter((e) => e.event === "web_client_ready")).toHaveLength(0);
  });

  it("classifies common boot errors", () => {
    expect(classifyBootError(new Error("HTTP 401"))).toEqual({
      code: "bootstrap_401",
      message: "HTTP 401",
    });
    expect(classifyBootError(new Error("Request timed out after 20000ms")).code).toBe(
      "timeout",
    );
    expect(classifyBootError(new Error("Failed to fetch")).code).toBe("network");
  });
});

describe("client context", () => {
  it("parses macOS Chrome UA", async () => {
    const { detectClientContext } = await import("@/lib/telemetry/clientContext");
    const ctx = detectClientContext(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      { language: "zh-CN" } as Navigator,
      { width: 1440, height: 900 },
    );
    expect(ctx["os.name"]).toBe("macOS");
    expect(ctx["browser.name"]).toBe("Chrome");
    expect(ctx["device.type"]).toBe("desktop");
    expect(ctx["client.locale"]).toBe("zh-CN");
    expect(ctx["device.screen_w"]).toBe(1440);
  });

  it("parses iPhone Safari as mobile iOS", async () => {
    const { detectClientContext } = await import("@/lib/telemetry/clientContext");
    const ctx = detectClientContext(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      { language: "en-US" } as Navigator,
      { width: 390, height: 844 },
    );
    expect(ctx["os.name"]).toBe("iOS");
    expect(ctx["device.type"]).toBe("mobile");
    expect(ctx["browser.name"]).toBe("Safari");
  });
});

describe("otel gate", () => {
  it("disables OTLP URL resolution under vitest (MODE=test)", async () => {
    const { isWebTelemetryEnabled, resolveOtlpTracesUrl, resetWebTelemetryForTests } =
      await import("@/lib/telemetry/otel");
    resetWebTelemetryForTests();
    expect(isWebTelemetryEnabled()).toBe(false);
    expect(resolveOtlpTracesUrl()).toBe("");
  });
});
