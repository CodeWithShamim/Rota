import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { GlobeIcon, LockIcon, RotaMark, StarIcon, TagIcon, TargetIcon, UsersIcon, ZapIcon } from "../components/icons";
import { Card } from "../components/ui";

/** Diaspora members orbiting the shared pot — mirrors the corridors Rota launches with. */
const ORBIT_FLAGS = ["🇧🇩", "🇦🇪", "🇬🇧", "🇲🇾", "🇸🇦", "🇺🇸"];

function HeroOrbit() {
  const step = 360 / ORBIT_FLAGS.length;
  return (
    // rounded-full + overflow-hidden clips the rotating wrappers' corners so they never widen the page
    <div
      className="relative mx-auto aspect-square w-full max-w-[24rem] overflow-hidden rounded-full lg:max-w-[26rem]"
      aria-hidden="true"
    >
      {/* rings */}
      <div className="absolute inset-8 rounded-full border-2 border-dashed border-brand-300/70 dark:border-brand-700/50" />
      <div className="absolute inset-[22%] rounded-full border border-brand-200/80 dark:border-brand-800/60" />
      <div className="absolute inset-[34%] rounded-full bg-brand-200/40 blur-2xl dark:bg-brand-500/10" />

      {/* orbiting members */}
      <div className="absolute inset-8 animate-orbit motion-reduce:animate-none">
        {ORBIT_FLAGS.map((flag, i) => (
          <div key={flag} className="absolute inset-0" style={{ transform: `rotate(${step * i}deg)` }}>
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
              <div className="animate-orbit-reverse motion-reduce:animate-none">
                <div style={{ transform: `rotate(${-step * i}deg)` }}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-stone-200 bg-white text-xl shadow-lg shadow-stone-900/5 sm:h-14 sm:w-14 sm:text-2xl dark:border-stone-700 dark:bg-stone-900">
                    {flag}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* the pot */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-hero-float motion-reduce:animate-none">
        <div className="flex flex-col items-center rounded-3xl border border-stone-200/80 bg-white/90 px-8 py-6 text-center shadow-2xl shadow-brand-600/15 backdrop-blur dark:border-stone-700/80 dark:bg-stone-900/90">
          <RotaMark className="h-9 w-9 text-brand-600 dark:text-brand-400" />
          <span className="mt-2 text-3xl font-extrabold tabular-nums text-stone-900 dark:text-white">1,200</span>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-400">USDC</span>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();

  const products = [
    { Icon: UsersIcon, name: t("landing.productCircleName"), desc: t("landing.productCircleDesc") },
    { Icon: TagIcon, name: t("landing.productBidName"), desc: t("landing.productBidDesc") },
    { Icon: TargetIcon, name: t("landing.productPotName"), desc: t("landing.productPotDesc") },
  ];
  const trust = [
    { Icon: LockIcon, title: t("landing.trustEscrowTitle"), desc: t("landing.trustEscrowDesc") },
    { Icon: ZapIcon, title: t("landing.trustAutoTitle"), desc: t("landing.trustAutoDesc") },
    { Icon: GlobeIcon, title: t("landing.trustBorderlessTitle"), desc: t("landing.trustBorderlessDesc") },
    { Icon: StarIcon, title: t("landing.trustReputationTitle"), desc: t("landing.trustReputationDesc") },
  ];
  const steps = [
    { n: "1", title: t("landing.howStep1Title"), desc: t("landing.howStep1Desc") },
    { n: "2", title: t("landing.howStep2Title"), desc: t("landing.howStep2Desc") },
    { n: "3", title: t("landing.howStep3Title"), desc: t("landing.howStep3Desc") },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* hero */}
      <section className="relative isolate pt-10 sm:pt-16">
        {/* backdrop: grid + glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-4 -top-6 bottom-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
        >
          <div className="hero-grid absolute inset-0" />
          <div className="absolute -top-32 left-1/2 h-[26rem] w-[42rem] -translate-x-1/2 rounded-full bg-brand-400/25 blur-3xl dark:bg-brand-500/15" />
          <div className="absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl dark:bg-brand-400/10" />
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8">
          <div className="text-center lg:text-left">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-brand-800 backdrop-blur dark:border-brand-800/70 dark:bg-brand-950/50 dark:text-brand-300">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
              </span>
              <span className="min-w-0">{t("landing.heroNames")}</span>
            </div>

            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl xl:text-6xl lg:mx-0">
              <span className="bg-gradient-to-br from-stone-900 via-stone-800 to-brand-600 bg-clip-text text-transparent dark:from-white dark:via-stone-200 dark:to-brand-300">
                {t("landing.heroTitle")}
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-stone-600 dark:text-stone-400 lg:mx-0">
              {t("landing.heroSubtitle")}
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link
                to="/app/create"
                className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 px-7 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-600/35 motion-reduce:transition-none"
              >
                {t("landing.heroCta")}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-2xl border border-stone-300/80 bg-white/70 px-7 py-3.5 font-semibold text-stone-700 backdrop-blur transition-colors hover:border-brand-300 hover:text-brand-700 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300 dark:hover:border-brand-700 dark:hover:text-brand-300"
              >
                {t("landing.heroSecondary")}
              </a>
            </div>

            <div className="mt-9 flex items-center justify-center gap-3 lg:justify-start">
              <div className="flex -space-x-2.5">
                {["🇧🇩", "🇦🇪", "🇬🇧", "🇺🇸"].map((f) => (
                  <span
                    key={f}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-stone-50 bg-white text-sm shadow-sm dark:border-stone-950 dark:bg-stone-800"
                  >
                    {f}
                  </span>
                ))}
              </div>
              <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">“{t("landing.promise")}”</p>
            </div>
          </div>

          <HeroOrbit />
        </div>
      </section>

      {/* how it works */}
      <section id="how">
        <h2 className="mb-6 text-center text-2xl font-bold text-stone-900 dark:text-stone-100">{t("landing.howTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.n} className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">
                {s.n}
              </div>
              <h3 className="font-semibold text-stone-900 dark:text-stone-100">{s.title}</h3>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{s.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* products */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-bold text-stone-900 dark:text-stone-100">{t("landing.productsTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {products.map((p) => (
            <Card key={p.name} className="transition-shadow hover:shadow-md">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                <p.Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-lg font-bold text-stone-900 dark:text-stone-100">{p.name}</h3>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{p.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* bangladesh corridor */}
      <section className="overflow-hidden rounded-3xl bg-brand-900 px-6 py-12 text-center text-white sm:px-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">
          {t("landing.corridorTitle")}
        </p>
        <h2 className="mt-4 text-4xl font-extrabold sm:text-5xl">{t("landing.corridorHeadline")}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-brand-100">{t("landing.corridorHeadlineSub")}</p>
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl bg-brand-800/60 p-6 text-left">
          <div className="mb-2 flex items-center gap-2 text-2xl">🇧🇩 🇦🇪 🇬🇧</div>
          <h3 className="font-bold">{t("landing.corridorExampleTitle")}</h3>
          <p className="mt-1 text-sm text-brand-100">{t("landing.corridorExampleDesc")}</p>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-sm text-brand-200">{t("landing.corridorNote")}</p>
      </section>

      {/* trust */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-bold text-stone-900 dark:text-stone-100">{t("landing.trustTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {trust.map((item) => (
            <Card key={item.title} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                <item.Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 dark:text-stone-100">{item.title}</h3>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{item.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
