import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { isAddress, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { rotaFactoryAbi } from "../abi";
import { AmountInput } from "../components/AmountInput";
import { ApproveThen } from "../components/ApproveThen";
import { Money } from "../components/Money";
import { ShareInvite } from "../components/ShareInvite";
import { HandHeartIcon, SparklesIcon, TagIcon, TargetIcon, UsersIcon } from "../components/icons";
import { Button, Card } from "../components/ui";
import { deployments } from "../config/chain";
import { useTxFlow } from "../hooks/useTxFlow";
import { bpsToPercent } from "../lib/format";

type Product = "circle" | "bid" | "pot";
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const DAY = 86_400n;

interface CircleForm {
  name: string;
  contribution?: bigint;
  members: number;
  roundDays: number;
  randomOrder: boolean;
  collateralPct: number;
  bidWindowPct: number;
  maxDiscountPct: number;
  openDeadlineDays: number;
  inviteOnly: boolean;
  giving: boolean;
  givingRecipient: string;
  givingPct: number;
}

interface PotForm {
  name: string;
  target?: bigint;
  deadlineDays: number;
  minContribution?: bigint;
  memberCap: number;
  haircutPct: number;
  inviteOnly: boolean;
  giving: boolean;
  givingRecipient: string;
  givingPct: number;
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">{help}</span>}
    </label>
  );
}

function RoundPresets({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  const { t } = useTranslation();
  const presets = [
    { days: 7, label: t("create.weekly") },
    { days: 14, label: t("create.biweekly") },
    { days: 30, label: t("create.monthly") },
  ];
  const isCustom = !presets.some((p) => p.days === value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.days}
          type="button"
          onClick={() => onChange(p.days)}
          className={`rounded-xl border px-3 py-2 text-sm font-medium ${
            value === p.days ? "border-brand-600 bg-brand-50 dark:bg-brand-900/30 text-brand-800 dark:text-brand-200" : "border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400"
          }`}
        >
          {p.label}
        </button>
      ))}
      <div className={`flex items-center gap-1 rounded-xl border px-2 py-1 ${isCustom ? "border-brand-600 bg-brand-50 dark:bg-brand-900/30" : "border-stone-300 dark:border-stone-700"}`}>
        <input
          type="number"
          min={1}
          max={365}
          className="w-14 bg-transparent px-1 py-1 text-sm outline-none"
          value={value}
          onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        />
        <span className="text-xs text-stone-500 dark:text-stone-400">{t("create.days")}</span>
      </div>
    </div>
  );
}

function GivingSection({
  enabled,
  recipient,
  pct,
  onChange,
}: {
  enabled: boolean;
  recipient: string;
  pct: number;
  onChange: (v: { giving: boolean; givingRecipient: string; givingPct: number }) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800/50">
      <label className="flex items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-200">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange({ giving: e.target.checked, givingRecipient: recipient, givingPct: pct })}
        />
        <HandHeartIcon className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
        {t("create.givingLabel")} — {t("create.givingToggle")}
      </label>
      {enabled && (
        <div className="mt-3 space-y-3">
          <Field label={t("create.givingRecipientLabel")}>
            <input
              className="w-full rounded-xl border border-stone-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-stone-700"
              placeholder="0x…"
              value={recipient}
              onChange={(e) => onChange({ giving: true, givingRecipient: e.target.value, givingPct: pct })}
            />
          </Field>
          <Field label={`${t("create.givingPercentLabel")}: ${pct}%`}>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              className="w-full accent-brand-600"
              value={pct}
              onChange={(e) =>
                onChange({ giving: true, givingRecipient: recipient, givingPct: Number(e.target.value) })
              }
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function StepHeader({ step }: { step: number }) {
  const { t } = useTranslation();
  const labels = [t("create.stepBasics"), t("create.stepRules"), t("create.stepReview")];
  return (
    <ol className="mb-6 flex flex-wrap gap-2">
      {labels.map((label, i) => (
        <li
          key={label}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            i === step ? "bg-brand-600 text-white" : i < step ? "bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-200" : "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
          }`}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

export function CreatePage() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const pc = usePublicClient();
  const runTx = useTxFlow();

  const [product, setProduct] = useState<Product | null>(null);
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [deployed, setDeployed] = useState<{ kind: "circle" | "pot"; address: Address; name: string } | null>(null);

  const [circle, setCircle] = useState<CircleForm>({
    name: "",
    members: 5,
    roundDays: 7,
    randomOrder: false,
    collateralPct: 100,
    bidWindowPct: 30,
    maxDiscountPct: 30,
    openDeadlineDays: 14,
    inviteOnly: false,
    giving: false,
    givingRecipient: "",
    givingPct: 2.5,
  });
  const [pot, setPot] = useState<PotForm>({
    name: "",
    deadlineDays: 60,
    memberCap: 0,
    haircutPct: 2,
    inviteOnly: false,
    giving: false,
    givingRecipient: "",
    givingPct: 1,
  });

  const isBid = product === "bid";

  // ------------------------------------------------------------- validation
  const circleBasicsOk = circle.name.trim() !== "" && circle.contribution !== undefined && circle.contribution > 0n;
  const circleRulesOk = !circle.giving || isAddress(circle.givingRecipient);
  const potBasicsOk = pot.name.trim() !== "" && pot.target !== undefined && pot.target > 0n;
  const potRulesOk = !pot.giving || isAddress(pot.givingRecipient);

  const collateralAmount =
    circle.contribution !== undefined ? (circle.contribution * BigInt(circle.collateralPct * 100)) / 10_000n : 0n;

  // --------------------------------------------------------------- creation
  async function createCircle() {
    if (!pc || circle.contribution === undefined) return;
    setCreating(true);
    try {
      const params = {
        token: deployments.usdc,
        contributionAmount: circle.contribution,
        memberCap: BigInt(circle.members),
        roundDuration: BigInt(circle.roundDays) * DAY,
        mode: isBid ? 2 : circle.randomOrder ? 1 : 0,
        collateralBps: BigInt(circle.collateralPct * 100),
        givingBps: circle.giving ? BigInt(Math.round(circle.givingPct * 100)) : 0n,
        givingRecipient: circle.giving ? (circle.givingRecipient as Address) : ZERO,
        bidWindowBps: isBid ? BigInt(circle.bidWindowPct * 100) : 0n,
        maxDiscountBps: isBid ? BigInt(circle.maxDiscountPct * 100) : 0n,
        openDeadline: BigInt(Math.floor(Date.now() / 1000)) + BigInt(circle.openDeadlineDays) * DAY,
        inviteOnly: circle.inviteOnly,
        name: circle.name.trim(),
      };
      const hash = await runTx({
        address: deployments.factory,
        abi: rotaFactoryAbi,
        functionName: "createCircle",
        args: [params],
      });
      if (!hash) return;
      const circles = (await pc.readContract({
        address: deployments.factory,
        abi: rotaFactoryAbi,
        functionName: "getCircles",
      })) as readonly Address[];
      setDeployed({ kind: "circle", address: circles[circles.length - 1], name: params.name });
    } finally {
      setCreating(false);
    }
  }

  async function createPot() {
    if (!pc || pot.target === undefined) return;
    setCreating(true);
    try {
      const params = {
        token: deployments.usdc,
        targetAmount: pot.target,
        deadline: BigInt(Math.floor(Date.now() / 1000)) + BigInt(pot.deadlineDays) * DAY,
        memberCap: BigInt(pot.memberCap),
        minContribution: pot.minContribution ?? 0n,
        earlyExitHaircutBps: BigInt(pot.haircutPct * 100),
        givingBps: pot.giving ? BigInt(Math.round(pot.givingPct * 100)) : 0n,
        givingRecipient: pot.giving ? (pot.givingRecipient as Address) : ZERO,
        inviteOnly: pot.inviteOnly,
        name: pot.name.trim(),
      };
      const hash = await runTx({
        address: deployments.factory,
        abi: rotaFactoryAbi,
        functionName: "createGoalPot",
        args: [params],
      });
      if (!hash) return;
      const pots = (await pc.readContract({
        address: deployments.factory,
        abi: rotaFactoryAbi,
        functionName: "getGoalPots",
      })) as readonly Address[];
      setDeployed({ kind: "pot", address: pots[pots.length - 1], name: params.name });
    } finally {
      setCreating(false);
    }
  }

  // ------------------------------------------------------------------ views
  if (deployed) {
    const url = `${window.location.origin}/app/${deployed.kind === "circle" ? "circle" : "pot"}/${deployed.address}`;
    return (
      <Card className="mx-auto max-w-xl">
        <h1 className="flex items-center gap-2 text-xl font-bold text-stone-900 dark:text-stone-100">
          <SparklesIcon className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
          {t(deployed.kind === "circle" ? "create.deployedTitle" : "create.deployedPotTitle")}
        </h1>
        <p className="mb-4 mt-1 text-sm font-semibold text-brand-700 dark:text-brand-400">{t("create.invite")}</p>
        <ShareInvite name={deployed.name} url={url} />
        <div className="mt-5">
          <Link to={`/app/${deployed.kind === "circle" ? "circle" : "pot"}/${deployed.address}`}>
            <Button>{t(deployed.kind === "circle" ? "create.goToCircle" : "create.goToPot")}</Button>
          </Link>
        </div>
      </Card>
    );
  }

  if (!product) {
    const options: { key: Product; Icon: typeof UsersIcon; name: string; desc: string }[] = [
      { key: "circle", Icon: UsersIcon, name: t("landing.productCircleName"), desc: t("landing.productCircleDesc") },
      { key: "bid", Icon: TagIcon, name: t("landing.productBidName"), desc: t("landing.productBidDesc") },
      { key: "pot", Icon: TargetIcon, name: t("landing.productPotName"), desc: t("landing.productPotDesc") },
    ];
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold text-stone-900 dark:text-stone-100">{t("create.pickProduct")}</h1>
        <div className="grid gap-4 sm:grid-cols-3">
          {options.map((o) => (
            <button key={o.key} onClick={() => setProduct(o.key)} className="text-left">
              <Card className="h-full transition-shadow hover:border-brand-400 hover:shadow-md">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                  <o.Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-2 font-bold text-stone-900 dark:text-stone-100">{o.name}</h3>
                <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">{o.desc}</p>
              </Card>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isPot = product === "pot";
  const form = (
    <Card className="mx-auto max-w-xl">
      <StepHeader step={step} />

      {/* ---------------- basics ---------------- */}
      {step === 0 && !isPot && (
        <div className="space-y-4">
          <Field label={t("create.nameLabel")}>
            <input
              className="w-full rounded-xl border border-stone-300 bg-transparent px-3 py-2.5 dark:border-stone-700"
              placeholder={t("create.namePlaceholderCircle")}
              value={circle.name}
              onChange={(e) => setCircle({ ...circle, name: e.target.value })}
            />
          </Field>
          <Field label={t("create.contributionLabel")}>
            <AmountInput value={circle.contribution} onChange={(v) => setCircle({ ...circle, contribution: v })} />
          </Field>
          <Field label={`${t("create.membersLabel")}: ${circle.members}`} help={t("create.membersHelp")}>
            <input
              type="range"
              min={3}
              max={20}
              className="w-full accent-brand-600"
              value={circle.members}
              onChange={(e) => setCircle({ ...circle, members: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("create.roundLabel")}>
            <RoundPresets value={circle.roundDays} onChange={(d) => setCircle({ ...circle, roundDays: d })} />
          </Field>
        </div>
      )}
      {step === 0 && isPot && (
        <div className="space-y-4">
          <Field label={t("create.nameLabel")}>
            <input
              className="w-full rounded-xl border border-stone-300 bg-transparent px-3 py-2.5 dark:border-stone-700"
              placeholder={t("create.namePlaceholderPot")}
              value={pot.name}
              onChange={(e) => setPot({ ...pot, name: e.target.value })}
            />
          </Field>
          <Field label={t("create.targetLabel")}>
            <AmountInput value={pot.target} onChange={(v) => setPot({ ...pot, target: v })} />
          </Field>
          <Field label={`${t("create.deadlineLabel")}: ${pot.deadlineDays} ${t("create.days")}`} help={t("create.deadlineHelp")}>
            <input
              type="range"
              min={7}
              max={365}
              className="w-full accent-brand-600"
              value={pot.deadlineDays}
              onChange={(e) => setPot({ ...pot, deadlineDays: Number(e.target.value) })}
            />
          </Field>
        </div>
      )}

      {/* ---------------- rules ---------------- */}
      {step === 1 && !isPot && (
        <div className="space-y-4">
          {!isBid && (
            <Field label={t("create.modeLabel")}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCircle({ ...circle, randomOrder: false })}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm ${!circle.randomOrder ? "border-brand-600 bg-brand-50 dark:bg-brand-900/30" : "border-stone-300 dark:border-stone-700"}`}
                >
                  {t("mode.fixed")}
                  <span className="block text-xs text-stone-500 dark:text-stone-400">{t("create.modeFixedHelp")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCircle({ ...circle, randomOrder: true })}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm ${circle.randomOrder ? "border-brand-600 bg-brand-50 dark:bg-brand-900/30" : "border-stone-300 dark:border-stone-700"}`}
                >
                  {t("mode.random")}
                  <span className="block text-xs text-stone-500 dark:text-stone-400">{t("create.modeRandomHelp")}</span>
                </button>
              </div>
            </Field>
          )}
          {isBid && (
            <>
              <Field label={`${t("create.bidWindowLabel")}: ${circle.bidWindowPct}%`} help={t("create.bidWindowHelp")}>
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  className="w-full accent-brand-600"
                  value={circle.bidWindowPct}
                  onChange={(e) => setCircle({ ...circle, bidWindowPct: Number(e.target.value) })}
                />
              </Field>
              <Field label={`${t("create.maxDiscountLabel")}: ${circle.maxDiscountPct}%`} help={t("create.maxDiscountHelp")}>
                <input
                  type="range"
                  min={5}
                  max={30}
                  className="w-full accent-brand-600"
                  value={circle.maxDiscountPct}
                  onChange={(e) => setCircle({ ...circle, maxDiscountPct: Number(e.target.value) })}
                />
              </Field>
            </>
          )}
          <Field label={`${t("create.collateralLabel")}: ${circle.collateralPct}%`} help={t("create.collateralHelp")}>
            <input
              type="range"
              min={0}
              max={100}
              step={25}
              className="w-full accent-brand-600"
              value={circle.collateralPct}
              onChange={(e) => setCircle({ ...circle, collateralPct: Number(e.target.value) })}
            />
          </Field>
          <Field label={`${t("create.openDeadlineLabel")}: ${circle.openDeadlineDays} ${t("create.days")}`} help={t("create.openDeadlineHelp")}>
            <input
              type="range"
              min={1}
              max={60}
              className="w-full accent-brand-600"
              value={circle.openDeadlineDays}
              onChange={(e) => setCircle({ ...circle, openDeadlineDays: Number(e.target.value) })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-200">
            <input
              type="checkbox"
              checked={circle.inviteOnly}
              onChange={(e) => setCircle({ ...circle, inviteOnly: e.target.checked })}
            />
            {t("create.inviteOnlyLabel")}
            <span className="text-xs font-normal text-stone-500 dark:text-stone-400">{t("create.inviteOnlyHelp")}</span>
          </label>
          <GivingSection
            enabled={circle.giving}
            recipient={circle.givingRecipient}
            pct={circle.givingPct}
            onChange={(v) => setCircle({ ...circle, ...v })}
          />
        </div>
      )}
      {step === 1 && isPot && (
        <div className="space-y-4">
          <Field label={`${t("create.minContributionLabel")} (${t("common.optional")})`}>
            <AmountInput value={pot.minContribution} onChange={(v) => setPot({ ...pot, minContribution: v })} />
          </Field>
          <Field label={`${t("create.membersLabel")}: ${pot.memberCap === 0 ? "∞" : pot.memberCap}`}>
            <input
              type="range"
              min={0}
              max={50}
              className="w-full accent-brand-600"
              value={pot.memberCap}
              onChange={(e) => setPot({ ...pot, memberCap: Number(e.target.value) })}
            />
          </Field>
          <Field label={`${t("create.haircutLabel")}: ${pot.haircutPct}%`} help={t("create.haircutHelp")}>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              className="w-full accent-brand-600"
              value={pot.haircutPct}
              onChange={(e) => setPot({ ...pot, haircutPct: Number(e.target.value) })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-200">
            <input
              type="checkbox"
              checked={pot.inviteOnly}
              onChange={(e) => setPot({ ...pot, inviteOnly: e.target.checked })}
            />
            {t("create.inviteOnlyLabel")}
            <span className="text-xs font-normal text-stone-500 dark:text-stone-400">{t("create.inviteOnlyHelp")}</span>
          </label>
          <GivingSection
            enabled={pot.giving}
            recipient={pot.givingRecipient}
            pct={pot.givingPct}
            onChange={(v) => setPot({ ...pot, ...v })}
          />
        </div>
      )}

      {/* ---------------- review ---------------- */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{t("create.reviewNote")}</p>
          <dl className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
            {(!isPot
              ? [
                  [t("create.nameLabel"), circle.name],
                  [t("create.contributionLabel"), <Money key="c" amount={circle.contribution ?? 0n} />],
                  [t("create.membersLabel"), String(circle.members)],
                  [t("create.roundLabel"), `${circle.roundDays} ${t("create.days")}`],
                  [t("create.modeLabel"), t(isBid ? "mode.bid" : circle.randomOrder ? "mode.random" : "mode.fixed")],
                  [t("create.collateralLabel"), <Money key="col" amount={collateralAmount} />],
                  ...(isBid
                    ? ([
                        [t("create.bidWindowLabel"), `${circle.bidWindowPct}%`],
                        [t("create.maxDiscountLabel"), `${circle.maxDiscountPct}%`],
                      ] as [string, ReactNode][])
                    : []),
                  [t("create.inviteOnlyLabel"), t(circle.inviteOnly ? "common.yes" : "common.no")],
                  ...(circle.giving
                    ? ([[t("create.givingLabel"), `${bpsToPercent(circle.givingPct * 100)} → ${circle.givingRecipient.slice(0, 10)}…`]] as [string, ReactNode][])
                    : []),
                ]
              : [
                  [t("create.nameLabel"), pot.name],
                  [t("create.targetLabel"), <Money key="t" amount={pot.target ?? 0n} />],
                  [t("create.deadlineLabel"), `${pot.deadlineDays} ${t("create.days")}`],
                  [t("create.haircutLabel"), `${pot.haircutPct}%`],
                  [t("create.inviteOnlyLabel"), t(pot.inviteOnly ? "common.yes" : "common.no")],
                  ...(pot.giving
                    ? ([[t("create.givingLabel"), `${bpsToPercent(pot.givingPct * 100)} → ${pot.givingRecipient.slice(0, 10)}…`]] as [string, ReactNode][])
                    : []),
                ]
            ).map(([k, v], i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <dt className="text-stone-500 dark:text-stone-400">{k}</dt>
                <dd className="font-medium text-stone-900 dark:text-stone-100">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* ---------------- nav ---------------- */}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="secondary" onClick={() => (step === 0 ? setProduct(null) : setStep(step - 1))}>
          ← {t("common.back")}
        </Button>
        {step < 2 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={step === 0 ? (isPot ? !potBasicsOk : !circleBasicsOk) : isPot ? !potRulesOk : !circleRulesOk}
          >
            {t("common.next")} →
          </Button>
        ) : !isConnected ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">{t("common.notConnected")}</p>
        ) : isPot ? (
          <Button busy={creating} onClick={() => void createPot()}>
            {t(creating ? "create.creating" : "create.createPot")}
          </Button>
        ) : collateralAmount > 0n ? (
          <ApproveThen spender={deployments.factory} amount={collateralAmount}>
            <Button busy={creating} onClick={() => void createCircle()}>
              {t(creating ? "create.creating" : "create.approveAndCreate")}
            </Button>
          </ApproveThen>
        ) : (
          <Button busy={creating} onClick={() => void createCircle()}>
            {t(creating ? "create.creating" : "create.approveAndCreate")}
          </Button>
        )}
      </div>
    </Card>
  );
  return form;
}
