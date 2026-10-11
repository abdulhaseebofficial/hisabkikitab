export const CONSENT_KEY = 'hkk-analytics-consent-v1';
export const CONSENT_EVENT = 'hkk-consent-change';
const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
let choiceInMemory = null;
let defaultsSet = false;

export function analyticsConsent() {
  if (typeof window === 'undefined') return null;
  if (choiceInMemory) return choiceInMemory;
  try {
    const saved = JSON.parse(window.localStorage.getItem(CONSENT_KEY));
    if (['granted', 'denied'].includes(saved?.choice) && Number.isFinite(saved?.at) && saved.at <= Date.now() && Date.now() - saved.at < MAX_AGE) return saved.choice;
  } catch { /* Storage can be unavailable; consent then lasts this page only. */ }
  return null;
}

const states = (choice) => ({ analytics_storage: choice === 'granted' ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });

export function initializeConsent() {
  if (typeof window === 'undefined' || defaultsSet) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', states('denied'));
  defaultsSet = true;
  if (analyticsConsent() === 'granted') window.gtag('consent', 'update', states('granted'));
}

export function setAnalyticsConsent(choice, persist = true) {
  if (!['granted', 'denied'].includes(choice)) return;
  initializeConsent();
  choiceInMemory = choice;
  if (persist) {
    try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: Date.now() })); } catch { /* Keep the current page choice in memory. */ }
  }
  const script = document.getElementById('hkk-ga4-script');
  const measurementId = script ? new URL(script.src).searchParams.get('id') : null;
  if (measurementId) window[`ga-disable-${measurementId}`] = choice !== 'granted';
  window.gtag('consent', 'update', states(choice));
  if (choice === 'denied') {
    // Remove GA's first-party cookies after withdrawal without touching sessions.
    const domains = [null, window.location.hostname, `.${window.location.hostname}`];
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/;${domain ? ` domain=${domain};` : ''} SameSite=Lax`;
    }
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function syncStoredConsent() {
  choiceInMemory = null;
  setAnalyticsConsent(analyticsConsent() || 'denied', false);
}

export function resetConsentForTests() { choiceInMemory = null; defaultsSet = false; }
