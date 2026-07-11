import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GlobeIcon, RefreshIcon, SparklesIcon } from "../components/icons";
import { Badge, Button, Card, EmptyState, Skeleton } from "../components/ui";
import { useNews, useRefreshNews } from "../hooks/useNews";
import {
  GENLAYER_STUDIO_URL,
  genlayerExplorerAddressUrl,
  NEWS_CONFIGURED,
  NEWS_CONTRACT,
  type NewsCategory,
  type NewsItem,
} from "../lib/genlayer";

type Filter = "all" | NewsCategory;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatDate(iso: string, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

function NewsCard({ item }: { item: NewsItem }) {
  const { t, i18n } = useTranslation();
  const date = formatDate(item.date, i18n.language);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="font-semibold leading-snug text-stone-900 hover:text-brand-700 hover:underline dark:text-stone-100 dark:hover:text-brand-300"
        >
          {item.title}
        </a>
        <Badge tone={item.category === "arc" ? "blue" : "brand"}>
          {t(item.category === "arc" ? "news.categoryArc" : "news.categoryRota")}
        </Badge>
      </div>
      {item.summary && (
        <p className="text-sm text-stone-600 dark:text-stone-400">{item.summary}</p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
        <span className="font-medium">{item.source || hostOf(item.url)}</span>
        {date && (
          <>
            <span aria-hidden>·</span>
            <span>{date}</span>
          </>
        )}
        <span className="ml-auto" title={t("news.relevance")}>
          ★ {item.relevance}/10
        </span>
      </div>
    </Card>
  );
}

function SetupNotice() {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-brand-600 dark:text-brand-400">
          <SparklesIcon className="h-5 w-5" />
        </span>
        <div className="space-y-2 text-sm text-stone-700 dark:text-stone-300">
          <p className="font-semibold text-stone-900 dark:text-stone-100">
            {t("news.setupTitle")}
          </p>
          <p>{t("news.setupBody")}</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              {t("news.setupStep1")}{" "}
              <a
                href={GENLAYER_STUDIO_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                studio.genlayer.com
              </a>
            </li>
            <li>
              {t("news.setupStep2")}{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-xs dark:bg-stone-800">
                genlayer/news_curator.py
              </code>
            </li>
            <li>
              {t("news.setupStep3")}{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-xs dark:bg-stone-800">
                VITE_GENLAYER_NEWS_CONTRACT=0x…
              </code>
            </li>
          </ol>
        </div>
      </div>
    </Card>
  );
}

export function NewsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, isError, refetch } = useNews();
  const refresh = useRefreshNews();

  const items = useMemo(() => {
    const all = data?.items ?? [];
    return filter === "all" ? all : all.filter((i) => i.category === filter);
  }, [data, filter]);

  const filterButton = (value: Filter, label: string) => (
    <button
      key={value}
      onClick={() => setFilter(value)}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        filter === value
          ? "bg-white text-brand-700 shadow-sm ring-1 ring-stone-200 dark:bg-stone-800 dark:text-brand-300 dark:ring-stone-700"
          : "text-stone-600 hover:bg-white/70 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            {t("news.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
            {t("news.subtitle")}
          </p>
        </div>
        {NEWS_CONFIGURED && (
          <Button
            variant="secondary"
            busy={refresh.isPending}
            onClick={() => refresh.mutate()}
            title={t("news.refreshHint")}
          >
            <RefreshIcon className="h-4 w-4" />
            {t(refresh.isPending ? "news.refreshing" : "news.refresh")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-400">
        <GlobeIcon className="h-4 w-4 shrink-0" />
        <span>
          {t("news.poweredBy")}{" "}
          <a
            href="https://genlayer.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-700 hover:underline dark:text-brand-400"
          >
            GenLayer
          </a>
        </span>
        {NEWS_CONFIGURED && (
          <span className="ml-auto font-mono">
            <a
              href={genlayerExplorerAddressUrl(NEWS_CONTRACT)}
              target="_blank"
              rel="noreferrer"
              title={t("news.contractAddress")}
              className="hover:text-brand-700 hover:underline dark:hover:text-brand-400"
            >
              {NEWS_CONTRACT.slice(0, 6)}…{NEWS_CONTRACT.slice(-4)}
            </a>
            {data ? ` · ${t("news.refreshes", { count: data.meta.refresh_count })}` : ""}
          </span>
        )}
      </div>

      {!NEWS_CONFIGURED ? (
        <SetupNotice />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title={t("news.loadError")}
          hint={t("news.loadErrorHint")}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t("news.retry")}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("news.empty")}
          hint={t("news.emptyHint")}
          action={
            <Button busy={refresh.isPending} onClick={() => refresh.mutate()}>
              {t("news.refresh")}
            </Button>
          }
        />
      ) : (
        <>
          <nav className="flex gap-1 overflow-x-auto" aria-label={t("news.filter")}>
            {filterButton("all", t("news.filterAll"))}
            {filterButton("arc", t("news.categoryArc"))}
            {filterButton("rota", t("news.categoryRota"))}
          </nav>
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <NewsCard key={`${item.url}#${item.title}`} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
