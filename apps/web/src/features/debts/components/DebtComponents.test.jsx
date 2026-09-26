/**
 * What a student can actually see and do on the Udhaar screens.
 *
 * These assert behaviour, not structure: the words on screen, which handler a
 * click reaches, what is disabled and when. The arithmetic is deliberately not
 * tested here - every figure these components show is computed by the server
 * (see tests/e2e/debts.test.js), and a frontend test that recalculated a
 * balance would be asserting a second, competing implementation of it.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import DebtSummaryCards from './DebtSummaryCards';
import DebtRow from './DebtRow';
import DebtFilters from './DebtFilters';
import DebtDetail from './DebtDetail';
import DebtWidget from './DebtWidget';
import { displayStatus, progressPercent } from '../utils/debtDisplay';

/** A borrowed record, part paid, nothing late. */
const borrowed = {
  _id: 'd1',
  kind: 'BORROWED',
  personName: 'Ali from Block C',
  originalAmount: 1000,
  paidAmount: 400,
  remainingAmount: 600,
  status: 'PARTIALLY_PAID',
  isOverdue: false,
  transactionDate: '2026-08-01T00:00:00.000Z',
  dueDate: null,
  category: 'Food',
  note: null,
  personContact: null,
};

const withRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('DebtSummaryCards', () => {
  it('shows skeletons rather than zeroes while the totals are loading', () => {
    const { container } = render(<DebtSummaryCards loading />);

    // Zeroes during loading would read as "you owe nothing", which is a
    // different and much worse claim than "not known yet".
    expect(screen.queryByText(/you have to pay/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('.hw-skeleton').length).toBe(4);
  });

  it('renders the four server-computed figures', () => {
    render(
      <DebtSummaryCards
        summary={{ payable: 600, receivable: 2500, netBalance: 1900, overdue: 0, overdueCount: 0 }}
      />
    );

    expect(screen.getByText(/you have to pay/i)).toBeInTheDocument();
    expect(screen.getByText(/you have to receive/i)).toBeInTheDocument();
    expect(screen.getByText(/net balance/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is late/i)).toBeInTheDocument();
  });

  it('says in words that a negative net balance is against the student', () => {
    render(<DebtSummaryCards summary={{ payable: 5000, receivable: 1000, netBalance: -4000 }} />);

    // Colour and a minus sign alone are not enough - one is invisible to a
    // colour-blind student and the other is easy to miss.
    expect(screen.getByText(/you owe more than you are owed/i)).toBeInTheDocument();
  });

  it('treats a missing summary as zeroes rather than crashing', () => {
    render(<DebtSummaryCards summary={undefined} />);
    expect(screen.getByText(/you owe nobody/i)).toBeInTheDocument();
  });

  it('counts the overdue records when there are any', () => {
    render(<DebtSummaryCards summary={{ overdue: 900, overdueCount: 2 }} />);
    expect(screen.getByText(/past due/i)).toBeInTheDocument();
  });
});

describe('DebtRow', () => {
  it('names the person and which way the money went', () => {
    render(<DebtRow debt={borrowed} onOpen={() => {}} />);

    expect(screen.getByText('Ali from Block C')).toBeInTheDocument();
    // "You owe" rather than "borrowed": the badge is written from the
    // student's point of view, so it needs no translating in their head.
    expect(screen.getByText(/you owe/i)).toBeInTheDocument();
  });

  it('opens the record when the row is activated', async () => {
    const onOpen = vi.fn();
    render(<DebtRow debt={borrowed} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: /ali from block c/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is reachable by keyboard, not only by mouse', async () => {
    const onOpen = vi.fn();
    render(<DebtRow debt={borrowed} onOpen={onOpen} />);

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalled();
  });

  it('marks an overdue record as overdue rather than merely pending', () => {
    render(<DebtRow debt={{ ...borrowed, isOverdue: true }} onOpen={() => {}} />);
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });
});

describe('DebtFilters', () => {
  const filters = { kind: '', status: 'OUTSTANDING', sort: 'newest', search: '', page: 3 };

  it('sends the typed search back up', async () => {
    const onChange = vi.fn();
    render(<DebtFilters filters={filters} onChange={onChange} />);

    await userEvent.type(screen.getByRole('searchbox'), 'A');
    expect(onChange).toHaveBeenCalled();
  });

  it('returns to the first page when a filter changes', async () => {
    const onChange = vi.fn();
    render(<DebtFilters filters={filters} onChange={onChange} />);

    const direction = screen.getByRole('group', { name: /direction/i });
    await userEvent.click(within(direction).getByRole('button', { name: /to collect/i }));

    // Staying on page 3 of a freshly narrowed list shows an empty screen that
    // looks like "no records" but really means "no records here".
    const next = onChange.mock.calls.at(-1)[0];
    expect(next.page).toBe(1);
  });
});

describe('DebtDetail', () => {
  const open = (props = {}) =>
    render(
      <DebtDetail
        open
        debt={borrowed}
        payments={[]}
        onClose={() => {}}
        onAddPayment={() => {}}
        onSettle={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onRemovePayment={() => {}}
        {...props}
      />
    );

  it('renders nothing at all when there is no record yet', () => {
    const { container } = render(<DebtDetail open debt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows what is outstanding and the history behind it', () => {
    open();
    expect(screen.getByText(/still outstanding/i)).toBeInTheDocument();
    expect(screen.getByText(/payment history/i)).toBeInTheDocument();
  });

  it('explains an empty ledger instead of showing a blank space', () => {
    open();
    expect(screen.getByText(/nothing paid yet/i)).toBeInTheDocument();
  });

  it('offers no payment form once the record is settled', () => {
    open({
      debt: { ...borrowed, status: 'SETTLED', paidAmount: 1000, remainingAmount: 0 },
      payments: [{ _id: 'p1', amount: 1000, paidOn: '2026-08-20T00:00:00.000Z', note: null }],
    });

    expect(screen.getByText(/fully settled/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add payment/i })).not.toBeInTheDocument();
  });

  it('will not submit an empty payment', () => {
    open();
    expect(screen.getByRole('button', { name: /add payment/i })).toBeDisabled();
  });

  it('passes the typed amount to the handler', async () => {
    const onAddPayment = vi.fn().mockResolvedValue(undefined);
    open({ onAddPayment });

    await userEvent.type(screen.getByLabelText(/^amount$/i), '250');
    await userEvent.click(screen.getByRole('button', { name: /add payment/i }));

    expect(onAddPayment).toHaveBeenCalledWith({ amount: 250, note: '' });
  });

  it('lets a wrongly entered payment be undone, and says which one', () => {
    open({ payments: [{ _id: 'p1', amount: 400, paidOn: '2026-08-10T00:00:00.000Z', note: 'mess' }] });

    // The label carries the amount: a column of identical "undo" buttons is a
    // trap once several payments are listed.
    expect(screen.getByRole('button', { name: /undo the payment of/i })).toBeInTheDocument();
  });

  it('wires edit and delete to their own handlers', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    open({ onEdit, onDelete });

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('asks for money received, not repayment, on a record that was lent out', () => {
    open({ debt: { ...borrowed, kind: 'LENT' } });
    expect(screen.getByText(/record money received/i)).toBeInTheDocument();
  });
});

describe('DebtWidget', () => {
  it('stays off the dashboard entirely when there is no summary', () => {
    const { container } = withRouter(<DebtWidget debts={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says so plainly when nothing is owed either way', () => {
    withRouter(<DebtWidget debts={{ payable: 0, receivable: 0, netBalance: 0, dueSoon: [] }} />);
    expect(screen.getByText(/nothing to pay or collect/i)).toBeInTheDocument();
  });

  it('shows the position and links through to the full page', () => {
    withRouter(
      <DebtWidget debts={{ payable: 600, receivable: 2500, netBalance: 1900, dueSoon: [] }} />
    );

    expect(screen.getByText(/in your favour/i)).toBeInTheDocument();
    // The dashboard link uses the English section name.
    expect(screen.getByRole('link', { name: /open lending & borrowing/i })).toHaveAttribute('href', '/debts');
  });

  it('lists at most three upcoming records so the dashboard stays readable', () => {
    const dueSoon = [1, 2, 3, 4, 5].map((n) => ({
      _id: `d${n}`,
      personName: `Person ${n}`,
      dueDate: '2026-09-10T00:00:00.000Z',
      status: 'PENDING',
      isOverdue: false,
    }));

    withRouter(<DebtWidget debts={{ payable: 100, receivable: 0, netBalance: -100, dueSoon }} />);

    expect(screen.getByText('Person 3')).toBeInTheDocument();
    expect(screen.queryByText('Person 4')).not.toBeInTheDocument();
  });
});

describe('debtDisplay', () => {
  it('reports an overdue record as overdue whatever its stored status', () => {
    // The database stores no OVERDUE status - it is derived from the due date
    // at read time - so this helper is the only place the word can come from.
    expect(displayStatus({ status: 'PENDING', isOverdue: true })).toBe('OVERDUE');
    expect(displayStatus({ status: 'PARTIALLY_PAID', isOverdue: true })).toBe('OVERDUE');
  });

  it('never calls a settled record overdue', () => {
    expect(displayStatus({ status: 'SETTLED', isOverdue: false })).toBe('SETTLED');
  });

  it('keeps the progress bar between 0 and 100', () => {
    expect(progressPercent({ originalAmount: 1000, paidAmount: 400 })).toBe(40);
    expect(progressPercent({ originalAmount: 0, paidAmount: 0 })).toBe(0);
    expect(progressPercent({ originalAmount: 100, paidAmount: 250 })).toBe(100);
  });
});
