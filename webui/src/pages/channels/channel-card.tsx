import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChannelKind, FeishuStatus, WeixinStatus } from "@/lib/apis/channels";
import { cn } from "@/lib/utils";

export function FeishuLogo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/feishu.svg"
      alt=""
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}

export function WeChatLogo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/wechat.svg"
      alt=""
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}

function ChannelSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[2px]",
        "transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "bg-emerald-500 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.035)]"
          : "bg-muted shadow-[inset_0_0_0_1px_rgba(0,0,0,0.035)] hover:bg-muted/80",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-[18px] w-[18px] rounded-full bg-background shadow-[0_1px_2px_rgba(0,0,0,0.18),0_2px_7px_rgba(0,0,0,0.11)]",
          "transition-transform duration-200 ease-out",
          checked ? "translate-x-[16px]" : "translate-x-0",
        )}
      />
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function ChannelCard({
  channel,
  status,
  configured,
  busy,
  onOpenPairing,
  onStartSetup,
  onRemove,
  onSetEnabled,
}: {
  channel: ChannelKind;
  status: FeishuStatus | WeixinStatus | null;
  configured: boolean;
  busy: boolean;
  onOpenPairing: (channel: ChannelKind) => void;
  onStartSetup: (channel: ChannelKind, options?: { isEdit?: boolean }) => void;
  onRemove: (channel: ChannelKind) => void;
  onSetEnabled: (channel: ChannelKind, enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const channelKey = channel === "feishu" ? "feishu" : "weixin";
  const title = t(`settings.automations.channels.${channelKey}`);
  const desc = t(
    channel === "feishu" ? "settings.imChannels.feishuDesc" : "settings.imChannels.weixinDesc",
  );
  const enabled = Boolean(status?.enabled);
  const pendingCount = status?.pending_pairing ?? 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
        {channel === "feishu" ? (
          <FeishuLogo className="h-8 w-8" />
        ) : (
          <WeChatLogo className="h-8 w-8" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {configured && enabled ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">
              {t("settings.imChannels.connected")}
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">{desc}</p>
      </div>
      {configured ? (
        <div className="flex shrink-0 items-center gap-3">
          {channel === "feishu" ? (
            <button
              type="button"
              className="relative text-sm text-primary hover:underline"
              onClick={() => onOpenPairing("feishu")}
            >
              {t("settings.imChannels.pairingManage")}
              {pendingCount > 0 ? (
                <span className="absolute -right-3 -top-2 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                  {pendingCount}
                </span>
              ) : null}
            </button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t("settings.imChannels.moreActions", { channel: title })}
                disabled={busy}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onStartSetup(channel, { isEdit: true })}>
                <Pencil className="h-3.5 w-3.5" />
                {t("settings.imChannels.editConfig")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onRemove(channel)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("settings.imChannels.removeConfig")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ChannelSwitch
            checked={enabled}
            disabled={busy}
            label={t("settings.imChannels.enableChannel", { channel: title })}
            onChange={(next) => onSetEnabled(channel, next)}
          />
        </div>
      ) : (
        <button
          type="button"
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
          disabled={busy}
          onClick={() => onStartSetup(channel)}
        >
          {t("settings.imChannels.configure")}
        </button>
      )}
    </div>
  );
}
