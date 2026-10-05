export function trustMetadata(page, origin) {
  const canonical = new URL(page.path, origin).href;
  const title = `${page.title} | Hisabki Kitab`;
  const breadcrumbs = [
    { name: 'Home', item: origin },
    { name: page.title, item: canonical },
  ];
  return {
    title,
    canonical,
    schema: [
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })) },
      { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: page.description, url: canonical, isPartOf: { '@type': 'WebSite', name: 'Hisabki Kitab', url: origin } },
    ],
    tags: [
      ['name', 'description', page.description],
      ['name', 'robots', 'index,follow'],
      ['property', 'og:title', title],
      ['property', 'og:description', page.description],
      ['property', 'og:url', canonical],
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', 'Hisabki Kitab'],
    ],
  };
}
