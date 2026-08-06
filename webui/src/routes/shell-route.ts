import type { SettingsSectionKey } from "@/pages/settings";
import { isEnabledSettingsSection } from "@/lib/configs/ui-entry";

export type ShellView =
  | "chat"
  | "settings"
  | "automations"
  | "skills"
  | "channels"
  | "download";

/** Sidebar utility hubs (standalone top-level routes; not settings sections). */
export type SidebarUtilityKey = Extract<
  ShellView,
  "automations" | "skills" | "channels"
>;

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
  "runtime",
  "advanced",
];

function isSettingsSectionKey(value: string | null): value is SettingsSectionKey {
  return SETTINGS_SECTION_KEYS.includes(value as SettingsSectionKey);
}

export function defaultShellRoute(): ShellRoute {
  return { view: "chat", activeKey: null, settingsSection: "overview" };
}

export function shellViewForSettingsSection(_section: SettingsSectionKey): ShellView {
  void _section;
  return "settings";
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/new";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

const STANDALONE_UTILITY_PATHS = new Set(["automations", "skills", "channels"]);

export function shellRouteFromLocation(location: ShellLocation): ShellRoute {
  const pathname = normalizePathname(location.pathname).replace(/\/+$/, "") || "/new";
  const params = new URLSearchParams(
    location.search.startsWith("?") ? location.search.slice(1) : location.search,
  );
  const legacySection = params.get("section");
  const activeKey = params.get("chat")?.trim() || null;

  const settingsPathMatch = pathname.match(/^\/settings(?:\/([^/]+))?$/);
  if (settingsPathMatch) {
    const pathSection = settingsPathMatch[1] ?? null;
    const rawSection = pathSection ?? legacySection;
    // Legacy bookmarks: /settings/skills → /skills (no longer settings sections).
    if (rawSection && STANDALONE_UTILITY_PATHS.has(rawSection)) {
      return {
        view: rawSection as "automations" | "skills" | "channels",
        activeKey,
        settingsSection: "overview",
      };
    }
    const parsedSection = isSettingsSectionKey(rawSection) ? rawSection : "overview";
    const settingsSection = isEnabledSettingsSection(parsedSection)
      ? parsedSection
      : "overview";
    return {
      view: "settings",
      activeKey,
      settingsSection,
    };
  }
  if (pathname === "/automations") {
    return { view: "automations", activeKey, settingsSection: "overview" };
  }
  if (pathname === "/skills") {
    return { view: "skills", activeKey, settingsSection: "overview" };
  }
  if (pathname === "/channels") {
    return { view: "channels", activeKey, settingsSection: "overview" };
  }
  if (pathname === "/download") {
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
  const query = params.toString();
  const search = query ? `?${query}` : "";

  // Utility hubs keep top-level paths; settings sections are nested pages.
  if (
    route.view === "automations" ||
    route.view === "skills" ||
    route.view === "channels"
  ) {
    return { pathname: `/${route.view}`, search };
  }

  return {
    pathname: `/settings/${route.settingsSection}`,
    search,
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
