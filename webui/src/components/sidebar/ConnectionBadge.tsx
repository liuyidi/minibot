import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useClient } from "@/providers/ClientProvider";
import type { ConnectionStatus } from "@/lib/types";

const DOT_BG: Record<ConnectionStatus, string> = {
  idle: "bg-muted-foreground",
  connecting: "bg-amber-500",
  open: "bg-emerald-500",
  reconnecting: "bg-amber-500",
  closed: "bg-muted-foreground",
  error: "bg-destructive",
};

/** Compact connection indicator (e.g. avatar corner status). */
export function ConnectionStatusDot({
  className,
  ringClassName = "ring-2 ring-sidebar",
}: {
  className?: string;
  ringClassName?: string;
}) {
  const { t } = useTranslation();
  const { client } = useClient();
  const [status, setStatus] = useState<ConnectionStatus>(client.status);

  useEffect(() => client.onStatus(setStatus), [client]);

  const pulsing =
    status === "connecting" ||
    status === "reconnecting" ||
    status === "error";
  const label = t(`connection.${status}`);

  return (
    <span
      className={cn("relative flex h-2.5 w-2.5 shrink-0", className)}
      aria-live="polite"
      role="status"
      title={label}
      aria-label={label}
    >
      {pulsing ? (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            DOT_BG[status],
          )}
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "relative inline-flex h-2.5 w-2.5 rounded-full",
          DOT_BG[status],
          ringClassName,
        )}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Standalone badge used historically in the sidebar footer. */
export function ConnectionBadge() {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-sidebar-accent/65">
      <ConnectionStatusDot ringClassName="" />
    </span>
  );
}
