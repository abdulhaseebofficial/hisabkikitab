import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import SharedLivingPage from '../pages/SharedLivingPage';
import Sidebar from '../../../app/layout/Sidebar';
import LedgerForm from './LedgerForm';
import api from '../api/sharedLivingApi';

vi.mock('../api/sharedLivingApi', () => ({
  default: { spaces: vi.fn(), month: vi.fn(), save: vi.fn(), join: vi.fn() },
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: ({ children }) => <div>{children}</div>,
  Cell: () => null,
  Tooltip: () => null,
}));

const month = new Date().toISOString().slice(0, 7);
const fixture = (role = 'admin', closed = false) => ({
  space: { id: 'space', name: 'My Flat', currency: 'PKR', residents: 2, role },
  period: { closed, budget_minor: 0, food_budget_minor: 0 },
  periods: [], categories: [], expenses: [], bills: [], payments: [], shares: [], activity: [],
  summary: {
    activeMembers: 2, spent: '50.00', collected: '40.00', totalPaid: '42.00',
    settlementOutstanding: '8.00', unallocated: '0.00', categories: [], members: [],
  },
});
const renderPage = (role = 'admin', entry = '/dashboard') => {
  const data = fixture(role);
  api.spaces.mockResolvedValue([data.space]);
  api.month.mockResolvedValue(data);
  return render(<I18nProvider language="en"><MemoryRouter initialEntries={[entry]}>
    <Sidebar mode="shared_living" open={false} onClose={() => {}} />
    <SharedLivingPage />
  </MemoryRouter></I18nProvider>);
};
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

describe('Shared Living compact workflow', () => {
  it('shows expenses, paid, outstanding and active members without budget remaining', async () => {
    renderPage();
    expect((await screen.findAllByText('Rs. 50.00')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rs. 42.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rs. 8.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('Remaining Budget')).not.toBeInTheDocument();
  });

  it('keeps space and month selectors on Dashboard only', async () => {
    renderPage();
    await screen.findByLabelText('Shared space');
    await userEvent.click(screen.getByRole('link', { name: 'Bills', exact: true }));
    expect(screen.queryByLabelText('Shared space')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Month')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create a space' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(screen.getByLabelText('Shared space')).toBeInTheDocument();
    expect(screen.getByLabelText('Month')).toBeInTheDocument();
  });

  it('changes month and loads its records', async () => {
    renderPage();
    await screen.findByLabelText('Month');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(api.month).toHaveBeenCalledTimes(2));
    expect(api.month.mock.calls[1][1]).not.toBe(month);
  });

  it('starts a missing month once, then loads its result', async () => {
    api.spaces.mockResolvedValue([fixture().space]);
    api.month.mockRejectedValueOnce({ response: { data: { message: 'shared.noMonth' } } })
      .mockResolvedValue(fixture());
    api.save.mockResolvedValue({ id: 'new-period' });
    render(<I18nProvider language="en"><MemoryRouter initialEntries={['/dashboard']}>
      <SharedLivingPage />
    </MemoryRouter></I18nProvider>);
    await waitFor(() => expect(api.save).toHaveBeenCalledWith('post',
      `/spaces/space/months/${month}/start`, {}));
    expect((await screen.findAllByText('Rs. 50.00')).length).toBeGreaterThan(0);
    expect(api.month).toHaveBeenCalledTimes(2);
  });

  it('lets viewers read bills without write controls', async () => {
    renderPage('viewer', '/dashboard?section=bills');
    await screen.findByText('No bills this month');
    expect(screen.queryByRole('button', { name: 'Add bill' })).not.toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('opens the short join-code form', async () => {
    renderPage();
    await screen.findByLabelText('Shared space');
    await userEvent.click(screen.getByRole('button', { name: 'Join a space' }));
    const input = screen.getByLabelText('Join code');
    expect(input).toHaveAttribute('maxLength', '7');
    await userEvent.type(input, 'a7k92xz');
    expect(input).toHaveValue('A7K92XZ');
  });

  it('creates a space without asking for a monthly budget', async () => {
    renderPage();
    await screen.findByLabelText('Shared space');
    await userEvent.click(screen.getByRole('button', { name: 'Create a space' }));
    expect(screen.getByLabelText('Organization type')).toBeInTheDocument();
    expect(screen.getByLabelText('Organization name (optional)')).not.toBeRequired();
    expect(screen.getByLabelText('Members')).toBeInTheDocument();
    expect(screen.queryByLabelText('Monthly budget')).not.toBeInTheDocument();
  });

  it('preserves decimal strings in the shared form', async () => {
    const submit = vi.fn();
    render(<LedgerForm fields={[{ key: 'amount', required: true }]} initial={{ amount: '0.29' }} onSubmit={submit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).toHaveBeenCalledWith({ amount: '0.29' });
  });

  it('closes the mobile drawer when a shared section is chosen', async () => {
    const onClose = vi.fn();
    render(<MemoryRouter initialEntries={['/dashboard']}><Sidebar mode="shared_living" open onClose={onClose} /></MemoryRouter>);
    await userEvent.click(screen.getAllByRole('link', { name: 'Bills' })[1]);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
