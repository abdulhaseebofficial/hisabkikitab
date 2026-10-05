import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DEVELOPER } from '../../shared/utils/constants';
import { LAST_UPDATED, trustPages } from './content/pages';
import { trustMetadata } from './metadata';
import TrustContent from './TrustContent';

describe('trust pages', () => {
  it.each(Object.values(trustPages))('renders $path with a clear page heading', (page) => {
    render(<MemoryRouter><TrustContent page={page} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: page.title })).toBeInTheDocument();
    if (page.lastUpdated) expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === `Last updated: ${LAST_UPDATED}`)).toBeInTheDocument();
  });

  it('uses the configured contact address instead of a placeholder', () => {
    render(<MemoryRouter><TrustContent page={trustPages.contact} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Email Hisabki Kitab' })).toHaveAttribute('href', expect.stringContaining(`mailto:${DEVELOPER.email}`));
    expect(screen.getByText(DEVELOPER.email)).toBeInTheDocument();
  });

  it('gives each page unique indexable metadata without Article schema', () => {
    const pages = Object.values(trustPages);
    const metadata = pages.map((page) => trustMetadata(page, 'https://hisabkikitab.com'));
    expect(new Set(metadata.map((item) => item.title)).size).toBe(pages.length);
    expect(new Set(metadata.map((item) => item.tags.find((tag) => tag[1] === 'description')[2])).size).toBe(pages.length);
    for (const [index, item] of metadata.entries()) {
      expect(item.canonical).toBe(`https://hisabkikitab.com${pages[index].path}`);
      expect(item.schema.some((node) => node['@type'] === 'WebPage')).toBe(true);
      expect(item.schema.some((node) => node['@type'] === 'BreadcrumbList')).toBe(true);
      expect(item.schema.some((node) => node['@type'] === 'Article')).toBe(false);
    }
  });

  it('does not promise that Hisabki Kitab never collects or sells data', () => {
    const copy = JSON.stringify(trustPages.privacy).toLowerCase();
    expect(copy).not.toContain('we never collect data');
    expect(copy).not.toContain('we do not sell');
  });
});
