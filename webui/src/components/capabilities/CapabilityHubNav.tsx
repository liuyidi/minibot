import type { ReactNode } from "react";
import { Hammer, Link2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useShellNavigate } from "@/routes/useShellNavigate";
import { cn } from "@/lib/utils";

import {
  CAPABILITY_HUB_VIEWS,
  type CapabilityHubView,
} from "./types";

const ICONS = {
  experts: UserRound,
  skills: Hammer,
  connectors: Link2,
} as const;

/** Top pill tabs shared by `#/experts`, `#/skills`, and `#/connectors`. */
export function CapabilityHubNav({
  active,
  trailing,
}: {
  active: CapabilityHubView;
  /** Search / add controls aligned to the right of the hub tabs. */
  trailing?: ReactNode;
}) {
  const { t } = useTranslation();
  const { navigate, route } = useShellNavigate();

  const labels: Record<CapabilityHubView, string> = {
    experts: t("settings.skills.hubExperts", { defaultValue: "Experts" }),
    skills: t("settings.skills.hubSkills", { defaultValue: "Skills" }),
    connectors: t("settings.skills.hubConnectors", { defaultValue: "Connectors" }),
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        role="tablist"
        aria-label={t("settings.skills.capabilityHubTabs", {
          defaultValue: "Experts, skills, and connectors",
        })}
        className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-muted/70 p-1"
      >
        {CAPABILITY_HUB_VIEWS.map((view) => {
          const Icon = ICONS[view];
          const selected = active === view;
          return (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() =>
                navigate({
                  view,
                  activeKey: route.activeKey,
                  settingsSection: "overview",
                })
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                selected
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {labels[view]}
            </button>
          );
        })}
      </div>

      {trailing ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
