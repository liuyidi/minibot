import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SIDEBAR_ROW, SIDEBAR_ROW_ACTIVE, SIDEBAR_TYPE } from "./sidebarChrome";
import { cn } from "@/lib/utils";
import type { ChatSummary } from "@/lib/types";
import {
  groupImSessions,
  imSessionLabel,
  type ImPlatform,
} from "@/lib/utils/im-sessions";

const ACTION_MENU_CONTENT_CLASS = "w-[8.5rem] min-w-[8.5rem]";
const ACTION_MENU_ITEM_CLASS = "grid w-[7.75rem] grid-cols-[1rem_minmax(0,1fr)] items-center gap-2";

const PLATFORM_META: Record<
  ImPlatform,
  { titleKey: string; logo: string; emptyKey: string }
> = {
  feishu: {
    titleKey: "settings.automations.channels.feishu",
    logo: "/brand/feishu.svg",
    emptyKey: "imSessions.emptyFeishu",
  },
  weixin: {
    titleKey: "settings.automations.channels.weixin",
    logo: "/brand/wechat.svg",
    emptyKey: "imSessions.emptyWeixin",
  },
};

interface ChannelSessionTreeProps {
  sessions: ChatSummary[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onTogglePin: (key: string) => void;
  onRequestRename: (key: string, label: string) => void;
  onToggleArchive: (key: string) => void;
  pinnedKeys?: string[];
  archivedKeys?: string[];
  titleOverrides?: Record<string, string>;
  showArchived?: boolean;
  runningChatIds?: string[];
  updatedChatIds?: string[];
  actionMenuPortalContainer?: HTMLElement | null;
}

export function ChannelSessionTree({
  sessions,
  activeKey,
  onSelect,
  onTogglePin,
  onRequestRename,
  onToggleArchive,
  pinnedKeys = [],
  archivedKeys = [],
  titleOverrides = {},
  showArchived = false,
  runningChatIds = [],
  updatedChatIds = [],
  actionMenuPortalContainer,
}: ChannelSessionTreeProps) {
  const { t } = useTranslation();
  const pinned = new Set(pinnedKeys);
  const archived = new Set(archivedKeys);
  const grouped = groupImSessions(sessions, {
    pinnedKeys,
    archivedKeys,
    showArchived,
  });
  const platforms = (Object.keys(PLATFORM_META) as ImPlatform[]).filter(
    (platform) => grouped[platform].length > 0,
  );

  if (platforms.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[12.5px] leading-[22px] text-muted-foreground/65">
        {t("imSessions.emptyAll")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2.5 py-2">
      {platforms.map((platform) => {
        const meta = PLATFORM_META[platform];
        const rows = grouped[platform];
        return (
          <div key={platform} className="min-w-0">
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] font-normal leading-[22px] text-muted-foreground/45">
              <img
                src={meta.logo}
                alt=""
                className="h-4 w-4 shrink-0 object-contain opacity-80"
                draggable={false}
              />
              <span>{t(meta.titleKey)}</span>
            </div>
            <div className="space-y-0.5 pl-1">
              {rows.map((session) => {
                const active = session.key === activeKey;
                const running = runningChatIds.includes(session.chatId);
                const updated = updatedChatIds.includes(session.chatId);
                const label = imSessionLabel(session, platform, t, titleOverrides);
                const isPinned = pinned.has(session.key);
                const isArchived = archived.has(session.key);
                return (
                  <div
                    key={session.key}
                    className={cn(
                      SIDEBAR_ROW,
                      SIDEBAR_TYPE,
                      "group mb-0 max-w-full pr-1",
                      active && SIDEBAR_ROW_ACTIVE,
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(session.key)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {platform === "feishu" ? (
                        <span
                          className={cn(
                            "truncate rounded-md px-2 py-0.5 font-mono",
                            active ? "bg-background/70" : "bg-muted/70",
                          )}
                          title={label}
                        >
                          {label}
                        </span>
                      ) : (
                        <span className="truncate" title={label}>
                          {label}
                        </span>
                      )}
                      {isPinned ? (
                        <Pin className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                      ) : null}
                      {running ? (
                        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      ) : updated ? (
                        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      ) : null}
                    </button>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger
                        className={cn(
                          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/75 opacity-40 transition-opacity",
                          "hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover:opacity-100",
                          "focus-visible:opacity-100",
                          active && "opacity-100",
                        )}
                        aria-label={t("chat.actions", { title: label })}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className={ACTION_MENU_CONTENT_CLASS}
                        portalContainer={actionMenuPortalContainer}
                        onCloseAutoFocus={(event) => event.preventDefault()}
                      >
                        <DropdownMenuItem
                          onSelect={() => onTogglePin(session.key)}
                          className={ACTION_MENU_ITEM_CLASS}
                        >
                          {isPinned ? (
                            <PinOff className="h-4 w-4 shrink-0" />
                          ) : (
                            <Pin className="h-4 w-4 shrink-0" />
                          )}
                          {isPinned ? t("chat.unpin") : t("chat.pin")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => onRequestRename(session.key, label)}
                          className={ACTION_MENU_ITEM_CLASS}
                        >
                          <Pencil className="h-4 w-4 shrink-0" />
                          {t("chat.rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => onToggleArchive(session.key)}
                          className={ACTION_MENU_ITEM_CLASS}
                        >
                          {isArchived ? (
                            <ArchiveRestore className="h-4 w-4 shrink-0" />
                          ) : (
                            <Archive className="h-4 w-4 shrink-0" />
                          )}
                          {isArchived ? t("chat.unarchive") : t("chat.archive")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
