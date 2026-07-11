/**
 * Formatting helpers. USDC math is ALWAYS 6-decimal bigint; display currencies
 * are cosmetic conversions applied at the last moment.
 */
import { formatUnits, parseUnits } from "viem";
import { CURRENCIES } from "../config/currencies";

export const USDC_DECIMALS = 6;

/** 6-decimal bigint → "1,234.50" (grouping via Intl, max 2 fraction digits). */
export function formatUsdc(amount: bigint, locale = "en"): string {
  const n = Number(formatUnits(amount, USDC_DECIMALS));
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/** "125.5" (user input, display units) → 125500000n. Throws on invalid input. */
export function parseUsdcInput(input: string): bigint {
  const cleaned = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    throw new Error("invalid amount");
  }
  return parseUnits(cleaned, USDC_DECIMALS);
}

/** USDC bigint → local currency amount (display only, indicative FX rate). */
export function usdcToLocal(amount: bigint, rate: number): number {
  return Number(formatUnits(amount, USDC_DECIMALS)) * rate;
}

/** Local currency number → exact USDC bigint the user must confirm. */
export function localToUsdc(local: number, rate: number): bigint {
  if (rate <= 0) throw new Error("invalid rate");
  return parseUnits((local / rate).toFixed(USDC_DECIMALS), USDC_DECIMALS);
}

/** Format a local-currency amount with its own Intl locale ("৳১১,৭৩০"). */
export function formatLocal(amount: number, currencyCode: string): string {
  const c = CURRENCIES[currencyCode];
  if (!c) return amount.toFixed(2);
  return new Intl.NumberFormat(c.intlLocale, {
    style: "currency",
    currency: c.code,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Seconds → localized "in 3 days" / "৩ দিন পরে" (or "now" when past). */
export function formatCountdown(targetSeconds: bigint | number, locale = "en"): string {
  const target = Number(targetSeconds);
  const diff = target - Math.floor(Date.now() / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs >= 86400) return rtf.format(Math.round(diff / 86400), "day");
  if (abs >= 3600) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs >= 60) return rtf.format(Math.round(diff / 60), "minute");
  return rtf.format(diff, "second");
}

export function formatDate(seconds: bigint | number, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(Number(seconds) * 1000)
  );
}

/** Seconds duration → localized "7 days" style label. */
export function formatDuration(seconds: bigint | number, locale = "en"): string {
  const s = Number(seconds);
  const nf = new Intl.NumberFormat(locale);
  if (s % 86400 === 0) {
    const days = s / 86400;
    const unit = new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "day",
      unitDisplay: "long",
    });
    return unit.format(days);
  }
  return `${nf.format(Math.round(s / 3600))} h`;
}

export function bpsToPercent(bps: bigint | number): string {
  return `${(Number(bps) / 100).toFixed(Number(bps) % 100 === 0 ? 0 : 2)}%`;
}
