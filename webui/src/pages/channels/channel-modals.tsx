import { Link2, Loader2, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const channelKey = setupChannel === "feishu" ? "feishu" : "weixin";
  const channelLabel = t(`settings.automations.channels.${channelKey}`);

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
          {setupIsEdit ? t("settings.imChannels.reconfigure") : t("settings.imChannels.configure")}
          {channelLabel}
        </h3>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {setupChannel === "feishu"
            ? t("settings.imChannels.feishuSetupHint")
            : t("settings.imChannels.weixinSetupHint")}
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
                  <span className="text-xs">{t("settings.imChannels.loadingQr")}</span>
                </div>
              )}
            </div>
          ) : null}
          {setupSuccess ? (
            <div className="w-full space-y-3">
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                {t("settings.imChannels.setupSuccess")}
                {setupChannel === "feishu"
                  ? ` ${t("settings.imChannels.botLabel", {
                      name: (feishuSetup?.bot_name || feishuSetup?.app_id) ?? "",
                    })}`
                  : ` ${t("settings.imChannels.userLabel", {
                      name: weixinSetup?.scanner_user_id || t("settings.imChannels.loggedIn"),
                    })}`}
              </div>
              {setupChannel === "feishu" ? (
                <div className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t("settings.imChannels.currentBot")}</div>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      disabled={busy}
                      onClick={onRefreshQr}
                    >
                      {t("settings.imChannels.rescanToReplace")}
                    </button>
                  </div>
                  <div className="mt-1 font-medium">{feishuSetup?.bot_name || "minibot"}</div>
                  <div className="mt-1 text-muted-foreground">App ID: {feishuSetup?.app_id}</div>
                  <div className="text-muted-foreground">
                    App Secret:{" "}
                    {feishuSetup?.app_secret ? "••••••••" : feishuSetup?.app_secret_masked}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t("settings.imChannels.loginInfo")}</div>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      disabled={busy}
                      onClick={onRefreshQr}
                    >
                      {t("settings.imChannels.rescanToReplace")}
                    </button>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Token: {weixinSetup?.bot_token ? "••••••••" : weixinSetup?.bot_token_masked}
                  </div>
                  {weixinSetup?.scanner_user_id ? (
                    <div className="text-muted-foreground">
                      {t("settings.imChannels.scannerUser", { id: weixinSetup.scanner_user_id })}
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
                  {t("settings.imChannels.refreshQr")}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md bg-foreground py-2 text-sm text-background"
                  disabled={busy}
                  onClick={onSave}
                >
                  {t("settings.imChannels.save")}
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
              {t("settings.imChannels.refreshQr")}
            </button>
          )}
          {activeSetup?.status && !setupSuccess ? (
            <p className="text-xs text-muted-foreground">
              {t("settings.imChannels.status", { status: activeSetup.status })}
            </p>
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
  const { t } = useTranslation();
  const channelKey = pairingChannel === "feishu" ? "feishu" : "weixin";
  const channelLabel = t(`settings.automations.channels.${channelKey}`);

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
            {t("settings.imChannels.pairingTitle", { channel: channelLabel })}
          </h3>
        </div>
        <div className="mb-2 text-sm text-muted-foreground">
          {t("settings.imChannels.pendingCount", { count: pending.length })}
        </div>
        <div className="max-h-80 space-y-2 overflow-auto">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings.imChannels.noPending")}</p>
          ) : (
            pending.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{item.sender_id}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1">{t("settings.imChannels.dm")}</span>{" "}
                    From {item.sender_id}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs"
                  onClick={() => onDecide(item.id, "ignore")}
                >
                  {t("settings.imChannels.ignore")}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-foreground px-2 py-1 text-xs text-background"
                  onClick={() => onDecide(item.id, "allow")}
                >
                  {t("settings.imChannels.allow")}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
