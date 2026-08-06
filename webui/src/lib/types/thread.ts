/** Thread replay, file preview, and context-usage payloads. */

import type { UIMessage } from "./message";
import type { WorkspaceScopePayload } from "./session";

/** Response shape for ``GET .../webui-thread`` (server-built transcript replay). */
export interface WebuiThreadPagePayload {
  before_cursor?: string | null;
  has_more_before?: boolean;
  loaded_message_count?: number;
  total_known_message_count?: number;
  user_message_offset?: number;
}

export interface WebuiThreadPersistedPayload {
  schemaVersion: number;
  sessionKey?: string;
  savedAt?: string;
  messages: UIMessage[];
  fork_boundary_message_count?: number;
  has_pending_tool_calls?: boolean;
  page?: WebuiThreadPagePayload;
  workspace_scope?: WorkspaceScopePayload;
}

export interface FilePreviewPayload {
  path: string;
  display_path: string;
  project_path: string;
  language: string;
  content: string;
  size: number;
  truncated: boolean;
}

export interface ContextUsageCategory {
  id: string;
  label: string;
  tokens: number;
  count: number;
  color: string;
  pct: number;
  tokens_label?: string;
}

export interface ContextUsagePayload {
  context_window_tokens: number;
  used_tokens: number;
  free_tokens: number;
  used_pct: number;
  estimate_method: string;
  categories: ContextUsageCategory[];
  used_label?: string;
  free_label?: string;
  window_label?: string;
  session_id?: string;
  model?: string;
}
