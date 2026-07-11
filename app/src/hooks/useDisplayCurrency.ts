/**
 * The user's display currency: auto-selected from locale, changeable in the
 * header, persisted. Provides the indicative USD→currency rate (1 for USD).
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { CURRENCIES, LOCALE_DEFAULT_CURRENCY } from "../config/currencies";
import { fetchRates } from "../lib/fx";

const STORAGE_KEY = "rota.displayCurrency";
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useDisplayCurrency() {
  const { i18n } = useTranslation();
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const code =
    stored && CURRENCIES[stored]
      ? stored
      : (LOCALE_DEFAULT_CURRENCY[i18n.resolvedLanguage ?? "en"] ?? "USD");

  const setCurrency = useCallback((next: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    listeners.forEach((cb) => cb());
  }, []);

  const { data: rates } = useQuery({
    queryKey: ["fxRates"],
    queryFn: fetchRates,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const rate = code === "USD" ? 1 : rates?.[code];
  return { code, currency: CURRENCIES[code], rate, setCurrency };
}
