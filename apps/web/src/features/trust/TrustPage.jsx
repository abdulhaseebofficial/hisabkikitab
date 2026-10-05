import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PublicSiteLayout from '../../app/layout/PublicSiteLayout';
import TrustContent from './TrustContent';
import { trustPageFromPath } from './content/pages';
import { trustMetadata } from './metadata';

function useTrustMetadata(page) {
  useEffect(() => {
    const originalTitle = document.title;
    const existing = [...document.head.querySelectorAll('meta[name="description"], [data-trust-seo], [data-learn-seo], [data-tools-seo], link[rel="canonical"], script[type="application/ld+json"]')];
    existing.forEach((node) => node.remove());
    const configuredOrigin = import.meta.env.VITE_SITE_URL || window.location.origin;
    const metadata = trustMetadata(page, new URL(configuredOrigin).origin);
    document.title = metadata.title;
    const nodes = metadata.tags.map(([attribute, key, value]) => {
      const node = document.createElement('meta');
      node.setAttribute(attribute, key);
      node.content = value;
      node.dataset.trustSeo = '';
      return node;
    });
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = metadata.canonical;
    canonical.dataset.trustSeo = '';
    const schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.dataset.trustSeo = '';
    schema.textContent = JSON.stringify(metadata.schema);
    nodes.push(canonical, schema);
    nodes.forEach((node) => document.head.appendChild(node));
    return () => {
      nodes.forEach((node) => node.remove());
      existing.filter((node) => !node.hasAttribute('data-trust-seo')).forEach((node) => document.head.appendChild(node));
      document.title = originalTitle;
    };
  }, [page.path]);
}

export default function TrustPage() {
  const { pathname } = useLocation();
  const page = trustPageFromPath(pathname);
  useTrustMetadata(page);
  return <PublicSiteLayout><TrustContent page={page} /></PublicSiteLayout>;
}
