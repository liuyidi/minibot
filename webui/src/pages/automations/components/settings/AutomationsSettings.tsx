import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlarmClock,
  ArrowUpDown,
  Check,
  ChevronRight,
  CircleAlert,
  Filter,
  HeartPulse,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  AutomationsPayload,
  SessionAutomationJob,
} from "@/lib/types";

import { AutomationDetailSheet } from "../detail/AutomationDetail";
import { AutomationTemplatesSection } from "./AutomationTemplates";
import { AutomationListItem } from "./AutomationListItem";
import { AutomationRunLogsPanel, groupAutomationRunLogs } from "./AutomationRunLogs";
import {
  automationMatchesFilter,
  automationMatchesSearch,
  parseAutomationSearchQuery,
  sortAutomationJobs,
} from "../../lib/automationQuery";
import {
  automationStatus,
  formatAutomationSchedule,
} from "../../lib/automationFormat";
import {
  type AutomationAction,
  type AutomationFilter,
  type AutomationRunFilter,
  type AutomationSort,
  type AutomationsTab,
} from "../../lib/automationTypes";

export function AutomationsSettings({
  payload,
  loading,
  query,
  filter,
  sort,
  actionKey,
  error,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onAction,
  onRequestEdit,
  onRequestDelete,
  onRequestCreate,
}: {
  payload: AutomationsPayload | null;
  loading: boolean;
  query: string;
  filter: AutomationFilter;
  sort: AutomationSort;
  actionKey: string | null;
  error: string | null;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: AutomationFilter) => void;
  onSortChange: (value: AutomationSort) => void;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => void | Promise<void>;
  onRequestEdit: (job: SessionAutomationJob) => void;
  onRequestDelete: (job: SessionAutomationJob) => void;
  onRequestCreate: (prefill?: { name?: string; message?: string }) => void;
}) {
  const { t, i18n } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const jobs = payload?.jobs ?? [];
  const locale = i18n.resolvedLanguage || i18n.language;
  const [tab, setTab] = useState<AutomationsTab>("tasks");
  const [runFilter, setRunFilter] = useState<AutomationRunFilter>("all");
  const [systemSheetJobId, setSystemSheetJobId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const searchTokens = parseAutomationSearchQuery(query);
    return sortAutomationJobs(jobs, sort)
      .filter((job) => automationMatchesFilter(job, filter))
      .filter((job) => !searchTokens.length || automationMatchesSearch(job, searchTokens));
  }, [filter, jobs, query, sort]);

  const systemJobs = filtered.filter((job) => Boolean(job.protected));
  const userJobs = filtered.filter((job) => !job.protected);
  const systemSheetJob =
    systemJobs.find((job) => job.id === systemSheetJobId) ??
    jobs.find((job) => job.id === systemSheetJobId && job.protected) ??
    null;

  const filterOptions: Array<{ value: AutomationFilter; label: string }> = [
    { value: "all", label: t("settings.automations.filters.all") },
    { value: "active", label: t("settings.automations.filters.active") },
    { value: "paused", label: t("settings.automations.filters.paused") },
    { value: "failed", label: t("settings.automations.filters.failed") },
    { value: "system", label: t("settings.automations.filters.system") },
  ];

  const runFilterOptions: Array<{ value: AutomationRunFilter; label: string }> = [
    { value: "all", label: t("settings.automations.runFilters.all") },
    { value: "ok", label: t("settings.automations.runFilters.ok") },
    { value: "error", label: t("settings.automations.runFilters.error") },
    { value: "running", label: t("settings.automations.runFilters.running") },
    { value: "skipped", label: t("settings.automations.runFilters.skipped") },
  ];

  const runLogs = useMemo(() => {
    const search = query.trim().toLowerCase();
    const rows = jobs.flatMap((job) => {
      const history = job.state.run_history ?? [];
      const pendingRow =
        job.state.pending
          ? [
              {
                key: `${job.id}:pending`,
                job,
                run_at_ms: Date.now(),
                status: "running" as const,
                duration_ms: undefined as number | undefined,
                error: null as string | null,
              },
            ]
          : [];
      const histRows = history.map((item, index) => ({
        key: `${job.id}:${item.run_at_ms}:${index}`,
        job,
        run_at_ms: item.run_at_ms,
        status: item.status,
        duration_ms: item.duration_ms,
        error: item.error ?? null,
      }));
      return [...pendingRow, ...histRows];
    });
    return rows
      .filter((row) => {
        if (runFilter === "all") return true;
        if (runFilter === "running") return row.status === "running" || Boolean(row.job.state.pending);
        if (runFilter === "ok") return row.status === "ok";
        if (runFilter === "error") return row.status === "error";
        return row.status === "skipped";
      })
      .filter((row) => {
        if (!search) return true;
        const hay = `${row.job.name} ${row.job.id} ${row.status} ${row.error ?? ""}`.toLowerCase();
        return hay.includes(search);
      })
      .sort((a, b) => b.run_at_ms - a.run_at_ms);
  }, [jobs, query, runFilter]);

  const runGroups = useMemo(() => groupAutomationRunLogs(runLogs, locale, t), [locale, runLogs, t]);

  useEffect(() => {
    if (systemSheetJobId && !jobs.some((job) => job.id === systemSheetJobId && job.protected)) {
      setSystemSheetJobId(null);
    }
  }, [jobs, systemSheetJobId]);

  return (
    <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex w-fit rounded-[10px] bg-[rgb(31_35_41_/0.05)] p-0.5 dark:bg-white/[0.06]"
          role="tablist"
          aria-label={tx("settings.automations.tabs.label", "Automations views")}
        >
          {(
            [
              { id: "tasks" as const, label: tx("settings.automations.tabs.tasks", "Scheduled tasks") },
              { id: "runs" as const, label: tx("settings.automations.tabs.runs", "Run history") },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-[8px] px-3.5 py-1.5 text-[14px] leading-[22px] font-normal transition-colors",
                tab === item.id
                  ? "bg-background font-medium text-[rgb(31,35,41)] shadow-[0_1px_2px_rgba(15,23,42,0.06)] dark:bg-sidebar-accent dark:text-foreground dark:shadow-none"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          {tab === "tasks" && jobs.some((job) => !job.protected) ? (
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0 rounded-[10px] bg-[rgb(31,35,41)] px-3.5 text-white hover:bg-[rgb(31,35,41)]/90 dark:bg-foreground dark:text-background"
              onClick={() => onRequestCreate()}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              {t("settings.automations.add")}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/45 bg-background/90 text-muted-foreground shadow-[0_8px_22px_rgba(15,23,42,0.04)] transition-colors hover:bg-muted/60 hover:text-foreground"
                aria-label={t("settings.automations.filter")}
              >
                <Filter className="h-4 w-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
              {tab === "tasks"
                ? filterOptions.map((option) => (
                    <DropdownMenuItem key={option.value} onClick={() => onFilterChange(option.value)}>
                      <span>{option.label}</span>
                      {filter === option.value ? (
                        <Check className="ml-auto h-3.5 w-3.5" aria-hidden />
                      ) : null}
                    </DropdownMenuItem>
                  ))
                : runFilterOptions.map((option) => (
                    <DropdownMenuItem key={option.value} onClick={() => setRunFilter(option.value)}>
                      <span>{option.label}</span>
                      {runFilter === option.value ? (
                        <Check className="ml-auto h-3.5 w-3.5" aria-hidden />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
              {tab === "tasks" ? (
                <>
                  <DropdownMenuSeparator />
                  {(
                    [
                      ["next", t("settings.automations.sort.next")],
                      ["last", t("settings.automations.sort.last")],
                      ["name", t("settings.automations.sort.name")],
                    ] as const
                  ).map(([value, label]) => (
                    <DropdownMenuItem key={value} onClick={() => onSortChange(value)}>
                      <ArrowUpDown className="mr-2 h-3.5 w-3.5" aria-hidden />
                      <span>{label}</span>
                      {sort === value ? <Check className="ml-auto h-3.5 w-3.5" aria-hidden /> : null}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={tx("settings.automations.search", "Search automations / logs")}
              className="h-9 w-full rounded-full border-border/45 bg-background/90 pl-9 text-[13px] shadow-[0_8px_22px_rgba(15,23,42,0.04)]"
            />
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && !payload ? (
        <div className="flex h-44 items-center justify-center rounded-3xl border border-border/40 bg-card/80 text-[13px] text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          {tx("settings.automations.loading", "Loading automations...")}
        </div>
      ) : tab === "runs" ? (
        <AutomationRunLogsPanel groups={runGroups} emptyLabel={t("settings.automations.runsEmpty")} />
      ) : (
        <div className="space-y-5">
          {systemJobs.length ? (
            <section className="space-y-2" aria-label={tx("settings.automations.systemSection", "System tasks")}>
              <div className="flex items-center gap-2 px-1">
                <HeartPulse className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <h2 className="text-[12px] font-semibold tracking-wide text-muted-foreground">
                  {tx("settings.automations.systemSection", "System tasks")}
                </h2>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border/40 bg-background/80">
                {systemJobs.map((job, index) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSystemSheetJobId(job.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/35",
                      index > 0 && "border-t border-border/35",
                      systemSheetJobId === job.id && "bg-muted/45",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-foreground">
                          {job.name || job.id}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {t("settings.automations.protected")}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-[12px] text-muted-foreground">
                        {formatAutomationSchedule(job, locale, tx)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
                      {automationStatus(job, tx).label}
                      <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {userJobs.length ? (
            <section
              className="overflow-hidden rounded-2xl border border-border/40 bg-background/80"
              aria-label={t("settings.automations.queue")}
            >
              {userJobs.map((job, index) => (
                <AutomationListItem
                  key={job.id}
                  job={job}
                  locale={locale}
                  actionKey={actionKey}
                  bordered={index > 0}
                  onAction={onAction}
                  onRequestEdit={onRequestEdit}
                  onRequestDelete={onRequestDelete}
                />
              ))}
            </section>
          ) : (
            <section className="rounded-3xl border border-dashed border-border/50 bg-background/50 px-5 py-12 text-center">
              <AlarmClock className="mx-auto h-12 w-12 text-muted-foreground/55" aria-hidden />
              <p className="mt-4 text-[14px] text-muted-foreground">
                {jobs.some((job) => !job.protected)
                  ? t("settings.automations.noMatches")
                  : t("settings.automations.empty")}
              </p>
              <Button
                type="button"
                className="mt-5 rounded-full px-5"
                onClick={() => onRequestCreate()}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                {t("settings.automations.add")}
              </Button>
            </section>
          )}

          {!userJobs.length ? (
            <AutomationTemplatesSection onRequestCreate={onRequestCreate} />
          ) : null}
        </div>
      )}

      <AutomationDetailSheet
        job={systemSheetJob}
        open={systemSheetJob !== null}
        locale={locale}
        actionKey={actionKey}
        onOpenChange={(open) => {
          if (!open) setSystemSheetJobId(null);
        }}
        onAction={onAction}
        onRequestEdit={onRequestEdit}
        onRequestDelete={onRequestDelete}
      />
    </div>
  );
}
