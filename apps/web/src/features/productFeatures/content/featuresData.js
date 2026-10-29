export const features = [
  {
    slug: 'expense-tracker',
    title: 'Personal Expense Tracker App',
    navLabel: 'Expense Tracker',
    h1: 'Track Your Income and Expenses in One Place',
    metaTitle: 'Personal Expense Tracker App | HisabKi Kitab',
    metaDescription: 'Track your daily income and living expenses in Pakistan. Organize spending by category, follow monthly cash flow, and build healthy money habits with HisabKi Kitab.',
    tagline: 'Simple, clear, and private daily expense management tailored for everyday life in Pakistan.',
    heroCta: 'Start Tracking Expenses Free',
    problem: {
      heading: 'Why Daily Cash Flow Gets Out of Hand',
      paragraphs: [
        'In Pakistan, daily money moves across cash, digital wallets like JazzCash and Easypaisa, and bank accounts. When you buy groceries, pay fuel, or hand out cash for household help, transactions get scattered.',
        'By the middle of the month, account balances look smaller than expected, but without clear records, you cannot pinpoint where money went. Mental math creates false confidence until bills arrive.',
      ],
    },
    capabilities: [
      {
        title: 'Instant Income & Expense Recording',
        description: 'Log any transaction in seconds with date, payment method, category, and notes.',
      },
      {
        title: 'Custom Category Classification',
        description: 'Organize spending under Groceries, Utilities, Rent, Transport, Medical, Education, and Dining.',
      },
      {
        title: 'Running Cash Flow Overview',
        description: 'See total monthly inflow versus outflow at a glance with clear net balance indicators.',
      },
      {
        title: 'Zero Bank Credentials Required',
        description: 'Enter figures manually or track receipts without ever exposing your bank login or card numbers.',
      },
    ],
    workflow: [
      { step: '1', title: 'Record On The Go', description: 'Enter expense amounts as they happen on your phone or computer.' },
      { step: '2', title: 'Assign Categories', description: 'Tag expenses to essential or discretionary categories to see spending patterns.' },
      { step: '3', title: 'Review Monthly Trends', description: 'Check running balances to ensure you stay within your monthly means.' },
    ],
    workedExample: {
      heading: 'A Typical Week of Expense Tracking in Pakistan',
      intro: 'Consider a salaried professional managing weekly routine expenses in Lahore or Karachi:',
      items: [
        ['Monday Commute (Ride / Fuel)', 'PKR 650', 'Transport'],
        ['Weekly Grocery Staples', 'PKR 7,500', 'Groceries'],
        ['Electricity & Gas Bill', 'PKR 14,200', 'Utilities'],
        ['Dining Out with Family', 'PKR 3,400', 'Entertainment'],
        ['Freelance Invoice Received', '+PKR 45,000', 'Income'],
      ],
      summary: 'Net weekly balance: +PKR 19,250 recorded cleanly with full category visibility.',
    },
    relatedCalculator: {
      path: '/tools/budget-calculator',
      title: 'Monthly Budget Calculator',
      description: 'Model your income and essential expenses to determine your unallocated monthly buffer.',
    },
    relatedGuide: {
      path: '/learn/financial-habits/simple-ways-to-track-income-and-expenses',
      title: 'Simple Ways to Track Income and Expenses',
      description: 'Read practical tips on building a daily tracking habit without stress.',
    },
    faqs: [
      {
        question: 'Does HisabKi Kitab require my bank account login?',
        answer: 'No. HisabKi Kitab never connects to your bank account or asks for credentials. You record transactions directly, ensuring total data privacy.'
      },
      {
        question: 'Can I track expenses in Pakistani Rupees (PKR)?',
        answer: 'Yes. HisabKi Kitab is fully optimized for PKR currency, local expense categories, and Pakistani financial contexts.'
      },
      {
        question: 'Can I use the expense tracker on my mobile phone?',
        answer: 'Yes. The web app is fully responsive and installable as a Progressive Web App (PWA) on Android and iOS devices.'
      }
    ],
  },
  {
    slug: 'monthly-budgeting',
    title: 'Monthly Budget Planner App',
    navLabel: 'Budget Planner',
    h1: 'Plan Your Monthly Budget and Manage Spending',
    metaTitle: 'Monthly Budget Planner App | HisabKi Kitab',
    metaDescription: 'Plan your monthly budget, set spending limits by category, and protect your savings in Pakistan. Take control of household cash flow with HisabKi Kitab.',
    tagline: 'Give every rupee a job before the month starts so you never run short before payday.',
    heroCta: 'Create Your Monthly Budget',
    problem: {
      heading: 'The Problem with Reactive Spending',
      paragraphs: [
        'When salary arrives, having money in your account makes it easy to spend freely in the first two weeks. Then, rent, children school fees, or utility bills arrive, leaving you short before the month ends.',
        'A monthly budget plan solves this by deciding your financial priorities on day one, separating essential commitments from flexible spending.',
      ],
    },
    capabilities: [
      {
        title: 'Monthly Category Budget Limits',
        description: 'Set realistic monthly spending ceilings for groceries, fuel, shopping, and utilities.',
      },
      {
        title: 'Proactive 50/30/20 Allocation',
        description: 'Balance essential needs, flexible wants, and planned savings targets effectively.',
      },
      {
        title: 'Budget vs. Actual Comparison',
        description: 'Compare what you planned to spend against your actual expenses in real time.',
      },
      {
        title: 'Buffer for Unplanned Costs',
        description: 'Maintain an unallocated contingency cushion to absorb medical emergencies or vehicle repairs.',
      },
    ],
    workflow: [
      { step: '1', title: 'Enter Take-Home Income', description: 'Start with reliable monthly earnings after tax deductions.' },
      { step: '2', title: 'Allocate Fixed Essentials', description: 'Commit funds for rent, utilities, rations, and debt payments first.' },
      { step: '3', title: 'Set Savings & Discretionary Limits', description: 'Dedicate a portion to savings before setting a flexible spending cap.' },
    ],
    workedExample: {
      heading: 'Realistic Monthly Budget Example (PKR 120,000 Income)',
      intro: 'A household budgeting breakdown based on sound personal finance principles:',
      items: [
        ['Rent & Residential Maintenance', 'PKR 35,000', 'Essential (29%)'],
        ['Kitchen Rations & Groceries', 'PKR 28,000', 'Essential (23%)'],
        ['Electricity, Gas & Water Bills', 'PKR 16,000', 'Essential (13%)'],
        ['Transport / Fuel Costs', 'PKR 12,000', 'Essential (10%)'],
        ['Emergency & Goal Savings', 'PKR 15,000', 'Savings (13%)'],
        ['Flexible Personal Spending', 'PKR 14,000', 'Flexible (12%)'],
      ],
      summary: '100% of income is purposefully assigned, leaving zero unmonitored cash leaks.',
    },
    relatedCalculator: {
      path: '/tools/budget-calculator',
      title: 'Monthly Budget Calculator',
      description: 'Test your budget allocations with our free interactive calculator before creating your account.',
    },
    relatedGuide: {
      path: '/learn/budgeting/how-to-create-a-monthly-budget',
      title: 'How to Create a Monthly Budget',
      description: 'Step-by-step guidance on creating a budget you can actually stick to throughout the month.',
    },
    relatedTemplate: {
      path: '/templates/',
      title: 'Monthly Household Budget Excel Template',
      description: 'Prefer working offline? Download our free, formula-tested .xlsx spreadsheet for household budgeting.',
    },

    faqs: [
      {
        question: 'What if my monthly income varies from month to month?',
        answer: 'Base your initial budget on your lowest reliable average monthly income. Allocate surplus earnings during high-income months straight into your emergency reserve.'
      },
      {
        question: 'Does the budget reset every month?',
        answer: 'You can create and review budgets for each month individually, allowing you to adapt to seasonal expenses like Eid, weddings, or school term starts.'
      }
    ],
  },
  {
    slug: 'shared-living-roommates',
    title: 'Roommate Expense Tracker & Splitter',
    navLabel: 'Shared Living',
    h1: 'Manage Shared Expenses with Roommates and Households',
    metaTitle: 'Roommate Expense Tracker & Splitter | HisabKi Kitab',
    metaDescription: 'Manage shared living costs, apartment rent, hostel expenses and utility bills with roommates in Pakistan. Keep transparent contribution records with HisabKi Kitab.',
    tagline: 'Eliminate awkward roommate money arguments with transparent shared records and settlement tracking.',
    heroCta: 'Organize Shared Living Costs',
    problem: {
      heading: 'The Frustration of Shared Flat & Hostel Expenses',
      paragraphs: [
        'Living with roommates, batchmates in a hostel, or managing a joint family household requires sharing communal bills: rent, electricity, drinking water cans, cook wages, and shared groceries.',
        'When one person pays upfront and others promise to pay later, receipts get misplaced, payments are forgotten, and friendships get strained over unpaid balances.',
      ],
    },
    capabilities: [
      {
        title: 'Dedicated Shared Workspace',
        description: 'Keep shared living expenses completely separate from your private personal finances.',
      },
      {
        title: 'Member Contribution Tracking',
        description: 'Log who paid for each shared expense and who contributed cash to the communal pot.',
      },
      {
        title: 'Running Settlement Balances',
        description: 'Instantly view who is owed money and who has pending balances to clear.',
      },
      {
        title: 'Fair Equal & Custom Splits',
        description: 'Divide shared costs equally across members with full transparency on every item.',
      },
    ],
    workflow: [
      { step: '1', title: 'Create Roommate Group', description: 'Add your flatmates or hostel roommates to the shared space.' },
      { step: '2', title: 'Log Shared Bills', description: 'Record grocery receipts, utility bills, or rent payments as they are paid.' },
      { step: '3', title: 'Settle Up Cleanly', description: 'Check individual balances and record settlements when members pay.' },
    ],
    workedExample: {
      heading: 'Three Roommates Splitting Monthly Flat Expenses in Islamabad',
      intro: 'Transparent division of combined living expenses:',
      items: [
        ['Apartment Rent', 'PKR 45,000', 'Paid by Ahmed'],
        ['Electricity & Internet Bill', 'PKR 12,000', 'Paid by Bilal'],
        ['Shared Kitchen Groceries', 'PKR 15,000', 'Paid by Usman'],
      ],
      summary: 'Total expenses = PKR 72,000 (PKR 24,000 per person). Ahmed is owed PKR 21,000; Bilal owes PKR 12,000; Usman owes PKR 9,000.',
    },
    relatedCalculator: {
      path: '/tools/expense-split-calculator',
      title: 'Expense Split Calculator',
      description: 'Quickly divide any shared bill or group dinner evenly across your group.',
    },
    relatedGuide: {
      path: '/learn/shared-living/how-to-split-expenses-with-roommates',
      title: 'How to Split Expenses with Roommates',
      description: 'Practical ground rules for managing flat finances peacefully and fairly.',
    },
    faqs: [
      {
        question: 'Can my roommates see my personal private finances?',
        answer: 'No. HisabKi Kitab enforces strict data isolation. Your private personal expenses and bank records are never visible to members of your shared living space.'
      },
      {
        question: 'Is this suitable for university hostels and flatshares?',
        answer: 'Yes, it is specifically designed for students, young professionals, and joint family households managing communal costs.'
      }
    ],
  },
  {
    slug: 'lending-borrowing-khata',
    title: 'Personal Lending & Borrowing Tracker',
    navLabel: 'Lend & Borrow',
    h1: 'Keep Clear Records of Money You Lend and Borrow',
    metaTitle: 'Personal Lending & Borrowing Tracker | HisabKi Kitab',
    metaDescription: 'Keep clear personal lending and borrowing records in Pakistan. Track informal loans, Qarz-e-Hasana, and debt repayments with friends and family using HisabKi Kitab.',
    tagline: 'Never forget money you lent or owe. Maintain clear, dignified personal records without awkwardness.',
    heroCta: 'Track Lending & Borrowing Free',
    problem: {
      heading: 'The Risk of Informal Verbal Loans',
      paragraphs: [
        'Helping friends, colleagues, or family members with friendly loans (Qarz-e-Hasana) or borrowing short-term cash during tight months is part of everyday culture in Pakistan.',
        'However, without a written record, memory fades. Asking someone for your money back feels awkward, and forgetting what you owe damages trust. Handwritten notes in pocket diaries get misplaced.',
      ],
    },
    capabilities: [
      {
        title: 'Contact-Wise Ledger',
        description: 'Maintain a dedicated record for each individual you lend money to or borrow money from.',
      },
      {
        title: 'Partial Repayment History',
        description: 'Record partial installments over time and view remaining balances automatically.',
      },
      {
        title: 'Net Lending Position',
        description: 'See total money you are owed versus total money you owe across all personal contacts.',
      },
      {
        title: 'Interest-Free Dignified Tracking',
        description: 'Designed for informal peer-to-peer assistance, preserving clarity and mutual respect.',
      },
    ],
    workflow: [
      { step: '1', title: 'Add Financial Contact', description: 'Create a contact entry for the friend, relative, or peer.' },
      { step: '2', title: 'Record Transaction', description: 'Log the amount lent or borrowed with optional notes and dates.' },
      { step: '3', title: 'Log Repayments', description: 'Record partial or full settlements as money is repaid.' },
    ],
    workedExample: {
      heading: 'Informal Lending Record Example',
      intro: 'Clear record-keeping for personal loans:',
      items: [
        ['Lent to Hamza (Urgent medical aid)', '+PKR 30,000', 'You Lent'],
        ['Hamza Partial Repayment (Cash)', '-PKR 10,000', 'Repayment Received'],
        ['Hamza Current Outstanding Balance', 'PKR 20,000', 'Remaining Receivable'],
        ['Borrowed from Uncle Tariq (Vehicle repair)', '-PKR 15,000', 'You Borrowed'],
      ],
      summary: 'Net lending position: +PKR 5,000 net receivable across personal contacts.',
    },
    relatedCalculator: {
      path: '/tools/debt-repayment-calculator',
      title: 'Debt Repayment Calculator',
      description: 'Model payoff timelines and installment schedules with our free calculation tool.',
    },
    relatedGuide: {
      path: '/learn/lending-borrowing/how-to-track-money-you-lend-and-borrow',
      title: 'How to Track Money You Lend and Borrow',
      description: 'Learn how to handle informal personal loans respectfully while protecting your finances.',
    },
    faqs: [
      {
        question: 'Is this a commercial loan or credit application?',
        answer: 'No. HisabKi Kitab is not a bank or credit lender. It provides a personal private record keeper for informal money you lend or borrow among friends and family.'
      },
      {
        question: 'Does the other person receive notifications or messages?',
        answer: 'No. Your lending records are completely private to your account. We never send messages, reminders, or emails to your contacts.'
      }
    ],
  },
];
