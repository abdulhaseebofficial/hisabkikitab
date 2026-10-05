/**
 * The wizard, asked by a householder rather than a student.
 *
 * The failure these guard against is the app describing a life that is not the
 * reader's: asking a household for its hostel block, offering "trip with
 * friends" as a first savings goal, or asking for an amount before it knows
 * which currency the amount is in.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import MoneyStep from './MoneyStep';
import GoalStep from './GoalStep';

const show = (ui, language = 'en') =>
  render(<I18nProvider language={language}>{ui}</I18nProvider>);

const form = (overrides = {}) => ({
  financeMode: 'student',
  language: 'en',
  monthlyIncome: '',
  currency: 'PKR',
  goalTitle: '',
  goalTarget: '',
  goalIcon: '\u{1F6E1}',
  ...overrides,
});

/* --------------------------- currency, then amount ------------------------ */

describe('the money step', () => {
  it('asks for the currency before the amount', async () => {
    // The other way round, somebody types a figure against one symbol and
    // watches it change meaning when they correct the currency.
    const { container } = show(<MoneyStep form={form()} onChange={() => {}} />);

    const fields = [...container.querySelectorAll('select, input[type="number"]')];
    expect(fields[0].tagName).toBe('SELECT');
    expect(fields[1].tagName).toBe('INPUT');
  });

  it('puts the chosen currency symbol on the amount field', () => {
    show(<MoneyStep form={form({ currency: 'PKR' })} onChange={() => {}} />);
    expect(screen.getAllByText('Rs').length).toBeGreaterThan(0);
  });

  it('and changes it when a different currency is chosen', () => {
    show(<MoneyStep form={form({ currency: 'USD' })} onChange={() => {}} />);
    expect(screen.getAllByText('$').length).toBeGreaterThan(0);
    expect(screen.queryByText('Rs')).not.toBeInTheDocument();
  });

  it('asks a household about household income, not pocket money', () => {
    show(<MoneyStep form={form({ financeMode: 'householder' })} onChange={() => {}} />);

    expect(screen.getByLabelText(/Monthly household income/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/pocket money/i)).not.toBeInTheDocument();
  });

  it('and asks an individual about monthly income', () => {
    show(<MoneyStep form={form()} onChange={() => {}} />);
    expect(screen.getByLabelText(/Monthly income/i)).toBeInTheDocument();
  });

  it('describes the question differently for each', () => {
    const { unmount } = show(<MoneyStep form={form({ financeMode: 'householder' })} onChange={() => {}} />);
    expect(screen.getByText(/Salary, business, rent/i)).toBeInTheDocument();
    unmount();

    show(<MoneyStep form={form()} onChange={() => {}} />);
    expect(screen.getByText(/salary, allowance, freelance work/i)).toBeInTheDocument();
  });
});

/* ------------------------------- first goal ------------------------------- */

describe('the first goal', () => {
  it('suggests household goals to a householder', () => {
    show(<GoalStep form={form({ financeMode: 'householder' })} onChange={() => {}} />);

    expect(screen.getByText('Household emergency fund')).toBeInTheDocument();
    expect(screen.getByText('Rent and bills buffer')).toBeInTheDocument();
    expect(screen.getByText('Monthly grocery fund')).toBeInTheDocument();
  });

  it('and never offers a student one by mistake', () => {
    show(<GoalStep form={form({ financeMode: 'householder' })} onChange={() => {}} />);

    expect(screen.queryByText('Trip with friends')).not.toBeInTheDocument();
    expect(screen.queryByText('Laptop for projects')).not.toBeInTheDocument();
    expect(screen.queryByText('New phone')).not.toBeInTheDocument();
  });

  it('still suggests student goals to a student', () => {
    show(<GoalStep form={form()} onChange={() => {}} />);

    expect(screen.getByText('New phone')).toBeInTheDocument();
    expect(screen.queryByText('Monthly grocery fund')).not.toBeInTheDocument();
  });

  it('fills the form in when a suggestion is picked', async () => {
    const onChange = vi.fn();
    show(<GoalStep form={form({ financeMode: 'householder' })} onChange={onChange} />);

    await userEvent.click(screen.getByText('Rent and bills buffer'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ goalTitle: 'Rent and bills buffer', goalTarget: '60000' })
    );
  });

  it('sizes the household targets for a household', () => {
    // A household emergency fund and a student one are the same idea at very
    // different scales; suggesting 10,000 to a family is not a suggestion.
    show(<GoalStep form={form({ financeMode: 'householder' })} onChange={() => {}} />);
    // Symbol and amount render as one string, with no space between them.
    expect(screen.getByText('Rs100,000')).toBeInTheDocument();
  });

  it('shows the targets in the currency chosen on the previous step', () => {
    show(<GoalStep form={form({ financeMode: 'householder', currency: 'USD' })} onChange={() => {}} />);
    expect(screen.getByText('$100,000')).toBeInTheDocument();
  });

  it('reads in Roman Urdu', () => {
    show(<GoalStep form={form({ financeMode: 'householder' })} onChange={() => {}} />, 'roman_ur');
    expect(screen.getByText('Ghar ka emergency fund')).toBeInTheDocument();
  });
});
