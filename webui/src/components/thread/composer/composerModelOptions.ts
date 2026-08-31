import { useCallback, useMemo } from "react";

import type { ComposerModelOption } from "@/components/thread/composer/ComposerModelBadge";
import {
  activateModelConfiguration,
  activatePlatformModel,
  updateSettings,
} from "@/lib/apis/api";
import { SETTINGS_SHOW_USER_MODEL_CONFIGS } from "@/lib/configs/ui-entry";
import type { SettingsPayload } from "@/lib/types";

export function buildComposerModelOptions(settings: SettingsPayload | null): ComposerModelOption[] {
  if (!settings) return [];
  const activePlatform = (settings.active_platform_model || "").trim();
  const agentProvider = (settings.agent.provider || "").trim();
  const platformModels = settings.platform_models ?? [];
  const anyPlatform = platformModels.some((item) => item.available);
  // Without platform/Auto keys, keep the old “configure in settings” path.
  if (!anyPlatform && !settings.agent.has_api_key && agentProvider !== "auto") {
    return [];
  }
  const options: ComposerModelOption[] = [];
  if (anyPlatform || agentProvider === "auto" || settings.agent.has_api_key) {
    options.push({
      id: "auto",
      kind: "auto",
      label: "Auto",
      active: agentProvider === "auto" && !activePlatform,
    });
  }
  for (const item of platformModels) {
    options.push({
      id: item.id,
      kind: "platform",
      label: item.label,
      detail: item.model,
      provider: item.provider,
      active: activePlatform === item.id,
      disabled: !item.available,
    });
  }
  if (SETTINGS_SHOW_USER_MODEL_CONFIGS) {
    for (const preset of settings.model_presets) {
      if (preset.is_default && anyPlatform && !(preset.model || "").trim()) continue;
      options.push({
        id: preset.name,
        kind: "preset",
        label: preset.label || preset.name,
        detail: preset.model,
        provider: preset.provider,
        active: !activePlatform && agentProvider !== "auto" && (
          preset.active || preset.name === (settings.agent.model_preset || "default")
        ),
      });
    }
  }
  return options;
}

export function useComposerModelOptions({
  settings,
  token,
  onSettingsChange,
}: {
  settings: SettingsPayload | null;
  token: string;
  onSettingsChange: (settings: SettingsPayload) => void;
}) {
  const modelOptions = useMemo(() => buildComposerModelOptions(settings), [settings]);

  const handleSelectModelOption = useCallback(
    async (option: ComposerModelOption) => {
      try {
        let payload: SettingsPayload;
        if (option.kind === "auto") {
          payload = await updateSettings(token, { provider: "auto" });
        } else if (option.kind === "platform") {
          payload = await activatePlatformModel(token, option.id);
        } else {
          payload = await activateModelConfiguration(token, option.id);
        }
        onSettingsChange(payload);
      } catch {
        // Keep current selection; user can retry or open settings.
      }
    },
    [onSettingsChange, token],
  );

  return { modelOptions, handleSelectModelOption };
}
