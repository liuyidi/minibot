import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  loginProviderOAuth,
  logoutProviderOAuth,
  updateProviderSettings,
} from "@/lib/apis/api";
import type { ProviderForm } from "@/pages/settings/shared";
import { useSettingsShell } from "../SettingsShellContext";

export function useProvidersSettings() {
  const { t } = useTranslation();
  const {
    token,
    settings,
    applyPayload,
    setError,
    markPendingRestart,
    maybeRestartHostEngine,
    localPrefs,
    pendingRestartSections,
    restartViaSettingsSurface,
    hostEngineApplying,
    isRestarting,
  } = useSettingsShell();

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [providerQuery, setProviderQuery] = useState("");
  const [providerSaving, setProviderSaving] = useState<string | null>(null);
  const [providerForms, setProviderForms] = useState<Record<string, ProviderForm>>({});
  const [visibleProviderKeys, setVisibleProviderKeys] = useState<Record<string, boolean>>({});
  const [editingProviderKeys, setEditingProviderKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!settings) return;
    setProviderForms((prev) => {
      const next = { ...prev };
      for (const provider of settings.providers) {
        next[provider.name] = {
          apiKey: next[provider.name]?.apiKey ?? "",
          apiBase:
            next[provider.name]?.apiBase ?? provider.api_base ?? provider.default_api_base ?? "",
          apiType: next[provider.name]?.apiType ?? provider.api_type ?? "auto",
        };
      }
      return next;
    });
  }, [settings]);

  const resetProviderDraft = useCallback(
    (providerName: string) => {
      const provider = settings?.providers.find((item) => item.name === providerName);
      if (!provider) return;
      setProviderForms((prev) => ({
        ...prev,
        [providerName]: {
          apiKey: "",
          apiBase: provider.api_base ?? provider.default_api_base ?? "",
          apiType: provider.api_type ?? "auto",
        },
      }));
      setVisibleProviderKeys((prev) => ({ ...prev, [providerName]: false }));
      setEditingProviderKeys((prev) => ({ ...prev, [providerName]: false }));
    },
    [settings],
  );

  const handleToggleProvider = useCallback(
    (providerName: string) => {
      if (expandedProvider) resetProviderDraft(expandedProvider);
      setExpandedProvider(expandedProvider === providerName ? null : providerName);
    },
    [expandedProvider, resetProviderDraft],
  );

  const toggleProviderKeyVisibility = (providerName: string) => {
    const isVisible = visibleProviderKeys[providerName];
    setVisibleProviderKeys((prev) => ({ ...prev, [providerName]: !isVisible }));
  };

  const toggleProviderKeyEditing = (providerName: string) => {
    setEditingProviderKeys((prev) => {
      const nextEditing = !prev[providerName];
      if (!nextEditing) {
        setProviderForms((forms) => ({
          ...forms,
          [providerName]: {
            apiKey: "",
            apiBase: forms[providerName]?.apiBase ?? "",
            apiType: forms[providerName]?.apiType ?? "auto",
          },
        }));
        setVisibleProviderKeys((visible) => ({ ...visible, [providerName]: false }));
      }
      return { ...prev, [providerName]: nextEditing };
    });
  };

  const saveProvider = async (providerName: string) => {
    if (providerSaving) return;
    const provider = settings?.providers.find((item) => item.name === providerName);
    if (!provider) return;
    if (provider.auth_type === "oauth") return;
    const providerForm = providerForms[providerName] ?? {
      apiKey: "",
      apiBase: "",
      apiType: "auto",
    };
    const apiKey = providerForm.apiKey.trim();
    const apiKeyRequired = provider.api_key_required ?? true;
    if (!provider.configured && apiKeyRequired && !apiKey) {
      setError(t("settings.byok.apiKeyRequired"));
      return;
    }
    setProviderSaving(providerName);
    try {
      const payload = await updateProviderSettings(token, {
        provider: providerName,
        apiKey: apiKey || undefined,
        apiBase: providerForm.apiBase.trim(),
        apiType: providerForm.apiType,
      });
      applyPayload(payload);
      if (payload.requires_restart) markPendingRestart("image");
      await maybeRestartHostEngine(payload);
      setProviderForms((prev) => ({
        ...prev,
        [providerName]: {
          apiKey: "",
          apiBase: providerForm.apiBase.trim(),
          apiType: providerForm.apiType,
        },
      }));
      setVisibleProviderKeys((prev) => ({ ...prev, [providerName]: false }));
      setEditingProviderKeys((prev) => ({ ...prev, [providerName]: false }));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProviderSaving(null);
    }
  };

  const runProviderOAuth = async (providerName: string, action: "login" | "logout") => {
    if (providerSaving) return;
    setProviderSaving(providerName);
    try {
      const payload =
        action === "login"
          ? await loginProviderOAuth(token, providerName)
          : await logoutProviderOAuth(token, providerName);
      applyPayload(payload);
      setExpandedProvider(providerName);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProviderSaving(null);
    }
  };

  return {
    settings,
    localPrefs,
    expandedProvider,
    providerQuery,
    setProviderQuery,
    providerSaving,
    providerForms,
    setProviderForms,
    visibleProviderKeys,
    editingProviderKeys,
    handleToggleProvider,
    toggleProviderKeyVisibility,
    toggleProviderKeyEditing,
    saveProvider,
    runProviderOAuth,
    resetProviderDraft,
    pendingRestartSections,
    restartViaSettingsSurface,
    isRestarting: isRestarting || hostEngineApplying,
  };
}
