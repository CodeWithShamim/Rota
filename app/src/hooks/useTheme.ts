/**
 * Light/dark theme with localStorage persistence. Defaults to light; the
 * initial class is set by an inline script in index.html (before paint) from
 * the saved preference. This hook just reads and toggles it.
 */
import { useCallback, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "rota-theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
