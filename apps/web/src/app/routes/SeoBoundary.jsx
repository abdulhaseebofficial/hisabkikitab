import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { replacePageHead } from '../../shared/seo/head';

const publicPath = /^\/$|^\/(?:learn|tools)(?:\/|$)|^\/(?:about|contact|privacy|terms|disclaimer)$/;
const titles = {
  '/login': 'Sign in', '/register': 'Create an account', '/forgot-password': 'Forgot password',
  '/onboarding': 'Set up your account', '/dashboard': 'Dashboard', '/expenses': 'Expenses',
  '/income': 'Income', '/goals': 'Goals', '/debts': 'Lending and borrowing',
  '/budget': 'Budget', '/advisor': 'AI Advisor', '/reports': 'Reports', '/settings': 'Settings',
};

export default function SeoBoundary() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (publicPath.test(pathname)) return undefined;
    const label = pathname.startsWith('/reset-password/') ? 'Reset password' : titles[pathname] || 'Page not found';
    return replacePageHead({
      title: `${label} | Hisab Ki Kitab`,
      tags: [['name', 'robots', 'noindex,follow']],
      schema: [],
    }, 'data-private-seo');
  }, [pathname]);
  return null;
}
