export const PROFILE_STORAGE_KEY = "minibot-webui.profile";
export const PROFILE_CHANGED_EVENT = "minibot-profile-changed";

export type LocalProfile = {
  displayName: string | null;
  avatarSeed: string;
  localUserId: string;
  createdAt: string;
};

function randomToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `seed-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
}

export function newAvatarSeed(): string {
  return randomToken();
}

export function defaultLocalProfile(): LocalProfile {
  return {
    displayName: null,
    avatarSeed: newAvatarSeed(),
    localUserId: `local-${randomToken()}`,
    createdAt: new Date().toISOString(),
  };
}

function normalizeProfile(raw: Partial<LocalProfile> | null | undefined): LocalProfile {
  const fallback = defaultLocalProfile();
  const displayName = typeof raw?.displayName === "string" ? raw.displayName.trim() : "";
  return {
    displayName: displayName || null,
    avatarSeed: typeof raw?.avatarSeed === "string" && raw.avatarSeed.trim()
      ? raw.avatarSeed
      : fallback.avatarSeed,
    localUserId: typeof raw?.localUserId === "string" && raw.localUserId.trim()
      ? raw.localUserId
      : fallback.localUserId,
    createdAt: typeof raw?.createdAt === "string" && raw.createdAt.trim()
      ? raw.createdAt
      : fallback.createdAt,
  };
}

export function readLocalProfile(): LocalProfile {
  if (typeof window === "undefined") return defaultLocalProfile();
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      const created = defaultLocalProfile();
      writeLocalProfile(created);
      return created;
    }
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    const normalized = normalizeProfile(parsed);
    if (
      parsed.displayName !== normalized.displayName
      || parsed.avatarSeed !== normalized.avatarSeed
      || parsed.localUserId !== normalized.localUserId
      || parsed.createdAt !== normalized.createdAt
    ) {
      writeLocalProfile(normalized);
    }
    return normalized;
  } catch {
    const created = defaultLocalProfile();
    writeLocalProfile(created);
    return created;
  }
}

export function writeLocalProfile(profile: LocalProfile): LocalProfile {
  const next = normalizeProfile(profile);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / private mode
    }
  }
  return next;
}

export function notifyProfileChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
}
