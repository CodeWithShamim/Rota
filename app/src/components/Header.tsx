import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { CURRENCIES } from "../config/currencies";
import { FAUCET_URL, activeChain, CHAIN_KEY } from "../config/chain";
import { useDisplayCurrency } from "../hooks/useDisplayCurrency";
import { useNotifications } from "../hooks/useNotifications";
import { useReputation } from "../hooks/useRota";
import { useUsdcActions, useUsdcBalance } from "../hooks/useUsdc";
import { SUPPORTED_LOCALES } from "../i18n";
import { formatUsdc, shortAddress } from "../lib/format";
import { Badge, Button } from "./ui";

function ConnectControls() {
  const { t } = useTranslation();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== activeChain.id;

  if (!isConnected) {
    const injectedConnector = connectors[0];
    return (
      <Button
        busy={isPending}
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        title={injectedConnector ? undefined : t("header.noWallet")}
        disabled={!injectedConnector}
      >
        {t(isPending ? "header.connecting" : "header.connect")}
      </Button>
    );
  }
  if (wrongNetwork) {
    return (
      <Button variant="danger" onClick={() => switchChain({ chainId: activeChain.id })}>
        {t("header.switchNetwork", { chain: activeChain.name })}
      </Button>
    );
  }
  return (
    <button
      onClick={() => disconnect()}
      className="rounded-xl border border-stone-300 px-3 py-2 font-mono text-sm text-stone-700 hover:bg-stone-50"
      title={t("header.disconnect")}
    >
      {shortAddress(address!)}
    </button>
  );
}

function BalancePill() {
  const { t, i18n } = useTranslation();
  const { isConnected } = useAccount();
  const { data: balance } = useUsdcBalance();
  const { faucet } = useUsdcActions();
  if (!isConnected || balance === undefined) return null;
  return (
    <div className="hidden items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-sm sm:flex">
      <span className="font-semibold">{formatUsdc(balance, i18n.language)} USDC</span>
      {faucet ? (
        <button className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => void faucet()}>
          {t("faucet.mintLocal")}
        </button>
      ) : (
        <a
          className="text-xs font-semibold text-brand-700 hover:underline"
          href={FAUCET_URL}
          target="_blank"
          rel="noreferrer"
        >
          {t("circle.getTestUsdc")}
        </a>
      )}
    </div>
  );
}

function NotificationsBell() {
  const { t } = useTranslation();
  const { reminders, browserEnabled, enableBrowser } = useNotifications();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl border border-stone-300 p-2 hover:bg-stone-50"
        aria-label={t("header.notifications")}
      >
        🔔
        {reminders.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            {reminders.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-stone-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-sm font-semibold text-stone-900">{t("notifications.title")}</p>
          {reminders.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-500">{t("notifications.none")}</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {reminders.map((r) => (
                <li key={r.id}>
                  <Link
                    to={r.route}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-2 text-sm text-stone-700 hover:bg-brand-50"
                  >
                    {r.message}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button
            className="mt-2 w-full rounded-lg bg-stone-100 px-2 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200"
            onClick={() => void enableBrowser()}
          >
            {t(browserEnabled ? "notifications.browserEnabled" : "notifications.enableBrowser")}
          </button>
        </div>
      )}
    </div>
  );
}

function ReputationBadge() {
  const { address } = useAccount();
  const { data } = useReputation(address);
  if (!address || !data) return null;
  return (
    <Link to={`/app/reputation/${address}`} className="hidden sm:block" title="Credit Passport">
      <Badge tone="brand">★ {data.score.toString()}</Badge>
    </Link>
  );
}

export function Header() {
  const { t, i18n } = useTranslation();
  const { code, setCurrency } = useDisplayCurrency();

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-lg text-white">
            ◎
          </span>
          <span className="text-lg font-bold tracking-tight text-stone-900">{t("app.name")}</span>
        </Link>
        <nav className="ml-2 hidden gap-1 sm:flex">
          <NavLink
            to="/app"
            end
            className={({ isActive }) =>
              `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-800" : "text-stone-600 hover:bg-stone-100"}`
            }
          >
            {t("nav.dashboard")}
          </NavLink>
          <NavLink
            to="/app/create"
            className={({ isActive }) =>
              `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-800" : "text-stone-600 hover:bg-stone-100"}`
            }
          >
            {t("nav.create")}
          </NavLink>
          <NavLink
            to="/app/reputation"
            className={({ isActive }) =>
              `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-800" : "text-stone-600 hover:bg-stone-100"}`
            }
          >
            {t("nav.passport")}
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label={t("header.language")}
            className="rounded-lg border border-stone-300 bg-white px-1.5 py-1.5 text-sm"
            value={i18n.resolvedLanguage}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <select
            aria-label={t("header.currency")}
            className="hidden rounded-lg border border-stone-300 bg-white px-1.5 py-1.5 text-sm md:block"
            value={code}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {Object.values(CURRENCIES).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.symbol}
              </option>
            ))}
          </select>
          <BalancePill />
          <ReputationBadge />
          <NotificationsBell />
          <ConnectControls />
        </div>
      </div>
      {CHAIN_KEY === "local" && (
        <div className="bg-amber-50 px-4 py-1 text-center text-xs text-amber-800">
          anvil · localhost:8545
        </div>
      )}
    </header>
  );
}
