import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchContextUsage } from "@/lib/api";
import type { ContextUsageCategory, ContextUsagePayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const RING_R = 7;
const RING_C = 2 * Math.PI * RING_R;
const REFRESH_DEBOUNCE_MS = 280;

interface ContextUsageButtonProps {
  sessionKey?: string | null;
  token?: string | null;
  draftText?: string;
  isHero?: boolean;
  className?: string;
}

function emptyUsage(): ContextUsagePayload {
  return {
    context_window_tokens: 128_000,
    used_tokens: 0,
    free_tokens: 128_000,
    used_pct: 0,
    estimate_method: "chars/4",
    categories: [
      {
        id: "free",
        label: "Free space",
        tokens: 128_000,
        count: 0,
        color: "#6b7280",
        pct: 100,
        tokens_label: "128k",
      },
    ],
    used_label: "0",
    free_label: "128k",
    window_label: "128k",
  };
}

function usedCategories(categories: ContextUsageCategory[]): ContextUsageCategory[] {
  return categories.filter((c) => c.id !== "free");
}

export function ContextUsageButton({
  sessionKey,
  token,
  draftText = "",
  isHero = false,
  className,
}: ContextUsageButtonProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<ContextUsagePayload>(emptyUsage);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionKey || !token) {
      setUsage(emptyUsage());
      setLoadFailed(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchContextUsage(token, sessionKey, draftText);
      setUsage(data);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [draftText, sessionKey, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const usedPct = Math.min(100, Math.max(0, Number(usage.used_pct) || 0));
  const ringOffset = RING_C * (1 - usedPct / 100);
  const segments = usedCategories(usage.categories).filter((c) => c.tokens > 0);
  const listRows = usedCategories(usage.categories);
  const ringTone =
    usedPct >= 90 ? "hot" : usedPct >= 70 ? "warn" : "ok";

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t("thread.composer.contextUsage.buttonAria", {
            defaultValue: "Show context usage",
          })}
          title={t("thread.composer.contextUsage.buttonAria", {
            defaultValue: "Show context usage",
          })}
          className={cn(
            "rounded-full border border-transparent text-muted-foreground hover:bg-muted/65 hover:text-foreground",
            isHero ? "h-8 w-8" : "h-9 w-9",
            className,
          )}
        >
          <svg
            width={isHero ? 18 : 20}
            height={isHero ? 18 : 20}
            viewBox="0 0 20 20"
            aria-hidden
            className="shrink-0"
          >
            <circle
              cx="10"
              cy="10"
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="opacity-25"
            />
            <circle
              cx="10"
              cy="10"
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 10 10)"
              className={cn(
                ringTone === "hot" && "text-red-500",
                ringTone === "warn" && "text-amber-500",
                ringTone === "ok" && "text-foreground/80",
              )}
            />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={10}
        className="w-[min(20.5rem,calc(100vw-1.5rem))] rounded-[16px] border-border/70 bg-popover p-0 shadow-[0_16px_40px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-neutral-900 dark:shadow-[0_20px_48px_rgba(0,0,0,0.55)]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-3 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-medium text-muted-foreground">
              {t("thread.composer.contextUsage.title", { defaultValue: "Context Usage" })}
            </div>
            <button
              type="button"
              aria-label={t("thread.composer.contextUsage.closeAria", { defaultValue: "Close" })}
              className="rounded-md p-1 text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {!sessionKey || !token ? (
            <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-[12.5px] text-muted-foreground">
              {t("thread.composer.contextUsage.noSession", {
                defaultValue: "Open a chat to estimate context usage.",
              })}
            </div>
          ) : loadFailed ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-[12.5px] text-destructive">
              {t("thread.composer.contextUsage.loadFailed", {
                defaultValue: "Could not load context usage.",
              })}
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[15px] font-semibold tabular-nums text-foreground">
                  {t("thread.composer.contextUsage.fullPct", {
                    pct: usedPct,
                    defaultValue: "{{pct}}% Full",
                  })}
                </div>
                <div className="text-[12.5px] tabular-nums text-muted-foreground">
                  {t("thread.composer.contextUsage.tokensLine", {
                    used: usage.used_label ?? String(usage.used_tokens),
                    window: usage.window_label ?? String(usage.context_window_tokens),
                    defaultValue: "~{{used}} / {{window}} Tokens",
                  })}
                </div>
              </div>

              <div
                className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/70 dark:bg-white/10"
                aria-hidden
              >
                {segments.map((c) => (
                  <span
                    key={c.id}
                    title={`${c.label}: ${c.tokens_label ?? c.tokens}`}
                    style={{
                      width: `${Math.max(c.pct || 0, c.tokens ? 0.35 : 0)}%`,
                      background: c.color || "#888",
                    }}
                  />
                ))}
              </div>

              <div className="space-y-1.5">
                {listRows.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 text-[12.5px] text-foreground/90"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ background: c.color || "#888" }}
                    />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {c.tokens_label ?? String(c.tokens)}
                    </span>
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="text-[11px] text-muted-foreground/70">
                  {t("thread.composer.contextUsage.updating", { defaultValue: "Updating…" })}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground/60">
                  {t("thread.composer.contextUsage.estimateHint", {
                    method: usage.estimate_method || "chars/4",
                    defaultValue: "Estimate · {{method}}",
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
