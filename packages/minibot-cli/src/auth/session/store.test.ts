import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getSessionStore } from "./store.js";

describe("session store", () => {
  it("saves and loads a session", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "minibot-cli-"));
    const store = getSessionStore(join(tempRoot, "session.json"));
    await store.save({
      accessToken: "access",
      refreshToken: "refresh",
      tokenType: "Bearer",
      expiresAt: Date.now() + 1000,
      subject: "sub",
      email: "a@example.com"
    });

    const loaded = await store.load();
    expect(loaded?.accessToken).toBe("access");
    expect(loaded?.email).toBe("a@example.com");
    expect(await store.clear()).toBe(true);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("returns false when clearing a missing session", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "minibot-cli-"));
    const store = getSessionStore(join(tempRoot, "session.json"));
    expect(await store.clear()).toBe(true);
    rmSync(tempRoot, { recursive: true, force: true });
  });
});
