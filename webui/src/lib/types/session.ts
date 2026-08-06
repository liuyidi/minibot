/** Session list, sidebar, and workspace scope payloads. */

export interface ChatSummary {
  /** Server-side session key, e.g. ``websocket:abcd-...``. */
  key: string;
  /** Local channel + chat_id parts derived from ``key`` for convenience. */
  channel: string;
  chatId: string;
  createdAt: string | null;
  updatedAt: string | null;
  title?: string;
  preview: string;
  /** Unix epoch seconds when this session currently has a turn in flight. */
  runStartedAt?: number | null;
  workspaceScope?: WorkspaceScopePayload | null;
}

export type WorkspaceAccessMode = "restricted" | "full";
export type WebuiDefaultAccessMode = "default" | "full";

export interface WorkspaceScopePayload {
  project_path: string;
  project_name?: string;
  access_mode: WorkspaceAccessMode;
  restrict_to_workspace?: boolean;
  sandbox_status?: {
    restrict_to_workspace: boolean;
    workspace_root: string;
    level: string;
    enforced: boolean;
    provider: string;
    provider_label: string;
    summary: string;
  };
}

export interface WorkspacesPayload {
  schema_version: number;
  default_access_mode: WebuiDefaultAccessMode;
  default_scope: WorkspaceScopePayload;
  controls: {
    can_change_project: boolean;
    can_use_full_access: boolean;
  };
}

export type SidebarDensity = "comfortable" | "compact";
export type SidebarSortMode = "updated_desc" | "created_desc" | "title_asc";

export interface SidebarViewState {
  density: SidebarDensity;
  show_previews: boolean;
  show_timestamps: boolean;
  show_archived: boolean;
  sort: SidebarSortMode;
}

export interface SidebarStatePayload {
  schema_version: number;
  pinned_keys: string[];
  archived_keys: string[];
  title_overrides: Record<string, string>;
  project_name_overrides: Record<string, string>;
  tags_by_key: Record<string, string[]>;
  collapsed_groups: Record<string, boolean>;
  view: SidebarViewState;
  updated_at?: string | null;
}
