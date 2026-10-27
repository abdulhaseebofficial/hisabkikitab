/**
 * The two dashboards, and the ways they must differ.
 *
 * The failure this guards against is the cheap one: shipping the same screen
 * twice with different words on the tiles. So these check what each dashboard
 * *asks*, not just what it says - a student is asked how much is safe to spend
 * today, a household is asked how much of the month is already committed - and
 * that the groupings underneath are actually different sets of categories.
 *
 * They also pin the arithmetic that must never be invented: with no income
 * recorded, there is no honest per-day figure to show.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import { ThemeProvider } from '../../../app/providers/ThemeProvider';
import StudentDashboard from './StudentDashboard';
import HouseholderDashboard from './HouseholderDashboard';
import { STUDENT_GROUPS, HOUSEHOLDER_GROUPS, totalsByGroup, groupsFor } from '../dashboardGroups';

vi.mock('../../advisor', () => ({ TipCard: () => null }));
vi.mock('../../auth', () => ({ useAuth: () => ({ user: null, currency: 'PKR' }) }));

const data = {
  monthLabel: 'October 2026',
  totals: {
    income: 100000,
    plannedIncome: 100000,
    incomeLogged: 100000,
    spent: 40000,
    remaining: 60000,
    spentPercent: 40,
    dailyAverage: 1300,
    safeDailySpend: 2000,
    daysLeftInMonth: 12,
    expenseCount: 18,
  },
  categoryBreakdown: [
    { category: 'Mess/Food', amount: 9000, percent: 22 },
    { category: 'Travel', amount: 3000, percent: 8 },
    { category: 'electricity_bill', amount: 12000, percent: 30 },
    { category: 'groceries', amount: 16000, percent: 40 },
  ],
  trend: [],
  comparison: { previousMonthSpent: 30000, changePercent: 33 },
  budgets: [],
  goals: [],
  recentExpenses: [],
  debts: { payable: 0, receivable: 0, netBalance: 0, overdue: 0, dueSoon: [] },
  upcomingBills: [
    { _id: 'b1', description: 'Electricity', category: 'electricity_bill', amount: 8000, nextRunAt: '2099-01-01' },
  ],
};

const show = (Component, language = 'en', overrides = {}) =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <I18nProvider language={language}>
          <Component
            data={{ ...data, ...overrides }}
            currency="PKR"
            onNavigate={() => {}}
            onQuickAdd={() => {}}
          />
        </I18nProvider>
      </ThemeProvider>
    </MemoryRouter>
  );

describe('the two dashboards ask different questions', () => {
  it('the student one leads with what is left and what is safe today', () => {
    show(StudentDashboard);
    expect(screen.getByText('Income minus spending')).toBeInTheDocument();
    expect(screen.getByText('Safe to spend per day')).toBeInTheDocument();
  });

  it('the householder one leads with what is already committed', () => {
    show(HouseholderDashboard);
    expect(screen.getByText('Household income minus spending')).toBeInTheDocument();
    // Where the student view puts a per-day allowance.
    expect(screen.queryByText('Safe to spend per day')).not.toBeInTheDocument();
    expect(screen.getAllByText('Upcoming and unpaid bills').length).toBeGreaterThan(0);
  });

  it('and they name income differently', () => {
    show(StudentDashboard);
    expect(screen.getByText('Received income')).toBeInTheDocument();

    show(HouseholderDashboard);
    expect(screen.getByText('Received household income')).toBeInTheDocument();
  });
});

describe('the category groups are genuinely different sets', () => {
  it('the student groups are about a student month', () => {
    const keys = STUDENT_GROUPS.map((g) => g.key);
    expect(keys).toContain('food');
    expect(keys).toContain('hostel');
    expect(keys).not.toContain('utilities');
  });

  it('the householder groups are about a household month', () => {
    const keys = HOUSEHOLDER_GROUPS.map((g) => g.key);
    expect(keys).toContain('utilities');
    expect(keys).toContain('groceries');
    expect(keys).toContain('healthcare');
    expect(keys).not.toContain('hostel');
  });

  it('no category is claimed by two groups in the same mode', () => {
    // A category counted twice makes the group totals add up to more than the
    // month, which is the kind of arithmetic nobody notices until they do.
    for (const groups of [STUDENT_GROUPS, HOUSEHOLDER_GROUPS]) {
      const seen = new Set();
      for (const group of groups) {
        for (const id of group.categories) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
    }
  });

  it('adds up only the categories belonging to each group', () => {
    const totals = totalsByGroup(HOUSEHOLDER_GROUPS, data.categoryBreakdown);
    const utilities = totals.find((g) => g.key === 'utilities');
    const groceries = totals.find((g) => g.key === 'groceries');

    expect(utilities.amount).toBe(12000);
    expect(groceries.amount).toBe(16000);
  });

  it('reports an empty group as zero rather than dropping it', () => {
    // A group that vanishes when empty makes a quiet month look like a bug.
    const totals = totalsByGroup(HOUSEHOLDER_GROUPS, []);
    expect(totals).toHaveLength(HOUSEHOLDER_GROUPS.length);
    expect(totals.every((g) => g.amount === 0)).toBe(true);
  });

  it('picks the student groups for anything that is not householder', () => {
    expect(groupsFor('householder')).toBe(HOUSEHOLDER_GROUPS);
    expect(groupsFor('student')).toBe(STUDENT_GROUPS);
    expect(groupsFor(undefined)).toBe(STUDENT_GROUPS);
  });
});

describe('when the data will not support a figure', () => {
  it('does not show a safe-to-spend number derived from no income', () => {
    // Dividing zero income across the remaining days produces a confident
    // "0 a day", which reads as advice rather than as missing data.
    show(StudentDashboard, 'en', {
      totals: { ...data.totals, income: 0, incomeLogged: 0, remaining: 0, spentPercent: 0 },
    });
    expect(screen.getByText('Add your income to see this')).toBeInTheDocument();
  });

  it.each([
    [StudentDashboard, 'Income minus spending'],
    [HouseholderDashboard, 'Household income minus spending'],
  ])('shows a plan separately and preserves a one-cent deficit', (Component, label) => {
    show(Component, 'en', {
      totals: { ...data.totals, income: 0, incomeLogged: 0, plannedIncome: 100000,
        spent: 0.01, remaining: -0.01, spentPercent: 0 },
    });
    const hero = screen.getByText(label).closest('div.hw-card-hero');
    expect(hero).toHaveTextContent('-0.01');
    expect(screen.getByText('Plan: Rs 100,000 (not received)')).toBeInTheDocument();
    expect(screen.getByText('You are over your income for this month')).toBeInTheDocument();
  });

  it('says plainly when nothing is due rather than showing an empty card', () => {
    show(HouseholderDashboard, 'en', { upcomingBills: [] });
    expect(screen.getAllByText('Nothing due in the coming weeks').length).toBeGreaterThan(0);
  });

  it('keeps cents visible in the household bill total', () => {
    show(HouseholderDashboard, 'en', {
      upcomingBills: [{ _id: 'bill', amount: 0.01, category: 'electricity_bill', nextRunAt: '2099-01-01' }],
    });
    const bills = screen.getAllByText('Upcoming and unpaid bills')[0].closest('div.hw-card');
    expect(bills).toHaveTextContent('0.01');
  });

  it('survives a month with no spending at all', () => {
    show(HouseholderDashboard, 'en', {
      categoryBreakdown: [],
      totals: { ...data.totals, spent: 0, expenseCount: 0 },
    });
    expect(screen.getByText('Nothing logged in these yet this month.')).toBeInTheDocument();
  });
});

describe('both dashboards in Roman Urdu', () => {
  it('the student one', () => {
    show(StudentDashboard, 'roman_ur');
    expect(screen.getByText('Aamdani minus kharch')).toBeInTheDocument();
    expect(screen.getByText('Rozana mehfooz kharcha')).toBeInTheDocument();
  });

  it('the householder one', () => {
    show(HouseholderDashboard, 'roman_ur');
    expect(screen.getByText('Ghar ki aamdani minus kharch')).toBeInTheDocument();
    expect(screen.getByText('Ghar ki wasool shuda aamdani')).toBeInTheDocument();
  });

  it('names the household groups in Roman Urdu, not as stored ids', () => {
    // The bug this replaces put "electricity_bill" on screen.
    const { container } = show(HouseholderDashboard, 'roman_ur');
    expect(screen.getByText('Bijli, gas, pani')).toBeInTheDocument();
    expect(container.textContent).not.toContain('electricity_bill');
  });
});

describe('goals stay shared across both modes', () => {
  it('appear on the student dashboard', () => {
    show(StudentDashboard, 'en', { goals: [{ _id: 'g1', title: 'Laptop', targetAmount: 50000, savedAmount: 10000, progress: 20 }] });
    expect(screen.getByText('Laptop')).toBeInTheDocument();
  });

  it('and on the householder dashboard', () => {
    show(HouseholderDashboard, 'en', { goals: [{ _id: 'g1', title: 'Laptop', targetAmount: 50000, savedAmount: 10000, progress: 20 }] });
    expect(screen.getByText('Laptop')).toBeInTheDocument();
  });
});
