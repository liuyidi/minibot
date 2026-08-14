import { describe, expect, it } from "vitest";

import {
  shellRouteFromLocation,
  shellRouteToLocation,
} from "@/routes/shell-route";

describe("shell-route settings paths", () => {
  it("writes nested settings pages", () => {
    expect(
      shellRouteToLocation({
        view: "settings",
        activeKey: null,
        settingsSection: "appearance",
      }),
    ).toEqual({ pathname: "/settings/appearance", search: "" });

    expect(
      shellRouteToLocation({
        view: "settings",
        activeKey: null,
        settingsSection: "overview",
      }),
    ).toEqual({ pathname: "/settings/overview", search: "" });
  });

  it("reads /settings/:section and legacy ?section=", () => {
    expect(
      shellRouteFromLocation({ pathname: "/settings/profile", search: "" }),
    ).toEqual({
      view: "settings",
      activeKey: null,
      settingsSection: "profile",
    });

    expect(
      shellRouteFromLocation({ pathname: "/settings", search: "?section=runtime" }),
    ).toEqual({
      view: "settings",
      activeKey: null,
      settingsSection: "runtime",
    });

    expect(
      shellRouteFromLocation({ pathname: "/settings/", search: "" }),
    ).toEqual({
      view: "settings",
      activeKey: null,
      settingsSection: "overview",
    });
  });

  it("keeps utility hubs on top-level paths", () => {
    expect(
      shellRouteToLocation({
        view: "skills",
        activeKey: null,
        settingsSection: "overview",
      }),
    ).toEqual({ pathname: "/skills", search: "" });

    expect(
      shellRouteFromLocation({ pathname: "/settings/skills", search: "" }),
    ).toEqual({
      view: "skills",
      activeKey: null,
      settingsSection: "overview",
    });
  });
});
