import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("uses defaults", () => {
    const env = loadEnv({});
    expect(env.authBaseUrl).toBe("https://auth.liuyidi.me");
    expect(env.configDir).toBe("");
    expect(env.noColor).toBe(false);
  });

  it("reads overrides", () => {
    const env = loadEnv({ MINIBOT_AUTH_URL: "https://auth.example.com", MINIBOT_CONFIG_DIR: "/tmp/minibot", NO_COLOR: "1" });
    expect(env.authBaseUrl).toBe("https://auth.example.com");
    expect(env.configDir).toBe("/tmp/minibot");
    expect(env.noColor).toBe(true);
  });

  it("falls back to the legacy api url env", () => {
    const env = loadEnv({ MINIBOT_API_URL: "https://legacy.example.com" });
    expect(env.authBaseUrl).toBe("https://legacy.example.com");
  });
});
