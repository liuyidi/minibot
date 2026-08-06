import { Loader2, RotateCcw, Search, X } from "lucide-react";
import { type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";

import { SegmentedControl } from "@/components/settings/controls";
import { SettingsSectionTitle } from "@/components/settings/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CliAppsPayload, McpPresetsPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ThirdPartyBrandNotice } from "@/pages/settings/shared/ThirdPartyBrandNotice";
import type {
  AppsCatalogItem,
  AppsKindFilter,
  CustomMcpForm,
} from "@/pages/settings/shared/types";
import {
  CliAppReadyPanel,
  CliAppsCatalogRow,
  McpAppsCatalogRow,
  McpCustomServerPanel,
  appsReady,
  appsSearchText,
  appsTitle,
} from "./apps-ui";

export function AppsCatalogSettings({
  cliApps,
  mcpPresets,
  cliAppsLoading,
  mcpPresetsLoading,
  query,
  filter,
  cliActionKey,
  mcpActionKey,
  cliMessage,
  cliError,
  cliFocusName,
  mcpMessage,
  mcpError,
  mcpFieldValues,
  customMcpForm,
  mcpConfigImport,
  showBrandLogos,
  requiresRestartPending,
  onQueryChange,
  onFilterChange,
  onCliAction,
  onMcpAction,
  onDismissStatus,
  onBackToChat,
  onMcpFieldChange,
  onCustomMcpFormChange,
  onMcpConfigImportChange,
  onSaveCustomMcp,
  onImportMcpConfig,
  onMcpToolsChange,
  onRestart,
  isRestarting,
}: {
  cliApps: CliAppsPayload | null;
  mcpPresets: McpPresetsPayload | null;
  cliAppsLoading: boolean;
  mcpPresetsLoading: boolean;
  query: string;
  filter: AppsKindFilter;
  cliActionKey: string | null;
  mcpActionKey: string | null;
  cliMessage: string | null;
  cliError: string | null;
  cliFocusName: string | null;
  mcpMessage: string | null;
  mcpError: string | null;
  mcpFieldValues: Record<string, Record<string, string>>;
  customMcpForm: CustomMcpForm;
  mcpConfigImport: string;
  showBrandLogos: boolean;
  requiresRestartPending: boolean;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: AppsKindFilter) => void;
  onCliAction: (action: "install" | "update" | "uninstall" | "test", name: string) => void;
  onMcpAction: (action: "enable" | "remove" | "test", name: string, values?: Record<string, string>) => void;
  onDismissStatus: () => void;
  onBackToChat: () => void;
  onMcpFieldChange: (presetName: string, fieldName: string, value: string) => void;
  onCustomMcpFormChange: Dispatch<SetStateAction<CustomMcpForm>>;
  onMcpConfigImportChange: (value: string) => void;
  onSaveCustomMcp: () => void;
  onImportMcpConfig: () => void;
  onMcpToolsChange: (name: string, enabledTools: string[]) => void;
  onRestart?: () => void;
  isRestarting?: boolean;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const filterOptions = [
    { value: "all", label: tx("settings.apps.filterAll", "All") },
    { value: "cli", label: tx("settings.apps.filterCli", "App CLIs") },
    { value: "mcp", label: tx("settings.apps.filterMcp", "MCP services") },
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const items: AppsCatalogItem[] = [
    ...(cliApps?.apps ?? []).map((app) => ({ id: `cli:${app.name}`, kind: "cli" as const, app })),
    ...(mcpPresets?.presets ?? []).map((preset) => ({
      id: `mcp:${preset.name}`,
      kind: "mcp" as const,
      preset,
    })),
  ]
    .filter((item) => filter === "all" || item.kind === filter)
    .filter((item) => !normalizedQuery || appsSearchText(item).includes(normalizedQuery))
    .sort((left, right) => {
      const rank = Number(!appsReady(left)) - Number(!appsReady(right));
      return rank || appsTitle(left).localeCompare(appsTitle(right));
    });
  const focusedApp = cliFocusName
    ? (cliApps?.apps ?? []).find((app) => app.name === cliFocusName && app.installed)
    : null;
  const loading = (cliAppsLoading || mcpPresetsLoading) && !cliApps && !mcpPresets;
  const statusMessage = cliError || mcpError || (!focusedApp ? cliMessage || mcpMessage : null);
  const statusIsError = Boolean(cliError || mcpError);
  const caption = t("settings.apps.caption", {
    cli: cliApps?.installed_count ?? 0,
    mcp: mcpPresets?.installed_count ?? 0,
    defaultValue: "{{cli}} CLI · {{mcp}} MCP",
  });

  return (
    <div className="space-y-7">
      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[680px] text-[13px] leading-5 text-muted-foreground">
            {tx(
              "settings.apps.description",
              "Add local app adapters and connected tool servers that minibot can use from chat.",
            )}
          </p>
          <span className="text-[12px] font-medium text-muted-foreground">{caption}</span>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={tx("settings.apps.searchPlaceholder", "Search Apps")}
              className="h-12 rounded-[14px] border-border/70 bg-card/90 pl-11 text-[15px] shadow-sm"
            />
          </div>
          <SegmentedControl
            value={filter}
            options={filterOptions}
            onChange={(value) => onFilterChange(value as AppsKindFilter)}
          />
        </div>
      </section>

      {statusMessage ? (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-[12px] border py-2.5 pl-4 pr-2 text-[13px]",
            statusIsError
              ? "border-destructive/20 bg-destructive/5 text-destructive"
              : "border-border/55 bg-muted/35 text-muted-foreground",
          )}
        >
          <span className="min-w-0">{statusMessage}</span>
          <button
            type="button"
            aria-label={tx("settings.actions.dismiss", "Dismiss")}
            title={tx("settings.actions.dismiss", "Dismiss")}
            onClick={onDismissStatus}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
              statusIsError
                ? "text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
            )}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      {focusedApp ? (
        <CliAppReadyPanel app={focusedApp} showBrandLogos={showBrandLogos} onBackToChat={onBackToChat} />
      ) : null}

      {requiresRestartPending ? (
        <div className="flex flex-col gap-3 rounded-[12px] border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-[12.5px] text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{tx("settings.mcp.restartRequired", "Restart minibot to connect updated MCP tools.")}</span>
          {onRestart ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRestart}
              disabled={isRestarting}
              className="h-8 rounded-full bg-background/80 px-3 text-[12px] font-semibold"
            >
              {isRestarting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              {isRestarting ? t("app.system.restarting") : t("app.system.restart")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <section>
        <div className="flex items-center justify-between border-b border-border/45 pb-3">
          <SettingsSectionTitle>{tx("settings.apps.featured", "Featured")}</SettingsSectionTitle>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
            {items.length}
          </span>
        </div>
        {loading ? (
          <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            {tx("settings.apps.loading", "Loading Apps...")}
          </div>
        ) : items.length ? (
          <div className="grid gap-x-10 gap-y-1 py-3 md:grid-cols-2">
            {items.map((item) =>
              item.kind === "cli" ? (
                <CliAppsCatalogRow
                  key={item.id}
                  app={item.app}
                  actionKey={cliActionKey}
                  showBrandLogos={showBrandLogos}
                  onAction={onCliAction}
                />
              ) : (
                <McpAppsCatalogRow
                  key={item.id}
                  preset={item.preset}
                  values={mcpFieldValues[item.preset.name] ?? {}}
                  actionKey={mcpActionKey}
                  showBrandLogos={showBrandLogos}
                  onFieldChange={onMcpFieldChange}
                  onAction={onMcpAction}
                  onToolsChange={onMcpToolsChange}
                />
              ),
            )}
          </div>
        ) : (
          <div className="px-3 py-12 text-center text-sm text-muted-foreground">
            {tx("settings.apps.empty", "No apps match this filter.")}
          </div>
        )}
      </section>

      {filter !== "cli" ? (
        <McpCustomServerPanel
          form={customMcpForm}
          configImport={mcpConfigImport}
          actionKey={mcpActionKey}
          onFormChange={onCustomMcpFormChange}
          onConfigImportChange={onMcpConfigImportChange}
          onSave={onSaveCustomMcp}
          onImportConfig={onImportMcpConfig}
        />
      ) : null}

      <ThirdPartyBrandNotice />
    </div>
  );
}

