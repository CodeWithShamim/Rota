/**
 * Client-side FX rates (USD → display currency). Indicative only — never used
 * for on-chain math. Cached in localStorage per RATE_PROVIDER.ttlMs.
 */
import { RATE_PROVIDER } from "../config/currencies";

const CACHE_KEY = "rota.fxRates.v1";

interface CachedRates {
  fetchedAt: number;
  rates: Record<string, number>;
}

function readCache(): CachedRates | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedRates;
    if (Date.now() - parsed.fetchedAt > RATE_PROVIDER.ttlMs) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function fetchRates(): Promise<Record<string, number>> {
  const cached = readCache();
  if (cached) return cached.rates;
  const res = await fetch(RATE_PROVIDER.url);
  if (!res.ok) throw new Error(`FX provider error: ${res.status}`);
  const rates = RATE_PROVIDER.parse(await res.json());
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), rates }));
  } catch {
    // storage full/blocked: rates simply won't be cached
  }
  return rates;
}
