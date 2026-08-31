import { Check, Flame, Loader2, Plus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { formatPopularity } from "@/lib/skills/market";
import { cn } from "@/lib/utils";

export function MarketSkillCard({
  title,
  description,
  tags,
  popularity,
  installed,
  busy,
  onPreview,
  onAdd,
  onUse,
}: {
  title: string;
  description: string;
  tags: string[];
  popularity: number;
  installed: boolean;
  busy?: boolean;
  onPreview: () => void;
  onAdd: () => void;
  onUse: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "group relative flex min-h-[9.5rem] flex-col gap-2.5 rounded-[14px] border border-border/50 bg-card/80 p-4 transition-colors",
        "hover:bg-muted/40",
      )}
    >
      <div className="absolute right-3 top-3 z-[1]">
        {installed ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 gap-1 rounded-full px-2 text-[12px] text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onUse();
            }}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            {t("settings.skills.use", { defaultValue: "Use" })}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 gap-1 rounded-full px-2.5 text-[12px]"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )}
            {t("settings.skills.add", { defaultValue: "Add" })}
          </Button>
        )}
      </div>

      <button
        type="button"
        onClick={onPreview}
        aria-label={t("settings.skills.openDetails", {
          name: title,
          defaultValue: "Open details for {{name}}",
        })}
        className="flex min-h-0 flex-1 flex-col gap-2.5 pr-16 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[10px]"
      >
        <div className="flex items-start gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-muted/80 text-muted-foreground">
            <Sparkles className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] font-semibold text-foreground">{title}</h3>
            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="flex min-w-0 flex-wrap gap-1">
            {tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Flame className="h-3 w-3 text-orange-500" aria-hidden />
            {formatPopularity(popularity)}
          </span>
        </div>
      </button>
    </div>
  );
}

export function UnderlineTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1.5 px-1 pb-2.5 text-[14px] font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none",
            active
              ? "bg-foreground/10 text-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
      {active ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
      ) : null}
    </button>
  );
}
