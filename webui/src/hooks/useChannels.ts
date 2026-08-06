import { useCallback, useEffect, useState } from "react";

import {
  cancelSetup as cancelSetupApi,
  decidePairing as decidePairingApi,
  disableChannel,
  enableChannel,
  fetchChannelStatuses,
  isChannelConfigured,
  listPairing,
  pollSetupSession,
  refreshFeishuSetup,
  refreshWeixinSetup,
  removeChannel as removeChannelApi,
  saveFeishuSetup,
  saveWeixinSetup,
  startFeishuSetup,
  startWeixinSetup,
  type ChannelKind,
  type FeishuSetupSession,
  type FeishuStatus,
  type PairingItem,
  type WeixinSetupSession,
  type WeixinStatus,
} from "@/lib/apis/channels";

const SETUP_TERMINAL = new Set(["success", "denied", "expired", "error", "cancelled"]);

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useChannels(token: string) {
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

  const refreshStatus = useCallback(async () => {
    const data = await fetchChannelStatuses(token);
    setFeishu(data.feishu);
    setWeixin(data.weixin);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchChannelStatuses(token);
        if (!cancelled) {
          setFeishu(data.feishu);
          setWeixin(data.weixin);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(errMsg(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const startSetup = useCallback(
    async (channel: ChannelKind, options?: { isEdit?: boolean }) => {
      setError(null);
      setSetupChannel(channel);
      setSetupIsEdit(Boolean(options?.isEdit));
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
          setFeishuSetup(await startFeishuSetup(token));
        } else {
          setWeixinSetup(await startWeixinSetup(token));
        }
      } catch (err) {
        setError(errMsg(err));
        setSetupOpen(false);
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

  useEffect(() => {
    if (!setupOpen || !activeSetup?.id) return;
    if (SETUP_TERMINAL.has(activeSetup.status)) return;
    const intervalMs = hasRemoteQr ? 1200 : 350;
    const t = window.setInterval(() => {
      void pollSetupSession(token, setupChannel, activeSetup.id)
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

  const refreshQr = useCallback(async (): Promise<boolean> => {
    if (!activeSetup?.id) return false;
    setBusy(true);
    try {
      if (setupChannel === "feishu") {
        setFeishuSetup(await refreshFeishuSetup(token, activeSetup.id));
      } else {
        setWeixinSetup(await refreshWeixinSetup(token, activeSetup.id));
      }
      return true;
    } catch (err) {
      setError(errMsg(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, [activeSetup?.id, setupChannel, token]);

  const saveSetup = useCallback(async () => {
    if (!activeSetup?.id) return;
    setBusy(true);
    try {
      if (setupChannel === "feishu") {
        setFeishu(await saveFeishuSetup(token, { setup_id: activeSetup.id }));
        setFeishuSetup(null);
      } else {
        setWeixin(await saveWeixinSetup(token, { setup_id: activeSetup.id }));
        setWeixinSetup(null);
      }
      setSetupOpen(false);
      setSetupIsEdit(false);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }, [activeSetup?.id, setupChannel, token]);

  const openPairing = useCallback(
    async (channel: ChannelKind) => {
      setPairingChannel(channel);
      setPairingOpen(true);
      try {
        setPending(await listPairing(token, channel));
      } catch (err) {
        setError(errMsg(err));
      }
    },
    [token],
  );

  const closePairing = useCallback(() => {
    setPairingOpen(false);
  }, []);

  const decidePairing = useCallback(
    async (id: string, action: "allow" | "ignore") => {
      await decidePairingApi(token, pairingChannel, id, action);
      setPending(await listPairing(token, pairingChannel));
      await refreshStatus();
    },
    [pairingChannel, token, refreshStatus],
  );

  const setEnabled = useCallback(
    async (channel: ChannelKind, enabled: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const saved = enabled
          ? await enableChannel(token, channel)
          : await disableChannel(token, channel);
        if (channel === "feishu") setFeishu(saved as FeishuStatus);
        else setWeixin(saved as WeixinStatus);
      } catch (err) {
        setError(errMsg(err));
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
        const saved = await removeChannelApi(token, channel);
        if (channel === "feishu") setFeishu(saved as FeishuStatus);
        else setWeixin(saved as WeixinStatus);
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  const cancelSetup = useCallback(() => {
    setSetupOpen(false);
    setSetupIsEdit(false);
    if (!activeSetup?.id) return;
    void cancelSetupApi(token, setupChannel, activeSetup.id);
  }, [activeSetup?.id, setupChannel, token]);

  return {
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
    feishuConfigured: isChannelConfigured("feishu", feishu),
    weixinConfigured: isChannelConfigured("weixin", weixin),
    refreshStatus,
    startSetup,
    refreshQr,
    saveSetup,
    openPairing,
    closePairing,
    decidePairing,
    setEnabled,
    removeChannel,
    cancelSetup,
  };
}
