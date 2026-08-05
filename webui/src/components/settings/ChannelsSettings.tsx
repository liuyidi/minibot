import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, RefreshCw, X } from "lucide-react";

import { ApiError } from "@/lib/api";

type FeishuStatus = {
  enabled: boolean;
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

type WeixinStatus = {
  enabled: boolean;
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

type FeishuSetupSession = {
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

type WeixinSetupSession = {
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

type PairingItem = {
  id: string;
  sender_id: string;
  chat_type: string;
  created_at: number;
  label?: string;
  from?: string;
};

type ChannelKind = "feishu" | "weixin";

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function qrImageUrl(data: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(data)}`;
}

function resolveQrSrc(
  setup: FeishuSetupSession | WeixinSetupSession | null,
  channel: ChannelKind,
): string | null {
  if (!setup) return null;
  if (channel === "weixin") {
    const wx = setup as WeixinSetupSession;
    if (wx.qr_image_base64) {
      const raw = wx.qr_image_base64;
      return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
    }
  }
  if (setup.qr_url) {
    if (setup.qr_url.startsWith("http://") || setup.qr_url.startsWith("https://")) {
      return qrImageUrl(setup.qr_url);
    }
    return qrImageUrl(setup.qr_url);
  }
  return null;
}

export function ChannelsSettings({ token }: { token: string }) {
  const [feishu, setFeishu] = useState<FeishuStatus | null>(null);
  const [weixin, setWeixin] = useState<WeixinStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupChannel, setSetupChannel] = useState<ChannelKind>("feishu");
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingChannel, setPairingChannel] = useState<ChannelKind>("feishu");
  const [feishuSetup, setFeishuSetup] = useState<FeishuSetupSession | null>(null);
  const [weixinSetup, setWeixinSetup] = useState<WeixinSetupSession | null>(null);
  const [pending, setPending] = useState<PairingItem[]>([]);

  const refreshStatus = useCallback(async () => {
    const [feishuData, weixinData] = await Promise.all([
      api<FeishuStatus>(token, "/api/channels/feishu"),
      api<WeixinStatus>(token, "/api/channels/weixin"),
    ]);
    setFeishu(feishuData);
    setWeixin(weixinData);
  }, [token]);

  useEffect(() => {
    void refreshStatus().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refreshStatus]);

  const startSetup = useCallback(
    async (channel: ChannelKind) => {
      setBusy(true);
      setError(null);
      setSetupChannel(channel);
      try {
        if (channel === "feishu") {
          const session = await api<FeishuSetupSession>(token, "/api/channels/feishu/setup/start", {
            method: "POST",
            body: JSON.stringify({ domain: "feishu", bot_name: "minibot", create_only: true }),
          });
          setFeishuSetup(session);
        } else {
          const session = await api<WeixinSetupSession>(token, "/api/channels/weixin/setup/start", {
            method: "POST",
            body: JSON.stringify({ bot_name: "minibot" }),
          });
          setWeixinSetup(session);
        }
        setSetupOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  const activeSetup = setupChannel === "feishu" ? feishuSetup : weixinSetup;

  useEffect(() => {
    if (!setupOpen || !activeSetup?.id) return;
    if (["success", "denied", "expired", "error", "cancelled"].includes(activeSetup.status)) return;
    const base =
      setupChannel === "feishu" ? "/api/channels/feishu" : "/api/channels/weixin";
    const t = window.setInterval(() => {
      void api<FeishuSetupSession | WeixinSetupSession>(
        token,
        `${base}/setup/${activeSetup.id}`,
      )
        .then((session) => {
          if (setupChannel === "feishu") setFeishuSetup(session as FeishuSetupSession);
          else setWeixinSetup(session as WeixinSetupSession);
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(t);
  }, [setupOpen, activeSetup?.id, activeSetup?.status, setupChannel, token]);

  const refreshQr = useCallback(async () => {
    if (!activeSetup?.id) return;
    setBusy(true);
    try {
      if (setupChannel === "feishu") {
        const session = await api<FeishuSetupSession>(
          token,
          `/api/channels/feishu/setup/${activeSetup.id}/refresh`,
          {
            method: "POST",
            body: JSON.stringify({ domain: "feishu", bot_name: "minibot" }),
          },
        );
        setFeishuSetup(session);
      } else {
        const session = await api<WeixinSetupSession>(
          token,
          `/api/channels/weixin/setup/${activeSetup.id}/refresh`,
          {
            method: "POST",
            body: JSON.stringify({ bot_name: "minibot" }),
          },
        );
        setWeixinSetup(session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [activeSetup?.id, setupChannel, token]);

  const saveSetup = useCallback(async () => {
    if (!activeSetup?.id) return;
    setBusy(true);
    try {
      if (setupChannel === "feishu") {
        const saved = await api<FeishuStatus>(token, "/api/channels/feishu/setup/save", {
          method: "POST",
          body: JSON.stringify({
            setup_id: activeSetup.id,
            dm_policy: "pairing",
            enabled: true,
            domain: "feishu",
          }),
        });
        setFeishu(saved);
        setFeishuSetup(null);
      } else {
        const saved = await api<WeixinStatus>(token, "/api/channels/weixin/setup/save", {
          method: "POST",
          body: JSON.stringify({
            setup_id: activeSetup.id,
            dm_policy: "pairing",
            enabled: true,
          }),
        });
        setWeixin(saved);
        setWeixinSetup(null);
      }
      setSetupOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [activeSetup?.id, setupChannel, token]);

  const openPairing = useCallback(
    async (channel: ChannelKind) => {
      setPairingChannel(channel);
      setPairingOpen(true);
      try {
        const base = channel === "feishu" ? "/api/channels/feishu" : "/api/channels/weixin";
        const data = await api<{ pending: PairingItem[] }>(token, `${base}/pairing`);
        setPending(data.pending || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token],
  );

  const decidePairing = useCallback(
    async (id: string, action: "allow" | "ignore") => {
      const base =
        pairingChannel === "feishu" ? "/api/channels/feishu" : "/api/channels/weixin";
      await api(token, `${base}/pairing/${id}/${action}`, { method: "POST" });
      const data = await api<{ pending: PairingItem[] }>(token, `${base}/pairing`);
      setPending(data.pending || []);
      await refreshStatus();
    },
    [pairingChannel, token, refreshStatus],
  );

  const feishuConnected = Boolean(feishu?.connected);
  const weixinConnected = Boolean(weixin?.connected);
  const setupSuccess = activeSetup?.status === "success";
  const qrSrc = useMemo(
    () => resolveQrSrc(activeSetup, setupChannel),
    [activeSetup, setupChannel],
  );

  const cancelSetup = useCallback(() => {
    setSetupOpen(false);
    if (!activeSetup?.id) return;
    const base = setupChannel === "feishu" ? "/api/channels/feishu" : "/api/channels/weixin";
    void api(token, `${base}/setup/${activeSetup.id}/cancel`, { method: "POST" });
  }, [activeSetup?.id, setupChannel, token]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">渠道</h2>
        <p className="text-sm text-muted-foreground">
          连接飞书、微信等即时通讯渠道，接收并回复消息。
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#00d6b9]/15 text-sm font-bold text-[#00a894]">
          飞
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">飞书</span>
            {feishuConnected ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">
                已连接
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">通过飞书机器人接收并回复用户消息</p>
        </div>
        {feishuConnected ? (
          <>
            <button
              type="button"
              className="relative text-sm text-primary hover:underline"
              onClick={() => void openPairing("feishu")}
            >
              配对管理
              {(feishu?.pending_pairing ?? 0) > 0 ? (
                <span className="absolute -right-3 -top-2 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                  {feishu?.pending_pairing}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={() => void startSetup("feishu")}
            >
              重新配置
            </button>
          </>
        ) : (
          <button
            type="button"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
            disabled={busy}
            onClick={() => void startSetup("feishu")}
          >
            配置
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#07c160]/15 text-sm font-bold text-[#07c160]">
          微
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">微信</span>
            {weixinConnected ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">
                已连接
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            扫码登录个人微信，接收并回复文本消息
          </p>
        </div>
        {weixinConnected ? (
          <>
            <button
              type="button"
              className="relative text-sm text-primary hover:underline"
              onClick={() => void openPairing("weixin")}
            >
              配对管理
              {(weixin?.pending_pairing ?? 0) > 0 ? (
                <span className="absolute -right-3 -top-2 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                  {weixin?.pending_pairing}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={() => void startSetup("weixin")}
            >
              重新配置
            </button>
          </>
        ) : (
          <button
            type="button"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
            disabled={busy}
            onClick={() => void startSetup("weixin")}
          >
            配置
          </button>
        )}
      </div>

      {setupOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 hover:bg-muted"
              onClick={cancelSetup}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-2 flex justify-center">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold ${
                  setupChannel === "feishu"
                    ? "bg-[#00d6b9]/20 text-[#00a894]"
                    : "bg-[#07c160]/20 text-[#07c160]"
                }`}
              >
                {setupChannel === "feishu" ? "飞" : "微"}
              </div>
            </div>
            <h3 className="text-center text-lg font-semibold">
              配置{setupChannel === "feishu" ? "飞书" : "微信"}
            </h3>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              {setupChannel === "feishu"
                ? "使用飞书扫描下方二维码，自动创建并配置机器人"
                : "使用微信扫描下方二维码登录并绑定机器人"}
            </p>

            <div className="mt-5 flex flex-col items-center gap-3">
              {qrSrc && !setupSuccess ? (
                <img
                  src={qrSrc}
                  alt={`${setupChannel} setup QR`}
                  className="h-60 w-60 rounded-lg border bg-white p-2"
                />
              ) : null}
              {setupSuccess ? (
                <div className="w-full space-y-3">
                  <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                    配置成功！
                    {setupChannel === "feishu"
                      ? ` 机器人：${(feishuSetup?.bot_name || feishuSetup?.app_id) ?? ""}`
                      : ` 用户：${weixinSetup?.scanner_user_id || "已登录"}`}
                  </div>
                  {setupChannel === "feishu" ? (
                    <div className="rounded-lg border px-3 py-2 text-sm">
                      <div className="font-medium">当前机器人</div>
                      <div className="mt-1 text-muted-foreground">App ID：{feishuSetup?.app_id}</div>
                      <div className="text-muted-foreground">
                        App Secret：
                        {feishuSetup?.app_secret ? "••••••••" : feishuSetup?.app_secret_masked}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border px-3 py-2 text-sm">
                      <div className="font-medium">登录信息</div>
                      <div className="mt-1 text-muted-foreground">
                        Token：{weixinSetup?.bot_token ? "••••••••" : weixinSetup?.bot_token_masked}
                      </div>
                      {weixinSetup?.scanner_user_id ? (
                        <div className="text-muted-foreground">
                          扫码用户：{weixinSetup.scanner_user_id}
                        </div>
                      ) : null}
                    </div>
                  )}
                  <button
                    type="button"
                    className="w-full rounded-md bg-foreground py-2 text-sm text-background"
                    disabled={busy}
                    onClick={() => void saveSetup()}
                  >
                    保存
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm"
                  disabled={busy}
                  onClick={() => void refreshQr()}
                >
                  <RefreshCw className="h-4 w-4" />
                  刷新二维码
                </button>
              )}
              {activeSetup?.status && !setupSuccess ? (
                <p className="text-xs text-muted-foreground">状态：{activeSetup.status}</p>
              ) : null}
              {activeSetup?.error ? (
                <p className="text-xs text-destructive">{activeSetup.error}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {pairingOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-background p-5 shadow-xl">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 hover:bg-muted"
              onClick={() => setPairingOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-3 flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              <h3 className="font-semibold">
                配对管理 · {pairingChannel === "feishu" ? "飞书" : "微信"}
              </h3>
            </div>
            <div className="mb-2 text-sm text-muted-foreground">待处理 · {pending.length}</div>
            <div className="max-h-80 space-y-2 overflow-auto">
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无待处理请求</p>
              ) : (
                pending.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs">{item.sender_id}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        <span className="rounded bg-muted px-1">私聊</span> From {item.sender_id}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-md border px-2 py-1 text-xs"
                      onClick={() => void decidePairing(item.id, "ignore")}
                    >
                      忽略
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-foreground px-2 py-1 text-xs text-background"
                      onClick={() => void decidePairing(item.id, "allow")}
                    >
                      允许
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
