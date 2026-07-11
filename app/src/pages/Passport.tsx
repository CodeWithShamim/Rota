import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { isAddress, type Address } from "viem";
import { useAccount, usePublicClient, useSignMessage } from "wagmi";
import { QRCode } from "../components/ShareInvite";
import { Badge, Button, Card, EmptyState, SectionTitle, Skeleton } from "../components/ui";
import { useToast } from "../hooks/toast";
import { useReputation } from "../hooks/useRota";
import { shortAddress } from "../lib/format";

const VERIFIED_KEY = "rota.passportVerified";

function readVerified(address: string): boolean {
  try {
    const raw = localStorage.getItem(VERIFIED_KEY);
    return raw ? (JSON.parse(raw) as string[]).includes(address.toLowerCase()) : false;
  } catch {
    return false;
  }
}

function storeVerified(address: string) {
  try {
    const raw = localStorage.getItem(VERIFIED_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(address.toLowerCase())) {
      list.push(address.toLowerCase());
      localStorage.setItem(VERIFIED_KEY, JSON.stringify(list));
    }
  } catch {
    // storage unavailable: verification lasts for the session only
  }
}

const eventLabels: Record<string, { key: string; tone: "brand" | "red" | "amber" | "stone" }> = {
  ContributionRecorded: { key: "passport.contributions", tone: "brand" },
  CompletionRecorded: { key: "passport.completions", tone: "brand" },
  CureRecorded: { key: "passport.cures", tone: "amber" },
  DefaultRecorded: { key: "passport.defaults", tone: "red" },
  EarlyExitRecorded: { key: "passport.earlyExits", tone: "amber" },
};

export function PassportPage() {
  const { t } = useTranslation();
  const params = useParams();
  const { address: connected } = useAccount();
  const subject =
    params.address && isAddress(params.address) ? (params.address as Address) : connected;
  const { data, isLoading } = useReputation(subject);
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient();
  const toast = useToast();
  const [sessionVerified, setSessionVerified] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!subject) {
    return <EmptyState title={t("common.notConnected")} />;
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const isOwn = connected?.toLowerCase() === subject.toLowerCase();
  const verified =
    isOwn && !!connected && (sessionVerified === connected.toLowerCase() || readVerified(connected));
  const shareUrl = `${window.location.origin}/app/reputation/${subject}`;
  const rows = [
    { label: t("passport.completions"), count: data.completions, points: data.completions * 100n },
    { label: t("passport.contributions"), count: data.contributions, points: data.contributions * 10n },
    { label: t("passport.cures"), count: data.cures, points: data.cures * 20n },
    { label: t("passport.defaults"), count: data.defaults, points: -(data.defaults * 50n) },
    { label: t("passport.earlyExits"), count: data.earlyExits, points: -(data.earlyExits * 15n) },
  ];

  async function verify() {
    if (!connected || !publicClient) return;
    const message = `Rota Credit Passport ownership proof for ${subject} at ${new Date().toISOString()}`;
    try {
      const signature = await signMessageAsync({ message });
      // Client-side verification supports smart accounts (ERC-1271/6492), not just EOAs.
      const ok = await publicClient.verifyMessage({ address: connected, message, signature });
      if (ok) {
        storeVerified(connected);
        setSessionVerified(connected.toLowerCase());
        toast.push("success", t("passport.verified"), 5000);
      } else {
        setSessionVerified(null);
        toast.push("error", t("passport.verifyFailed"), 5000);
      }
    } catch {
      setSessionVerified(null);
      toast.push("error", t("passport.verifyFailed"), 5000);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-brand-800 to-brand-950 text-white">
        <p className="text-sm font-medium uppercase tracking-widest text-brand-300">
          {t("passport.title")}
        </p>
        <p className="mt-1 font-mono text-sm text-brand-200">{shortAddress(subject)}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <span className="text-6xl font-extrabold tracking-tight">{data.score.toString()}</span>
          <span className="pb-2 text-brand-200">{t("passport.score")}</span>
          {verified && <Badge tone="brand">✓ {t("passport.verifiedBadge")}</Badge>}
        </div>
        <p className="mt-2 max-w-md text-sm text-brand-200">{t("passport.subtitle")}</p>
      </Card>

      <Card>
        <SectionTitle>{t("passport.breakdown")}</SectionTitle>
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between py-2 text-sm">
              <span className="text-stone-600 dark:text-stone-400">{r.label}</span>
              <span className="flex items-center gap-3">
                <span className="font-semibold text-stone-900 dark:text-stone-100">{r.count.toString()}</span>
                <span
                  className={`w-20 text-right font-mono text-xs ${r.points < 0n ? "text-red-600 dark:text-red-400" : "text-brand-700 dark:text-brand-400"}`}
                >
                  {r.points >= 0n ? "+" : ""}
                  {t("passport.points", { count: Number(r.points) })}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg bg-stone-50 p-2 font-mono text-xs text-stone-500 dark:bg-stone-800/50 dark:text-stone-400">{t("passport.formula")}</p>
      </Card>

      <Card>
        <SectionTitle>{t("passport.shareTitle")}</SectionTitle>
        <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">{t("passport.shareHint")}</p>
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <QRCode value={shareUrl} size={120} />
          <div className="w-full min-w-0 flex-1 space-y-2">
            <code className="block truncate rounded-lg bg-stone-100 px-3 py-2 text-xs dark:bg-stone-800">{shareUrl}</code>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    // clipboard unavailable
                  }
                }}
              >
                {t(copied ? "common.copied" : "common.copy")}
              </Button>
              {isOwn && !verified && (
                <Button onClick={() => void verify()} title={t("passport.verifyExplain")}>
                  {t("passport.verifyOwnership")}
                </Button>
              )}
            </div>
            {isOwn && <p className="text-xs text-stone-400 dark:text-stone-500">{t("passport.verifyExplain")}</p>}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>{t("passport.history")}</SectionTitle>
        {data.history.length === 0 ? (
          <p className="py-3 text-center text-sm text-stone-500 dark:text-stone-400">{t("passport.noHistory")}</p>
        ) : (
          <ul className="space-y-1">
            {data.history.map((h) => {
              const meta = eventLabels[h.eventName];
              return (
                <li
                  key={`${h.txHash}-${h.logIndex}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-stone-50 dark:odd:bg-stone-800/50"
                >
                  <Badge tone={meta?.tone ?? "stone"}>{meta ? t(meta.key) : h.eventName}</Badge>
                  <span className="ml-auto font-mono text-xs text-stone-400 dark:text-stone-500">
                    {shortAddress(String(h.args.reporter ?? ""))} · #{h.blockNumber.toString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
