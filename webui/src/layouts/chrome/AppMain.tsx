import { SettingsPage } from "@/pages/settings";
import { AutomationsPage } from "@/pages/automations";
import { ChannelsPage } from "@/pages/channels";
import { SkillsPage } from "@/pages/skills";
import { ThreadShell } from "@/components/thread/ThreadShell";
import { DownloadPage } from "@/pages/download";
import { UtilityPageFrame } from "@/layouts/chrome/UtilityPageFrame";
import type { AppLayoutModel } from "@/layouts/hooks/useAppLayoutModel";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export type AppMainHostActions = {
  onLogout: () => void;
  onModelNameChange: (modelName: string | null) => void;
  onNativeEngineRestart: () => Promise<string>;
};

export function AppMain({
  model,
  host,
}: {
  model: AppLayoutModel;
  host: AppMainHostActions;
}) {
  const { t } = useTranslation();
  const {
    view,
    settingsInitialSection,
    activeSession,
    headerTitle,
    theme,
    toggle,
    workspace,
    hostSidebar,
    chatActions,
    sessionRuntime,
    utilityNav,
  } = model;
  const { showHostChrome } = workspace;
  const { hostSidebarOpen, toggleSidebar } = hostSidebar;

  return (
    <main
      className={cn(
        "relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background",
        showHostChrome && hostSidebarOpen && "border-l border-border/55",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 flex flex-col",
          view !== "chat" && "invisible pointer-events-none",
        )}
      >
        <ThreadShell
          session={activeSession}
          title={headerTitle}
          onToggleSidebar={toggleSidebar}
          onNewChat={chatActions.onNewChat}
          onCreateChat={chatActions.onCreateChat}
          onForkChat={chatActions.onForkChat}
          onTurnEnd={sessionRuntime.onTurnEnd}
          theme={theme}
          onToggleTheme={toggle}
          // Host chrome uses native/titlebar controls. Desktop web expands from the
          // collapsed logo hover and collapses from the brand-header control.
          hideSidebarToggleForHostChrome={showHostChrome}
          hostChromeTitleInset={showHostChrome && !hostSidebarOpen}
          hideHeader={false}
          onRenameTitle={
            activeSession
              ? (nextTitle) => chatActions.onRenameSessionTitle(activeSession.key, nextTitle)
              : undefined
          }
          workspaceScope={workspace.activeWorkspaceScope}
          workspaceDefaultScope={workspace.workspaces?.default_scope ?? null}
          workspaceControls={workspace.workspaces?.controls ?? null}
          workspaceScopeDisabled={sessionRuntime.activeChatRunning}
          workspaceError={workspace.workspaceError}
          onWorkspaceScopeChange={workspace.applyWorkspaceScope}
          settingsSnapshot={workspace.settingsSnapshot}
          onOpenModelSettings={utilityNav.onOpenModelSettings}
        />
      </div>
      {view === "download" ? (
        <div className="absolute inset-0 flex flex-col">
          <DownloadPage />
        </div>
      ) : view === "automations" ? (
        <UtilityPageFrame
          title={t("settings.nav.automations", { defaultValue: "Scheduled tasks" })}
          hostChromeInset={showHostChrome}
        >
          <AutomationsPage />
        </UtilityPageFrame>
      ) : view === "skills" ? (
        <UtilityPageFrame
          title={t("settings.nav.skills", { defaultValue: "Skills · Connectors" })}
          hostChromeInset={showHostChrome}
        >
          <SkillsPage />
        </UtilityPageFrame>
      ) : view === "channels" ? (
        <UtilityPageFrame
          title={t("settings.nav.channels", { defaultValue: "IM channels" })}
          hostChromeInset={showHostChrome}
        >
          <ChannelsPage />
        </UtilityPageFrame>
      ) : view === "settings" ? (
        <div className="absolute inset-0 flex flex-col">
          <SettingsPage
            theme={theme}
            initialSection={settingsInitialSection}
            initialSettings={workspace.settingsSnapshot}
            showSidebar
            onToggleTheme={toggle}
            onBackToChat={utilityNav.onBackToChat}
            onModelNameChange={host.onModelNameChange}
            onSettingsChange={workspace.setSettingsSnapshot}
            onRefreshSettings={workspace.refreshSettings}
            onWorkspaceSettingsChange={async () => {
              await workspace.refreshWorkspaces();
            }}
            onSectionChange={utilityNav.onSettingsSectionChange}
            onLogout={host.onLogout}
            onRestart={sessionRuntime.onRestart}
            onNativeEngineRestart={host.onNativeEngineRestart}
            isRestarting={sessionRuntime.isRestarting}
            hostChromeInset={showHostChrome}
          />
        </div>
      ) : null}
    </main>
  );
}
