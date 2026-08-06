import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { PendingApproval } from "@/lib/types";

interface ApprovalCardProps {
  approval: PendingApproval;
  resolving?: boolean;
  onDecision: (decision: "approve" | "reject") => void;
}

/** A deliberate pause point for tools that can mutate state or call external services. */
export function ApprovalCard({ approval, resolving = false, onDecision }: ApprovalCardProps) {
  const { t } = useTranslation();
  const toolNames = approval.tool_calls.map((call) => call.name).join(", ") || "tool";
  const expires = Number.isFinite(approval.expires_at_ms)
    ? new Date(approval.expires_at_ms).toLocaleTimeString()
    : "—";

  return (
    <section
      aria-label={t("approval.ariaLabel")}
      className="mx-auto mb-3 w-full max-w-[49.5rem] overflow-hidden rounded-xl border border-amber-500/45 bg-amber-500/[0.07] shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-amber-500/25 px-3 py-2.5">
        <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span className="text-sm font-semibold">{t("approval.title")}</span>
        <code className="min-w-0 truncate text-xs text-muted-foreground">{toolNames}</code>
        <span className="ml-auto shrink-0 rounded-full border border-amber-500/35 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
          {approval.risk || "unknown"}
        </span>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <p className="text-sm text-muted-foreground">
          {approval.reason || t("approval.defaultReason")}
        </p>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/70 p-2 text-xs leading-5 text-muted-foreground">
          {JSON.stringify(approval.tool_calls, null, 2)}
        </pre>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={resolving}
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => onDecision("approve")}
          >
            {resolving ? t("approval.processing") : t("approval.approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={resolving}
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDecision("reject")}
          >
            {t("approval.reject")}
          </Button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {t("approval.expiresAt", { time: expires })}
          </span>
        </div>
      </div>
    </section>
  );
}
