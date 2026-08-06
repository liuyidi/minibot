import { useMemo, useState } from "react";
import { Plug, Plus, Search, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSkillsCatalog } from "@/hooks/useSkillsCatalog";
import type { SkillSummary } from "@/lib/types";

import {
  AddConnectorDialog,
  AddSkillDialog,
  CatalogSection,
  ConnectorCard,
  EmptyHint,
  LoadingHint,
  SkillCard,
  SkillDetailSheet,
  TabButton,
} from "./skills-ui";

type HubTab = "skills" | "connectors";

export function SkillsPage() {
  const { t } = useTranslation();
  const {
    skills,
    presets,
    templates,
    mcpLoading,
    busyKey,
    error,
    clearError,
    applyTemplate,
    installSkill,
    upsertMcp,
  } = useSkillsCatalog();

  const [tab, setTab] = useState<HubTab>("skills");
  const [query, setQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillSummary | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const openAdd = () => {
    clearError();
    setAddOpen(true);
  };

  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);

  const builtinSkills = useMemo(
    () => skills.filter((s) => s.source === "builtin" && match(`${s.name} ${s.description}`)),
    [skills, q],
  );
  const addedSkills = useMemo(
    () => skills.filter((s) => s.source === "workspace" && match(`${s.name} ${s.description}`)),
    [skills, q],
  );

  const installedIds = useMemo(() => new Set(presets.map((p) => p.id)), [presets]);
  const filteredPresets = useMemo(
    () => presets.filter((p) => match(`${p.id} ${p.label} ${p.command ?? ""} ${p.url ?? ""}`)),
    [presets, q],
  );
  const optionalTemplates = useMemo(
    () =>
      templates.filter((tpl) => {
        const presetId = String(tpl.preset?.id || tpl.id);
        if (installedIds.has(presetId) || installedIds.has(tpl.id)) return false;
        return match(`${tpl.id} ${tpl.label} ${tpl.hint ?? ""}`);
      }),
    [templates, installedIds, q],
  );

  const installedCount =
    skills.filter((s) => s.source === "workspace").length + presets.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label={t("settings.skills.hubTabs", { defaultValue: "Skills and connectors" })}
          className="inline-flex w-fit items-center gap-1 rounded-full bg-muted/70 p-1"
        >
          <TabButton
            active={tab === "skills"}
            icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
            label={t("settings.skills.tabSkills", { defaultValue: "Skills" })}
            onClick={() => setTab("skills")}
          />
          <TabButton
            active={tab === "connectors"}
            icon={<Plug className="h-3.5 w-3.5" aria-hidden />}
            label={t("settings.skills.tabConnectors", { defaultValue: "Connectors" })}
            onClick={() => setTab("connectors")}
          />
        </div>

        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center lg:max-w-xl lg:justify-end">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "skills"
                  ? t("settings.skills.searchSkills", { defaultValue: "Search skills" })
                  : t("settings.skills.searchConnectors", { defaultValue: "Search connectors" })
              }
              className="h-10 rounded-full border-border/50 bg-background/80 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden whitespace-nowrap rounded-full bg-muted px-3 py-2 text-[12px] font-medium text-muted-foreground sm:inline-flex">
              {t("settings.skills.installedCount", {
                count: installedCount,
                defaultValue: "Installed {{count}}",
              })}
            </span>
            <Button
              type="button"
              className="h-10 rounded-full px-4"
              onClick={openAdd}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {tab === "skills"
                ? t("settings.skills.addSkill", { defaultValue: "Add skill" })
                : t("settings.skills.addConnector", { defaultValue: "Add connector" })}
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-[14px] bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </div>
      ) : null}

      {tab === "skills" ? (
        <div className="space-y-8">
          <CatalogSection
            title={t("settings.skills.sectionBuiltin", { defaultValue: "Built-in" })}
            count={builtinSkills.length}
          >
            {builtinSkills.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {builtinSkills.map((skill) => (
                  <SkillCard key={`b:${skill.name}`} skill={skill} onSelect={setSelectedSkill} />
                ))}
              </div>
            ) : (
              <EmptyHint
                text={t("settings.skills.emptyBuiltin", { defaultValue: "No built-in skills match." })}
              />
            )}
          </CatalogSection>

          <CatalogSection
            title={t("settings.skills.sectionAdded", { defaultValue: "Added" })}
            count={addedSkills.length}
          >
            {addedSkills.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {addedSkills.map((skill) => (
                  <SkillCard key={`w:${skill.name}`} skill={skill} onSelect={setSelectedSkill} />
                ))}
              </div>
            ) : (
              <EmptyHint
                text={t("settings.skills.emptyAdded", {
                  defaultValue: "No workspace skills yet. Use Add skill to install one.",
                })}
              />
            )}
          </CatalogSection>
        </div>
      ) : (
        <div className="space-y-8">
          <CatalogSection
            title={t("settings.skills.sectionInstalledConnectors", { defaultValue: "Installed" })}
            count={filteredPresets.length}
          >
            {mcpLoading ? (
              <LoadingHint />
            ) : filteredPresets.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredPresets.map((preset) => (
                  <ConnectorCard
                    key={preset.id}
                    title={preset.label || preset.id}
                    description={
                      preset.inferred_type ||
                      preset.type ||
                      (preset.command ? `stdio · ${preset.command}` : preset.url || "MCP")
                    }
                    badge={
                      preset.enabled
                        ? t("settings.skills.connectorEnabled", { defaultValue: "Enabled" })
                        : t("settings.skills.connectorDisabled", { defaultValue: "Disabled" })
                    }
                    badgeTone={preset.enabled ? "success" : "muted"}
                  />
                ))}
              </div>
            ) : (
              <EmptyHint
                text={t("settings.skills.emptyInstalledConnectors", {
                  defaultValue: "No connectors installed yet.",
                })}
              />
            )}
          </CatalogSection>

          <CatalogSection
            title={t("settings.skills.sectionOptionalConnectors", { defaultValue: "Optional" })}
            count={optionalTemplates.length}
          >
            {mcpLoading ? (
              <LoadingHint />
            ) : optionalTemplates.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {optionalTemplates.map((tpl) => (
                  <ConnectorCard
                    key={tpl.id}
                    title={tpl.label}
                    description={tpl.hint || tpl.id}
                    actionLabel={t("settings.skills.add", { defaultValue: "Add" })}
                    actionBusy={busyKey === `tpl:${tpl.id}`}
                    onAction={() => void applyTemplate(tpl.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyHint
                text={t("settings.skills.emptyOptionalConnectors", {
                  defaultValue: "No optional templates available.",
                })}
              />
            )}
          </CatalogSection>
        </div>
      )}

      <SkillDetailSheet
        skill={selectedSkill}
        open={selectedSkill !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSkill(null);
        }}
      />

      <AddSkillDialog
        open={addOpen && tab === "skills"}
        onOpenChange={setAddOpen}
        busy={busyKey === "install-skill"}
        onInstall={installSkill}
      />

      <AddConnectorDialog
        open={addOpen && tab === "connectors"}
        onOpenChange={setAddOpen}
        busy={busyKey === "upsert-mcp"}
        onSave={upsertMcp}
      />
    </div>
  );
}
