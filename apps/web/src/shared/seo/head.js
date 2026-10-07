const seoNodes = 'meta[name="description"], meta[name="robots"], meta[name^="twitter:"], meta[property^="og:"], meta[property^="article:"], link[rel="canonical"], script[type="application/ld+json"]';

export function replacePageHead(metadata, marker = 'data-page-seo') {
  document.head.querySelectorAll(seoNodes).forEach((node) => node.remove());
  document.title = metadata.title;
  const nodes = metadata.tags.map(([attribute, key, value]) => {
    const node = document.createElement('meta');
    node.setAttribute(attribute, key);
    node.content = value;
    node.setAttribute(marker, '');
    document.head.appendChild(node);
    return node;
  });
  if (metadata.canonical) {
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = metadata.canonical;
    canonical.setAttribute(marker, '');
    document.head.appendChild(canonical);
    nodes.push(canonical);
  }
  if (metadata.schema?.length) {
    const schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify(metadata.schema);
    schema.setAttribute(marker, '');
    document.head.appendChild(schema);
    nodes.push(schema);
  }
  return () => nodes.forEach((node) => node.remove());
}
