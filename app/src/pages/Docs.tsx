import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  CoinsIcon,
  CompassIcon,
  HandHeartIcon,
  HelpCircleIcon,
  LightbulbIcon,
  RefreshIcon,
  RocketIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StarIcon,
  TagIcon,
  TargetIcon,
  UsersIcon,
} from "../components/icons";
import { Card } from "../components/ui";
import { FAUCET_URL } from "../config/chain";

type IconComponent = ComponentType<{ className?: string }>;

const SECTIONS: readonly { id: string; Icon: IconComponent; titleKey: string }[] = [
  { id: "intro", Icon: LightbulbIcon, titleKey: "docs.introTitle" },
  { id: "start", Icon: RocketIcon, titleKey: "docs.startTitle" },
  { id: "products", Icon: RefreshIcon, titleKey: "docs.productsTitle" },
  { id: "lifecycle", Icon: CompassIcon, titleKey: "docs.lifecycleTitle" },
  { id: "bidding", Icon: TagIcon, titleKey: "docs.bidTitle" },
  { id: "collateral", Icon: ShieldCheckIcon, titleKey: "docs.collateralTitle" },
  { id: "autopay", Icon: SettingsIcon, titleKey: "docs.autopayTitle" },
  { id: "giving", Icon: HandHeartIcon, titleKey: "docs.givingTitle" },
  { id: "passport", Icon: StarIcon, titleKey: "docs.passportTitle" },
  { id: "fees", Icon: CoinsIcon, titleKey: "docs.feesTitle" },
  { id: "faq", Icon: HelpCircleIcon, titleKey: "docs.faqTitle" },
  { id: "safety", Icon: AlertTriangleIcon, titleKey: "docs.safetyTitle" },
] as const;

const FAQ_COUNT = 7;

function useScrollSpy(): string {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    for (const { id } of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

function DocSection({
  id,
  Icon,
  title,
  children,
}: {
  id: string;
  Icon: IconComponent;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-36">
      <h2 className="flex items-center gap-3 text-xl font-bold text-stone-900 dark:text-stone-100">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800"
        >
          <Icon className="h-5 w-5" />
        </span>
        {title}
      </h2>
      <div className="mt-4 space-y-4 leading-relaxed text-stone-600 dark:text-stone-400">{children}</div>
    </section>
  );
}

function Callout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-900 dark:bg-brand-900/20">
      {title && <p className="mb-1 font-semibold text-brand-900 dark:text-brand-200">{title}</p>}
      <div className="text-sm leading-relaxed text-brand-900/80 dark:text-brand-100/80">{children}</div>
    </div>
  );
}

export function DocsPage() {
  const { t } = useTranslation();
  const active = useScrollSpy();

  const tocLinkClass = (id: string) =>
    `block rounded-r-lg border-l-2 py-1.5 pl-4 pr-2 text-sm transition-colors ${
      active === id
        ? "border-brand-600 font-semibold text-brand-700 dark:border-brand-400 dark:text-brand-300"
        : "border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-800 dark:border-stone-800 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:text-stone-200"
    }`;

  const startSteps = [1, 2, 3, 4].map((n) => ({
    n,
    title: t(`docs.startStep${n}Title`),
    desc: t(`docs.startStep${n}Desc`),
  }));
  const products = [
    { Icon: UsersIcon, name: t("landing.productCircleName"), desc: t("docs.productCircleDesc"), best: t("docs.productCircleBest") },
    { Icon: TagIcon, name: t("landing.productBidName"), desc: t("docs.productBidDesc"), best: t("docs.productBidBest") },
    { Icon: TargetIcon, name: t("landing.productPotName"), desc: t("docs.productPotDesc"), best: t("docs.productPotBest") },
  ];
  const phases = ["Open", "Active", "Settle", "Done"].map((p) => ({
    title: t(`docs.phase${p}Title`),
    desc: t(`docs.phase${p}Desc`),
  }));
  const fees = ["Rota", "Gas", "Fx"].map((f) => ({
    title: t(`docs.fee${f}Title`),
    desc: t(`docs.fee${f}Desc`),
  }));

  return (
    <div className="pb-16">
      {/* hero */}
      <section className="py-8 text-center sm:py-12">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-400">
          {t("docs.minutes")}
        </p>
        <h1 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-100 sm:text-4xl">
          {t("docs.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600 dark:text-stone-400">{t("docs.subtitle")}</p>
      </section>

      {/* mobile table of contents */}
      <nav aria-label={t("docs.toc")} className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-2 lg:hidden">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <s.Icon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
            {t(s.titleKey)}
          </a>
        ))}
      </nav>

      <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12">
        {/* desktop table of contents */}
        <aside className="hidden lg:block">
          <nav aria-label={t("docs.toc")} className="sticky top-36">
            <p className="mb-3 pl-4 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
              {t("docs.toc")}
            </p>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className={tocLinkClass(s.id)}>
                {t(s.titleKey)}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-14">
          <DocSection id="intro" Icon={LightbulbIcon} title={t("docs.introTitle")}>
            <p>{t("docs.introP1")}</p>
            <p>{t("docs.introP2")}</p>
          </DocSection>

          <DocSection id="start" Icon={RocketIcon} title={t("docs.startTitle")}>
            <p>{t("docs.startIntro")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {startSteps.map((s) => (
                <Card key={s.n}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">
                    {s.n}
                  </div>
                  <h3 className="mt-3 font-semibold text-stone-900 dark:text-stone-100">{s.title}</h3>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{s.desc}</p>
                  {s.n === 2 && (
                    <a
                      href={FAUCET_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400"
                    >
                      {t("docs.startStep2Cta")} ↗
                    </a>
                  )}
                </Card>
              ))}
            </div>
          </DocSection>

          <DocSection id="products" Icon={RefreshIcon} title={t("docs.productsTitle")}>
            <div className="grid gap-4 md:grid-cols-3">
              {products.map((p) => (
                <Card key={p.name} className="flex flex-col">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800">
                    <p.Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-stone-900 dark:text-stone-100">{p.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-stone-600 dark:text-stone-400">{p.desc}</p>
                  <p className="mt-3 text-sm font-medium text-brand-700 dark:text-brand-400">{p.best}</p>
                </Card>
              ))}
            </div>
          </DocSection>

          <DocSection id="lifecycle" Icon={CompassIcon} title={t("docs.lifecycleTitle")}>
            <p>{t("docs.lifecycleIntro")}</p>
            <ol className="space-y-6 border-l-2 border-brand-200 pl-7 dark:border-brand-900">
              {phases.map((p, i) => (
                <li key={p.title} className="relative">
                  <span className="absolute -left-[41px] flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <h3 className="font-semibold text-stone-900 dark:text-stone-100">{p.title}</h3>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{p.desc}</p>
                </li>
              ))}
            </ol>
          </DocSection>

          <DocSection id="bidding" Icon={TagIcon} title={t("docs.bidTitle")}>
            <p>{t("docs.bidP1")}</p>
            <Callout title={t("docs.bidExampleTitle")}>{t("docs.bidExample")}</Callout>
            <p>{t("docs.bidP2")}</p>
          </DocSection>

          <DocSection id="collateral" Icon={ShieldCheckIcon} title={t("docs.collateralTitle")}>
            <p>{t("docs.collateralP1")}</p>
            <p>{t("docs.collateralP2")}</p>
            <p>{t("docs.collateralP3")}</p>
          </DocSection>

          <DocSection id="autopay" Icon={SettingsIcon} title={t("docs.autopayTitle")}>
            <p>{t("docs.autopayP1")}</p>
            <p>{t("docs.autopayP2")}</p>
          </DocSection>

          <DocSection id="giving" Icon={HandHeartIcon} title={t("docs.givingTitle")}>
            <p>{t("docs.givingP1")}</p>
          </DocSection>

          <DocSection id="passport" Icon={StarIcon} title={t("docs.passportTitle")}>
            <p>{t("docs.passportP1")}</p>
            <div className="overflow-x-auto rounded-xl bg-stone-100 px-4 py-3 font-mono text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              {t("passport.formula")}
            </div>
            <p>{t("docs.passportP2")}</p>
          </DocSection>

          <DocSection id="fees" Icon={CoinsIcon} title={t("docs.feesTitle")}>
            <div className="grid gap-4 md:grid-cols-3">
              {fees.map((f) => (
                <Card key={f.title}>
                  <h3 className="font-semibold text-stone-900 dark:text-stone-100">{f.title}</h3>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{f.desc}</p>
                </Card>
              ))}
            </div>
          </DocSection>

          <DocSection id="faq" Icon={HelpCircleIcon} title={t("docs.faqTitle")}>
            <div className="space-y-3">
              {Array.from({ length: FAQ_COUNT }, (_, i) => i + 1).map((n) => (
                <details
                  key={n}
                  className="group rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold text-stone-900 dark:text-stone-100 [&::-webkit-details-marker]:hidden">
                    {t(`docs.faqQ${n}`)}
                    <ChevronDownIcon className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                    {t(`docs.faqA${n}`)}
                  </p>
                </details>
              ))}
            </div>
          </DocSection>

          <DocSection id="safety" Icon={AlertTriangleIcon} title={t("docs.safetyTitle")}>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-900/20">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{t("docs.safetyIntro")}</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                {[1, 2, 3, 4].map((n) => (
                  <li key={n}>{t(`docs.safetyItem${n}`)}</li>
                ))}
              </ul>
            </div>
          </DocSection>

          {/* closing call to action */}
          <section className="rounded-3xl bg-brand-900 px-6 py-10 text-center text-white sm:px-12">
            <h2 className="text-2xl font-extrabold sm:text-3xl">{t("docs.ctaTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-100">{t("docs.ctaDesc")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                to="/app/create"
                className="rounded-xl bg-white px-6 py-3 font-semibold text-brand-900 shadow-md hover:bg-brand-50"
              >
                {t("docs.ctaCreate")}
              </Link>
              <a
                href={FAUCET_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-brand-400 px-6 py-3 font-semibold text-brand-100 hover:bg-brand-800"
              >
                {t("docs.ctaFaucet")}
              </a>
            </div>
            <p className="mt-6 text-xs text-brand-300">{t("landing.testnetNote")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
