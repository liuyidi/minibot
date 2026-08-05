import type { ChatSummary } from "@/lib/types";

export type ImPlatform = "feishu" | "weixin";

const IM_PREFIXES: ImPlatform[] = ["feishu", "weixin"];

/** Bare session id without the WebUI ``websocket:`` wrapper. */
export function bareSessionId(session: ChatSummary): string {
  const key = (session.key || "").trim();
  if (key.startsWith("websocket:")) return key.slice("websocket:".length);
  return session.chatId || key;
}

export function imPlatformFromSession(session: ChatSummary): ImPlatform | null {
  const bare = bareSessionId(session);
  for (const platform of IM_PREFIXES) {
    if (bare === platform || bare.startsWith(`${platform}:`)) return platform;
  }
  return null;
}

export function isImSession(session: ChatSummary): boolean {
  return imPlatformFromSession(session) !== null;
}

export function isWebChatSession(session: ChatSummary): boolean {
  return !isImSession(session);
}

export function imPeerId(session: ChatSummary, platform: ImPlatform): string {
  const bare = bareSessionId(session);
  if (bare.startsWith(`${platform}:`)) return bare.slice(platform.length + 1);
  return bare;
}

function truncateMiddle(text: string, max = 16): string {
  const value = text.trim();
  if (value.length <= max) return value;
  const head = Math.max(6, Math.floor(max * 0.6));
  const tail = Math.max(3, max - head - 1);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Sidebar label for an IM child session. */
export function imSessionLabel(session: ChatSummary, platform: ImPlatform): string {
  const override = (session.title || "").trim();
  const peer = imPeerId(session, platform);
  if (platform === "weixin") {
    if (override && !override.startsWith("weixin:")) return override;
    return "我的微信";
  }
  if (override && !override.startsWith("feishu:")) return truncateMiddle(override, 18);
  return truncateMiddle(peer || session.preview || "飞书会话", 18);
}

export function groupImSessions(sessions: ChatSummary[]): Record<ImPlatform, ChatSummary[]> {
  const out: Record<ImPlatform, ChatSummary[]> = { feishu: [], weixin: [] };
  for (const session of sessions) {
    const platform = imPlatformFromSession(session);
    if (!platform) continue;
    out[platform].push(session);
  }
  for (const platform of IM_PREFIXES) {
    out[platform].sort((a, b) => {
      const ta = Date.parse(a.updatedAt || a.createdAt || "") || 0;
      const tb = Date.parse(b.updatedAt || b.createdAt || "") || 0;
      return tb - ta;
    });
  }
  return out;
}
