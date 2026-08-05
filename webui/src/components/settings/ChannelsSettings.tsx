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

type SetupSession = {
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

type PairingItem = {
  id: string;
  sender_id: string;
  chat_type: string;
  created_at: number;
  label?: string;
  from?: string;
};

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

export function ChannelsSettings({ token }: { token: string }) {
  const [feishu, setFeishu] = useState<FeishuStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [setup, setSetup] = useState<SetupSession | null>(null);
  const [pending, setPending] = useState<PairingItem[]>([]);

  const refreshStatus = useCallback(async () => {
    const data = await api<FeishuStatus>(token, "/api/channels/feishu");
    setFeishu(data);
  }, [token]);

  useEffect(() => {
    void refreshStatus().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refreshStatus]);

  const startSetup = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await api<SetupSession>(token, "/api/channels/feishu/setup/start", {
        method: "POST",
        body: JSON.stringify({ domain: "feishu", bot_name: "minibot", create_only: true }),
      });
      setSetup(session);
      setSetupOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [token]);

  // Poll setup session until terminal
  useEffect(() => {
    if (!setupOpen || !setup?.id) return;
    if (["success", "denied", "expired", "error", "cancelled"].includes(setup.status)) return;
    const t = window.setInterval(() => {
      void api<SetupSession>(token, `/api/channels/feishu/setup/${setup.id}`)
        .then(setSetup)
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(t);
  }, [setupOpen, setup?.id, setup?.status, token]);

  const refreshQr = useCallback(async () => {
    if (!setup?.id) return;
    setBusy(true);
    try {
      const session = await api<SetupSession>(token, `/api/channels/feishu/setup/${setup.id}/refresh`, {
        method: "POST",
        body: JSON.stringify({ domain: "feishu", bot_name: "minibot" }),
      });
      setSetup(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [setup?.id, token]);

  const saveSetup = useCallback(async () => {
    if (!setup?.id) return;
    setBusy(true);
    try {
      const saved = await api<FeishuStatus>(token, "/api/channels/feishu/setup/save", {
        method: "POST",
        body: JSON.stringify({
          setup_id: setup.id,
          dm_policy: "pairing",
          enabled: true,
          domain: "feishu",
        }),
      });
      setFeishu(saved);
      setSetupOpen(false);
      setSetup(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [setup?.id, token]);

  const openPairing = useCallback(async () => {
    setPairingOpen(true);
    try {
      const data = await api<{ pending: PairingItem[] }>(token, "/api/channels/feishu/pairing");
      setPending(data.pending || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [token]);

  const decidePairing = useCallback(
    async (id: string, action: "allow" | "ignore") => {
      await api(token, `/api/channels/feishu/pairing/${id}/${action}`, { method: "POST" });
      const data = await api<{ pending: PairingItem[] }>(token, "/api/channels/feishu/pairing");
      setPending(data.pending || []);
      await refreshStatus();
    },
    [token, refreshStatus],
  );

  const pendingCount = feishu?.pending_pairing ?? pending.length;
  const connected = Boolean(feishu?.connected);

  const setupSuccess = setup?.status === "success";

  const qrSrc = useMemo(() => (setup?.qr_url ? qrImageUrl(setup.qr_url) : null), [setup?.qr_url]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">渠道</h2>
        <p className="text-sm text-muted-foreground">连接飞书等即时通讯渠道，接收并回复消息。</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#00d6b9]/15 text-sm font-bold text-[#00a894]">
          飞
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">飞书</span>
            {connected ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">
                已连接
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">通过飞书机器人接收并回复用户消息</p>
        </div>
        {connected ? (
          <>
            <button
              type="button"
              className="relative text-sm text-primary hover:underline"
              onClick={() => void openPairing()}
            >
              配对管理
              {pendingCount > 0 ? (
                <span className="absolute -right-3 -top-2 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                  {pendingCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={() => void startSetup()}
            >
              重新配置
            </button>
          </>
        ) : (
          <button
            type="button"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
            disabled={busy}
            onClick={() => void startSetup()}
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
              onClick={() => {
                setSetupOpen(false);
                if (setup?.id) {
                  void api(token, `/api/channels/feishu/setup/${setup.id}/cancel`, { method: "POST" });
                }
              }}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-2 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00d6b9]/20 text-lg font-bold text-[#00a894]">
                飞
              </div>
            </div>
            <h3 className="text-center text-lg font-semibold">配置飞书</h3>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              使用飞书扫描下方二维码，自动创建并配置机器人
            </p>

            <div className="mt-5 flex flex-col items-center gap-3">
              {qrSrc && !setupSuccess ? (
                <img src={qrSrc} alt="Feishu setup QR" className="h-60 w-60 rounded-lg border bg-white p-2" />
              ) : null}
              {setupSuccess ? (
                <div className="w-full space-y-3">
                  <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                    配置成功！机器人：{setup?.bot_name || setup?.app_id}
                  </div>
                  <div className="rounded-lg border px-3 py-2 text-sm">
                    <div className="font-medium">当前机器人</div>
                    <div className="mt-1 text-muted-foreground">App ID：{setup?.app_id}</div>
                    <div className="text-muted-foreground">
                      App Secret：{setup?.app_secret ? "••••••••" : setup?.app_secret_masked}
                    </div>
                  </div>
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
              {setup?.status && !setupSuccess ? (
                <p className="text-xs text-muted-foreground">状态：{setup.status}</p>
              ) : null}
              {setup?.error ? <p className="text-xs text-destructive">{setup.error}</p> : null}
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
              <h3 className="font-semibold">配对管理</h3>
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
