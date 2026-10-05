/**
 * Demo data seeder.  `npm run seed`
 *
 * Creates (or resets) one demo account with BOTH sets of books filled in: two
 * months of hostel spending on the student side, and two months of household
 * spending - rent, bijli, rashan, school fees - on the householder side.
 *
 * One account rather than two, deliberately. Switching modes in the demo is
 * then a real demonstration of what the feature does: the same person, two
 * completely separate lives, and nothing from one visible in the other. A demo
 * where only the student half had data made the householder dashboard look
 * broken, and a demo where both halves held the same numbers would have hidden
 * the isolation entirely.
 *
 * Amounts and descriptions are sized for Pakistan.
 *
 *   email:    demo@hisabkikitab.app
 *   password: demo1234
 */

require('dotenv').config();
const connectDB = require('../../apps/api/src/infrastructure/database/connect');
const { query, closePool } = require('../../apps/api/src/infrastructure/database/pool');
const usersRepo = require('../../apps/api/src/modules/users/users.repository');
const expensesRepo = require('../../apps/api/src/modules/expenses/expenses.repository');
const incomeRepo = require('../../apps/api/src/modules/income/income.repository');
const goalsRepo = require('../../apps/api/src/modules/goals/goals.repository');
const budgetsRepo = require('../../apps/api/src/modules/budgets/budgets.repository');

const DEMO_EMAIL = 'demo@hisabkikitab.app';

// [category, minAmount, maxAmount, howManyPerMonth, sampleDescriptions]
const PATTERN = [
  ['Mess/Food', 120, 500, 14, ['Canteen chai and paratha', 'Dhaba lunch with friends', 'Late night roll', 'Samosa and drink', 'Biryani outside']],
  ['Travel', 80, 900, 4, ['Rickshaw to campus', 'Careem to the bus stand', 'Daewoo ticket home', 'Shared van fare']],
  ['Mobile/Internet', 600, 1800, 1, ['Monthly internet package', 'Mobile load']],
  ['Books & Stationery', 150, 1200, 2, ['Photocopies of notes', 'Lab file and register', 'Used book from a senior']],
  ['Entertainment', 300, 1000, 3, ['Cricket match with friends', 'Cinema ticket', 'Birthday treat', 'Game top-up']],
  ['Health', 250, 1500, 1, ['Medicines from the pharmacy', 'Doctor visit']],
  ['Personal Care', 200, 1200, 2, ['Salon visit', 'Barber', 'Toiletries and skincare', 'Tailoring']],
  ['Misc', 150, 1000, 2, ['Laundry', 'Printouts', 'Gift for a friend', 'Hostel deposit']],
];

/**
 * The household month. Nothing here overlaps the student list above - not a
 * category, not a description, not an amount range. A household's month is
 * mostly large and fixed where a student's is small and frequent, and the two
 * patterns say so.
 */
const HOUSEHOLD_PATTERN = [
  ['groceries', 1200, 6000, 8, ['Weekly rashan from the bazaar', 'Sabzi and fruit', 'Flour, rice and daal', 'Milk and eggs', 'Meat for the week']],
  ['transport_fuel', 800, 4000, 4, ['Petrol for the bike', 'CNG top-up', 'Rickshaw for the school run', 'Bus fare']],
  ['dining_out', 900, 3500, 2, ['Family dinner out', 'Friday takeaway', 'Sweets for guests']],
  ['healthcare', 500, 4500, 1, ['Medicines for the month', 'Doctor visit for the little one', 'Lab test']],
  ['clothing', 1500, 7000, 1, ['School uniform', 'Eid clothes', 'Winter jackets']],
  ['guests_events', 1000, 6000, 1, ['Wedding gift', 'Guests over for dinner', 'Milad arrangements']],
  ['personal_care', 400, 1800, 2, ['Barber for the boys', 'Soap, shampoo and detergent', 'Salon visit']],
  ['charity_zakat', 500, 3000, 1, ['Monthly sadqa', 'Help for a relative']],
];

const rand = (min, max) => Math.round(min + Math.random() * (max - min));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * One month of expenses for whichever life is being built.
 *
 * The pattern and the mode are passed in rather than hard-coded, so the two
 * halves of the demo cannot drift into sharing rows by accident - a row is
 * stamped with the mode of the pattern that produced it.
 */
const buildMonthFrom = (userId, year, month, pattern, financeMode) => {
  const rows = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const maxDay =
    year === new Date().getFullYear() && month === new Date().getMonth() + 1
      ? new Date().getDate()
      : daysInMonth;

  pattern.forEach(([category, min, max, perMonth, notes]) => {
    const count = Math.max(1, Math.round(perMonth * (maxDay / daysInMonth)));
    for (let i = 0; i < count; i += 1) {
      rows.push({
        userId,
        financeMode,
        amount: rand(min, max),
        category,
        description: pick(notes),
        paymentMethod: pick(['Cash', 'Cash', 'JazzCash', 'Easypaisa', 'Card']),
        date: new Date(year, month - 1, rand(1, maxDay), rand(8, 22), rand(0, 59)),
      });
    }
  });

  // The fixed monthly bills are NOT added here - they are created once per
  // month by the caller, so a recurring template does not double-count.
  return rows;
};

const buildMonth = (userId, year, month) =>
  buildMonthFrom(userId, year, month, PATTERN, 'student');

const buildHouseholdMonth = (userId, year, month) =>
  buildMonthFrom(userId, year, month, HOUSEHOLD_PATTERN, 'householder');

const run = async () => {
  await connectDB();

  // Deleting the account takes its expenses, income, goals, budgets,
  // notifications and chat with it: every child table is ON DELETE CASCADE.
  const existing = await usersRepo.findByEmail(DEMO_EMAIL);
  if (existing) {
    await usersRepo.remove(existing._id);
    console.log('[seed] removed previous demo data');
  }

  const user = await usersRepo.create({
    // Not "Demo Student": this account has a household too, and the name is
    // what the dashboard says good morning to in both of them.
    name: 'Demo User',
    email: DEMO_EMAIL,
    password: 'demo1234',
    monthlyIncome: 28000,
    currency: 'PKR',
    university: 'University of the Punjab, Lahore',
    hostelName: 'University Hostel, Block C',
  });
  await usersRepo.updateProfile(user._id, { onboardingCompleted: true });

  const now = new Date();
  const thisMonth = { y: now.getFullYear(), m: now.getMonth() + 1 };
  const last =
    now.getMonth() === 0
      ? { y: now.getFullYear() - 1, m: 12 }
      : { y: now.getFullYear(), m: now.getMonth() };

  const expenses = [
    ...buildMonth(user._id, last.y, last.m),
    ...buildMonth(user._id, thisMonth.y, thisMonth.m),
  ];
  await expensesRepo.createMany(expenses);

  // Last month's hostel fee as a plain expense...
  await expensesRepo.create(user._id, {
    financeMode: 'student',
    amount: 9000,
    category: 'Rent/Hostel Fee',
    description: 'Hostel mess and room fee',
    paymentMethod: 'Bank Transfer',
    date: new Date(last.y, last.m - 1, 3, 10, 0),
  });

  // ...and this month's as the live recurring template, which clones itself on
  // the 3rd of next month.
  await expensesRepo.create(user._id, {
    financeMode: 'student',
    amount: 9000,
    category: 'Rent/Hostel Fee',
    description: 'Hostel mess and room fee',
    paymentMethod: 'Bank Transfer',
    date: new Date(thisMonth.y, thisMonth.m - 1, 3, 10, 0),
    isRecurring: true,
    recurringFrequency: 'monthly',
    nextRunAt: new Date(thisMonth.y, thisMonth.m, 3, 10),
  });

  // Midday, not midnight. These land on the 1st, and the app does its month
  // arithmetic in the server's local timezone while the row stores an instant -
  // so a midnight-on-the-1st row seeded from UTC+5 falls into the previous
  // month once the server reading it runs in UTC, and the month's income
  // silently goes missing. Noon survives a shift either way.
  for (const row of [
    { amount: 25000, source: 'Pocket Money', note: 'Sent from home', date: new Date(last.y, last.m - 1, 1, 12) },
    { amount: 25000, source: 'Pocket Money', note: 'Sent from home', date: new Date(thisMonth.y, thisMonth.m - 1, 1, 12) },
    { amount: 3000, source: 'Part-time Job', note: 'Weekend tuition', date: new Date(thisMonth.y, thisMonth.m - 1, 12, 12) },
  ]) {
    await incomeRepo.create(user._id, { ...row, financeMode: 'student' });
  }

  // goalsRepo.create sets is_completed from the saved amount, so the fully
  // funded emergency fund comes out already marked done.
  for (const goal of [
    {
      title: 'Laptop for final year project',
      targetAmount: 120000,
      savedAmount: 28000,
      deadline: new Date(now.getFullYear(), now.getMonth() + 6, 1),
      icon: '💻',
      note: 'A used one is fine',
    },
    {
      title: 'Northern areas trip with friends',
      targetAmount: 25000,
      savedAmount: 9000,
      deadline: new Date(now.getFullYear(), now.getMonth() + 2, 15),
      icon: '🏖',
    },
    {
      title: 'Emergency fund',
      targetAmount: 10000,
      savedAmount: 10000,
      deadline: null,
      icon: '🛡',
    },
  ]) {
    await goalsRepo.create(user._id, goal);
  }

  await budgetsRepo.upsertMany(
    user._id,
    'student',
    [
      ['Mess/Food', 6000],
      ['Rent/Hostel Fee', 9000],
      ['Travel', 1500],
      ['Books & Stationery', 1500],
      ['Mobile/Internet', 1500],
      ['Entertainment', 1500],
      ['Health', 1200],
      ['Personal Care', 1200],
      ['Misc', 1500],
    ].map(([category, limit]) => ({ category, limit })),
    thisMonth.m,
    thisMonth.y
  );

  /* ===================== the household side ========================= */

  await expensesRepo.createMany([
    ...buildHouseholdMonth(user._id, last.y, last.m),
    ...buildHouseholdMonth(user._id, thisMonth.y, thisMonth.m),
  ]);

  // Last month's fixed bills, already paid.
  for (const [amount, category, description, day] of [
    [35000, 'house_rent', 'Monthly house rent', 2],
    [9500, 'electricity_bill', 'Bijli bill', 3],
    [2200, 'gas_bill', 'Sui gas bill', 16],
    [1400, 'water_bill', 'Water charges', 12],
    [4500, 'internet', 'Home internet', 11],
    [18000, 'school_fees', 'School fees for two', 6],
  ]) {
    await expensesRepo.create(user._id, {
      financeMode: 'householder',
      amount,
      category,
      description,
      paymentMethod: 'Bank Transfer',
      date: new Date(last.y, last.m - 1, day, 11, 0),
    });
  }

  // This month's, as live recurring templates. These are what the householder
  // dashboard shows under "upcoming and unpaid bills", and what the tick box
  // on that card marks off - so the demo has something real to press.
  for (const [amount, category, description, day] of [
    [35000, 'house_rent', 'Monthly house rent', 2],
    [9500, 'electricity_bill', 'Bijli bill', 3],
    [2200, 'gas_bill', 'Sui gas bill', 16],
    [1400, 'water_bill', 'Water charges', 12],
    [4500, 'internet', 'Home internet', 11],
    [18000, 'school_fees', 'School fees for two', 6],
  ]) {
    await expensesRepo.create(user._id, {
      financeMode: 'householder',
      amount,
      category,
      description,
      paymentMethod: 'Bank Transfer',
      date: new Date(thisMonth.y, thisMonth.m - 1, day, 11, 0),
      isRecurring: true,
      recurringFrequency: 'monthly',
      nextRunAt: new Date(thisMonth.y, thisMonth.m, day, 11),
    });
  }

  // Household income: a salary, some rent received, and money sent from abroad.
  // Noon for the same timezone reason as the student rows above.
  for (const row of [
    { amount: 145000, source: 'salary', note: 'Monthly salary', date: new Date(last.y, last.m - 1, 1, 12) },
    { amount: 145000, source: 'salary', note: 'Monthly salary', date: new Date(thisMonth.y, thisMonth.m - 1, 1, 12) },
    { amount: 22000, source: 'rental_income', note: 'Upper portion rent', date: new Date(thisMonth.y, thisMonth.m - 1, 4, 12) },
    { amount: 30000, source: 'remittance', note: 'Sent by brother', date: new Date(thisMonth.y, thisMonth.m - 1, 9, 12) },
  ]) {
    await incomeRepo.create(user._id, { ...row, financeMode: 'householder' });
  }

  // Household budgets, on the household categories. Kept separate from the
  // student limits by the mode column - the same month can hold both.
  await budgetsRepo.upsertMany(
    user._id,
    'householder',
    [
      ['house_rent', 35000],
      ['groceries', 30000],
      ['electricity_bill', 12000],
      ['gas_bill', 3000],
      ['water_bill', 2000],
      ['internet', 5000],
      ['school_fees', 18000],
      ['transport_fuel', 10000],
      ['healthcare', 6000],
      ['dining_out', 5000],
    ].map(([category, limit]) => ({ category, limit })),
    thisMonth.m,
    thisMonth.y
  );

  /* ================================================================== */

  const [{ n }] = await query(`SELECT count(*)::bigint AS n FROM expenses WHERE user_id = $1`, [
    user._id,
  ]);
  const [{ s: studentRows }] = await query(
    `SELECT count(*)::bigint AS s FROM expenses WHERE user_id = $1 AND finance_mode = 'student'`,
    [user._id]
  );
  const [{ h: houseRows }] = await query(
    `SELECT count(*)::bigint AS h FROM expenses WHERE user_id = $1 AND finance_mode = 'householder'`,
    [user._id]
  );

  console.log('');
  console.log('  Demo data ready');
  console.log(`  email     ${DEMO_EMAIL}`);
  console.log('  password  demo1234');
  console.log(`  expenses  ${n} (${studentRows} student, ${houseRows} householder)`);
  console.log('  Switch modes in Settings to see the two sets of books.');
  console.log('');

  await closePool();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('[seed] failed:', err);
  await closePool().catch(() => {});
  process.exit(1);
});
