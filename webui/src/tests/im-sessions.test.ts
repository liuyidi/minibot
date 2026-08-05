import { describe, expect, it } from "vitest";

import {
  bareSessionId,
  groupImSessions,
  imPlatformFromSession,
  imSessionLabel,
  isWebChatSession,
} from "@/lib/im-sessions";
import type { ChatSummary } from "@/lib/types";

function session(partial: Partial<ChatSummary> & Pick<ChatSummary, "key">): ChatSummary {
  const key = partial.key;
  const idx = key.indexOf(":");
  return {
    channel: idx >= 0 ? key.slice(0, idx) : "websocket",
    chatId: idx >= 0 ? key.slice(idx + 1) : key,
    createdAt: null,
    updatedAt: null,
    preview: "",
    ...partial,
  };
}

describe("im-sessions", () => {
  it("classifies feishu/weixin under websocket-wrapped keys", () => {
    const feishu = session({ key: "websocket:feishu:ou_abc123456789" });
    const weixin = session({ key: "websocket:weixin:user@im.wechat" });
    const web = session({ key: "websocket:chat-uuid" });

    expect(imPlatformFromSession(feishu)).toBe("feishu");
    expect(imPlatformFromSession(weixin)).toBe("weixin");
    expect(imPlatformFromSession(web)).toBeNull();
    expect(isWebChatSession(web)).toBe(true);
    expect(bareSessionId(feishu)).toBe("feishu:ou_abc123456789");
  });

  it("groups and labels channel children", () => {
    const rows = [
      session({ key: "websocket:feishu:ou_42081ae2deadbeef", updatedAt: "2026-08-05T12:00:00Z" }),
      session({ key: "websocket:weixin:o9cq@im.wechat", updatedAt: "2026-08-05T11:00:00Z" }),
      session({ key: "websocket:plain", updatedAt: "2026-08-05T10:00:00Z" }),
    ];
    const grouped = groupImSessions(rows);
    expect(grouped.feishu).toHaveLength(1);
    expect(grouped.weixin).toHaveLength(1);
    expect(imSessionLabel(grouped.feishu[0], "feishu")).toMatch(/^ou_42081ae/);
    expect(imSessionLabel(grouped.weixin[0], "weixin")).toBe("我的微信");
  });

  it("pins channel sessions, hides archived unless shown, and prefers title overrides", () => {
    const older = session({
      key: "websocket:feishu:ou_older",
      updatedAt: "2026-08-05T10:00:00Z",
    });
    const newer = session({
      key: "websocket:feishu:ou_newer",
      updatedAt: "2026-08-05T12:00:00Z",
    });
    const archived = session({
      key: "websocket:feishu:ou_archived",
      updatedAt: "2026-08-05T13:00:00Z",
    });

    const hidden = groupImSessions([older, newer, archived], {
      pinnedKeys: ["websocket:feishu:ou_older"],
      archivedKeys: ["websocket:feishu:ou_archived"],
      showArchived: false,
    });
    expect(hidden.feishu.map((row) => row.key)).toEqual([
      "websocket:feishu:ou_older",
      "websocket:feishu:ou_newer",
    ]);

    const shown = groupImSessions([older, newer, archived], {
      pinnedKeys: ["websocket:feishu:ou_older"],
      archivedKeys: ["websocket:feishu:ou_archived"],
      showArchived: true,
    });
    expect(shown.feishu.map((row) => row.key)).toEqual([
      "websocket:feishu:ou_older",
      "websocket:feishu:ou_archived",
      "websocket:feishu:ou_newer",
    ]);

    expect(
      imSessionLabel(newer, "feishu", {
        "websocket:feishu:ou_newer": "客户支持",
      }),
    ).toBe("客户支持");
  });
});
