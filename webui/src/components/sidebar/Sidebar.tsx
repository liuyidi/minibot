import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  Brain,
  CalendarClock,
  Download,
  ExternalLink,
  FlaskConical,
  Home,
  Library,
  Menu,
  MessageSquare,
  Search,
  Settings,
  SquarePen,
  Activity,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ChannelSessionTree } from "./ChannelSessionTree";
import { ChatList } from "./ChatList";
import { ConnectionBadge } from "./ConnectionBadge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { isImSession, isWebChatSession } from "@/lib/utils/im-sessions";
import { PORTAL } from "@/lib/configs/portal";
import { UI_ENTRY } from "@/lib/configs/ui-entry";
import type {
  ChatSummary,
  SidebarViewState,
} from "@/lib/types";
import type { SettingsSectionKey } from "@/pages/settings";
import type { SidebarUtilityKey } from "@/routes";
import { cn } from "@/lib/utils";

type SessionListTab = "chats" | "channels";

interface SidebarProps {
  sessions: ChatSummary[];
  activeKey: string | null;
  loading: boolean;
  onNewChat: () => void;
  onSelect: (key: string) => void;
  onRequestDelete: (key: string, label: string) => void;
  onTogglePin: (key: string) => void;
  onRequestRename: (key: string, label: string) => void;
  onToggleArchive: (key: string) => void;
  onToggleGroup: (groupId: string) => void;
  onRequestRenameProject: (projectKey: string, label: string) => void;
  onNewChatInProject: (projectPath: string, projectName: string) => void;
  onOpenSettings: (section?: SettingsSectionKey) => void;
  onOpenUtility: (utility: SidebarUtilityKey) => void;
  onOpenSearch: () => void;
  activeUtility?: SidebarUtilityKey | null;
  onToggleArchived: () => void;
  onCollapse: () => void;
  onExpand?: () => void;
  containActionMenus?: boolean;
  collapsed?: boolean;
  pinnedKeys?: string[];
  archivedKeys?: string[];
  titleOverrides?: Record<string, string>;
  projectNameOverrides?: Record<string, string>;
  collapsedGroups?: Record<string, boolean>;
  runningChatIds?: string[];
  updatedChatIds?: string[];
  viewState?: SidebarViewState;
  showArchived?: boolean;
  archivedCount?: number;
  defaultWorkspacePath?: string | null;
  hostChromeInset?: boolean;
}

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { platform?: string };
};

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  const userAgentPlatform =
    (navigator as NavigatorWithUserAgentData).userAgentData?.platform || "";
  return /mac|iphone|ipad|ipod/i.test(`${platform} ${userAgentPlatform}`);
}

function newChatShortcutLabel(): string {
  return isApplePlatform() ? "⌘⇧O" : "Ctrl+Shift+O";
}

export function Sidebar(props: SidebarProps) {
  const { t } = useTranslation();
  const [menuPortalContainer, setMenuPortalContainer] =
    useState<HTMLElement | null>(null);
  const [sessionTab, setSessionTab] = useState<SessionListTab>("chats");
  const collapsed = Boolean(props.collapsed);
  const toggleLabel = t("thread.header.toggleSidebar");
  const newChatShortcut = newChatShortcutLabel();
  const downloadAppLabel = t("sidebar.downloadApp");
  const webChatSessions = useMemo(
    () => props.sessions.filter(isWebChatSession),
    [props.sessions],
  );
  const channelSessions = useMemo(
    () => props.sessions.filter(isImSession),
    [props.sessions],
  );

  useEffect(() => {
    if (!props.activeKey) return;
    const active = props.sessions.find((session) => session.key === props.activeKey);
    if (!active) return;
    setSessionTab(isImSession(active) ? "channels" : "chats");
  }, [props.activeKey, props.sessions]);

  return (
    <nav
      ref={props.containActionMenus ? setMenuPortalContainer : undefined}
      aria-label={t("sidebar.navigation")}
      className={cn(
        "flex h-full w-full min-w-0 flex-col text-sidebar-foreground",
        props.hostChromeInset ? "bg-transparent" : "bg-sidebar",
        !props.hostChromeInset && "border-r border-sidebar-border/60",
      )}
    >
      <div
        className={cn(
          "flex items-center px-3 pb-2.5",
          props.hostChromeInset ? "pt-[3.75rem]" : "pt-3",
          collapsed ? "w-14 justify-start" : "justify-between",
        )}
      >
        <button
          type="button"
          aria-label={collapsed ? toggleLabel : t("app.brand")}
          aria-hidden={collapsed ? undefined : true}
          title={collapsed ? toggleLabel : t("app.brand")}
          onClick={collapsed ? props.onExpand : undefined}
          tabIndex={collapsed ? 0 : -1}
          className={cn(
            "flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-colors",
            collapsed
              ? "-ml-0.5 w-9 hover:bg-sidebar-accent/75"
              : "pointer-events-none -ml-0.5 gap-2 px-1",
          )}
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-foreground/90 text-[13px] font-semibold tracking-tight text-sidebar"
            aria-hidden
          >
            M
          </span>
          {!collapsed ? (
            <span className="max-w-[7rem] truncate text-[13px] font-semibold tracking-tight text-sidebar-foreground">
              {t("app.brand")}
            </span>
          ) : null}
        </button>
        {!collapsed && !props.hostChromeInset && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("sidebar.collapse")}
            onClick={props.onCollapse}
            className="h-7 w-7 rounded-lg text-muted-foreground/85 hover:bg-sidebar-accent/75 hover:text-sidebar-foreground"
          >
            <Menu className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div
        className={cn(
          "space-y-1.5 px-2 pb-2",
          collapsed && "flex w-14 flex-col items-center px-0",
        )}
      >
        <SidebarActionButton
          collapsed={collapsed}
          label={t("sidebar.newChat")}
          onClick={props.onNewChat}
          icon={<SquarePen className="h-4 w-4" />}
          shortcut={newChatShortcut}
          ariaKeyShortcuts="Meta+Shift+O Control+Shift+O"
          disabled={!collapsed && sessionTab === "channels"}
          disabledHint={t("sidebar.newChatChannelsHint")}
        />
        <SidebarActionButton
          collapsed={collapsed}
          label={t("sidebar.searchAria")}
          onClick={props.onOpenSearch}
          icon={<Search className="h-4 w-4" />}
        />
        {UI_ENTRY.channels ? (
          <SidebarActionButton
            collapsed={collapsed}
            label={t("sidebar.channels", { defaultValue: "IM channels" })}
            onClick={() => props.onOpenUtility("channels")}
            active={props.activeUtility === "channels"}
            icon={<MessageSquare className="h-4 w-4" />}
          />
        ) : null}
        {UI_ENTRY.automations ? (
          <SidebarActionButton
            collapsed={collapsed}
            label={t("sidebar.automations", { defaultValue: "Scheduled tasks" })}
            onClick={() => props.onOpenUtility("automations")}
            active={props.activeUtility === "automations"}
            icon={<CalendarClock className="h-4 w-4" />}
          />
        ) : null}
        {UI_ENTRY.skills ? (
          <SidebarActionButton
            collapsed={collapsed}
            label={t("sidebar.skills.title")}
            onClick={() => props.onOpenUtility("skills")}
            active={props.activeUtility === "skills"}
            icon={<Brain className="h-4 w-4" />}
          />
        ) : null}
        {UI_ENTRY.knowledge ? (
          <SidebarExternalLink
            collapsed={collapsed}
            label={t("sidebar.portalKnowledge")}
            href={PORTAL.knowledge}
            icon={<Library className="h-4 w-4" />}
          />
        ) : null}
        {props.archivedCount ? (
          <SidebarActionButton
            collapsed={collapsed}
            label={props.showArchived ? t("chat.hideArchived") : t("chat.showArchived")}
            onClick={props.onToggleArchived}
            icon={<Archive className="h-4 w-4" />}
          />
        ) : null}
      </div>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-opacity duration-200",
          collapsed && "pointer-events-none opacity-0",
        )}
      >
        {!collapsed && (
          <>
            <div
              role="tablist"
              aria-label={t("sidebar.recent")}
              className="mx-2 mb-1 flex shrink-0 items-end gap-4 border-b border-sidebar-border/50 px-3"
            >
              <button
                type="button"
                role="tab"
                aria-selected={sessionTab === "chats"}
                onClick={() => setSessionTab("chats")}
                className={cn(
                  "relative -mb-px pb-2 text-[13px] transition-colors",
                  sessionTab === "chats"
                    ? "font-semibold text-sidebar-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sidebar-foreground"
                    : "font-normal text-muted-foreground hover:text-sidebar-foreground",
                )}
              >
                {t("sidebar.tabChats", { defaultValue: "Chats" })}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sessionTab === "channels"}
                onClick={() => setSessionTab("channels")}
                className={cn(
                  "relative -mb-px pb-2 text-[13px] transition-colors",
                  sessionTab === "channels"
                    ? "font-semibold text-sidebar-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sidebar-foreground"
                    : "font-normal text-muted-foreground hover:text-sidebar-foreground",
                )}
              >
                {t("sidebar.tabChannels", { defaultValue: "Channels" })}
              </button>
            </div>
            {sessionTab === "chats" ? (
              <ChatList
                sessions={webChatSessions}
                activeKey={props.activeKey}
                loading={props.loading}
                emptyLabel={t("chat.noSessions")}
                onSelect={props.onSelect}
                onRequestDelete={props.onRequestDelete}
                onTogglePin={props.onTogglePin}
                onRequestRename={props.onRequestRename}
                onToggleArchive={props.onToggleArchive}
                onToggleGroup={props.onToggleGroup}
                onRequestRenameProject={props.onRequestRenameProject}
                onNewChatInProject={props.onNewChatInProject}
                pinnedKeys={props.pinnedKeys}
                archivedKeys={props.archivedKeys}
                titleOverrides={props.titleOverrides}
                projectNameOverrides={props.projectNameOverrides}
                collapsedGroups={props.collapsedGroups}
                runningChatIds={props.runningChatIds}
                updatedChatIds={props.updatedChatIds}
                density={props.viewState?.density}
                showPreviews={props.viewState?.show_previews}
                showTimestamps={props.viewState?.show_timestamps}
                sort={props.viewState?.sort}
                showArchived={props.showArchived}
                defaultWorkspacePath={props.defaultWorkspacePath}
                actionMenuPortalContainer={
                  props.containActionMenus ? menuPortalContainer : undefined
                }
              />
            ) : (
              <ChannelSessionTree
                sessions={channelSessions}
                activeKey={props.activeKey}
                onSelect={props.onSelect}
                onTogglePin={props.onTogglePin}
                onRequestRename={props.onRequestRename}
                onToggleArchive={props.onToggleArchive}
                pinnedKeys={props.pinnedKeys}
                archivedKeys={props.archivedKeys}
                titleOverrides={props.titleOverrides}
                showArchived={props.showArchived}
                runningChatIds={props.runningChatIds}
                updatedChatIds={props.updatedChatIds}
                actionMenuPortalContainer={
                  props.containActionMenus ? menuPortalContainer : undefined
                }
              />
            )}
          </>
        )}
      </div>
      <Separator className="bg-sidebar-border/50" />
      <div
        className={cn(
          "flex flex-col gap-1 px-2.5 py-2 text-xs",
          collapsed && "w-14 items-center px-0",
        )}
      >
        <SidebarExternalLink
          collapsed={collapsed}
          label={downloadAppLabel}
          href="/#/download/"
          icon={<Download className="h-4 w-4" />}
          newTab
        />
        <SidebarExternalLink
          collapsed={collapsed}
          label={t("sidebar.portalHome")}
          href={PORTAL.home}
          icon={<Home className="h-4 w-4" />}
        />
        <SidebarExternalLink
          collapsed={collapsed}
          label={t("sidebar.portalLangfuse")}
          href={PORTAL.langfuse}
          icon={<Activity className="h-4 w-4" />}
        />
        <SidebarExternalLink
          collapsed={collapsed}
          label={t("sidebar.portalDevui")}
          href={PORTAL.devui}
          icon={<FlaskConical className="h-4 w-4" />}
        />
      </div>
      <Separator className="bg-sidebar-border/50" />
      <div
        className={cn(
          "flex items-center gap-1 px-2.5 py-2.5 text-xs",
          collapsed && "w-14 flex-col px-0",
        )}
      >
        {UI_ENTRY.settings ? (
          <SidebarActionButton
            collapsed={collapsed}
            label={t("sidebar.settings")}
            onClick={props.onOpenSettings}
            className={collapsed ? undefined : "flex-1"}
            icon={<Settings className="h-4 w-4" />}
          />
        ) : null}
        <ConnectionBadge />
      </div>
    </nav>
  );
}

function SidebarExternalLink({
  collapsed,
  label,
  href,
  icon,
  newTab = false,
}: {
  collapsed: boolean;
  label: string;
  href: string;
  icon: ReactNode;
  newTab?: boolean;
}) {
  return (
    <a
      href={href}
      target={newTab || !href.startsWith("/") ? "_blank" : undefined}
      rel={newTab || !href.startsWith("/") ? "noopener noreferrer" : undefined}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={cn(
        "group flex h-8 min-w-0 items-center gap-2 overflow-hidden rounded-full font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent/75 hover:text-sidebar-foreground",
        "transition-[width,padding,border-radius,color,background-color] duration-300 ease-out",
        collapsed
          ? "w-9 justify-center gap-0 rounded-xl px-0"
          : "w-full justify-start gap-2 px-3 text-[12.5px]",
      )}
    >
      <span className="flex shrink-0 items-center justify-center" aria-hidden>
        {icon}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 overflow-hidden truncate whitespace-nowrap transition-[max-width,opacity] duration-200",
          collapsed ? "max-w-0 opacity-0" : "max-w-[12rem] opacity-100",
        )}
      >
        {label}
      </span>
      {!collapsed && (
        <ExternalLink className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
      )}
    </a>
  );
}

function SidebarActionButton({
  collapsed,
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
  disabledHint,
  className,
  shortcut,
  ariaKeyShortcuts,
}: {
  collapsed: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  className?: string;
  shortcut?: string;
  ariaKeyShortcuts?: string;
}) {
  const title = disabled
    ? disabledHint || label
    : shortcut
      ? `${label} (${shortcut})`
      : collapsed
        ? label
        : undefined;

  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-keyshortcuts={disabled ? undefined : ariaKeyShortcuts}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      className={cn(
        "group h-8 min-w-0 gap-2 overflow-hidden rounded-full font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent/75 hover:text-sidebar-foreground",
        "transition-[width,padding,border-radius,color,background-color] duration-300 ease-out",
        collapsed
          ? "w-9 justify-center gap-0 rounded-xl px-0"
          : "w-full justify-start gap-2 px-3 text-[12.5px]",
        active && "bg-sidebar-accent text-sidebar-foreground shadow-[inset_0_0_0_1px_hsl(var(--sidebar-border)/0.55)]",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-sidebar-foreground/85",
        className,
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center transition-transform duration-300 ease-out",
          collapsed ? "translate-x-0" : "translate-x-0",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span
        className={cn(
          "min-w-0 overflow-hidden truncate whitespace-nowrap transition-[max-width,opacity,transform] duration-200 ease-out",
          collapsed
            ? "max-w-0 -translate-x-1 opacity-0"
            : "max-w-[12rem] translate-x-0 opacity-100",
        )}
      >
        {label}
      </span>
    </Button>
  );
}
