import type { AuthConfigResponse } from "@/lib/types";

import type { LocalProfile } from "./storage";

export type ProfileAccount = {
  displayName: string;
  userId: string;
  createdAt: string;
  email: string | null;
  picture: string | null;
};

export function resolveProfileAccount(
  local: LocalProfile,
  auth: AuthConfigResponse["account"] | null | undefined,
  fallbackName: string,
): ProfileAccount {
  const authName = auth?.name?.trim() || auth?.email?.trim() || "";
  const localName = local.displayName?.trim() || "";
  return {
    displayName: localName || authName || fallbackName,
    userId: auth?.id?.trim() || local.localUserId,
    createdAt: auth?.created_at?.trim() || local.createdAt,
    email: auth?.email?.trim() || null,
    picture: auth?.picture?.trim() || null,
  };
}

export function formatProfileDate(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const isoDay = value.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return isoDay;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}
