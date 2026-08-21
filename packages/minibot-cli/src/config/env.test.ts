import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("uses defaults", () => {
    const env = loadEnv({});
    expect(env.authBaseUrl).toBe("https://auth.liuyidi.me");
    expect(env.gatewayBaseUrl).toBe("http://127.0.0.1:8766");
    expect(env.authSecret).toBe("");
    expect(env.configDir).toBe("");
    expect(env.noColor).toBe(false);
  });

  it("reads overrides", () => {
    const env = loadEnv({
      MINIBOT_AUTH_URL: "https://auth.example.com",
      MINIBOT_API_URL: "http://127.0.0.1:9000",
      MINIBOT_AUTH_SECRET: "s3cret",
      MINIBOT_CONFIG_DIR: "/tmp/minibot",
      NO_COLOR: "1"
    });
    expect(env.authBaseUrl).toBe("https://auth.example.com");
    expect(env.gatewayBaseUrl).toBe("http://127.0.0.1:9000");
    expect(env.authSecret).toBe("s3cret");
    expect(env.configDir).toBe("/tmp/minibot");
    expect(env.noColor).toBe(true);
  });

  it("keeps auth and gateway URLs independent", () => {
    const env = loadEnv({ MINIBOT_API_URL: "https://bot.example.com" });
    expect(env.gatewayBaseUrl).toBe("https://bot.example.com");
    expect(env.authBaseUrl).toBe("https://auth.liuyidi.me");
  });
});
