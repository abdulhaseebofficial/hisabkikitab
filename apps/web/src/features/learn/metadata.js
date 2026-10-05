export function pageMetadata(page, origin) {
  const canonical = new URL(page.path, origin).href;
  const title = `${page.title}${page.type === 'home' ? '' : ' | Hisabki Kitab'}`;
  const crumbs = [{ name: 'Home', item: origin }, ...(page.type === 'home' ? [] : [{ name: 'Learn', item: `${origin}/learn` }]),
    ...(page.category ? [{ name: page.category.name, item: `${origin}/learn/${page.category.slug}` }] : []),
    ...(page.article ? [{ name: page.title, item: canonical }] : [])];
  const schema = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })) }];
  if (page.article) schema.push({ '@context': 'https://schema.org', '@type': 'Article', headline: page.title, description: page.description,
    mainEntityOfPage: canonical, datePublished: page.article.publishedAt, dateModified: page.article.updatedAt,
    ...(page.article.image?.src ? { image: new URL(page.article.image.src, origin).href } : {}),
    author: { '@type': 'Organization', name: page.article.author }, publisher: { '@type': 'Organization', name: 'Hisabki Kitab' }, articleSection: page.category.name, inLanguage: 'en' });
  if (page.article?.faqs?.length) schema.push({ '@context':'https://schema.org','@type':'FAQPage','mainEntity':page.article.faqs.map((faq)=>({'@type':'Question','name':faq.question,'acceptedAnswer':{'@type':'Answer','text':faq.answer}})) });
  return { title, canonical, schema, tags: [
    ['name', 'description', page.description], ['name', 'robots', page.type === 'not-found' ? 'noindex,follow' : 'index,follow'],
    ['property', 'og:title', title], ['property', 'og:description', page.description], ['property', 'og:url', canonical],
    ['property', 'og:type', page.article ? 'article' : 'website'], ['property', 'og:site_name', 'Hisabki Kitab'],
    ...(page.article ? [['property', 'article:published_time', page.article.publishedAt], ['property', 'article:modified_time', page.article.updatedAt], ['property', 'article:author', page.article.author], ['property', 'article:section', page.category.name]] : []),
  ] };
}
