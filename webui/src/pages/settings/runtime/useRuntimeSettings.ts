import { useEffect, useMemo, useState } from "react";

import {
  agentDraftFromPayload,
  DEFAULT_AGENT_SETTINGS_DRAFT,
  type AgentSettingsDraft,
} from "@/components/settings/agent-draft";
import { updateSettings } from "@/lib/apis/api";
import { useSettingsShell } from "../SettingsShellContext";

export function useRuntimeSettings() {
  const {
    token,
    settings,
    applyPayload,
    setError,
    markPendingRestart,
    maybeRestartHostEngine,
    onWorkspaceSettingsChange,
    pendingRestartSections,
    restartViaSettingsSurface,
    hostEngineApplying,
    isRestarting,
  } = useSettingsShell();

  const [form, setForm] = useState<AgentSettingsDraft>(() =>
    settings ? agentDraftFromPayload(settings) : DEFAULT_AGENT_SETTINGS_DRAFT,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm(agentDraftFromPayload(settings));
  }, [settings]);

  const runtimeDirty = useMemo(() => {
    if (!settings) return false;
    return (
      form.timezone !== settings.agent.timezone ||
      form.botName !== settings.agent.bot_name ||
      form.botIcon !== settings.agent.bot_icon
    );
  }, [form, settings]);

  const saveRuntimeSettings = async () => {
    if (!settings || !runtimeDirty || saving) return;
    setSaving(true);
    try {
      const payload = await updateSettings(token, {
        timezone: form.timezone,
        botName: form.botName,
        botIcon: form.botIcon,
      });
      applyPayload(payload);
      if (payload.requires_restart) markPendingRestart("runtime");
      await onWorkspaceSettingsChange?.();
      await maybeRestartHostEngine(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return {
    settings,
    form,
    setForm,
    runtimeDirty,
    saving,
    saveRuntimeSettings,
    restartViaSettingsSurface,
    isRestarting: isRestarting || hostEngineApplying,
    requiresRestartPending: pendingRestartSections.runtime,
  };
}
