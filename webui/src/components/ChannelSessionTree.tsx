import { cn } from "@/lib/utils";
import type { ChatSummary } from "@/lib/types";
import {
  groupImSessions,
  imSessionLabel,
  type ImPlatform,
} from "@/lib/im-sessions";

const PLATFORM_META: Record<
  ImPlatform,
  { title: string; logo: string; empty: string }
> = {
  feishu: {
    title: "飞书",
    logo: "/brand/feishu.svg",
    empty: "暂无飞书会话",
  },
  weixin: {
    title: "微信",
    logo: "/brand/wechat.svg",
    empty: "暂无微信会话",
  },
};

interface ChannelSessionTreeProps {
  sessions: ChatSummary[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  runningChatIds?: string[];
  updatedChatIds?: string[];
}

export function ChannelSessionTree({
  sessions,
  activeKey,
  onSelect,
  runningChatIds = [],
  updatedChatIds = [],
}: ChannelSessionTreeProps) {
  const grouped = groupImSessions(sessions);
  const platforms = (Object.keys(PLATFORM_META) as ImPlatform[]).filter(
    (platform) => grouped[platform].length > 0,
  );

  if (platforms.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        暂无频道会话。在 IM 频道配置飞书或微信后，对话会出现在这里。
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
            <div className="flex items-center gap-2 px-1.5 py-1 text-sm font-medium text-sidebar-foreground">
              <img
                src={meta.logo}
                alt=""
                className="h-5 w-5 shrink-0 object-contain"
                draggable={false}
              />
              <span>{meta.title}</span>
            </div>
            <div className="relative ml-[0.85rem] border-l border-sidebar-border/70 pl-3">
              {rows.map((session) => {
                const active = session.key === activeKey;
                const running = runningChatIds.includes(session.chatId);
                const updated = updatedChatIds.includes(session.chatId);
                const label = imSessionLabel(session, platform);
                return (
                  <button
                    key={session.key}
                    type="button"
                    onClick={() => onSelect(session.key)}
                    className={cn(
                      "mb-1 flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
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
                    {running ? (
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    ) : updated ? (
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
