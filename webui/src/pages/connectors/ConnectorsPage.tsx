import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityHubNav } from "@/components/capabilities";
import {
  CatalogSection,
  EmptyHint,
  LoadingHint,
} from "@/components/capabilities/CatalogUi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/hooks/settings";
import { useSkillsCatalog } from "@/hooks/skills";

import { AddConnectorDialog } from "./AddConnectorDialog";
import { ConnectorCard } from "./ConnectorCard";

export function ConnectorsPage() {
  const { t } = useTranslation();
  const {
    presets,
    templates,
    mcpLoading,
    busyKey,
    error,
    clearError,
    applyTemplate,
    setMcpEnabled,
    uninstallMcp,
    upsertMcp,
    importMcpConfig,
  } = useSkillsCatalog();
  const { settings } = useSettings();

  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);
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

  return (
    <div className="space-y-6">
      <CapabilityHubNav
        active="connectors"
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
                placeholder={t("settings.skills.searchConnectors", {
                  defaultValue: "Search connectors",
                })}
                className="h-9 rounded-full border-border/50 bg-background/80 pl-9"
              />
            </div>
            <Button
              type="button"
              className="h-9 shrink-0 rounded-full px-4"
              onClick={() => {
                clearError();
                setAddOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t("settings.skills.addConnector", { defaultValue: "Add connector" })}
            </Button>
          </>
        }
      />

      {error ? (
        <div className="rounded-[14px] bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="space-y-8">
        <CatalogSection
          title={t("settings.skills.sectionInstalledConnectors", { defaultValue: "Installed" })}
          count={filteredPresets.length}
        >
          {mcpLoading ? (
            <LoadingHint />
          ) : filteredPresets.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {filteredPresets.map((preset) => (
                <ConnectorCard
                  key={preset.id}
                  title={preset.label || preset.id}
                  description={
                    preset.inferred_type ||
                    preset.type ||
                    (preset.command ? `stdio · ${preset.command}` : preset.url || "MCP")
                  }
                  enabled={preset.enabled}
                  busy={
                    busyKey === `mcp-enable:${preset.id}` ||
                    busyKey === `mcp-uninstall:${preset.id}`
                  }
                  onToggleEnabled={(enabled) => void setMcpEnabled(preset.id, enabled)}
                  onUninstall={() => void uninstallMcp(preset.id)}
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <AddConnectorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        busy={busyKey === "upsert-mcp" || busyKey === "import-mcp"}
        presets={presets}
        configPath={settings?.runtime?.config_path}
        onSave={upsertMcp}
        onImport={importMcpConfig}
      />
    </div>
  );
}
