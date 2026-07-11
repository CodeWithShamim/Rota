import { useToast } from "../hooks/toast";

const toneStyles = {
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  success:
    "border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-100",
  error: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
} as const;

export function Toasts() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium shadow-lg ${toneStyles[t.kind]}`}
        >
          {t.kind === "info" && (
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {t.kind === "success" && <span>✓</span>}
          {t.kind === "error" && <span>⚠</span>}
          <span>{t.message}</span>
        </button>
      ))}
    </div>
  );
}
