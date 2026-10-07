/**
 * The onboarding steps, after they were pulled out of one 267-line page.
 *
 * The wizard is the first thing a new student sees, and the one screen where a
 * broken field means they cannot get in at all. These assert what each step
 * asks for and what it reports back.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wallet, Check, Target } from 'lucide-react';

import MoneyStep from './MoneyStep';
import PlaceStep from './PlaceStep';
import GoalStep from './GoalStep';
import WizardHeader from './WizardHeader';

const form = {
  monthlyIncome: '',
  currency: 'PKR',
  university: '',
  hostelName: '',
  goalTitle: '',
  goalTarget: '',
  goalIcon: '🎯',
};

describe('MoneyStep', () => {
  it('asks for the figure everything else is sized against', () => {
    render(<MoneyStep form={form} onChange={() => {}} />);
    expect(screen.getByLabelText(/monthly income/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/currency/i)).toBeInTheDocument();
  });

  it('says the figure can be changed later, so it is not a commitment', () => {
    render(<MoneyStep form={form} onChange={() => {}} />);
    expect(screen.getByText(/change this any time in settings/i)).toBeInTheDocument();
  });

  it('offers quick amounts so the first field is a tap, not typing', async () => {
    const onChange = vi.fn();
    render(<MoneyStep form={form} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /25,000/ }));

    expect(onChange).toHaveBeenCalledWith({ monthlyIncome: '25000' });
  });

  it('reports a typed amount as it is typed', async () => {
    const onChange = vi.fn();
    render(<MoneyStep form={form} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText(/monthly income/i), '3');

    expect(onChange).toHaveBeenCalledWith({ monthlyIncome: '3' });
  });

  it('shows the amount already entered', () => {
    render(<MoneyStep form={{ ...form, monthlyIncome: '25000' }} onChange={() => {}} />);
    expect(screen.getByLabelText(/monthly income/i)).toHaveValue(25000);
  });
});

describe('MoneyStep: the order of the two money fields', () => {
  /*
   * Currency first, income second.
   *
   * This is the reverse of what these tests used to assert, and the reversal is
   * deliberate. The old reasoning was that income is the figure everything else
   * is sized against, so it should be asked for first. In practice that put a
   * currency symbol on the field BEFORE the person had said which currency they
   * meant: they typed a figure against "Rs", then corrected the currency below
   * it, and the number they had already entered silently changed meaning.
   *
   * The unit has to be settled before the amount, because every figure after
   * this point - the quick-amount buttons here, the goal targets on the next
   * step - is rendered in it.
   *
   * These read the rendered DOM rather than the source, so they hold whichever
   * way the markup is written.
   */
  const fieldOrder = (container) =>
    Array.from(container.querySelectorAll('input, select')).map((el) => el.tagName);

  it('puts currency before monthly income on screen', () => {
    const { container } = render(<MoneyStep form={form} onChange={() => {}} />);

    const income = screen.getByLabelText(/monthly income/i);
    const currency = screen.getByLabelText(/currency/i);

    // DOCUMENT_POSITION_FOLLOWING: income comes after currency in the document.
    expect(currency.compareDocumentPosition(income) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fieldOrder(container)[0]).toBe('SELECT');
  });

  it('gives them the same order for the keyboard', async () => {
    render(<MoneyStep form={form} onChange={() => {}} />);
    const income = screen.getByLabelText(/monthly income/i);
    const currency = screen.getByLabelText(/currency/i);

    currency.focus();
    expect(document.activeElement).toBe(currency);
    await userEvent.tab();
    expect(document.activeElement).toBe(income);
  });

  it('neither field carries a tabIndex that would reorder them', () => {
    render(<MoneyStep form={form} onChange={() => {}} />);
    expect(screen.getByLabelText(/monthly income/i)).not.toHaveAttribute('tabindex');
    expect(screen.getByLabelText(/currency/i)).not.toHaveAttribute('tabindex');
  });

  it('reports each field under its own name, with the values not swapped', async () => {
    const onChange = vi.fn();
    render(<MoneyStep form={form} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText(/monthly income/i), '5');
    expect(onChange).toHaveBeenLastCalledWith({ monthlyIncome: '5' });

    onChange.mockClear();
    await userEvent.selectOptions(screen.getByLabelText(/currency/i), 'INR');
    expect(onChange).toHaveBeenLastCalledWith({ currency: 'INR' });
  });

  it('loads existing values into the right fields', () => {
    render(<MoneyStep form={{ ...form, monthlyIncome: '25000', currency: 'AED' }} onChange={() => {}} />);

    expect(screen.getByLabelText(/monthly income/i)).toHaveValue(25000);
    expect(screen.getByLabelText(/currency/i)).toHaveValue('AED');
  });
});

describe('PlaceStep', () => {
  it('is honest that it is optional', () => {
    render(<PlaceStep form={form} onChange={() => {}} />);
    expect(screen.getByText(/optional/i)).toBeInTheDocument();
  });

  it('asks for the university and the hostel', () => {
    render(<PlaceStep form={form} onChange={() => {}} />);
    expect(screen.getByLabelText(/university or college/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hostel name/i)).toBeInTheDocument();
  });

  it('reports what was typed', async () => {
    const onChange = vi.fn();
    render(<PlaceStep form={form} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText(/hostel name/i), 'B');

    expect(onChange).toHaveBeenCalledWith({ hostelName: 'B' });
  });
});

describe('GoalStep', () => {
  it('suggests targets rather than starting from a blank field', () => {
    render(<GoalStep form={form} onChange={() => {}} />);
    expect(screen.getByText('Emergency fund')).toBeInTheDocument();
    expect(screen.getByText('New phone')).toBeInTheDocument();
  });

  it('picking a suggestion fills in the whole goal at once', async () => {
    const onChange = vi.fn();
    render(<GoalStep form={form} onChange={onChange} />);

    await userEvent.click(screen.getByText('New phone'));

    expect(onChange).toHaveBeenCalledWith({
      goalTitle: 'New phone',
      goalTarget: '45000',
      goalIcon: '📱',
    });
  });

  it('a student can still write their own', async () => {
    const onChange = vi.fn();
    render(<GoalStep form={form} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText(/goal name/i), 'B');

    expect(onChange).toHaveBeenCalledWith({ goalTitle: 'B' });
  });

  it('shows amounts in the currency chosen on the first step', () => {
    render(<GoalStep form={{ ...form, currency: 'PKR' }} onChange={() => {}} />);
    // Rs, not the default rupee sign, because step one said PKR.
    expect(screen.getAllByText(/Rs/).length).toBeGreaterThan(0);
  });
});

describe('WizardHeader', () => {
  const steps = [
    { key: 'income', title: 'Your monthly money', icon: Wallet },
    { key: 'place', title: 'Where you study', icon: Check },
    { key: 'goal', title: 'Your first goal', icon: Target },
  ];

  it('says where in the wizard the student is', () => {
    render(<WizardHeader steps={steps} step={1} />);
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /where you study/i })).toBeInTheDocument();
  });

  it('counts from one, not from zero', () => {
    render(<WizardHeader steps={steps} step={0} />);
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });
});
