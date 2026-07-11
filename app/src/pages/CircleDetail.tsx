import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { isAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { rotaCircleAbi } from "../abi";
import { ActivityFeed } from "../components/ActivityFeed";
import { ApproveThen } from "../components/ApproveThen";
import { Money, moneyText } from "../components/Money";
import { ShareInvite } from "../components/ShareInvite";
import { Badge, Button, Card, Countdown, ProgressBar, SectionTitle, Skeleton } from "../components/ui";
import { useTxFlow } from "../hooks/useTxFlow";
import { useUsdcAllowance } from "../hooks/useUsdc";
import { Mode, Phase, nowSeconds, useCircleDetail, type CircleDetail } from "../hooks/useRota";
import { bpsToPercent, shortAddress } from "../lib/format";

const phaseLabels = ["status.open", "status.active", "status.completed", "status.cancelled"];
const phaseTones = ["blue", "brand", "stone", "red"] as const;
const modeLabels = ["mode.fixed", "mode.random", "mode.bid"];

function useCircleTx(address: Address) {
  const runTx = useTxFlow();
  return (functionName: string, args?: readonly unknown[]) =>
    runTx({ address, abi: rotaCircleAbi, functionName, args });
}

// ------------------------------------------------------------------ panels

function OpenPhasePanel({ c }: { c: CircleDetail }) {
  const { t, i18n } = useTranslation();
  const { address: user } = useAccount();
  const tx = useCircleTx(c.address);
  const collateral = (c.contributionAmount * c.collateralBps) / 10_000n;
  const full = c.memberCount === c.memberCap;
  const now = nowSeconds();
  const canCancel = user === c.organizer || now > c.openDeadline;
  const url = `${window.location.origin}/app/circle/${c.address}`;

  return (
    <div className="space-y-4">
      {!c.isMember && !full && (
        <Card>
          {c.inviteOnly && !c.allowlisted ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">{t("circle.notInvitedNote")}</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
                {t("circle.joinCollateralNote", { amount: moneyText(collateral, i18n.language) })}
              </p>
              <ApproveThen spender={c.address} amount={collateral}>
                <Button onClick={() => void tx("join")}>{t("circle.join")}</Button>
              </ApproveThen>
            </>
          )}
        </Card>
      )}
      {full && (
        <Card>
          <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">{t("circle.activateHint")}</p>
          <Button onClick={() => void tx("activate")}>{t("circle.activate")}</Button>
        </Card>
      )}
      <Card>
        <SectionTitle>{t("create.invite")}</SectionTitle>
        <ShareInvite name={c.name} url={url} />
      </Card>
      {canCancel && !full && c.memberCount > 0n && (
        <Card>
          <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">{t("circle.cancelHint")}</p>
          <Button variant="danger" onClick={() => void tx("cancel")}>
            {t("circle.cancelCircle")}
          </Button>
        </Card>
      )}
    </div>
  );
}

function BidPanel({ c }: { c: CircleDetail }) {
  const { t } = useTranslation();
  const tx = useCircleTx(c.address);
  const [bidPct, setBidPct] = useState("");
  const now = nowSeconds();
  const windowOpen = now >= c.roundStart && now < c.bidWindowEnd;
  const eligible = c.isMember && !c.hasWon && !c.inDefault;
  const bps = Math.round(Number(bidPct || "0") * 100);
  const valid = bps > 0 && bps <= Number(c.maxDiscountBps) && (!c.bestBid.exists || bps > c.bestBid.discountBps);

  return (
    <Card>
      <SectionTitle>🏷️ {t("circle.bidPanelTitle")}</SectionTitle>
      <p className="text-sm text-stone-600 dark:text-stone-400">{t("circle.bidExplain")}</p>
      <p className="mt-3 text-sm font-medium text-stone-800 dark:text-stone-200">
        {c.bestBid.exists
          ? t("circle.bidCurrent", {
              percent: bpsToPercent(c.bestBid.discountBps),
              bidder: shortAddress(c.bestBid.bidder),
            })
          : t("circle.bidNone")}
      </p>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        {windowOpen ? (
          <>
            {t("circle.bidWindowCloses", { when: "" })} <Countdown target={c.bidWindowEnd} />
          </>
        ) : (
          t("circle.bidWindowClosed")
        )}
      </p>
      {windowOpen && eligible && (
        <div className="mt-3 flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              {t("circle.bidYours")} (≤ {bpsToPercent(c.maxDiscountBps)})
            </span>
            <input
              inputMode="decimal"
              className="w-full rounded-xl border border-stone-300 bg-transparent px-3 py-2 dark:border-stone-700"
              value={bidPct}
              placeholder="10"
              onChange={(e) => setBidPct(e.target.value)}
            />
          </label>
          <Button disabled={!valid} onClick={() => void tx("placeBid", [BigInt(bps)])}>
            {t("circle.bidPlace")}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ActivePhasePanel({ c }: { c: CircleDetail }) {
  const { t, i18n } = useTranslation();
  const tx = useCircleTx(c.address);
  const { data: allowance } = useUsdcAllowance(c.address);
  const now = nowSeconds();
  const roundOpen = now < c.deadline;
  const allIn = c.roundContributionCount === c.memberCap;
  const settleable = now >= c.deadline || (allIn && (c.mode !== Mode.BID || now >= c.bidWindowEnd));
  const remainingRounds = c.memberCap - c.currentRound;
  const autopayRoundsCovered =
    c.contributionAmount > 0n && allowance !== undefined ? allowance / c.contributionAmount : 0n;

  return (
    <div className="space-y-4">
      {c.mode === Mode.BID && <BidPanel c={c} />}

      {c.isMember && c.inDefault && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
          <p className="mb-2 text-sm text-red-800 dark:text-red-200">{t("circle.cureExplain")}</p>
          <ApproveThen spender={c.address} amount={c.cureCost}>
            <Button variant="danger" onClick={() => void tx("cureDefault")}>
              {t("circle.cureDefault", { amount: moneyText(c.cureCost, i18n.language) })}
            </Button>
          </ApproveThen>
        </Card>
      )}

      {c.isMember && !c.hasContributedNow && roundOpen && (
        <Card>
          <p className="mb-1 text-sm font-medium text-stone-800 dark:text-stone-200">
            {t("circle.deadlineIn", { when: "" })} <Countdown target={c.deadline} />
          </p>
          <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
            {t("circle.waitingContributions", {
              paid: c.roundContributionCount.toString(),
              total: c.memberCap.toString(),
            })}
          </p>
          <ApproveThen spender={c.address} amount={c.contributionAmount}>
            <Button onClick={() => void tx("contribute")}>
              {t("circle.contribute", { amount: moneyText(c.contributionAmount, i18n.language) })}
            </Button>
          </ApproveThen>
        </Card>
      )}
      {c.isMember && c.hasContributedNow && (
        <Card>
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">{t("circle.contributed")}</p>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            {t("circle.waitingContributions", {
              paid: c.roundContributionCount.toString(),
              total: c.memberCap.toString(),
            })}
          </p>
        </Card>
      )}

      {c.isMember && (
        <Card>
          <SectionTitle>⚡ {t("circle.autopayTitle")}</SectionTitle>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {t("circle.autopayExplain", { amount: moneyText(c.contributionAmount, i18n.language) })}
          </p>
          {c.autoPayOptIn ? (
            <div className="mt-3 space-y-2">
              <Badge tone="brand">{t("badges.autopayOn")}</Badge>
              {autopayRoundsCovered < remainingRounds && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t("circle.autopayAllowanceWarning", { rounds: autopayRoundsCovered.toString() })}
                </p>
              )}
              <Button variant="secondary" onClick={() => void tx("optOutAutoPay")}>
                {t("circle.autopayDisable")}
              </Button>
            </div>
          ) : (
            <div className="mt-3">
              <ApproveThen spender={c.address} amount={c.contributionAmount * remainingRounds}>
                <Button variant="secondary" onClick={() => void tx("optInAutoPay")}>
                  {t("circle.autopayEnable")}
                </Button>
              </ApproveThen>
            </div>
          )}
        </Card>
      )}

      {settleable && (
        <Card>
          <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">{t("circle.settleHint")}</p>
          <Button onClick={() => void tx("settleRound")}>{t("circle.settle")}</Button>
        </Card>
      )}

      {c.dividendBalance > 0n && (
        <Card>
          <Button variant="secondary" onClick={() => void tx("withdrawDividends")}>
            {t("circle.withdrawDividends", { amount: moneyText(c.dividendBalance, i18n.language) })}
          </Button>
        </Card>
      )}
    </div>
  );
}

function TerminalPanel({ c }: { c: CircleDetail }) {
  const { t, i18n } = useTranslation();
  const tx = useCircleTx(c.address);
  return (
    <div className="space-y-4">
      {c.collateralBalance > 0n && (
        <Card>
          <Button onClick={() => void tx("withdrawCollateral")}>
            {t("circle.withdrawCollateral", { amount: moneyText(c.collateralBalance, i18n.language) })}
          </Button>
        </Card>
      )}
      {c.dividendBalance > 0n && (
        <Card>
          <Button variant="secondary" onClick={() => void tx("withdrawDividends")}>
            {t("circle.withdrawDividends", { amount: moneyText(c.dividendBalance, i18n.language) })}
          </Button>
        </Card>
      )}
    </div>
  );
}

// --------------------------------------------------------------- sub-views

function RoundTimeline({ c }: { c: CircleDetail }) {
  const { t } = useTranslation();
  const total = Number(c.memberCap);
  const current = Number(c.currentRound);
  return (
    <Card>
      <SectionTitle>{t("circle.timeline")}</SectionTitle>
      <ol className="flex flex-wrap gap-2">
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
              i < current
                ? "bg-brand-600 text-white"
                : i === current && c.phase === Phase.ACTIVE
                  ? "border-2 border-brand-600 text-brand-700 dark:text-brand-400"
                  : "bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500"
            }`}
            title={`${t("common.round")} ${i + 1}`}
          >
            {i + 1}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function MembersList({ c }: { c: CircleDetail }) {
  const { t } = useTranslation();
  const { address: user } = useAccount();
  const round = c.currentRound.toString();
  const order = c.mode === Mode.BID ? c.members : c.payoutOrder.length > 0 ? c.payoutOrder : c.members;
  return (
    <Card>
      <SectionTitle>
        {t("common.members")} ({c.memberCount.toString()}/{c.memberCap.toString()})
      </SectionTitle>
      <ul className="space-y-1.5">
        {order.map((m, i) => {
          const contributed = c.contributionMatrix[round]?.[m.toLowerCase()] ?? false;
          return (
            <li
              key={m}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-stone-50 dark:odd:bg-stone-800/50"
            >
              <span className="w-6 text-xs text-stone-400 dark:text-stone-500">{i + 1}.</span>
              <span className="font-mono">{shortAddress(m)}</span>
              {m === c.organizer && <Badge tone="stone">{t("common.organizer")}</Badge>}
              {user && m.toLowerCase() === user.toLowerCase() && <Badge tone="blue">{t("common.you")}</Badge>}
              <span className="ml-auto flex gap-1">
                {c.phase === Phase.ACTIVE &&
                  (contributed ? <Badge tone="brand">✓</Badge> : <Badge tone="amber">…</Badge>)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// -------------------------------------------------------------------- page

export function CircleDetailPage() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const address = params.address && isAddress(params.address) ? (params.address as Address) : undefined;
  const { address: user } = useAccount();
  const { data: c, isLoading } = useCircleDetail(address);

  if (isLoading || !c) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const potSize = c.contributionAmount * c.memberCap;
  const myOrderIndex =
    user && c.payoutOrder.length > 0
      ? c.payoutOrder.findIndex((m) => m.toLowerCase() === user.toLowerCase())
      : -1;
  const isNext = user !== undefined && c.previewRecipient.toLowerCase() === user?.toLowerCase();

  return (
    <div className="space-y-4">
      {/* header */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">{c.name}</h1>
              <Badge tone={phaseTones[c.phase]}>{t(phaseLabels[c.phase])}</Badge>
              <Badge tone="stone">{t(modeLabels[c.mode])}</Badge>
            </div>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              <Money amount={c.contributionAmount} /> {t("common.perRound")} · {c.memberCap.toString()}{" "}
              {t("common.members")}
            </p>
            {c.givingBps > 0n && (
              <p className="mt-1 text-xs text-brand-700 dark:text-brand-400">
                🤲 {t("circle.givingNote", { percent: bpsToPercent(c.givingBps), recipient: shortAddress(c.givingRecipient) })}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">{t("circle.potSize")}</p>
            <Money amount={potSize} big />
          </div>
        </div>
        {c.phase === Phase.ACTIVE && c.isMember && (
          <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-800/50">
            <span className="font-medium text-stone-700 dark:text-stone-300">{t("circle.yourPosition")}: </span>
            {c.mode === Mode.BID ? (
              <span>{t("circle.positionUnknown")}</span>
            ) : myOrderIndex >= 0 ? (
              <span>{t("circle.position", { n: myOrderIndex + 1 })}</span>
            ) : null}
            {isNext && <span className="ml-2 font-semibold text-brand-700 dark:text-brand-400">🎉 {t("circle.youAreNext")}</span>}
          </div>
        )}
        {c.phase === Phase.OPEN && (
          <div className="mt-3">
            <ProgressBar value={Number(c.memberCount)} max={Number(c.memberCap)} />
          </div>
        )}
      </Card>

      {/* action area */}
      {c.phase === Phase.OPEN && <OpenPhasePanel c={c} />}
      {c.phase === Phase.ACTIVE && <ActivePhasePanel c={c} />}
      {(c.phase === Phase.COMPLETED || c.phase === Phase.CANCELLED) && <TerminalPanel c={c} />}

      {c.phase !== Phase.OPEN && <RoundTimeline c={c} />}
      <MembersList c={c} />

      <Card>
        <SectionTitle>{t("circle.activity")}</SectionTitle>
        <ActivityFeed items={c.activity} />
      </Card>
      <p className="break-all text-center text-xs text-stone-400 dark:text-stone-500">
        <span className="font-mono">{c.address}</span> · {i18n.language}
      </p>
    </div>
  );
}
