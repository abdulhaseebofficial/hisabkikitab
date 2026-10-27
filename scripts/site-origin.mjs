// Production currently redirects the apex domain to www. Keep every generated
// and client-rendered canonical on the destination even if a deployment still
// provides the older apex VITE_SITE_URL value.
export function canonicalSiteOrigin(configuredOrigin) {
  if (!configuredOrigin) return '';
  const parsed = new URL(configuredOrigin);
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('VITE_SITE_URL must be an HTTPS origin without a path, query, or fragment.');
  }
  if (parsed.hostname === 'hisabkikitab.com') parsed.hostname = 'www.hisabkikitab.com';
  return parsed.origin;
}
