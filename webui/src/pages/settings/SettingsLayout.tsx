import type { ComponentType } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SettingsGroup, SettingsRow } from "@/components/settings/form";
import {
  SettingsSidebar,
  titleForSection,
  type SettingsPageProps,
  type SettingsSectionKey,
} from "@/pages/settings/shared";
import { NATIVE_HOST_TOP_PADDING_CLASS } from "@/layouts/constants";
import { cn } from "@/lib/utils";
import { AdvancedPage } from "./advanced/AdvancedPage";
import { AppearancePage } from "./appearance/AppearancePage";
import { BrowserPage } from "./browser/BrowserPage";
import { ImagePage } from "./image/ImagePage";
import { ModelsSettingsPage } from "./models/ModelsSettingsPage";
import { OverviewPage } from "./overview/OverviewPage";
import { ProfilePage } from "./profile/ProfilePage";
import { RuntimePage } from "./runtime/RuntimePage";
import { VoicePage } from "./voice/VoicePage";
import { SettingsShellProvider } from "./SettingsShellContext";
import { useSettingsShellModel } from "./useSettingsShellModel";

export type { SettingsSectionKey } from "@/pages/settings/shared/types";
export type { SettingsPageProps } from "@/pages/settings/shared/types";

/** Route registry: `/#/settings/:section` → page component. */
const SETTINGS_SECTION_PAGES: Record<SettingsSectionKey, ComponentType> = {
  profile: ProfilePage,
  overview: OverviewPage,
  appearance: AppearancePage,
  models: ModelsSettingsPage,
  image: ImagePage,
  voice: VoicePage,
  browser: BrowserPage,
  runtime: RuntimePage,
  advanced: AdvancedPage,
};

/**
 * Settings chrome (sidebar + title + load shell). Section body is a dedicated page
 * from `SETTINGS_SECTION_PAGES` for `/#/settings/:section`.
 */
export function SettingsLayout({
  theme,
  themePreference = theme,
  initialSection = "overview",
  initialSettings = null,
  showSidebar = true,
  onToggleTheme,
  onThemeChange,
  onBackToChat,
  onModelNameChange,
  onSettingsChange,
  onRefreshSettings,
  onWorkspaceSettingsChange,
  onSectionChange,
  onLogout,
  onRestart,
  onNativeEngineRestart,
  isRestarting = false,
  hostChromeInset = false,
}: SettingsPageProps) {
  const { t } = useTranslation();
  const model = useSettingsShellModel({
    initialSection,
    initialSettings,
    onModelNameChange,
    onSettingsChange,
    onRefreshSettings,
    onWorkspaceSettingsChange,
    onSectionChange,
    onRestart,
    onNativeEngineRestart,
  });

  const { settings, loading, error, activeSection, selectSection, text } = model;

  const SectionPage = SETTINGS_SECTION_PAGES[activeSection];

  return (
    <SettingsShellProvider
      value={{
        ...model,
        theme,
        themePreference,
        onToggleTheme,
        onThemeChange,
        onBackToChat,
        isRestarting,
        showSidebar,
        hostChromeInset,
        onLogout,
      }}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row",
          showSidebar
            ? "bg-[radial-gradient(circle_at_50%_0%,hsl(var(--muted))_0%,hsl(var(--background))_42%)]"
            : "bg-background",
        )}
      >
        {showSidebar ? (
          <SettingsSidebar
            activeSection={activeSection}
            onSelectSection={selectSection}
            onBackToChat={onBackToChat}
            onLogout={onLogout}
            hostChromeInset={hostChromeInset}
          />
        ) : null}

        <main className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div
            className={cn(
              "mx-auto w-full max-w-[920px] px-4 sm:px-8",
              hostChromeInset
                ? cn(NATIVE_HOST_TOP_PADDING_CLASS, "pb-6 sm:pb-8 lg:pb-12")
                : "py-6 sm:py-8 lg:py-12",
            )}
          >
            <div className={cn(activeSection === "profile" ? "mb-2" : "mb-7")}>
              {!showSidebar ? (
                <button
                  type="button"
                  onClick={onBackToChat}
                  className="mb-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground lg:hidden"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  {t("settings.backToChat")}
                </button>
              ) : null}
              {showSidebar && activeSection !== "profile" ? (
                <p className="mb-2 text-[12px] font-normal text-muted-foreground">
                  {t("settings.sidebar.title")}
                </p>
              ) : null}
              <h1
                className={cn(
                  "text-[24px] font-normal leading-tight tracking-normal text-foreground sm:text-[28px]",
                  activeSection === "profile" && "sr-only",
                )}
              >
                {text(`settings.nav.${activeSection}`, titleForSection(activeSection))}
              </h1>
            </div>

            {loading ? (
              <div className="flex h-48 items-center justify-center rounded-[24px] border border-border/50 bg-card/75 text-sm text-muted-foreground shadow-[0_20px_70px_rgba(15,23,42,0.07)]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("settings.status.loading")}
              </div>
            ) : error && !settings ? (
              <SettingsGroup>
                <SettingsRow title={t("settings.status.loadError")}>
                  <span className="max-w-[520px] text-sm text-muted-foreground">{error}</span>
                </SettingsRow>
              </SettingsGroup>
            ) : settings ? (
              <div className="space-y-5">
                {error ? (
                  <div className="rounded-[18px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
                    {error}
                  </div>
                ) : null}
                <SectionPage />
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </SettingsShellProvider>
  );
}

/** @deprecated Prefer `SettingsLayout` — kept for existing imports/tests. */
export const SettingsPage = SettingsLayout;
