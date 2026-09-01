import { projectNameFromPath } from "@/lib/utils/workspace";
import type { WorkspaceScopePayload } from "@/lib/types";

export const RESTART_STARTED_KEY = "minibot-webui.restartStartedAt";
export const SIDEBAR_WIDTH = 272;
/** Native/desktop host sidebar — aligned closer to WorkBuddy. */
export const NATIVE_SIDEBAR_WIDTH = 240;
export const SIDEBAR_RAIL_WIDTH = 56;
export const MOBILE_SIDEBAR_WIDTH = `min(${SIDEBAR_WIDTH}px, calc(100vw - 0.75rem))`;
/**
 * Title row left inset when native chrome icons sit after traffic lights and the
 * host sidebar is collapsed (traffic lights ≈ 84 + 3×28 icons + gaps ≈ 180).
 */
export const HOST_CHROME_TITLE_INSET_CLASS = "pl-[180px]";
/** Desktop titlebar band — sync with Rust `TRAFFIC_LIGHT_BTN_H + TRAFFIC_LIGHT_Y`. */
export const NATIVE_TITLEBAR_BAND_PX = 32;
/** Traffic-light vertical center with CHROME_DOWN=10 — sync with Rust geometry. */
export const NATIVE_TITLEBAR_CENTER_PX = 26;
/** Top offset for h-8 controls aligned to `NATIVE_TITLEBAR_CENTER_PX`. */
export const NATIVE_HOST_CHROME_TOP_PX = NATIVE_TITLEBAR_CENTER_PX - 16;
/** Logo band below native titlebar — titlebar (32px) + 24px breathing room. */
export const NATIVE_HOST_TOP_INSET_CLASS = "mt-14";
export const NATIVE_HOST_TOP_PADDING_CLASS = "pt-14";
export const NATIVE_HOST_TOP_CHROME_ROW = "flex mt-[10px] h-8 shrink-0 items-center";

export function normalizeWorkspaceScope(scope: WorkspaceScopePayload): WorkspaceScopePayload {
  const accessMode = scope.access_mode === "restricted" ? "restricted" : "full";
  return {
    ...scope,
    project_name: scope.project_name ?? projectNameFromPath(scope.project_path),
    access_mode: accessMode,
    restrict_to_workspace: accessMode === "restricted",
  };
}
