import { useCallback, useEffect, useState } from "react";

import {
  PROFILE_CHANGED_EVENT,
  newAvatarSeed,
  notifyProfileChanged,
  readLocalProfile,
  writeLocalProfile,
  type LocalProfile,
} from "@/lib/profile";

export function useLocalProfile(): {
  profile: LocalProfile;
  setDisplayName: (name: string | null) => void;
  randomizeAvatar: () => void;
} {
  const [profile, setProfile] = useState<LocalProfile>(() => readLocalProfile());

  useEffect(() => {
    const sync = () => setProfile(readLocalProfile());
    window.addEventListener("storage", sync);
    window.addEventListener(PROFILE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(PROFILE_CHANGED_EVENT, sync);
    };
  }, []);

  const commit = useCallback((next: LocalProfile) => {
    const stored = writeLocalProfile(next);
    setProfile(stored);
    notifyProfileChanged();
  }, []);

  const setDisplayName = useCallback(
    (name: string | null) => {
      const trimmed = name?.trim() || null;
      commit({ ...readLocalProfile(), displayName: trimmed });
    },
    [commit],
  );

  const randomizeAvatar = useCallback(() => {
    commit({ ...readLocalProfile(), avatarSeed: newAvatarSeed() });
  }, [commit]);

  return { profile, setDisplayName, randomizeAvatar };
}
