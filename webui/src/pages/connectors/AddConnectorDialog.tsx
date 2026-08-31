import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Database,
  Loader2,
  Server,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { SegmentedControl } from "@/components/settings/controls";
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
import { JsonConfigEditor } from "@/components/ui/json-config-editor";
import { Textarea } from "@/components/ui/textarea";
import type { UpsertMcpBody } from "@/hooks/skills";
import type { MinibotMcpPreset } from "@/lib/apis/api";
import {
  customMcpFormToUpsertBody,
  DEFAULT_CUSTOM_MCP_FORM,
  emptyMcpConfigJson,
  serializeMcpPresetsToConfigJson,
  type CustomMcpForm,
  type McpTransport,
} from "@/lib/skills/mcp-config-import";
import { cn } from "@/lib/utils";

type ConnectorMode = "custom" | "import";

export function AddConnectorDialog({
  open,
  onOpenChange,
  busy,
  presets = [],
  configPath,
  onSave,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  presets?: MinibotMcpPreset[];
  /** App config path shown in the Workbuddy-style path bar. */
  configPath?: string | null;
  onSave: (body: UpsertMcpBody) => Promise<string | null>;
  onImport: (raw: string) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const [mode, setMode] = useState<ConnectorMode>("custom");
  const [form, setForm] = useState<CustomMcpForm>(DEFAULT_CUSTOM_MCP_FORM);
  const [configImport, setConfigImport] = useState(emptyMcpConfigJson);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remote = form.transport !== "stdio";
  const canSave =
    Boolean(form.name.trim()) && (remote ? Boolean(form.url.trim()) : Boolean(form.command.trim()));

  useEffect(() => {
    if (!open) return;
    setConfigImport(serializeMcpPresetsToConfigJson(presets));
  }, [open, presets]);

  const update = <K extends keyof CustomMcpForm>(key: K, value: CustomMcpForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetAndClose = () => {
    setForm(DEFAULT_CUSTOM_MCP_FORM);
    setConfigImport(emptyMcpConfigJson());
    setAdvancedOpen(false);
    setError(null);
    setMode("custom");
    onOpenChange(false);
  };

  const submitCustom = async () => {
    setError(null);
    let body: UpsertMcpBody;
    try {
      body = customMcpFormToUpsertBody(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const message = await onSave(body);
    if (!message) {
      resetAndClose();
      return;
    }
    setError(message);
  };

  const submitImport = async () => {
    setError(null);
    const message = await onImport(configImport);
    if (!message) {
      resetAndClose();
      return;
    }
    setError(message);
  };

  const transports: Array<{ value: McpTransport; label: string }> = [
    { value: "stdio", label: "stdio" },
    { value: "streamableHttp", label: "HTTP" },
    { value: "sse", label: "SSE" },
  ];

  const pathLabel = configPath?.trim()
    ? configPath
    : tx("settings.mcp.configPathFallback", "app config · mcp_presets");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAndClose();
        else onOpenChange(next);
      }}
    >
      <DialogContent className={cn("gap-5 rounded-2xl p-6", mode === "import" ? "max-w-2xl" : "max-w-xl")}>
        <DialogHeader>
          <DialogTitle>
            {tx("settings.skills.addConnector", "Add connector")}
          </DialogTitle>
          <DialogDescription>
            {tx(
              "settings.mcp.moreOptionsSubtitle",
              "Add a custom server or import mcp.json.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "custom" ? "default" : "outline"}
            onClick={() => {
              setMode("custom");
              setError(null);
            }}
            className="h-9 rounded-xl px-3 text-[12px] font-semibold"
          >
            <Server className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {tx("settings.mcp.customAction", "Custom")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "import" ? "default" : "outline"}
            onClick={() => {
              setMode("import");
              setError(null);
              setConfigImport(serializeMcpPresetsToConfigJson(presets));
            }}
            className="h-9 rounded-xl px-3 text-[12px] font-semibold"
          >
            <Database className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {tx("settings.mcp.importAction", "Import")}
          </Button>
        </div>

        {mode === "custom" ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1">
                <span className="mb-1.5 block text-[11.5px] font-medium text-muted-foreground">
                  {tx("settings.mcp.serverName", "Server name")}
                </span>
                <Input
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder="docs"
                  className="h-9 rounded-full bg-background/80 text-[12.5px]"
                />
              </label>
              <div className="min-w-[220px]">
                <span className="mb-1.5 block text-[11.5px] font-medium text-muted-foreground">
                  {tx("settings.mcp.transport", "Transport")}
                </span>
                <SegmentedControl
                  value={form.transport}
                  options={transports}
                  onChange={(value) => update("transport", value as McpTransport)}
                />
              </div>
            </div>

            {remote ? (
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[11.5px] font-medium text-muted-foreground">
                  {tx("settings.mcp.serverUrl", "URL")}
                </span>
                <Input
                  value={form.url}
                  onChange={(event) => update("url", event.target.value)}
                  placeholder={
                    form.transport === "sse" ? "https://example.com/sse" : "https://example.com/mcp"
                  }
                  className="h-9 rounded-full bg-background/80 text-[12.5px]"
                />
              </label>
            ) : (
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[11.5px] font-medium text-muted-foreground">
                  {tx("settings.mcp.command", "Command")}
                </span>
                <Input
                  value={form.command}
                  onChange={(event) => update("command", event.target.value)}
                  placeholder="npx"
                  className="h-9 rounded-full bg-background/80 text-[12.5px]"
                />
              </label>
            )}

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAdvancedOpen((open) => !open)}
              className="h-8 rounded-full px-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "mr-1.5 h-3.5 w-3.5 transition-transform",
                  advancedOpen ? "rotate-180" : "",
                )}
                aria-hidden
              />
              {advancedOpen
                ? tx("settings.mcp.hideAdvanced", "Hide advanced")
                : tx("settings.mcp.advancedOptions", "Advanced options")}
            </Button>

            {advancedOpen ? (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px]">
                {!remote ? (
                  <label className="min-w-0">
                    <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">
                      {tx("settings.mcp.args", "Args JSON")}
                    </span>
                    <Textarea
                      value={form.args}
                      onChange={(event) => update("args", event.target.value)}
                      placeholder={'["-y", "docs-mcp"]'}
                      className="min-h-[68px] resize-y rounded-[12px] bg-background/80 font-mono text-[12px]"
                    />
                  </label>
                ) : (
                  <label className="min-w-0">
                    <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">
                      {tx("settings.mcp.headers", "Headers JSON")}
                    </span>
                    <Textarea
                      value={form.headers}
                      onChange={(event) => update("headers", event.target.value)}
                      placeholder={'{"Authorization":"Bearer ..."}'}
                      className="min-h-[68px] resize-y rounded-[12px] bg-background/80 font-mono text-[12px]"
                    />
                  </label>
                )}
                <label className="min-w-0">
                  <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">
                    {tx("settings.mcp.env", "Env JSON")}
                  </span>
                  <Textarea
                    value={form.env}
                    onChange={(event) => update("env", event.target.value)}
                    placeholder={'{"API_KEY":"..."}'}
                    className="min-h-[68px] resize-y rounded-[12px] bg-background/80 font-mono text-[12px]"
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">
                    {tx("settings.mcp.timeout", "Tool timeout")}
                  </span>
                  <Input
                    value={form.toolTimeout}
                    onChange={(event) => update("toolTimeout", event.target.value)}
                    inputMode="numeric"
                    className="h-9 rounded-full bg-background/80 text-[12.5px]"
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[14px] border border-border/55">
            <div className="border-b border-border/55 bg-muted/40 px-3.5 py-2.5 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {tx("settings.mcp.configPathLabel", "Config path")}:
              </span>{" "}
              <span className="break-all font-mono text-[11.5px]">{pathLabel}</span>
            </div>
            <JsonConfigEditor
              value={configImport}
              onChange={setConfigImport}
              disabled={busy}
              className="rounded-none border-0"
              minHeightClassName="min-h-[320px]"
            />
          </div>
        )}

        {error ? <p className="text-[13px] text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={resetAndClose}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          {mode === "custom" ? (
            <Button
              type="button"
              disabled={!canSave || busy}
              onClick={() => void submitCustom()}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              {tx("settings.mcp.saveCustom", "Save MCP")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!configImport.trim() || busy}
              onClick={() => void submitImport()}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Database className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              {tx("settings.mcp.saveConfig", "Save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
