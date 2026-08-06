import { useEffect, useMemo, useState } from "react";

import {
  agentDraftFromPayload,
  DEFAULT_AGENT_SETTINGS_DRAFT,
  defaultPreset,
  editableDefaultProvider,
  modelPresetValue,
  normalizeContextWindowTokens,
  type AgentSettingsDraft,
  type ModelConfigurationDraft,
} from "@/components/settings/agent-draft";
import {
  activatePlatformModel,
  createModelConfiguration,
  updateModelConfiguration,
  updateSettings,
} from "@/lib/apis/api";
import { useSettingsShell } from "../SettingsShellContext";
import { useProvidersSettings } from "./useProvidersSettings";

export function useModelsSettings() {
  const {
    token,
    settings,
    applyPayload,
    setError,
    onModelNameChange,
    localPrefs,
  } = useSettingsShell();

  const providers = useProvidersSettings();

  const [form, setForm] = useState<AgentSettingsDraft>(() =>
    settings ? agentDraftFromPayload(settings) : DEFAULT_AGENT_SETTINGS_DRAFT,
  );
  const [saving, setSaving] = useState(false);
  const [modelConfigurationOpen, setModelConfigurationOpen] = useState(false);
  const [modelConfigurationSaving, setModelConfigurationSaving] = useState(false);
  const [modelConfigurationForm, setModelConfigurationForm] = useState<ModelConfigurationDraft>({
    label: "",
    provider: "",
    model: "",
  });

  useEffect(() => {
    if (!settings) return;
    setForm(agentDraftFromPayload(settings));
  }, [settings]);

  const modelDirty = useMemo(() => {
    if (!settings) return false;
    const activePresetName = modelPresetValue(settings);
    const selectedPreset = settings.model_presets.find((preset) => preset.name === form.modelPreset);
    if (!selectedPreset) return form.modelPreset !== activePresetName;
    const selectedProvider = selectedPreset.is_default
      ? editableDefaultProvider(settings)
      : selectedPreset.provider;
    return (
      form.modelPreset !== activePresetName ||
      form.model !== selectedPreset.model ||
      form.provider !== selectedProvider ||
      form.contextWindowTokens !== normalizeContextWindowTokens(selectedPreset.context_window_tokens) ||
      (!selectedPreset.is_default && form.presetLabel.trim() !== selectedPreset.label)
    );
  }, [form, settings]);

  const configuredModelProviderOptions = useMemo(
    () =>
      settings?.providers
        .filter((provider) => provider.configured && provider.model_selectable !== false)
        .map((provider) => ({ name: provider.name, label: provider.label })) ?? [],
    [settings],
  );

  const saveModelSettings = async () => {
    if (!settings || !modelDirty || saving) return;
    setSaving(true);
    try {
      const selectedPreset = settings.model_presets.find((preset) => preset.name === form.modelPreset);
      let payload;
      if (selectedPreset && !selectedPreset.is_default) {
        payload = await updateModelConfiguration(token, {
          name: selectedPreset.name,
          label: form.presetLabel.trim(),
          model: form.model,
          provider: form.provider,
          ...(form.contextWindowTokens !== selectedPreset.context_window_tokens
            ? { contextWindowTokens: form.contextWindowTokens }
            : {}),
        });
      } else {
        const defaultModel = defaultPreset(settings)?.model ?? settings.agent.model;
        const defaultProvider = editableDefaultProvider(settings);
        const defaultContextWindowTokens = normalizeContextWindowTokens(
          defaultPreset(settings)?.context_window_tokens ?? settings.agent.context_window_tokens,
        );
        payload = await updateSettings(token, {
          modelPreset: form.modelPreset,
          ...(form.model !== defaultModel ? { model: form.model } : {}),
          ...(form.provider !== defaultProvider ? { provider: form.provider } : {}),
          ...(form.contextWindowTokens !== defaultContextWindowTokens
            ? { contextWindowTokens: form.contextWindowTokens }
            : {}),
        });
      }
      applyPayload(payload);
      onModelNameChange(payload.agent.model || null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const activatePlatformModelSelection = async (modelId: string) => {
    if (!settings || saving) return;
    setSaving(true);
    try {
      const payload = await activatePlatformModel(token, modelId);
      applyPayload(payload);
      onModelNameChange(payload.agent.model || null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const activateAutoModelSelection = async () => {
    if (!settings || saving) return;
    setSaving(true);
    try {
      const payload = await updateSettings(token, { provider: "auto" });
      applyPayload(payload);
      onModelNameChange(payload.agent.model || null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openModelConfigurationDialog = () => {
    if (!settings) return;
    const currentProvider = settings.agent.provider;
    const provider =
      configuredModelProviderOptions.find((option) => option.name === currentProvider)?.name ??
      configuredModelProviderOptions[0]?.name ??
      "";
    setModelConfigurationForm({
      label: "",
      provider,
      model: "",
    });
    setModelConfigurationOpen(true);
  };

  const handleCreateModelConfiguration = async () => {
    if (modelConfigurationSaving) return;
    const label = modelConfigurationForm.label.trim();
    const provider = modelConfigurationForm.provider.trim();
    const model = modelConfigurationForm.model.trim();
    if (!label || !provider || !model) return;
    setModelConfigurationSaving(true);
    try {
      const payload = await createModelConfiguration(token, {
        label,
        provider,
        model,
      });
      applyPayload(payload);
      onModelNameChange(payload.agent.model || null);
      setModelConfigurationOpen(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setModelConfigurationSaving(false);
    }
  };

  return {
    ...providers,
    token,
    settings,
    form,
    setForm,
    modelDirty,
    saving,
    localPrefs,
    saveModelSettings,
    openModelConfigurationDialog,
    activatePlatformModelSelection,
    activateAutoModelSelection,
    modelConfigurationOpen,
    setModelConfigurationOpen,
    modelConfigurationForm,
    setModelConfigurationForm,
    modelConfigurationSaving,
    configuredModelProviderOptions,
    handleCreateModelConfiguration,
  };
}
