import { categories } from './categories';
import articleIndex from './articles-index.json';

// Keep article bodies out of the listing and shared Learn chunk. Vite emits one
// cacheable async module per guide; detail routes fetch only the selected body.
const articleModules = import.meta.glob('./articles/*.json', { import: 'default' });
export { categories };
export const articlePath = (article) => `/learn/${article.category}/${article.slug}`;
export const articles = [...articleIndex].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title));
export const paginate = (items, requestedPage, pageSize = 9) => {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const parsed = Number.parseInt(requestedPage || '1', 10);
  const page = Number.isFinite(parsed) ? Math.min(pages, Math.max(1, parsed)) : 1;
  return { page, pages, items: items.slice((page - 1) * pageSize, page * pageSize) };
};
export const getArticle = async (slug) => {
  const load = articleModules[`./articles/${slug}.json`];
  if (!load) return null;
  const summary = articles.find((item) => item.slug === slug);
  if (!summary) return null;
  const article = await load();
  return { ...article, readingTime: summary.readingTime };
};

// Fail the build instead of publishing broken category links or ambiguous URLs.
const paths = new Set();
for (const article of articles) {
  const path = articlePath(article);
  if (!categories.some((category) => category.slug === article.category)
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) || paths.has(path)
      || !article.title || !article.excerpt || !article.author
      || !/^\d{4}-\d{2}-\d{2}$/.test(article.publishedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(article.updatedAt)
      || article.updatedAt < article.publishedAt || (article.sections && !article.sources?.length)) {
    throw new Error(`Invalid Learn article: ${path}`);
  }
  const ids = new Set(['sources']);
  for (const section of article.sections || []) {
    if (!section.title || !/^[a-z0-9-]+$/.test(section.id) || ids.has(section.id)) throw new Error(`Invalid section in ${path}`);
    ids.add(section.id);
    for (const block of section.blocks) {
      if (!['paragraph', 'subheading', 'list', 'steps', 'table', 'calculation', 'tip'].includes(block.type)) throw new Error(`Unknown block in ${path}`);
    }
  }
  paths.add(path);
}

export const learnTitle = 'Learn to Save, Earn & Manage Money Better';
export const learnDescription = 'Practical guides from Hisabki Kitab about saving, earning, budgeting, household finances, and managing money.';
export const disclaimer = 'This content is for educational and informational purposes only and should not be considered personalized financial, investment, tax, or legal advice.';

export function resolvePage(pathname) {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/') return { type: 'home', path, title: 'Hisabki Kitab — Manage Your Money Smarter', description: 'Manage, track and understand your money with budgeting, expense tracking, financial goals, and shared household tools.' };
  if (path === '/learn') return { type: 'index', path, title: learnTitle, description: learnDescription };
  const category = categories.find((item) => path === `/learn/${item.slug}`);
  if (category) return { type: 'category', path, category, title: `${category.name} Guides`, description: category.description };
  const article = articles.find((item) => articlePath(item) === path);
  if (article) return { type: 'article', path, article, category: categories.find((item) => item.slug === article.category), title: article.title, description: article.excerpt };
  return { type: 'not-found', path, title: 'Guide not found', description: 'Explore practical money guides in the Hisabki Kitab learning library.' };
}

export const publicPaths = ['/', '/learn', ...categories.map((item) => `/learn/${item.slug}`), ...articles.map(articlePath)];
