import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";

import { useChannels } from "@/hooks/channels";
import type { WeixinSetupSession } from "@/lib/apis/channels";
import { useClient } from "@/providers/ClientProvider";

import { ChannelCard, ChannelPairingModal, ChannelSetupModal } from "./channels-ui";

function resolveBase64Qr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
}

export function ChannelsPage() {
  const { t } = useTranslation();
  const { token } = useClient();
  const {
    feishu,
    weixin,
    error,
    busy,
    setupOpen,
    setupChannel,
    setupIsEdit,
    pairingOpen,
    pairingChannel,
    feishuSetup,
    weixinSetup,
    pending,
    activeSetup,
    setupSuccess,
    hasRemoteQr,
    feishuConfigured,
    weixinConfigured,
    startSetup,
    refreshQr,
    saveSetup,
    openPairing,
    closePairing,
    decidePairing,
    setEnabled,
    removeChannel,
    cancelSetup,
  } = useChannels(token);

  const [localQrSrc, setLocalQrSrc] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

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

  // Clear local QR when setup closes or refresh starts.
  useEffect(() => {
    if (!setupOpen) {
      setLocalQrSrc(null);
      setQrLoading(false);
    }
  }, [setupOpen]);

  const waitingForQr = Boolean(
    setupOpen && activeSetup && !setupSuccess && !localQrSrc && (qrLoading || !hasRemoteQr),
  );
  const qrSrc = setupSuccess ? null : localQrSrc;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("settings.imChannels.pageTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.imChannels.pageDescription")}</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ChannelCard
        channel="feishu"
        status={feishu}
        configured={feishuConfigured}
        busy={busy}
        onOpenPairing={(ch) => void openPairing(ch)}
        onStartSetup={(ch, opts) => {
          setLocalQrSrc(null);
          setQrLoading(true);
          void startSetup(ch, opts);
        }}
        onRemove={(ch) => void removeChannel(ch)}
        onSetEnabled={(ch, enabled) => void setEnabled(ch, enabled)}
      />
      <ChannelCard
        channel="weixin"
        status={weixin}
        configured={weixinConfigured}
        busy={busy}
        onOpenPairing={(ch) => void openPairing(ch)}
        onStartSetup={(ch, opts) => {
          setLocalQrSrc(null);
          setQrLoading(true);
          void startSetup(ch, opts);
        }}
        onRemove={(ch) => void removeChannel(ch)}
        onSetEnabled={(ch, enabled) => void setEnabled(ch, enabled)}
      />
      <ChannelCard
        channel="wecom"
        status={null}
        configured={false}
        busy={busy}
        comingSoon
        onOpenPairing={() => undefined}
        onStartSetup={() => undefined}
        onRemove={() => undefined}
        onSetEnabled={() => undefined}
      />
      <ChannelCard
        channel="dingtalk"
        status={null}
        configured={false}
        busy={busy}
        comingSoon
        onOpenPairing={() => undefined}
        onStartSetup={() => undefined}
        onRemove={() => undefined}
        onSetEnabled={() => undefined}
      />

      {setupOpen ? (
        <ChannelSetupModal
          setupChannel={setupChannel}
          setupIsEdit={setupIsEdit}
          setupSuccess={setupSuccess}
          busy={busy}
          qrSrc={qrSrc}
          waitingForQr={waitingForQr}
          activeSetup={activeSetup}
          feishuSetup={feishuSetup}
          weixinSetup={weixinSetup}
          onCancel={cancelSetup}
          onRefreshQr={() => {
            setLocalQrSrc(null);
            setQrLoading(true);
            void refreshQr().then((ok) => {
              if (!ok) setQrLoading(false);
            });
          }}
          onSave={() => void saveSetup()}
        />
      ) : null}

      {pairingOpen ? (
        <ChannelPairingModal
          pairingChannel={pairingChannel}
          pending={pending}
          onClose={closePairing}
          onDecide={(id, action) => void decidePairing(id, action)}
        />
      ) : null}
    </div>
  );
}
