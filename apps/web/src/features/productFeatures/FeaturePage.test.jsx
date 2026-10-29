import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { features } from './content/featuresData';
import { featureMetadata } from './metadata';
import { FeatureContent } from './pages/FeaturePage';

describe('Phase 3 product feature landing pages', () => {
  it('renders features hub with core heading and links to all 4 features', () => {
    render(
      <MemoryRouter>
        <FeatureContent isHub={true} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /Smart Financial Tools for Everyday Life in Pakistan/i })).toBeInTheDocument();

    for (const feature of features) {
      expect(screen.getByRole('heading', { level: 2, name: feature.title })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: new RegExp(`Explore ${feature.navLabel}`, 'i') })).toHaveAttribute(
        'href',
        `/features/${feature.slug}/`
      );
    }
  });

  it.each(features)('renders $title with single H1, worked example, and registration CTA', (feature) => {
    render(
      <MemoryRouter>
        <FeatureContent feature={feature} isHub={false} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: feature.h1 })).toBeInTheDocument();
    expect(screen.getByText(feature.workedExample.heading)).toBeInTheDocument();
    expect(screen.getByText(feature.workedExample.summary)).toBeInTheDocument();

    // Verify registration links
    const registerLinks = screen.getAllByRole('link', { name: new RegExp(feature.heroCta, 'i') });
    expect(registerLinks[0]).toHaveAttribute('href', '/register/');
  });

  it('generates unique canonicals and schema for hub and all feature pages', () => {
    const origin = 'https://www.hisabkikitab.com';
    const hubMeta = featureMetadata(null, '/features', origin);
    expect(hubMeta.canonical).toBe(`${origin}/features/`);
    expect(hubMeta.schema.some((s) => s['@type'] === 'WebPage')).toBe(true);
    expect(hubMeta.schema.some((s) => s['@type'] === 'BreadcrumbList')).toBe(true);

    const featureMetas = features.map((f) => featureMetadata(f, `/features/${f.slug}`, origin));
    const titles = new Set([hubMeta.title, ...featureMetas.map((m) => m.title)]);
    const descs = new Set([hubMeta.description, ...featureMetas.map((m) => m.description)]);

    expect(titles.size).toBe(5);
    expect(descs.size).toBe(5);

    for (const meta of featureMetas) {
      expect(meta.canonical).toMatch(new RegExp(`^${origin}/features/[^/]+/$`));
      expect(meta.schema.some((s) => s['@type'] === 'WebPage')).toBe(true);
      expect(meta.schema.some((s) => s['@type'] === 'BreadcrumbList')).toBe(true);
      expect(meta.schema.some((s) => s['@type'] === 'Article')).toBe(false);
      expect(meta.schema.some((s) => s['@type'] === 'WebApplication')).toBe(false);
    }
  });

  it('renders free spreadsheet templates card in features hub linking to /templates/', () => {
    render(
      <MemoryRouter>
        <FeatureContent isHub={true} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 2, name: /Free Spreadsheet Templates/i })).toBeInTheDocument();
    const templateLink = screen.getByRole('link', { name: /Download Free Templates/i });
    expect(templateLink).toHaveAttribute('href', '/templates/');
  });
});
