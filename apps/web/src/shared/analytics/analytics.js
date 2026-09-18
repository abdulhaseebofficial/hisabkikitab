const ID_PATTERN = /^G-[A-Z0-9]+$/i;
const SCRIPT_ID = 'hkk-ga4-script';

const EVENT_PARAMETERS = Object.freeze({
  expense_created: [], expense_updated: [], expense_deleted: [],
  income_created: [], income_updated: [], income_deleted: [],
  budget_created: [], budget_updated: [], budget_plan_applied: [],
  goal_created: [], goal_updated: [], goal_completed: [],
  debt_created: [], debt_updated: [], debt_payment_recorded: [], debt_settled: [], debt_cancelled: [], debt_deleted: [],
  finance_mode_changed: ['finance_mode'], language_changed: ['language'],
  shared_group_created: ['role'], shared_group_joined: ['role'],
  shared_expense_created: ['role'], shared_bill_created: ['role'],
  contribution_added: ['role'], shared_member_added: ['role'], shared_month_changed: ['role'],
  sign_up_completed: ['method'], login_completed: ['method'], logout_completed: [],
});

const SAFE_VALUES = Object.freeze({
  finance_mode: new Set(['student', 'householder', 'shared_living']),
  language: new Set(['en', 'roman_ur']),
  role: new Set(['admin', 'viewer']),
  method: new Set(['password', 'google']),
});

let initialized = false;
let lastPagePath = null;

const defaultOptions = () => ({
  measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID,
  enabled:
    import.meta.env.PROD ||
    String(import.meta.env.VITE_GA_ENABLE_LOCAL || '').toLowerCase() === 'true',
});

const safeParameters = (eventName, parameters) => {
  const allowed = EVENT_PARAMETERS[eventName];
  if (!allowed) return null;
  return Object.fromEntries(
    allowed
      .filter((key) => SAFE_VALUES[key]?.has(parameters?.[key]))
      .map((key) => [key, parameters[key]])
  );
};

export const analyticsConfigured = (options = defaultOptions()) =>
  Boolean(options.enabled && ID_PATTERN.test(String(options.measurementId || '').trim()));

export const initializeAnalytics = (options = defaultOptions()) => {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined' || !analyticsConfigured(options)) {
    return false;
  }

  const measurementId = String(options.measurementId).trim().toUpperCase();
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };

  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  initialized = true;
  return true;
};

export const normalizePage = (pathname) => {
  const path = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  if (path === '/') return '/dashboard';
  if (/^\/reset-password\/[^/]+\/?$/i.test(path)) return '/reset-password/:token';
  return path;
};

export const trackPageView = (pathname, title = '') => {
  if (!initialized || typeof window.gtag !== 'function') return false;
  const pagePath = normalizePage(pathname);
  if (pagePath === lastPagePath) return false;
  lastPagePath = pagePath;
  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: String(title || 'Hisab Ki Kitab').slice(0, 100),
    page_referrer: '',
  });
  return true;
};

export const trackEvent = (eventName, parameters = {}) => {
  if (!initialized || typeof window.gtag !== 'function') return false;
  const safe = safeParameters(eventName, parameters);
  if (!safe) return false;
  window.gtag('event', eventName, safe);
  return true;
};

export const setAnalyticsUserProperties = ({ financeMode, language } = {}) => {
  if (!initialized || typeof window.gtag !== 'function') return false;
  const properties = {};
  if (SAFE_VALUES.finance_mode.has(financeMode)) properties.finance_mode = financeMode;
  if (SAFE_VALUES.language.has(language)) properties.app_language = language;
  if (!Object.keys(properties).length) return false;
  window.gtag('set', 'user_properties', properties);
  return true;
};

export const __resetAnalyticsForTests = () => {
  initialized = false;
  lastPagePath = null;
};
