import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { analyticsConsent, CONSENT_EVENT, CONSENT_KEY, initializeConsent, setAnalyticsConsent, syncStoredConsent } from './consent';
import PublicLink from '../seo/PublicLink';
import useT from '../i18n/I18nProvider';

export default function ConsentBanner() {
  const { t } = useT();
  const [open, setOpen] = useState(() => !analyticsConsent());
  const banner = useRef(null);
  const heading = useRef(null);
  useEffect(() => {
    initializeConsent();
    const changed = () => setOpen(!analyticsConsent());
    const reopen = () => { setOpen(true); requestAnimationFrame(() => heading.current?.focus()); };
    window.addEventListener(CONSENT_EVENT, changed);
    window.addEventListener('hkk-open-consent', reopen);
    const storageChanged = (event) => { if (event.key === CONSENT_KEY || event.key === null) syncStoredConsent(); };
    window.addEventListener('storage', storageChanged);
    return () => { window.removeEventListener(CONSENT_EVENT, changed); window.removeEventListener('hkk-open-consent', reopen); window.removeEventListener('storage', storageChanged); };
  }, []);
  useLayoutEffect(() => {
    if (!open || !banner.current) return undefined;
    const previousPadding = document.body.style.paddingBottom;
    const reserveSpace = () => { document.body.style.paddingBottom = String(Math.ceil(banner.current?.getBoundingClientRect().height || 0)) + 'px'; };
    reserveSpace();
    const observer = new ResizeObserver(reserveSpace);
    observer.observe(banner.current);
    return () => { observer.disconnect(); document.body.style.paddingBottom = previousPadding; };
  }, [open]);
  const choose = (choice) => { setAnalyticsConsent(choice); setOpen(false); };
  if (!open) return null;
  return <section ref={banner} aria-labelledby="consent-heading" className="fixed inset-x-0 bottom-0 z-50 max-h-[35dvh] overflow-y-auto border-t border-slate-300 bg-canvas-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lift dark:border-slate-700 dark:bg-canvas-darkCard sm:px-6 sm:py-3">
    <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:flex-1">
        <h2 id="consent-heading" ref={heading} tabIndex={-1} className="font-display text-sm font-semibold">{t('consent.title')}</h2>
        <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">{t('consent.description')} <PublicLink to="/privacy" className="whitespace-nowrap text-brand-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 dark:text-brand-300">{t('consent.policy')}</PublicLink></p>
      </div>
      <div className="flex shrink-0 gap-2 sm:gap-3">
        <button type="button" onClick={() => choose('denied')} className="min-h-10 flex-1 rounded-lg border border-brand-600 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 dark:text-brand-300 dark:hover:bg-brand-500/10 sm:flex-none sm:px-4 sm:text-sm">{t('consent.reject')}</button>
        <button type="button" onClick={() => choose('granted')} className="min-h-10 flex-1 rounded-lg border border-brand-600 bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:flex-none sm:px-4 sm:text-sm">{t('consent.accept')}</button>
      </div>
    </div>
  </section>;
}

export function PrivacyChoices() {
  const { t } = useT();
  return <button type="button" onClick={() => window.dispatchEvent(new Event('hkk-open-consent'))} className="inline-flex min-h-11 items-center text-sm hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 dark:hover:text-brand-300">{t('consent.choices')}</button>;
}
