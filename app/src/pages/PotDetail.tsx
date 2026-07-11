import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { isAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { goalPotAbi } from "../abi";
import { ActivityFeed } from "../components/ActivityFeed";
import { AmountInput } from "../components/AmountInput";
import { ApproveThen } from "../components/ApproveThen";
import { Money, moneyText } from "../components/Money";
import { ShareInvite } from "../components/ShareInvite";
import { Badge, Button, Card, Countdown, ProgressRing, SectionTitle, Skeleton } from "../components/ui";
import { useTxFlow } from "../hooks/useTxFlow";
import { PotPhase, usePotDetail } from "../hooks/useRota";
import { bpsToPercent, formatDate, shortAddress } from "../lib/format";

export function PotDetailPage() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const address = params.address && isAddress(params.address) ? (params.address as Address) : undefined;
  const { address: user } = useAccount();
  const { data: p, isLoading } = usePotDetail(address);
  const runTx = useTxFlow();
  const [depositAmount, setDepositAmount] = useState<bigint | undefined>(undefined);
  const [confirmExit, setConfirmExit] = useState(false);

  if (isLoading || !p) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const tx = (functionName: string, args?: readonly unknown[]) =>
    runTx({ address: p.address, abi: goalPotAbi, functionName, args });

  const locked = p.phase === PotPhase.LOCKED;
  const canDeposit = locked && !p.unlockable;
  const pct = Number(p.progressBps) / 100;
  const leaderboard = [...p.members].sort((a, b) =>
    Number((p.balances[b.toLowerCase()] ?? 0n) - (p.balances[a.toLowerCase()] ?? 0n))
  );
  const url = `${window.location.origin}/app/pot/${p.address}`;
  const depositValid =
    depositAmount !== undefined && depositAmount > 0n && depositAmount >= p.minContribution;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-stone-900">{p.name}</h1>
              <Badge tone={locked ? "blue" : "brand"}>{t(locked ? "status.locked" : "status.unlocked")}</Badge>
              {p.targetReached && <Badge tone="brand">{t("pot.targetReached")}</Badge>}
            </div>
            <p className="mt-1 text-sm text-stone-500">
              {t("pot.target")}: <Money amount={p.targetAmount} />
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {locked ? (
                <>
                  {t("pot.unlocksWhen", { date: formatDate(p.deadline, i18n.language) })} ·{" "}
                  <Countdown target={p.deadline} />
                </>
              ) : (
                t("pot.unlocked")
              )}
            </p>
            {p.givingBps > 0n && (
              <p className="mt-1 text-xs text-brand-700">
                🤲 {t("pot.givingNote", { percent: bpsToPercent(p.givingBps), recipient: shortAddress(p.givingRecipient) })}
              </p>
            )}
          </div>
          <div className="flex flex-col items-center">
            <ProgressRing percent={pct} label={`${pct.toFixed(0)}%`} sub={t("pot.progress")} />
            <Money amount={p.totalDeposited} />
          </div>
        </div>
      </Card>

      {/* deposit */}
      {canDeposit && (
        <Card>
          <SectionTitle>{t("pot.deposit")}</SectionTitle>
          {p.minContribution > 0n && (
            <p className="mb-2 text-xs text-stone-500">
              {t("pot.minDeposit", { amount: moneyText(p.minContribution, i18n.language) })}
            </p>
          )}
          <AmountInput value={depositAmount} onChange={setDepositAmount} />
          <div className="mt-3">
            {depositValid ? (
              <ApproveThen spender={p.address} amount={depositAmount}>
                <Button
                  onClick={async () => {
                    await tx("deposit", [depositAmount]);
                    setDepositAmount(undefined);
                  }}
                >
                  {t("pot.depositCta", { amount: moneyText(depositAmount, i18n.language) })}
                </Button>
              </ApproveThen>
            ) : (
              <Button disabled>{t("pot.deposit")}</Button>
            )}
          </div>
        </Card>
      )}

      {/* unlock / withdraw */}
      {locked && p.unlockable && (
        <Card>
          <Button onClick={() => void tx("unlock")}>{t("pot.unlock")}</Button>
        </Card>
      )}
      {p.deposited > 0n && (p.unlockable || !locked) && (
        <Card>
          <p className="mb-1 text-sm font-medium text-stone-800">
            {t("pot.withdrawAmount", { amount: moneyText(p.deposited, i18n.language) })}
          </p>
          {p.totalHaircut > 0n && <p className="mb-2 text-xs text-stone-500">{t("pot.bonusNote")}</p>}
          <Button onClick={() => void tx("withdraw")}>{t("pot.withdraw")}</Button>
        </Card>
      )}

      {/* emergency exit */}
      {locked && !p.unlockable && p.deposited > 0n && (
        <Card className="border-amber-200">
          {confirmExit ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-800">
                ⚠️ {t("pot.emergencyWarning", { percent: bpsToPercent(p.earlyExitHaircutBps) })}
              </p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={() => void tx("emergencyWithdraw")}>
                  {t("pot.emergencyWithdraw")}
                </Button>
                <Button variant="secondary" onClick={() => setConfirmExit(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <button className="text-sm font-medium text-amber-700 hover:underline" onClick={() => setConfirmExit(true)}>
              {t("pot.emergencyWithdraw")} →
            </button>
          )}
        </Card>
      )}

      {/* leaderboard */}
      <Card>
        <SectionTitle>{t("pot.leaderboard")}</SectionTitle>
        {leaderboard.length === 0 ? (
          <p className="py-3 text-center text-sm text-stone-500">{t("dashboard.empty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {leaderboard.map((m, i) => (
              <li key={m} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-stone-50">
                <span className="w-6 text-xs text-stone-400">{i + 1}.</span>
                <span className="font-mono">{shortAddress(m)}</span>
                {m === p.organizer && <Badge tone="stone">{t("common.organizer")}</Badge>}
                {user && m.toLowerCase() === user.toLowerCase() && <Badge tone="blue">{t("common.you")}</Badge>}
                <span className="ml-auto">
                  <Money amount={p.balances[m.toLowerCase()] ?? 0n} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {locked && (
        <Card>
          <SectionTitle>{t("create.invite")}</SectionTitle>
          <ShareInvite name={p.name} url={url} />
        </Card>
      )}

      <Card>
        <SectionTitle>{t("circle.activity")}</SectionTitle>
        <ActivityFeed items={p.activity} />
      </Card>
      <p className="text-center font-mono text-xs text-stone-400">{p.address}</p>
    </div>
  );
}
