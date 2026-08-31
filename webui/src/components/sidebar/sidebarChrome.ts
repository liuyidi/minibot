import { cn } from "@/lib/utils";

/** Doubao-aligned sidebar type: 14px / 22px / #1f2329 */
export const SIDEBAR_TYPE = "text-[14px] leading-[22px] text-sidebar-foreground";

/**
 * Doubao nav row:
 * h-9 (36px), rounded-[10px], pl-3 pr-2 py-1.5, gap-2, icon 18px
 * selected bg ≈ #1f2329 @ 5%
 */
export const SIDEBAR_ROW =
  "flex h-9 min-w-0 shrink-0 items-center gap-2 overflow-hidden rounded-[10px] py-1.5 pl-3 pr-2 font-normal text-sidebar-foreground transition-colors hover:bg-[rgb(31_35_41_/0.05)] dark:hover:bg-white/[0.06]";

export const SIDEBAR_ROW_ACTIVE =
  "bg-[rgb(31_35_41_/0.05)] text-sidebar-foreground hover:bg-[rgb(31_35_41_/0.05)] dark:bg-white/[0.08] dark:hover:bg-white/[0.08]";

export const SIDEBAR_ICON = "h-[18px] w-[18px] shrink-0";

/**
 * Shared top chrome row — matches sidebar logo band:
 * 12px top offset + 32px content height (vertical center aligned).
 */
export const APP_TOP_CHROME_ROW = "flex mt-3 h-8 shrink-0 items-center";

export const HEADER_ICON_BUTTON =
  "h-8 w-8 shrink-0 rounded-[10px] text-muted-foreground shadow-none hover:bg-[rgb(31_35_41_/0.05)] hover:text-foreground dark:hover:bg-white/[0.06]";

export function sidebarRowClass(opts?: {
  active?: boolean;
  collapsed?: boolean;
  className?: string;
}): string {
  return cn(
    SIDEBAR_ROW,
    SIDEBAR_TYPE,
    opts?.active && SIDEBAR_ROW_ACTIVE,
    opts?.collapsed ? "w-9 justify-center gap-0 px-0" : "w-full justify-start",
    opts?.className,
  );
}
