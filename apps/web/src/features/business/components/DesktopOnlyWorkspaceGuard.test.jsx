import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DesktopOnlyWorkspaceGuard from './DesktopOnlyWorkspaceGuard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../BusinessContext', () => ({
  useBusiness: () => ({
    activeBusiness: { id: 'biz-1', name: 'Al-Madina Traders' },
    activeBusinessId: 'biz-1',
  }),
}));

vi.mock('../../../shared/i18n/I18nProvider', () => ({
  default: () => ({
    t: (k, fallback) => fallback || k,
  }),
}));

describe('DesktopOnlyWorkspaceGuard', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    mockNavigate.mockClear();
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
  });

  it('renders children workspace directly on desktop (>= 1024px)', () => {
    window.innerWidth = 1200;
    render(
      <MemoryRouter>
        <DesktopOnlyWorkspaceGuard featureName="General Ledger">
          <div data-testid="desktop-workspace-content">Full GL Table</div>
        </DesktopOnlyWorkspaceGuard>
      </MemoryRouter>
    );

    expect(screen.getByTestId('desktop-workspace-content')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-only-guard-notice')).not.toBeInTheDocument();
  });

  it('renders children workspace on tablet (768px <= width < 1024px)', () => {
    window.innerWidth = 800;
    render(
      <MemoryRouter>
        <DesktopOnlyWorkspaceGuard featureName="General Ledger">
          <div data-testid="desktop-workspace-content">Tablet Workspace View</div>
        </DesktopOnlyWorkspaceGuard>
      </MemoryRouter>
    );

    expect(screen.getByTestId('desktop-workspace-content')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-only-guard-notice')).not.toBeInTheDocument();
  });

  it('renders branded notice on mobile (< 768px) and hides children', () => {
    window.innerWidth = 375;
    render(
      <MemoryRouter>
        <DesktopOnlyWorkspaceGuard
          featureName="Advanced Procurement"
          essentialSummary={<p>3 Pending POs</p>}
          quickActionLink={{ to: '/business/khata', label: 'View Supplier Khata' }}
        >
          <div data-testid="desktop-workspace-content">Procurement Table</div>
        </DesktopOnlyWorkspaceGuard>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('desktop-workspace-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('desktop-only-guard-notice')).toBeInTheDocument();
    expect(screen.getByText('Advanced Procurement')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This advanced Business Mode feature is available on Desktop or Laptop. Please open HisabKi Kitab on a larger screen to use this workspace.'
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('essential-mobile-summary')).toHaveTextContent('3 Pending POs');
    expect(screen.getByText('Al-Madina Traders')).toBeInTheDocument();
  });

  it('navigates back to business dashboard when primary button is clicked on mobile', () => {
    window.innerWidth = 400;
    render(
      <MemoryRouter>
        <DesktopOnlyWorkspaceGuard featureName="Staff & Payroll">
          <div>Payroll Table</div>
        </DesktopOnlyWorkspaceGuard>
      </MemoryRouter>
    );

    const backButton = screen.getByRole('button', { name: /Back to Business Dashboard/i });
    fireEvent.click(backButton);
    expect(mockNavigate).toHaveBeenCalledWith('/business');
  });

  it('reactively switches between workspace and notice when resized', () => {
    window.innerWidth = 1200;
    render(
      <MemoryRouter>
        <DesktopOnlyWorkspaceGuard featureName="Financial Reports">
          <div data-testid="report-content">P&L Table</div>
        </DesktopOnlyWorkspaceGuard>
      </MemoryRouter>
    );

    expect(screen.getByTestId('report-content')).toBeInTheDocument();

    // Resize to mobile
    act(() => {
      window.innerWidth = 450;
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.queryByTestId('report-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('desktop-only-guard-notice')).toBeInTheDocument();

    // Resize back to desktop
    act(() => {
      window.innerWidth = 1200;
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.getByTestId('report-content')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-only-guard-notice')).not.toBeInTheDocument();
  });
});
