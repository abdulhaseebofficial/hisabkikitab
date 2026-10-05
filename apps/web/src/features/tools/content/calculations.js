const moneyKeys = {
  'budget-calculator': ['income', 'rent', 'utilities', 'food', 'transport', 'education', 'debt', 'shopping', 'entertainment', 'other', 'savings'],
  'savings-goal-calculator': ['target', 'current', 'monthly'],
  'expense-split-calculator': ['total', 'people'],
  'emergency-fund-calculator': ['monthlyEssentials', 'months', 'current'],
  'debt-repayment-calculator': ['balance', 'payment', 'annualRate'],
  'net-worth-calculator': ['cash', 'savings', 'investments', 'property', 'otherAssets', 'credit', 'loans', 'otherDebts'],
  'freelancer-income-calculator': ['gross', 'monthsWorked', 'businessCosts', 'reservePercent'],
};

function read(tool, values) {
  const result = {};
  const nonMoney = new Set(['people', 'monthsWorked', 'months', 'annualRate', 'reservePercent']);
  for (const key of moneyKeys[tool] || []) {
    const raw = values[key];
    const value = raw === '' || raw === undefined || raw === null ? Number.NaN : Number(raw);
    if (!Number.isFinite(value) || value < 0) return { error: 'Enter a valid non-negative number in every field.' };
    if (nonMoney.has(key)) {
      result[key] = value;
      if (key === 'annualRate' || key === 'reservePercent') {
        try { result[`${key}Minor`] = toMinor(raw); }
        catch { return { error: 'Percentages must have at most two decimal places.' }; }
      }
    } else {
      if (value > 999999999999.99) return { error: 'These values are too large for the supported money range.' };
      try {
        const cents = toMinor(raw);
        if (cents > 99999999999999n) return { error: 'These values are too large for the supported money range.' };
        result[`${key}Minor`] = cents;
        result[key] = fromMinor(cents);
      } catch { return { error: 'Money amounts must have at most two decimal places.' }; }
    }
  }
  for (const key of ['people', 'monthsWorked', 'months']) {
    if (key in result && (!Number.isInteger(result[key]) || result[key] < 1)) return { error: 'Enter a whole number greater than zero.' };
  }
  if (['annualRate', 'reservePercent'].some((key) => key in result && result[key] > 100)) {
    return { error: 'Percentages must be between 0 and 100.' };
  }
  return { values: result };
}

const output = (rows, extra = {}) => {
  if (rows.some(([, value]) => typeof value === 'number' && !Number.isFinite(value))) {
    return { error: 'These values are too large to calculate safely. Use smaller numbers.' };
  }
  return { rows, ...extra };
};

export function calculate(tool, rawValues) {
  const parsed = read(tool, rawValues);
  if (parsed.error) return parsed;
  const v = parsed.values;
  switch (tool) {
    case 'budget-calculator': {
      const expenses = ['rent', 'utilities', 'food', 'transport', 'education', 'debt', 'shopping', 'entertainment', 'other'];
      const totalMinor = expenses.reduce((sum, key) => sum + v[`${key}Minor`], 0n);
      const remainingMinor = v.incomeMinor - totalMinor - v.savingsMinor;
      return output([
        ['Total income', v.income], ['Total expenses', fromMinor(totalMinor)], ['Planned savings', v.savings],
        ['Remaining after planned savings', fromMinor(remainingMinor)],
      ], { breakdown: expenses.map((key) => [key, v[key]]) });
    }
    case 'savings-goal-calculator': {
      const remaining = v.targetMinor > v.currentMinor ? v.targetMinor - v.currentMinor : 0n;
      const months = remaining === 0n ? 0 : v.monthlyMinor === 0n ? null : Number((remaining + v.monthlyMinor - 1n) / v.monthlyMinor);
      return output([['Target amount', v.target], ['Current savings', v.current], ['Remaining', fromMinor(remaining)], ['Estimated months', months]],
      { message: remaining === 0n ? 'Your target is already met.' : v.monthlyMinor === 0n ? 'Add a monthly contribution to estimate the time needed.' : null });
    }
    case 'expense-split-calculator': {
      const count = BigInt(v.people);
      const share = (v.totalMinor + count / 2n) / count;
      return output([['Total shared expenses', v.total], ['People sharing the cost', v.people], ['Each person pays (approx.)', fromMinor(share)]],
        { message: 'Round-up cents may need to be assigned to one participant so the shares equal the total.' });
    }
    case 'emergency-fund-calculator': {
      const target = v.monthlyEssentialsMinor * BigInt(v.months);
      const remaining = target > v.currentMinor ? target - v.currentMinor : 0n;
      return output([['Estimated target', fromMinor(target)], ['Current reserve', v.current], ['Amount left to build', fromMinor(remaining)]],
        { message: 'Choose a time period that fits your own household, income stability and circumstances.' });
    }
    case 'debt-repayment-calculator': {
      if (v.balance === 0) return output([['Current balance', 0], ['Estimated payoff time', 0], ['Estimated interest', 0]], { message: 'There is no balance to repay.' });
      const rate = v.annualRateMinor;
      const interestFor = (cents) => (cents * rate + 60000n) / 120000n;
      const interest = interestFor(v.balanceMinor);
      if (v.paymentMinor === 0n) return { error: 'A payment greater than zero is required to estimate repayment.' };
      if (rate > 0n && v.paymentMinor <= interest) return { error: 'This payment does not exceed the estimated monthly interest. Increase the payment or check the rate.' };
      let balance = v.balanceMinor;
      let months = 0;
      let totalInterest = 0n;
      while (balance > 0n && months < 1200) {
        const accrued = interestFor(balance);
        totalInterest += accrued;
        balance = balance + accrued - v.paymentMinor;
        if (balance < 0n) balance = 0n;
        months += 1;
      }
      if (balance > 0n) return { error: 'This repayment estimate exceeds 100 years. Check the balance, rate and payment.' };
      return output([['Current balance', v.balance], ['Estimated payoff time (months)', months], ['Estimated interest paid', fromMinor(totalInterest)]],
        { message: 'Estimate assumes fixed monthly payments and a constant rate; fees and lender rules can change the result.' });
    }
    case 'net-worth-calculator': {
      const assets = ['cash', 'savings', 'investments', 'property', 'otherAssets'].reduce((sum, key) => sum + v[`${key}Minor`], 0n);
      const debts = ['credit', 'loans', 'otherDebts'].reduce((sum, key) => sum + v[`${key}Minor`], 0n);
      return output([['Total assets', fromMinor(assets)], ['Total liabilities', fromMinor(debts)], ['Estimated net worth', fromMinor(assets - debts)]]);
    }
    case 'freelancer-income-calculator': {
      const monthsWorked = BigInt(v.monthsWorked);
      const monthlyGross = (v.grossMinor + monthsWorked / 2n) / monthsWorked;
      const monthlyCosts = (v.businessCostsMinor + monthsWorked / 2n) / monthsWorked;
      const beforeReserve = monthlyGross - monthlyCosts;
      const reserve = beforeReserve > 0n ? (beforeReserve * v.reservePercentMinor + 5000n) / 10000n : 0n;
      return output([['Average gross per active month', fromMinor(monthlyGross)], ['Average business costs', fromMinor(monthlyCosts)],
        ['Illustrative reserve', fromMinor(reserve)], ['Estimated amount after costs and reserve', fromMinor(beforeReserve - reserve)]],
      { message: 'Reserve is a planning input only, not a tax estimate. Set aside local taxes separately using qualified guidance.' });
    }
    default: return { error: 'This calculator is unavailable.' };
  }
}

export const fields = {
  'budget-calculator': [['income','Monthly take-home income'],['rent','Rent'],['utilities','Utilities'],['food','Food'],['transport','Transport'],['education','Education'],['debt','Debt payments'],['shopping','Shopping'],['entertainment','Entertainment'],['other','Other expenses'],['savings','Planned savings']],
  'savings-goal-calculator': [['target','Target amount'],['current','Current savings'],['monthly','Monthly contribution']],
  'expense-split-calculator': [['total','Total shared expenses'],['people','Number of people']],
  'emergency-fund-calculator': [['monthlyEssentials','Essential monthly expenses'],['months','Months of cover to plan for'],['current','Current emergency savings']],
  'debt-repayment-calculator': [['balance','Current debt balance'],['payment','Monthly payment'],['annualRate','Annual interest rate (%)']],
  'net-worth-calculator': [['cash','Cash'],['savings','Savings'],['investments','Investments'],['property','Property and other major assets'],['otherAssets','Other assets'],['credit','Credit card balances'],['loans','Loans'],['otherDebts','Other liabilities']],
  'freelancer-income-calculator': [['gross','Total freelance income in the period'],['monthsWorked','Number of months worked'],['businessCosts','Total business costs in that period'],['reservePercent','Reserve percentage (%)']],
};

export const tools = [
  { slug: 'budget-calculator', title: 'Monthly Budget Calculator', description: 'Add income, essential costs and savings to see what remains.', icon: 'PieChart' },
  { slug: 'savings-goal-calculator', title: 'Savings Goal Calculator', description: 'Estimate how long a target may take at your planned contribution.', icon: 'Target' },
  { slug: 'expense-split-calculator', title: 'Expense Split Calculator', description: 'Work out an equal share for a group expense.', icon: 'Users' },
  { slug: 'emergency-fund-calculator', title: 'Emergency Fund Calculator', description: 'Model a reserve from your essential monthly expenses.', icon: 'ShieldCheck' },
  { slug: 'debt-repayment-calculator', title: 'Debt Repayment Calculator', description: 'Estimate a payoff time using a balance, payment and rate.', icon: 'HandCoins' },
  { slug: 'net-worth-calculator', title: 'Net Worth Calculator', description: 'Compare what you own with your current liabilities.', icon: 'Scale' },
  { slug: 'freelancer-income-calculator', title: 'Freelancer Income Calculator', description: 'Average irregular income and planned business reserves.', icon: 'BriefcaseBusiness' },
];
import { toMinor, fromMinor } from '../../../shared/utils/money';
