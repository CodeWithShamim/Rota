import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { Money } from "../components/Money";
import { Badge, Card, Countdown, EmptyState, ProgressBar, SectionTitle, Skeleton } from "../components/ui";
import {
  Mode,
  Phase,
  PotPhase,
  nowSeconds,
  useCirclesOverview,
  usePotsOverview,
  type CircleSummary,
  type PotSummary,
} from "../hooks/useRota";

function circleBadges(c: CircleSummary, t: (k: string) => string) {
  const now = nowSeconds();
  const badges: { tone: "brand" | "amber" | "red" | "blue"; label: string }[] = [];
  if (c.phase === Phase.OPEN && c.memberCount === c.memberCap) {
    badges.push({ tone: "brand", label: t("badges.full") });
  }
  if (c.phase === Phase.ACTIVE && c.isMember) {
    if (!c.hasContributedNow && now < c.deadline)
      badges.push({ tone: "amber", label: t("badges.contributeDue") });
    if (c.mode === Mode.BID && now >= c.roundStart && now < c.bidWindowEnd && !c.hasWon && !c.inDefault)
      badges.push({ tone: "blue", label: t("badges.bidOpen") });
    const allIn = c.roundContributionCount === c.memberCap;
    if (now >= c.deadline || (allIn && (c.mode !== Mode.BID || now >= c.bidWindowEnd)))
      badges.push({ tone: "brand", label: t("badges.settleReady") });
    if (c.inDefault) badges.push({ tone: "red", label: t("badges.inDefault") });
  }
  if (
    (c.phase === Phase.COMPLETED || c.phase === Phase.CANCELLED) &&
    (c.collateralBalance > 0n || c.dividendBalance > 0n)
  ) {
    badges.push({ tone: "brand", label: t("badges.withdrawReady") });
  }
  return badges;
}

const phaseLabels = ["status.open", "status.active", "status.completed", "status.cancelled"];
const modeLabels = ["mode.fixed", "mode.random", "mode.bid"];

function CircleCard({ c }: { c: CircleSummary }) {
  const { t } = useTranslation();
  return (
    <Link to={`/app/circle/${c.address}`}>
      <Card className="transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-stone-900 dark:text-stone-100">{c.name}</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {t(modeLabels[c.mode])} · {t(phaseLabels[c.phase])}
            </p>
          </div>
          <Money amount={c.contributionAmount} />
        </div>
        <div className="mt-3">
          {c.phase === Phase.OPEN ? (
            <>
              <ProgressBar value={Number(c.memberCount)} max={Number(c.memberCap)} />
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                {c.memberCount.toString()}/{c.memberCap.toString()} {t("common.members")}
              </p>
            </>
          ) : (
            <>
              <ProgressBar
                value={Math.min(Number(c.currentRound), Number(c.memberCap))}
                max={Number(c.memberCap)}
              />
              <p className="mt-1 flex justify-between text-xs text-stone-500 dark:text-stone-400">
                <span>
                  {t("dashboard.roundOf", {
                    current: Math.min(Number(c.currentRound) + 1, Number(c.memberCap)),
                    total: c.memberCap.toString(),
                  })}
                </span>
                {c.phase === Phase.ACTIVE && (
                  <span>
                    <Countdown target={c.deadline} />
                  </span>
                )}
              </p>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {circleBadges(c, t).map((b) => (
            <Badge key={b.label} tone={b.tone}>
              {b.label}
            </Badge>
          ))}
        </div>
      </Card>
    </Link>
  );
}

function PotCard({ p }: { p: PotSummary }) {
  const { t } = useTranslation();
  const pct = Number(p.progressBps) / 100;
  return (
    <Link to={`/app/pot/${p.address}`}>
      <Card className="transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-stone-900 dark:text-stone-100">{p.name}</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {t(p.phase === PotPhase.UNLOCKED ? "status.unlocked" : "status.locked")} ·{" "}
              {p.memberCount.toString()} {t("common.members")}
            </p>
          </div>
          <Money amount={p.targetAmount} />
        </div>
        <div className="mt-3">
          <ProgressBar value={pct} max={100} />
          <p className="mt-1 flex justify-between text-xs text-stone-500 dark:text-stone-400">
            <span>{t("dashboard.potProgress", { percent: pct.toFixed(0) })}</span>
            <span>
              <Countdown target={p.deadline} />
            </span>
          </p>
        </div>
        <div className="mt-3 flex gap-1.5">
          {p.deposited > 0n && (p.unlockable || p.phase === PotPhase.UNLOCKED) && (
            <Badge tone="brand">{t("badges.withdrawReady")}</Badge>
          )}
          {p.targetReached && <Badge tone="brand">{t("pot.targetReached")}</Badge>}
        </div>
      </Card>
    </Link>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const circles = useCirclesOverview();
  const pots = usePotsOverview();

  const loading = circles.isLoading || pots.isLoading;
  const allCircles = circles.data ?? [];
  const allPots = pots.data ?? [];
  const isEmpty = !loading && allCircles.length === 0 && allPots.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">{t("dashboard.title")}</h1>
        <Link
          to="/app/create"
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + {t("dashboard.create")}
        </Link>
      </div>

      {!isConnected && <p className="text-sm text-stone-500 dark:text-stone-400">{t("common.notConnected")}</p>}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title={t("dashboard.empty")}
          hint={t("dashboard.emptyCta")}
          action={
            <Link
              to="/app/create"
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              + {t("dashboard.create")}
            </Link>
          }
        />
      )}

      {allCircles.length > 0 && (
        <section>
          <SectionTitle>{t("dashboard.circles")}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {allCircles.map((c) => (
              <CircleCard key={c.address} c={c} />
            ))}
          </div>
        </section>
      )}

      {allPots.length > 0 && (
        <section>
          <SectionTitle>{t("dashboard.pots")}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {allPots.map((p) => (
              <PotCard key={p.address} p={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
