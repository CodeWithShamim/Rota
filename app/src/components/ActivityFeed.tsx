/** Localized, human-readable event history for circles and pots. */
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { ActivityItem } from "../hooks/useRota";
import { bpsToPercent, formatUsdc, shortAddress } from "../lib/format";

function describe(item: ActivityItem, t: TFunction, locale: string): string | null {
  const a = item.args;
  const who = (k: string) => shortAddress(String(a[k] ?? ""));
  const usdc = (k: string) => `${formatUsdc(BigInt(String(a[k] ?? 0)), locale)} USDC`;
  switch (item.eventName) {
    case "MemberJoined":
      return t("circle.eventJoined", { who: who("member") });
    case "Contributed":
      return t("circle.eventContributed", { who: who("member"), amount: usdc("amount") });
    case "AutoPaid":
      return t("circle.eventAutoPaid", { who: who("member"), amount: usdc("amount") });
    case "BidPlaced":
      return t("circle.eventBid", { who: who("bidder"), percent: bpsToPercent(BigInt(String(a.discountBps ?? 0))) });
    case "RoundSettled":
      return t("circle.eventSettled", {
        round: Number(a.round ?? 0) + 1,
        who: who("recipient"),
        amount: usdc("payout"),
      });
    case "GivingPaid":
      return t("circle.eventGiving", { amount: usdc("amount") });
    case "Defaulted":
      return t("circle.eventDefaulted", { who: who("member") });
    case "DefaultCured":
      return t("circle.eventCured", { who: who("member") });
    case "DividendWithdrawn":
      return t("circle.eventDividend", { who: who("member"), amount: usdc("amount") });
    case "CollateralWithdrawn":
      return t("circle.eventCollateral", { who: who("member") });
    case "CircleActivated":
      return t("circle.eventActivated");
    case "CircleCompleted":
      return t("circle.eventCompleted");
    case "CircleCancelled":
      return t("circle.eventCancelled");
    case "Deposited":
      return t("circle.eventContributed", { who: who("member"), amount: usdc("amount") });
    case "Withdrawn":
      return t("circle.eventCollateral", { who: who("member") });
    case "EarlyExit":
      return t("circle.eventDefaulted", { who: who("member") });
    case "Unlocked":
      return t("pot.unlocked");
    default:
      return null;
  }
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const { t, i18n } = useTranslation();
  const rows = [...items]
    .reverse()
    .map((item) => ({ item, text: describe(item, t, i18n.language) }))
    .filter((r) => r.text !== null);
  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-stone-500">{t("common.loading")}</p>;
  }
  return (
    <ul className="space-y-1">
      {rows.map(({ item, text }) => (
        <li
          key={`${item.txHash}-${item.logIndex}`}
          className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-700 odd:bg-stone-50"
        >
          <span className="shrink-0 text-xs text-stone-400">#{item.blockNumber.toString()}</span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
