import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { SettingsSectionKey } from "@/components/settings/SettingsView";
import type { ChatSummary } from "@/lib/types";
import {
  shellViewForSettingsSection,
  type ShellRoute,
  type ShellView,
  type SidebarUtilityKey,
} from "@/routes";
import type { NavigateShellOptions } from "@/routes";
import { useUiStore } from "@/stores";

export type ShellNavigateFn = (next: ShellRoute, options?: NavigateShellOptions) => void;

function documentTitleForView({
  view,
  t,
  headerTitle,
  activeSession,
}: {
  view: ShellView | string;
  t: (key: string, options?: Record<string, unknown>) => string;
  headerTitle: string;
  activeSession: ChatSummary | null;
}): string {
  const utilityTitles: Partial<Record<ShellView, string>> = {
    settings: t("settings.sidebar.title"),
    apps: t("settings.nav.apps", { defaultValue: "Apps" }),
    automations: t("settings.nav.automations", { defaultValue: "Automations" }),
    skills: t("settings.nav.skills", { defaultValue: "Skills · Connectors" }),
    channels: t("settings.nav.channels", { defaultValue: "IM channels" }),
    download: t("sidebar.downloadApp", { defaultValue: "Download app" }),
  };
  const utilityTitle = utilityTitles[view as ShellView];
  if (utilityTitle != null) {
    return t("app.documentTitle.chat", { title: utilityTitle });
  }
  return activeSession
    ? t("app.documentTitle.chat", { title: headerTitle })
    : t("app.documentTitle.base");
}

export function useAppUtilityNav({
  navigate,
  view,
  activeKey,
  sessions,
  headerTitle,
  activeSession,
}: {
  navigate: ShellNavigateFn;
  view: ShellView | string;
  activeKey: string | null;
  sessions: ChatSummary[];
  headerTitle: string;
  activeSession: ChatSummary | null;
}) {
  const { t, i18n } = useTranslation();
  const setSessionSearchOpen = useUiStore((s) => s.setSessionSearchOpen);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);

  const openPage = useCallback(
    (nextView: ShellView, section: SettingsSectionKey) => {
      setSessionSearchOpen(false);
      navigate({ view: nextView, activeKey, settingsSection: section });
      setMobileSidebarOpen(false);
    },
    [activeKey, navigate, setMobileSidebarOpen, setSessionSearchOpen],
  );

  const onOpenUtility = useCallback(
    (utility: SidebarUtilityKey) => {
      openPage(utility, utility);
    },
    [openPage],
  );

  const onOpenSettings = useCallback(
    (section: SettingsSectionKey = "overview") => {
      openPage("settings", section);
    },
    [openPage],
  );

  const onOpenModelSettings = useCallback(() => {
    onOpenSettings("models");
  }, [onOpenSettings]);

  const onSettingsSectionChange = useCallback(
    (section: SettingsSectionKey) => {
      navigate({
        view: shellViewForSettingsSection(section),
        activeKey,
        settingsSection: section,
      });
    },
    [activeKey, navigate],
  );

  const onBackToChat = useCallback(() => {
    setMobileSidebarOpen(false);
    const nextKey = (() => {
      if (!activeKey) return null;
      if (sessions.some((session) => session.key === activeKey)) return activeKey;
      return sessions[0]?.key ?? null;
    })();
    navigate({
      view: "chat",
      activeKey: nextKey,
      settingsSection: "overview",
    });
  }, [activeKey, navigate, sessions, setMobileSidebarOpen]);

  useEffect(() => {
    document.title = documentTitleForView({
      view,
      t,
      headerTitle,
      activeSession,
    });
  }, [activeSession, headerTitle, i18n.resolvedLanguage, t, view]);

  return {
    onOpenUtility,
    onOpenSettings,
    onOpenModelSettings,
    onSettingsSectionChange,
    onBackToChat,
  };
}
