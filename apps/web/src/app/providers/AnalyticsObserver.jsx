import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth';
import useT from '../../shared/i18n/I18nProvider';
import {
  initializeAnalytics,
  normalizePage,
  setAnalyticsUserProperties,
  trackPageView,
} from '../../shared/analytics/analytics';

const TITLES = {
  '/login': 'Login', '/register': 'Register', '/forgot-password': 'Forgot password',
  '/reset-password/:token': 'Reset password', '/onboarding': 'Onboarding',
  '/dashboard': 'Dashboard', '/expenses': 'Expenses', '/income': 'Income',
  '/goals': 'Goals', '/debts': 'Udhaar', '/budget': 'Budget', '/advisor': 'AI advisor',
  '/reports': 'Reports', '/settings': 'Settings',
};

export default function AnalyticsObserver() {
  const location = useLocation();
  const { user } = useAuth();
  const { language } = useT();

  useEffect(() => { initializeAnalytics(); }, []);
  useEffect(() => {
    const normalized = normalizePage(location.pathname);
    const title = normalized === '/dashboard' && user?.financeMode === 'shared_living'
      ? 'Shared Living'
      : TITLES[normalized] || 'Not found';
    trackPageView(location.pathname, title);
  }, [location.pathname, user?.financeMode]);
  useEffect(() => {
    setAnalyticsUserProperties({ financeMode: user?.financeMode, language });
  }, [user?.financeMode, language]);

  return null;
}

