import { afterEach, describe, expect, it } from "vitest";

import {
  PROFILE_STORAGE_KEY,
  avatarColorFromSeed,
  formatProfileDate,
  profileInitials,
  readLocalProfile,
  resolveProfileAccount,
  writeLocalProfile,
} from "@/lib/profile";

describe("profile helpers", () => {
  afterEach(() => {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  });

  it("builds initials from latin and CJK names", () => {
    expect(profileInitials("liuyidi")).toBe("LI");
    expect(profileInitials("Ada Lovelace")).toBe("AL");
    expect(profileInitials("一流的人")).toBe("一流");
    expect(profileInitials("  ")).toBe("MB");
  });

  it("keeps avatar colors stable for a seed", () => {
    expect(avatarColorFromSeed("seed-a")).toBe(avatarColorFromSeed("seed-a"));
    expect(avatarColorFromSeed("seed-a")).not.toBe(avatarColorFromSeed("seed-b"));
  });

  it("formats registration dates as YYYY-MM-DD", () => {
    expect(formatProfileDate("2026-08-11T00:00:00Z")).toBe("2026-08-11");
    expect(formatProfileDate("2026-08-11")).toBe("2026-08-11");
    expect(formatProfileDate("")).toBe("");
  });

  it("prefers the local nickname and falls back to auth account fields", () => {
    const local = writeLocalProfile({
      displayName: "Studio",
      avatarSeed: "seed-1",
      localUserId: "local-1",
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(
      resolveProfileAccount(local, {
        id: "user-demo",
        name: "demo",
        email: "demo@mini-auth.dev",
        created_at: "2026-08-11T00:00:00Z",
      }, "minibot"),
    ).toEqual({
      displayName: "Studio",
      userId: "user-demo",
      createdAt: "2026-08-11T00:00:00Z",
      email: "demo@mini-auth.dev",
      picture: null,
    });

    const unnamed = writeLocalProfile({ ...local, displayName: null });
    expect(resolveProfileAccount(unnamed, { name: "demo" }, "minibot").displayName).toBe("demo");
    expect(resolveProfileAccount(unnamed, null, "minibot").userId).toBe("local-1");
    expect(
      resolveProfileAccount(unnamed, null, {
        fallbackName: "minibot",
        allowFallback: false,
      }).displayName,
    ).toBe("");
  });

  it("persists a generated local profile on first read", () => {
    const first = readLocalProfile();
    const second = readLocalProfile();
    expect(first.localUserId).toBe(second.localUserId);
    expect(first.avatarSeed).toBe(second.avatarSeed);
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? "{}").localUserId).toBe(
      first.localUserId,
    );
  });
});
