import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth';
import useT from '../../shared/i18n/I18nProvider';
import {
  initializeAnalytics,
  normalizePage,
  setAnalyticsUserProperties,
  trackPageView,
} from '../../shared/analytics/analytics';
import { analyticsConsent, CONSENT_EVENT } from '../../shared/analytics/consent';
import { routePath } from '../../shared/seo/urls';

const TITLES = {
  '/': 'Personal financial management',
  '/login': 'Login', '/register': 'Register', '/forgot-password': 'Forgot password',
  '/reset-password/:token': 'Reset password', '/onboarding': 'Onboarding',
  '/dashboard': 'Dashboard', '/expenses': 'Expenses', '/income': 'Income',
  '/goals': 'Goals', '/debts': 'Udhaar', '/budget': 'Budget', '/advisor': 'AI advisor',
  '/reports': 'Reports', '/settings': 'Settings',
  '/tools': 'Financial tools',
};

export default function AnalyticsObserver() {
  const location = useLocation();
  const { user } = useAuth();
  const { language } = useT();
  const [consent, setConsent] = useState(analyticsConsent);

  useEffect(() => {
    const changed = () => setConsent(analyticsConsent());
    window.addEventListener(CONSENT_EVENT, changed);
    return () => window.removeEventListener(CONSENT_EVENT, changed);
  }, []);
  useEffect(() => { if (consent === 'granted') initializeAnalytics(); }, [consent]);
  useEffect(() => {
    if (consent !== 'granted') return undefined;
    let cancelled = false;
    // A lazy route may still display the previous page's title. Resolve the
    // target route's metadata before sending its single manual pageview.
    const record = async () => {
      const normalized = routePath(normalizePage(location.pathname));
      let title = normalized === '/dashboard' && user?.financeMode === 'shared_living'
        ? 'Shared Living' : TITLES[normalized] || 'Page not found';
      if (normalized === '/' || normalized.startsWith('/learn')) {
        const { resolvePage } = await import('../../features/learn/content');
        const page = resolvePage(normalized);
        title = `${page.title}${page.type === 'home' ? '' : ' | HisabKi Kitab'}`;
      } else if (normalized === '/tools' || normalized.startsWith('/tools/')) {
        const { tools } = await import('../../features/tools/content/calculations');
        const tool = tools.find(item => `/tools/${item.slug}` === normalized);
        title = tool ? `${tool.title} | HisabKi Kitab` : normalized === '/tools' ? 'Financial Calculators & Tools | HisabKi Kitab' : 'Calculator not found | HisabKi Kitab';
      } else if (/^\/(about|contact|privacy|terms|disclaimer)$/.test(normalized)) {
        const { trustPageFromPath } = await import('../../features/trust/content/pages');
        title = `${trustPageFromPath(normalized).title} | HisabKi Kitab`;
      }
      if (!cancelled) trackPageView(location.pathname, title);
    };
    record().catch(() => { if (!cancelled) trackPageView(location.pathname, TITLES[routePath(location.pathname)] || 'HisabKi Kitab'); });
    return () => { cancelled = true; };
  }, [location.pathname, user?.financeMode, consent]);
  useEffect(() => {
    setAnalyticsUserProperties({ financeMode: user?.financeMode, language });
  }, [user?.financeMode, language, consent]);

  return null;
}
