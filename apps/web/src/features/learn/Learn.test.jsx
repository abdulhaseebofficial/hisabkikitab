import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LearnContent from './LearnContent';
import Sidebar, { NAV_ITEMS } from '../../app/layout/Sidebar';
import { articles, categories, articlePath, publicPaths, resolvePage, disclaimer, getArticle, paginate } from './content';
import { pageMetadata } from './metadata';

describe('Learn publishing contract', () => {
  it('resolves every discovered article and category to a unique public URL', () => {
    expect(articles.length).toBeGreaterThanOrEqual(6);
    expect(categories).toHaveLength(10);
    expect(new Set(publicPaths).size).toBe(publicPaths.length);
    for (const path of publicPaths) expect(resolvePage(path).type).not.toBe('not-found');
    expect(resolvePage('/learn/saving/missing').type).toBe('not-found');
    expect(resolvePage(`/learn/earning/${articles[0].slug}`).type).toBe('not-found');
  });

  it('provides canonical and Article metadata with matching dates', () => {
    for (const article of articles) {
      const metadata = pageMetadata(resolvePage(articlePath(article)), 'https://example.com');
      expect(metadata.canonical).toBe(`https://example.com${articlePath(article)}`);
      const schema = metadata.schema.find((item) => item['@type'] === 'Article');
      expect(schema.datePublished).toBe(article.publishedAt);
      expect(schema.dateModified).toBe(article.updatedAt);
      expect(schema.headline).toBe(article.title);
    }
  });

  it('loads an article body only when requested by its detail route', async () => {
    const article = await getArticle('how-to-create-a-monthly-budget');
    expect(article.sections).toHaveLength(8);
    expect(article.readingTime).toBe(articles.find((item) => item.slug === article.slug).readingTime);
    expect(await getArticle('missing-guide')).toBeNull();
  });

  it('paginates long category lists and clamps invalid page numbers', () => {
    const list = Array.from({ length: 20 }, (_, i) => i);
    expect(paginate(list, '2').items).toEqual(list.slice(9, 18));
    expect(paginate(list, '99').page).toBe(3);
    expect(paginate(list, '0').page).toBe(1);
  });

  it('renders working contents anchors, tables, references, and the disclaimer', async () => {
    const article = articles.find((item) => item.slug === 'how-to-create-a-monthly-budget');
    const { container } = render(<MemoryRouter><LearnContent page={resolvePage(articlePath(article))} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(article.title);
    const toc = await screen.findByRole('navigation', { name: 'Table of contents' });
    for (const link of toc.querySelectorAll('a')) {
      expect(container.querySelector(link.getAttribute('href'))).toBeTruthy();
    }
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(await screen.findByText(disclaimer)).toBeInTheDocument();
    expect(screen.getAllByLabelText('Advertisement placeholder')).toHaveLength(2);
  });

  it('keeps Learn between Reports and Settings and active on nested routes', () => {
    const index = NAV_ITEMS.findIndex((item) => item.to === '/learn');
    expect(NAV_ITEMS[index - 1].to).toBe('/reports');
    expect(NAV_ITEMS[index + 1].to).toBe('/settings');
    render(<MemoryRouter initialEntries={['/learn/saving/how-to-save-money-every-month']}><Sidebar open={false} onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Learn/ })).toHaveAttribute('aria-current', 'page');
  });
});
