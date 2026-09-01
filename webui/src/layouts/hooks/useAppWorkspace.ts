import { useCallback, useEffect, useMemo, useState } from "react";

import { useWorkspaces } from "@/hooks/settings";
import { normalizeWorkspaceScope } from "@/layouts/constants";
import { useHasMinibotHost } from "@/lib/configs/runtime";
import type {
  ChatSummary,
  RuntimeSurface,
  SettingsPayload,
  WorkspaceScopePayload,
} from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";
import { useSessionUiStore } from "@/stores";
import type { Dispatch, SetStateAction } from "react";

export type SettingsApi = {
  settings: SettingsPayload | null;
  refresh: () => Promise<SettingsPayload | null>;
  setSettings: Dispatch<SetStateAction<SettingsPayload | null>>;
};

export function useAppWorkspace({
  runtimeSurface,
  view,
  activeKey,
  locationPathname,
  locationSearch,
  sessions,
  loading,
  activeSession,
  activeChatId,
  activeChatRunning,
  t,
  settingsApi,
}: {
  runtimeSurface: RuntimeSurface;
  view: string;
  activeKey: string | null;
  locationPathname: string;
  locationSearch: string;
  sessions: ChatSummary[];
  loading: boolean;
  activeSession: ChatSummary | null;
  activeChatId: string | null;
  activeChatRunning: boolean;
  t: (key: string) => string;
  settingsApi: SettingsApi;
}) {
  const { client } = useClient();
  const updateUpdatedChatIds = useSessionUiStore((s) => s.updateUpdatedChatIds);

  const {
    settings: settingsSnapshot,
    setSettings: setSettingsSnapshot,
    refresh: refreshSettings,
  } = settingsApi;
  const { workspaces, refresh: refreshWorkspaces } = useWorkspaces();

  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [draftWorkspaceScope, setDraftWorkspaceScope] =
    useState<WorkspaceScopePayload | null>(null);
  const [workspaceOverrides, setWorkspaceOverrides] =
    useState<Record<string, WorkspaceScopePayload>>({});

  const hasMinibotHost = useHasMinibotHost();
  // Desktop injects `window.minibotHost` after navigate; bootstrap/settings still say browser/minibot.
  const effectiveRuntimeSurface: RuntimeSurface = hasMinibotHost
    ? "native"
    : (settingsSnapshot?.surface ?? settingsSnapshot?.runtime_surface ?? runtimeSurface);
  const showHostChrome = effectiveRuntimeSurface === "native";
  const showMainSidebar = view !== "settings";

  useEffect(() => {
    setWorkspaceError(null);
    if (view === "chat" && !activeKey) {
      setDraftWorkspaceScope(null);
    }
  }, [view, activeKey, locationPathname, locationSearch]);

  const activeWorkspaceScope = useMemo<WorkspaceScopePayload | null>(() => {
    if (activeChatId && workspaceOverrides[activeChatId]) {
      return workspaceOverrides[activeChatId];
    }
    if (activeSession?.workspaceScope) {
      return activeSession.workspaceScope;
    }
    return draftWorkspaceScope ?? workspaces?.default_scope ?? null;
  }, [
    activeChatId,
    activeSession?.workspaceScope,
    draftWorkspaceScope,
    workspaceOverrides,
    workspaces?.default_scope,
  ]);

  useEffect(() => {
    if (loading) return;
    const knownChatIds = new Set(sessions.map((session) => session.chatId));
    updateUpdatedChatIds((current) => {
      const next = new Set(
        Array.from(current).filter((chatId) => knownChatIds.has(chatId)),
      );
      return next.size === current.size ? current : next;
    });
    setWorkspaceOverrides((current) => {
      const entries = Object.entries(current).filter(([chatId]) => knownChatIds.has(chatId));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [loading, sessions, updateUpdatedChatIds]);

  useEffect(() => {
    return client.onSessionUpdate((_chatId, _scope, workspaceScope) => {
      if (!workspaceScope) return;
      const next = normalizeWorkspaceScope(workspaceScope);
      setWorkspaceOverrides((current) => ({
        ...current,
        [_chatId]: next,
      }));
      setDraftWorkspaceScope(next);
      setWorkspaceError(null);
      void refreshWorkspaces();
    });
  }, [client, refreshWorkspaces]);

  useEffect(() => {
    return client.onError((error) => {
      if (error.kind !== "workspace_scope_rejected") return;
      setWorkspaceError(t("errors.workspaceScopeRejected.body"));
      void refreshWorkspaces();
    });
  }, [client, refreshWorkspaces, t]);

  const applyWorkspaceScope = useCallback(
    (scope: WorkspaceScopePayload) => {
      const next = normalizeWorkspaceScope(scope);
      setWorkspaceError(null);
      if (activeChatId) {
        setWorkspaceOverrides((current) => ({ ...current, [activeChatId]: next }));
        if (!activeChatRunning) {
          client.setWorkspaceScope(activeChatId, next);
        }
        return;
      }
      setDraftWorkspaceScope(next);
    },
    [activeChatId, activeChatRunning, client],
  );

  return {
    workspaces,
    settingsSnapshot,
    setSettingsSnapshot,
    refreshSettings,
    workspaceError,
    setWorkspaceError,
    draftWorkspaceScope,
    setDraftWorkspaceScope,
    workspaceOverrides,
    setWorkspaceOverrides,
    activeWorkspaceScope,
    applyWorkspaceScope,
    refreshWorkspaces,
    effectiveRuntimeSurface,
    showHostChrome,
    showMainSidebar,
  };
}
