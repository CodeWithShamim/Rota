import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { isAddress, verifyMessage, type Address } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { QRCode } from "../components/ShareInvite";
import { Badge, Button, Card, EmptyState, SectionTitle, Skeleton } from "../components/ui";
import { useReputation } from "../hooks/useRota";
import { shortAddress } from "../lib/format";

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
  const [verified, setVerified] = useState(false);
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
  const shareUrl = `${window.location.origin}/app/reputation/${subject}`;
  const rows = [
    { label: t("passport.completions"), count: data.completions, points: data.completions * 100n },
    { label: t("passport.contributions"), count: data.contributions, points: data.contributions * 10n },
    { label: t("passport.cures"), count: data.cures, points: data.cures * 20n },
    { label: t("passport.defaults"), count: data.defaults, points: -(data.defaults * 50n) },
    { label: t("passport.earlyExits"), count: data.earlyExits, points: -(data.earlyExits * 15n) },
  ];

  async function verify() {
    if (!connected) return;
    const message = `Rota Credit Passport ownership proof for ${subject} at ${new Date().toISOString()}`;
    try {
      const signature = await signMessageAsync({ message });
      const ok = await verifyMessage({ address: connected, message, signature });
      setVerified(ok);
    } catch {
      setVerified(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-brand-800 to-brand-950 text-white">
        <p className="text-sm font-medium uppercase tracking-widest text-brand-300">
          {t("passport.title")}
        </p>
        <p className="mt-1 font-mono text-sm text-brand-200">{shortAddress(subject)}</p>
        <div className="mt-4 flex items-end gap-3">
          <span className="text-6xl font-extrabold tracking-tight">{data.score.toString()}</span>
          <span className="pb-2 text-brand-200">{t("passport.score")}</span>
          {verified && <Badge tone="brand">✓ {t("passport.verified")}</Badge>}
        </div>
        <p className="mt-2 max-w-md text-sm text-brand-200">{t("passport.subtitle")}</p>
      </Card>

      <Card>
        <SectionTitle>{t("passport.breakdown")}</SectionTitle>
        <ul className="divide-y divide-stone-100">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between py-2 text-sm">
              <span className="text-stone-600">{r.label}</span>
              <span className="flex items-center gap-3">
                <span className="font-semibold text-stone-900">{r.count.toString()}</span>
                <span className={`w-20 text-right font-mono text-xs ${r.points < 0n ? "text-red-600" : "text-brand-700"}`}>
                  {r.points >= 0n ? "+" : ""}
                  {t("passport.points", { count: Number(r.points) })}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg bg-stone-50 p-2 font-mono text-xs text-stone-500">{t("passport.formula")}</p>
      </Card>

      <Card>
        <SectionTitle>{t("passport.shareTitle")}</SectionTitle>
        <p className="mb-3 text-sm text-stone-600">{t("passport.shareHint")}</p>
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <QRCode value={shareUrl} size={120} />
          <div className="min-w-0 flex-1 space-y-2">
            <code className="block truncate rounded-lg bg-stone-100 px-3 py-2 text-xs">{shareUrl}</code>
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
            {isOwn && <p className="text-xs text-stone-400">{t("passport.verifyExplain")}</p>}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>{t("passport.history")}</SectionTitle>
        {data.history.length === 0 ? (
          <p className="py-3 text-center text-sm text-stone-500">{t("passport.noHistory")}</p>
        ) : (
          <ul className="space-y-1">
            {data.history.map((h) => {
              const meta = eventLabels[h.eventName];
              return (
                <li
                  key={`${h.txHash}-${h.logIndex}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-stone-50"
                >
                  <Badge tone={meta?.tone ?? "stone"}>{meta ? t(meta.key) : h.eventName}</Badge>
                  <span className="ml-auto font-mono text-xs text-stone-400">
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
