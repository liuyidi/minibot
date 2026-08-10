import type { ReactNode } from "react";
import {
  Activity,
  Download,
  ExternalLink,
  FlaskConical,
  Home,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ConnectionStatusDot } from "./ConnectionBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PORTAL } from "@/lib/configs/portal";
import { UI_ENTRY } from "@/lib/configs/ui-entry";
import { cn } from "@/lib/utils";
import type { SettingsSectionKey } from "@/pages/settings";

const DEFAULT_AVATAR_SRC = "/brand/minibot_mark.svg";

export function SidebarAccountFooter({
  onOpenSettings,
}: {
  onOpenSettings: (section?: SettingsSectionKey) => void;
}) {
  const { t } = useTranslation();
  const displayName = t("sidebar.accountDisplayName", { defaultValue: "minibot" });
  const menuAria = t("sidebar.accountMenuAria", { defaultValue: "Account menu" });
  const downloadAppLabel = t("sidebar.downloadApp");

  return (
    <div className="px-2.5 py-2.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={menuAria}
            className={cn(
              "flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left",
              "text-sidebar-foreground/90 transition-colors",
              "hover:bg-sidebar-accent/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <span className="relative shrink-0">
              <img
                src={DEFAULT_AVATAR_SRC}
                alt=""
                className="h-8 w-8 rounded-full bg-sidebar-accent object-cover ring-1 ring-sidebar-border/60"
              />
              <ConnectionStatusDot
                className="absolute -bottom-0.5 -right-0.5"
                ringClassName="ring-2 ring-[hsl(var(--sidebar-background))]"
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight">
              {displayName}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[min(17.5rem,calc(100vw-1.5rem))]"
        >
          <AccountLinkItem
            href="/#/download/"
            label={downloadAppLabel}
            icon={<Download className="h-4 w-4" />}
            newTab
          />
          <AccountLinkItem
            href={PORTAL.home}
            label={t("sidebar.portalHome")}
            icon={<Home className="h-4 w-4" />}
          />
          <AccountLinkItem
            href={PORTAL.langfuse}
            label={t("sidebar.portalLangfuse")}
            icon={<Activity className="h-4 w-4" />}
          />
          <AccountLinkItem
            href={PORTAL.devui}
            label={t("sidebar.portalDevui")}
            icon={<FlaskConical className="h-4 w-4" />}
          />
          {UI_ENTRY.settings ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => onOpenSettings()}
              >
                <Settings className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t("sidebar.settings")}</span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AccountLinkItem({
  href,
  label,
  icon,
  newTab = false,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  newTab?: boolean;
}) {
  const external = newTab || !href.startsWith("/");
  return (
    <DropdownMenuItem asChild className="gap-2">
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        <span className="flex shrink-0 items-center justify-center opacity-80" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
      </a>
    </DropdownMenuItem>
  );
}
