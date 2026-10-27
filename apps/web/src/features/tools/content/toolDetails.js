export const toolDetails = {
  'budget-calculator': {
    formTitle: 'Monthly Income & Expense Breakdown',
    resultsTitle: 'Cash Flow & Remaining Balance Summary',
    howItWorksTitle: 'Income, Living Expenses & Savings Formula',
    ctaTitle: 'Turn Your Monthly Budget into Daily Tracking',
    guestCtaText: 'Start Tracking Your Monthly Budget',
    memberActionText: 'Open Budget Planner',
    memberTo: '/budget',
    explanation: 'This calculator evaluates your net monthly cash flow by subtracting your total fixed living expenses and planned savings from your reliable take-home income. Any positive remainder acts as an unallocated safety buffer for discretionary spending or additional debt reduction.',
    formula: 'Remaining Cash Flow = Take-Home Income - (Total Living Expenses + Planned Savings)',
    workedExample: {
      intro: 'A salaried professional in Pakistan earning PKR 100,000 net take-home per month allocates:',
      details: 'Rent (PKR 30,000) + Utilities & Food (PKR 35,000) + Transport & Education (PKR 15,000) + Planned Savings (PKR 10,000) = Total Expenses & Savings PKR 90,000. Remaining flexible buffer = PKR 10,000.',
    },
    commonMistakes: [
      'Using gross salary instead of net take-home pay after tax and retirement deductions.',
      'Forgetting irregular but recurring costs such as annual school fees or vehicle maintenance.',
      'Setting spending limits too strictly without leaving a flexible contingency buffer.',
    ],
    faqs: [
      {
        question: 'What is a healthy savings percentage for a monthly budget?',
        answer: 'A standard benchmark is 15% to 20% of net take-home pay, but in high-inflation environments starting consistently at 10% or even 5% builds the financial habit effectively.'
      },
      {
        question: 'What should I do if my remaining balance is negative?',
        answer: 'A negative balance indicates a monthly deficit. Review non-essential categories (entertainment, shopping) first, or explore supplemental income to prevent accumulating debt.'
      }
    ],
  },
  'savings-goal-calculator': {
    formTitle: 'Target Goal, Current Reserve & Monthly Deposit',
    resultsTitle: 'Projected Target Timeline & Completion Schedule',
    howItWorksTitle: 'Target Capital & Fixed Contribution Formula',
    ctaTitle: 'Track and Reach Your Savings Goals with HisabKi Kitab',
    guestCtaText: 'Create Your Free Savings Goal',
    memberActionText: 'Open Savings Goals',
    memberTo: '/goals',
    explanation: 'This calculation determines the number of months required to reach a specific financial target by subtracting your current accumulated reserve from your target amount, then dividing the remaining balance by your regular monthly contribution.',
    formula: 'Months to Target = Math.ceil((Target Amount - Current Savings) / Monthly Contribution)',
    workedExample: {
      intro: 'Planning a PKR 300,000 reserve with PKR 60,000 already saved in your bank account:',
      details: 'Remaining amount to build = PKR 240,000. At a consistent monthly contribution of PKR 15,000, your estimated timeline is exactly 16 months (1 year and 4 months).',
    },
    commonMistakes: [
      'Assuming constant income without factoring in unexpected emergencies during the timeline.',
      'Leaving monthly savings in an everyday spending account where they can easily be spent.',
      'Stopping contributions entirely during expensive months instead of contributing a smaller amount.',
    ],
    faqs: [
      {
        question: 'What happens if I cannot contribute in a specific month?',
        answer: 'Your timeline will simply extend by the missed contribution. In HisabKi Kitab, goals adapt dynamically to real contribution dates.'
      },
      {
        question: 'Does this calculator account for bank profits or inflation?',
        answer: 'This provides a straightforward capital accumulation baseline. For long-term goals (over 3 years), consider low-risk profit-bearing accounts to counter inflation.'
      }
    ],
  },
  'expense-split-calculator': {
    formTitle: 'Total Group Expense & Participant Count',
    resultsTitle: 'Equal Per-Person Cost Breakdown',
    howItWorksTitle: 'Equal Shared Living Expense Division',
    ctaTitle: 'Manage Roommate and Shared Living Expenses Fairly',
    guestCtaText: 'Organize Shared Living Expenses',
    memberActionText: 'Open Shared Living Hub',
    memberTo: '/dashboard?section=daily',
    explanation: 'This calculator divides shared apartment rent, utility bills, or communal group grocery costs equally across all active roommates or household members, ensuring clear accountability and zero confusion.',
    formula: 'Individual Share = Total Shared Expense / Number of Participants',
    workedExample: {
      intro: 'Three university students or young professionals sharing an apartment receive combined monthly bills of PKR 45,000:',
      details: 'Total PKR 45,000 divided by 3 people equals exactly PKR 15,000 per roommate. Any fractional cent remainder is allocated transparently.',
    },
    commonMistakes: [
      'Delaying expense settlement until the end of the month when receipts get lost.',
      'Failing to agree on shared communal supplies versus individual personal groceries.',
      'Not maintaining a transparent written ledger of who paid what.',
    ],
    faqs: [
      {
        question: 'How do we handle expenses when one person pays upfront?',
        answer: 'Record the full bill and note the paying member. The other participants then settle their individual shares directly with the payer.'
      },
      {
        question: 'Can unequal splits be tracked in HisabKi Kitab?',
        answer: 'Yes, HisabKi Kitab Shared Living mode supports customized member contribution ratios and settlement records.'
      }
    ],
  },
  'emergency-fund-calculator': {
    formTitle: 'Essential Living Expenses & Months of Coverage',
    resultsTitle: 'Safety Reserve Target & Gap Analysis',
    howItWorksTitle: 'Essential Baseline & Target Reserve Multiplier',
    ctaTitle: 'Protect Your Household with a Structured Emergency Reserve',
    guestCtaText: 'Build Your Emergency Reserve in HisabKi Kitab',
    memberActionText: 'Set Emergency Goal',
    memberTo: '/goals',
    explanation: 'An emergency fund is a dedicated financial buffer designed to protect you and your family against unforeseen events such as job transitions, medical needs, or urgent home repairs without resorting to high-interest loans.',
    formula: 'Emergency Target = Essential Monthly Costs * Desired Months of Coverage',
    workedExample: {
      intro: 'A household with essential monthly expenses (rent, basic groceries, utilities, school fees) of PKR 50,000 planning 6 months of coverage:',
      details: 'Estimated Target = PKR 50,000 * 6 = PKR 300,000. With PKR 80,000 currently in reserve, the amount left to build is PKR 220,000.',
    },
    commonMistakes: [
      'Including luxury or discretionary entertainment expenses in essential cost calculations.',
      'Keeping emergency funds locked in non-liquid assets or volatile investments.',
      'Using the emergency reserve for planned predictable expenses like holidays or shopping.',
    ],
    faqs: [
      {
        question: 'How many months of emergency reserve should I maintain?',
        answer: 'Salaried employees with stable roles typically aim for 3 to 6 months. Freelancers, contractors, and business owners should aim for 6 to 9 months.'
      },
      {
        question: 'Where should an emergency fund be stored?',
        answer: 'In a safe, highly liquid account such as a separate savings account or money market fund with instant access without penalties.'
      }
    ],
  },
  'debt-repayment-calculator': {
    formTitle: 'Current Debt Balance, Payment & Interest Rate',
    resultsTitle: 'Projected Payoff Timeline & Monthly Summary',
    howItWorksTitle: 'Debt Amortization & Monthly Payoff Engine',
    ctaTitle: 'Keep Accurate Records of Personal Lending and Borrowing',
    guestCtaText: 'Track Personal Lending & Borrowing',
    memberActionText: 'Open Lending & Debts Ledger',
    memberTo: '/debts',
    explanation: 'This calculator models the number of monthly installments required to fully eliminate an outstanding personal loan or debt balance, verifying that your monthly payment exceeds the interest generated each month.',
    formula: 'Monthly Interest = (Balance * Annual Rate) / 1200; Principal Reduction = Monthly Payment - Monthly Interest',
    workedExample: {
      intro: 'Paying off a personal loan of PKR 100,000 with a monthly payment of PKR 10,000 at 0% interest (personal friendly loan):',
      details: 'Payoff timeline is exactly 10 months. For interest-bearing facilities, the monthly payment must exceed monthly interest charges to reduce principal.',
    },
    commonMistakes: [
      'Paying only the minimum interest charge, which keeps the principal balance permanently unpaid.',
      'Not recording verbal lending agreements with friends or relatives.',
      'Borrowing new funds to settle existing high-interest debts without a structured repayment plan.',
    ],
    faqs: [
      {
        question: 'What if my monthly payment is less than the monthly interest?',
        answer: 'The debt will increase instead of decreasing (negative amortization). The calculator requires your payment to exceed monthly interest charges.'
      },
      {
        question: 'Can I track interest-free informal loans in HisabKi Kitab?',
        answer: 'Yes, HisabKi Kitab has dedicated lend/borrow tracking tailored for informal Qarz-e-Hasana and personal peer-to-peer records.'
      }
    ],
  },
  'net-worth-calculator': {
    formTitle: 'Financial Assets & Outstanding Liabilities',
    resultsTitle: 'Estimated Net Worth & Financial Balance Sheet',
    howItWorksTitle: 'Comprehensive Asset and Liability Evaluation',
    ctaTitle: 'Monitor Your Net Worth and Financial Health Over Time',
    guestCtaText: 'Track Assets & Liabilities Free',
    memberActionText: 'View Financial Reports',
    memberTo: '/reports',
    explanation: 'Net worth is the single most comprehensive snapshot of your financial health. It represents the total market value of everything you own (assets) minus everything you owe to third parties (liabilities).',
    formula: 'Net Worth = Total Assets (Cash + Savings + Investments + Property) - Total Liabilities (Loans + Credit Balances)',
    workedExample: {
      intro: 'An individual possessing cash and bank savings of PKR 250,000, investments of PKR 500,000, and a vehicle valued at PKR 1,000,000 (Total Assets: PKR 1,750,000):',
      details: 'With outstanding auto loan balances and credit cards of PKR 450,000 (Total Liabilities), their Estimated Net Worth is PKR 1,300,000.',
    },
    commonMistakes: [
      'Overestimating the resale value of personal electronics and depreciating household items.',
      'Omitting informal personal debts or unpaid bills from the liabilities column.',
      'Focusing solely on monthly salary rather than cumulative wealth growth.',
    ],
    faqs: [
      {
        question: 'How often should I recalculate my net worth?',
        answer: 'Reviewing your net worth once a quarter or twice a year is ideal to track long-term trends without stressing over daily fluctuations.'
      },
      {
        question: 'Is it normal for young professionals to have a low net worth?',
        answer: 'Yes, early in a career with initial educational costs and low initial capital, net worth starts modest and builds over time as debts decrease and savings compound.'
      }
    ],
  },
  'freelancer-income-calculator': {
    formTitle: 'Gross Freelance Billings, Active Months, Costs & Reserves',
    resultsTitle: 'Monthly Average Revenue & Sustainable Net Income',
    howItWorksTitle: 'Irregular Revenue Smoothing & Buffer Allocation',
    ctaTitle: 'Stabilize Your Freelance and Contract Earnings',
    guestCtaText: 'Manage Freelance Income & Expenses',
    memberActionText: 'Track Freelance Income',
    memberTo: '/income',
    explanation: 'Freelancing and independent contracting come with variable income cycles. This calculator averages your total billings and direct business overhead over your active months, then applies a percentage reserve for taxes and slow periods.',
    formula: 'Net Take-Home = (Gross / Active Months) - Average Monthly Costs - (Monthly Gross * Reserve %)',
    workedExample: {
      intro: 'A digital freelancer earning gross revenue of PKR 600,000 over 6 active months (PKR 100,000 average gross per month):',
      details: 'Direct monthly costs (software, high-speed internet, power backup) = PKR 15,000. Applying a 20% tax/lean-period reserve (PKR 20,000) yields an estimated sustainable take-home income of PKR 65,000 per month.',
    },
    commonMistakes: [
      'Treating every client invoice payment as disposable personal spending money.',
      'Neglecting to reserve cash for low-demand seasonal quarters or client payment delays.',
      'Failing to track business-related deductible expenses separately from personal expenses.',
    ],
    faqs: [
      {
        question: 'What percentage should freelancers set aside for reserves?',
        answer: 'Most freelancers aim for 20% to 30% to comfortably cover income tax obligations and maintain a 3-month buffer for dry project spells.'
      },
      {
        question: 'Does this calculator compute local income tax?',
        answer: 'No, it models an illustrative planning reserve percentage chosen by you. Consult a qualified tax advisor for formal tax filing.'
      }
    ],
  },
};
