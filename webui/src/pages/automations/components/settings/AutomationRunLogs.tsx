import { ChevronDown, Loader2 } from "lucide-react";

import { fmtDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { SessionAutomationJob } from "@/lib/types";

export function AutomationRunLogsPanel({
  groups,
  emptyLabel,
}: {
  groups: Array<{ label: string; rows: Array<{ key: string; title: string; status: string; time: string; running: boolean }> }>;
  emptyLabel: string;
}) {
  if (!groups.length) {
    return (
      <div className="rounded-3xl border border-border/40 bg-background/60 px-5 py-16 text-center text-[13px] text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.label} className="space-y-2">
          <div className="flex items-center gap-1 px-1 text-[12px] font-medium text-muted-foreground">
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            <span>{group.label}</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-background/85">
            {group.rows.map((row, index) => (
              <div
                key={row.key}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-3.5",
                  index > 0 && "border-t border-border/35",
                )}
              >
                <div className="min-w-0">
                  <span className="text-[14px] font-medium text-foreground">{row.title}</span>
                  <span className="ml-2 text-[12px] text-muted-foreground">{row.status}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="tabular-nums">{row.time}</span>
                  {row.running ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" aria-hidden />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function groupAutomationRunLogs(
  rows: Array<{
    key: string;
    job: SessionAutomationJob;
    run_at_ms: number;
    status: string;
    duration_ms?: number;
    error: string | null;
  }>,
  locale: string,
  t: (key: string, values?: Record<string, unknown>) => string,
): Array<{ label: string; rows: Array<{ key: string; title: string; status: string; time: string; running: boolean }> }> {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  const groups = new Map<string, Array<{ key: string; title: string; status: string; time: string; running: boolean }>>();

  const statusLabel = (status: string) => {
    if (status === "ok") return t("settings.automations.runStatus.ok");
    if (status === "error") return t("settings.automations.runStatus.error");
    if (status === "running") return t("settings.automations.runStatus.running");
    if (status === "skipped") return t("settings.automations.runStatus.skipped");
    return status;
  };

  for (const row of rows) {
    let label = fmtDateTime(row.run_at_ms, locale).slice(0, 10);
    if (row.run_at_ms >= startToday) label = t("settings.automations.day.today");
    else if (row.run_at_ms >= startYesterday) label = t("settings.automations.day.yesterday");
    const list = groups.get(label) ?? [];
    const time = new Date(row.run_at_ms).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    list.push({
      key: row.key,
      title: row.job.name || row.job.id,
      status: statusLabel(row.status),
      time,
      running: row.status === "running",
    });
    groups.set(label, list);
  }
  return [...groups.entries()].map(([label, groupRows]) => ({ label, rows: groupRows }));
}
