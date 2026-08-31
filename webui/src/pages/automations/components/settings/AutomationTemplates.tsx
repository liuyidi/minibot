import { useTranslation } from "react-i18next";

import { AUTOMATION_TEMPLATE_CARDS } from "../../lib/automationTypes";

export function AutomationTemplatesSection({
  onRequestCreate,
}: {
  onRequestCreate: (prefill?: { name?: string; message?: string }) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-[14px] font-semibold text-foreground">
        {t("settings.automations.templatesTitle")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AUTOMATION_TEMPLATE_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() =>
                onRequestCreate({
                  name: t(card.titleKey),
                  message: t(card.promptKey),
                })
              }
              className="flex items-start gap-3 rounded-2xl border border-border/40 bg-background/85 px-3.5 py-3.5 text-left shadow-[0_10px_28px_rgba(15,23,42,0.04)] transition-colors hover:bg-muted/30"
            >
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-foreground/80">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-foreground">
                  {t(card.titleKey)}
                </span>
                <span className="mt-1 block text-[12px] leading-5 text-muted-foreground">
                  {t(card.descKey)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
