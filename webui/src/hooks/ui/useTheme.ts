import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** Stored user preference (may follow OS). */
export type ThemePreference = "light" | "dark" | "system";
/** Resolved appearance actually applied to the document. */
export type Theme = "light" | "dark";

const STORAGE_KEY = "minibot-webui.theme";
const ThemeContext = createContext<Theme>("light");

function readStoredPreference(): ThemePreference | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined"
    && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

export function resolveThemePreference(preference: ThemePreference): Theme {
  if (preference === "system") {
    return systemPrefersDark() ? "dark" : "light";
  }
  return preference;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function useTheme(): {
  /** Resolved light/dark currently applied. */
  theme: Theme;
  /** User preference including ``system``. */
  preference: ThemePreference;
  toggle: () => void;
  setTheme: (t: ThemePreference) => void;
} {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    return readStoredPreference() ?? "system";
  });
  const [theme, setThemeResolved] = useState<Theme>(() =>
    resolveThemePreference(readStoredPreference() ?? "system"),
  );

  useEffect(() => {
    const sync = () => {
      const next = resolveThemePreference(preference);
      setThemeResolved(next);
      applyTheme(next);
    };
    sync();
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore
    }
    if (preference !== "system" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => sync();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setTheme = useCallback((t: ThemePreference) => setPreference(t), []);
  const toggle = useCallback(() => {
    setPreference((prev) => {
      const current = resolveThemePreference(prev);
      return current === "dark" ? "light" : "dark";
    });
  }, []);

  return { theme, preference, toggle, setTheme };
}

export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  return createElement(ThemeContext.Provider, { value: theme }, children);
}

export function useThemeValue(): Theme {
  return useContext(ThemeContext);
}
