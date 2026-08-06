import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { updateWebSearchSettings } from "@/lib/apis/api";
import type { WebSearchSettingsUpdate } from "@/lib/types";
import { DEFAULT_WEB_SEARCH_FORM, webSearchFormFromPayload } from "@/pages/settings/shared";
import { useSettingsShell } from "../SettingsShellContext";

export function useBrowserSettings() {
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

  const [webSearchForm, setWebSearchForm] = useState<WebSearchSettingsUpdate>(() =>
    settings ? webSearchFormFromPayload(settings) : DEFAULT_WEB_SEARCH_FORM,
  );
  const [webSearchSaving, setWebSearchSaving] = useState(false);
  const [webSearchKeyVisible, setWebSearchKeyVisible] = useState(false);
  const [webSearchKeyEditing, setWebSearchKeyEditing] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setWebSearchForm((prev) => webSearchFormFromPayload(settings, prev));
  }, [settings]);

  const resetWebSearchDraft = useCallback(() => {
    if (!settings) return;
    setWebSearchForm({
      provider: settings.web_search.provider,
      apiKey: "",
      baseUrl: settings.web_search.base_url ?? "",
      maxResults: settings.web_search.max_results,
      timeout: settings.web_search.timeout,
      useJinaReader: settings.web.fetch.use_jina_reader,
    });
    setWebSearchKeyVisible(false);
    setWebSearchKeyEditing(false);
  }, [settings]);

  const handleWebSearchProviderChange = useCallback(
    (provider: string) => {
      if (!settings) return;
      setWebSearchForm((prev) => ({
        provider,
        apiKey: "",
        baseUrl: provider === settings.web_search.provider ? settings.web_search.base_url ?? "" : "",
        maxResults: prev.maxResults ?? settings.web_search.max_results,
        timeout: prev.timeout ?? settings.web_search.timeout,
        useJinaReader: prev.useJinaReader ?? settings.web.fetch.use_jina_reader,
      }));
      setWebSearchKeyVisible(false);
      setWebSearchKeyEditing(false);
    },
    [settings],
  );

  const saveWebSearch = async () => {
    if (!settings || webSearchSaving) return;
    const provider = settings.web_search.providers.find(
      (item) => item.name === webSearchForm.provider,
    );
    if (!provider) return;
    const apiKey = webSearchForm.apiKey?.trim() ?? "";
    const baseUrl = webSearchForm.baseUrl?.trim() ?? "";
    const hasExistingSecret =
      provider.credential === "api_key" &&
      webSearchForm.provider === settings.web_search.provider &&
      !!settings.web_search.api_key_hint;

    if (provider.credential === "api_key" && !apiKey && !hasExistingSecret) {
      setError(t("settings.byok.webSearch.apiKeyRequired"));
      return;
    }
    if (provider.credential === "base_url" && !baseUrl) {
      setError(t("settings.byok.webSearch.baseUrlRequired"));
      return;
    }

    setWebSearchSaving(true);
    try {
      const webFetchRestartRequired =
        (webSearchForm.useJinaReader ?? settings.web.fetch.use_jina_reader) !==
        settings.web.fetch.use_jina_reader;
      const update: WebSearchSettingsUpdate = {
        provider: webSearchForm.provider,
        maxResults: webSearchForm.maxResults,
        timeout: webSearchForm.timeout,
        useJinaReader: webSearchForm.useJinaReader,
      };
      if (provider.credential === "api_key" && apiKey) update.apiKey = apiKey;
      if (provider.credential === "base_url") update.baseUrl = baseUrl;
      const payload = await updateWebSearchSettings(token, update);
      applyPayload(payload);
      if (payload.requires_restart || webFetchRestartRequired) {
        markPendingRestart("browser");
      }
      await maybeRestartHostEngine(payload);
      setWebSearchForm((prev) => ({
        provider: payload.web_search.provider,
        apiKey: "",
        baseUrl: payload.web_search.base_url ?? prev.baseUrl ?? "",
        maxResults: payload.web_search.max_results,
        timeout: payload.web_search.timeout,
        useJinaReader: payload.web.fetch.use_jina_reader,
      }));
      setWebSearchKeyVisible(false);
      setWebSearchKeyEditing(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWebSearchSaving(false);
    }
  };

  return {
    settings,
    webSearchForm,
    setWebSearchForm,
    webSearchKeyVisible,
    setWebSearchKeyVisible,
    webSearchKeyEditing,
    setWebSearchKeyEditing,
    webSearchSaving,
    handleWebSearchProviderChange,
    resetWebSearchDraft,
    saveWebSearch,
    localPrefs,
    restartViaSettingsSurface,
    isRestarting: isRestarting || hostEngineApplying,
    requiresRestartPending: pendingRestartSections.browser,
  };
}
