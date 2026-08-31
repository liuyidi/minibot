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
        activeKey: "websocket:abc",
        settingsSection: "overview",
      }),
    ).toEqual({ pathname: "/skills", search: "" });

    expect(
      shellRouteToLocation({
        view: "experts",
        activeKey: null,
        settingsSection: "overview",
      }),
    ).toEqual({ pathname: "/experts", search: "" });

    expect(
      shellRouteToLocation({
        view: "connectors",
        activeKey: "websocket:abc",
        settingsSection: "overview",
      }),
    ).toEqual({ pathname: "/connectors", search: "" });

    expect(
      shellRouteToLocation({
        view: "channels",
        activeKey: "websocket:abc",
        settingsSection: "overview",
      }),
    ).toEqual({ pathname: "/channels", search: "" });

    expect(
      shellRouteToLocation({
        view: "automations",
        activeKey: "websocket:abc",
        settingsSection: "overview",
      }),
    ).toEqual({ pathname: "/automations", search: "" });

    expect(
      shellRouteFromLocation({ pathname: "/settings/skills", search: "" }),
    ).toEqual({
      view: "skills",
      activeKey: null,
      settingsSection: "overview",
    });

    expect(
      shellRouteFromLocation({ pathname: "/experts", search: "" }),
    ).toEqual({
      view: "experts",
      activeKey: null,
      settingsSection: "overview",
    });

    expect(
      shellRouteFromLocation({ pathname: "/connectors", search: "" }),
    ).toEqual({
      view: "connectors",
      activeKey: null,
      settingsSection: "overview",
    });
  });
});
