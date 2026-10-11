import { useEffect, useRef, useState } from 'react';
import { analyticsConsent, CONSENT_EVENT, CONSENT_KEY, initializeConsent, setAnalyticsConsent, syncStoredConsent } from './consent';
import PublicLink from '../seo/PublicLink';
import useT from '../i18n/I18nProvider';

export default function ConsentBanner() {
  const { t } = useT();
  const [open, setOpen] = useState(() => !analyticsConsent());
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
  const choose = (choice) => { setAnalyticsConsent(choice); setOpen(false); };
  if (!open) return null;
  return <section aria-labelledby="consent-heading" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[80dvh] max-w-3xl overflow-y-auto rounded-2xl border border-slate-300 bg-canvas-card p-5 shadow-lift sm:p-6 dark:border-slate-700 dark:bg-canvas-darkCard">
    <h2 id="consent-heading" ref={heading} tabIndex={-1} className="font-display text-xl font-semibold">{t('consent.title')}</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t('consent.description')} <PublicLink to="/privacy" className="text-brand-700 underline dark:text-brand-300">{t('consent.policy')}</PublicLink></p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" onClick={() => choose('denied')} className="min-h-11 rounded-xl border border-brand-600 px-5 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10">{t('consent.reject')}</button>
      <button type="button" onClick={() => choose('granted')} className="min-h-11 rounded-xl border border-brand-600 bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">{t('consent.accept')}</button>
    </div>
  </section>;
}

export function PrivacyChoices() {
  const { t } = useT();
  return <button type="button" onClick={() => window.dispatchEvent(new Event('hkk-open-consent'))} className="inline-flex min-h-11 items-center text-sm hover:text-brand-700 hover:underline dark:hover:text-brand-300">{t('consent.choices')}</button>;
}
