import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityHubNav } from "@/components/capabilities";

export function ExpertsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <CapabilityHubNav active="experts" />
      <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-[20px] border border-dashed border-border/60 bg-muted/20 px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Sparkles className="h-6 w-6" strokeWidth={1.7} aria-hidden />
        </div>
        <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">
          {t("settings.skills.expertsComingSoonTitle", {
            defaultValue: "Experts coming soon",
          })}
        </h2>
        <p className="mt-2 max-w-md text-[13.5px] leading-6 text-muted-foreground">
          {t("settings.skills.expertsComingSoonBody", {
            defaultValue:
              "Experts will package domain know-how, workflows, and recommended skills into one-click workmates. We're polishing the experience — stay tuned.",
          })}
        </p>
        <span className="mt-5 rounded-full bg-muted px-3 py-1 text-[12px] font-medium text-muted-foreground">
          {t("settings.skills.expertsComingSoonBadge", { defaultValue: "Coming soon" })}
        </span>
      </div>
    </div>
  );
}
