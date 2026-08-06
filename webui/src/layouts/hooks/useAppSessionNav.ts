import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";

import { normalizeWorkspaceScope } from "@/layouts/constants";
import type { ShellNavigateFn } from "@/layouts/hooks/useAppUtilityNav";
import type { SettingsSectionKey } from "@/components/settings/SettingsView";
import { displayTitle } from "@/lib/utils/chat-groups";
import { projectNameFromPath } from "@/lib/utils/workspace";
import type {
  ChatSummary,
  SidebarStatePayload,
  WorkspaceScopePayload,
  WorkspacesPayload,
} from "@/lib/types";
import { defaultShellRoute, type ShellView } from "@/routes";
import { useUiStore } from "@/stores";

export function useAppSessionNav({
  navigate,
  view,
  activeKey,
  settingsInitialSection,
  sessions,
  loading,
  sidebarState,
  createChat,
  forkChat,
  activeWorkspaceScope,
  workspaces,
  setDraftWorkspaceScope,
  setWorkspaceError,
  setWorkspaceOverrides,
  updateUpdatedChatIds,
}: {
  navigate: ShellNavigateFn;
  view: ShellView;
  activeKey: string | null;
  settingsInitialSection: SettingsSectionKey;
  sessions: ChatSummary[];
  loading: boolean;
  sidebarState: SidebarStatePayload;
  createChat: (scope?: WorkspaceScopePayload | null) => Promise<string>;
  forkChat: (sourceChatId: string, beforeUserIndex: number, title: string) => Promise<string>;
  activeWorkspaceScope: WorkspaceScopePayload | null;
  workspaces: WorkspacesPayload | null;
  setDraftWorkspaceScope: (scope: WorkspaceScopePayload | null) => void;
  setWorkspaceError: (error: string | null) => void;
  setWorkspaceOverrides: Dispatch<SetStateAction<Record<string, WorkspaceScopePayload>>>;
  updateUpdatedChatIds: (
    updater: (current: Set<string>) => Set<string>,
  ) => void;
}) {
  const { t } = useTranslation();
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);
  const setSessionSearchOpen = useUiStore((s) => s.setSessionSearchOpen);

  useEffect(() => {
    if (loading || !activeKey) return;
    if (sessions.some((session) => session.key === activeKey)) return;
    navigate(
      view === "chat"
        ? defaultShellRoute()
        : {
            view,
            activeKey: null,
            settingsSection: settingsInitialSection,
          },
      { replace: true },
    );
  }, [activeKey, loading, navigate, sessions, settingsInitialSection, view]);

  const onCreateChat = useCallback(async (workspaceScope?: WorkspaceScopePayload | null) => {
    try {
      const scope = workspaceScope ?? activeWorkspaceScope;
      const chatId = await createChat(scope);
      navigate({
        view: "chat",
        activeKey: `websocket:${chatId}`,
        settingsSection: "overview",
      });
      setMobileSidebarOpen(false);
      if (scope) {
        setWorkspaceOverrides((current) => ({
          ...current,
          [chatId]: normalizeWorkspaceScope(scope),
        }));
      }
      return chatId;
    } catch (e) {
      console.error("Failed to create chat", e);
      if (e instanceof Error && e.message.startsWith("workspace_scope_rejected:")) {
        setWorkspaceError(t("errors.workspaceScopeRejected.body"));
      }
      return null;
    }
  }, [
    activeWorkspaceScope,
    createChat,
    navigate,
    setMobileSidebarOpen,
    setWorkspaceError,
    setWorkspaceOverrides,
    t,
  ]);

  const onForkChat = useCallback(async (
    sourceChatId: string,
    beforeUserIndex: number,
  ) => {
    try {
      const sourceSession = sessions.find((session) => session.chatId === sourceChatId);
      const sourceTitle = sourceSession
        ? displayTitle(sourceSession, sidebarState.title_overrides, t("chat.newChat"))
        : t("chat.newChat");
      const chatId = await forkChat(
        sourceChatId,
        beforeUserIndex,
        t("chat.forkTitle", { title: sourceTitle }),
      );
      navigate({
        view: "chat",
        activeKey: `websocket:${chatId}`,
        settingsSection: "overview",
      });
      setMobileSidebarOpen(false);
      return chatId;
    } catch (e) {
      console.error("Failed to fork chat", e);
      return null;
    }
  }, [forkChat, navigate, sessions, setMobileSidebarOpen, sidebarState.title_overrides, t]);

  const onNewChat = useCallback(() => {
    navigate(defaultShellRoute());
    setDraftWorkspaceScope(null);
    setWorkspaceError(null);
    setSessionSearchOpen(false);
    setMobileSidebarOpen(false);
  }, [navigate, setDraftWorkspaceScope, setMobileSidebarOpen, setSessionSearchOpen, setWorkspaceError]);

  const onNewChatInProject = useCallback(
    (projectPath: string, projectName: string) => {
      const base = workspaces?.default_scope ?? activeWorkspaceScope;
      const trimmed = projectPath.trim();
      if (!base || !trimmed) {
        onNewChat();
        return;
      }
      navigate(defaultShellRoute());
      setDraftWorkspaceScope(normalizeWorkspaceScope({
        project_path: trimmed,
        project_name: projectName || projectNameFromPath(trimmed),
        access_mode: base.access_mode,
        restrict_to_workspace: base.access_mode === "restricted",
      }));
      setWorkspaceError(null);
      setMobileSidebarOpen(false);
    },
    [
      activeWorkspaceScope,
      navigate,
      onNewChat,
      setDraftWorkspaceScope,
      setMobileSidebarOpen,
      setWorkspaceError,
      workspaces?.default_scope,
    ],
  );

  const onSelectChat = useCallback(
    (key: string) => {
      const selected = sessions.find((session) => session.key === key);
      const selectedChatId = selected?.chatId;
      if (selectedChatId) {
        updateUpdatedChatIds((current) => {
          if (!current.has(selectedChatId)) return current;
          const next = new Set(current);
          next.delete(selectedChatId);
          return next;
        });
      }
      if (selected?.workspaceScope) {
        setDraftWorkspaceScope(normalizeWorkspaceScope(selected.workspaceScope));
      } else {
        setDraftWorkspaceScope(null);
      }
      setWorkspaceError(null);
      navigate({ view: "chat", activeKey: key, settingsSection: "overview" });
      setMobileSidebarOpen(false);
    },
    [
      navigate,
      sessions,
      setDraftWorkspaceScope,
      setMobileSidebarOpen,
      setWorkspaceError,
      updateUpdatedChatIds,
    ],
  );

  const onOpenSessionSearch = useCallback(() => {
    setMobileSidebarOpen(false);
    setSessionSearchOpen(true);
  }, [setMobileSidebarOpen, setSessionSearchOpen]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const commandShiftO =
        (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;
      if (commandShiftO && event.key.toLowerCase() === "o") {
        event.preventDefault();
        onNewChat();
        return;
      }
      const plainCommandK =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
      if (!plainCommandK) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      onOpenSessionSearch();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewChat, onOpenSessionSearch]);

  const onSelectSearchResult = useCallback(
    (key: string) => {
      setSessionSearchOpen(false);
      onSelectChat(key);
    },
    [onSelectChat, setSessionSearchOpen],
  );

  return {
    onCreateChat,
    onForkChat,
    onNewChat,
    onNewChatInProject,
    onSelectChat,
    onOpenSessionSearch,
    onSelectSearchResult,
  };
}
