/**
 * In-app reminders derived purely from chain state (no backend): contribution
 * due, bid window closing, round settleable, funds withdrawable. Optional
 * browser Notification mirror, opt-in, fired once per item per session.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCountdown } from "../lib/format";
import { Mode, Phase, PotPhase, nowSeconds, useCirclesOverview, usePotsOverview } from "./useRota";

export interface Reminder {
  id: string;
  route: string;
  message: string;
}

export function useNotifications() {
  const { t, i18n } = useTranslation();
  const { data: circles } = useCirclesOverview();
  const { data: pots } = usePotsOverview();

  const reminders = useMemo<Reminder[]>(() => {
    const list: Reminder[] = [];
    const now = nowSeconds();
    for (const c of circles ?? []) {
      if (!c.isMember) continue;
      const route = `/app/circle/${c.address}`;
      if (c.phase === Phase.ACTIVE) {
        if (!c.hasContributedNow && now < c.deadline) {
          list.push({
            id: `${c.address}-contribute-${c.currentRound}`,
            route,
            message: t("notifications.contributionDue", {
              name: c.name,
              when: formatCountdown(c.deadline, i18n.language),
            }),
          });
        }
        if (c.mode === Mode.BID && now >= c.roundStart && now < c.bidWindowEnd && !c.hasWon && !c.inDefault) {
          list.push({
            id: `${c.address}-bid-${c.currentRound}`,
            route,
            message: t("notifications.bidClosing", {
              name: c.name,
              when: formatCountdown(c.bidWindowEnd, i18n.language),
            }),
          });
        }
        const allIn = c.roundContributionCount === c.memberCap;
        const settleable =
          now >= c.deadline || (allIn && (c.mode !== Mode.BID || now >= c.bidWindowEnd));
        if (settleable) {
          list.push({
            id: `${c.address}-settle-${c.currentRound}`,
            route,
            message: t("notifications.settleAvailable", { name: c.name }),
          });
        }
      }
      if (
        (c.phase === Phase.COMPLETED || c.phase === Phase.CANCELLED) &&
        (c.collateralBalance > 0n || c.dividendBalance > 0n)
      ) {
        list.push({
          id: `${c.address}-withdraw`,
          route,
          message: t("notifications.withdrawReady", { name: c.name }),
        });
      }
    }
    for (const p of pots ?? []) {
      if (p.deposited > 0n && (p.unlockable || p.phase === PotPhase.UNLOCKED)) {
        list.push({
          id: `${p.address}-withdraw`,
          route: `/app/pot/${p.address}`,
          message: t("notifications.withdrawReady", { name: p.name }),
        });
      }
    }
    return list;
  }, [circles, pots, t, i18n.language]);

  // -------- optional browser notifications (opt-in, once per item/session)
  const [browserEnabled, setBrowserEnabled] = useState(
    () => typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const fired = useRef(new Set<string>());

  async function enableBrowser() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setBrowserEnabled(permission === "granted");
  }

  useEffect(() => {
    if (!browserEnabled) return;
    for (const r of reminders) {
      if (fired.current.has(r.id)) continue;
      fired.current.add(r.id);
      try {
        new Notification("Rota", { body: r.message });
      } catch {
        // notification constructor can throw on some platforms; in-app list still works
      }
    }
  }, [reminders, browserEnabled]);

  return { reminders, browserEnabled, enableBrowser };
}
