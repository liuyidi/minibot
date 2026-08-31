import { cn } from "@/lib/utils";

/** Standalone hub chrome (skills / automations / channels) — not Settings. */
export function UtilityPageFrame({
  title,
  hostChromeInset = false,
  children,
}: {
  title: string;
  hostChromeInset?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto bg-background">
      <main className="min-w-0 flex-1">
        <div
          className={cn(
            "mx-auto w-full max-w-[920px] px-4 pb-8 pt-6 sm:px-8 sm:pb-10 sm:pt-8 lg:pt-10",
            hostChromeInset && "pt-[4.25rem] sm:pt-[4.25rem] lg:pt-[4.75rem]",
          )}
        >
          <h1 className="mb-6 text-[28px] font-semibold leading-[36px] tracking-[-0.02em] text-[rgb(31,35,41)] dark:text-foreground sm:mb-7 sm:text-[32px] sm:leading-[40px]">
            {title}
          </h1>
          {children}
        </div>
      </main>
    </div>
  );
}
