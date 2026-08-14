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

  useEffect(() => {
    let cancelled = false;
    void fetchAuthConfig("")
      .then((config) => {
        if (!cancelled) setAccount(config.account ?? null);
      })
      .catch(() => {
        if (!cancelled) setAccount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackName = t("sidebar.accountDisplayName", { defaultValue: "minibot" });
  const resolved: ProfileAccount = useMemo(
    () => resolveProfileAccount(profile, account, fallbackName),
    [account, fallbackName, profile],
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
    saveDisplayName,
    randomizeAvatar,
  };
}
