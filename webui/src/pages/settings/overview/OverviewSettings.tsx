import {
  Bot,
  ChevronRight,
  ExternalLink,
  HardDrive,
  Scale,
  Server,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { settingsProviderConfigured } from "@/components/settings/agent-draft";
import { SettingsGroup, SettingsSectionTitle } from "@/components/settings/form";
import { providerBrand, providerDisplayLabel } from "@/lib/constants/provider-brand";
import type { SettingsPayload } from "@/lib/types";
import { shortWorkspacePath } from "@/lib/utils/workspace";

import type { SettingsSectionKey } from "@/pages/settings/shared/types";

const PRIVACY_URL = "https://auth.liuyidi.me/privacy";
const TERMS_URL = "https://auth.liuyidi.me/terms";

function formatAboutVersion(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "minibot") {
    return "minibot";
  }
  const version = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  return `minibot v${version}`;
}

export function OverviewSettings({
  settings,
  requiresRestart,
  onSelectSection,
  showBrandLogos,
}: {
  settings: SettingsPayload;
  requiresRestart: boolean;
  onSelectSection: (section: SettingsSectionKey) => void;
  showBrandLogos: boolean;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const activePreset = settings.agent.model_preset || "default";
  const activeProvider = settings.agent.resolved_provider ?? settings.agent.provider;
  const activeProviderConfigured = settingsProviderConfigured(settings, activeProvider);
  const activeProviderLabel = providerDisplayLabel(settings.providers, activeProvider);
  const activeModelValue = activeProviderConfigured
    ? settings.agent.model
    : tx("settings.values.notConfigured", "Not configured");
  const activeModelCaption = activeProviderConfigured
    ? `${activeProvider} · ${activePreset}`
    : activeProviderLabel || settings.agent.model
      ? [activeProviderLabel, settings.agent.model].filter(Boolean).join(" · ")
      : tx("settings.byok.noConfiguredProviders", "No configured providers");
  const isNativeHost = (settings.surface ?? settings.runtime_surface) === "native";
  const workspaceCaption = shortWorkspacePath(settings.runtime?.workspace_path ?? "");
  const runtimeTitle = isNativeHost
    ? tx("settings.rows.engine", "Engine")
    : tx("settings.rows.gateway", "Gateway");
  const runtimeValue = isNativeHost
    ? tx("settings.values.privateEngine", "Private engine")
    : `${settings.runtime?.gateway_host ?? "—"}:${settings.runtime?.gateway_port ?? "—"}`;
  const runtimeCaption = isNativeHost
    ? tx("settings.values.unixSocket", "Unix socket")
    : requiresRestart
      ? tx("settings.values.restartPending", "Restart pending")
      : tx("settings.values.ready", "Ready");
  return (
    <div className="space-y-7">
      <section>
        <SettingsSectionTitle>{tx("settings.sections.ai", "AI")}</SettingsSectionTitle>
        <SettingsGroup>
          <OverviewListRow
            icon={Bot}
            valueLogoProvider={activeProvider}
            title={tx("settings.overview.model", "Current model")}
            value={activeModelValue}
            caption={activeModelCaption}
            showBrandLogos={showBrandLogos}
            onClick={() => onSelectSection("models")}
          />
        </SettingsGroup>
      </section>

      <section>
        <SettingsSectionTitle>{tx("settings.sections.system", "System")}</SettingsSectionTitle>
        <SettingsGroup>
          <OverviewListRow
            icon={Server}
            title={runtimeTitle}
            value={runtimeValue}
            caption={runtimeCaption}
            onClick={() => onSelectSection("runtime")}
          />
          <OverviewListRow
            icon={HardDrive}
            title={tx("settings.overview.workspace", "Workspace")}
            value={workspaceCaption || tx("settings.values.notConfigured", "Not configured")}
            caption={tx("settings.values.defaultWorkspace", "Default workspace")}
            onClick={() => onSelectSection("runtime")}
          />
        </SettingsGroup>
      </section>

      <section>
        <SettingsSectionTitle>{tx("settings.sections.about", "About")}</SettingsSectionTitle>
        <SettingsGroup>
          <AboutVersionRow currentVersion={settings.version?.current} />
          <AboutLinkRow
            icon={Shield}
            title={tx("settings.about.privacy", "Privacy Policy")}
            href={PRIVACY_URL}
          />
          <AboutLinkRow
            icon={Scale}
            title={tx("settings.about.terms", "Terms of Service")}
            href={TERMS_URL}
          />
        </SettingsGroup>
      </section>
    </div>
  );
}

export function AboutVersionRow({ currentVersion }: { currentVersion?: string }) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  return (
    <div className="flex min-h-[62px] items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <div className="text-[14px] font-medium leading-5 text-foreground">
          {tx("settings.about.version", "Version")}
        </div>
        <div className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
          {formatAboutVersion(currentVersion)}
        </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer AboutVersionRow — update check UI is temporarily hidden. */
export function VersionCheckRow({ currentVersion }: { currentVersion?: string }) {
  return <AboutVersionRow currentVersion={currentVersion} />;
}

export function AboutLinkRow({
  icon: Icon,
  title,
  href,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-[62px] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 sm:px-5"
    >
      <OverviewRowIcon icon={Icon} />
      <span className="min-w-0 flex-1 text-[14px] font-medium leading-5 text-foreground">
        {title}
      </span>
      <ExternalLink
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground"
        aria-hidden
      />
    </a>
  );
}

export function OverviewRowIcon({
  icon: Icon,
}: {
  icon: LucideIcon;
}) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-muted text-foreground/82 transition-colors group-hover:bg-muted/80 dark:bg-muted/70">
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

export function OverviewValueLogo({
  provider,
  showBrandLogos,
}: {
  provider: string | null | undefined;
  showBrandLogos: boolean;
}) {
  const [logoIndex, setLogoIndex] = useState(0);
  const brand = provider ? providerBrand(provider) : null;
  const logoUrl = brand?.logoUrls[logoIndex];

  useEffect(() => setLogoIndex(0), [provider]);

  if (!provider || !showBrandLogos || !brand) return null;

  if (logoUrl) {
    return (
      <span
        data-testid={`overview-logo-${provider}`}
        className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-md border border-border/35 bg-background shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]"
        style={{ boxShadow: `inset 0 0 0 1px ${brand.color}22` }}
        aria-hidden
      >
        <img
          src={logoUrl}
          alt=""
          className="h-3.5 w-3.5 object-contain"
          onError={() => setLogoIndex((index) => index + 1)}
        />
      </span>
    );
  }

  return (
    <span
      data-testid={`overview-logo-fallback-${provider}`}
      className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[7.5px] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
      style={{ backgroundColor: brand.color }}
      aria-hidden
    >
      {brand.initials}
    </span>
  );
}

export function OverviewListRow({
  icon: Icon,
  valueLogoProvider,
  title,
  value,
  caption,
  showBrandLogos = false,
  onClick,
}: {
  icon: LucideIcon;
  valueLogoProvider?: string | null;
  title: string;
  value: string;
  caption: string;
  showBrandLogos?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[68px] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 sm:px-5"
    >
      <OverviewRowIcon icon={Icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium leading-5 text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-[12px] leading-5 text-muted-foreground">{caption}</span>
      </span>
      <span className="ml-auto flex min-w-0 max-w-[48%] items-center gap-2">
        <OverviewValueLogo provider={valueLogoProvider} showBrandLogos={showBrandLogos} />
        <span className="truncate text-right text-[13px] leading-5 text-muted-foreground">
          {value}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </button>
  );
}
