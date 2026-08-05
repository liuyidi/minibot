import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2, MoreHorizontal, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type FeishuStatus = {
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

type WeixinStatus = {
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

function resolveBase64Qr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
}

function isConfigured(channel: ChannelKind, status: FeishuStatus | WeixinStatus | null): boolean {
  if (!status) return false;
  if (typeof status.configured === "boolean") return status.configured;
  if (channel === "feishu") {
    const fs = status as FeishuStatus;
    return Boolean(fs.app_id && fs.has_app_secret);
  }
  return Boolean((status as WeixinStatus).has_token);
}

function FeishuLogo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/feishu.svg"
      alt=""
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}

function WeChatLogo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/wechat.svg"
      alt=""
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}

function ChannelSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[2px]",
        "transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "bg-emerald-500 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.035)]"
          : "bg-muted shadow-[inset_0_0_0_1px_rgba(0,0,0,0.035)] hover:bg-muted/80",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-[18px] w-[18px] rounded-full bg-background shadow-[0_1px_2px_rgba(0,0,0,0.18),0_2px_7px_rgba(0,0,0,0.11)]",
          "transition-transform duration-200 ease-out",
          checked ? "translate-x-[16px]" : "translate-x-0",
        )}
      />
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function ChannelsSettings({ token }: { token: string }) {
  const [feishu, setFeishu] = useState<FeishuStatus | null>(null);
  const [weixin, setWeixin] = useState<WeixinStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupChannel, setSetupChannel] = useState<ChannelKind>("feishu");
  const [setupIsEdit, setSetupIsEdit] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingChannel, setPairingChannel] = useState<ChannelKind>("feishu");
  const [feishuSetup, setFeishuSetup] = useState<FeishuSetupSession | null>(null);
  const [weixinSetup, setWeixinSetup] = useState<WeixinSetupSession | null>(null);
  const [pending, setPending] = useState<PairingItem[]>([]);
  const [localQrSrc, setLocalQrSrc] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

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
    async (channel: ChannelKind, options?: { isEdit?: boolean }) => {
      setError(null);
      setSetupChannel(channel);
      setSetupIsEdit(Boolean(options?.isEdit));
      setLocalQrSrc(null);
      setQrLoading(true);
      // Open modal immediately so the click feels instant; QR fills in via poll.
      if (channel === "feishu") {
        setFeishuSetup({
          id: "",
          status: "starting",
          qr_url: null,
          expire_in: null,
          bot_name: "minibot",
          app_id: "",
          scanner_open_id: "",
          error: null,
        });
      } else {
        setWeixinSetup({
          id: "",
          status: "starting",
          qr_url: null,
          qr_image_base64: null,
          expire_in: null,
          bot_name: "minibot",
          scanner_user_id: "",
          error: null,
        });
      }
      setSetupOpen(true);
      setBusy(true);
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
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setSetupOpen(false);
        setQrLoading(false);
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  const activeSetup = setupChannel === "feishu" ? feishuSetup : weixinSetup;
  const setupSuccess = activeSetup?.status === "success";
  const hasRemoteQr = Boolean(
    activeSetup?.qr_url ||
      (setupChannel === "weixin" &&
        Boolean((activeSetup as WeixinSetupSession | null)?.qr_image_base64)),
  );
  const waitingForQr = Boolean(
    setupOpen && activeSetup && !setupSuccess && !localQrSrc && (qrLoading || !hasRemoteQr),
  );

  useEffect(() => {
    if (!setupOpen || !activeSetup?.id) return;
    if (["success", "denied", "expired", "error", "cancelled"].includes(activeSetup.status)) return;
    const base =
      setupChannel === "feishu" ? "/api/channels/feishu" : "/api/channels/weixin";
    // Poll fast until QR arrives, then slower for login status.
    const intervalMs = hasRemoteQr ? 1200 : 350;
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
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [
    setupOpen,
    activeSetup?.id,
    activeSetup?.status,
    hasRemoteQr,
    setupChannel,
    token,
  ]);

  // Render Feishu/WeChat QR URLs locally — no third-party QR image CDN.
  useEffect(() => {
    let cancelled = false;
    const base64 =
      setupChannel === "weixin"
        ? resolveBase64Qr((activeSetup as WeixinSetupSession | null)?.qr_image_base64)
        : null;
    if (base64) {
      setLocalQrSrc(base64);
      setQrLoading(false);
      return;
    }
    const url = activeSetup?.qr_url?.trim();
    if (!url) {
      setLocalQrSrc(null);
      return;
    }
    setQrLoading(true);
    void QRCode.toDataURL(url, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setLocalQrSrc(dataUrl);
          setQrLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocalQrSrc(null);
          setQrLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeSetup?.qr_url,
    setupChannel,
    (activeSetup as WeixinSetupSession | null)?.qr_image_base64,
  ]);

  const qrSrc = setupSuccess ? null : localQrSrc;
  const refreshQr = useCallback(async () => {
    if (!activeSetup?.id) return;
    setBusy(true);
    setLocalQrSrc(null);
    setQrLoading(true);
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
      setQrLoading(false);
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
      setSetupIsEdit(false);
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

  const setEnabled = useCallback(
    async (channel: ChannelKind, enabled: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const base = channel === "feishu" ? "/api/channels/feishu" : "/api/channels/weixin";
        const path = enabled ? `${base}/enable` : `${base}/disable`;
        const saved = await api<FeishuStatus | WeixinStatus>(token, path, { method: "POST" });
        if (channel === "feishu") setFeishu(saved as FeishuStatus);
        else setWeixin(saved as WeixinStatus);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  const removeChannel = useCallback(
    async (channel: ChannelKind) => {
      const label = channel === "feishu" ? "飞书" : "微信";
      if (!window.confirm(`确定移除${label}配置？凭证将被清除。`)) return;
      setBusy(true);
      setError(null);
      try {
        const base = channel === "feishu" ? "/api/channels/feishu" : "/api/channels/weixin";
        const saved = await api<FeishuStatus | WeixinStatus>(token, `${base}/remove`, {
          method: "POST",
        });
        if (channel === "feishu") setFeishu(saved as FeishuStatus);
        else setWeixin(saved as WeixinStatus);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  const cancelSetup = useCallback(() => {
    setSetupOpen(false);
    setSetupIsEdit(false);
    setLocalQrSrc(null);
    setQrLoading(false);
    if (!activeSetup?.id) return;
    const base = setupChannel === "feishu" ? "/api/channels/feishu" : "/api/channels/weixin";
    void api(token, `${base}/setup/${activeSetup.id}/cancel`, { method: "POST" });
  }, [activeSetup?.id, setupChannel, token]);

  const feishuConfigured = isConfigured("feishu", feishu);
  const weixinConfigured = isConfigured("weixin", weixin);

  const renderCard = (
    channel: ChannelKind,
    status: FeishuStatus | WeixinStatus | null,
    configured: boolean,
  ) => {
    const title = channel === "feishu" ? "飞书" : "微信";
    const desc =
      channel === "feishu"
        ? "通过飞书机器人接收并回复用户消息"
        : "扫码登录个人微信，接收并回复文本消息";
    const enabled = Boolean(status?.enabled);
    const pendingCount = status?.pending_pairing ?? 0;

    return (
      <div
        key={channel}
        className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
          {channel === "feishu" ? (
            <FeishuLogo className="h-8 w-8" />
          ) : (
            <WeChatLogo className="h-8 w-8" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{title}</span>
            {configured && enabled ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">
                已连接
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{desc}</p>
        </div>
        {configured ? (
          <div className="flex shrink-0 items-center gap-3">
            {channel === "feishu" ? (
              <button
                type="button"
                className="relative text-sm text-primary hover:underline"
                onClick={() => void openPairing("feishu")}
              >
                配对管理
                {pendingCount > 0 ? (
                  <span className="absolute -right-3 -top-2 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                    {pendingCount}
                  </span>
                ) : null}
              </button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`${title}更多操作`}
                  disabled={busy}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    void startSetup(channel, { isEdit: true });
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑配置
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => {
                    void removeChannel(channel);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  移除配置
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ChannelSwitch
              checked={enabled}
              disabled={busy}
              label={`启用${title}`}
              onChange={(next) => {
                void setEnabled(channel, next);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
            disabled={busy}
            onClick={() => void startSetup(channel)}
          >
            配置
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">渠道</h2>
        <p className="text-sm text-muted-foreground">
          连接飞书、微信等即时通讯渠道，接收并回复消息。
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {renderCard("feishu", feishu, feishuConfigured)}
      {renderCard("weixin", weixin, weixinConfigured)}

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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                {setupChannel === "feishu" ? (
                  <FeishuLogo className="h-10 w-10" />
                ) : (
                  <WeChatLogo className="h-10 w-10" />
                )}
              </div>
            </div>
            <h3 className="text-center text-lg font-semibold">
              {setupIsEdit ? "重新配置" : "配置"}
              {setupChannel === "feishu" ? "飞书" : "微信"}
            </h3>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              {setupChannel === "feishu"
                ? "使用飞书扫描下方二维码，自动创建并配置机器人"
                : "使用微信扫描下方二维码登录并绑定机器人"}
            </p>

            <div className="mt-5 flex flex-col items-center gap-3">
              {!setupSuccess && (qrSrc || waitingForQr) ? (
                <div className="relative flex h-60 w-60 items-center justify-center overflow-hidden rounded-lg border bg-white p-2">
                  {qrSrc ? (
                    <img
                      src={qrSrc}
                      alt={`${setupChannel} setup QR`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-xs">正在获取二维码…</span>
                    </div>
                  )}
                </div>
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
                      <div className="flex items-center justify-between">
                        <div className="font-medium">当前机器人</div>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          disabled={busy}
                          onClick={() => void refreshQr()}
                        >
                          重新扫码可更换
                        </button>
                      </div>
                      <div className="mt-1 font-medium">
                        {feishuSetup?.bot_name || "minibot"}
                      </div>
                      <div className="mt-1 text-muted-foreground">App ID：{feishuSetup?.app_id}</div>
                      <div className="text-muted-foreground">
                        App Secret：
                        {feishuSetup?.app_secret ? "••••••••" : feishuSetup?.app_secret_masked}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">登录信息</div>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          disabled={busy}
                          onClick={() => void refreshQr()}
                        >
                          重新扫码可更换
                        </button>
                      </div>
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm"
                      disabled={busy}
                      onClick={() => void refreshQr()}
                    >
                      <RefreshCw className="h-4 w-4" />
                      刷新二维码
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-md bg-foreground py-2 text-sm text-background"
                      disabled={busy}
                      onClick={() => void saveSetup()}
                    >
                      保存
                    </button>
                  </div>
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
