import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import LearnContent from '../features/learn/LearnContent';
import PublicHeader from './layout/PublicHeader';
import { getArticle, publicPaths, indexablePaths, resolvePage } from '../features/learn/content';
import { pageMetadata } from '../features/learn/metadata';
import { ToolsContent, toolsMetadata } from '../features/tools/pages/ToolsPage';
import { tools } from '../features/tools/content/calculations';
import TrustContent from '../features/trust/TrustContent';
import PublicFooter from './layout/PublicFooter';
import { trustPaths, trustPageFromPath } from '../features/trust/content/pages';
import { trustMetadata } from '../features/trust/metadata';

export { publicPaths };
export const toolPaths = ['/tools', ...tools.map((tool) => `/tools/${tool.slug}`)];
export { trustPaths };
export const sitemapPaths = [...indexablePaths, ...toolPaths, ...trustPaths];
function validateArticle(article) {
  if (!article.sections?.length || !article.sources?.length || article.sections.some((section) =>
    !section.blocks?.length || section.blocks.some((block) =>
      !['paragraph', 'subheading', 'list', 'steps', 'table', 'calculation', 'tip'].includes(block.type)))) {
    throw new Error(`Invalid Learn article body: ${article.slug}`);
  }
}
export function renderTool(path, origin) {
  const tool = tools.find((item) => `/tools/${item.slug}` === path);
  const page = toolsMetadata(tool, path, origin);
  const html = renderToString(<StaticRouter location={path}><PublicHeader /><main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><ToolsContent tool={tool} /></main><div className="mx-auto max-w-6xl px-4 sm:px-6"><PublicFooter /></div></StaticRouter>);
  return { metadata: { title: page.title, canonical: page.canonical, schema: page.schema, tags: page.tags }, html };
}
export async function render(path, origin) {
  const page = resolvePage(path);
  if (page.article) {
    const article = await getArticle(page.article.slug);
    if (!article) throw new Error(`Missing Learn article body: ${page.article.slug}`);
    validateArticle(article);
    page.article = article;
  }
  return { metadata: pageMetadata(page, origin), html: renderToString(<StaticRouter location={path}><PublicHeader /><main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><LearnContent page={page} /></main><div className="mx-auto max-w-6xl px-4 sm:px-6"><PublicFooter /></div></StaticRouter>) };
}
export function renderTrust(path, origin) {
  const page = trustPageFromPath(path);
  if (!page) throw new Error(`Unknown public trust route: ${path}`);
  const metadata = trustMetadata(page, origin);
  const html = renderToString(<StaticRouter location={path}><PublicHeader /><main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><TrustContent page={page} /></main><div className="mx-auto max-w-6xl px-4 sm:px-6"><PublicFooter /></div></StaticRouter>);
  return { metadata, html };
}
