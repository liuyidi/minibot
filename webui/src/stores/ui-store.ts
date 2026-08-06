import { create } from "zustand";

import type { SessionAutomationJob } from "@/lib/types";

const SIDEBAR_STORAGE_KEY = "minibot-webui.sidebar";

export type PendingDelete = {
  key: string;
  label: string;
  automations?: SessionAutomationJob[];
};

export type PendingRename = {
  key: string;
  label: string;
};

function readSidebarOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function writeSidebarOpen(open: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? "1" : "0");
  } catch {
    // ignore storage errors
  }
}

type UiState = {
  hostSidebarOpen: boolean;
  hostSidebarPreviewOpen: boolean;
  mobileSidebarOpen: boolean;
  sessionSearchOpen: boolean;
  pendingDelete: PendingDelete | null;
  pendingRename: PendingRename | null;
  pendingProjectRename: PendingRename | null;
  restartToast: string | null;
  isRestarting: boolean;
  setHostSidebarOpen: (open: boolean) => void;
  toggleHostSidebarOpen: () => void;
  setHostSidebarPreviewOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebarOpen: () => void;
  setSessionSearchOpen: (open: boolean) => void;
  setPendingDelete: (value: PendingDelete | null) => void;
  setPendingRename: (value: PendingRename | null) => void;
  setPendingProjectRename: (value: PendingRename | null) => void;
  setRestartToast: (value: string | null) => void;
  setIsRestarting: (value: boolean) => void;
  reset: () => void;
};

const initialUiState = () => ({
  hostSidebarOpen: readSidebarOpen(),
  hostSidebarPreviewOpen: false,
  mobileSidebarOpen: false,
  sessionSearchOpen: false,
  pendingDelete: null as PendingDelete | null,
  pendingRename: null as PendingRename | null,
  pendingProjectRename: null as PendingRename | null,
  restartToast: null as string | null,
  isRestarting: false,
});

export const useUiStore = create<UiState>((set) => ({
  ...initialUiState(),
  setHostSidebarOpen: (open) => {
    writeSidebarOpen(open);
    set({ hostSidebarOpen: open });
  },
  toggleHostSidebarOpen: () =>
    set((state) => {
      const open = !state.hostSidebarOpen;
      writeSidebarOpen(open);
      return { hostSidebarOpen: open };
    }),
  setHostSidebarPreviewOpen: (open) => set({ hostSidebarPreviewOpen: open }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  toggleMobileSidebarOpen: () =>
    set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
  setSessionSearchOpen: (open) => set({ sessionSearchOpen: open }),
  setPendingDelete: (value) => set({ pendingDelete: value }),
  setPendingRename: (value) => set({ pendingRename: value }),
  setPendingProjectRename: (value) => set({ pendingProjectRename: value }),
  setRestartToast: (value) => set({ restartToast: value }),
  setIsRestarting: (value) => set({ isRestarting: value }),
  reset: () => set(initialUiState()),
}));
