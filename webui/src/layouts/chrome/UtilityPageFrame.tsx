import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/** Standalone hub chrome (skills / automations / channels) — not Settings. */
export function UtilityPageFrame({
  title,
  onBackToChat,
  hostChromeInset = false,
  children,
}: {
  title: string;
  onBackToChat: () => void;
  hostChromeInset?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto bg-background">
      <main className="min-w-0 flex-1">
        <div
          className={cn(
            "mx-auto w-full max-w-[920px] px-4 py-6 sm:px-8 sm:py-8 lg:py-12",
            hostChromeInset && "pt-[4.25rem] sm:pt-[4.25rem] lg:pt-[4.75rem]",
          )}
        >
          <div className="mb-7">
            <button
              type="button"
              onClick={onBackToChat}
              className="mb-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              {t("settings.backToChat")}
            </button>
            <h1 className="text-[24px] font-normal leading-tight tracking-normal text-foreground sm:text-[28px]">
              {title}
            </h1>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
