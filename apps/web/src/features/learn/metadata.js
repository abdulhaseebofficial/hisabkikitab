export function pageMetadata(page, origin) {
  const canonical = page.type === 'not-found' ? null : new URL(page.path, origin).href;
  const title = `${page.title}${page.type === 'home' ? '' : ' | Hisab Ki Kitab'}`;
  const crumbs = [{ name: 'Home', item: `${origin}/` }, ...(page.type === 'home' ? [] : [{ name: 'Learn', item: `${origin}/learn` }]),
    ...(page.category ? [{ name: page.category.name, item: `${origin}/learn/${page.category.slug}` }] : []),
    ...(page.article ? [{ name: page.title, item: canonical }] : [])];
  const schema = page.type === 'not-found' ? [] : [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: page.description, url: canonical, inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: 'Hisab Ki Kitab', url: origin } },
    ...(page.type === 'home' ? [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Hisab Ki Kitab', url: `${origin}/`, inLanguage: 'en' },
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'Hisab Ki Kitab', url: `${origin}/` },
    ] : []),
    ...(crumbs.length > 1 ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })) }] : []),
  ];
  if (page.article) schema.push({ '@context': 'https://schema.org', '@type': 'Article', headline: page.title, description: page.description,
    mainEntityOfPage: canonical, datePublished: page.article.publishedAt, dateModified: page.article.updatedAt,
    ...(page.article.image?.src ? { image: new URL(page.article.image.src, origin).href } : {}),
    author: { '@type': 'Organization', name: page.article.author }, publisher: { '@type': 'Organization', name: 'Hisab Ki Kitab' }, articleSection: page.category.name, inLanguage: 'en' });
  if (page.article?.faqs?.length) schema.push({ '@context':'https://schema.org','@type':'FAQPage','mainEntity':page.article.faqs.map((faq)=>({'@type':'Question','name':faq.question,'acceptedAnswer':{'@type':'Answer','text':faq.answer}})) });
  return { title, canonical, schema, tags: [
    ['name', 'description', page.description], ['name', 'robots', page.type === 'not-found' || page.type === 'category' && !page.hasArticles ? 'noindex,follow' : 'index,follow'],
    ['property', 'og:title', title], ['property', 'og:description', page.description],
    ...(canonical ? [['property', 'og:url', canonical]] : []),
    ['property', 'og:type', page.article ? 'article' : 'website'], ['property', 'og:site_name', 'Hisab Ki Kitab'],
    ['name', 'twitter:card', 'summary'], ['name', 'twitter:title', title], ['name', 'twitter:description', page.description],
    ...(page.article ? [['property', 'article:published_time', page.article.publishedAt], ['property', 'article:modified_time', page.article.updatedAt], ['property', 'article:author', page.article.author], ['property', 'article:section', page.category.name]] : []),
  ] };
}
