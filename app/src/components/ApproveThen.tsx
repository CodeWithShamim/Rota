/**
 * Two-step allowance flow: if the current USDC allowance for `spender` is below
 * `amount`, show an Approve button first (exact amount by default, unlimited via
 * an advanced toggle); once sufficient, render the actual action button.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Address } from "viem";
import { maxUint256 } from "viem";
import { useUsdcAllowance, useUsdcActions, useUsdcBalance } from "../hooks/useUsdc";
import { formatUsdc } from "../lib/format";
import { FAUCET_URL } from "../config/chain";
import { Button } from "./ui";

export function ApproveThen({
  spender,
  amount,
  children,
}: {
  spender: Address;
  amount: bigint;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { data: allowance, isLoading } = useUsdcAllowance(spender);
  const { data: balance } = useUsdcBalance();
  const { approve, faucet } = useUsdcActions();
  const [approveMax, setApproveMax] = useState(false);
  const [busy, setBusy] = useState(false);

  if (isLoading) return null;

  if (balance !== undefined && balance < amount) {
    return (
      <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
        {t("circle.lowBalance")}{" "}
        {faucet ? (
          <button className="font-semibold underline" onClick={() => void faucet()}>
            {t("faucet.mintLocal")}
          </button>
        ) : (
          <a className="font-semibold underline" href={FAUCET_URL} target="_blank" rel="noreferrer">
            {t("circle.getTestUsdc")}
          </a>
        )}
      </div>
    );
  }

  if ((allowance ?? 0n) < amount) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-stone-500">
          {t("circle.approveNote", { amount: formatUsdc(amount, i18n.language) })}
        </p>
        <Button
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await approve(spender, approveMax ? maxUint256 : amount);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("common.approve")} {approveMax ? "∞" : `${formatUsdc(amount, i18n.language)} USDC`}
        </Button>
        <label className="flex items-center gap-2 text-xs text-stone-500">
          <input type="checkbox" checked={approveMax} onChange={(e) => setApproveMax(e.target.checked)} />
          {t("common.approveMax")}
        </label>
      </div>
    );
  }

  return <>{children}</>;
}
