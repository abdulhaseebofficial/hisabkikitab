export const templates = [
  {
    slug: 'monthly-household-budget',
    title: 'Monthly Household Budget Planner',
    badge: 'Household Finance',
    description: 'A comprehensive, multi-tab offline Excel spreadsheet tailored for families, salaried professionals, and individuals managing everyday money in Pakistan.',
    fileName: 'hisabkikitab-monthly-household-budget.xlsx',
    fileSize: '7.8 KB',
    fileFormat: '.XLSX (Microsoft Excel 2016+, Sheets, Calc)',
    downloadUrl: '/downloads/hisabkikitab-monthly-household-budget.xlsx',
    heroTag: 'Most Popular',
    useCase: 'Families & Salaried Professionals',
    features: [
      '10 localized Pakistani expense categories (Rent, Groceries, LESCO/Gas Utilities, Fuel, Tuition)',
      'Planned budget vs. Actual spending variance with automatic remaining balance calculations',
      'Dedicated Savings Goals tracker with milestone completion forecasts',
      'Executive Financial Summary sheet showing expense ratios, savings rate, and net cash flow buffer',
      'Pre-formatted with Pakistani Rupee (PKR) currency styling and zero complex macros',
    ],
    sampleData: {
      income: 'PKR 105,000',
      expenses: 'PKR 92,000',
      savings: 'PKR 10,000',
      buffer: 'PKR 3,000',
    },
    relatedCalculator: {
      path: '/tools/budget-calculator',
      title: 'Monthly Budget Calculator',
      description: 'Quickly estimate and balance your monthly income, essential expenses, and target savings online.',
    },
    relatedGuide: {
      path: '/learn/budgeting/how-to-create-a-monthly-budget',
      title: 'How to Create a Monthly Budget',
      description: 'A step-by-step beginner guide to building a realistic household budget in Pakistan.',
    },
  },
  {
    slug: 'roommate-hostel-expense-splitter',
    title: 'Roommate & Hostel Expense Splitter',
    badge: 'Shared Living',
    description: 'A mathematical shared expense ledger designed for university hostelites (NUST, FAST, LUMS) and flatmates in Karachi, Lahore, and Islamabad to eliminate bill disputes.',
    fileName: 'hisabkikitab-roommate-hostel-expense-splitter.xlsx',
    fileSize: '8.2 KB',
    fileFormat: '.XLSX (Microsoft Excel 2016+, Sheets, Calc)',
    downloadUrl: '/downloads/hisabkikitab-roommate-hostel-expense-splitter.xlsx',
    heroTag: 'Hostel Favorite',
    useCase: 'Students & Flatmates',
    features: [
      'Supports up to 5 roommates with customizable names and active sharing toggles',
      'Running shared expense log for mess grocery bills, electricity units, and Wi-Fi costs',
      'Automated equal-share calculations using standard SUMIF formulas',
      'Mathematical reconciliation check verifying Total Contributions = Total Expenses',
      'Step-by-step Debt Settlement Ledger with dispute-free pairwise transfers that reconcile strictly to PKR 0.00',
    ],
    sampleData: {
      totalExp: 'PKR 60,000',
      roommates: '3 Active Members',
      sharePerPerson: 'PKR 20,000',
      reconciliation: 'Balanced (PKR 0.00)',
    },
    relatedCalculator: {
      path: '/tools/expense-split-calculator',
      title: 'Expense Split Calculator',
      description: 'Instant online bill splitting to divide dinner or shared hostel purchases equally.',
    },
    relatedGuide: {
      path: '/learn/shared-living/how-to-split-expenses-with-roommates',
      title: 'How to Split Expenses with Roommates',
      description: 'Practical rules, fair contribution frameworks, and communication tips for shared living.',
    },
  },
];

export const templateFaqs = [
  {
    question: 'Can I use these spreadsheet templates completely offline?',
    answer: 'Yes. Both templates are 100% standalone OpenXML (.xlsx) files. Once downloaded, you can open and edit them without an active internet connection in Microsoft Excel, Apple Numbers, or LibreOffice Calc. None of your entered financial data is transmitted to HisabKi Kitab or any external server.',
  },
  {
    question: 'Are these templates compatible with Google Sheets?',
    answer: 'Yes. You can upload the .xlsx file directly to Google Drive and open it with Google Sheets (File > Open > Upload). All mathematical formulas (SUM, SUMIF, COUNTIF, IF, ROUND) and formatting rules are standard and fully compatible between Microsoft Excel and Google Sheets.',
  },
  {
    question: 'Are these spreadsheets safe from macros, VBA, or viruses?',
    answer: 'Yes. Our templates contain zero macros, VBA scripts, executable code, or external data connections. They are published strictly in macro-free OpenXML (.xlsx) format. You will never encounter macro security warnings or execution prompts.',
  },
  {
    question: 'How do I customize the expense categories for my family?',
    answer: 'In the Monthly Household Budget Planner, open the "Monthly Budget" worksheet and simply type over any of the 10 pre-filled category labels in column A. All variance, total, and summary formulas automatically track your custom category names.',
  },
  {
    question: 'How is rounding handled when roommate expenses do not divide evenly?',
    answer: 'If an expense pool is not perfectly divisible by the number of active roommates (e.g., PKR 1,000 divided by 3 equals PKR 333.33 each, leaving a 1 paisa remainder), our documentation recommends that the member who made the primary payment absorbs the fractional paisa, or cash settlements are rounded to the nearest integer rupee since fractional paisa coins are no longer in physical circulation in Pakistan.',
  },
  {
    question: 'What is the difference between these Excel templates and the HisabKi Kitab web app?',
    answer: 'These Excel templates provide manual offline tracking on your personal computer. The HisabKi Kitab web application provides real-time multi-device synchronization, automated receipt management, WhatsApp settlement cards, and AI-driven spending insights without needing to manually edit spreadsheet cells.',
  },
];
