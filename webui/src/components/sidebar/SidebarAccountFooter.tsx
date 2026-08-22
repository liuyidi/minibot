import type { ReactNode } from "react";
import {
  Activity,
  Download,
  ExternalLink,
  FlaskConical,
  Home,
  Settings,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ConnectionStatusDot } from "./ConnectionBadge";
import { ProfileAvatar } from "@/components/settings/ProfileAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PORTAL } from "@/lib/configs/portal";
import { UI_ENTRY } from "@/lib/configs/ui-entry";
import { cn } from "@/lib/utils";
import { useLocalProfile } from "@/hooks/settings";
import type { SettingsSectionKey } from "@/pages/settings";

export function SidebarAccountFooter({
  collapsed = false,
  displayName: displayNameProp,
  onOpenSettings,
}: {
  collapsed?: boolean;
  displayName?: string | null;
  onOpenSettings: (section?: SettingsSectionKey) => void;
}) {
  const { t } = useTranslation();
  const { profile } = useLocalProfile();
  const displayName =
    profile.displayName?.trim()
    || displayNameProp?.trim()
    || t("sidebar.accountDisplayName", { defaultValue: "minibot" });
  const menuAria = t("sidebar.accountMenuAria", { defaultValue: "Account menu" });
  const downloadAppLabel = t("sidebar.downloadApp");
  const settingsLabel = t("sidebar.settings");
  const profileLabel = t("sidebar.profile", { defaultValue: "Profile" });

  return (
    <div
      className={cn(
        "px-2.5 py-2.5",
        collapsed && "mt-auto px-2 pb-3 pt-2",
      )}
    >
      {collapsed ? (
        <div className="flex flex-col-reverse items-center gap-2">
          <Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={menuAria}
                    className={cn(
                      "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      "text-sidebar-foreground/90 transition-colors",
                      "hover:bg-sidebar-accent/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <span className="relative shrink-0">
                      <ProfileAvatar
                        name={displayName}
                        seed={profile.avatarSeed}
                        size="sm"
                        className="ring-1 ring-sidebar-border/60"
                      />
                      <ConnectionStatusDot
                        className="absolute -bottom-0.5 -right-0.5"
                        ringClassName="ring-2 ring-[hsl(var(--sidebar-background))]"
                      />
                    </span>
                  </button>
                </TooltipTrigger>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="end"
                sideOffset={10}
                className="w-[min(17.5rem,calc(100vw-1.5rem))]"
              >
                <AccountLinkItem
                  href={PORTAL.download}
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
                      onSelect={() => onOpenSettings("profile")}
                    >
                      <UserRound className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{profileLabel}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      onSelect={() => onOpenSettings()}
                    >
                      <Settings className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{settingsLabel}</span>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipContent side="right" align="center" sideOffset={10}>
              {displayName}
            </TooltipContent>
          </Tooltip>

          {UI_ENTRY.settings ? (
            <SidebarDockButton
              label={settingsLabel}
              icon={<Settings className="h-4 w-4" />}
              onClick={() => onOpenSettings()}
            />
          ) : null}

          <SidebarDockLink
            label={downloadAppLabel}
            href={PORTAL.download}
            icon={<Download className="h-4 w-4" />}
            newTab
          />
        </div>
      ) : (
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
                <ProfileAvatar
                  name={displayName}
                  seed={profile.avatarSeed}
                  size="md"
                  className="ring-1 ring-sidebar-border/60"
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
              href={PORTAL.download}
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
                  onSelect={() => onOpenSettings("profile")}
                >
                  <UserRound className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{profileLabel}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onSelect={() => onOpenSettings()}
                >
                  <Settings className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{settingsLabel}</span>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function SidebarDockButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "h-9 w-9 rounded-xl text-sidebar-foreground/90",
            "hover:bg-sidebar-accent/75 hover:text-sidebar-foreground",
          )}
        >
          <span className="flex items-center justify-center" aria-hidden>
            {icon}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" align="center" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarDockLink({
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
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          aria-label={label}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl text-sidebar-foreground/90",
            "transition-colors hover:bg-sidebar-accent/75 hover:text-sidebar-foreground",
          )}
        >
          <span className="flex items-center justify-center" aria-hidden>
            {icon}
          </span>
        </a>
      </TooltipTrigger>
      <TooltipContent side="right" align="center" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
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
