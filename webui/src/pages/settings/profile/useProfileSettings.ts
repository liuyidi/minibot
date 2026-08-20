import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchAuthConfig } from "@/lib/apis/bootstrap";
import {
  formatProfileDate,
  resolveProfileAccount,
  type ProfileAccount,
} from "@/lib/profile";
import type { AuthConfigResponse } from "@/lib/types";
import { useLocalProfile } from "@/hooks/settings";

export function useProfileSettings() {
  const { t } = useTranslation();
  const { profile, setDisplayName, randomizeAvatar } = useLocalProfile();
  const [account, setAccount] = useState<AuthConfigResponse["account"]>(null);
  const [accountReady, setAccountReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthConfig("")
      .then((config) => {
        if (cancelled) return;
        setAccount(config.account ?? null);
        setAccountReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setAccount(null);
        setAccountReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackName = t("sidebar.accountDisplayName", { defaultValue: "minibot" });
  const resolved: ProfileAccount = useMemo(
    () =>
      resolveProfileAccount(profile, account, {
        fallbackName,
        // Avoid flashing the product fallback before /auth/config settles.
        allowFallback: accountReady || Boolean(profile.displayName?.trim()),
      }),
    [account, accountReady, fallbackName, profile],
  );

  const saveDisplayName = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === resolved.displayName) return;
      setDisplayName(trimmed);
    },
    [resolved.displayName, setDisplayName],
  );

  return {
    avatarSeed: profile.avatarSeed,
    displayName: resolved.displayName,
    userId: resolved.userId,
    createdAtLabel: formatProfileDate(resolved.createdAt),
    githubBound: resolved.githubBound,
    githubDisplayName: resolved.githubDisplayName,
    googleBound: resolved.googleBound,
    googleDisplayName: resolved.googleDisplayName,
    accountReady,
    saveDisplayName,
    randomizeAvatar,
  };
}
