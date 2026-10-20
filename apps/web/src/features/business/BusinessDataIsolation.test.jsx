import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BusinessProvider, useBusiness } from './BusinessContext';
import BusinessDashboard from './pages/BusinessDashboard';
import businessApi from './api/businessApi';

let mockAuth = {
  isAuthenticated: true,
  user: { _id: 'user-biz-1', id: 'user-biz-1', name: 'Zaid Khan', isDemo: false },
};

vi.mock('../auth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('./api/businessApi', () => ({
  default: {
    listBusinesses: vi.fn(),
    getDashboard: vi.fn(),
    listExpenses: vi.fn(),
    listAccounts: vi.fn(),
  },
}));

vi.mock('../../shared/i18n/I18nProvider', () => ({
  default: () => ({
    t: (k, fallback) => fallback || k,
  }),
}));

describe('Financial Data Isolation Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuth = {
      isAuthenticated: true,
      user: { _id: 'user-biz-1', id: 'user-biz-1', name: 'Zaid Khan', isDemo: false },
    };
  });

  it('demo user is completely isolated: cannot enter business mode or load business state', async () => {
    mockAuth = {
      isAuthenticated: true,
      user: { _id: 'demo-student', id: 'demo-student', name: 'Demo Student', isDemo: true, financeMode: 'student' },
    };

    function TestConsumer() {
      const { isBusinessMode, businesses, activeBusinessId, mode, setMode } = useBusiness();
      return (
        <div>
          <span data-testid="is-biz">{String(isBusinessMode)}</span>
          <span data-testid="biz-count">{businesses.length}</span>
          <span data-testid="active-biz">{String(activeBusinessId)}</span>
          <span data-testid="mode">{mode}</span>
          <button data-testid="try-enter-biz" onClick={() => setMode('business')}>
            Enter Biz
          </button>
        </div>
      );
    }

    render(
      <BusinessProvider>
        <TestConsumer />
      </BusinessProvider>
    );

    expect(screen.getByTestId('is-biz').textContent).toBe('false');
    expect(screen.getByTestId('biz-count').textContent).toBe('0');
    expect(screen.getByTestId('active-biz').textContent).toBe('null');
    expect(screen.getByTestId('mode').textContent).toBe('personal');
    expect(businessApi.listBusinesses).not.toHaveBeenCalled();

    // Attempting to switch to business mode as demo user should be strictly ignored
    act(() => {
      screen.getByTestId('try-enter-biz').click();
    });

    expect(screen.getByTestId('is-biz').textContent).toBe('false');
    expect(screen.getByTestId('mode').textContent).toBe('personal');
  });

  it('purges and re-evaluates activeBusinessId when user switches account', async () => {
    businessApi.listBusinesses.mockResolvedValueOnce([
      { id: 'biz-a', name: 'Shop A' },
    ]);

    function TestConsumer() {
      const { activeBusinessId, businesses } = useBusiness();
      return (
        <div>
          <span data-testid="active-biz-id">{activeBusinessId || 'none'}</span>
          <span data-testid="biz-name">{businesses[0]?.name || 'none'}</span>
        </div>
      );
    }

    const { rerender } = render(
      <BusinessProvider>
        <TestConsumer />
      </BusinessProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-biz-id').textContent).toBe('biz-a');
      expect(screen.getByTestId('biz-name').textContent).toBe('Shop A');
    });

    // Switch to User 2 who has different business
    businessApi.listBusinesses.mockResolvedValueOnce([
      { id: 'biz-b', name: 'Shop B' },
    ]);
    mockAuth = {
      isAuthenticated: true,
      user: { _id: 'user-2', id: 'user-2', name: 'Omar Farooq', isDemo: false },
    };

    rerender(
      <BusinessProvider>
        <TestConsumer />
      </BusinessProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-biz-id').textContent).toBe('biz-b');
      expect(screen.getByTestId('biz-name').textContent).toBe('Shop B');
    });
  });

  it('renders clean onboarding welcome in BusinessDashboard without leaking personal data when user has 0 businesses', async () => {
    businessApi.listBusinesses.mockResolvedValueOnce([]);

    render(
      <MemoryRouter initialEntries={['/business']}>
        <BusinessProvider>
          <BusinessDashboard />
        </BusinessProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Welcome to HisabKi Kitab Business Mode/i)).toBeInTheDocument();
      expect(screen.getByText(/Create Your First Business/i)).toBeInTheDocument();
    });

    // Ensure business metrics were not queried for empty/ghost business
    expect(businessApi.getDashboard).not.toHaveBeenCalled();
  });

  it('immediately clears and isolates dashboard summary when switching between Business A and Business B', async () => {
    businessApi.listBusinesses.mockResolvedValue([
      { id: 'biz-1', name: 'Alpha Traders' },
      { id: 'biz-2', name: 'Beta Logistics' },
    ]);

    businessApi.getDashboard.mockImplementation((id) => {
      if (id === 'biz-1') {
        return Promise.resolve({
          todaySales: 1500000, // 15,000 PKR
          cashBalance: 5000000,
          pendingKhataReceivable: 200000,
          lowStockCount: 0,
        });
      }
      return Promise.resolve({
        todaySales: 4200000, // 42,000 PKR
        cashBalance: 9000000,
        pendingKhataReceivable: 800000,
        lowStockCount: 3,
      });
    });

    function TestSwitcher() {
      const { setActiveBusinessId } = useBusiness();
      return (
        <div>
          <button data-testid="switch-to-2" onClick={() => setActiveBusinessId('biz-2')}>
            Switch to Biz 2
          </button>
          <BusinessDashboard />
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/business']}>
        <BusinessProvider>
          <TestSwitcher />
        </BusinessProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Alpha Traders')).toBeInTheDocument();
      expect(screen.getByText(/Rs\s*15,000/i)).toBeInTheDocument();
    });

    // Switch to Biz 2
    act(() => {
      screen.getByTestId('switch-to-2').click();
    });

    await waitFor(() => {
      expect(screen.getByText('Beta Logistics')).toBeInTheDocument();
      expect(screen.getByText(/Rs\s*42,000/i)).toBeInTheDocument();
      expect(screen.queryByText('Alpha Traders')).not.toBeInTheDocument();
    });
  });
});
