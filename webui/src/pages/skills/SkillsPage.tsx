import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Plus, Search, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityHubNav } from "@/components/capabilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSkillsCatalog } from "@/hooks/skills";
import type { SkillCatalogTemplate } from "@/lib/apis/skills-api";
import { resolveCatalogLabel } from "@/lib/skills/market";
import type { SkillSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

import { CatalogSkillPreviewSheet } from "./CatalogSkillPreviewSheet";
import {
  AddSkillDialog,
  EmptyHint,
  SkillCard,
  SkillDetailSheet,
} from "./SkillsUi";
import { SkillMarketPanel, UnderlineTab } from "./SkillMarket";

type SkillTab = "market" | "builtin" | "mine";

type SkillToast = {
  tone: "success" | "error";
  message: string;
};

export function SkillsPage() {
  const { t, i18n } = useTranslation();
  const {
    skills,
    busyKey,
    error,
    clearError,
    applySkillTemplate,
    applySkillTemplates,
    installSkill,
    setSkillEnabled,
    uninstallSkill,
    skillTemplates,
    skillCatalogLoading,
  } = useSkillsCatalog();

  const [tab, setTab] = useState<SkillTab>("market");
  const [query, setQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillSummary | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<SkillCatalogTemplate | null>(null);
  const [addSkillOpen, setAddSkillOpen] = useState(false);
  const [toast, setToast] = useState<SkillToast | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((next: SkillToast) => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(next);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3_200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const openAddSkill = () => {
    clearError();
    setAddSkillOpen(true);
  };

  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);
  const preferZh = (i18n.language || "").toLowerCase().startsWith("zh");

  const catalogById = useMemo(() => {
    const map = new Map<string, SkillCatalogTemplate>();
    for (const tpl of skillTemplates) {
      map.set(tpl.id.toLowerCase(), tpl);
    }
    return map;
  }, [skillTemplates]);

  const catalogFor = (skillName: string) => catalogById.get(skillName.toLowerCase()) ?? null;

  const labelForTemplateId = useCallback(
    (id: string) => {
      const tpl = catalogById.get(id.toLowerCase());
      if (tpl) return resolveCatalogLabel(tpl, preferZh);
      return id;
    },
    [catalogById, preferZh],
  );

  const handleAddMarketSkill = useCallback(
    async (id: string) => {
      const name = labelForTemplateId(id);
      const result = await applySkillTemplate(id);
      if (result.ok) {
        showToast({
          tone: "success",
          message: t("settings.skills.installSuccess", {
            name,
            defaultValue: "Added {{name}}",
          }),
        });
        return true;
      }
      showToast({
        tone: "error",
        message: t("settings.skills.installFailed", {
          name,
          detail: result.error || t("settings.skills.installFailedFallback", {
            defaultValue: "Something went wrong",
          }),
          defaultValue: "Failed to add {{name}}: {{detail}}",
        }),
      });
      return false;
    },
    [applySkillTemplate, labelForTemplateId, showToast, t],
  );

  const handleAddMarketPack = useCallback(
    async (ids: string[], packId: string) => {
      const result = await applySkillTemplates(ids, `pack:${packId}`);
      const packTitle = t(`settings.skills.packs.${packId}.title`, {
        defaultValue: packId,
      });
      if (result.ok) {
        showToast({
          tone: "success",
          message: t("settings.skills.installPackSuccess", {
            name: packTitle,
            count: result.installedCount ?? ids.length,
            defaultValue: "Added {{count}} skills from {{name}}",
          }),
        });
        return;
      }
      showToast({
        tone: "error",
        message: t("settings.skills.installPackFailed", {
          name: packTitle,
          detail: result.error || t("settings.skills.installFailedFallback", {
            defaultValue: "Something went wrong",
          }),
          defaultValue: "Failed to add {{name}}: {{detail}}",
        }),
      });
    },
    [applySkillTemplates, showToast, t],
  );

  const builtinSkills = useMemo(
    () => skills.filter((s) => s.source === "builtin" && match(`${s.name} ${s.description}`)),
    [skills, q],
  );
  const mineSkills = useMemo(
    () =>
      skills.filter((s) => {
        if (s.source !== "workspace") return false;
        const catalog = catalogById.get(s.name.toLowerCase());
        const hay = [
          s.name,
          s.description,
          catalog?.label,
          catalog?.label_zh,
          catalog?.description,
          catalog?.description_zh,
        ]
          .filter(Boolean)
          .join(" ");
        return match(hay);
      }),
    [skills, q, catalogById],
  );
  const installedCount = useMemo(
    () => skills.filter((s) => s.source === "workspace").length,
    [skills],
  );
  const installedSkillNames = useMemo(
    () => new Set(skills.map((s) => s.name.toLowerCase())),
    [skills],
  );
  const skillsByName = useMemo(
    () => new Map(skills.map((s) => [s.name.toLowerCase(), s])),
    [skills],
  );

  return (
    <div className="space-y-6">
      <CapabilityHubNav
        active="skills"
        trailing={
          <>
            <div className="relative min-w-0 flex-1 sm:max-w-xs md:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("settings.skills.searchSkills", { defaultValue: "Search skills" })}
                className="h-9 rounded-full border-border/50 bg-background/80 pl-9"
              />
            </div>
            <Button
              type="button"
              className="h-9 shrink-0 rounded-full px-4"
              onClick={() => {
                setTab("mine");
                openAddSkill();
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t("settings.skills.addSkill", { defaultValue: "Add skill" })}
            </Button>
          </>
        }
      />

      <div
        role="tablist"
        aria-label={t("settings.skills.skillTabs", { defaultValue: "Skill sections" })}
        className="flex items-center gap-5 border-b border-border/45"
      >
        <UnderlineTab
          active={tab === "market"}
          label={t("settings.skills.tabMarket", { defaultValue: "Skill Market" })}
          onClick={() => setTab("market")}
        />
        <UnderlineTab
          active={tab === "builtin"}
          label={t("settings.skills.tabBuiltin", { defaultValue: "Built-in" })}
          onClick={() => setTab("builtin")}
        />
        <UnderlineTab
          active={tab === "mine"}
          label={t("settings.skills.tabMine", { defaultValue: "Installed" })}
          count={installedCount}
          onClick={() => setTab("mine")}
        />
      </div>

      {error ? (
        <div className="rounded-[14px] bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </div>
      ) : null}

      {tab === "market" ? (
        <SkillMarketPanel
          templates={skillTemplates}
          installedNames={installedSkillNames}
          preferZh={preferZh}
          query={query}
          loading={skillCatalogLoading}
          busyKey={busyKey}
          onAdd={(id) => void handleAddMarketSkill(id)}
          onAddMany={(ids, packId) => void handleAddMarketPack(ids, packId)}
          onPreview={(tpl) => {
            setSelectedSkill(null);
            setSelectedCatalog(tpl);
          }}
          onUse={(id) => {
            const skill = skillsByName.get(id.toLowerCase());
            if (skill) {
              setSelectedCatalog(null);
              setSelectedSkill(skill);
            }
          }}
        />
      ) : null}

      {tab === "builtin" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {builtinSkills.length ? (
            builtinSkills.map((skill) => (
              <SkillCard
                key={`b:${skill.name}`}
                skill={skill}
                preferZh={preferZh}
                catalog={catalogFor(skill.name)}
                busy={busyKey === `skill-enable:${skill.name}`}
                onSelect={setSelectedSkill}
                onToggleEnabled={(item, enabled) => void setSkillEnabled(item.name, enabled)}
              />
            ))
          ) : (
            <div className="sm:col-span-2 lg:col-span-4">
              <EmptyHint
                text={t("settings.skills.emptyBuiltin", {
                  defaultValue: "No built-in skills match.",
                })}
              />
            </div>
          )}
        </div>
      ) : null}

      {tab === "mine" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mineSkills.length ? (
            mineSkills.map((skill) => (
              <SkillCard
                key={`w:${skill.name}`}
                skill={skill}
                preferZh={preferZh}
                catalog={catalogFor(skill.name)}
                busy={
                  busyKey === `skill-enable:${skill.name}` ||
                  busyKey === `skill-uninstall:${skill.name}`
                }
                onSelect={setSelectedSkill}
                onToggleEnabled={(item, enabled) => void setSkillEnabled(item.name, enabled)}
                onUninstall={(item) => void uninstallSkill(item.name)}
              />
            ))
          ) : (
            <div className="sm:col-span-2 lg:col-span-4">
              <EmptyHint
                text={t("settings.skills.emptyAdded", {
                  defaultValue: "No workspace skills yet. Use Add skill to install one.",
                })}
              />
            </div>
          )}
        </div>
      ) : null}

      <SkillDetailSheet
        skill={selectedSkill}
        open={selectedSkill !== null}
        preferZh={preferZh}
        catalog={selectedSkill ? catalogFor(selectedSkill.name) : null}
        onOpenChange={(open) => {
          if (!open) setSelectedSkill(null);
        }}
      />

      <CatalogSkillPreviewSheet
        template={selectedCatalog}
        open={selectedCatalog !== null}
        preferZh={preferZh}
        installed={
          selectedCatalog
            ? installedSkillNames.has(selectedCatalog.id.toLowerCase())
            : false
        }
        busy={
          selectedCatalog ? busyKey === `skill-tpl:${selectedCatalog.id}` : false
        }
        onOpenChange={(open) => {
          if (!open) setSelectedCatalog(null);
        }}
        onAdd={(id) => {
          void handleAddMarketSkill(id).then((ok) => {
            if (ok) setSelectedCatalog(null);
          });
        }}
      />

      <AddSkillDialog
        open={addSkillOpen}
        onOpenChange={setAddSkillOpen}
        busy={busyKey === "install-skill"}
        onInstall={installSkill}
      />

      {toast ? (
        <div
          role="status"
          className={cn(
            "fixed left-1/2 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg",
            toast.tone === "success"
              ? "border-emerald-500/30 bg-popover text-popover-foreground"
              : "border-destructive/40 bg-popover text-destructive",
          )}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 truncate">{toast.message}</span>
        </div>
      ) : null}
    </div>
  );
}
