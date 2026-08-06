import { Link2, Loader2, RefreshCw, X } from "lucide-react";

import type {
  ChannelKind,
  FeishuSetupSession,
  PairingItem,
  SetupSession,
  WeixinSetupSession,
} from "@/lib/apis/channels";

import { FeishuLogo, WeChatLogo } from "./channel-card";

export function ChannelSetupModal({
  setupChannel,
  setupIsEdit,
  setupSuccess,
  busy,
  qrSrc,
  waitingForQr,
  activeSetup,
  feishuSetup,
  weixinSetup,
  onCancel,
  onRefreshQr,
  onSave,
}: {
  setupChannel: ChannelKind;
  setupIsEdit: boolean;
  setupSuccess: boolean;
  busy: boolean;
  qrSrc: string | null;
  waitingForQr: boolean;
  activeSetup: SetupSession | null;
  feishuSetup: FeishuSetupSession | null;
  weixinSetup: WeixinSetupSession | null;
  onCancel: () => void;
  onRefreshQr: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
        <button
          type="button"
          className="absolute right-3 top-3 rounded-md p-1 hover:bg-muted"
          onClick={onCancel}
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
                      onClick={onRefreshQr}
                    >
                      重新扫码可更换
                    </button>
                  </div>
                  <div className="mt-1 font-medium">{feishuSetup?.bot_name || "minibot"}</div>
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
                      onClick={onRefreshQr}
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
                  onClick={onRefreshQr}
                >
                  <RefreshCw className="h-4 w-4" />
                  刷新二维码
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md bg-foreground py-2 text-sm text-background"
                  disabled={busy}
                  onClick={onSave}
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
              onClick={onRefreshQr}
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
  );
}

export function ChannelPairingModal({
  pairingChannel,
  pending,
  onClose,
  onDecide,
}: {
  pairingChannel: ChannelKind;
  pending: PairingItem[];
  onClose: () => void;
  onDecide: (id: string, action: "allow" | "ignore") => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-background p-5 shadow-xl">
        <button
          type="button"
          className="absolute right-3 top-3 rounded-md p-1 hover:bg-muted"
          onClick={onClose}
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
              <div key={item.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{item.sender_id}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1">私聊</span> From {item.sender_id}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs"
                  onClick={() => onDecide(item.id, "ignore")}
                >
                  忽略
                </button>
                <button
                  type="button"
                  className="rounded-md bg-foreground px-2 py-1 text-xs text-background"
                  onClick={() => onDecide(item.id, "allow")}
                >
                  允许
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
