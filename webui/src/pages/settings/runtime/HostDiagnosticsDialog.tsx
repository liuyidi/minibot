import {
  AlertTriangle,
  Copy,
  Gauge,
  Laptop,
  Loader2,
  RefreshCw,
  Stethoscope,
  Terminal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HostDiagnosticsSnapshot } from "@/lib/configs/runtime";
import { copyTextToClipboard } from "@/lib/utils/clipboard";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<string, typeof Laptop> = {
  environment: Laptop,
  system: Gauge,
  runtime: Terminal,
};

export function HostDiagnosticsDialog({
  open,
  onOpenChange,
  loadSnapshot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadSnapshot: () => Promise<HostDiagnosticsSnapshot>;
}) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const [snapshot, setSnapshot] = useState<HostDiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadSnapshot();
      setSnapshot(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadSnapshot]);

  useEffect(() => {
    if (!open) {
      setCopyState("idle");
      return;
    }
    void refresh();
  }, [open, refresh]);

  const generatedLabel = useMemo(() => {
    if (!snapshot?.generated_at_ms) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      }).format(new Date(snapshot.generated_at_ms));
    } catch {
      return null;
    }
  }, [snapshot?.generated_at_ms]);

  const copyReport = async () => {
    if (!snapshot?.report) return;
    const ok = await copyTextToClipboard(snapshot.report);
    setCopyState(ok ? "copied" : "failed");
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88vh,860px)] max-w-[min(92vw,640px)] flex-col gap-0 overflow-hidden rounded-[28px] border-border/55 bg-card/95 p-0 shadow-[0_28px_90px_rgba(15,23,42,0.20)] backdrop-blur-xl dark:border-white/10">
        <DialogHeader className="border-b border-border/45 px-5 py-4 text-left">
          <DialogTitle className="text-[18px] font-semibold tracking-[-0.01em]">
            {tx("settings.diagnostics.title", "Diagnostics")}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-5">
            {tx(
              "settings.diagnostics.subtitle",
              "A snapshot of your Mac and the minibot desktop host. Attach it when reporting issues.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && !snapshot ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {tx("settings.diagnostics.loading", "Collecting diagnostics…")}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[18px] border border-destructive/25 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
              {error}
            </div>
          ) : null}

          {snapshot?.issues.length ? (
            <section className="mb-4 rounded-[20px] border border-amber-500/25 bg-amber-500/8 p-4">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
                <Stethoscope className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                {tx("settings.diagnostics.detectedIssues", "Detected issues")}
              </div>
              <div className="space-y-2">
                {snapshot.issues.map((issue, index) => (
                  <div
                    key={`${issue.severity}-${index}`}
                    className="flex items-start gap-2 text-[12.5px] leading-5 text-foreground/90"
                  >
                    <AlertTriangle
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        issue.severity === "error"
                          ? "text-destructive"
                          : issue.severity === "warn"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span>{issue.message}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {snapshot?.sections.map((section) => {
            const Icon = SECTION_ICONS[section.id] ?? Laptop;
            const visibleRows = section.rows.filter(
              (row) => row.key !== "Connection log (tail)",
            );
            if (!visibleRows.length) return null;
            return (
              <section
                key={section.id}
                className="mb-3 rounded-[20px] border border-border/50 bg-background/70 p-4 last:mb-0"
              >
                <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {sectionTitle(section.id, section.title, tx)}
                </div>
                <dl className="space-y-2">
                  {visibleRows.map((row) => (
                    <div
                      key={row.key}
                      className="grid grid-cols-[minmax(0,34%)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px] leading-5"
                    >
                      <dt className="text-muted-foreground">{row.key}</dt>
                      <dd className="break-words font-medium text-foreground/90">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border/45 px-5 py-4">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 rounded-full"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label={tx("settings.diagnostics.refresh", "Refresh")}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
          </Button>
          <div className="flex items-center gap-3">
            {generatedLabel ? (
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                {generatedLabel}
              </span>
            ) : null}
            <Button
              type="button"
              className="rounded-full"
              onClick={() => void copyReport()}
              disabled={!snapshot?.report || loading}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {copyState === "copied"
                ? tx("settings.diagnostics.copied", "Copied")
                : copyState === "failed"
                  ? tx("settings.diagnostics.copyFailed", "Copy failed")
                  : tx("settings.diagnostics.copyReport", "Copy report")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function sectionTitle(
  id: string,
  fallback: string,
  tx: (key: string, fallback: string) => string,
) {
  if (id === "environment") return tx("settings.diagnostics.sections.environment", "Environment");
  if (id === "system") return tx("settings.diagnostics.sections.system", "System");
  if (id === "runtime") return tx("settings.diagnostics.sections.runtime", "Runtime");
  return fallback;
}
