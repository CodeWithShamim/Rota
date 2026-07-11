/**
 * Display-currency registry. On-chain money is ALWAYS USDC (6 decimals); these
 * currencies are for DISPLAY and form entry only — never for on-chain math.
 *
 * Adding a market = adding one entry here + a locale JSON (see README,
 * "Adding a locale/currency"). Rates come from a free client-side FX API
 * (indicative only; swap `RATE_PROVIDER` to change source).
 */
export interface DisplayCurrency {
  /** ISO 4217 code, also the key in the FX API response. */
  code: string;
  /** Symbol shown in compact contexts. */
  symbol: string;
  /** Intl locale used to format amounts in this currency. */
  intlLocale: string;
  /** i18n key for the currency's display name. */
  nameKey: string;
}

export const CURRENCIES: Record<string, DisplayCurrency> = {
  USD: { code: "USD", symbol: "$", intlLocale: "en-US", nameKey: "currencies.USD" },
  BDT: { code: "BDT", symbol: "৳", intlLocale: "bn-BD", nameKey: "currencies.BDT" },
  INR: { code: "INR", symbol: "₹", intlLocale: "en-IN", nameKey: "currencies.INR" },
  PKR: { code: "PKR", symbol: "₨", intlLocale: "ur-PK", nameKey: "currencies.PKR" },
  NGN: { code: "NGN", symbol: "₦", intlLocale: "en-NG", nameKey: "currencies.NGN" },
  PHP: { code: "PHP", symbol: "₱", intlLocale: "fil-PH", nameKey: "currencies.PHP" },
  MXN: { code: "MXN", symbol: "MX$", intlLocale: "es-MX", nameKey: "currencies.MXN" },
};

/** Default display currency per UI locale (user can change it in the header). */
export const LOCALE_DEFAULT_CURRENCY: Record<string, string> = {
  en: "USD",
  bn: "BDT",
  es: "MXN",
  hi: "INR",
  ur: "PKR",
  tl: "PHP",
};

/**
 * FX rate provider — client-side, free, no API key. Swappable: any endpoint that
 * can be mapped to a { [code]: unitsPerUSD } record works.
 */
export const RATE_PROVIDER = {
  url: "https://open.er-api.com/v6/latest/USD",
  /** Extract { BDT: 117.3, ... } from the provider's response body. */
  parse(body: unknown): Record<string, number> {
    const rates = (body as { rates?: Record<string, number> })?.rates;
    if (!rates) throw new Error("unexpected FX response");
    return rates;
  },
  /** Cache TTL for rates (ms). */
  ttlMs: 12 * 60 * 60 * 1000,
};
