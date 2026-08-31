import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Shared section chrome for skills / connectors catalog grids. */
export function CatalogSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-border/45 pb-2">
        <h2 className="px-1 text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return <div className="px-1 py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export function LoadingHint() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {t("settings.skills.loading", { defaultValue: "Loading…" })}
    </div>
  );
}
