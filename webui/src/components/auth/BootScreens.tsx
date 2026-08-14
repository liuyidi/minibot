import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type FormEvent, useState } from "react";

const PRIVACY_URL = "https://bot.liuyidi.me/privacy";
const TERMS_URL = "https://bot.liuyidi.me/terms";

export function BootLoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3 animate-in fade-in-0 duration-300">
        <div className="flex items-center gap-2 text-sm text-[#666666]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#080808]/40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#080808]/60" />
          </span>
          {label}
        </div>
      </div>
    </div>
  );
}

export function BrowserLoginWaiting({
  waiting,
  onLogin,
}: {
  waiting: boolean;
  onLogin: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative flex h-full w-full flex-col bg-white text-[#080808]">
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="flex w-full max-w-[360px] flex-col items-center gap-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("app.auth.welcomeTitle")}
          </h1>
          {waiting ? (
            <div className="flex w-full flex-col items-center gap-4">
              <p className="text-sm text-[#666666]">{t("app.auth.browserWaiting")}</p>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-full border-[#dedede] bg-white text-base font-semibold text-[#080808] hover:bg-[#f5f5f5]"
                onClick={onLogin}
              >
                {t("app.auth.browserRetry")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="h-12 w-full rounded-full bg-[#080808] text-base font-semibold text-white hover:bg-[#080808]/90"
              onClick={onLogin}
            >
              {t("app.auth.login")}
            </Button>
          )}
        </div>
      </div>
      <footer className="hidden items-center justify-center gap-6 pb-8 text-sm text-[#8a8a8a]">
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-[#666666]"
        >
          {t("app.auth.privacy")}
        </a>
        <a
          href={TERMS_URL}
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-[#666666]"
        >
          {t("app.auth.terms")}
        </a>
      </footer>
    </div>
  );
}

export function AuthForm({
  failed,
  onSecret,
}: {
  failed: boolean;
  onSecret: (secret: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const secret = value.trim();
    if (!secret) return;
    setSubmitting(true);
    onSecret(secret);
  };

  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-lg font-semibold">{t("app.auth.title")}</p>
          <p className="text-sm text-muted-foreground">{t("app.auth.hint")}</p>
        </div>
        {failed && (
          <p className="text-center text-sm text-destructive">
            {t("app.auth.invalid")}
          </p>
        )}
        <Input
          type="password"
          placeholder={t("app.auth.placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={submitting}
          autoFocus
        />
        <Button
          type="submit"
          className="w-full"
          disabled={!value.trim() || submitting}
        >
          {t("app.auth.submit")}
        </Button>
      </form>
    </div>
  );
}
