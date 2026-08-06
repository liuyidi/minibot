import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsUsage } from "@/hooks/settings";
import { fetchSettings } from "@/lib/apis/api";
import type { SettingsPayload } from "@/lib/types";
import {
  EMPTY_PENDING_RESTART_SECTIONS,
  LOCAL_PREFS_STORAGE_KEY,
  pendingRestartSectionsFromPayload,
  readLocalPreferences,
  type LocalPreferences,
  type PendingRestartSections,
  type RestartAwarePayload,
  type SettingsSectionKey,
} from "@/pages/settings/shared";
import type { SettingsPageProps } from "@/pages/settings/shared";
import { useClient } from "@/providers/ClientProvider";

export type SettingsShellModel = ReturnType<typeof useSettingsShellModel>;

/**
 * Thin settings chrome model: shared payload, section nav, prefs, restart.
 * Section forms/actions live in colocated `useXxxSettings` hooks.
 */
export function useSettingsShellModel({
  initialSection = "overview",
  initialSettings = null,
  onModelNameChange,
  onSettingsChange,
  onRefreshSettings,
  onWorkspaceSettingsChange,
  onSectionChange,
  onRestart,
  onNativeEngineRestart,
}: Pick<
  SettingsPageProps,
  | "initialSection"
  | "initialSettings"
  | "onModelNameChange"
  | "onSettingsChange"
  | "onRefreshSettings"
  | "onWorkspaceSettingsChange"
  | "onSectionChange"
  | "onRestart"
  | "onNativeEngineRestart"
>) {
  const { t } = useTranslation();
  const { token } = useClient();
  const [settings, setSettings] = useState<SettingsPayload | null>(() => initialSettings);
  const [loading, setLoading] = useState(() => initialSettings === null);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>(initialSection);
  const [hostEngineApplying, setHostEngineApplying] = useState(false);
  const [pendingRestartSections, setPendingRestartSections] = useState<PendingRestartSections>(
    EMPTY_PENDING_RESTART_SECTIONS,
  );
  const [localPrefs, setLocalPrefs] = useState<LocalPreferences>(() => readLocalPreferences());

  useEffect(() => {
    // Keep forced initialSection (tests / utility routes like apps) even when
    // the slim Settings nav hides that section.
    setActiveSection(initialSection);
  }, [initialSection]);

  const selectSection = useCallback(
    (section: SettingsSectionKey) => {
      setActiveSection(section);
      onSectionChange?.(section);
    },
    [onSectionChange],
  );

  const text = useCallback(
    (key: string, fallback: string, options?: Record<string, unknown>) =>
      t(key, { defaultValue: fallback, ...(options ?? {}) }),
    [t],
  );

  const applyPayload = useCallback(
    (payload: SettingsPayload) => {
      setSettings(payload);
      if (payload.restart_required_sections) {
        setPendingRestartSections(pendingRestartSectionsFromPayload(payload));
      }
      onSettingsChange?.(payload);
    },
    [onSettingsChange],
  );

  useEffect(() => {
    if (!initialSettings || settings !== null) return;
    applyPayload(initialSettings);
    setLoading(false);
  }, [applyPayload, initialSettings, settings]);

  useEffect(() => {
    let cancelled = false;
    const showLoading = settings === null;
    if (showLoading) setLoading(true);
    void (async () => {
      try {
        const payload = onRefreshSettings
          ? await onRefreshSettings()
          : await fetchSettings(token);
        if (!cancelled && payload) {
          applyPayload(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && showLoading) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPayload, onRefreshSettings, token]);

  const hasSettings = settings !== null;
  const { usage: polledUsage } = useSettingsUsage(activeSection === "overview" && hasSettings);
  useEffect(() => {
    if (!polledUsage) return;
    setSettings((current) => (current ? { ...current, usage: polledUsage } : current));
  }, [polledUsage]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_PREFS_STORAGE_KEY, JSON.stringify(localPrefs));
    } catch {
      // ignore
    }
  }, [localPrefs]);

  const hasPendingRestart = useMemo(
    () =>
      !!settings?.requires_restart ||
      pendingRestartSections.runtime ||
      pendingRestartSections.browser ||
      pendingRestartSections.image,
    [pendingRestartSections, settings?.requires_restart],
  );

  const restartViaSettingsSurface = useCallback(async () => {
    const isNativeHost = (settings?.surface ?? settings?.runtime_surface) === "native";
    if (
      isNativeHost &&
      settings?.runtime_capabilities?.can_restart_engine &&
      onNativeEngineRestart
    ) {
      setHostEngineApplying(true);
      try {
        const nextToken = await onNativeEngineRestart();
        const payload = await fetchSettings(nextToken);
        applyPayload(payload);
        setPendingRestartSections(EMPTY_PENDING_RESTART_SECTIONS);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setHostEngineApplying(false);
      }
      return;
    }
    onRestart?.();
  }, [applyPayload, onNativeEngineRestart, onRestart, settings]);

  const maybeRestartHostEngine = useCallback(
    async (payload: RestartAwarePayload) => {
      const surface =
        payload.surface ?? payload.runtime_surface ?? settings?.surface ?? settings?.runtime_surface;
      const capabilities = payload.runtime_capabilities ?? settings?.runtime_capabilities;
      const isNativeHost = surface === "native";
      if (
        !payload.requires_restart ||
        !isNativeHost ||
        !capabilities?.can_restart_engine ||
        !onNativeEngineRestart
      ) {
        return;
      }
      setHostEngineApplying(true);
      try {
        const nextToken = await onNativeEngineRestart();
        const refreshed = await fetchSettings(nextToken);
        applyPayload(refreshed);
        setPendingRestartSections(EMPTY_PENDING_RESTART_SECTIONS);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setHostEngineApplying(false);
      }
    },
    [applyPayload, onNativeEngineRestart, settings],
  );

  const markPendingRestart = useCallback((section: keyof PendingRestartSections) => {
    setPendingRestartSections((prev) => ({ ...prev, [section]: true }));
  }, []);

  return {
    token,
    settings,
    loading,
    error,
    setError,
    applyPayload,
    activeSection,
    selectSection,
    localPrefs,
    setLocalPrefs,
    pendingRestartSections,
    setPendingRestartSections,
    markPendingRestart,
    hasPendingRestart,
    hostEngineApplying,
    restartViaSettingsSurface,
    maybeRestartHostEngine,
    text,
    onModelNameChange,
    onWorkspaceSettingsChange,
  };
}
