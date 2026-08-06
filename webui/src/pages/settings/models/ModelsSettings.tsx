import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
  useState,
} from "react";
import { Check, Copy, Loader2, Orbit } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  CONTEXT_WINDOW_TOKEN_OPTIONS,
  defaultPreset,
  editableDefaultProvider,
  normalizeContextWindowTokens,
  settingsProviderConfigured,
  type AgentSettingsDraft,
  type ModelConfigurationDraft,
} from "@/components/settings/agent-draft";
import { SegmentedControl } from "@/components/settings/controls";
import { SettingsFooter, SettingsGroup, SettingsRow } from "@/components/settings/form";
import {
  ModelIdPicker,
  ModelPresetPicker,
  ProviderPicker,
  ProviderPickerIcon,
  uniqueProviders,
} from "@/components/settings/model-pickers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SETTINGS_SHOW_USER_MODEL_CONFIGS } from "@/lib/configs/ui-entry";
import { cn } from "@/lib/utils";
import type { SettingsPayload } from "@/lib/types";

export function NewModelConfigurationDialog({
  open,
  draft,
  providers,
  saving,
  showProviderLogos,
  onOpenChange,
  onChangeDraft,
  onSave,
}: {
  open: boolean;
  draft: ModelConfigurationDraft;
  providers: Array<{ name: string; label: string }>;
  saving: boolean;
  showProviderLogos: boolean;
  onOpenChange: (open: boolean) => void;
  onChangeDraft: Dispatch<SetStateAction<ModelConfigurationDraft>>;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const canSave = Boolean(draft.label.trim() && draft.provider.trim() && draft.model.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-[28px] border-border/55 bg-card/95 p-0 shadow-[0_28px_90px_rgba(15,23,42,0.20)] backdrop-blur-xl dark:border-white/10">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <DialogHeader className="border-b border-border/45 px-5 py-4 text-left">
            <DialogTitle className="text-[18px] font-semibold tracking-[-0.01em]">
              {tx("settings.models.newConfiguration", "New model configuration")}
            </DialogTitle>
            <DialogDescription className="text-[12.5px] leading-5">
              {tx("settings.models.newConfigurationHelp", "Save a provider and model as a one-click option.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-5">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                {tx("settings.models.configurationName", "Configuration name")}
              </span>
              <Input
                autoFocus
                value={draft.label}
                placeholder={tx("settings.models.configurationNamePlaceholder", "Fast writing")}
                onChange={(event) =>
                  onChangeDraft((prev) => ({ ...prev, label: event.target.value }))
                }
                className="h-10 rounded-full px-4 text-[14px]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                  {tx("settings.rows.model", "Model")}
                </span>
                <Input
                  value={draft.model}
                  placeholder="openai/gpt-4.1"
                  onChange={(event) =>
                    onChangeDraft((prev) => ({ ...prev, model: event.target.value }))
                  }
                  className="h-10 rounded-full px-4 text-[14px]"
                />
              </label>
              <div className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                  {tx("settings.rows.provider", "Provider")}
                </span>
                <ProviderPicker
                  providers={providers}
                  value={draft.provider}
                  emptyLabel={tx("settings.byok.noConfiguredProviders", "No configured providers")}
                  showProviderLogos={showProviderLogos}
                  onChange={(provider) =>
                    onChangeDraft((prev) => ({ ...prev, provider }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/45 px-5 py-4 sm:space-x-2">
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {tx("settings.actions.cancel", "Cancel")}
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="rounded-full"
              disabled={!canSave || saving || providers.length === 0}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {saving ? tx("settings.actions.saving", "Saving...") : tx("settings.actions.save", "Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ModelsSettings({
  token,
  form,
  setForm,
  settings,
  dirty,
  saving,
  showBrandLogos,
  providerSaving,
  onProviderOAuthLogin,
  onSave,
  onCreateConfiguration,
  onActivatePlatformModel,
  onActivateAuto,
}: {
  token: string;
  form: AgentSettingsDraft;
  setForm: Dispatch<SetStateAction<AgentSettingsDraft>>;
  settings: SettingsPayload;
  dirty: boolean;
  saving: boolean;
  showBrandLogos: boolean;
  providerSaving: string | null;
  onProviderOAuthLogin: (provider: string) => void;
  onSave: () => void;
  onCreateConfiguration: () => void;
  onActivatePlatformModel: (modelId: string) => void;
  onActivateAuto: () => void;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const platformModels = settings.platform_models ?? [];
  const activePlatformModel = settings.active_platform_model || "";
  const autoActive = (settings.agent.provider || "").trim() === "auto" && !activePlatformModel;
  const configuredProviders = settings.providers.filter((provider) => provider.configured);
  const showAutoProvider = defaultPreset(settings)?.provider === "auto" || form.provider === "auto";
  const selectableProviders = uniqueProviders(configuredProviders);
  const providerOptions = showAutoProvider
    ? [{ name: "auto", label: "Auto" }, ...selectableProviders]
    : selectableProviders;
  const providerValue = providerOptions.some((provider) => provider.name === form.provider)
    ? form.provider
    : "";
  const selectedPreset =
    settings.model_presets.find((preset) => preset.name === form.modelPreset) ?? null;
  const selectedProvider = settings.providers.find((provider) => provider.name === form.provider);
  const selectedProviderNeedsSignIn =
    selectedProvider?.auth_type === "oauth" && !selectedProvider.configured;
  const selectedProviderSigningIn = providerSaving === selectedProvider?.name;
  const selectedProviderConfigured = settingsProviderConfigured(settings, form.provider);
  const modelFieldsMissing =
    !form.model.trim() ||
    !form.provider.trim() ||
    Boolean(selectedPreset && !selectedPreset.is_default && !form.presetLabel.trim());
  return (
    <div className="space-y-7">
      {platformModels.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              {tx("settings.models.platformModels", "Platform models")}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {tx(
                "settings.models.platformModelsHelp",
                "Built-in models funded by the host. No API key required.",
              )}
            </p>
          </div>
          <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card/40">
            <PlatformModelRadioRow
              id="auto"
              title="Auto"
              modelId="auto"
              description={tx(
                "settings.models.descriptions.auto",
                "Picks the best available platform model for speed and quality.",
              )}
              provider="auto"
              active={autoActive}
              available
              saving={saving}
              showBrandLogos={showBrandLogos}
              onSelect={onActivateAuto}
            />
            {platformModels.map((item) => {
              const active = activePlatformModel === item.id;
              return (
                <PlatformModelRadioRow
                  key={item.id}
                  id={item.id}
                  title={item.label}
                  modelId={item.model}
                  description={tx(
                    `settings.models.descriptions.${item.id}`,
                    platformModelFallbackDescription(item.id, item.label),
                  )}
                  provider={item.provider || "custom"}
                  active={active}
                  available={item.available}
                  saving={saving}
                  showBrandLogos={showBrandLogos}
                  onSelect={() => onActivatePlatformModel(item.id)}
                />
              );
            })}
          </div>
        </section>
      ) : null}
      {SETTINGS_SHOW_USER_MODEL_CONFIGS ? (
      <section>
        <div className="mb-3">
          <h3 className="text-[13px] font-semibold text-foreground">
            {tx("settings.models.yourConfigurations", "Your configurations")}
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {tx(
              "settings.models.yourConfigurationsHelp",
              "Custom presets and BYOK providers.",
            )}
          </p>
        </div>
        <SettingsGroup>
          <SettingsRow
            title={tx("settings.rows.currentModel", "Current configuration")}
            description={tx("settings.help.currentModel", "Used for new replies.")}
          >
            <ModelPresetPicker
              presets={settings.model_presets}
              value={form.modelPreset}
              settings={settings}
              draftModel={form.model}
              draftProvider={form.provider}
              providerConfigured={selectedProviderConfigured}
              showProviderLogos={showBrandLogos}
              onChange={(modelPreset) => {
                const nextPreset = settings.model_presets.find((preset) => preset.name === modelPreset);
                setForm((prev) => ({
                  ...prev,
                  modelPreset,
                  model: nextPreset?.model ?? prev.model,
                  provider: nextPreset?.is_default
                    ? editableDefaultProvider(settings)
                    : nextPreset?.provider ?? prev.provider,
                  presetLabel: nextPreset?.label ?? modelPreset,
                  contextWindowTokens: normalizeContextWindowTokens(
                    nextPreset?.context_window_tokens ?? prev.contextWindowTokens,
                  ),
                }));
              }}
              onCreateConfiguration={onCreateConfiguration}
            />
          </SettingsRow>
          {selectedPreset && !selectedPreset.is_default ? (
            <SettingsRow
              title={tx("settings.models.configurationName", "Configuration name")}
              description={tx("settings.models.configurationNameHelp", "Rename this saved model configuration.")}
            >
              <Input
                value={form.presetLabel}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, presetLabel: event.target.value }))
                }
                className="h-8 w-[min(280px,70vw)] rounded-full text-[13px]"
              />
            </SettingsRow>
          ) : null}
          <SettingsRow
            title={t("settings.rows.provider")}
            description={t("settings.help.provider")}
          >
            <ProviderPicker
              providers={providerOptions}
              value={providerValue}
              emptyLabel={t("settings.byok.noConfiguredProviders")}
              showProviderLogos={showBrandLogos}
              onChange={(provider) =>
                setForm((prev) => ({
                  ...prev,
                  provider,
                  model: provider === prev.provider ? prev.model : "",
                }))
              }
            />
          </SettingsRow>
          {selectedProviderNeedsSignIn ? (
            <SettingsRow
              title={tx("settings.oauth.signInRequired", "Sign in required")}
              description={tx(
                "settings.oauth.signInBeforeSaving",
                "Sign in before saving this OAuth provider as the active model provider.",
              )}
            >
              <Button
                size="sm"
                variant="outline"
                onClick={() => selectedProvider && onProviderOAuthLogin(selectedProvider.name)}
                disabled={!selectedProvider?.oauth_login_supported || selectedProviderSigningIn}
                className="rounded-full"
              >
                {selectedProviderSigningIn ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : null}
                {selectedProviderSigningIn
                  ? tx("settings.oauth.signingIn", "Signing in...")
                  : tx("settings.oauth.signIn", "Sign in")}
              </Button>
            </SettingsRow>
          ) : null}
          <SettingsRow
            title={t("settings.rows.model")}
            description={t("settings.help.model")}
          >
            <ModelIdPicker
              token={token}
              settings={settings}
              provider={form.provider}
              value={form.model}
              showProviderLogos={showBrandLogos}
              onChange={(model) => setForm((prev) => ({ ...prev, model }))}
            />
          </SettingsRow>
          <SettingsRow
            title={tx("settings.rows.contextWindow", "Context window")}
            description={tx(
              "settings.help.contextWindow",
              "Choose the default context budget for this model configuration.",
            )}
          >
            <SegmentedControl
              value={String(form.contextWindowTokens)}
              options={CONTEXT_WINDOW_TOKEN_OPTIONS.map((tokens) => ({
                value: String(tokens),
                label: tokens === 262_144 ? "256K" : "64K",
              }))}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  contextWindowTokens: normalizeContextWindowTokens(Number(value)),
                }))
              }
            />
          </SettingsRow>
          <SettingsFooter
            dirty={dirty}
            saving={saving}
            saved={false}
            disabled={selectedProviderNeedsSignIn || modelFieldsMissing}
            message={
              selectedProviderNeedsSignIn
                ? tx("settings.oauth.signInBeforeSaving", "Sign in before saving this OAuth provider as the active model provider.")
                : undefined
            }
            onSave={onSave}
          />
        </SettingsGroup>
      </section>
      ) : null}
    </div>
  );
}

function platformModelFallbackDescription(id: string, label: string): string {
  switch (id) {
    case "platform-deepseek-v4-flash":
      return "Fast DeepSeek model for everyday chat and light coding.";
    case "platform-deepseek-v4-pro":
      return "Stronger DeepSeek model for harder reasoning and coding tasks.";
    case "platform-qwen3.7-plus":
      return "Qwen Plus for balanced multilingual chat and agent work.";
    case "platform-glm-5.2":
      return "GLM for general reasoning and Chinese-centric workflows.";
    case "platform-kimi-k2.7-code":
      return "Kimi coding model tuned for repository-scale edits.";
    case "platform-minimax-m3":
      return "MiniMax M3 for high-throughput OpenAI-compatible calls.";
    default:
      return `${label} platform model.`;
  }
}

function PlatformModelRadioRow({
  id,
  title,
  modelId,
  description,
  provider,
  active,
  available,
  saving,
  showBrandLogos,
  onSelect,
}: {
  id: string;
  title: string;
  modelId: string;
  description: string;
  provider: string;
  active: boolean;
  available: boolean;
  saving: boolean;
  showBrandLogos: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const [copied, setCopied] = useState(false);
  const disabled = !available || saving;

  const copyModelId = async (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(modelId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      data-testid={`platform-model-${id}`}
      className={cn(
        "flex w-full items-start gap-3 px-3.5 py-3.5 text-left transition-colors",
        !disabled && "hover:bg-muted/35",
        disabled && "opacity-55",
        active && "bg-muted/25",
      )}
    >
      <span
        className={cn(
          "mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
          active ? "border-sky-500 bg-sky-500" : "border-muted-foreground/35 bg-background",
        )}
        aria-hidden
      >
        {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center">
        {provider === "auto" ? (
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300">
            <Orbit className="h-4 w-4" aria-hidden />
          </span>
        ) : (
          <span className="grid h-8 w-8 place-items-center [&_span]:h-7 [&_span]:w-7">
            <ProviderPickerIcon provider={provider} showBrandLogos={showBrandLogos} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">{title}</span>
          {active ? (
            <span className="rounded-md bg-violet-500/12 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
              {tx("settings.models.badgeEnabled", "Enabled")}
            </span>
          ) : null}
          {!available ? (
            <span className="rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
              {tx("settings.models.badgeUnavailable", "Unavailable")}
            </span>
          ) : null}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">
            {tx("settings.models.modelNameLabel", "Model Name")}: {modelId}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={copyModelId}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                void navigator.clipboard.writeText(modelId).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1200);
                });
              }
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            title={tx("settings.models.copyModelName", "Copy model name")}
            aria-label={tx("settings.models.copyModelName", "Copy model name")}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </span>
        </span>
        <span className="mt-1.5 block text-[12px] leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}
