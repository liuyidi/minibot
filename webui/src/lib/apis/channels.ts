import { request } from "./api";

const API_READ_TIMEOUT_MS = 20_000;

export type ChannelKind = "feishu" | "weixin";

export type FeishuStatus = {
  enabled: boolean;
  configured?: boolean;
  connected: boolean;
  app_id: string;
  has_app_secret: boolean;
  app_secret_masked: string;
  bot_name: string;
  domain: string;
  dm_policy: string;
  allow_from_count: number;
  group_policy: string;
  running?: boolean;
  pending_pairing?: number;
  last_error?: string;
};

export type WeixinStatus = {
  enabled: boolean;
  configured?: boolean;
  connected: boolean;
  has_token: boolean;
  token_masked: string;
  bot_name: string;
  dm_policy: string;
  allow_from_count: number;
  base_url: string;
  poll_timeout: number;
  running?: boolean;
  pending_pairing?: number;
  last_error?: string;
};

export type FeishuSetupSession = {
  id: string;
  status: string;
  qr_url: string | null;
  expire_in: number | null;
  bot_name: string;
  app_id: string;
  app_secret?: string;
  app_secret_masked?: string;
  has_app_secret?: boolean;
  scanner_open_id: string;
  error: string | null;
};

export type WeixinSetupSession = {
  id: string;
  status: string;
  qr_url: string | null;
  qr_image_base64: string | null;
  expire_in: number | null;
  bot_name: string;
  bot_token?: string;
  bot_token_masked?: string;
  has_bot_token?: boolean;
  scanner_user_id: string;
  error: string | null;
};

export type PairingItem = {
  id: string;
  sender_id: string;
  chat_type: string;
  created_at: number;
  label?: string;
  from?: string;
};

export type ChannelStatus = FeishuStatus | WeixinStatus;
export type SetupSession = FeishuSetupSession | WeixinSetupSession;

function channelBase(channel: ChannelKind, base = ""): string {
  return `${base}/api/channels/${channel}`;
}

function jsonPost(body?: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

export function isChannelConfigured(
  channel: ChannelKind,
  status: ChannelStatus | null,
): boolean {
  if (!status) return false;
  if (typeof status.configured === "boolean") return status.configured;
  if (channel === "feishu") {
    const fs = status as FeishuStatus;
    return Boolean(fs.app_id && fs.has_app_secret);
  }
  return Boolean((status as WeixinStatus).has_token);
}

export async function fetchFeishuStatus(
  token: string,
  base = "",
): Promise<FeishuStatus> {
  return request<FeishuStatus>(
    channelBase("feishu", base),
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchWeixinStatus(
  token: string,
  base = "",
): Promise<WeixinStatus> {
  return request<WeixinStatus>(
    channelBase("weixin", base),
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchChannelStatuses(
  token: string,
  base = "",
): Promise<{ feishu: FeishuStatus; weixin: WeixinStatus }> {
  const [feishu, weixin] = await Promise.all([
    fetchFeishuStatus(token, base),
    fetchWeixinStatus(token, base),
  ]);
  return { feishu, weixin };
}

export async function startFeishuSetup(
  token: string,
  body: { domain?: string; bot_name?: string; create_only?: boolean } = {},
  base = "",
): Promise<FeishuSetupSession> {
  return request<FeishuSetupSession>(
    `${channelBase("feishu", base)}/setup/start`,
    token,
    jsonPost({
      domain: body.domain ?? "feishu",
      bot_name: body.bot_name ?? "minibot",
      create_only: body.create_only ?? true,
    }),
  );
}

export async function startWeixinSetup(
  token: string,
  body: { bot_name?: string } = {},
  base = "",
): Promise<WeixinSetupSession> {
  return request<WeixinSetupSession>(
    `${channelBase("weixin", base)}/setup/start`,
    token,
    jsonPost({ bot_name: body.bot_name ?? "minibot" }),
  );
}

export async function pollSetupSession(
  token: string,
  channel: ChannelKind,
  setupId: string,
  base = "",
): Promise<SetupSession> {
  return request<SetupSession>(
    `${channelBase(channel, base)}/setup/${encodeURIComponent(setupId)}`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function refreshFeishuSetup(
  token: string,
  setupId: string,
  body: { domain?: string; bot_name?: string } = {},
  base = "",
): Promise<FeishuSetupSession> {
  return request<FeishuSetupSession>(
    `${channelBase("feishu", base)}/setup/${encodeURIComponent(setupId)}/refresh`,
    token,
    jsonPost({
      domain: body.domain ?? "feishu",
      bot_name: body.bot_name ?? "minibot",
    }),
  );
}

export async function refreshWeixinSetup(
  token: string,
  setupId: string,
  body: { bot_name?: string } = {},
  base = "",
): Promise<WeixinSetupSession> {
  return request<WeixinSetupSession>(
    `${channelBase("weixin", base)}/setup/${encodeURIComponent(setupId)}/refresh`,
    token,
    jsonPost({ bot_name: body.bot_name ?? "minibot" }),
  );
}

export async function saveFeishuSetup(
  token: string,
  body: {
    setup_id: string;
    dm_policy?: string;
    enabled?: boolean;
    domain?: string;
  },
  base = "",
): Promise<FeishuStatus> {
  return request<FeishuStatus>(
    `${channelBase("feishu", base)}/setup/save`,
    token,
    jsonPost({
      setup_id: body.setup_id,
      dm_policy: body.dm_policy ?? "pairing",
      enabled: body.enabled ?? true,
      domain: body.domain ?? "feishu",
    }),
  );
}

export async function saveWeixinSetup(
  token: string,
  body: {
    setup_id: string;
    dm_policy?: string;
    enabled?: boolean;
  },
  base = "",
): Promise<WeixinStatus> {
  return request<WeixinStatus>(
    `${channelBase("weixin", base)}/setup/save`,
    token,
    jsonPost({
      setup_id: body.setup_id,
      dm_policy: body.dm_policy ?? "pairing",
      enabled: body.enabled ?? true,
    }),
  );
}

export async function cancelSetup(
  token: string,
  channel: ChannelKind,
  setupId: string,
  base = "",
): Promise<void> {
  await request(
    `${channelBase(channel, base)}/setup/${encodeURIComponent(setupId)}/cancel`,
    token,
    { method: "POST" },
  );
}

export async function listPairing(
  token: string,
  channel: ChannelKind,
  base = "",
): Promise<PairingItem[]> {
  const data = await request<{ pending: PairingItem[] }>(
    `${channelBase(channel, base)}/pairing`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
  return data.pending || [];
}

export async function decidePairing(
  token: string,
  channel: ChannelKind,
  id: string,
  action: "allow" | "ignore",
  base = "",
): Promise<void> {
  await request(
    `${channelBase(channel, base)}/pairing/${encodeURIComponent(id)}/${action}`,
    token,
    { method: "POST" },
  );
}

export async function enableChannel(
  token: string,
  channel: ChannelKind,
  base = "",
): Promise<ChannelStatus> {
  return request<ChannelStatus>(
    `${channelBase(channel, base)}/enable`,
    token,
    { method: "POST" },
  );
}

export async function disableChannel(
  token: string,
  channel: ChannelKind,
  base = "",
): Promise<ChannelStatus> {
  return request<ChannelStatus>(
    `${channelBase(channel, base)}/disable`,
    token,
    { method: "POST" },
  );
}

export async function removeChannel(
  token: string,
  channel: ChannelKind,
  base = "",
): Promise<ChannelStatus> {
  return request<ChannelStatus>(
    `${channelBase(channel, base)}/remove`,
    token,
    { method: "POST" },
  );
}
