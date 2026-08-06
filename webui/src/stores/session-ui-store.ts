import { create } from "zustand";

const SESSION_UPDATES_STORAGE_KEY = "minibot-webui.sidebar.session-updates.v1";

function readSessionUpdateChatIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SESSION_UPDATES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function writeSessionUpdateChatIds(chatIds: Set<string>): void {
  try {
    window.localStorage.setItem(
      SESSION_UPDATES_STORAGE_KEY,
      JSON.stringify(Array.from(chatIds)),
    );
  } catch {
    // ignore storage errors
  }
}

type SessionUiState = {
  runningChatIds: Set<string>;
  updatedChatIds: Set<string>;
  setRunningChatIds: (ids: Set<string>) => void;
  updateRunningChatIds: (updater: (current: Set<string>) => Set<string>) => void;
  setUpdatedChatIds: (ids: Set<string>) => void;
  updateUpdatedChatIds: (updater: (current: Set<string>) => Set<string>) => void;
  hydrateFromStorage: () => void;
  reset: () => void;
};

export const useSessionUiStore = create<SessionUiState>((set, get) => ({
  runningChatIds: new Set(),
  updatedChatIds: readSessionUpdateChatIds(),
  setRunningChatIds: (ids) => set({ runningChatIds: ids }),
  updateRunningChatIds: (updater) => {
    const next = updater(get().runningChatIds);
    if (next === get().runningChatIds) return;
    set({ runningChatIds: next });
  },
  setUpdatedChatIds: (ids) => {
    writeSessionUpdateChatIds(ids);
    set({ updatedChatIds: ids });
  },
  updateUpdatedChatIds: (updater) => {
    const current = get().updatedChatIds;
    const next = updater(current);
    if (next === current) return;
    writeSessionUpdateChatIds(next);
    set({ updatedChatIds: next });
  },
  hydrateFromStorage: () => {
    set({ updatedChatIds: readSessionUpdateChatIds() });
  },
  reset: () =>
    set({
      runningChatIds: new Set(),
      updatedChatIds: readSessionUpdateChatIds(),
    }),
}));
