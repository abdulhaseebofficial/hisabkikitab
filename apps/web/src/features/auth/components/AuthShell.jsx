import { PiggyBank, Sparkles, TrendingDown } from 'lucide-react';
import BrandMark from '../../../shared/components/layout/BrandMark';
import ContactLinks from '../../../shared/components/ContactLinks';
import { DEVELOPER } from '../../../shared/utils/constants';
import useT from '../../../shared/i18n/I18nProvider';

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
    <div className="flex min-h-full bg-canvas-light dark:bg-canvas-dark">
      {/*
        The pitch is one block with the logo, not a third thing spread to the
        far corner: `justify-between` on three children left ~225px of dead
        panel above and below the pitch on a laptop screen. The logo now sits
        directly above the headline it belongs to, the small print keeps the
        bottom, and the slack collects in one place instead of two.
      */}
      {/* pb reserves the strip the absolutely-placed small print sits in, so the
          centred pitch cannot grow into it on a short laptop screen. */}
      <aside className="relative hidden w-1/2 flex-col justify-center bg-brand-600 p-10 pb-24 text-white lg:flex xl:p-14 xl:pb-28">
        <div className="max-w-lg">
          <BrandMark to="/" inverted className="mb-12" />

          <h1 className="text-3xl font-extrabold leading-[1.15] xl:text-4xl">
            {t('authShell.headline')}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-brand-100">
            {t('authShell.lede')}
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title: headingKey, text: textKey }) => (
              <li key={headingKey} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{t(headingKey)}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-brand-100">{t(textKey)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="absolute inset-x-10 bottom-10 text-xs text-brand-100/90 xl:inset-x-14 xl:bottom-14">
          {t('authShell.dataIsYours')}
        </p>
      </aside>

      <main className="flex w-full flex-col justify-center px-4 py-8 sm:px-10 sm:py-12 lg:w-1/2">
        <div className="mx-auto w-full max-w-[26rem] rounded-[1.5rem] border border-slate-200 bg-canvas-card p-5 shadow-raised sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none dark:border-slate-800 dark:bg-canvas-darkCard lg:dark:bg-transparent">
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
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
