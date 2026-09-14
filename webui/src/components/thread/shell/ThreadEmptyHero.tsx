import { useTranslation } from "react-i18next";

import { CursorBlend } from "@/components/effects/cursor-blend";

type ThreadEmptyHeroProps = {
  loading: boolean;
  greetingKey: string;
};

export function ThreadEmptyHero({ loading, greetingKey }: ThreadEmptyHeroProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("thread.loadingConversation")}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center text-center animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <CursorBlend
        as="h1"
        className="max-w-[30rem] text-balance text-[34px] font-normal leading-[1.08] tracking-normal text-foreground sm:text-[48px] sm:leading-tight"
      >
        {t(greetingKey)}
      </CursorBlend>
    </div>
  );
}
