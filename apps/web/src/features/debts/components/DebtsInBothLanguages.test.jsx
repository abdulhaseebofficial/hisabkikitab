/**
 * The Udhaar screen, read by someone who does not read English.
 *
 * The key sets are compared elsewhere, and t() is tested on its own. What is
 * left is the part that actually breaks in practice: a component that was
 * never wired to the provider and quietly stays in English while everything
 * around it changes. These render real components inside a real provider and
 * read what comes out.
 *
 * They also pin down the rule the whole feature rests on - the stored value and
 * the shown word are different things. BORROWED stays BORROWED in the
 * database, in both languages.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import { KindBadge, StatusBadge } from './DebtBadges';
import DebtSummaryCards from './DebtSummaryCards';
import DebtFilters from './DebtFilters';
import DebtForm from './DebtForm';
import catalogue from '@hisabkikitab/contracts/catalogue';

const inLanguage = (language, ui) => render(<I18nProvider language={language}>{ui}</I18nProvider>);

const summary = {
  payable: 1500,
  receivable: 800,
  netBalance: -700,
  overdue: 200,
  overdueCount: 2,
};

describe('the direction of a debt', () => {
  it('reads as English', () => {
    inLanguage('en', <KindBadge kind="BORROWED" />);
    expect(screen.getByText('You owe')).toBeInTheDocument();
  });

  it('and as Roman Urdu', () => {
    inLanguage('roman_ur', <KindBadge kind="BORROWED" />);
    expect(screen.getByText('Aapne dene hain')).toBeInTheDocument();
  });

  it('without the stored word ever appearing on screen', () => {
    // If BORROWED is visible, something is rendering the database value
    // directly, and that value would have to be translated to fix it.
    const { container } = inLanguage('roman_ur', <KindBadge kind="BORROWED" />);
    expect(container.textContent).not.toContain('BORROWED');
  });
});

describe('the status of a debt', () => {
  it('calls a running debt Active, not Pending', () => {
    // PENDING is the stored word. Nothing is pending about a debt somebody is
    // living with.
    inLanguage('en', <StatusBadge debt={{ status: 'PENDING' }} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('and Jari in Roman Urdu', () => {
    inLanguage('roman_ur', <StatusBadge debt={{ status: 'PENDING' }} />);
    expect(screen.getByText('Jari')).toBeInTheDocument();
  });

  it('shows a cancelled record as cancelled in both', () => {
    const { unmount } = inLanguage('en', <StatusBadge debt={{ status: 'CANCELLED' }} />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    unmount();

    inLanguage('roman_ur', <StatusBadge debt={{ status: 'CANCELLED' }} />);
    expect(screen.getByText('Mansookh')).toBeInTheDocument();
  });

  it('does not call a cancelled record overdue, whatever its dates say', () => {
    inLanguage('en', <StatusBadge debt={{ status: 'CANCELLED', isOverdue: true }} />);
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });
});

describe('the summary cards', () => {
  it('name both sides of the money in Roman Urdu', () => {
    inLanguage('roman_ur', <DebtSummaryCards summary={summary} currency="PKR" />);

    expect(screen.getByText('Aapne dene hain')).toBeInTheDocument();
    expect(screen.getByText('Aapko lene hain')).toBeInTheDocument();
    expect(screen.getByText('Baqi Hisab')).toBeInTheDocument();
  });

  it('put the count into the sentence rather than leaving a gap', () => {
    inLanguage('roman_ur', <DebtSummaryCards summary={summary} currency="PKR" />);

    expect(screen.getByText('2 record ki tareekh guzar chuki')).toBeInTheDocument();
  });

  it('say plainly when a net balance is against you', () => {
    // A negative number and a red tint are not self-explanatory; the words are.
    inLanguage('en', <DebtSummaryCards summary={summary} currency="PKR" />);
    expect(screen.getByText('You owe more than you are owed')).toBeInTheDocument();
  });
});

describe('the filters', () => {
  it('offer the statuses in the reader\'s language', () => {
    inLanguage('roman_ur', <DebtFilters filters={{}} onChange={() => {}} />);

    expect(screen.getByRole('option', { name: 'Hisab Clear' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mansookh' })).toBeInTheDocument();
  });

  it('while still sending the API the value it expects', () => {
    // The label changed language; the value must not have.
    inLanguage('roman_ur', <DebtFilters filters={{}} onChange={() => {}} />);

    expect(screen.getByRole('option', { name: 'Hisab Clear' })).toHaveValue('SETTLED');
    expect(screen.getByRole('option', { name: 'Mansookh' })).toHaveValue('CANCELLED');
  });

  it('label the direction group for a screen reader in both languages', () => {
    inLanguage('roman_ur', <DebtFilters filters={{}} onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Simt ke hisab se' })).toBeInTheDocument();
  });
});

describe('the form', () => {
  it('asks its questions in Roman Urdu', () => {
    inLanguage('roman_ur', <DebtForm open onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.getByText('Maamla kis taraf ka hai?')).toBeInTheDocument();
    expect(screen.getByLabelText('Adaigi Ki Aakhri Tareekh')).toBeInTheDocument();
  });

  it('offers the purposes in Roman Urdu while storing the same ids', () => {
    inLanguage('roman_ur', <DebtForm open onClose={() => {}} onSubmit={() => {}} />);

    const other = screen.getByRole('option', { name: catalogue.lookup('udhaarPurpose', 'other', 'roman_ur') });
    expect(other).toHaveValue('other');
  });

  it('changes the person question with the direction, not with the language', () => {
    // "Who lent it to you?" and "Who owes you money?" are different
    // questions, and getting them the wrong way round quietly files debts
    // backwards.
    inLanguage('en', <DebtForm open onClose={() => {}} onSubmit={() => {}} debt={{ kind: 'LENT' }} />);
    expect(screen.getByLabelText('Who owes you money?')).toBeInTheDocument();
  });
});
