export function trustMetadata(page, origin) {
  const canonical = new URL(page.path, origin).href;
  const title = `${page.title} | Hisab Ki Kitab`;
  const breadcrumbs = [
    { name: 'Home', item: `${origin}/` },
    { name: page.title, item: canonical },
  ];
  return {
    title,
    canonical,
    schema: [
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })) },
      { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: page.description, url: canonical, inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: 'Hisab Ki Kitab', url: origin } },
    ],
    tags: [
      ['name', 'description', page.description],
      ['name', 'robots', 'index,follow'],
      ['property', 'og:title', title],
      ['property', 'og:description', page.description],
      ['property', 'og:url', canonical],
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', 'Hisab Ki Kitab'],
      ['name', 'twitter:card', 'summary'],
      ['name', 'twitter:title', title],
      ['name', 'twitter:description', page.description],
    ],
  };
}
