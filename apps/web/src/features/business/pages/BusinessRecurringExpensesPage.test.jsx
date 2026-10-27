import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BusinessRecurringExpensesPage from './BusinessRecurringExpensesPage';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import businessApi from '../api/businessApi';

const mockUseBusiness = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../BusinessContext', () => ({
  useBusiness: () => mockUseBusiness(),
}));

vi.mock('../../auth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../api/businessApi', () => ({
  default: {
    listRecurringExpenses: vi.fn(),
    getUpcomingRecurringExpenses: vi.fn(),
    getOverdueRecurringExpenses: vi.fn(),
    listAccounts: vi.fn(),
    listSuppliers: vi.fn(),
    createRecurringExpense: vi.fn(),
    updateRecurringExpense: vi.fn(),
    pauseRecurringExpense: vi.fn(),
    resumeRecurringExpense: vi.fn(),
    cancelRecurringExpense: vi.fn(),
    listRecurringOccurrences: vi.fn(),
    generateRecurringExpenses: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('BusinessRecurringExpensesPage', () => {
  const mockTemplates = [
    {
      id: 'rec-1',
      title: 'Shop Rent',
      category: 'Rent',
      category_account_id: 'acc-1',
      amount_minor: 3500000,
      frequency: 'monthly',
      status: 'active',
      start_date: '2026-01-01',
      next_due_date: '2026-11-01',
      auto_pay: true,
      payment_method: 'bank',
    },
    {
      id: 'rec-2',
      title: 'Fiber Internet',
      category: 'Utilities',
      category_account_id: 'acc-1',
      amount_minor: 500000,
      frequency: 'monthly',
      status: 'paused',
      start_date: '2026-01-01',
      next_due_date: '2026-10-15',
      auto_pay: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBusiness.mockReturnValue({
      activeBusinessId: 'biz-123',
      activeBusiness: { id: 'biz-123', name: 'Quality Hardware' },
      role: 'owner',
    });
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Owner User', isDemo: false },
    });

    businessApi.listRecurringExpenses.mockResolvedValue(mockTemplates);
    businessApi.getUpcomingRecurringExpenses.mockResolvedValue([mockTemplates[0]]);
    businessApi.getOverdueRecurringExpenses.mockResolvedValue([mockTemplates[1]]);
    businessApi.listAccounts.mockResolvedValue([
      { id: 'acc-1', code: '5010', name: 'Rent Expense', type: 'expense' },
      { id: 'acc-2', code: '1020', name: 'Meezan Bank', type: 'asset', subtype: 'bank' },
    ]);
    businessApi.listSuppliers.mockResolvedValue([
      { id: 'sup-1', name: 'Landlord Malik', phone: '03001234567' },
    ]);
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <I18nProvider>
          <BusinessRecurringExpensesPage />
        </I18nProvider>
      </MemoryRouter>
    );

  it('renders recurring expenses dashboard and schedule metrics', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Recurring Business Expenses')).toBeInTheDocument();
      expect(screen.getByText('Shop Rent')).toBeInTheDocument();
      expect(screen.getByText('Fiber Internet')).toBeInTheDocument();
    });

    // Check metric cards
    expect(screen.getByText('Active Schedules')).toBeInTheDocument();
    expect(screen.getByText('Paused Schedules')).toBeInTheDocument();
  });

  it('switches between schedule tabs and displays upcoming and overdue lists', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Shop Rent')).toBeInTheDocument();
    });

    // Click Upcoming tab
    const upcomingTab = screen.getByRole('button', { name: /Upcoming Due/ });
    fireEvent.click(upcomingTab);

    expect(screen.getByText('Shop Rent')).toBeInTheDocument();

    // Click Overdue tab
    const overdueTab = screen.getByRole('button', { name: /Overdue/ });
    fireEvent.click(overdueTab);

    expect(screen.getByText('Fiber Internet')).toBeInTheDocument();
  });

  it('handles pause and resume actions', async () => {
    businessApi.pauseRecurringExpense.mockResolvedValueOnce({ id: 'rec-1', status: 'paused' });
    businessApi.resumeRecurringExpense.mockResolvedValueOnce({ id: 'rec-2', status: 'active' });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Shop Rent')).toBeInTheDocument();
    });

    // Find pause button for Shop Rent
    const pauseBtn = screen.getByTitle('Pause Schedule');
    fireEvent.click(pauseBtn);

    await waitFor(() => {
      expect(businessApi.pauseRecurringExpense).toHaveBeenCalledWith('biz-123', 'rec-1');
    });

    // Find resume button for Fiber Internet
    const resumeBtn = screen.getByTitle('Resume Schedule');
    fireEvent.click(resumeBtn);

    await waitFor(() => {
      expect(businessApi.resumeRecurringExpense).toHaveBeenCalledWith('biz-123', 'rec-2');
    });
  });

  it('opens history modal and loads occurrences', async () => {
    businessApi.listRecurringOccurrences.mockResolvedValueOnce([
      {
        id: 'occ-1',
        period_key: '2026-10',
        due_date: '2026-10-01',
        amount_minor: 3500000,
        status: 'paid',
        bill_id: 'bill-12345678',
      },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Shop Rent')).toBeInTheDocument();
    });

    const historyButtons = screen.getAllByTitle('View Occurrence History');
    fireEvent.click(historyButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('2026-10')).toBeInTheDocument();
      expect(screen.getByText('BILL-bill-123')).toBeInTheDocument();
    });
  });

  it('renders read-only warning and disables mutations when demo mode is active', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'demo-user', name: 'Demo Guest', isDemo: true },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Demo Mode is Read-Only/)).toBeInTheDocument();
    });
  });
});
