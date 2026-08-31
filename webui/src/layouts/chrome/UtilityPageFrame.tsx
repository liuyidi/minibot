import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Standalone hub chrome (skills / automations / channels) — not Settings. */
export function UtilityPageFrame({
  title,
  header,
  hostChromeInset = false,
  wide = false,
  children,
}: {
  title?: string;
  /** Replaces the default h1 when provided (e.g. capability hub tabs). */
  header?: ReactNode;
  hostChromeInset?: boolean;
  /** Wider content column (e.g. skills grid with 4 cards per row). */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto bg-background">
      <main className="min-w-0 flex-1">
        <div
          className={cn(
            "mx-auto w-full px-4 pb-8 pt-6 sm:px-8 sm:pb-10 sm:pt-8 lg:pt-10",
            wide ? "max-w-[1400px]" : "max-w-[920px]",
            hostChromeInset && "pt-[4.25rem] sm:pt-[4.25rem] lg:pt-[4.75rem]",
          )}
        >
          {header ? (
            <div className="mb-6 sm:mb-7">{header}</div>
          ) : title ? (
            <h1 className="mb-6 text-[28px] font-semibold leading-[36px] tracking-[-0.02em] text-[rgb(31,35,41)] dark:text-foreground sm:mb-7 sm:text-[32px] sm:leading-[40px]">
              {title}
            </h1>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
