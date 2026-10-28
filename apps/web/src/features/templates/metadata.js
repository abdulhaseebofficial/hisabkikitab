import { canonicalPagePath } from '../../shared/seo/urls';
import { templates } from './content/templatesData';

export const templatePaths = ['/templates'];

export function templatesMetadata(pathname, origin) {
  const isHub = pathname === '/templates' || pathname === '/templates/';

  const page = isHub ? {
    title: 'Free Budget & Expense Tracking Templates (Excel) | HisabKi Kitab',
    description: 'Download free Excel and Google Sheets budget templates tailored for Pakistan. Track monthly household expenses, split roommate bills, and plan savings offline.',
  } : {
    title: 'Templates not found | HisabKi Kitab',
    description: 'The requested financial template could not be found. Explore HisabKi Kitab free spreadsheet templates.',
  };

  const canonical = isHub ? new URL(canonicalPagePath('/templates'), origin).href : null;

  const breadcrumbs = isHub ? [
    { name: 'Home', item: `${origin}/` },
    { name: 'Templates', item: canonical },
  ] : [];

  const schema = isHub ? [
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
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Free Financial Planning & Budget Spreadsheets',
      description: page.description,
      url: canonical,
      hasPart: templates.map((tmpl) => ({
        '@type': 'DigitalDocument',
        name: tmpl.title,
        description: tmpl.description,
        fileFormat: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        url: `${origin}${tmpl.downloadUrl}`,
      })),
    },
  ] : [];

  const ogImage = `${origin}/logo-512.png`;

  return {
    ...page,
    canonical,
    schema,
    tags: [
      ['name', 'description', page.description],
      ['name', 'robots', isHub ? 'index,follow' : 'noindex,follow'],
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
