import { type Dispatch, type SetStateAction } from "react";

import { useAppSessionNav } from "@/layouts/hooks/useAppSessionNav";
import { useAppSidebarMutations } from "@/layouts/hooks/useAppSidebarMutations";
import type { ShellNavigateFn } from "@/layouts/hooks/useAppUtilityNav";
import type { SettingsSectionKey } from "@/components/settings/SettingsView";
import type {
  ChatSummary,
  SessionAutomationJob,
  SidebarStatePayload,
  WorkspaceScopePayload,
  WorkspacesPayload,
} from "@/lib/types";
import type { ShellView } from "@/routes";

export function useAppChatActions(params: {
  navigate: ShellNavigateFn;
  view: ShellView;
  activeKey: string | null;
  settingsInitialSection: SettingsSectionKey;
  sessions: ChatSummary[];
  loading: boolean;
  sidebarState: SidebarStatePayload;
  updateSidebarState: (
    updater: (current: SidebarStatePayload) => SidebarStatePayload,
  ) => Promise<void>;
  createChat: (scope?: WorkspaceScopePayload | null) => Promise<string>;
  forkChat: (sourceChatId: string, beforeUserIndex: number, title: string) => Promise<string>;
  deleteChat: (
    key: string,
    options?: { deleteAutomations?: boolean },
  ) => Promise<{ deleted?: boolean; blocked_by_automations?: boolean; automations?: SessionAutomationJob[] }>;
  getSessionAutomations: (key: string) => Promise<SessionAutomationJob[]>;
  activeWorkspaceScope: WorkspaceScopePayload | null;
  workspaces: WorkspacesPayload | null;
  setDraftWorkspaceScope: (scope: WorkspaceScopePayload | null) => void;
  setWorkspaceError: (error: string | null) => void;
  setWorkspaceOverrides: Dispatch<SetStateAction<Record<string, WorkspaceScopePayload>>>;
  updateUpdatedChatIds: (
    updater: (current: Set<string>) => Set<string>,
  ) => void;
}) {
  const sessionNav = useAppSessionNav(params);
  const sidebarMutations = useAppSidebarMutations(params);

  return {
    ...sessionNav,
    ...sidebarMutations,
  };
}
