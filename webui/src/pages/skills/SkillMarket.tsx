import { ChevronDown, Filter, Flame, Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SkillCatalogTemplate } from "@/lib/apis/skills-api";
import {
  formatPopularity,
  getMarketMeta,
  MARKET_CATEGORIES,
  MARKET_SORTS,
  packPopularity,
  resolveCatalogDescription,
  resolveCatalogLabel,
  resolveMarketTags,
  SKILL_PACKS,
  type MarketCategoryId,
  type MarketSortId,
} from "@/lib/skills/market";
import { cn } from "@/lib/utils";

import { EmptyHint, LoadingHint } from "./SkillsUi";
import { MarketSkillCard } from "./SkillMarketUi";

export { UnderlineTab } from "./SkillMarketUi";

type MarketItem = SkillCatalogTemplate & {
  installed: boolean;
  title: string;
  descriptionText: string;
};

export function SkillMarketPanel({
  templates,
  installedNames,
  preferZh,
  query,
  loading,
  busyKey,
  onAdd,
  onAddMany,
  onPreview,
  onUse,
}: {
  templates: SkillCatalogTemplate[];
  installedNames: Set<string>;
  preferZh: boolean;
  query: string;
  loading: boolean;
  busyKey: string | null;
  onAdd: (id: string) => void;
  onAddMany: (ids: string[], packId: string) => void;
  onPreview: (template: SkillCatalogTemplate) => void;
  onUse: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<MarketCategoryId>("featured");
  const [sort, setSort] = useState<MarketSortId>("popular");

  const items = useMemo<MarketItem[]>(() => {
    const q = query.trim().toLowerCase();
    return templates
      .map((tpl) => {
        const title = resolveCatalogLabel(tpl, preferZh);
        const descriptionText = resolveCatalogDescription(tpl, preferZh);
        return {
          ...tpl,
          installed: installedNames.has(tpl.id.toLowerCase()),
          title,
          descriptionText,
        };
      })
      .filter((item) => {
        if (!q) return true;
        const meta = getMarketMeta(item.id);
        const hay = `${item.id} ${item.title} ${item.label} ${item.label_zh ?? ""} ${item.descriptionText} ${meta.tags.join(" ")}`;
        return hay.toLowerCase().includes(q);
      });
  }, [templates, installedNames, preferZh, query]);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const filtered = useMemo(() => {
    const list =
      category === "featured"
        ? [...items]
        : items.filter((item) => getMarketMeta(item.id).category === category);
    const sorted = [...list];
    if (sort === "name") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "popular") {
      sorted.sort(
        (a, b) => getMarketMeta(b.id).popularity - getMarketMeta(a.id).popularity,
      );
    }
    return sorted;
  }, [items, category, sort]);

  const packs = useMemo(
    () =>
      SKILL_PACKS.map((pack) => {
        const skills = pack.skillIds
          .map((id) => byId.get(id) ?? templates.find((tpl) => tpl.id === id))
          .filter(Boolean) as SkillCatalogTemplate[];
        return { ...pack, skills, popularity: packPopularity(pack.skillIds) };
      }).filter((pack) => pack.skills.length > 0),
    [byId, templates],
  );

  if (loading) return <LoadingHint />;

  return (
    <div className="space-y-6">
      {packs.length && !query.trim() ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {packs.map((pack) => {
            const pendingIds = pack.skillIds.filter(
              (id) => !installedNames.has(id.toLowerCase()),
            );
            const title = t(`settings.skills.packs.${pack.id}.title`, {
              defaultValue: pack.id,
            });
            const description = t(`settings.skills.packs.${pack.id}.description`, {
              defaultValue: "",
            });
            const preview = pack.skills.slice(0, 6);
            const extra = Math.max(0, pack.skills.length - preview.length);
            return (
              <article
                key={pack.id}
                className="flex flex-col gap-3 rounded-[16px] border border-border/50 bg-card/80 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                    {title}
                  </h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 shrink-0 rounded-full px-3 text-[12px]"
                    disabled={!pendingIds.length || busyKey === `pack:${pack.id}`}
                    onClick={() => onAddMany(pendingIds, pack.id)}
                  >
                    {busyKey === `pack:${pack.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    {t("settings.skills.addPack", { defaultValue: "Add all" })}
                  </Button>
                </div>
                <p className="line-clamp-2 text-[12.5px] leading-5 text-muted-foreground">
                  {description}
                </p>
                <div className="flex items-center justify-end gap-1 text-[12px] text-muted-foreground">
                  <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden />
                  {formatPopularity(pack.popularity)}
                </div>
                <div>
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground/80">
                    {t("settings.skills.skillPack", { defaultValue: "Skill Pack" })}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.map((skill) => (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => onPreview(skill)}
                        className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/70 px-2 py-1 text-[11px] text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={t("settings.skills.openDetails", {
                          name: resolveCatalogLabel(skill, preferZh),
                          defaultValue: "Open details for {{name}}",
                        })}
                      >
                        <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{resolveCatalogLabel(skill, preferZh)}</span>
                      </button>
                    ))}
                    {extra > 0 ? (
                      <span className="inline-flex items-center px-1 text-[11px] text-muted-foreground">
                        {t("settings.skills.viewAllPack", {
                          count: pack.skills.length,
                          defaultValue: "View all ({{count}}) >",
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-b border-border/45 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label={t("settings.skills.marketCategories", { defaultValue: "Categories" })}
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-none"
        >
          {MARKET_CATEGORIES.map((id) => {
            const active = category === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(id)}
                className={cn(
                  "shrink-0 px-2.5 py-1.5 text-[13px] transition-colors",
                  active
                    ? "border-b-2 border-sky-500 font-semibold text-sky-600 dark:text-sky-400"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`settings.skills.categories.${id}`, { defaultValue: id })}
              </button>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Filter className="h-3.5 w-3.5" aria-hidden />
              {t("settings.skills.filter", { defaultValue: "Filter" })}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>
              {t("settings.skills.sortBy", { defaultValue: "Sort by" })}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => setSort(value as MarketSortId)}
            >
              {MARKET_SORTS.map((id) => (
                <DropdownMenuRadioItem key={id} value={id}>
                  {t(`settings.skills.sort.${id}`, { defaultValue: id })}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filtered.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((item) => (
            <MarketSkillCard
              key={item.id}
              title={item.title}
              description={item.descriptionText}
              tags={resolveMarketTags(item.id)}
              popularity={getMarketMeta(item.id).popularity}
              installed={item.installed}
              busy={busyKey === `skill-tpl:${item.id}`}
              onPreview={() => onPreview(item)}
              onAdd={() => onAdd(item.id)}
              onUse={() => onUse(item.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyHint
          text={t("settings.skills.emptyMarketCategory", {
            defaultValue: "No skills in this category.",
          })}
        />
      )}
    </div>
  );
}
