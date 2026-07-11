import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Card } from "../components/ui";

export function LandingPage() {
  const { t } = useTranslation();

  const products = [
    { icon: "🔄", name: t("landing.productCircleName"), desc: t("landing.productCircleDesc") },
    { icon: "🏷️", name: t("landing.productBidName"), desc: t("landing.productBidDesc") },
    { icon: "🎯", name: t("landing.productPotName"), desc: t("landing.productPotDesc") },
  ];
  const trust = [
    { icon: "🔒", title: t("landing.trustEscrowTitle"), desc: t("landing.trustEscrowDesc") },
    { icon: "⚙️", title: t("landing.trustAutoTitle"), desc: t("landing.trustAutoDesc") },
    { icon: "🌍", title: t("landing.trustBorderlessTitle"), desc: t("landing.trustBorderlessDesc") },
    { icon: "⭐", title: t("landing.trustReputationTitle"), desc: t("landing.trustReputationDesc") },
  ];
  const steps = [
    { n: "1", title: t("landing.howStep1Title"), desc: t("landing.howStep1Desc") },
    { n: "2", title: t("landing.howStep2Title"), desc: t("landing.howStep2Desc") },
    { n: "3", title: t("landing.howStep3Title"), desc: t("landing.howStep3Desc") },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* hero */}
      <section className="pt-10 text-center sm:pt-16">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-400">
          {t("landing.heroNames")}
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-stone-900 dark:text-stone-100 sm:text-5xl">
          {t("landing.heroTitle")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600 dark:text-stone-400">{t("landing.heroSubtitle")}</p>
        <p className="mt-6 text-2xl font-bold text-brand-700 dark:text-brand-400">“{t("landing.promise")}”</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/app/create"
            className="rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-md hover:bg-brand-700"
          >
            {t("landing.heroCta")}
          </Link>
          <a
            href="#how"
            className="rounded-xl border border-stone-300 bg-white px-6 py-3 font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {t("landing.heroSecondary")}
          </a>
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
              <div className="text-3xl">{p.icon}</div>
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
              <div className="text-2xl">{item.icon}</div>
              <div>
                <h3 className="font-semibold text-stone-900 dark:text-stone-100">{item.title}</h3>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{item.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <footer className="text-center text-xs text-stone-400 dark:text-stone-500">{t("landing.testnetNote")}</footer>
    </div>
  );
}
