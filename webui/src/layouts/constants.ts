import { projectNameFromPath } from "@/lib/utils/workspace";
import type { WorkspaceScopePayload } from "@/lib/types";

export const RESTART_STARTED_KEY = "minibot-webui.restartStartedAt";
export const SIDEBAR_WIDTH = 272;
export const SIDEBAR_RAIL_WIDTH = 56;
export const MOBILE_SIDEBAR_WIDTH = `min(${SIDEBAR_WIDTH}px, calc(100vw - 0.75rem))`;

export function normalizeWorkspaceScope(scope: WorkspaceScopePayload): WorkspaceScopePayload {
  const accessMode = scope.access_mode === "restricted" ? "restricted" : "full";
  return {
    ...scope,
    project_name: scope.project_name ?? projectNameFromPath(scope.project_path),
    access_mode: accessMode,
    restrict_to_workspace: accessMode === "restricted",
  };
}
