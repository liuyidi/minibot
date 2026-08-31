import { inferProviderFromModelName, providerDisplayLabel } from "@/lib/constants/provider-brand";
import type { SettingsPayload } from "@/lib/types";

export interface ModelBadgeInfo {
  label: string | null;
  provider: string | null;
  providerLabel: string | null;
  needsSetup: boolean;
}

function toModelBadgeLabel(modelName: string | null): string | null {
  if (!modelName) return null;
  const trimmed = modelName.trim();
  if (!trimmed) return null;
  const leaf = trimmed.split("/").pop() ?? trimmed;
  return leaf || trimmed;
}

function activeModelPreset(
  settings: SettingsPayload | null,
): SettingsPayload["model_presets"][number] | null {
  if (!settings) return null;
  const configured = settings.agent.model_preset || "default";
  return (
    settings.model_presets.find((preset) => preset.name === configured)
    ?? settings.model_presets.find((preset) => preset.active)
    ?? null
  );
}

function resolvedModelProvider(
  settings: SettingsPayload | null,
  modelName: string | null,
): string | null {
  const preset = activeModelPreset(settings);
  const rawProvider = preset?.provider || settings?.agent.provider || null;
  if (rawProvider === "auto") {
    return settings?.agent.resolved_provider || inferProviderFromModelName(modelName) || null;
  }
  return rawProvider || inferProviderFromModelName(modelName);
}

export function toModelBadgeInfo(
  modelName: string | null,
  settings: SettingsPayload | null,
): ModelBadgeInfo {
  if (!settings) {
    return {
      label: toModelBadgeLabel(modelName),
      provider: null,
      providerLabel: null,
      needsSetup: false,
    };
  }

  const activePlatformId = (settings.active_platform_model || "").trim();
  const platform = activePlatformId
    ? (settings.platform_models ?? []).find((item) => item.id === activePlatformId)
    : null;
  if (platform) {
    const brand = platform.provider || "custom";
    return {
      label: toModelBadgeLabel(platform.model || modelName || settings.agent.model),
      provider: brand,
      providerLabel: platform.label || brand,
      needsSetup: !settings.agent.has_api_key && !platform.available,
    };
  }

  const agentProvider = (settings.agent.provider || "").trim();
  if (agentProvider === "auto") {
    const resolved =
      settings.agent.resolved_provider || inferProviderFromModelName(modelName || settings.agent.model);
    return {
      label: "Auto",
      provider: resolved || "auto",
      providerLabel: "Auto",
      needsSetup: !settings.agent.has_api_key,
    };
  }

  const model = modelName || settings.agent.model || null;
  const label = toModelBadgeLabel(model);
  const provider = resolvedModelProvider(settings, model);
  // Platform/BYOK credentials are summarized by has_api_key; do not require the
  // active preset's provider row when the live agent already has a key.
  if (settings.agent.has_api_key) {
    return {
      label,
      provider,
      providerLabel: provider ? providerDisplayLabel(settings.providers ?? [], provider) : null,
      needsSetup: false,
    };
  }
  const providerRow = provider
    ? settings.providers.find((item) => item.name === provider)
    : null;
  const needsSetup = Boolean(!model || !provider || !providerRow || !providerRow.configured);
  return {
    label,
    provider,
    providerLabel: provider ? providerDisplayLabel(settings.providers ?? [], provider) : null,
    needsSetup,
  };
}
