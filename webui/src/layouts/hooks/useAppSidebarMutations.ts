import { useCallback } from "react";

import type { ShellNavigateFn } from "@/layouts/hooks/useAppUtilityNav";
import type {
  ChatSummary,
  SessionAutomationJob,
  SidebarStatePayload,
} from "@/lib/types";
import { useUiStore } from "@/stores";

export function useAppSidebarMutations({
  navigate,
  activeKey,
  sessions,
  sidebarState,
  updateSidebarState,
  deleteChat,
  getSessionAutomations,
}: {
  navigate: ShellNavigateFn;
  activeKey: string | null;
  sessions: ChatSummary[];
  sidebarState: SidebarStatePayload;
  updateSidebarState: (
    updater: (current: SidebarStatePayload) => SidebarStatePayload,
  ) => Promise<void>;
  deleteChat: (
    key: string,
    options?: { deleteAutomations?: boolean },
  ) => Promise<{ deleted?: boolean; blocked_by_automations?: boolean; automations?: SessionAutomationJob[] }>;
  getSessionAutomations: (key: string) => Promise<SessionAutomationJob[]>;
}) {
  const pendingDelete = useUiStore((s) => s.pendingDelete);
  const pendingRename = useUiStore((s) => s.pendingRename);
  const pendingProjectRename = useUiStore((s) => s.pendingProjectRename);
  const setPendingDelete = useUiStore((s) => s.setPendingDelete);
  const setPendingRename = useUiStore((s) => s.setPendingRename);
  const setPendingProjectRename = useUiStore((s) => s.setPendingProjectRename);

  const onTogglePin = useCallback(
    (key: string) => {
      void updateSidebarState((current) => {
        const pinned = new Set(current.pinned_keys);
        if (pinned.has(key)) {
          pinned.delete(key);
        } else {
          pinned.add(key);
        }
        return {
          ...current,
          pinned_keys: Array.from(pinned),
        };
      });
    },
    [updateSidebarState],
  );

  const onRequestRename = useCallback((key: string, label: string) => {
    setPendingRename({ key, label });
  }, [setPendingRename]);

  const onConfirmRename = useCallback(
    (title: string) => {
      if (!pendingRename) return;
      const key = pendingRename.key;
      setPendingRename(null);
      void updateSidebarState((current) => {
        const titleOverrides = { ...current.title_overrides };
        const cleaned = title.trim();
        if (cleaned) {
          titleOverrides[key] = cleaned;
        } else {
          delete titleOverrides[key];
        }
        return {
          ...current,
          title_overrides: titleOverrides,
        };
      });
    },
    [pendingRename, setPendingRename, updateSidebarState],
  );

  const onToggleGroup = useCallback(
    (groupId: string) => {
      void updateSidebarState((current) => {
        const collapsedGroups = { ...current.collapsed_groups };
        if (groupId === "workspace:chats" || groupId === "date:all") {
          if (collapsedGroups[groupId] === false) {
            delete collapsedGroups[groupId];
          } else {
            collapsedGroups[groupId] = false;
          }
          return {
            ...current,
            collapsed_groups: collapsedGroups,
          };
        }
        if (collapsedGroups[groupId]) {
          delete collapsedGroups[groupId];
        } else {
          collapsedGroups[groupId] = true;
        }
        return {
          ...current,
          collapsed_groups: collapsedGroups,
        };
      });
    },
    [updateSidebarState],
  );

  const onRequestRenameProject = useCallback((key: string, label: string) => {
    setPendingProjectRename({ key, label });
  }, [setPendingProjectRename]);

  const onConfirmProjectRename = useCallback(
    (title: string) => {
      if (!pendingProjectRename) return;
      const key = pendingProjectRename.key;
      setPendingProjectRename(null);
      void updateSidebarState((current) => {
        const projectNameOverrides = { ...current.project_name_overrides };
        const cleaned = title.trim();
        if (cleaned) {
          projectNameOverrides[key] = cleaned;
        } else {
          delete projectNameOverrides[key];
        }
        return {
          ...current,
          project_name_overrides: projectNameOverrides,
        };
      });
    },
    [pendingProjectRename, setPendingProjectRename, updateSidebarState],
  );

  const onToggleArchive = useCallback(
    (key: string) => {
      void updateSidebarState((current) => {
        const archived = new Set(current.archived_keys);
        const pinned = current.pinned_keys.filter((item) => item !== key);
        if (archived.has(key)) {
          archived.delete(key);
        } else {
          archived.add(key);
        }
        return {
          ...current,
          pinned_keys: pinned,
          archived_keys: Array.from(archived),
        };
      });
      if (activeKey === key && !sidebarState.archived_keys.includes(key)) {
        const archived = new Set([...sidebarState.archived_keys, key]);
        const next = sessions.find((session) => !archived.has(session.key));
        navigate({
          view: "chat",
          activeKey: next?.key ?? null,
          settingsSection: "overview",
        });
      }
    },
    [activeKey, navigate, sessions, sidebarState.archived_keys, updateSidebarState],
  );

  const onToggleArchived = useCallback(() => {
    void updateSidebarState((current) => ({
      ...current,
      view: {
        ...current.view,
        show_archived: !current.view.show_archived,
      },
    }));
  }, [updateSidebarState]);

  const onConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const key = pendingDelete.key;
    const hasAutomations = (pendingDelete.automations?.length ?? 0) > 0;
    const deletingActive = activeKey === key;
    const currentIndex = sessions.findIndex((s) => s.key === key);
    const fallbackKey = deletingActive
      ? (sessions[currentIndex + 1]?.key ?? sessions[currentIndex - 1]?.key ?? null)
      : activeKey;
    try {
      const result = await deleteChat(
        key,
        hasAutomations ? { deleteAutomations: true } : undefined,
      );
      if (result.blocked_by_automations) {
        setPendingDelete({
          ...pendingDelete,
          automations: result.automations ?? [],
        });
        return;
      }
      setPendingDelete(null);
      if (deletingActive) {
        navigate({
          view: "chat",
          activeKey: fallbackKey,
          settingsSection: "overview",
        }, { replace: true });
      }
    } catch (e) {
      console.error("Failed to delete session", e);
    }
  }, [activeKey, deleteChat, navigate, pendingDelete, sessions, setPendingDelete]);

  const onRequestDelete = useCallback(async (key: string, label: string) => {
    let automations: SessionAutomationJob[] = [];
    try {
      automations = await getSessionAutomations(key);
    } catch {
      // Delete remains protected by the backend block; prefetch only improves the first prompt.
    }
    setPendingDelete({ key, label, automations });
  }, [getSessionAutomations, setPendingDelete]);

  return {
    onTogglePin,
    onRequestRename,
    onConfirmRename,
    onToggleGroup,
    onRequestRenameProject,
    onConfirmProjectRename,
    onToggleArchive,
    onToggleArchived,
    onConfirmDelete,
    onRequestDelete,
    pendingDelete,
    pendingRename,
    pendingProjectRename,
    setPendingDelete,
    setPendingRename,
    setPendingProjectRename,
  };
}
