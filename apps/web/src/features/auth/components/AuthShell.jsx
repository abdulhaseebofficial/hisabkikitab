import { PiggyBank, Sparkles, TrendingDown } from 'lucide-react';
import BrandMark from '../../../shared/components/layout/BrandMark';
import ContactLinks from '../../../shared/components/ContactLinks';
import { PrivacyChoices } from '../../../shared/analytics/ConsentBanner';
import { DEVELOPER } from '../../../shared/utils/constants';
import useT from '../../../shared/i18n/I18nProvider';
import ThemeToggle from '../../../app/layout/ThemeToggle';
import './auth-shell.css';

// Keys rather than text: this panel is the first thing a signed-out visitor
// reads, and it has to be in their language before there is a profile to ask.
const HIGHLIGHTS = [
  { icon: PiggyBank, title: 'authShell.knowTitle', text: 'authShell.knowText' },
  { icon: Sparkles, title: 'authShell.coachTitle', text: 'authShell.coachText' },
  { icon: TrendingDown, title: 'authShell.leaksTitle', text: 'authShell.leaksText' },
];

/**
 * Split screen for the signed-out pages: the pitch on the left (desktop only),
 * the form on the right.
 */
export default function AuthShell({ title, subtitle, children, footer }) {
  const { t } = useT();

  return (
    <div className="hkk-auth-shell relative flex min-h-full bg-canvas-light dark:bg-canvas-dark">
      <ThemeToggle className="absolute right-4 top-4 z-10 bg-canvas-card/80 shadow-card backdrop-blur sm:right-6 sm:top-6" />
      <aside className="hkk-auth-brand relative hidden w-1/2 flex-col justify-center bg-gradient-to-br from-[#0b3d9e] via-[#1468ff] to-[#63adff] p-10 pb-24 text-white lg:flex xl:p-14 xl:pb-28">
        <div className="hkk-auth-ambient" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="hkk-auth-brand-content relative z-10 max-w-lg">
          <BrandMark to="/" inverted className="mb-12" />

          <h1 className="hkk-auth-headline text-3xl font-extrabold leading-[1.15] xl:text-4xl">
            {t('authShell.headline')}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/85">
            {t('authShell.lede')}
          </p>

          <ul className="hkk-auth-highlights mt-10 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title: headingKey, text: textKey }) => (
              <li key={headingKey} className="hkk-auth-highlight flex gap-3.5">
                <span className="hkk-auth-highlight-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{t(headingKey)}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/85">{t(textKey)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="hkk-auth-footnote absolute inset-x-10 bottom-10 text-xs text-white/85 xl:inset-x-14 xl:bottom-14">
          {t('authShell.dataIsYours')}
        </p>
      </aside>

      <main className="hkk-auth-form-panel flex w-full flex-col justify-center px-4 py-8 sm:px-10 sm:py-12 lg:w-1/2">
        <div className="hkk-auth-form-card mx-auto w-full max-w-[26rem] rounded-[1.5rem] border border-slate-200 bg-canvas-card p-5 shadow-raised sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none dark:border-slate-800 dark:bg-canvas-darkCard lg:dark:bg-transparent">
          <BrandMark to="/" className="mb-8 lg:hidden" />

          <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && (
            <div className="mt-7 text-center text-sm text-slate-600 dark:text-slate-400">{footer}</div>
          )}

          {/*
            Signed-out visitors get the direct links, not the feedback dialog:
            POST /api/feedback sits behind `protect`, so offering the form here
            would hand someone a box that cannot send. A bug on the sign-in
            screen is exactly the one you cannot report from inside the app.
          */}
          <div className="mt-10 border-t border-slate-200 pt-5 text-center dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('authShell.reachOut', { name: DEVELOPER.name })}
            </p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <ContactLinks />
              <PrivacyChoices />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
