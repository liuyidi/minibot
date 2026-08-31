import { Brain, ExternalLink, Flame, Loader2, Plus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type {
  SkillCatalogTemplate,
} from "@/lib/apis/skills-api";
import {
  formatPopularity,
  getMarketMeta,
  resolveCatalogDescription,
  resolveCatalogLabel,
  resolveMarketTags,
} from "@/lib/skills/market";
import { cn } from "@/lib/utils";

export function CatalogSkillPreviewSheet({
  template,
  open,
  preferZh,
  installed,
  busy,
  onOpenChange,
  onAdd,
}: {
  template: SkillCatalogTemplate | null;
  open: boolean;
  preferZh: boolean;
  installed: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd?: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (!template) return null;

  const title = resolveCatalogLabel(template, preferZh);
  const description =
    resolveCatalogDescription(template, preferZh) ||
    t("settings.skills.noDescription", { defaultValue: "No description." });
  const tags = resolveMarketTags(template.id, preferZh);
  const popularity = getMarketMeta(template.id).popularity;
  const source =
    template.source === "clawhub"
      ? "clawhub"
      : template.source === "github"
        ? "github"
        : "minimax";
  const sourceKey =
    source === "clawhub"
      ? "settings.skills.catalogSourceClawhub"
      : source === "github"
        ? "settings.skills.catalogSourceGithub"
        : "settings.skills.catalogSourceMinimax";
  const sourceDefault =
    source === "clawhub" ? "ClawHub" : source === "github" ? "GitHub" : "MiniMax";
  const sourceLabel = t(sourceKey, { defaultValue: sourceDefault });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(34rem,calc(100vw-1rem))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-muted/70 text-muted-foreground">
              <Sparkles className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-[20px] font-semibold">{title}</SheetTitle>
              <SheetDescription className="sr-only">
                {t("settings.skills.detailDescription", {
                  name: title,
                  defaultValue: "Details for {{name}}.",
                })}
              </SheetDescription>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                  {sourceLabel}
                </span>
                {installed ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    {t("settings.skills.installedBadge", { defaultValue: "Installed" })}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {t("settings.skills.catalogPreview", { defaultValue: "Catalog" })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-7 space-y-6">
            <section>
              <h3 className="mb-2 text-[12px] font-medium text-muted-foreground">
                {t("settings.skills.descriptionTitle", { defaultValue: "Description" })}
              </h3>
              <p className="text-[14px] leading-6 text-muted-foreground">{description}</p>
            </section>

            {tags.length ? (
              <section>
                <h3 className="mb-2 text-[12px] font-medium text-muted-foreground">
                  {t("settings.skills.tags", { defaultValue: "Tags" })}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-muted/70 px-2 py-1 text-[12px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[16px] bg-muted/35 px-3 py-2.5">
                <div className="text-[11px] text-muted-foreground">
                  {t("settings.skills.source", { defaultValue: "Source" })}
                </div>
                <div className="mt-0.5 truncate text-[13px] font-medium text-foreground">
                  {sourceLabel}
                </div>
              </div>
              <div className="rounded-[16px] bg-muted/35 px-3 py-2.5">
                <div className="text-[11px] text-muted-foreground">
                  {t("settings.skills.popularity", { defaultValue: "Popularity" })}
                </div>
                <div className="mt-0.5 inline-flex items-center gap-1 truncate text-[13px] font-medium text-foreground">
                  <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden />
                  {formatPopularity(popularity)}
                </div>
              </div>
            </div>

            {template.homepage ? (
              <a
                href={template.homepage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] text-foreground/80 underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                {t("settings.skills.viewUpstream", { defaultValue: "View upstream skill" })}
              </a>
            ) : null}

            {!installed && onAdd ? (
              <Button
                type="button"
                className="h-10 w-full rounded-full"
                disabled={busy}
                onClick={() => onAdd(template.id)}
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                )}
                {t("settings.skills.add", { defaultValue: "Add" })}
              </Button>
            ) : null}

            {installed ? (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-[14px] bg-muted/40 px-3 py-2.5 text-[13px] text-muted-foreground",
                )}
              >
                <Brain className="h-4 w-4 shrink-0" aria-hidden />
                {t("settings.skills.alreadyInstalledHint", {
                  defaultValue: "Already installed in this workspace. Open it from My skills for full details.",
                })}
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
