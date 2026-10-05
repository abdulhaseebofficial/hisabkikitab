import { calculate } from './calculations';

describe('financial planning calculators', () => {
  it('totals a budget without adding planned savings to living expenses', () => {
    const result = calculate('budget-calculator', {
      income: 60000, rent: 18000, utilities: 4000, food: 12000, transport: 3000,
      education: 2000, debt: 3000, shopping: 1000, entertainment: 1000, other: 1000, savings: 5000,
    });
    expect(result.rows).toEqual([
      ['Total income', 60000], ['Total expenses', 45000], ['Planned savings', 5000], ['Remaining after planned savings', 10000],
    ]);
  });

  it('handles completed and zero-contribution savings goals safely', () => {
    expect(calculate('savings-goal-calculator', { target: 100, current: 125, monthly: 0 }).rows[3][1]).toBe(0);
    const noPayment = calculate('savings-goal-calculator', { target: 100, current: 20, monthly: 0 });
    expect(noPayment.rows[3][1]).toBeNull();
    expect(noPayment.rows.every(([, value]) => value === null || Number.isFinite(value))).toBe(true);
  });

  it('validates group size, months and negative entries', () => {
    expect(calculate('expense-split-calculator', { total: 100, people: 0 }).error).toMatch(/whole number/);
    expect(calculate('budget-calculator', { income: -1, rent: 0, utilities: 0, food: 0, transport: 0, education: 0, debt: 0, shopping: 0, entertainment: 0, other: 0, savings: 0 }).error).toMatch(/non-negative/);
    expect(calculate('freelancer-income-calculator', { gross: 100, monthsWorked: 0, businessCosts: 0, reservePercent: 0 }).error).toMatch(/whole number/);
  });

  it('reports debt payments that cannot cover interest', () => {
    expect(calculate('debt-repayment-calculator', { balance: 100000, payment: 100, annualRate: 24 }).error).toMatch(/monthly interest/);
    expect(calculate('debt-repayment-calculator', { balance: 1000, payment: 100, annualRate: 0 }).rows[1][1]).toBe(10);
  });

  it('returns finite summaries for split, emergency, net worth and freelancer estimates', () => {
    const values = [
      calculate('expense-split-calculator', { total: 100, people: 3 }),
      calculate('emergency-fund-calculator', { monthlyEssentials: 25000, months: 3, current: 10000 }),
      calculate('net-worth-calculator', { cash: 100, savings: 50, investments: 25, property: 0, otherAssets: 0, credit: 60, loans: 20, otherDebts: 0 }),
      calculate('freelancer-income-calculator', { gross: 90000, monthsWorked: 3, businessCosts: 9000, reservePercent: 20 }),
    ];
    expect(values.every((result) => result.rows.every(([, value]) => value === null || Number.isFinite(value)))).toBe(true);
  });

  it('matches the stated savings, reserve, net worth and freelance formulas', () => {
    expect(calculate('savings-goal-calculator', { target: 120000, current: 20000, monthly: 5000 }).rows[3][1]).toBe(20);
    expect(calculate('emergency-fund-calculator', { monthlyEssentials: 30000, months: 6, current: 50000 }).rows).toEqual([
      ['Estimated target', 180000], ['Current reserve', 50000], ['Amount left to build', 130000],
    ]);
    expect(calculate('net-worth-calculator', { cash: 100, savings: 200, investments: 300, property: 400, otherAssets: 50, credit: 80, loans: 70, otherDebts: 20 }).rows).toEqual([
      ['Total assets', 1050], ['Total liabilities', 170], ['Estimated net worth', 880],
    ]);
    expect(calculate('freelancer-income-calculator', { gross: 120000, monthsWorked: 4, businessCosts: 20000, reservePercent: 25 }).rows).toEqual([
      ['Average gross per active month', 30000], ['Average business costs', 5000], ['Illustrative reserve', 6250], ['Estimated amount after costs and reserve', 18750],
    ]);
  });

  it('rejects blanks, decimals in integer fields, invalid percentages and overflow', () => {
    expect(calculate('budget-calculator', { income: '', rent: 0, utilities: 0, food: 0, transport: 0, education: 0, debt: 0, shopping: 0, entertainment: 0, other: 0, savings: 0 }).error).toMatch(/valid/);
    expect(calculate('expense-split-calculator', { total: 100, people: 1.5 }).error).toMatch(/whole number/);
    expect(calculate('freelancer-income-calculator', { gross: 100, monthsWorked: 1, businessCosts: 0, reservePercent: 101 }).error).toMatch(/Percentages/);
    const overflow = calculate('budget-calculator', { income: 1e308, rent: 1e308, utilities: 1e308, food: 0, transport: 0, education: 0, debt: 0, shopping: 0, entertainment: 0, other: 0, savings: 0 });
    expect(overflow.error).toMatch(/too large/);
    expect(JSON.stringify(overflow)).not.toMatch(/NaN|Infinity/);
  });
});
