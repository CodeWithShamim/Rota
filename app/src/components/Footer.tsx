import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FAUCET_URL } from "../config/chain";
import { GitHubIcon, RotaMark } from "./icons";

const GITHUB_URL = "https://github.com/CodeWithShamim/Rota";

const linkClass =
  "text-sm text-stone-500 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100";

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title}>
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
        {title}
      </p>
      <ul className="mt-3 space-y-2">{children}</ul>
    </nav>
  );
}

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 border-t border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900/40">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
                <RotaMark className="h-[18px] w-[18px]" />
              </span>
              <span className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-100">
                {t("app.name")}
              </span>
            </Link>
            <p className="mt-3 text-sm font-medium text-stone-600 dark:text-stone-300">
              {t("app.tagline")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-stone-400 dark:text-stone-500">
              {t("landing.testnetNote")}
            </p>
          </div>

          <div className="flex gap-12 sm:gap-20">
            <FooterColumn title={t("footer.product")}>
              <li>
                <Link to="/app" className={linkClass}>
                  {t("nav.dashboard")}
                </Link>
              </li>
              <li>
                <Link to="/app/create" className={linkClass}>
                  {t("nav.create")}
                </Link>
              </li>
              <li>
                <Link to="/app/reputation" className={linkClass}>
                  {t("nav.passport")}
                </Link>
              </li>
            </FooterColumn>

            <FooterColumn title={t("footer.resources")}>
              <li>
                <Link to="/docs" className={linkClass}>
                  {t("nav.docs")}
                </Link>
              </li>
              <li>
                <a href={FAUCET_URL} target="_blank" rel="noreferrer" className={linkClass}>
                  {t("circle.getTestUsdc")}
                </a>
              </li>
              <li>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={linkClass}>
                  GitHub
                </a>
              </li>
            </FooterColumn>
          </div>
        </div>

        <div className="mt-10 flex flex-col-reverse items-center justify-between gap-4 border-t border-stone-200 pt-6 sm:flex-row dark:border-stone-800">
          <p className="text-xs text-stone-400 dark:text-stone-500">
            © {year} {t("app.name")} · {t("footer.rights")}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-stone-400 dark:text-stone-500">
              {t("footer.builtOnArc")}
            </span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="text-stone-400 transition-colors hover:text-stone-900 dark:hover:text-stone-100"
            >
              <GitHubIcon className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
