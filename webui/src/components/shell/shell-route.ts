import type { SettingsSectionKey } from "@/components/settings/SettingsView";
import { isEnabledSettingsSection } from "@/lib/configs/ui-entry";

export type ShellView =
  | "chat"
  | "settings"
  | "apps"
  | "automations"
  | "skills"
  | "channels"
  | "download";

export type ShellRoute = {
  view: ShellView;
  activeKey: string | null;
  settingsSection: SettingsSectionKey;
};

export type ShellLocation = {
  pathname: string;
  search: string;
};

const SETTINGS_SECTION_KEYS: SettingsSectionKey[] = [
  "overview",
  "appearance",
  "models",
  "image",
  "voice",
  "browser",
  "apps",
  "automations",
  "skills",
  "channels",
  "runtime",
  "advanced",
];

function isSettingsSectionKey(value: string | null): value is SettingsSectionKey {
  return SETTINGS_SECTION_KEYS.includes(value as SettingsSectionKey);
}

export function defaultShellRoute(): ShellRoute {
  return { view: "chat", activeKey: null, settingsSection: "overview" };
}

export function shellViewForSettingsSection(section: SettingsSectionKey): ShellView {
  if (
    section === "apps" ||
    section === "automations" ||
    section === "skills" ||
    section === "channels"
  ) {
    return section;
  }
  return "settings";
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/new";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function shellRouteFromLocation(location: ShellLocation): ShellRoute {
  const pathname = normalizePathname(location.pathname);
  const params = new URLSearchParams(
    location.search.startsWith("?") ? location.search.slice(1) : location.search,
  );
  const rawSettingsSection = params.get("section");
  const parsedSection = isSettingsSectionKey(rawSettingsSection)
    ? rawSettingsSection
    : "overview";
  const activeKey = params.get("chat")?.trim() || null;

  if (pathname === "/settings") {
    const settingsSection =
      shellViewForSettingsSection(parsedSection) === "settings" &&
      !isEnabledSettingsSection(parsedSection)
        ? "overview"
        : parsedSection;
    return {
      view: shellViewForSettingsSection(settingsSection),
      activeKey,
      settingsSection,
    };
  }
  if (pathname === "/apps") {
    return { view: "apps", activeKey, settingsSection: "apps" };
  }
  if (pathname === "/automations") {
    return { view: "automations", activeKey, settingsSection: "automations" };
  }
  if (pathname === "/skills") {
    return { view: "skills", activeKey, settingsSection: "skills" };
  }
  if (pathname === "/channels") {
    return { view: "channels", activeKey, settingsSection: "channels" };
  }
  if (pathname === "/download" || pathname === "/download/") {
    return { view: "download", activeKey: null, settingsSection: "overview" };
  }
  if (pathname.startsWith("/chat/")) {
    const encoded = pathname.slice("/chat/".length);
    try {
      const key = decodeURIComponent(encoded).trim();
      return key
        ? { view: "chat", activeKey: key, settingsSection: "overview" }
        : defaultShellRoute();
    } catch {
      return defaultShellRoute();
    }
  }
  if (pathname === "/new") {
    return defaultShellRoute();
  }
  return defaultShellRoute();
}

/** Path + search for HashRouter `navigate` (no leading `#`). */
export function shellRouteToLocation(route: ShellRoute): ShellLocation {
  if (route.view === "download") {
    return { pathname: "/download/", search: "" };
  }
  if (route.view === "chat") {
    return {
      pathname: route.activeKey
        ? `/chat/${encodeURIComponent(route.activeKey)}`
        : "/new",
      search: "",
    };
  }
  const params = new URLSearchParams();
  if (route.activeKey) params.set("chat", route.activeKey);
  if (route.view === "settings" && route.settingsSection !== "overview") {
    params.set("section", route.settingsSection);
  }
  const query = params.toString();
  return {
    pathname: `/${route.view}`,
    search: query ? `?${query}` : "",
  };
}

export function shellRouteHash(route: ShellRoute): string {
  const { pathname, search } = shellRouteToLocation(route);
  return `#${pathname}${search}`;
}

/** Read route from `window.location.hash` (tests / non-Router callers). */
export function readShellRoute(): ShellRoute {
  if (typeof window === "undefined") return defaultShellRoute();
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!hash || hash === "/" || hash === "/new") return defaultShellRoute();

  const [path, query = ""] = hash.split("?", 2);
  return shellRouteFromLocation({
    pathname: path || "/new",
    search: query ? `?${query}` : "",
  });
}

export function writeShellRoute(route: ShellRoute, replace = false): void {
  if (typeof window === "undefined") return;
  const nextHash = shellRouteHash(route);
  if (window.location.hash === nextHash) return;
  if (replace) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${nextHash}`,
    );
    return;
  }
  window.location.hash = nextHash;
}
