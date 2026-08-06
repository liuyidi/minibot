import { useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import {
  Brain,
  Check,
  CircleAlert,
  KeyRound,
  Loader2,
  Plug,
  Plus,
  Terminal,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
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
import type { UpsertMcpBody } from "@/hooks/skills";
import type { SkillDetail, SkillSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

import { useSkillDetail } from "./useSkillDetail";

export function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function CatalogSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-border/45 pb-2">
        <h2 className="px-1 text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return <div className="px-1 py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export function LoadingHint() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {t("settings.skills.loading", { defaultValue: "Loading…" })}
    </div>
  );
}

export function SkillCard({
  skill,
  onSelect,
}: {
  skill: SkillSummary;
  onSelect: (skill: SkillSummary) => void;
}) {
  const { t } = useTranslation();
  const StatusIcon = skill.available ? Check : CircleAlert;

  return (
    <button
      type="button"
      aria-label={t("settings.skills.openDetails", {
        name: skill.name,
        defaultValue: "Open details for {{name}}",
      })}
      onClick={() => onSelect(skill)}
      className={cn(
        "group relative flex min-h-[7.5rem] flex-col gap-2 rounded-[18px] border border-border/45 bg-card/70 p-4 text-left transition-colors",
        "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !skill.available && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-muted/80 text-muted-foreground">
          <Brain className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-foreground">{skill.name}</h3>
          <p className="mt-1 line-clamp-3 text-[12.5px] leading-5 text-muted-foreground">
            {skill.description || t("settings.skills.noDescription", { defaultValue: "No description." })}
          </p>
          {!skill.available && skill.unavailable_reason ? (
            <p className="mt-1 truncate text-[12px] leading-4 text-muted-foreground/80">
              {t("settings.skills.unavailableReason", {
                reason: skill.unavailable_reason,
                defaultValue: "Missing: {{reason}}",
              })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <StatusIcon className="h-3.5 w-3.5" aria-hidden />
        {skill.available
          ? t("settings.skills.statusAvailable", { defaultValue: "Available" })
          : t("settings.skills.statusUnavailable", { defaultValue: "Unavailable" })}
      </div>
    </button>
  );
}

export function ConnectorCard({
  title,
  description,
  badge,
  badgeTone = "muted",
  actionLabel,
  actionBusy,
  onAction,
}: {
  title: string;
  description: string;
  badge?: string;
  badgeTone?: "muted" | "success";
  actionLabel?: string;
  actionBusy?: boolean;
  onAction?: () => void;
}) {
  return (
    <div className="relative flex min-h-[7.5rem] flex-col gap-2 rounded-[18px] border border-border/45 bg-card/70 p-4">
      {onAction ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute right-3 top-3 h-8 w-8 rounded-full"
          disabled={actionBusy}
          onClick={onAction}
          aria-label={actionLabel}
        >
          {actionBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
        </Button>
      ) : null}
      <div className="flex items-start gap-3 pr-8">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-muted/80 text-muted-foreground">
          <Plug className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-foreground">{title}</h3>
          <p className="mt-1 line-clamp-3 text-[12.5px] leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {badge ? (
        <span
          className={cn(
            "mt-auto w-fit rounded-full px-2 py-0.5 text-[11px] font-medium",
            badgeTone === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

export function AddSkillDialog({
  open,
  onOpenChange,
  busy,
  onInstall,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onInstall: (body: { markdown: string; name?: string }) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [markdown, setMarkdown] = useState(
    "---\nname: my-skill\ndescription: What this skill does.\n---\n\n# My skill\n\nInstructions…\n",
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const message = await onInstall({
      markdown,
      name: name.trim() || undefined,
    });
    if (!message) {
      setName("");
      onOpenChange(false);
      return;
    }
    setError(message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("settings.skills.addSkill", { defaultValue: "Add skill" })}</DialogTitle>
          <DialogDescription>
            {t("settings.skills.addSkillHint", {
              defaultValue: "Paste a SKILL.md. It is saved under the current workspace skills/ folder.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.skills.nameOptional", {
              defaultValue: "Name (optional; defaults to frontmatter)",
            })}
          />
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={12}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[12px] leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="file"
              accept=".md,text/markdown,text/plain"
              className="text-[12px]"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setMarkdown(await file.text());
                if (!name.trim()) {
                  setName(file.name.replace(/\.md$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-"));
                }
              }}
            />
            {t("settings.skills.uploadFile", { defaultValue: "Or upload a file" })}
          </label>
          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button type="button" disabled={busy || !markdown.trim()} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("settings.skills.install", { defaultValue: "Install" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddConnectorDialog({
  open,
  onOpenChange,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSave: (body: UpsertMcpBody) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState("");
  const [transport, setTransport] = useState<"stdio" | "streamableHttp" | "sse">("stdio");
  const [command, setCommand] = useState("npx");
  const [argsText, setArgsText] = useState("-y @modelcontextprotocol/server-filesystem /tmp");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const message = await onSave({
      label: label.trim() || undefined,
      enabled: true,
      type: transport,
      command: transport === "stdio" ? command.trim() : "",
      args:
        transport === "stdio"
          ? argsText
              .split(/\s+/)
              .map((part) => part.trim())
              .filter(Boolean)
          : [],
      url: transport === "stdio" ? "" : url.trim(),
    });
    if (!message) {
      setLabel("");
      onOpenChange(false);
      return;
    }
    setError(message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("settings.skills.addConnector", { defaultValue: "Add connector" })}
          </DialogTitle>
          <DialogDescription>
            {t("settings.skills.addConnectorHint", {
              defaultValue: "Add a custom MCP server (stdio or HTTP).",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("settings.skills.connectorLabel", { defaultValue: "Label" })}
          />
          <div className="flex gap-2">
            {(["stdio", "streamableHttp", "sse"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={transport === value ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setTransport(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          {transport === "stdio" ? (
            <>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="command"
              />
              <Input
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder="args (space-separated)"
              />
            </>
          ) : (
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          )}
          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("settings.skills.saveConnector", { defaultValue: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SkillDetailSheet({
  skill,
  open,
  onOpenChange,
}: {
  skill: SkillSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { detail, loading, loadFailed } = useSkillDetail(skill, open);

  if (!skill) return null;

  const activeSkill = detail ?? skill;
  const sourceLabel = skillSourceLabel(activeSkill.source, t);
  const statusLabel = activeSkill.available
    ? t("settings.skills.statusAvailable", { defaultValue: "Available" })
    : t("settings.skills.statusUnavailable", { defaultValue: "Unavailable" });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(34rem,calc(100vw-1rem))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-muted/70 text-muted-foreground">
              <Brain className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate text-[20px] font-semibold">
                {activeSkill.name}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {t("settings.skills.detailDescription", {
                  name: activeSkill.name,
                  defaultValue: "Details for {{name}}.",
                })}
              </SheetDescription>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                <Pill>{sourceLabel}</Pill>
                <Pill tone={activeSkill.available ? "success" : "muted"}>{statusLabel}</Pill>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("settings.skills.loadingDetail", { defaultValue: "Loading skill details..." })}
            </div>
          ) : loadFailed ? (
            <div className="mt-8 rounded-[16px] bg-destructive/10 px-3 py-3 text-sm text-destructive">
              {t("settings.skills.loadFailed", { defaultValue: "Could not load skill details." })}
            </div>
          ) : (
            <div className="mt-7 space-y-6">
              <DetailSection
                title={t("settings.skills.descriptionTitle", { defaultValue: "Description" })}
              >
                <p className="text-[14px] leading-6 text-muted-foreground">{activeSkill.description}</p>
              </DetailSection>

              <div className="grid grid-cols-2 gap-2">
                <MetaItem
                  label={t("settings.skills.source", { defaultValue: "Source" })}
                  value={sourceLabel}
                />
                <MetaItem
                  label={t("settings.skills.status", { defaultValue: "Status" })}
                  value={statusLabel}
                />
              </div>

              {!activeSkill.available && activeSkill.unavailable_reason ? (
                <DetailSection
                  title={t("settings.skills.unavailableReasonLabel", {
                    defaultValue: "Unavailable reason",
                  })}
                >
                  <p className="text-[13px] leading-5 text-destructive/85">
                    {activeSkill.unavailable_reason}
                  </p>
                </DetailSection>
              ) : null}

              {detail ? <RequirementsSection detail={detail} /> : null}
              {detail ? <RawInstructionsBlock markdown={detail.raw_markdown} /> : null}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RawInstructionsBlock({ markdown }: { markdown: string }) {
  const { t } = useTranslation();
  const content =
    markdown ||
    t("settings.skills.rawInstructionsEmpty", {
      defaultValue: "No raw instructions.",
    });

  return (
    <details className="group rounded-[18px] border border-border/45 bg-muted/20 px-3 py-3">
      <summary className="cursor-pointer select-none text-[13px] font-medium text-foreground/90 transition-colors hover:text-foreground">
        {t("settings.skills.rawInstructions", { defaultValue: "Raw SKILL.md" })}
      </summary>
      <div className="mt-3 overflow-hidden rounded-[14px] border border-border/35 bg-background/70">
        <pre
          className={cn(
            "max-h-[min(42vh,32rem)] overflow-auto overscroll-contain px-3.5 py-3 pr-4",
            "whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.7] text-foreground/62",
          )}
        >
          {content}
        </pre>
      </div>
    </details>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-muted/35 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-medium text-foreground">{value}</div>
    </div>
  );
}

function RequirementsSection({ detail }: { detail: SkillDetail }) {
  const { t } = useTranslation();
  const { bins, env, missing_bins, missing_env } = detail.requirements;
  const hasRequirements = bins.length > 0 || env.length > 0;

  return (
    <DetailSection title={t("settings.skills.requirements", { defaultValue: "Requirements" })}>
      {hasRequirements ? (
        <div className="space-y-3">
          {missing_bins.length ? (
            <RequirementLine
              title={t("settings.skills.missingCommands", { defaultValue: "Missing CLI" })}
              items={missing_bins}
              tone="danger"
              icon={<Terminal className="h-3.5 w-3.5" aria-hidden />}
            />
          ) : null}
          {missing_env.length ? (
            <RequirementLine
              title={t("settings.skills.missingEnvironment", { defaultValue: "Missing ENV" })}
              items={missing_env}
              tone="danger"
              icon={<KeyRound className="h-3.5 w-3.5" aria-hidden />}
            />
          ) : null}
          {bins.length ? (
            <RequirementLine
              title={t("settings.skills.commands", { defaultValue: "Commands" })}
              items={bins}
              icon={<Terminal className="h-3.5 w-3.5" aria-hidden />}
            />
          ) : null}
          {env.length ? (
            <RequirementLine
              title={t("settings.skills.environment", { defaultValue: "Environment variables" })}
              items={env}
              icon={<KeyRound className="h-3.5 w-3.5" aria-hidden />}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {t("settings.skills.noRequirements", { defaultValue: "No explicit requirements." })}
        </p>
      )}
    </DetailSection>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function RequirementLine({
  title,
  items,
  icon,
  tone = "muted",
}: {
  title: string;
  items: string[];
  icon: ReactNode;
  tone?: "muted" | "danger";
}) {
  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "flex items-center gap-1.5 text-[12px]",
          tone === "danger" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {icon}
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Pill key={item}>{item}</Pill>
        ))}
      </div>
    </div>
  );
}

function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "success"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function skillSourceLabel(source: string, t: TFunction): string {
  if (source === "workspace") {
    return t("settings.skills.sourceWorkspace", { defaultValue: "Custom" });
  }
  if (source === "builtin") {
    return t("settings.skills.sourceBuiltin", { defaultValue: "Built-in" });
  }
  return source;
}
