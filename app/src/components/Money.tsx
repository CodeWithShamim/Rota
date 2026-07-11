/** A USDC amount with a secondary localized display-currency equivalent. */
import { useTranslation } from "react-i18next";
import { useDisplayCurrency } from "../hooks/useDisplayCurrency";
import { formatLocal, formatUsdc, usdcToLocal } from "../lib/format";

export function Money({
  amount,
  big = false,
  showLocal = true,
}: {
  amount: bigint;
  big?: boolean;
  showLocal?: boolean;
}) {
  const { i18n } = useTranslation();
  const { code, rate } = useDisplayCurrency();
  const usdc = `${formatUsdc(amount, i18n.language)} USDC`;
  const local =
    showLocal && rate && code !== "USD" ? formatLocal(usdcToLocal(amount, rate), code) : undefined;

  if (big) {
    return (
      <div>
        <div className="text-3xl font-bold tracking-tight text-stone-900">{usdc}</div>
        {local && <div className="text-sm text-stone-500">≈ {local}</div>}
      </div>
    );
  }
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold text-stone-900">{usdc}</span>
      {local && <span className="ml-1 text-xs text-stone-500">≈ {local}</span>}
    </span>
  );
}

/** Compact text-only variant for use inside sentences/buttons. */
export function moneyText(amount: bigint, locale: string): string {
  return `${formatUsdc(amount, locale)} USDC`;
}
