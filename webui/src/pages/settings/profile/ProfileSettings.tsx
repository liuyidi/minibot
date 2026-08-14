import { useEffect, useRef, useState, type ReactNode } from "react";
import { Calendar, Copy, Hash, Sparkles, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ProfileAvatar } from "@/components/settings/ProfileAvatar";
import { SettingsGroup } from "@/components/settings/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyTextToClipboard } from "@/lib/utils/clipboard";

export type ProfileSettingsProps = {
  displayName: string;
  avatarSeed: string;
  userId: string;
  createdAtLabel: string;
  onSaveDisplayName: (value: string) => void;
  onRandomizeAvatar: () => void;
};

export function ProfileSettings({
  displayName,
  avatarSeed,
  userId,
  createdAtLabel,
  onSaveDisplayName,
  onRandomizeAvatar,
}: ProfileSettingsProps) {
  const { t } = useTranslation();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);
  const [copied, setCopied] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingName) setDraftName(displayName);
  }, [displayName, editingName]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const commitName = () => {
    onSaveDisplayName(draftName);
    setEditingName(false);
  };

  const copyUserId = async () => {
    const ok = await copyTextToClipboard(userId);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const unknown = t("settings.profile.unknownValue", { defaultValue: "—" });

  return (
    <div className="space-y-7">
      <header className="flex flex-col items-center pt-2 pb-1 text-center">
        <ProfileAvatar name={displayName} seed={avatarSeed} size="lg" />
        <h2 className="mt-4 min-h-[1.2em] text-[22px] font-semibold tracking-tight text-foreground sm:text-[26px]">
          {displayName || "\u00a0"}
        </h2>
      </header>

      <ProfileCard
        icon={UserRound}
        title={t("settings.profile.personalTitle", { defaultValue: "Personal information" })}
        subtitle={t("settings.profile.personalSubtitle", {
          defaultValue: "View and edit your basic information",
        })}
      >
        <ProfileField
          icon={<UserRound className="h-4 w-4" aria-hidden />}
          label={t("settings.profile.nickname", { defaultValue: "Nickname" })}
        >
          {editingName ? (
            <Input
              ref={nameInputRef}
              value={draftName}
              aria-label={t("settings.profile.nickname", { defaultValue: "Nickname" })}
              placeholder={t("settings.profile.nicknamePlaceholder", {
                defaultValue: "Enter a nickname",
              })}
              className="h-8 w-[min(16rem,100%)] text-right text-[13px]"
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitName();
                }
                if (event.key === "Escape") {
                  setDraftName(displayName);
                  setEditingName(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="max-w-[16rem] truncate text-right text-[13px] text-foreground hover:underline"
              onClick={() => setEditingName(true)}
            >
              {displayName}
            </button>
          )}
        </ProfileField>
        <ProfileField
          icon={
            <ProfileAvatar name={displayName} seed={avatarSeed} size="sm" className="h-6 w-6 text-[9px]" />
          }
          label={t("settings.profile.avatar", { defaultValue: "Avatar" })}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-[13px] text-muted-foreground"
            onClick={onRandomizeAvatar}
          >
            {t("settings.profile.randomizeAvatar", { defaultValue: "Randomize" })}
          </Button>
        </ProfileField>
      </ProfileCard>

      <ProfileCard
        icon={Sparkles}
        title={t("settings.profile.accountTitle", { defaultValue: "Account details" })}
        subtitle={t("settings.profile.accountSubtitle", {
          defaultValue: "View your account information",
        })}
      >
        <ProfileField
          icon={<Hash className="h-4 w-4" aria-hidden />}
          label={t("settings.profile.userId", { defaultValue: "User ID" })}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="max-w-[16rem] truncate rounded-md bg-muted px-2 py-0.5 font-mono text-[12px] text-muted-foreground">
              {userId || unknown}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label={
                copied
                  ? t("settings.profile.copiedUserId", { defaultValue: "Copied" })
                  : t("settings.profile.copyUserId", { defaultValue: "Copy user ID" })
              }
              onClick={() => void copyUserId()}
              disabled={!userId}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </ProfileField>
        <ProfileField
          icon={<Calendar className="h-4 w-4" aria-hidden />}
          label={t("settings.profile.createdAt", { defaultValue: "Registration date" })}
        >
          <span className="text-[13px] text-muted-foreground">{createdAtLabel || unknown}</span>
        </ProfileField>
      </ProfileCard>
    </div>
  );
}

function ProfileCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section>
      <SettingsGroup>
        <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-emerald-500/12 text-emerald-700 dark:text-emerald-400">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-foreground">{title}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        {children}
      </SettingsGroup>
    </section>
  );
}

function ProfileField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[58px] items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5 text-[14px] font-medium text-foreground">
        <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="min-w-0 shrink-0">{children}</div>
    </div>
  );
}
