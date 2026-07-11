import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCountdown } from "../lib/format";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

type BadgeTone = "brand" | "amber" | "red" | "stone" | "blue";
const badgeTones: Record<BadgeTone, string> = {
  brand: "bg-brand-100 text-brand-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  stone: "bg-stone-100 text-stone-600",
  blue: "bg-sky-100 text-sky-800",
};

export function Badge({ tone = "stone", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  busy?: boolean;
};

export function Button({ variant = "primary", busy, className = "", children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-stone-300",
    secondary:
      "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 disabled:text-stone-400",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-stone-300",
    ghost: "text-brand-700 hover:bg-brand-50 disabled:text-stone-400",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
      disabled={disabled || busy}
      {...rest}
    >
      {busy && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-stone-200 ${className}`} />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-6 py-12 text-center">
      <div className="text-4xl">🪙</div>
      <p className="font-medium text-stone-700">{title}</p>
      {hint && <p className="max-w-sm text-sm text-stone-500">{hint}</p>}
      {action}
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ percent, label, sub }: { percent: number; label: string; sub?: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-stone-200" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-brand-500 transition-all"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-stone-900">{label}</span>
        {sub && <span className="text-xs text-stone-500">{sub}</span>}
      </div>
    </div>
  );
}

/** Live-updating localized countdown ("in 3 days"). */
export function Countdown({ target }: { target: bigint | number }) {
  const { i18n } = useTranslation();
  const [, force] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  return <span>{formatCountdown(target, i18n.language)}</span>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-lg font-semibold text-stone-900">{children}</h2>;
}
