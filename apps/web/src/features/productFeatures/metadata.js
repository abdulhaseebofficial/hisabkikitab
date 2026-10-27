import { canonicalPagePath } from '../../shared/seo/urls';
import { features } from './content/featuresData';

export const featurePaths = [
  '/features',
  ...features.map((feature) => `/features/${feature.slug}`),
];

export function featureMetadata(feature, pathname, origin) {
  const isHub = pathname === '/features' || pathname === '/features/';
  const missing = !feature && !isHub;

  const page = feature ? {
    title: `${feature.metaTitle || `${feature.title} | HisabKi Kitab`}`,
    description: feature.metaDescription,
  } : isHub ? {
    title: 'Financial Management Features | HisabKi Kitab',
    description: 'Explore HisabKi Kitab features: personal income and expense tracking, monthly budgeting, roommate expense splitting, and personal khata records in Pakistan.',
  } : {
    title: 'Feature not found | HisabKi Kitab',
    description: 'The requested feature page could not be found. Explore HisabKi Kitab financial management features.',
  };

  const canonical = missing ? null : new URL(canonicalPagePath(feature ? `/features/${feature.slug}` : '/features'), origin).href;

  const breadcrumbs = isHub ? [
    { name: 'Home', item: `${origin}/` },
    { name: 'Features', item: canonical },
  ] : feature ? [
    { name: 'Home', item: `${origin}/` },
    { name: 'Features', item: `${origin}/features/` },
    { name: feature.title, item: canonical },
  ] : [];

  const schema = missing ? [] : [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      description: page.description,
      url: canonical,
      inLanguage: 'en',
      isPartOf: {
        '@type': 'WebSite',
        name: 'HisabKi Kitab',
        url: `${origin}/`,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        ...item,
      })),
    },
  ];

  const ogImage = `${origin}/logo-512.png`;

  return {
    ...page,
    canonical,
    schema,
    tags: [
      ['name', 'description', page.description],
      ['name', 'robots', missing ? 'noindex,follow' : 'index,follow'],
      ['property', 'og:title', page.title],
      ['property', 'og:description', page.description],
      ...(canonical ? [['property', 'og:url', canonical]] : []),
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', 'HisabKi Kitab'],
      ['property', 'og:image', ogImage],
      ['name', 'twitter:card', 'summary'],
      ['name', 'twitter:title', page.title],
      ['name', 'twitter:description', page.description],
      ['name', 'twitter:image', ogImage],
    ],
  };
}
