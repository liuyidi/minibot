import type { SettingsPayload } from "@/lib/types";

export interface AgentSettingsDraft {
  model: string;
  provider: string;
  modelPreset: string;
  presetLabel: string;
  contextWindowTokens: number;
  timezone: string;
  botName: string;
  botIcon: string;
  toolHintMaxLength: number;
}

export interface ModelConfigurationDraft {
  label: string;
  provider: string;
  model: string;
}

export const CONTEXT_WINDOW_TOKEN_OPTIONS = [65_536, 262_144] as const;

export const DEFAULT_AGENT_SETTINGS_DRAFT: AgentSettingsDraft = {
  model: "",
  provider: "",
  modelPreset: "default",
  presetLabel: "Default",
  contextWindowTokens: 65_536,
  timezone: "UTC",
  botName: "minibot",
  botIcon: "",
  toolHintMaxLength: 40,
};

export function modelPresetValue(payload: SettingsPayload): string {
  return payload.agent.model_preset || "default";
}

export function defaultPreset(payload: SettingsPayload): SettingsPayload["model_presets"][number] | null {
  return payload.model_presets.find((preset) => preset.is_default) ?? null;
}

export function normalizeContextWindowTokens(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 65_536;
}

export function editableDefaultProvider(payload: SettingsPayload): string {
  const base = defaultPreset(payload);
  return base?.provider ?? payload.agent.provider ?? payload.agent.resolved_provider ?? "";
}

export function settingsProviderRow(
  payload: SettingsPayload,
  provider: string | null | undefined,
): SettingsPayload["providers"][number] | null {
  if (!provider) return null;
  return payload.providers.find((row) => row.name === provider) ?? null;
}

export function settingsProviderConfigured(
  payload: SettingsPayload,
  provider: string | null | undefined,
): boolean {
  const row = settingsProviderRow(payload, provider);
  if (row) return row.configured;
  if (provider === "auto") {
    const resolvedRow = settingsProviderRow(
      payload,
      payload.agent.resolved_provider ?? payload.agent.provider,
    );
    if (resolvedRow) return resolvedRow.configured;
  }
  return payload.agent.has_api_key;
}

export function agentDraftFromPayload(payload: SettingsPayload): AgentSettingsDraft {
  const fallbackDefault = defaultPreset(payload);
  const activePresetName = modelPresetValue(payload);
  const activePreset =
    payload.model_presets.find((preset) => preset.name === activePresetName) ?? fallbackDefault;
  return {
    model: activePreset?.model ?? payload.agent.model,
    provider: activePreset?.is_default
      ? editableDefaultProvider(payload)
      : activePreset?.provider ?? editableDefaultProvider(payload),
    modelPreset: activePresetName,
    presetLabel: activePreset?.label ?? activePresetName,
    contextWindowTokens: normalizeContextWindowTokens(
      activePreset?.context_window_tokens ?? payload.agent.context_window_tokens,
    ),
    timezone: payload.agent.timezone,
    botName: payload.agent.bot_name,
    botIcon: payload.agent.bot_icon,
    toolHintMaxLength: payload.agent.tool_hint_max_length,
  };
}
