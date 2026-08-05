import { describe, expect, it } from "vitest";

import {
  isPersistedSidebarState,
  normalizeSidebarState,
} from "@/hooks/useSidebarState";

describe("isPersistedSidebarState", () => {
  it("rejects legacy stub payloads that would wipe archive keys", () => {
    expect(
      isPersistedSidebarState({
        collapsed: false,
        title_overrides: {},
        project_names: {},
      }),
    ).toBe(false);
  });

  it("accepts schema-v1 echoes from the gateway", () => {
    const state = normalizeSidebarState({
      schema_version: 1,
      pinned_keys: [],
      archived_keys: ["websocket:feishu:ou_x"],
      title_overrides: {},
      project_name_overrides: {},
      tags_by_key: {},
      collapsed_groups: {},
      view: {
        density: "comfortable",
        show_previews: false,
        show_timestamps: false,
        show_archived: false,
        sort: "updated_desc",
      },
      updated_at: "2026-08-06T00:00:00Z",
    });
    expect(isPersistedSidebarState(state)).toBe(true);
    expect(state.archived_keys).toEqual(["websocket:feishu:ou_x"]);
  });
});
