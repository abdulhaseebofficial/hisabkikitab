import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PublicSiteLayout from '../../app/layout/PublicSiteLayout';
import TrustContent from './TrustContent';
import { trustPageFromPath } from './content/pages';
import { trustMetadata } from './metadata';
import { replacePageHead } from '../../shared/seo/head';

function useTrustMetadata(page) {
  useEffect(() => {
    const configuredOrigin = import.meta.env.VITE_SITE_URL || window.location.origin;
    const metadata = trustMetadata(page, new URL(configuredOrigin).origin);
    return replacePageHead(metadata, 'data-trust-seo');
  }, [page.path]);
}

export default function TrustPage() {
  const { pathname } = useLocation();
  const page = trustPageFromPath(pathname);
  useTrustMetadata(page);
  return <PublicSiteLayout><TrustContent page={page} /></PublicSiteLayout>;
}
