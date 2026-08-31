import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  Brain,
  CalendarClock,
  ExternalLink,
  Library,
  MessageSquare,
  Search,
  SquarePen,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ChannelSessionTree } from "./ChannelSessionTree";
import { ChatList } from "./ChatList";
import { SidebarAccountFooter } from "./SidebarAccountFooter";
import { SidebarBrandHeader } from "./SidebarBrandHeader";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { SIDEBAR_ICON, SIDEBAR_ROW, SIDEBAR_ROW_ACTIVE, SIDEBAR_TYPE } from "./sidebarChrome";

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
  accountDisplayName?: string | null;
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
  const newChatShortcut = newChatShortcutLabel();
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
        "flex h-full w-full min-w-0 flex-col",
        SIDEBAR_TYPE,
        props.hostChromeInset ? "bg-transparent" : "bg-sidebar",
        !props.hostChromeInset && "border-r border-sidebar-border/50",
      )}
    >
      <TooltipProvider delayDuration={180} skipDelayDuration={80}>
        <SidebarBrandHeader
          collapsed={collapsed}
          hostChromeInset={props.hostChromeInset}
          onCollapse={props.onCollapse}
          onExpand={props.onExpand}
        />

        <div
          className={cn(
            "space-y-1.5 px-2 pb-1",
            collapsed && "flex w-14 flex-col items-center px-0",
          )}
        >
          <SidebarActionButton
            collapsed={collapsed}
            label={t("sidebar.newChat")}
            onClick={props.onNewChat}
            icon={<SquarePen className={SIDEBAR_ICON} />}
            shortcut={newChatShortcut}
            ariaKeyShortcuts="Meta+Shift+O Control+Shift+O"
            disabled={!collapsed && sessionTab === "channels"}
            disabledHint={t("sidebar.newChatChannelsHint")}
          />
          {!props.hostChromeInset ? (
            <SidebarActionButton
              collapsed={collapsed}
              label={t("sidebar.searchAria")}
              onClick={props.onOpenSearch}
              icon={<Search className={SIDEBAR_ICON} />}
            />
          ) : null}
          {UI_ENTRY.channels ? (
            <SidebarActionButton
              collapsed={collapsed}
              label={t("sidebar.channels", { defaultValue: "IM channels" })}
              onClick={() => props.onOpenUtility("channels")}
              active={props.activeUtility === "channels"}
              icon={<MessageSquare className={SIDEBAR_ICON} />}
            />
          ) : null}
          {UI_ENTRY.automations ? (
            <SidebarActionButton
              collapsed={collapsed}
              label={t("sidebar.automations", { defaultValue: "Scheduled tasks" })}
              onClick={() => props.onOpenUtility("automations")}
              active={props.activeUtility === "automations"}
              icon={<CalendarClock className={SIDEBAR_ICON} />}
            />
          ) : null}
          {UI_ENTRY.skills ? (
            <SidebarActionButton
              collapsed={collapsed}
              label={t("sidebar.skills.title")}
              onClick={() => props.onOpenUtility("skills")}
              active={props.activeUtility === "skills"}
              icon={<Brain className={SIDEBAR_ICON} />}
            />
          ) : null}
          {UI_ENTRY.knowledge ? (
            <SidebarExternalLink
              collapsed={collapsed}
              label={t("sidebar.portalKnowledge")}
              href={PORTAL.knowledge}
              icon={<Library className={SIDEBAR_ICON} />}
            />
          ) : null}
          {props.archivedCount ? (
            <SidebarActionButton
              collapsed={collapsed}
              label={props.showArchived ? t("chat.hideArchived") : t("chat.showArchived")}
              onClick={props.onToggleArchived}
              icon={<Archive className={SIDEBAR_ICON} />}
            />
          ) : null}
        </div>

        <div
          className={cn(
            "mt-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-opacity duration-200",
            collapsed && "pointer-events-none opacity-0",
          )}
        >
          {!collapsed && (
            <>
              <div
                role="tablist"
                aria-label={t("sidebar.recent")}
                className="mx-2 mb-2 flex shrink-0 gap-0.5 rounded-xl bg-sidebar-accent/55 p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={sessionTab === "chats"}
                  onClick={() => setSessionTab("chats")}
                  className={cn(
                    "min-w-0 flex-1 rounded-[10px] px-2.5 py-1.5 text-[14px] leading-[22px] transition-colors",
                    sessionTab === "chats"
                      ? "bg-background font-medium text-sidebar-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)] dark:bg-sidebar-accent dark:shadow-none"
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
                    "min-w-0 flex-1 rounded-[10px] px-2.5 py-1.5 text-[14px] leading-[22px] transition-colors",
                    sessionTab === "channels"
                      ? "bg-background font-medium text-sidebar-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)] dark:bg-sidebar-accent dark:shadow-none"
                      : "font-normal text-muted-foreground hover:text-sidebar-foreground",
                  )}
                >
                  {t("sidebar.tabChannels", { defaultValue: "Channels" })}
                </button>
              </div>
              {sessionTab === "chats" ? (
                <ChatList
                  sessions={webChatSessions}
                  activeKey={props.activeUtility ? null : props.activeKey}
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
                  activeKey={props.activeUtility ? null : props.activeKey}
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

        <SidebarAccountFooter
          collapsed={collapsed}
          displayName={props.accountDisplayName}
          onOpenSettings={props.onOpenSettings}
        />
      </TooltipProvider>
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
  const link = (
    <a
      href={href}
      target={newTab || !href.startsWith("/") ? "_blank" : undefined}
      rel={newTab || !href.startsWith("/") ? "noopener noreferrer" : undefined}
      aria-label={label}
      className={cn(
        SIDEBAR_ROW,
        SIDEBAR_TYPE,
        "group",
        collapsed
          ? "w-9 justify-center gap-0 px-0"
          : "w-full justify-start",
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
        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-35" aria-hidden />
      )}
    </a>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" align="center" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
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
  const tooltipLabel = disabled
    ? disabledHint || label
    : shortcut
      ? `${label} (${shortcut})`
      : label;

  const button = (
    <Button
      type="button"
      variant="ghost"
      aria-label={label}
      title={tooltipLabel}
      aria-current={active ? "page" : undefined}
      aria-keyshortcuts={disabled ? undefined : ariaKeyShortcuts}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      className={cn(
        SIDEBAR_ROW,
        SIDEBAR_TYPE,
        "group shadow-none",
        collapsed
          ? "w-9 justify-center gap-0 px-0"
          : "w-full justify-start",
        active && SIDEBAR_ROW_ACTIVE,
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-sidebar-foreground/90",
        className,
      )}
    >
      <span className="flex shrink-0 items-center justify-center" aria-hidden>
        {icon}
      </span>
      <span
        className={cn(
          "min-w-0 overflow-hidden truncate whitespace-nowrap transition-[max-width,opacity] duration-200",
          collapsed
            ? "max-w-0 opacity-0"
            : "max-w-[12rem] opacity-100",
        )}
      >
        {label}
      </span>
    </Button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="center" sideOffset={10}>
        {tooltipLabel}
      </TooltipContent>
    </Tooltip>
  );
}
