import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";
export type ThemeAccent =
  | "default"
  | "blue"
  | "emerald"
  | "violet"
  | "rose"
  | "amber";

export const ACCENTS: { value: ThemeAccent; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "blue", label: "Blue" },
  { value: "emerald", label: "Emerald" },
  { value: "violet", label: "Violet" },
  { value: "rose", label: "Rose" },
  { value: "amber", label: "Amber" },
];

const MODE_KEY = "redisui-theme";
const ACCENT_KEY = "redisui-accent";

function isMode(v: string | null): v is ThemeMode {
  return v === "light" || v === "dark";
}
function isAccent(v: string | null): v is ThemeAccent {
  return !!v && ACCENTS.some((a) => a.value === v);
}

function initialMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(MODE_KEY);
  return isMode(stored) ? stored : "dark";
}
function initialAccent(): ThemeAccent {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(ACCENT_KEY);
  return isAccent(stored) ? stored : "default";
}

/** Manages light/dark mode plus an accent theme applied via data-theme. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [accent, setAccent] = useState<ThemeAccent>(initialAccent);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.style.colorScheme = mode;
    window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    if (accent === "default") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = accent;
    }
    window.localStorage.setItem(ACCENT_KEY, accent);
  }, [accent]);

  const toggle = useCallback(() => {
    setMode((m) => (m === "dark" ? "light" : "dark"));
  }, []);

  return { mode, setMode, toggle, accent, setAccent };
}
