import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_NETWORK_SAFETY_FORM,
  networkSafetyFormFromPayload,
  visibleWebuiDefaultAccessMode,
} from "@/pages/settings/shared";
import type { NetworkSafetySettingsUpdate } from "@/lib/types";
import { updateNetworkSafetySettings } from "@/lib/apis/api";
import { useSettingsShell } from "../SettingsShellContext";

export function useAdvancedSettings() {
  const {
    token,
    settings,
    applyPayload,
    setError,
    markPendingRestart,
    maybeRestartHostEngine,
    pendingRestartSections,
    restartViaSettingsSurface,
    hostEngineApplying,
    isRestarting,
  } = useSettingsShell();

  const [networkSafetyForm, setNetworkSafetyForm] = useState<NetworkSafetySettingsUpdate>(() =>
    settings ? networkSafetyFormFromPayload(settings) : DEFAULT_NETWORK_SAFETY_FORM,
  );
  const [networkSafetySaving, setNetworkSafetySaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setNetworkSafetyForm(networkSafetyFormFromPayload(settings));
  }, [settings]);

  const networkSafetyDirty = useMemo(() => {
    if (!settings) return false;
    const currentLocalServiceAccess =
      settings.advanced?.webui_allow_local_service_access ??
      settings.advanced?.allow_local_preview_access ??
      true;
    const currentDefaultAccess = visibleWebuiDefaultAccessMode(
      settings.advanced?.webui_default_access_mode,
    );
    return (
      networkSafetyForm.webuiAllowLocalServiceAccess !== currentLocalServiceAccess ||
      networkSafetyForm.webuiDefaultAccessMode !== currentDefaultAccess
    );
  }, [networkSafetyForm, settings]);

  const saveNetworkSafetySettings = async () => {
    if (!settings || !networkSafetyDirty || networkSafetySaving) return;
    setNetworkSafetySaving(true);
    try {
      const payload = await updateNetworkSafetySettings(token, networkSafetyForm);
      applyPayload(payload);
      if (payload.requires_restart) markPendingRestart("runtime");
      await maybeRestartHostEngine(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setNetworkSafetySaving(false);
    }
  };

  return {
    settings,
    networkSafetyForm,
    setNetworkSafetyForm,
    networkSafetyDirty,
    networkSafetySaving,
    saveNetworkSafetySettings,
    restartViaSettingsSurface,
    isRestarting: isRestarting || hostEngineApplying,
    requiresRestartPending: pendingRestartSections.runtime,
  };
}
