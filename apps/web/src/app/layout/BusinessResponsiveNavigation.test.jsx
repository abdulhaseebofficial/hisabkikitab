import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar, { BUSINESS_NAV_ITEMS, ESSENTIAL_MOBILE_BUSINESS_NAV_ITEMS, DESKTOP_ONLY_BUSINESS_ROUTES } from './Sidebar';
import { useBusiness } from '../../features/business';

vi.mock('../../features/business', () => ({
  useBusiness: vi.fn(),
}));

describe('Business Mode Desktop vs Mobile Responsive Navigation', () => {
  beforeEach(() => {
    vi.mocked(useBusiness).mockReturnValue({
      isBusinessMode: true,
      setMode: vi.fn(),
      businesses: [{ id: 'biz-1', name: 'Test Biz' }],
      activeBusiness: { id: 'biz-1', name: 'Test Biz' },
      activeBusinessId: 'biz-1',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports accurate classification of desktop-only and essential business routes', () => {
    expect(DESKTOP_ONLY_BUSINESS_ROUTES).toEqual([
      '/business/procurement',
      '/business/accounts',
      '/business/payroll',
      '/business/budgets',
      '/business/reports',
    ]);

    expect(BUSINESS_NAV_ITEMS).toHaveLength(13);
    expect(ESSENTIAL_MOBILE_BUSINESS_NAV_ITEMS).toHaveLength(8);
  });

  it('desktop rail renders all 13 authorized business items including advanced workspaces', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/business']}>
        <Sidebar open={false} onClose={() => {}} mode="business" />
      </MemoryRouter>
    );

    // Desktop rail is the first <aside>
    const desktopRail = container.querySelector('aside.lg\\:block, aside.hidden');
    expect(desktopRail).toBeInTheDocument();

    const links = desktopRail.querySelectorAll('a[href^="/business"]');
    const hrefs = Array.from(links).map((l) => l.getAttribute('href'));

    // All 13 items present
    expect(hrefs).toContain('/business');
    expect(hrefs).toContain('/business/pos');
    expect(hrefs).toContain('/business/sales');
    expect(hrefs).toContain('/business/inventory');
    expect(hrefs).toContain('/business/procurement');
    expect(hrefs).toContain('/business/khata');
    expect(hrefs).toContain('/business/expenses');
    expect(hrefs).toContain('/business/recurring');
    expect(hrefs).toContain('/business/accounts');
    expect(hrefs).toContain('/business/payroll');
    expect(hrefs).toContain('/business/budgets');
    expect(hrefs).toContain('/business/reports');
    expect(hrefs).toContain('/business/settings');
  });

  it('mobile drawer renders ONLY 8 essential business items and filters out desktop-only workspaces', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/business']}>
        <Sidebar open={true} onClose={() => {}} mode="business" />
      </MemoryRouter>
    );

    // Mobile drawer is the dialog <aside>
    const drawer = container.querySelector('aside[role="dialog"]');
    expect(drawer).toBeInTheDocument();

    const links = drawer.querySelectorAll('a[href^="/business"]');
    const hrefs = Array.from(links).map((l) => l.getAttribute('href'));

    // Essential items present
    expect(hrefs).toContain('/business');
    expect(hrefs).toContain('/business/pos');
    expect(hrefs).toContain('/business/sales');
    expect(hrefs).toContain('/business/inventory');
    expect(hrefs).toContain('/business/khata');
    expect(hrefs).toContain('/business/expenses');
    expect(hrefs).toContain('/business/recurring');
    expect(hrefs).toContain('/business/settings');

    // Desktop-only advanced workspaces are NOT in mobile drawer
    expect(hrefs).not.toContain('/business/procurement');
    expect(hrefs).not.toContain('/business/accounts');
    expect(hrefs).not.toContain('/business/payroll');
    expect(hrefs).not.toContain('/business/budgets');
    expect(hrefs).not.toContain('/business/reports');

    // Informative Desktop Workspaces notice is shown
    expect(screen.getByText('Desktop Workspaces')).toBeInTheDocument();
  });

  it('strictly preserves Student and Householder mode navigation on mobile drawer without alteration', () => {
    vi.mocked(useBusiness).mockReturnValue({
      isBusinessMode: false,
      setMode: vi.fn(),
      businesses: [],
      activeBusiness: null,
      activeBusinessId: null,
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar open={true} onClose={() => {}} mode="student" />
      </MemoryRouter>
    );

    const drawer = container.querySelector('aside[role="dialog"]');
    const links = drawer.querySelectorAll('a[href]');
    const hrefs = Array.from(links).map((l) => l.getAttribute('href'));

    // Original 10 items preserved
    expect(hrefs).toEqual([
      '/dashboard',
      '/expenses',
      '/income',
      '/goals',
      '/debts',
      '/budget',
      '/advisor',
      '/reports',
      '/learn',
      '/settings',
    ]);

    // No business items or business notice present
    expect(screen.queryByText('Desktop Workspaces')).not.toBeInTheDocument();
  });

  it('strictly preserves Shared Living mode navigation without alteration', () => {
    vi.mocked(useBusiness).mockReturnValue({
      isBusinessMode: false,
      setMode: vi.fn(),
      businesses: [],
      activeBusiness: null,
      activeBusinessId: null,
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar open={true} onClose={() => {}} mode="shared_living" />
      </MemoryRouter>
    );

    const drawer = container.querySelector('aside[role="dialog"]');
    const links = drawer.querySelectorAll('a[href]');
    const hrefs = Array.from(links).map((l) => l.getAttribute('href'));

    expect(hrefs).toContain('/learn');
    expect(hrefs).toContain('/settings');
    expect(screen.queryByText('Desktop Workspaces')).not.toBeInTheDocument();
  });
});
