import { analyticsConsent, initializeConsent } from './consent';
import { canonicalPagePath, isPublicPage, routePath } from '../seo/urls';

const ID_PATTERN = /^G-[A-Z0-9]{10}$/i;
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
  article_view: ['content_category'], calculator_used: ['calculator_name'], calculator_completed: ['calculator_name'], calculator_cta_clicked: ['calculator_name'],
  core_feature_cta_clicked: ['feature_name'], related_article_clicked: ['content_category'],
});

const SAFE_VALUES = Object.freeze({
  finance_mode: new Set(['student', 'householder', 'shared_living']),
  language: new Set(['en', 'roman_ur']),
  role: new Set(['admin', 'viewer']),
  method: new Set(['password', 'google']),
  content_category: new Set(['saving','earning','budgeting','personal-finance','household','shared-living','lending-borrowing','freelancing','small-business','financial-habits']),
  calculator_name: new Set(['budget-calculator','savings-goal-calculator','expense-split-calculator','emergency-fund-calculator','debt-repayment-calculator','net-worth-calculator','freelancer-income-calculator']),
  feature_name: new Set(['dashboard','expenses','income','goals','lending-borrowing','budget','reports','advisor','features-hub','expense-tracker','monthly-budgeting','shared-living-roommates','lending-borrowing-khata']),
});

let initialized = false;
let lastPagePath = null;

const defaultOptions = () => ({
  measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID,
  enabled:
    (import.meta.env.PROD && typeof window !== 'undefined' && window.location.origin === String(import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')) ||
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
  initializeConsent();
  if (initialized || analyticsConsent() !== 'granted' || typeof window === 'undefined' || typeof document === 'undefined' || !analyticsConfigured(options)) {
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
    page_location: `${window.location.origin}${normalizePage(window.location.pathname)}`,
    page_referrer: '',
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  initialized = true;
  return true;
};

export const normalizePage = (pathname) => {
  const path = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  if (path === '/') return '/';
  if (/^\/reset-password\/[^/]+\/?$/i.test(path)) return '/reset-password/:token';
  return isPublicPage(path) ? canonicalPagePath(path) : routePath(path);
};

export const trackPageView = (pathname, title = '') => {
  if (!initialized || analyticsConsent() !== 'granted' || typeof window.gtag !== 'function') return false;
  const pagePath = normalizePage(pathname);
  if (pagePath === lastPagePath) return false;
  lastPagePath = pagePath;
  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: String(title || 'HisabKi Kitab').slice(0, 100),
    page_referrer: '',
  });
  return true;
};

export const trackEvent = (eventName, parameters = {}) => {
  if (!initialized || analyticsConsent() !== 'granted' || typeof window.gtag !== 'function') return false;
  const safe = safeParameters(eventName, parameters);
  if (!safe) return false;
  window.gtag('event', eventName, safe);
  return true;
};

export const setAnalyticsUserProperties = ({ financeMode, language } = {}) => {
  if (!initialized || analyticsConsent() !== 'granted' || typeof window.gtag !== 'function') return false;
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
