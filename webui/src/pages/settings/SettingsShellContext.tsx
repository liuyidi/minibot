import { createContext, useContext, type ReactNode } from "react";

import type { SettingsPageProps } from "@/pages/settings/shared";
import type { SettingsShellModel } from "./useSettingsShellModel";

export type SettingsShellValue = SettingsShellModel &
  Pick<
    SettingsPageProps,
    | "theme"
    | "onToggleTheme"
    | "onBackToChat"
    | "isRestarting"
    | "showSidebar"
    | "hostChromeInset"
    | "onLogout"
  >;

const SettingsShellContext = createContext<SettingsShellValue | null>(null);

export function SettingsShellProvider({
  value,
  children,
}: {
  value: SettingsShellValue;
  children: ReactNode;
}) {
  return (
    <SettingsShellContext.Provider value={value}>{children}</SettingsShellContext.Provider>
  );
}

export function useSettingsShell(): SettingsShellValue {
  const value = useContext(SettingsShellContext);
  if (!value) {
    throw new Error("useSettingsShell must be used within SettingsShellProvider");
  }
  return value;
}
