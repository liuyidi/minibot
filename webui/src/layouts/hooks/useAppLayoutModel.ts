import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useAppChatActions } from "@/layouts/hooks/useAppChatActions";
import { useAppSessionRuntime } from "@/layouts/hooks/useAppSessionRuntime";
import { useAppUtilityNav } from "@/layouts/hooks/useAppUtilityNav";
import { useAppWorkspace } from "@/layouts/hooks/useAppWorkspace";
import { useHostSidebarUi } from "@/layouts/hooks/useHostSidebarUi";
import { deriveTitle } from "@/lib/utils/format";
import { useSessions } from "@/hooks/sessions";
import { useSettings } from "@/hooks/settings";
import { useSidebarState } from "@/hooks/ui";
import { useTheme } from "@/hooks/ui";
import type { RuntimeSurface } from "@/lib/types";
import { useShellNavigate } from "@/routes";
import { useUiStore } from "@/stores";

export function useAppLayoutModel({
  runtimeSurface,
  accountDisplayName,
  onModelNameChange,
}: {
  runtimeSurface: RuntimeSurface;
  accountDisplayName?: string | null;
  onModelNameChange: (modelName: string | null) => void;
}) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const { route, navigate, location } = useShellNavigate();
  const {
    sessions,
    loading,
    refresh,
    createChat,
    forkChat,
    deleteChat,
    getSessionAutomations,
  } = useSessions();
  const { state: sidebarState, update: updateSidebarState } =
    useSidebarState(sessions, !loading);
  const settingsApi = useSettings();

  const { view, activeKey, settingsSection: settingsInitialSection } = route;
  const sessionSearchOpen = useUiStore((s) => s.sessionSearchOpen);
  const setSessionSearchOpen = useUiStore((s) => s.setSessionSearchOpen);

  const activeSession = useMemo(() => {
    if (!activeKey) return null;
    return sessions.find((s) => s.key === activeKey) ?? null;
  }, [sessions, activeKey]);
  const activeChatId = activeSession?.chatId ?? null;

  const sessionRuntime = useAppSessionRuntime({
    loading,
    sessions,
    activeSession,
    activeChatId,
    onModelNameChange,
    t,
    refresh,
  });

  const workspace = useAppWorkspace({
    runtimeSurface,
    view,
    activeKey,
    locationPathname: location.pathname,
    locationSearch: location.search,
    sessions,
    loading,
    activeSession,
    activeChatId,
    activeChatRunning: sessionRuntime.activeChatRunning,
    t,
    settingsApi,
  });

  const hostSidebar = useHostSidebarUi(workspace.showHostChrome, workspace.showMainSidebar);

  const headerTitle = activeSession
    ? sidebarState.title_overrides[activeSession.key] ||
      activeSession.title ||
      deriveTitle(activeSession.preview, t("chat.newChat"))
    : t("app.brand");

  const utilityNav = useAppUtilityNav({
    navigate,
    view,
    activeKey,
    sessions,
    headerTitle,
    activeSession,
  });

  const chatActions = useAppChatActions({
    navigate,
    view,
    activeKey,
    settingsInitialSection,
    sessions,
    loading,
    sidebarState,
    updateSidebarState,
    createChat,
    forkChat,
    deleteChat,
    getSessionAutomations,
    activeWorkspaceScope: workspace.activeWorkspaceScope,
    workspaces: workspace.workspaces,
    setDraftWorkspaceScope: workspace.setDraftWorkspaceScope,
    setWorkspaceError: workspace.setWorkspaceError,
    setWorkspaceOverrides: workspace.setWorkspaceOverrides,
    updateUpdatedChatIds: sessionRuntime.updateUpdatedChatIds,
  });

  const sidebarProps = {
    sessions,
    activeKey,
    loading,
    onNewChat: chatActions.onNewChat,
    onSelect: chatActions.onSelectChat,
    onRequestDelete: chatActions.onRequestDelete,
    onTogglePin: chatActions.onTogglePin,
    onRequestRename: chatActions.onRequestRename,
    onToggleArchive: chatActions.onToggleArchive,
    onToggleGroup: chatActions.onToggleGroup,
    onRequestRenameProject: chatActions.onRequestRenameProject,
    onNewChatInProject: chatActions.onNewChatInProject,
    onOpenSettings: utilityNav.onOpenSettings,
    onOpenUtility: utilityNav.onOpenUtility,
    onOpenSearch: chatActions.onOpenSessionSearch,
    activeUtility:
      view === "automations" || view === "skills" || view === "channels" ? view : null,
    onToggleArchived: chatActions.onToggleArchived,
    pinnedKeys: sidebarState.pinned_keys,
    archivedKeys: sidebarState.archived_keys,
    titleOverrides: sidebarState.title_overrides,
    projectNameOverrides: sidebarState.project_name_overrides,
    collapsedGroups: sidebarState.collapsed_groups,
    runningChatIds: sessionRuntime.runningChatIdList,
    updatedChatIds: sessionRuntime.updatedChatIdList,
    viewState: sidebarState.view,
    showArchived: sidebarState.view.show_archived,
    archivedCount: sidebarState.archived_keys.length,
    defaultWorkspacePath: workspace.workspaces?.default_scope.project_path ?? null,
    accountDisplayName,
  };

  useEffect(() => {
    document.documentElement.classList.toggle("native-host", workspace.showHostChrome);
    return () => {
      document.documentElement.classList.remove("native-host");
    };
  }, [workspace.showHostChrome]);

  return {
    theme,
    toggle,
    navigate,
    view,
    settingsInitialSection,
    sessionSearchOpen,
    setSessionSearchOpen,
    activeSession,
    headerTitle,
    sidebarProps,
    hostSidebar,
    workspace,
    sessionRuntime,
    utilityNav,
    chatActions,
  };
}

export type AppLayoutModel = ReturnType<typeof useAppLayoutModel>;
