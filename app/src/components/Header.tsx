import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { CURRENCIES } from "../config/currencies";
import { FAUCET_URL, activeChain, CHAIN_KEY } from "../config/chain";
import { useDisplayCurrency } from "../hooks/useDisplayCurrency";
import { useNotifications } from "../hooks/useNotifications";
import { useTheme } from "../hooks/useTheme";
import { useReputation } from "../hooks/useRota";
import { useUsdcActions, useUsdcBalance } from "../hooks/useUsdc";
import { SUPPORTED_LOCALES } from "../i18n";
import { formatUsdc, shortAddress } from "../lib/format";
import { Badge, Button } from "./ui";
import {
  AddressAvatar,
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  LogOutIcon,
  MoonIcon,
  RotaMark,
  SunIcon,
} from "./icons";

function ConnectControls() {
  const { t, i18n } = useTranslation();
  const { address, isConnected, chainId } = useAccount();
  const { data: balance } = useUsdcBalance();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== activeChain.id;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1200);
    } catch {
      // clipboard denied: leave the menu open so the user can retry
    }
  }

  if (!isConnected) {
    const injectedConnector = connectors[0];
    return (
      <Button
        busy={isPending}
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        title={injectedConnector ? undefined : t("header.noWallet")}
        disabled={!injectedConnector}
        className="whitespace-nowrap"
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
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-stone-300 px-3 py-2 font-mono text-sm text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <AddressAvatar address={address!} className="h-4 w-4" />
        {shortAddress(address!)}
        <ChevronDownIcon className={`h-3.5 w-3.5 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-48 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-lg dark:border-stone-700 dark:bg-stone-900"
        >
          {balance !== undefined && (
            <>
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-sm sm:hidden">
                <span className="text-stone-500 dark:text-stone-400">{t("header.balance")}</span>
                <span className="font-semibold">{formatUsdc(balance, i18n.language)} USDC</span>
              </div>
              <div className="my-1 h-px bg-stone-100 dark:bg-stone-800 sm:hidden" />
            </>
          )}
          <button
            role="menuitem"
            onClick={() => void copyAddress()}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {copied ? <CheckIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" /> : <CopyIcon className="h-4 w-4" />}
            {t(copied ? "common.copied" : "header.copyAddress")}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            <LogOutIcon className="h-4 w-4" />
            {t("header.disconnect")}
          </button>
        </div>
      )}
    </div>
  );
}

function BalancePill({ className = "" }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const { isConnected } = useAccount();
  const { data: balance } = useUsdcBalance();
  const { faucet } = useUsdcActions();
  if (!isConnected || balance === undefined) return null;
  return (
    <div
      className={`items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800 ${className}`}
    >
      <span className="font-semibold">{formatUsdc(balance, i18n.language)} USDC</span>
      {faucet ? (
        <button
          className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400"
          onClick={() => void faucet()}
        >
          {t("faucet.mintLocal")}
        </button>
      ) : (
        <a
          className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400"
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
        className="relative rounded-xl border border-stone-300 p-2 text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        aria-label={t("header.notifications")}
      >
        <BellIcon />
        {reminders.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            {reminders.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <p className="mb-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
            {t("notifications.title")}
          </p>
          {reminders.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-500 dark:text-stone-400">
              {t("notifications.none")}
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {reminders.map((r) => (
                <li key={r.id}>
                  <Link
                    to={r.route}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-2 text-sm text-stone-700 hover:bg-brand-50 dark:text-stone-300 dark:hover:bg-brand-900/30"
                  >
                    {r.message}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button
            className="mt-2 w-full rounded-lg bg-stone-100 px-2 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            onClick={() => void enableBrowser()}
          >
            {t(browserEnabled ? "notifications.browserEnabled" : "notifications.enableBrowser")}
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-xl border border-stone-300 p-2 text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
      aria-label={t("header.theme")}
      title={t("header.theme")}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
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

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? "border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300"
      : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:text-stone-200"
  }`;

function NavLinks() {
  const { t } = useTranslation();
  return (
    <>
      <NavLink to="/app" end className={navLinkClass}>
        {t("nav.dashboard")}
      </NavLink>
      <NavLink to="/app/create" className={navLinkClass}>
        {t("nav.create")}
      </NavLink>
      <NavLink to="/app/reputation" className={navLinkClass}>
        {t("nav.passport")}
      </NavLink>
    </>
  );
}

export function Header() {
  const { t, i18n } = useTranslation();
  const { code, setCurrency } = useDisplayCurrency();

  const selectClass =
    "rounded-lg border border-stone-300 bg-white px-1.5 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200";

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:gap-3">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <RotaMark className="h-[18px] w-[18px]" />
          </span>
          <span className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-100">
            {t("app.name")}
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <select
            aria-label={t("header.language")}
            className={`hidden sm:block ${selectClass}`}
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
            className={`hidden md:block ${selectClass}`}
            value={code}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {Object.values(CURRENCIES).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.symbol}
              </option>
            ))}
          </select>
          <BalancePill className="hidden sm:flex" />
          <ReputationBadge />
          <ThemeToggle />
          <NotificationsBell />
          <ConnectControls />
        </div>
      </div>
      {/* sub-navbar */}
      <div className="border-t border-stone-100 dark:border-stone-800/60">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4">
          <nav
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
            aria-label={t("header.navigation")}
          >
            <NavLinks />
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 py-1 sm:hidden">
            <select
              aria-label={t("header.language")}
              className={selectClass}
              value={i18n.resolvedLanguage}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
            >
              {SUPPORTED_LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code.toUpperCase()}
                </option>
              ))}
            </select>
            <select
              aria-label={t("header.currency")}
              className={selectClass}
              value={code}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {Object.values(CURRENCIES).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {CHAIN_KEY === "local" && (
        <div className="bg-amber-50 px-4 py-1 text-center text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          anvil · localhost:8545
        </div>
      )}
    </header>
  );
}
