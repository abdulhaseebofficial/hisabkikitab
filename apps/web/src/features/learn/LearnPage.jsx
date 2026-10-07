import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import PublicSiteLayout from '../../app/layout/PublicSiteLayout';
import LearnContent from './LearnContent';
import { resolvePage } from './content';
import { pageMetadata } from './metadata';
import { trackEvent } from '../../shared/analytics/analytics';
import { replacePageHead } from '../../shared/seo/head';

function useMetadata(page) {
  useEffect(() => {
    const origin = import.meta.env.VITE_SITE_URL || window.location.origin;
    const metadata = pageMetadata(page, new URL(origin).origin);
    return replacePageHead(metadata, 'data-learn-seo');
  }, [page.path]);
}

export default function LearnPage() {
  const location = useLocation();
  const { user } = useAuth();
  const page = resolvePage(location.pathname);
  useMetadata(page);
  useEffect(() => {
    if (page.type === 'article') trackEvent('article_view', { content_category: page.article.category });
    const featureByPath = { '/dashboard':'dashboard', '/expenses':'expenses', '/income':'income', '/goals':'goals', '/debts':'lending-borrowing', '/budget':'budget', '/reports':'reports', '/advisor':'advisor' };
    const handleClick = (event) => {
      const anchor = event.target.closest?.('a[href]');
      if (!anchor) return;
      const target = new URL(anchor.href, window.location.origin);
      if (target.origin !== window.location.origin) return;
      if (page.type === 'article' && target.pathname.startsWith('/learn/') && target.pathname !== page.path) {
        trackEvent('related_article_clicked', { content_category: page.article.category });
      }
      const feature = featureByPath[target.pathname];
      if (feature) trackEvent('core_feature_cta_clicked', { feature_name: feature });
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [page.path]);
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
    else requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
  }, [location.pathname, location.hash]);
  // Preserve the existing signed-in homepage destination.
  if (page.type === 'home' && user) return <Navigate to="/dashboard" replace />;
  return <PublicSiteLayout><LearnContent page={page} /></PublicSiteLayout>;
}
