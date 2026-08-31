import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ClipboardList,
  Film,
  ImageIcon,
  Languages,
  Lightbulb,
  MessageSquare,
  Moon,
  Newspaper,
  Stethoscope,
  UserRound,
} from "lucide-react";

import type { AutomationUpdatePayload } from "@/lib/types";

export type AutomationFilter = "all" | "active" | "paused" | "failed" | "system";
export type AutomationSort = "next" | "last" | "updated" | "name";
export type AutomationAction = "enable" | "disable" | "delete" | "run";

export type AutomationsTab = "tasks" | "runs";
export type AutomationRunFilter = "all" | "ok" | "error" | "running" | "skipped";

export const AUTOMATION_TEMPLATE_CARDS: Array<{
  id: string;
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
  promptKey: string;
}> = [
  {
    id: "ai-news",
    icon: Newspaper,
    titleKey: "settings.automations.templates.aiNews.title",
    descKey: "settings.automations.templates.aiNews.desc",
    promptKey: "settings.automations.templates.aiNews.prompt",
  },
  {
    id: "english",
    icon: Languages,
    titleKey: "settings.automations.templates.english.title",
    descKey: "settings.automations.templates.english.desc",
    promptKey: "settings.automations.templates.english.prompt",
  },
  {
    id: "story",
    icon: Moon,
    titleKey: "settings.automations.templates.story.title",
    descKey: "settings.automations.templates.story.desc",
    promptKey: "settings.automations.templates.story.prompt",
  },
  {
    id: "weekly",
    icon: ClipboardList,
    titleKey: "settings.automations.templates.weekly.title",
    descKey: "settings.automations.templates.weekly.desc",
    promptKey: "settings.automations.templates.weekly.prompt",
  },
  {
    id: "movie",
    icon: Film,
    titleKey: "settings.automations.templates.movie.title",
    descKey: "settings.automations.templates.movie.desc",
    promptKey: "settings.automations.templates.movie.prompt",
  },
  {
    id: "history",
    icon: CalendarDays,
    titleKey: "settings.automations.templates.history.title",
    descKey: "settings.automations.templates.history.desc",
    promptKey: "settings.automations.templates.history.prompt",
  },
  {
    id: "why",
    icon: Lightbulb,
    titleKey: "settings.automations.templates.why.title",
    descKey: "settings.automations.templates.why.desc",
    promptKey: "settings.automations.templates.why.prompt",
  },
  {
    id: "parents",
    icon: UserRound,
    titleKey: "settings.automations.templates.parents.title",
    descKey: "settings.automations.templates.parents.desc",
    promptKey: "settings.automations.templates.parents.prompt",
  },
  {
    id: "checkup",
    icon: Stethoscope,
    titleKey: "settings.automations.templates.checkup.title",
    descKey: "settings.automations.templates.checkup.desc",
    promptKey: "settings.automations.templates.checkup.prompt",
  },
  {
    id: "interview",
    icon: MessageSquare,
    titleKey: "settings.automations.templates.interview.title",
    descKey: "settings.automations.templates.interview.desc",
    promptKey: "settings.automations.templates.interview.prompt",
  },
  {
    id: "meeting",
    icon: ClipboardList,
    titleKey: "settings.automations.templates.meeting.title",
    descKey: "settings.automations.templates.meeting.desc",
    promptKey: "settings.automations.templates.meeting.prompt",
  },
  {
    id: "wallpaper",
    icon: ImageIcon,
    titleKey: "settings.automations.templates.wallpaper.title",
    descKey: "settings.automations.templates.wallpaper.desc",
    promptKey: "settings.automations.templates.wallpaper.prompt",
  },
];

export type AutomationEveryUnit = "second" | "minute" | "hour" | "day";

export type AutomationEditDraft = {
  name: string;
  message: string;
  scheduleKind: "at" | "every" | "cron";
  everyValue: string;
  everyUnit: AutomationEveryUnit;
  cronExpr: string;
  tz: string;
  atLocal: string;
};

export type AutomationScheduleUpdate = NonNullable<AutomationUpdatePayload["schedule"]>;

export type AutomationCreateDraft = AutomationEditDraft & {
  sessionId: string;
  dailyTime: string;
};

export const AUTOMATION_EVERY_UNITS: Array<{ value: AutomationEveryUnit; ms: number }> = [
  { value: "second", ms: 1000 },
  { value: "minute", ms: 60_000 },
  { value: "hour", ms: 3_600_000 },
  { value: "day", ms: 86_400_000 },
];

export type AutomationSearchField = "id" | "name" | "message" | "chat" | "cron" | "schedule" | "status";

export interface AutomationSearchToken {
  field: AutomationSearchField | null;
  value: string;
}

export const AUTOMATION_SEARCH_FIELDS = new Set<AutomationSearchField>([
  "id",
  "name",
  "message",
  "chat",
  "cron",
  "schedule",
  "status",
]);

export const AUTOMATION_CHANNEL_LABELS: Record<string, string> = {
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
