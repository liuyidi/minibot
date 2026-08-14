import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { TokenUsageHeatmap } from "@/components/settings/TokenUsageHeatmap";
import { cn } from "@/lib/utils";
import type { SettingsPayload } from "@/lib/types";

type TokenUsagePayload = NonNullable<SettingsPayload["usage"]>;
type UsageGranularity = "daily" | "weekly" | "cumulative";

export type ProfileUsageInsight = {
  id: string;
  label: string;
  value: string;
};

export type ProfileUsagePlugin = {
  id: string;
  name: string;
  runs: number;
};

export type ProfileUsagePanelProps = {
  usage?: TokenUsagePayload;
  timeZone?: string;
  longestChatLabel?: string;
  insights?: ProfileUsageInsight[];
  plugins?: ProfileUsagePlugin[];
};

function compactNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: value >= 10_000_000 ? 0 : 1,
  }).format(value);
}

export function ProfileUsagePanel({
  usage,
  timeZone,
  longestChatLabel,
  insights = [],
  plugins = [],
}: ProfileUsagePanelProps) {
  const { t, i18n } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const [granularity, setGranularity] = useState<UsageGranularity>("daily");
  const locale = i18n.language || "en";

  const stats = useMemo(
    () => [
      {
        id: "total",
        value: compactNumber(usage?.total_tokens ?? 0, locale),
        label: tx("settings.usage.totalTokens", "Total tokens"),
      },
      {
        id: "peak",
        value: compactNumber(usage?.peak_day_tokens ?? 0, locale),
        label: tx("settings.usage.peakTokens", "Peak tokens"),
      },
      {
        id: "longestChat",
        value: longestChatLabel || tx("settings.profile.unknownValue", "—"),
        label: tx("settings.usage.longestChat", "Longest chat"),
      },
      {
        id: "streak",
        value: tx("settings.usage.daysValue", "{{count}}d", {
          count: usage?.current_streak_days ?? 0,
        }),
        label: tx("settings.usage.currentStreak", "Current streak"),
      },
      {
        id: "longestStreak",
        value: tx("settings.usage.daysValue", "{{count}}d", {
          count: usage?.longest_streak_days ?? 0,
        }),
        label: tx("settings.usage.longestStreak", "Longest streak"),
      },
    ],
    [locale, longestChatLabel, t, usage],
  );

  const granularityOptions: Array<{ id: UsageGranularity; label: string }> = [
    { id: "daily", label: tx("settings.usage.granularityDaily", "Daily") },
    { id: "weekly", label: tx("settings.usage.granularityWeekly", "Weekly") },
    { id: "cumulative", label: tx("settings.usage.granularityCumulative", "Cumulative") },
  ];

  return (
    <div className="space-y-6" data-testid="profile-usage-panel">
      <div className="overflow-hidden rounded-[22px] border border-border/45 bg-card/86">
        <div className="grid grid-cols-2 divide-y divide-border/45 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          {stats.map((stat) => (
            <div key={stat.id} className="px-4 py-4 text-center sm:px-3">
              <div className="text-[20px] font-semibold tracking-tight text-foreground">
                {stat.value}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-foreground">
            {tx("settings.usage.title", "Token activity")}
          </h3>
          <div className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
            {granularityOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "rounded-full px-2.5 py-1 transition-colors",
                  granularity === option.id
                    ? "bg-muted text-foreground"
                    : "hover:text-foreground",
                )}
                aria-pressed={granularity === option.id}
                onClick={() => setGranularity(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <TokenUsageHeatmap usage={usage} timeZone={timeZone} />
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h3 className="mb-3 text-[15px] font-semibold text-foreground">
            {tx("settings.usage.insightsTitle", "Activity insights")}
          </h3>
          <ul className="space-y-2.5 text-[13px]">
            {insights.length === 0 ? (
              <li className="text-muted-foreground">{tx("settings.usage.empty", "Token activity will appear after new model replies.")}</li>
            ) : (
              insights.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium text-foreground">{item.value}</span>
                </li>
              ))
            )}
          </ul>
        </section>
        <section>
          <h3 className="mb-3 text-[15px] font-semibold text-foreground">
            {tx("settings.usage.pluginsTitle", "Most used plugins")}
          </h3>
          <ul className="space-y-2.5 text-[13px]">
            {plugins.length === 0 ? (
              <li className="text-muted-foreground">{tx("settings.usage.empty", "Token activity will appear after new model replies.")}</li>
            ) : (
              plugins.map((plugin) => (
                <li key={plugin.id} className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">{plugin.name}</span>
                  <span className="text-muted-foreground">
                    {tx("settings.usage.pluginRuns", "{{count}} runs", { count: plugin.runs })}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
