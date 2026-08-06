import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlarmClock,
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  Film,
  Filter,
  HeartPulse,
  ImageIcon,
  Languages,
  Lightbulb,
  Loader2,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Newspaper,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl, ToggleButton } from "@/components/settings/controls";
import { listSessions } from "@/lib/apis/api";
import { fmtDateTime, relativeTime } from "@/lib/utils/format";
import { bareSessionId } from "@/lib/utils/im-sessions";
import { cn } from "@/lib/utils";
import type {
  AutomationsPayload,
  AutomationUpdatePayload,
  ChatSummary,
  SessionAutomationJob,
} from "@/lib/types";

export type AutomationFilter = "all" | "active" | "paused" | "failed" | "system";
export type AutomationSort = "next" | "last" | "updated" | "name";
export type AutomationAction = "enable" | "disable" | "delete" | "run";

function AppsActionButton({
  ariaLabel,
  busy,
  disabled,
  tone = "default",
  onClick,
  children,
}: {
  ariaLabel: string;
  busy?: boolean;
  disabled?: boolean;
  tone?: "default" | "installed" | "danger";
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        "h-9 w-9 rounded-full text-muted-foreground transition-colors",
        tone === "installed" && "bg-transparent hover:bg-muted/70 hover:text-foreground",
        tone === "danger" && "bg-transparent hover:bg-destructive/10 hover:text-destructive",
        tone === "default" && "bg-muted/70 hover:bg-muted hover:text-foreground",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : children}
    </Button>
  );
}

type AutomationsTab = "tasks" | "runs";
type AutomationRunFilter = "all" | "ok" | "error" | "running" | "skipped";

const AUTOMATION_TEMPLATE_CARDS: Array<{
  id: string;
  icon: LucideIcon;
  titleKey: string;
  title: string;
  descKey: string;
  desc: string;
  prompt: string;
}> = [
  {
    id: "ai-news",
    icon: Newspaper,
    titleKey: "settings.automations.templates.aiNews.title",
    title: "每日 AI 新闻推送",
    descKey: "settings.automations.templates.aiNews.desc",
    desc: "每天汇总值得关注的 AI 动态",
    prompt: "每天早上汇总昨天值得关注的 AI 新闻，用中文简洁推送。",
  },
  {
    id: "english",
    icon: Languages,
    titleKey: "settings.automations.templates.english.title",
    title: "每日 5 个英语单词",
    descKey: "settings.automations.templates.english.desc",
    desc: "每天学习并复习 5 个单词",
    prompt: "每天教我 5 个实用英语单词，带例句和简单复习题。",
  },
  {
    id: "story",
    icon: Moon,
    titleKey: "settings.automations.templates.story.title",
    title: "每日儿童睡前故事",
    descKey: "settings.automations.templates.story.desc",
    desc: "每晚讲一个温馨短故事",
    prompt: "每天晚上讲一个适合儿童的温馨睡前故事，控制在 400 字内。",
  },
  {
    id: "weekly",
    icon: ClipboardList,
    titleKey: "settings.automations.templates.weekly.title",
    title: "每周工作周报",
    descKey: "settings.automations.templates.weekly.desc",
    desc: "汇总本周进展与下周计划",
    prompt: "每周五帮我整理工作周报草稿：本周完成、风险、下周计划。",
  },
  {
    id: "movie",
    icon: Film,
    titleKey: "settings.automations.templates.movie.title",
    title: "经典电影推荐",
    descKey: "settings.automations.templates.movie.desc",
    desc: "推荐一部值得重看的经典片",
    prompt: "每周推荐一部经典电影，说明为什么适合今天看。",
  },
  {
    id: "history",
    icon: CalendarDays,
    titleKey: "settings.automations.templates.history.title",
    title: "历史上的今天",
    descKey: "settings.automations.templates.history.desc",
    desc: "回顾历史上的今天",
    prompt: "每天分享 3 条「历史上的今天」事件，附一句启发。",
  },
  {
    id: "why",
    icon: Lightbulb,
    titleKey: "settings.automations.templates.why.title",
    title: "每日一个为什么",
    descKey: "settings.automations.templates.why.desc",
    desc: "回答一个有趣的为什么",
    prompt: "每天回答一个有趣的「为什么」，用通俗语言解释。",
  },
  {
    id: "parents",
    icon: UserRound,
    titleKey: "settings.automations.templates.parents.title",
    title: "父母联系提醒",
    descKey: "settings.automations.templates.parents.desc",
    desc: "提醒给家人打个电话",
    prompt: "每周提醒我给父母打个电话，并给一句暖心开场白。",
  },
  {
    id: "checkup",
    icon: Stethoscope,
    titleKey: "settings.automations.templates.checkup.title",
    title: "体检预约提醒",
    descKey: "settings.automations.templates.checkup.desc",
    desc: "提醒安排年度体检",
    prompt: "每月提醒我确认体检预约进度，必要时给出行动清单。",
  },
  {
    id: "interview",
    icon: MessageSquare,
    titleKey: "settings.automations.templates.interview.title",
    title: "面试准备提醒",
    descKey: "settings.automations.templates.interview.desc",
    desc: "面试前整理要点",
    prompt: "在我约定时间前，提醒面试准备：公司背景、常见问题、自我介绍。",
  },
  {
    id: "meeting",
    icon: ClipboardList,
    titleKey: "settings.automations.templates.meeting.title",
    title: "会议前准备",
    descKey: "settings.automations.templates.meeting.desc",
    desc: "会前梳理议程与材料",
    prompt: "会前 30 分钟提醒我准备议程、材料与待确认问题。",
  },
  {
    id: "wallpaper",
    icon: ImageIcon,
    titleKey: "settings.automations.templates.wallpaper.title",
    title: "可爱萌宠手机壁纸",
    descKey: "settings.automations.templates.wallpaper.desc",
    desc: "每日一张萌宠灵感描述",
    prompt: "每天描述一张可爱萌宠手机壁纸构图，便于我去生成图片。",
  },
];

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
    { value: "all", label: tx("settings.automations.filters.all", "全部") },
    { value: "active", label: tx("settings.automations.filters.active", "进行中") },
    { value: "paused", label: tx("settings.automations.filters.paused", "已暂停") },
    { value: "failed", label: tx("settings.automations.filters.failed", "失败") },
    { value: "system", label: tx("settings.automations.filters.system", "系统任务") },
  ];

  const runFilterOptions: Array<{ value: AutomationRunFilter; label: string }> = [
    { value: "all", label: tx("settings.automations.runFilters.all", "全部") },
    { value: "ok", label: tx("settings.automations.runFilters.ok", "成功") },
    { value: "error", label: tx("settings.automations.runFilters.error", "失败") },
    { value: "running", label: tx("settings.automations.runFilters.running", "运行中") },
    { value: "skipped", label: tx("settings.automations.runFilters.skipped", "已归档") },
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

  const runGroups = useMemo(() => groupAutomationRunLogs(runLogs, locale, tx), [locale, runLogs, tx]);

  useEffect(() => {
    if (systemSheetJobId && !jobs.some((job) => job.id === systemSheetJobId && job.protected)) {
      setSystemSheetJobId(null);
    }
  }, [jobs, systemSheetJobId]);

  return (
    <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex w-fit rounded-full bg-muted/55 p-1 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]"
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
                "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                tab === item.id
                  ? "bg-background text-foreground shadow-[0_6px_16px_rgba(15,23,42,0.08)]"
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
              className="h-9 shrink-0 rounded-full px-3.5"
              onClick={() => onRequestCreate()}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              {tx("settings.automations.add", "添加自动化")}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/45 bg-background/90 text-muted-foreground shadow-[0_8px_22px_rgba(15,23,42,0.04)] transition-colors hover:bg-muted/60 hover:text-foreground"
                aria-label={tx("settings.automations.filter", "筛选")}
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
                      ["next", tx("settings.automations.sort.next", "下次运行")],
                      ["last", tx("settings.automations.sort.last", "上次运行")],
                      ["name", tx("settings.automations.sort.name", "名称")],
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
        <AutomationRunLogsPanel groups={runGroups} emptyLabel={tx("settings.automations.runsEmpty", "暂无运行记录")} />
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
                          {tx("settings.automations.protected", "系统")}
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
              aria-label={tx("settings.automations.queue", "定时任务")}
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
                  ? tx("settings.automations.noMatches", "没有匹配的自动化任务")
                  : tx("settings.automations.empty", "开启你的第一个自动化任务吧")}
              </p>
              <Button
                type="button"
                className="mt-5 rounded-full px-5"
                onClick={() => onRequestCreate()}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                {tx("settings.automations.add", "添加自动化")}
              </Button>
            </section>
          )}

          {!userJobs.length ? (
            <section className="space-y-3">
              <h2 className="px-1 text-[14px] font-semibold text-foreground">
                {tx("settings.automations.templatesTitle", "自动化任务模版")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {AUTOMATION_TEMPLATE_CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() =>
                        onRequestCreate({
                          name: tx(card.titleKey, card.title),
                          message: card.prompt,
                        })
                      }
                      className="flex items-start gap-3 rounded-2xl border border-border/40 bg-background/85 px-3.5 py-3.5 text-left shadow-[0_10px_28px_rgba(15,23,42,0.04)] transition-colors hover:bg-muted/30"
                    >
                      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-foreground/80">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-foreground">
                          {tx(card.titleKey, card.title)}
                        </span>
                        <span className="mt-1 block text-[12px] leading-5 text-muted-foreground">
                          {tx(card.descKey, card.desc)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
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

function AutomationRunLogsPanel({
  groups,
  emptyLabel,
}: {
  groups: Array<{ label: string; rows: Array<{ key: string; title: string; status: string; time: string }> }>;
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
                  {row.status.includes("运行") || row.status.toLowerCase().includes("run") ? (
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

function groupAutomationRunLogs(
  rows: Array<{
    key: string;
    job: SessionAutomationJob;
    run_at_ms: number;
    status: string;
    duration_ms?: number;
    error: string | null;
  }>,
  locale: string,
  tx: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): Array<{ label: string; rows: Array<{ key: string; title: string; status: string; time: string }> }> {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  const groups = new Map<string, Array<{ key: string; title: string; status: string; time: string }>>();

  const statusLabel = (status: string) => {
    if (status === "ok") return tx("settings.automations.runStatus.ok", "成功");
    if (status === "error") return tx("settings.automations.runStatus.error", "失败");
    if (status === "running") return tx("settings.automations.runStatus.running", "运行中");
    if (status === "skipped") return tx("settings.automations.runStatus.skipped", "已归档");
    return status;
  };

  for (const row of rows) {
    let label = fmtDateTime(row.run_at_ms, locale).slice(0, 10);
    if (row.run_at_ms >= startToday) label = tx("settings.automations.day.today", "今天");
    else if (row.run_at_ms >= startYesterday) label = tx("settings.automations.day.yesterday", "昨天");
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
    });
    groups.set(label, list);
  }
  return [...groups.entries()].map(([label, groupRows]) => ({ label, rows: groupRows }));
}

function AutomationDetailSheet({
  job,
  open,
  locale,
  actionKey,
  onOpenChange,
  onAction,
  onRequestEdit,
  onRequestDelete,
}: {
  job: SessionAutomationJob | null;
  open: boolean;
  locale: string;
  actionKey: string | null;
  onOpenChange: (open: boolean) => void;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => void | Promise<void>;
  onRequestEdit: (job: SessionAutomationJob) => void;
  onRequestDelete: (job: SessionAutomationJob) => void;
}) {
  const { t } = useTranslation();
  if (!job) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[min(36rem,calc(100vw-1rem))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <SheetTitle className="sr-only">
          {t("settings.automations.detailTitle", {
            defaultValue: "Automation details",
            name: job.name || job.id,
          })}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {t("settings.automations.detailDescription", {
            defaultValue: "Details for {{name}}.",
            name: job.name || job.id,
          })}
        </SheetDescription>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AutomationDetailPanel
            job={job}
            locale={locale}
            actionKey={actionKey}
            sheetLayout
            onClose={() => onOpenChange(false)}
            onAction={onAction}
            onRequestEdit={onRequestEdit}
            onRequestDelete={onRequestDelete}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AutomationListItem({
  job,
  locale,
  actionKey,
  bordered,
  onAction,
  onRequestEdit,
  onRequestDelete,
}: {
  job: SessionAutomationJob;
  locale: string;
  actionKey: string | null;
  bordered: boolean;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => void | Promise<void>;
  onRequestEdit: (job: SessionAutomationJob) => void;
  onRequestDelete: (job: SessionAutomationJob) => void;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const schedule = formatAutomationSchedule(job, locale, tx);
  const nextRun = formatAutomationNext(job, tx);
  const hasLinkedChat = Boolean(job.origin);
  const canRun = hasLinkedChat && job.enabled && !job.state.pending;
  const toggleAction: AutomationAction = job.enabled ? "disable" : "enable";
  const canToggle = job.enabled || hasLinkedChat;
  const toggleBusy = actionKey === `${toggleAction}:${job.id}`;
  const menuBusy = Boolean(actionKey);

  return (
    <div
      role="listitem"
      className={cn(
        "group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35",
        bordered && "border-t border-border/35",
      )}
    >
      <button
        type="button"
        onClick={() => onRequestEdit(job)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", automationStatusDotClass(job))}
            aria-hidden
          />
          <span className="truncate text-[14px] font-medium text-foreground">
            {job.name || job.id}
          </span>
          {job.delete_after_run ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {tx("settings.automations.oneShot", "One-time")}
            </span>
          ) : null}
        </span>
        <span
          className="mt-1 block truncate pl-4 text-[12px] text-muted-foreground"
          title={formatAutomationNextTitle(job, locale, tx)}
        >
          {schedule}
          <span className="mx-1.5 text-muted-foreground/45">·</span>
          {nextRun}
        </span>
      </button>

      <div
        className="flex shrink-0 items-center gap-1.5"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <ToggleButton
          checked={job.enabled}
          disabled={!canToggle || toggleBusy}
          onChange={(checked) => {
            if (checked === job.enabled) return;
            void onAction(checked ? "enable" : "disable", job);
          }}
          label={
            job.enabled
              ? tx("settings.automations.pause", "Pause")
              : tx("settings.automations.resume", "Resume")
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={menuBusy}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-50"
              aria-label={tx("settings.automations.moreActions", "More actions")}
            >
              {actionKey?.endsWith(`:${job.id}`) ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem
              disabled={!canRun || menuBusy}
              onClick={() => void onAction("run", job)}
            >
              <PlayCircle className="mr-2 h-4 w-4" aria-hidden />
              {tx("settings.automations.runNow", "Run now")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={menuBusy}
              onClick={() => onRequestDelete(job)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              {tx("settings.automations.delete", "Delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function AutomationDetailPanel({
  job,
  locale,
  actionKey,
  onAction,
  onRequestEdit,
  onRequestDelete,
  sheetLayout = false,
  onClose,
}: {
  job: SessionAutomationJob;
  locale: string;
  actionKey: string | null;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => void | Promise<void>;
  onRequestEdit: (job: SessionAutomationJob) => void;
  onRequestDelete: (job: SessionAutomationJob) => void;
  sheetLayout?: boolean;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const status = automationStatus(job, tx);
  const origin = automationOriginLabel(job, tx);
  const originHref = job.origin?.channel === "websocket" && job.origin.session_key
    ? `#/chat/${encodeURIComponent(job.origin.session_key)}`
    : null;
  const created = job.created_at_ms ? fmtDateTime(job.created_at_ms, locale) : null;
  const updated = job.updated_at_ms ? fmtDateTime(job.updated_at_ms, locale) : null;
  const message = job.payload.message || tx("settings.automations.systemTask", "System-managed automation");
  const schedule = formatAutomationSchedule(job, locale, tx);
  const [messageExpanded, setMessageExpanded] = useState(false);
  const messageNeedsExpansion = automationMessageNeedsExpansion(message);

  useEffect(() => {
    setMessageExpanded(false);
  }, [job.id]);

  return (
    <article className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background/42 dark:bg-background/18">
      <div className="shrink-0 border-b border-border/35 px-4 py-3.5 dark:border-white/10 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate text-[18px] font-medium leading-7 text-foreground">
                {job.name || job.id}
              </h3>
              <AutomationStatusBadge tone={status.tone}>{status.label}</AutomationStatusBadge>
              {job.delete_after_run ? (
                <AutomationStatusBadge>{tx("settings.automations.oneShot", "One-time")}</AutomationStatusBadge>
              ) : null}
            </div>
            <p className="mt-1 truncate text-[12.5px] leading-5 text-muted-foreground">
              {schedule} · {origin}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AutomationActionGroup
              job={job}
              actionKey={actionKey}
              onAction={onAction}
              onRequestEdit={onRequestEdit}
              onRequestDelete={onRequestDelete}
            />
            {sheetLayout && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                aria-label={tx("settings.automations.closeDetail", "Close")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_14.5rem]">
        <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <section className="rounded-[20px] border border-border/35 bg-background/62 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] dark:border-white/10 dark:bg-background/24">
            <div className="text-[11px] font-medium leading-none text-muted-foreground/75">
              {tx("settings.automations.fields.message", "Message")}
            </div>
            <div
              className={cn(
                "mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground/85",
                !messageExpanded && messageNeedsExpansion && "line-clamp-6",
              )}
            >
              {message}
            </div>
            {messageNeedsExpansion ? (
              <button
                type="button"
                className="mt-3 inline-flex text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setMessageExpanded((value) => !value)}
              >
                {messageExpanded
                  ? tx("settings.automations.message.showLess", "Show less")
                  : tx("settings.automations.message.showMore", "Show full message")}
              </button>
            ) : null}
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            <AutomationDetail
              label={tx("settings.automations.labels.next", "Next")}
              title={formatAutomationNextTitle(job, locale, tx)}
            >
              {formatAutomationNext(job, tx)}
            </AutomationDetail>
            <AutomationDetail label={tx("settings.automations.labels.origin", "Linked chat")} title={origin}>
              {originHref ? (
                <a
                  className="inline-flex max-w-full items-center gap-1 text-foreground/80 underline-offset-2 hover:underline"
                  href={originHref}
                >
                  <span className="truncate">{origin}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
              ) : (
                origin
              )}
            </AutomationDetail>
          </div>

          {job.state.last_error ? (
            <div className="rounded-[16px] border border-destructive/20 bg-destructive/8 px-3 py-2 text-[12px] leading-5 text-destructive">
              {job.state.last_error}
            </div>
          ) : null}
        </div>

        <aside className="min-h-0 overflow-y-auto overscroll-contain border-t border-border/35 bg-muted/20 p-4 text-[12px] text-muted-foreground dark:border-white/10 dark:bg-background/16 lg:border-l lg:border-t-0">
          <div className="grid gap-3">
            <AutomationDetail
              label={tx("settings.automations.labels.schedule", "Schedule")}
              title={schedule}
            >
              {schedule}
            </AutomationDetail>
            <div className="rounded-[18px] bg-background/55 p-3">
              <div className="grid gap-3">
                {created ? (
                  <div>
                    <div className="text-[11px] leading-none text-muted-foreground/75">
                      {tx("settings.automations.labels.created", "Created")}
                    </div>
                    <div className="mt-1.5 text-[12.5px] leading-5 text-foreground/80">{created}</div>
                  </div>
                ) : null}
                {updated ? (
                  <div>
                    <div className="text-[11px] leading-none text-muted-foreground/75">
                      {tx("settings.automations.labels.updated", "Updated")}
                    </div>
                    <div className="mt-1.5 text-[12.5px] leading-5 text-foreground/80">{updated}</div>
                  </div>
                ) : null}
                <div>
                  <div className="text-[11px] leading-none text-muted-foreground/75">ID</div>
                  <div className="mt-1.5 break-all font-mono text-[11.5px] leading-5 text-foreground/70">
                    {job.id}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}

function AutomationActionGroup({
  job,
  actionKey,
  onAction,
  onRequestEdit,
  onRequestDelete,
}: {
  job: SessionAutomationJob;
  actionKey: string | null;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => void | Promise<void>;
  onRequestEdit: (job: SessionAutomationJob) => void;
  onRequestDelete: (job: SessionAutomationJob) => void;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const canManage = !job.protected;
  const hasLinkedChat = Boolean(job.origin);
  const canRun = canManage && hasLinkedChat && job.enabled && !job.state.pending;
  const toggleAction: AutomationAction = job.enabled ? "disable" : "enable";
  const canToggle = canManage && (job.enabled || hasLinkedChat);
  const toggleBusy = actionKey === `${toggleAction}:${job.id}`;

  if (!canManage) {
    return (
      <span className="inline-flex h-9 items-center rounded-full bg-muted px-3 text-[12px] font-medium text-muted-foreground">
        {tx("settings.automations.protected", "Protected")}
      </span>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/35 bg-background/70 p-1 shadow-[0_10px_26px_rgba(15,23,42,0.055)] dark:border-white/10 dark:bg-background/35">
      <AppsActionButton
        ariaLabel={tx("settings.automations.edit", "Edit")}
        disabled={Boolean(actionKey)}
        onClick={() => onRequestEdit(job)}
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </AppsActionButton>
      <AppsActionButton
        ariaLabel={tx("settings.automations.runNow", "Run now")}
        busy={actionKey === `run:${job.id}`}
        disabled={!canRun}
        onClick={() => void onAction("run", job)}
      >
        <PlayCircle className="h-4 w-4" aria-hidden />
      </AppsActionButton>
      <AppsActionButton
        ariaLabel={
          job.enabled
            ? tx("settings.automations.pause", "Pause")
            : tx("settings.automations.resume", "Resume")
        }
        busy={toggleBusy}
        disabled={!canToggle}
        onClick={() => void onAction(toggleAction, job)}
      >
        {job.enabled ? (
          <PauseCircle className="h-4 w-4" aria-hidden />
        ) : (
          <PlayCircle className="h-4 w-4" aria-hidden />
        )}
      </AppsActionButton>
      <AppsActionButton
        ariaLabel={tx("settings.automations.delete", "Delete")}
        tone="danger"
        disabled={Boolean(actionKey)}
        onClick={() => onRequestDelete(job)}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </AppsActionButton>
    </div>
  );
}

function AutomationStatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium shadow-[inset_0_0_0_1px_rgba(120,72,25,0.055)]",
        tone === "success" &&
          "bg-orange-100/72 text-orange-800 dark:bg-orange-300/12 dark:text-orange-200",
        tone === "warning" &&
          "bg-amber-100/80 text-amber-800 dark:bg-amber-300/14 dark:text-amber-200",
        tone === "neutral" &&
          "bg-white/64 text-muted-foreground dark:bg-background/35 dark:text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function automationMessageNeedsExpansion(message: string): boolean {
  return message.length > 360 || message.split(/\r?\n/).length > 6;
}

function AutomationDetail({
  label,
  title,
  secondary,
  children,
}: {
  label: string;
  title?: string;
  secondary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[17px] bg-background/52 px-3 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.035)] dark:bg-background/22">
      <div className="text-[11px] font-medium leading-none text-muted-foreground/75">
        {label}
      </div>
      <div className="mt-1.5 min-w-0">
        <div className="line-clamp-2 text-[13px] leading-5 text-foreground/85" title={title}>
          {children}
        </div>
        {secondary ? (
          <div className="mt-0.5 truncate text-[11.5px] leading-4 text-muted-foreground" title={title}>
            {secondary}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type AutomationEveryUnit = "second" | "minute" | "hour" | "day";

type AutomationEditDraft = {
  name: string;
  message: string;
  scheduleKind: "at" | "every" | "cron";
  everyValue: string;
  everyUnit: AutomationEveryUnit;
  cronExpr: string;
  tz: string;
  atLocal: string;
};
type AutomationScheduleUpdate = NonNullable<AutomationUpdatePayload["schedule"]>;

type AutomationCreateDraft = AutomationEditDraft & {
  sessionId: string;
  dailyTime: string;
};

const AUTOMATION_EVERY_UNITS: Array<{ value: AutomationEveryUnit; ms: number }> = [
  { value: "second", ms: 1000 },
  { value: "minute", ms: 60_000 },
  { value: "hour", ms: 3_600_000 },
  { value: "day", ms: 86_400_000 },
];

function automationCreateDraftFromPrefill(
  prefill: { name?: string; message?: string } | null,
): AutomationCreateDraft {
  const base = automationDraftFromJob(null);
  const tz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      : "";
  return {
    ...base,
    name: prefill?.name?.trim() || "",
    message: prefill?.message?.trim() || "",
    scheduleKind: "cron",
    cronExpr: "0 9 * * *",
    dailyTime: "09:00",
    tz,
    sessionId: "",
  };
}

function cronExprFromDailyTime(dailyTime: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(dailyTime.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${minute} ${hour} * * *`;
}

export function AutomationCreateDialog({
  open,
  prefill,
  token,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  prefill: { name?: string; message?: string } | null;
  token: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: {
    name: string;
    message: string;
    session_id: string;
    schedule: AutomationScheduleUpdate;
    delete_after_run?: boolean;
  }) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const [draft, setDraft] = useState<AutomationCreateDraft>(() =>
    automationCreateDraftFromPrefill(prefill),
  );
  const [sessions, setSessions] = useState<ChatSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [tipVisible, setTipVisible] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(automationCreateDraftFromPrefill(prefill));
    setTipVisible(true);
    setSubmitError(null);
    let cancelled = false;
    setSessionsLoading(true);
    void listSessions(token)
      .then((rows) => {
        if (cancelled) return;
        const sorted = [...rows].sort((a, b) =>
          (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""),
        );
        setSessions(sorted);
        setDraft((prev) => {
          if (prev.sessionId && sorted.some((row) => bareSessionId(row) === prev.sessionId)) {
            return prev;
          }
          const first = sorted[0];
          return first ? { ...prev, sessionId: bareSessionId(first) } : prev;
        });
      })
      .catch((err) => {
        if (!cancelled) setSubmitError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, prefill, token]);

  const scheduleOptions = [
    { value: "cron", label: tx("settings.automations.scheduleTypes.periodic", "Periodic") },
    { value: "every", label: tx("settings.automations.scheduleTypes.every", "Interval") },
    { value: "at", label: tx("settings.automations.scheduleTypes.at", "Once") },
  ];
  const unitLabels: Record<AutomationEveryUnit, string> = {
    second: tx("settings.automations.everyUnits.second", "Seconds"),
    minute: tx("settings.automations.everyUnits.minute", "Minutes"),
    hour: tx("settings.automations.everyUnits.hour", "Hours"),
    day: tx("settings.automations.everyUnits.day", "Days"),
  };

  const validation = (() => {
    const base = automationEditDraftError(
      draft.scheduleKind === "cron"
        ? { ...draft, cronExpr: cronExprFromDailyTime(draft.dailyTime) || "" }
        : draft,
      null,
      tx,
    );
    if (base) return base;
    if (!draft.sessionId.trim()) {
      return tx("settings.automations.validation.sessionRequired", "Select a linked chat.");
    }
    return null;
  })();

  const titleLabel =
    draft.name.trim() || tx("settings.automations.createUntitled", "New automation");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validation) return;
    const name = draft.name.trim();
    const message = draft.message.trim();
    const sessionId = draft.sessionId.trim();
    let scheduleDraft = draft;
    if (draft.scheduleKind === "cron") {
      const expr = cronExprFromDailyTime(draft.dailyTime);
      if (!expr) return;
      scheduleDraft = { ...draft, cronExpr: expr };
    }
    const schedule = automationSchedulePayloadFromDraft(scheduleDraft);
    if (typeof schedule === "string") return;
    setSubmitError(null);
    try {
      await onSave({
        name,
        message,
        session_id: sessionId,
        schedule,
        delete_after_run: schedule.kind === "at",
      });
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="flex max-h-[min(92vh,44rem)] w-[min(calc(100vw-1.5rem),36rem)] flex-col gap-0 overflow-hidden rounded-[26px] p-0"
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submit(event)}>
          <DialogTitle className="sr-only">
            {tx("settings.automations.add", "Add automation")}
          </DialogTitle>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-5 py-3.5">
            <div className="min-w-0 truncate text-[13.5px] text-muted-foreground">
              <span>{tx("settings.nav.automations", "Scheduled tasks")}</span>
              <span className="mx-1.5 text-muted-foreground/50">/</span>
              <span className="font-medium text-foreground">{titleLabel}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => onOpenChange(false)}
                className="h-9 rounded-xl px-3.5"
              >
                {tx("settings.automations.cancel", "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={Boolean(validation) || saving || sessionsLoading}
                className="h-9 rounded-xl px-3.5"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                {tx("settings.automations.save", "Save")}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {tipVisible ? (
              <div className="flex items-start gap-2 rounded-2xl border border-sky-200/80 bg-sky-50 px-3.5 py-3 text-[12.5px] leading-5 text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-50">
                <span className="shrink-0 font-semibold">
                  {tx("settings.automations.createTipLabel", "Tip")}
                </span>
                <p className="min-w-0 flex-1">
                  {tx(
                    "settings.automations.createTip",
                    "Keep the minibot client running while automations are scheduled. If the machine sleeps or the app exits, tasks will not fire on time.",
                  )}
                </p>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-0.5 text-sky-800/70 hover:bg-sky-100 hover:text-sky-950 dark:text-sky-100/70 dark:hover:bg-sky-500/20"
                  aria-label={tx("settings.automations.dismissTip", "Dismiss tip")}
                  onClick={() => setTipVisible(false)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ) : null}

            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">
                {tx("settings.automations.fields.name", "Name")}
              </span>
              <Input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                className="h-10 rounded-[12px]"
                placeholder={tx("settings.automations.fields.namePlaceholder", "Daily AI news")}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">
                {tx("settings.automations.fields.session", "Linked chat")}
              </span>
              <select
                value={draft.sessionId}
                disabled={sessionsLoading || !sessions.length}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, sessionId: event.target.value }))
                }
                className="h-10 w-full rounded-[12px] border border-input bg-background px-3 text-[13px] text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {!sessions.length ? (
                  <option value="">
                    {sessionsLoading
                      ? tx("settings.automations.fields.sessionLoading", "Loading chats…")
                      : tx("settings.automations.fields.sessionEmpty", "No chats yet — start one first")}
                  </option>
                ) : (
                  sessions.map((session) => {
                    const id = bareSessionId(session);
                    const label =
                      session.title?.trim() ||
                      session.preview?.trim() ||
                      id;
                    return (
                      <option key={session.key} value={id}>
                        {label}
                      </option>
                    );
                  })
                )}
              </select>
              <span className="block text-[11.5px] leading-4 text-muted-foreground">
                {tx(
                  "settings.automations.fields.sessionHelp",
                  "Runs in this chat’s context so replies and history stay attached.",
                )}
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">
                {tx("settings.automations.fields.prompt", "Prompt")}
              </span>
              <Textarea
                value={draft.message}
                onChange={(event) => setDraft((prev) => ({ ...prev, message: event.target.value }))}
                className="min-h-[160px] resize-none rounded-[12px] text-[13px] leading-5"
                placeholder={tx(
                  "settings.automations.fields.promptPlaceholder",
                  "What should minibot do when this task runs?",
                )}
              />
            </label>

            <div className="space-y-2">
              <span className="text-[12px] font-medium text-muted-foreground">
                {tx("settings.automations.fields.frequency", "Frequency")}
              </span>
              <SegmentedControl
                value={draft.scheduleKind}
                options={scheduleOptions}
                onChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    scheduleKind: value as AutomationEditDraft["scheduleKind"],
                  }))
                }
              />
            </div>

            {draft.scheduleKind === "cron" ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="inline-flex h-10 items-center rounded-[12px] border border-input bg-muted/40 px-3 text-[13px] text-foreground">
                  {tx("settings.automations.fields.everyDay", "Every day")}
                </div>
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {tx("settings.automations.fields.time", "Time")}
                  </span>
                  <Input
                    type="time"
                    value={draft.dailyTime}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, dailyTime: event.target.value }))
                    }
                    className="h-10 w-[9.5rem] rounded-[12px]"
                  />
                </label>
              </div>
            ) : null}

            {draft.scheduleKind === "every" ? (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {tx("settings.automations.fields.every", "Every")}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={draft.everyValue}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, everyValue: event.target.value }))
                    }
                    className="h-10 rounded-[12px]"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {tx("settings.automations.fields.unit", "Unit")}
                  </span>
                  <select
                    value={draft.everyUnit}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        everyUnit: event.target.value as AutomationEveryUnit,
                      }))
                    }
                    className="h-10 w-full rounded-[12px] border border-input bg-background px-3 text-[13px] text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {AUTOMATION_EVERY_UNITS.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unitLabels[unit.value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {draft.scheduleKind === "at" ? (
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {tx("settings.automations.fields.runAt", "Run at")}
                </span>
                <Input
                  type="datetime-local"
                  value={draft.atLocal}
                  onChange={(event) => setDraft((prev) => ({ ...prev, atLocal: event.target.value }))}
                  className="h-10 rounded-[12px]"
                />
              </label>
            ) : null}

            {validation ? (
              <div className="rounded-[12px] bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
                {validation}
              </div>
            ) : null}
            {submitError ? (
              <div className="rounded-[12px] bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
                {submitError}
              </div>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AutomationEditDialog({
  job,
  saving,
  onOpenChange,
  onSave,
}: {
  job: SessionAutomationJob | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (job: SessionAutomationJob, values: AutomationUpdatePayload) => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  const locale = i18n.resolvedLanguage || i18n.language;
  const [draft, setDraft] = useState<AutomationEditDraft>(() => automationDraftFromJob(null));

  useEffect(() => {
    setDraft(automationDraftFromJob(job));
  }, [job]);

  const validation = automationEditDraftError(draft, job, tx);
  const scheduleOptions = [
    { value: "every", label: tx("settings.automations.scheduleTypes.every", "Interval") },
    { value: "cron", label: tx("settings.automations.scheduleTypes.cron", "Cron") },
    { value: "at", label: tx("settings.automations.scheduleTypes.at", "Once") },
  ];
  const unitLabels: Record<AutomationEveryUnit, string> = {
    second: tx("settings.automations.everyUnits.second", "Seconds"),
    minute: tx("settings.automations.everyUnits.minute", "Minutes"),
    hour: tx("settings.automations.everyUnits.hour", "Hours"),
    day: tx("settings.automations.everyUnits.day", "Days"),
  };
  const origin = job ? automationOriginLabel(job, tx) : "";
  const nextRun = job ? formatAutomationNext(job, tx) : "";
  const originHref =
    job?.origin?.channel === "websocket" && job.origin.session_key
      ? `#/chat/${encodeURIComponent(job.origin.session_key)}`
      : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = automationUpdatePayloadFromDraft(draft, job);
    if (!job || typeof payload === "string") return;
    void onSave(job, payload);
  };

  return (
    <Dialog open={Boolean(job)} onOpenChange={onOpenChange}>
      {job ? (
        <DialogContent
          aria-describedby={undefined}
          className="flex max-h-[min(92vh,40rem)] w-[min(calc(100vw-2rem),34rem)] flex-col gap-0 overflow-hidden rounded-[26px] p-0"
        >
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <DialogHeader className="shrink-0 border-b border-border/40 px-5 py-4 text-left">
              <DialogTitle>{tx("settings.automations.editTitle", "Edit automation")}</DialogTitle>
              <div className="mt-2 grid gap-1.5 text-[12px] leading-5 text-muted-foreground">
                <div>
                  <span className="text-muted-foreground/75">
                    {tx("settings.automations.labels.next", "Next")}
                  </span>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  <span title={formatAutomationNextTitle(job, locale, tx)}>{nextRun}</span>
                </div>
                <div className="min-w-0 truncate">
                  <span className="text-muted-foreground/75">
                    {tx("settings.automations.labels.origin", "Linked chat")}
                  </span>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  {originHref ? (
                    <a
                      className="text-foreground/80 underline-offset-2 hover:underline"
                      href={originHref}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {origin}
                    </a>
                  ) : (
                    origin
                  )}
                </div>
                <div className="min-w-0 truncate font-mono text-[11px]">
                  ID · {job.id}
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {tx("settings.automations.fields.name", "Name")}
                </span>
                <Input
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="h-10 rounded-[12px]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {tx("settings.automations.fields.message", "Message")}
                </span>
                <Textarea
                  value={draft.message}
                  onChange={(event) => setDraft((prev) => ({ ...prev, message: event.target.value }))}
                  className="min-h-[160px] resize-none rounded-[12px] text-[13px] leading-5"
                />
              </label>

              <div className="space-y-2">
                <span className="text-[12px] font-medium text-muted-foreground">
                  {tx("settings.automations.fields.scheduleType", "Schedule type")}
                </span>
                <SegmentedControl
                  value={draft.scheduleKind}
                  options={scheduleOptions}
                  onChange={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      scheduleKind: value as AutomationEditDraft["scheduleKind"],
                    }))
                  }
                />
              </div>

              {draft.scheduleKind === "every" ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      {tx("settings.automations.fields.every", "Every")}
                    </span>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={draft.everyValue}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, everyValue: event.target.value }))
                      }
                      className="h-10 rounded-[12px]"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      {tx("settings.automations.fields.unit", "Unit")}
                    </span>
                    <select
                      value={draft.everyUnit}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          everyUnit: event.target.value as AutomationEveryUnit,
                        }))
                      }
                      className="h-10 w-full rounded-[12px] border border-input bg-background px-3 text-[13px] text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {AUTOMATION_EVERY_UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unitLabels[unit.value]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {draft.scheduleKind === "cron" ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      {tx("settings.automations.fields.cronExpression", "Cron expression")}
                    </span>
                    <Input
                      value={draft.cronExpr}
                      onChange={(event) => setDraft((prev) => ({ ...prev, cronExpr: event.target.value }))}
                      placeholder="0 9 * * *"
                      className="h-10 rounded-[12px] font-mono text-[13px]"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      {tx("settings.automations.fields.timezone", "Timezone")}
                    </span>
                    <Input
                      value={draft.tz}
                      onChange={(event) => setDraft((prev) => ({ ...prev, tz: event.target.value }))}
                      placeholder="Asia/Shanghai"
                      className="h-10 rounded-[12px] text-[13px]"
                    />
                  </label>
                </div>
              ) : null}

              {draft.scheduleKind === "at" ? (
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {tx("settings.automations.fields.runAt", "Run at")}
                  </span>
                  <Input
                    type="datetime-local"
                    value={draft.atLocal}
                    onChange={(event) => setDraft((prev) => ({ ...prev, atLocal: event.target.value }))}
                    className="h-10 rounded-[12px]"
                  />
                </label>
              ) : null}

              {validation ? (
                <div className="rounded-[12px] bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
                  {validation}
                </div>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 border-t border-border/40 px-5 py-3.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="rounded-full"
              >
                {tx("settings.automations.cancel", "Cancel")}
              </Button>
              <Button type="submit" disabled={Boolean(validation) || saving} className="rounded-full">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                {tx("settings.automations.save", "Save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function AutomationDeleteDialog({
  job,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  job: SessionAutomationJob | null;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (job: SessionAutomationJob) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string, values?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...(values ?? {}) });
  return (
    <Dialog open={Boolean(job)} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(calc(100vw-2rem),26rem)] rounded-[26px]">
        <DialogHeader>
          <DialogTitle>{tx("settings.automations.deleteTitle", "Delete automation")}</DialogTitle>
          <DialogDescription>
            {tx(
              "settings.automations.deleteDescription",
              "This removes {{name}} from the cron store. Past chat messages stay in the session.",
              { name: job?.name || job?.id || "" },
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            className="rounded-full"
          >
            {tx("settings.automations.cancel", "Cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => job && void onConfirm(job)}
            disabled={!job || deleting}
            className="rounded-full"
          >
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            {tx("settings.automations.delete", "Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function automationNeedsAttention(job: SessionAutomationJob): boolean {
  return job.state.last_status === "error";
}

function automationStatusKey(
  job: SessionAutomationJob,
): "active" | "running" | "paused" | "failed" | "system" | "completed" | "idle" {
  if (job.protected) return "system";
  if (job.state.pending) return "running";
  if (!job.enabled) return "paused";
  if (job.state.last_status === "error") return "failed";
  if (job.delete_after_run && !job.state.next_run_at_ms && job.state.last_status === "ok") {
    return "completed";
  }
  if (!job.state.next_run_at_ms) return "idle";
  return "active";
}

function systemJobRank(job: SessionAutomationJob): number {
  if (job.id === "heartbeat" || job.name === "heartbeat") return 0;
  if (job.id === "dream" || job.name === "dream") return 1;
  return 2;
}

function sortAutomationJobs(jobs: SessionAutomationJob[], sort: AutomationSort): SessionAutomationJob[] {
  const byName = (left: SessionAutomationJob, right: SessionAutomationJob) =>
    (left.name || left.id).localeCompare(right.name || right.id);
  return [...jobs].sort((left, right) => {
    // System tasks always pin to the top of the scheduled-task list.
    const leftProtected = left.protected ? 0 : 1;
    const rightProtected = right.protected ? 0 : 1;
    if (leftProtected !== rightProtected) return leftProtected - rightProtected;
    if (left.protected && right.protected) {
      const rank = systemJobRank(left) - systemJobRank(right);
      if (rank !== 0) return rank;
    }
    if (sort === "name") return byName(left, right);
    if (sort === "last") {
      return (right.state.last_run_at_ms ?? 0) - (left.state.last_run_at_ms ?? 0) || byName(left, right);
    }
    if (sort === "updated") {
      return (right.updated_at_ms ?? 0) - (left.updated_at_ms ?? 0) || byName(left, right);
    }
    const leftNext = left.state.next_run_at_ms ?? Number.MAX_SAFE_INTEGER;
    const rightNext = right.state.next_run_at_ms ?? Number.MAX_SAFE_INTEGER;
    return leftNext - rightNext || byName(left, right);
  });
}

function automationDraftFromJob(job: SessionAutomationJob | null): AutomationEditDraft {
  const every = automationIntervalDraft(job?.schedule.every_ms ?? 3_600_000);
  const scheduleKind = job?.schedule.kind === "at" || job?.schedule.kind === "cron"
    ? job.schedule.kind
    : "every";
  return {
    name: job?.name ?? "",
    message: job?.payload.message ?? "",
    scheduleKind,
    everyValue: every.value,
    everyUnit: every.unit,
    cronExpr: job?.schedule.expr ?? "0 9 * * *",
    tz: job?.schedule.tz ?? "",
    atLocal: formatLocalDateTimeInput(job?.schedule.at_ms ?? Date.now() + 3_600_000),
  };
}

function automationIntervalDraft(ms: number): { value: string; unit: AutomationEveryUnit } {
  for (const unit of [...AUTOMATION_EVERY_UNITS].reverse()) {
    if (ms >= unit.ms && ms % unit.ms === 0) {
      return { value: String(ms / unit.ms), unit: unit.value };
    }
  }
  return { value: String(Math.max(1, Math.round(ms / 60_000))), unit: "minute" };
}

function formatLocalDateTimeInput(ms: number): string {
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(ms - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function automationEditDraftError(
  draft: AutomationEditDraft,
  job: SessionAutomationJob | null,
  tx: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): string | null {
  if (!draft.name.trim()) return tx("settings.automations.validation.nameRequired", "Name is required.");
  if (!draft.message.trim()) {
    return tx("settings.automations.validation.messageRequired", "Message is required.");
  }
  if (draft.scheduleKind === "every") {
    const value = Number(draft.everyValue);
    if (!Number.isInteger(value) || value <= 0) {
      return tx("settings.automations.validation.intervalRequired", "Interval must be a positive number.");
    }
  }
  if (draft.scheduleKind === "cron" && !draft.cronExpr.trim()) {
    return tx("settings.automations.validation.cronRequired", "Cron expression is required.");
  }
  if (draft.scheduleKind === "at") {
    const atMs = new Date(draft.atLocal).getTime();
    if (!Number.isFinite(atMs)) {
      return tx("settings.automations.validation.timeRequired", "Run time is required.");
    }
    if (atMs <= Date.now() && automationScheduleChanged(draft, job)) {
      return tx("settings.automations.validation.futureRequired", "Run time must be in the future.");
    }
  }
  return null;
}

function automationUpdatePayloadFromDraft(
  draft: AutomationEditDraft,
  job: SessionAutomationJob | null,
): AutomationUpdatePayload | string {
  const name = draft.name.trim();
  const message = draft.message.trim();
  if (!name || !message) return "invalid";
  const payload: AutomationUpdatePayload = { name, message };
  const schedule = automationSchedulePayloadFromDraft(draft);
  if (typeof schedule === "string") return schedule;
  if (automationScheduleChanged(draft, job, schedule)) {
    payload.schedule = schedule;
  }
  return payload;
}

function automationSchedulePayloadFromDraft(draft: AutomationEditDraft): AutomationScheduleUpdate | string {
  if (draft.scheduleKind === "every") {
    const unit = AUTOMATION_EVERY_UNITS.find((candidate) => candidate.value === draft.everyUnit);
    const value = Number(draft.everyValue);
    if (!unit || !Number.isInteger(value) || value <= 0) return "invalid";
    return { kind: "every", every_ms: value * unit.ms };
  } else if (draft.scheduleKind === "cron") {
    const expr = draft.cronExpr.trim();
    if (!expr) return "invalid";
    return { kind: "cron", expr, ...(draft.tz.trim() ? { tz: draft.tz.trim() } : {}) };
  } else {
    const atMs = new Date(draft.atLocal).getTime();
    if (!Number.isFinite(atMs)) return "invalid";
    return { kind: "at", at_ms: atMs };
  }
}

function automationScheduleChanged(
  draft: AutomationEditDraft,
  job: SessionAutomationJob | null,
  schedule: AutomationScheduleUpdate | string = automationSchedulePayloadFromDraft(draft),
): boolean {
  if (!job || typeof schedule === "string") return true;
  if (schedule.kind !== job.schedule.kind) return true;
  if (schedule.kind === "every") return schedule.every_ms !== job.schedule.every_ms;
  if (schedule.kind === "cron") {
    return schedule.expr !== (job.schedule.expr ?? "") || (schedule.tz ?? null) !== (job.schedule.tz ?? null);
  }
  return draft.atLocal !== formatLocalDateTimeInput(job.schedule.at_ms ?? NaN);
}

type AutomationSearchField = "id" | "name" | "message" | "chat" | "cron" | "schedule" | "status";

interface AutomationSearchToken {
  field: AutomationSearchField | null;
  value: string;
}

const AUTOMATION_SEARCH_FIELDS = new Set<AutomationSearchField>([
  "id",
  "name",
  "message",
  "chat",
  "cron",
  "schedule",
  "status",
]);

const AUTOMATION_CHANNEL_LABELS: Record<string, string> = {
  api: "API",
  cli: "CLI",
  dingtalk: "DingTalk",
  discord: "Discord",
  email: "Email",
  feishu: "Feishu",
  matrix: "Matrix",
  msteams: "Microsoft Teams",
  qq: "QQ",
  slack: "Slack",
  telegram: "Telegram",
  wechat: "WeChat",
  wecom: "WeCom",
  weixin: "WeChat",
  whatsapp: "WhatsApp",
};

function parseAutomationSearchQuery(query: string): AutomationSearchToken[] {
  return (query.match(/[^\s:]+:"[^"]+"|"[^"]+"|\S+/g) ?? [])
    .map((rawPart): AutomationSearchToken | null => {
      const part = trimAutomationSearchValue(rawPart);
      if (!part) return null;
      const fieldMatch = part.match(/^([A-Za-z]+):(.*)$/);
      if (!fieldMatch) return { field: null, value: part.toLowerCase() };
      const field = fieldMatch[1].toLowerCase() as AutomationSearchField;
      const value = trimAutomationSearchValue(fieldMatch[2]).toLowerCase();
      if (!value) return null;
      return AUTOMATION_SEARCH_FIELDS.has(field)
        ? { field, value }
        : { field: null, value: part.toLowerCase() };
    })
    .filter((token): token is AutomationSearchToken => Boolean(token));
}

function trimAutomationSearchValue(value: string): string {
  return value.trim().replace(/^"|"$/g, "").trim();
}

function automationMatchesSearch(job: SessionAutomationJob, tokens: AutomationSearchToken[]): boolean {
  return tokens.every((token) => automationSearchText(job, token.field).includes(token.value));
}

function automationSearchText(job: SessionAutomationJob, field: AutomationSearchField | null = null): string {
  return automationSearchParts(job, field)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function automationSearchParts(
  job: SessionAutomationJob,
  field: AutomationSearchField | null,
): Array<string | number | null | undefined> {
  const originParts = automationOriginSearchParts(job);
  const scheduleParts = automationScheduleSearchParts(job);
  if (field === "id") return [job.id];
  if (field === "name") return [job.name, job.id];
  if (field === "message") return [job.payload.message];
  if (field === "chat") return originParts;
  if (field === "cron" || field === "schedule") return scheduleParts;
  if (field === "status") return [automationStatusKey(job), job.enabled ? "enabled" : "disabled"];
  return [
    job.id,
    job.name,
    job.payload.message,
    ...scheduleParts,
    automationStatusKey(job),
    ...originParts,
  ];
}

function automationOriginSearchParts(job: SessionAutomationJob): Array<string | null | undefined> {
  const origin = job.origin;
  if (!origin) return [];
  const channel = origin.channel.trim().toLowerCase();
  return [
    origin.session_key,
    origin.title,
    origin.preview,
    origin.channel,
    AUTOMATION_CHANNEL_LABELS[channel],
  ];
}

function automationScheduleSearchParts(job: SessionAutomationJob): Array<string | number | null | undefined> {
  const schedule = job.schedule;
  const parts: Array<string | number | null | undefined> = [
    schedule.kind,
    schedule.expr,
    schedule.tz,
    schedule.every_ms,
    schedule.at_ms,
  ];
  if (schedule.kind === "cron" && schedule.expr) {
    parts.push(...automationCronSearchParts(schedule.expr));
  }
  return parts;
}

function automationCronSearchParts(expr: string): string[] {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return [];
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const everyDay = dayOfMonth === "*" && month === "*" && dayOfWeek === "*";
  const numericMinute = cronNumericToken(minute, 59);
  const numericHour = cronNumericToken(hour, 23);
  if (numericMinute === null) return [];
  const paddedMinute = String(numericMinute).padStart(2, "0");

  if (numericHour !== null) {
    const time = `${String(numericHour).padStart(2, "0")}:${paddedMinute}`;
    return [time, `:${paddedMinute}`];
  }

  if (everyDay && hour === "*") {
    return [`:${paddedMinute}`, `hourly at :${paddedMinute}`];
  }

  const range = /^(\d{1,2})-(\d{1,2})$/.exec(hour);
  if (!everyDay || !range) return [];
  const start = Number(range[1]);
  const end = Number(range[2]);
  if (start > 23 || end > 23) return [];
  const paddedRange = `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
  const rawRange = `${start}-${end}`;
  return [
    paddedRange,
    rawRange,
    `:${paddedMinute}`,
    `${paddedRange} at :${paddedMinute}`,
    `hourly ${paddedRange} at :${paddedMinute}`,
  ];
}

function automationMatchesFilter(job: SessionAutomationJob, filter: AutomationFilter): boolean {
  const status = automationStatusKey(job);
  if (filter === "active") return status === "active" || status === "running";
  if (filter === "paused") return status === "paused";
  if (filter === "failed") return automationNeedsAttention(job);
  if (filter === "system") return Boolean(job.protected);
  return true;
}

function automationStatus(
  job: SessionAutomationJob,
  tx: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): { label: string; tone: "neutral" | "success" | "warning" } {
  const status = automationStatusKey(job);
  if (status === "system") return { label: tx("settings.automations.status.system", "System"), tone: "neutral" };
  if (status === "running") {
    return { label: tx("settings.automations.status.running", "Running now"), tone: "warning" };
  }
  if (status === "paused") return { label: tx("settings.automations.status.paused", "Paused"), tone: "neutral" };
  if (status === "failed") {
    return { label: tx("settings.automations.status.failed", "Failed"), tone: "warning" };
  }
  if (status === "completed") {
    return { label: tx("settings.automations.status.completed", "Completed"), tone: "neutral" };
  }
  if (status === "idle") {
    return { label: tx("settings.automations.status.noSchedule", "No schedule"), tone: "neutral" };
  }
  return { label: tx("settings.automations.status.active", "Active"), tone: "success" };
}

function automationOriginLabel(
  job: SessionAutomationJob,
  tx: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): string {
  if (job.protected) return tx("settings.automations.origin.system", "System");
  const origin = job.origin;
  if (!origin) return tx("settings.automations.origin.unknown", "No linked chat");
  if (origin.channel !== "websocket") return automationChannelLabel(origin.channel, tx);
  return origin.title || origin.preview || origin.session_key || automationChannelLabel(origin.channel, tx);
}

function automationChannelLabel(
  channel: string,
  tx: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): string {
  const key = channel.trim().toLowerCase();
  return AUTOMATION_CHANNEL_LABELS[key]
    ? tx(`settings.automations.channels.${key}`, AUTOMATION_CHANNEL_LABELS[key])
    : channel;
}

function formatAutomationSchedule(
  job: SessionAutomationJob,
  locale: string,
  tx: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): string {
  if (job.schedule.kind === "at" && job.schedule.at_ms) {
    return tx("settings.automations.schedule.at", "At {{time}}", {
      time: fmtDateTime(job.schedule.at_ms, locale),
    });
  }
  if (job.schedule.kind === "every" && job.schedule.every_ms) {
    return tx("settings.automations.schedule.every", "Every {{duration}}", {
      duration: formatAutomationInterval(job.schedule.every_ms, locale),
    });
  }
  if (job.schedule.kind === "cron" && job.schedule.expr) {
    const summary = formatCronScheduleSummary(job.schedule.expr, tx);
    if (summary) {
      return job.schedule.tz
        ? tx("settings.automations.schedule.withTz", "{{summary}} · {{tz}}", {
            summary,
            tz: job.schedule.tz,
          })
        : summary;
    }
    return job.schedule.tz
      ? tx("settings.automations.schedule.cronWithTz", "Cron {{expr}} · {{tz}}", {
          expr: job.schedule.expr,
          tz: job.schedule.tz,
        })
      : tx("settings.automations.schedule.cron", "Cron {{expr}}", { expr: job.schedule.expr });
  }
  return tx("settings.automations.schedule.custom", "Custom schedule");
}

function formatCronScheduleSummary(
  expr: string,
  tx: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const numericMinute = cronNumericToken(minute, 59);
  const numericHour = cronNumericToken(hour, 23);
  const everyDay = dayOfMonth === "*" && month === "*" && dayOfWeek === "*";
  const workdays = dayOfMonth === "*" && month === "*" && ["1-5", "MON-FRI", "mon-fri"].includes(dayOfWeek);

  if (numericMinute !== null && numericHour !== null) {
    const time = `${String(numericHour).padStart(2, "0")}:${String(numericMinute).padStart(2, "0")}`;
    if (everyDay) return tx("settings.automations.schedule.dailyAt", "Daily at {{time}}", { time });
    if (workdays) return tx("settings.automations.schedule.weekdaysAt", "Weekdays at {{time}}", { time });
  }

  if (everyDay && numericMinute !== null && hour === "*") {
    return tx("settings.automations.schedule.hourlyAt", "Hourly at :{{minute}}", {
      minute: String(numericMinute).padStart(2, "0"),
    });
  }

  const range = /^(\d{1,2})-(\d{1,2})$/.exec(hour);
  if (everyDay && numericMinute !== null && range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start > 23 || end > 23) return null;
    return tx("settings.automations.schedule.hourlyWindow", "Hourly {{start}}-{{end}} at :{{minute}}", {
      start: String(start).padStart(2, "0"),
      end: String(end).padStart(2, "0"),
      minute: String(numericMinute).padStart(2, "0"),
    });
  }

  return null;
}

function cronNumericToken(value: string, max: number): number | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed <= max ? parsed : null;
}

function formatAutomationNext(
  job: SessionAutomationJob,
  tx: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): string {
  if (!job.enabled) return tx("settings.automations.next.paused", "Paused");
  if (job.state.pending) return tx("settings.automations.next.pending", "Running now");
  if (!job.state.next_run_at_ms) return tx("settings.automations.next.none", "No next run");
  return relativeTime(job.state.next_run_at_ms);
}

function formatAutomationNextTitle(
  job: SessionAutomationJob,
  locale: string,
  tx: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): string {
  if (!job.state.next_run_at_ms) return formatAutomationNext(job, tx);
  return fmtDateTime(job.state.next_run_at_ms, locale);
}

function automationStatusDotClass(job: SessionAutomationJob): string {
  const status = automationStatusKey(job);
  if (status === "active" || status === "running") return "bg-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.12)]";
  if (status === "failed") return "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.13)]";
  if (status === "system") return "bg-muted-foreground/45";
  return "bg-muted-foreground/45";
}

function formatAutomationUnit(
  value: number,
  unit: Intl.NumberFormatOptions["unit"],
  locale: string,
  maximumFractionDigits = 0,
): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "long",
    maximumFractionDigits,
  }).format(value);
}

function formatAutomationInterval(ms: number, locale: string): string {
  const units: Array<[Intl.NumberFormatOptions["unit"], number]> = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1000],
  ];
  for (const [unit, size] of units) {
    if (ms >= size && ms % size === 0) return formatAutomationUnit(ms / size, unit, locale);
  }
  const fallbackUnit = ms < 60_000 ? "second" : "minute";
  const fallbackSize = fallbackUnit === "second" ? 1000 : 60_000;
  return formatAutomationUnit(ms / fallbackSize, fallbackUnit, locale, 1);
}
