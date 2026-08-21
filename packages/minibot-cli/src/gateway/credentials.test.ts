import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { credentialPathLabel, resolveCredentials } from "./credentials.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function withConfigDir(session?: object): Promise<string> {
  const dir = join(tmpdir(), `minibot-cli-cred-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  dirs.push(dir);
  await mkdir(dir, { recursive: true });
  if (session) {
    await writeFile(join(dir, "session.json"), JSON.stringify(session), "utf8");
  }
  return dir;
}

describe("resolveCredentials", () => {
  it("prefers secret over session", async () => {
    const dir = await withConfigDir({
      accessToken: "tok",
      expiresAt: Date.now() + 60_000
    });
    const resolved = await resolveCredentials({ secret: "s3cret", configDir: dir });
    expect(resolved.path).toBe("secret");
    expect(resolved.secret).toBe("s3cret");
  });

  it("uses non-expired session", async () => {
    const dir = await withConfigDir({
      accessToken: "tok",
      tokenType: "Bearer",
      expiresAt: Date.now() + 60_000,
      email: "a@b.co"
    });
    const resolved = await resolveCredentials({ configDir: dir });
    expect(resolved.path).toBe("session");
    expect(resolved.accessToken).toBe("tok");
  });

  it("falls back to anonymous when session expired", async () => {
    const dir = await withConfigDir({
      accessToken: "tok",
      tokenType: "Bearer",
      expiresAt: Date.now() - 1000
    });
    const resolved = await resolveCredentials({ configDir: dir, now: Date.now() });
    expect(resolved.path).toBe("anonymous");
  });

  it("labels paths", () => {
    expect(credentialPathLabel("secret")).toContain("secret");
    expect(credentialPathLabel("session")).toContain("mini-auth");
    expect(credentialPathLabel("anonymous")).toContain("anonymous");
  });
});
