export const routePath = (path) => String(path || '/').replace(/\/+$/, '') || '/';

export const isPublicPage = (path) => /^\/$|^\/(?:learn|tools)(?:\/|$)|^\/(?:about|contact|privacy|terms|disclaimer)\/?$/.test(path);
const isAuthPage = (path) => /^\/(?:login|register|forgot-password)\/?$/.test(path);

// Only page URLs use this helper. Files, APIs and private application routes
// retain their existing behavior; search parameters and fragments are preserved.
export function canonicalPagePath(path) {
  const match = String(path || '/').match(/^([^?#]*)(.*)$/);
  return `${routePath(match[1]) === '/' ? '/' : `${routePath(match[1])}/`}${match[2]}`;
}

export function publicPageHref(to) {
  if (typeof to === 'string' && to.startsWith('/') && !to.startsWith('//')) {
    const path = to.split(/[?#]/, 1)[0];
    return isPublicPage(path) || isAuthPage(path) ? canonicalPagePath(to) : to;
  }
  if (to && typeof to === 'object' && (isPublicPage(to.pathname || '') || isAuthPage(to.pathname || ''))) {
    return { ...to, pathname: canonicalPagePath(to.pathname) };
  }
  return to;
}
