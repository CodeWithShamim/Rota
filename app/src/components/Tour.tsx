import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Button } from "./ui";

/** localStorage flag — bump the suffix to re-show the tour after major UX changes. */
const STORAGE_KEY = "rota.tour.v1";
/** Dispatch this on `window` to replay the tour (see the help button in the Header). */
export const TOUR_EVENT = "rota:tour";

type Step = { key: string; target?: string };

/** Steps point at `data-tour` anchors; steps whose anchor isn't visible are skipped. */
const STEPS: Step[] = [
  { key: "welcome" },
  { key: "connect", target: "connect" },
  { key: "dashboard", target: "nav-dashboard" },
  { key: "create", target: "nav-create" },
  { key: "passport", target: "nav-passport" },
  { key: "notifications", target: "notifications" },
  { key: "language", target: "language" },
  { key: "docs", target: "nav-docs" },
];

function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    if (el.offsetParent !== null) return el;
  }
  return null;
}

const PAD = 6;

export function Tour() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const start = useCallback(() => {
    setIndex(0);
    setSteps(STEPS.filter((s) => !s.target || findTarget(s.target)));
  }, []);

  const stop = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "done");
    setSteps(null);
  }, []);

  // Auto-start the first time someone lands in the app area.
  useEffect(() => {
    if (!pathname.startsWith("/app") || localStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(start, 600);
    return () => clearTimeout(timer);
  }, [pathname, start]);

  useEffect(() => {
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, [start]);

  const step = steps?.[index];

  useEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = findTarget(step.target);
      if (step.target && el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    if (!steps) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps, stop]);

  if (!steps || !step) return null;

  const last = index === steps.length - 1;
  const highlighted = step.target ? rect : null;
  const width = Math.min(320, window.innerWidth - 24);

  let cardStyle: CSSProperties;
  let arrowStyle: CSSProperties | null = null;
  if (highlighted) {
    const placeAbove = highlighted.bottom + 240 > window.innerHeight && highlighted.top > 260;
    const left = Math.min(
      Math.max(highlighted.left + highlighted.width / 2 - width / 2, 12),
      window.innerWidth - width - 12,
    );
    const gap = PAD + 10;
    cardStyle = placeAbove
      ? { left, bottom: window.innerHeight - highlighted.top + gap, width }
      : { left, top: highlighted.bottom + gap, width };
    const arrowX = Math.min(
      Math.max(highlighted.left + highlighted.width / 2, left + 20),
      left + width - 20,
    );
    arrowStyle = placeAbove
      ? { left: arrowX - 6, bottom: window.innerHeight - highlighted.top + gap - 6 }
      : { left: arrowX - 6, top: highlighted.bottom + gap - 6 };
  } else {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%,-50%)", width };
  }

  return (
    <div className="fixed inset-0 z-40">
      {highlighted ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-brand-400 transition-all duration-200"
          style={{
            left: highlighted.left - PAD,
            top: highlighted.top - PAD,
            width: highlighted.width + PAD * 2,
            height: highlighted.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/55" />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(`tour.${step.key}Title`)}
        className="fixed rounded-2xl border border-stone-200 bg-white p-4 shadow-xl dark:border-stone-700 dark:bg-stone-900"
        style={cardStyle}
      >
        <p className="text-xs font-medium text-stone-400 dark:text-stone-500">
          {t("tour.stepOf", { current: index + 1, total: steps.length })}
        </p>
        <h3 className="mt-1 font-bold text-stone-900 dark:text-stone-100">
          {t(`tour.${step.key}Title`)}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          {t(`tour.${step.key}Body`)}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          {last ? (
            <span />
          ) : (
            <button
              onClick={stop}
              className="text-xs font-medium text-stone-400 hover:underline dark:text-stone-500"
            >
              {t("tour.skip")}
            </button>
          )}
          <div className="flex gap-2">
            {index > 0 && (
              <Button
                variant="secondary"
                className="!px-3 !py-1.5"
                onClick={() => setIndex((i) => i - 1)}
              >
                {t("common.back")}
              </Button>
            )}
            <Button
              className="!px-3 !py-1.5"
              onClick={() => (last ? stop() : setIndex((i) => i + 1))}
            >
              {t(last ? "tour.done" : "common.next")}
            </Button>
          </div>
        </div>
      </div>
      {arrowStyle && (
        <div
          className="fixed h-3 w-3 rotate-45 border-l border-t border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900"
          style={arrowStyle}
        />
      )}
    </div>
  );
}
