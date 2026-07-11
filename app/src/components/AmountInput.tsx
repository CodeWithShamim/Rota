/**
 * Dual-currency amount input. The user may type in USDC or their display
 * currency; either way the component emits an EXACT USDC bigint (6 decimals)
 * and shows the precise USDC amount that will be sent on-chain. Local currency
 * is never used for on-chain math.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDisplayCurrency } from "../hooks/useDisplayCurrency";
import { formatUsdc, localToUsdc, parseUsdcInput } from "../lib/format";

export function AmountInput({
  value,
  onChange,
  placeholder,
}: {
  value: bigint | undefined;
  onChange: (v: bigint | undefined) => void;
  placeholder?: string;
}) {
  const { t, i18n } = useTranslation();
  const { code, rate } = useDisplayCurrency();
  const [unit, setUnit] = useState<"USDC" | "LOCAL">("USDC");
  const [text, setText] = useState("");
  const localAvailable = code !== "USD" && !!rate;

  function handle(input: string) {
    setText(input);
    if (input.trim() === "") {
      onChange(undefined);
      return;
    }
    try {
      if (unit === "LOCAL" && localAvailable) {
        const n = Number(input.replace(/,/g, ""));
        if (!Number.isFinite(n) || n < 0) throw new Error("bad");
        onChange(localToUsdc(n, rate!));
      } else {
        onChange(parseUsdcInput(input));
      }
    } catch {
      onChange(undefined);
    }
  }

  function switchUnit(next: "USDC" | "LOCAL") {
    setUnit(next);
    setText("");
    onChange(undefined);
  }

  return (
    <div>
      <div className="flex rounded-xl border border-stone-300 bg-white focus-within:ring-2 focus-within:ring-brand-500">
        <input
          inputMode="decimal"
          className="w-full rounded-xl px-3 py-2.5 text-lg font-medium outline-none"
          value={text}
          placeholder={placeholder ?? "0.00"}
          onChange={(e) => handle(e.target.value)}
        />
        {localAvailable ? (
          <div className="flex items-center gap-1 pr-2">
            {(["USDC", "LOCAL"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => switchUnit(u)}
                className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                  unit === u ? "bg-brand-600 text-white" : "text-stone-500 hover:bg-stone-100"
                }`}
              >
                {u === "USDC" ? "USDC" : code}
              </button>
            ))}
          </div>
        ) : (
          <span className="flex items-center pr-3 text-sm font-semibold text-stone-500">USDC</span>
        )}
      </div>
      {unit === "LOCAL" && value !== undefined && (
        <p className="mt-1 text-sm font-medium text-brand-700">
          {t("fx.youWillPay", { amount: formatUsdc(value, i18n.language) })}
        </p>
      )}
      {localAvailable && (
        <p className="mt-1 text-xs text-stone-400">{t("fx.disclaimer")}</p>
      )}
    </div>
  );
}
