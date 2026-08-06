import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { AlertCircle, ChevronRight, FileText, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CodeBlock } from "@/components/markdown/CodeBlock";
import { splitFilePath } from "./FileReferenceChip";
import { ApiError, fetchFilePreview } from "@/lib/apis/api";
import type { FilePreviewPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FilePreviewPanelProps {
  sessionKey: string;
  path: string;
  token: string;
  desktopWidth?: number;
  isClosing?: boolean;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClose: () => void;
}

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: FilePreviewPayload };

export function FilePreviewPanel({
  sessionKey,
  path,
  token,
  desktopWidth = 544,
  isClosing = false,
  onResizeStart,
  onClose,
}: FilePreviewPanelProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchFilePreview(token, sessionKey, path)
      .then((payload) => {
        if (!cancelled) setState({ status: "ready", payload });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof ApiError
          ? (error.status === 404 && /API route not found/i.test(error.message)
            ? t("filePreview.routeMissing", {
              defaultValue: "File preview needs the latest gateway. Restart minibot gateway and try again.",
            })
            : error.message)
          : t("filePreview.failed", { defaultValue: "Could not preview this file." });
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [path, sessionKey, t, token]);

  const displayPath = state.status === "ready" ? state.payload.display_path : path;
  const previewPath = state.status === "ready" ? state.payload.path : displayPath;
  const normalizedPreviewPath = previewPath.replace(/\\/g, "/");
  const hasRootPrefix = normalizedPreviewPath.startsWith("/");
  const { name } = splitFilePath(displayPath);
  const breadcrumbs = useMemo(
    () => normalizedPreviewPath.split("/").filter(Boolean),
    [normalizedPreviewPath],
  );
  const compactBreadcrumbs = useMemo(
    () => (breadcrumbs.length > 2 ? breadcrumbs.slice(-2) : breadcrumbs),
    [breadcrumbs],
  );
  const hasCompactPrefix = breadcrumbs.length > compactBreadcrumbs.length;

  return (
    <aside
      aria-label={t("filePreview.aria", { defaultValue: "File preview" })}
      style={{
        "--file-preview-width": `${desktopWidth}px`,
        "--file-preview-slot-width": !entered || isClosing ? "0px" : `${desktopWidth}px`,
      } as CSSProperties}
      className={cn(
        "absolute inset-y-0 right-0 z-30 w-[min(100vw,var(--file-preview-slot-width))] overflow-hidden",
        "transition-[width] duration-300 ease-out will-change-[width]",
        "md:relative md:z-auto md:w-[var(--file-preview-slot-width)] md:min-w-0 md:shrink-0",
        isClosing && "pointer-events-none",
      )}
      data-testid="file-preview-panel"
      data-file-preview-panel
    >
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-[min(100vw,var(--file-preview-width))] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] md:w-[var(--file-preview-width)] md:pb-0",
          "border-l border-border/70 bg-background shadow-2xl md:shadow-none",
          "transition-[opacity,transform] duration-300 ease-out will-change-transform",
          !entered || isClosing ? "translate-x-full opacity-0" : "translate-x-0 opacity-100",
          "motion-reduce:translate-x-0",
        )}
      >
        {onResizeStart ? (
          <button
            type="button"
            aria-label={t("filePreview.resize", { defaultValue: "Resize file preview" })}
            className={cn(
              "group absolute inset-y-0 left-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none md:flex",
              "items-stretch justify-center focus-visible:outline-none",
            )}
            onPointerDown={onResizeStart}
          >
            <span
              aria-hidden
              className={cn(
                "h-full w-px bg-foreground/25 opacity-0 transition-opacity",
                "group-hover:opacity-100 group-focus-visible:bg-ring group-focus-visible:opacity-100",
              )}
            />
          </button>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3">
            <div
              className={cn(
                "inline-flex min-w-0 flex-1 items-center gap-2 rounded-[12px]",
                "bg-muted/70 px-2.5 py-1.5 text-sm font-medium",
              )}
              title={name || displayPath}
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate">{name || displayPath}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-label={t("filePreview.close", { defaultValue: "Close file preview" })}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-1.5 overflow-hidden",
                "border-b border-border/45 px-4 text-[13px] text-muted-foreground",
              )}
              title={previewPath}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {hasCompactPrefix ? (
                  <span className="shrink-0 text-muted-foreground/55">...</span>
                ) : hasRootPrefix ? (
                  <span className="shrink-0 text-muted-foreground/55">/</span>
                ) : null}
                {compactBreadcrumbs.length > 0 ? (
                  compactBreadcrumbs.map((part, index) => (
                    <span key={`${part}-${index}`} className="flex min-w-0 items-center gap-1.5">
                      {index > 0 || hasCompactPrefix || hasRootPrefix ? (
                        <ChevronRight
                          className="h-3 w-3 shrink-0 text-muted-foreground/40"
                          aria-hidden
                        />
                      ) : null}
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          index === compactBreadcrumbs.length - 1
                            ? "font-medium text-foreground"
                            : "max-w-[42vw] shrink text-muted-foreground/76",
                        )}
                      >
                        {part}
                      </span>
                    </span>
                  ))
                ) : (
                  <span className="truncate">{previewPath}</span>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {state.status === "loading" ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("filePreview.loading", { defaultValue: "Loading preview..." })}
                </div>
              ) : state.status === "error" ? (
                <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
                  <div className="max-w-sm">
                    <AlertCircle className="mx-auto mb-3 h-5 w-5 text-muted-foreground/70" aria-hidden />
                    <p>{state.message}</p>
                  </div>
                </div>
              ) : (
                <div className="min-h-full">
                  {state.payload.truncated ? (
                    <div className="mx-4 mt-3 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                      {t("filePreview.truncated", {
                        defaultValue: "Preview is truncated because this file is large.",
                      })}
                    </div>
                  ) : null}
                  <CodeBlock
                    language={state.payload.language}
                    code={state.payload.content}
                    chrome="none"
                    showLineNumbers
                    wrapLongLines={false}
                    className="min-h-full"
                  />
                </div>
              )}
          </div>
        </div>
      </div>
      </div>
    </aside>
  );
}
