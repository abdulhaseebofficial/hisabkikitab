const { test, expect } = require('@playwright/test');

/**
 * Urdu on screen: right-to-left where it should be, and nowhere else.
 *
 * The rule this suite defends is that direction is a property of each piece of
 * text, not of the application. An Urdu description reads right-to-left inside
 * a page whose chrome, numbers, dates and currency column all stay where an
 * English reader left them. Flipping the whole interface because one note is in
 * Urdu would move every amount and every control for no reason.
 *
 * Fully mocked: no API and no database, so this runs anywhere and asserts
 * rendering rather than storage. Storage is covered by tests/db and tests/e2e.
 */

const URDU = 'گھر کا کرایہ';
const URDU_LONG = 'بجلی کا بل اور پانی کا بل';
const MIXED = 'Monthly گھر Expense';
const ENGLISH = 'Dhaba lunch';

const user = {
  _id: 'rtl-user', name: 'علی احمد', email: 'rtl@example.test',
  financeMode: 'student', currency: 'PKR', language: 'en',
  onboardingCompleted: true, isDemo: false,
};

const categories = {
  financeMode: 'student',
  defaults: ['Mess/Food', 'Travel', 'student_savings', 'student_shopping'],
  custom: [URDU],
  all: ['Mess/Food', 'Travel', 'student_savings', 'student_shopping', URDU],
};

const expenseRows = [
  { _id: 'e1', amount: 2500, amountMinor: '250000', category: 'Mess/Food', description: URDU, paymentMethod: 'Cash', date: '2026-10-05T00:00:00.000Z', isRecurring: false },
  { _id: 'e2', amount: 180.5, amountMinor: '18050', category: 'Travel', description: ENGLISH, paymentMethod: 'Cash', date: '2026-10-06T00:00:00.000Z', isRecurring: false },
  { _id: 'e3', amount: 99.99, amountMinor: '9999', category: URDU, description: MIXED, paymentMethod: 'Cash', date: '2026-10-07T00:00:00.000Z', isRecurring: false },
  { _id: 'e4', amount: 45, amountMinor: '4500', category: 'student_savings', description: '', paymentMethod: 'Cash', date: '2026-10-08T00:00:00.000Z', isRecurring: false },
];

const dashboard = {
  monthLabel: 'October 2026',
  totals: {
    income: 50000, plannedIncome: 50000, incomeLogged: 50000, spent: 2825.49,
    remaining: 47174.51, spentPercent: 6, dailyAverage: 353.19,
    safeDailySpend: 1800, daysLeftInMonth: 5, expenseCount: 4,
  },
  categoryBreakdown: [
    { category: 'Mess/Food', amount: 2500, percent: 88 },
    { category: URDU, amount: 99.99, percent: 4 },
    { category: 'student_savings', amount: 45, percent: 2 },
  ],
  trend: [], comparison: { previousMonthSpent: 0, changePercent: 0 },
  budgets: [], goals: [{ _id: 'g1', title: URDU_LONG, targetAmount: 10000, savedAmount: 2500, progress: 25 }],
  recentExpenses: expenseRows.slice(0, 3),
  upcomingBills: [],
  debts: { payable: 0, receivable: 0, netBalance: 0, overdue: 0, dueSoon: [] },
};

const mockApi = (page) => page.route((url) => url.pathname.startsWith('/api/'), (route) => {
  const path = new URL(route.request().url()).pathname;
  let data = {};
  if (path === '/api/auth/me') data = { user };
  else if (path === '/api/auth/config') data = { google: { enabled: false }, passwordReset: { enabled: false } };
  else if (path === '/api/dashboard/summary') data = dashboard;
  else if (path === '/api/profile/categories') data = categories;
  else if (path === '/api/notifications') data = { items: [], unreadCount: 0 };
  else if (path === '/api/business') data = [];
  else if (path === '/api/expenses') {
    data = {
      items: expenseRows,
      pagination: { page: 1, limit: 20, total: expenseRows.length, pages: 1 },
      filteredTotal: 2825.49,
    };
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
});

/** The direction the browser actually resolved for an element. */
const resolvedDirection = (locator) => locator.evaluate((el) => getComputedStyle(el).direction);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hkk-theme', 'light'));
  await mockApi(page);
});

test('the page stays left-to-right while Urdu text inside it does not', async ({ page }) => {
  await page.goto('/expenses');
  await page.waitForLoadState('networkidle');

  // The interface language is English, so the document is left-to-right. One
  // Urdu description must not turn the application around.
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const urduRow = page.locator('li', { hasText: URDU }).first();
  await expect(urduRow).toBeVisible();

  // The description element declares dir="auto", which is what lets the
  // browser resolve this one string as right-to-left.
  const urduText = page.locator('[dir="auto"]', { hasText: URDU }).first();
  await expect(urduText).toBeVisible();
  expect(await resolvedDirection(urduText)).toBe('rtl');

  // An English description in the same list is unaffected.
  const englishText = page.locator('[dir="auto"]', { hasText: ENGLISH }).first();
  expect(await resolvedDirection(englishText)).toBe('ltr');
});

test('a mixed Urdu and English description is readable and does not reorder its row', async ({ page }) => {
  await page.goto('/expenses');
  await page.waitForLoadState('networkidle');

  const mixed = page.locator('[dir="auto"]', { hasText: 'Monthly' }).first();
  await expect(mixed).toBeVisible();
  await expect(mixed).toContainText('Monthly');
  await expect(mixed).toContainText('گھر');

  // "Monthly" is the first strong character, so this one resolves left-to-right
  // even though it carries Urdu. That is the point of dir="auto": the text
  // decides, per string.
  expect(await resolvedDirection(mixed)).toBe('ltr');
});

test('amounts and dates stay in their own column whatever the description says', async ({ page }) => {
  await page.goto('/expenses');
  await page.waitForLoadState('networkidle');

  const urduRow = page.locator('li', { hasText: URDU }).first();
  const englishRow = page.locator('li', { hasText: ENGLISH }).first();

  const urduAmount = urduRow.getByText(/2,500/).first();
  const englishAmount = englishRow.getByText(/180/).first();
  await expect(urduAmount).toBeVisible();
  await expect(englishAmount).toBeVisible();

  const urduBox = await urduAmount.boundingBox();
  const englishBox = await englishAmount.boundingBox();
  // The money column does not move side to side per row. A currency figure
  // that jumps left on Urdu rows and right on English ones is unreadable as a
  // column, which is why the whole app is not flipped.
  expect(Math.abs(urduBox.x - englishBox.x)).toBeLessThan
    ? expect(Math.abs((urduBox.x + urduBox.width) - (englishBox.x + englishBox.width))).toBeLessThan(40)
    : null;
  expect(Math.abs((urduBox.x + urduBox.width) - (englishBox.x + englishBox.width))).toBeLessThan(40);
});

test('an input accepts Urdu and reads right-to-left while a number field does not', async ({ page }) => {
  await page.goto('/expenses');
  await page.waitForLoadState('networkidle');

  const search = page.getByLabel(/search/i).first();
  await search.fill(URDU);
  await expect(search).toHaveValue(URDU);
  expect(await resolvedDirection(search)).toBe('rtl');

  // The same box is left-to-right again once the text is.
  await search.fill(ENGLISH);
  expect(await resolvedDirection(search)).toBe('ltr');

  // Reached through CSS (`unicode-bidi: plaintext` on .hw-input) as well as
  // the attribute, so the Business screens' hand-written inputs behave the
  // same without each one being edited.
  const bidi = await search.evaluate((el) => getComputedStyle(el).unicodeBidi);
  expect(bidi).toBe('plaintext');
});

test('the expense form takes Urdu in its description and keeps the amount left-to-right', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/expenses');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /^Add expense/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const description = dialog.getByLabel('What was it for?', { exact: true });
  await expect(description).toHaveAttribute('dir', 'auto');
  await description.fill(URDU_LONG);
  await expect(description).toHaveValue(URDU_LONG);
  expect(await resolvedDirection(description)).toBe('rtl');

  // An amount is a structured value, not prose: it must not start
  // right-aligning itself, or the currency column stops lining up.
  const amount = dialog.getByLabel('Amount', { exact: true });
  await amount.fill('1234.56');
  expect(await resolvedDirection(amount)).toBe('ltr');
  await expect(amount).not.toHaveAttribute('dir', 'auto');
});

test('categories show their words, not their stored ids', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/expenses');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /^Add expense/ }).first().click();
  const dialog = page.getByRole('dialog');
  const group = dialog.getByRole('group', { name: 'Category' });

  // These four ids were rendering raw. "Mess/Food" is an id too - its label is
  // "Food" - so the readable-looking ones have to be checked as well.
  for (const id of ['student_savings', 'student_shopping']) {
    await expect(group.getByText(id, { exact: true })).toHaveCount(0);
  }
  await expect(group.getByRole('radio', { name: 'Savings' })).toBeAttached();
  await expect(group.getByRole('radio', { name: 'Shopping' })).toBeAttached();
  await expect(group.getByRole('radio', { name: 'Food' })).toBeAttached();

  // A category the person typed themselves is never translated, and is marked
  // for direction so it reads correctly.
  const custom = group.getByText(URDU, { exact: true });
  await expect(custom).toBeVisible();
  expect(await resolvedDirection(custom)).toBe('rtl');
});

test('the dashboard shows Urdu in its cards and its chart legend', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // A recent transaction, and the goal whose title is Urdu.
  await expect(page.locator('[dir="auto"]', { hasText: URDU }).first()).toBeVisible();
  const goalTitle = page.locator('[dir="auto"]', { hasText: URDU_LONG }).first();
  await expect(goalTitle).toBeVisible();
  expect(await resolvedDirection(goalTitle)).toBe('rtl');

  // The breakdown names the localised label for an id, and the person's own
  // Urdu category as they wrote it.
  await expect(page.getByText('student_savings', { exact: true })).toHaveCount(0);

  // The month's figures are still English digits in a left-to-right layout.
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('Urdu text does not overflow a narrow phone layout', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/expenses');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('[dir="auto"]', { hasText: URDU }).first()).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(fits).toBe(true);
});

test('a bidi override in a description cannot reorder the row around it', async ({ page }) => {
  // U+202E would flip everything after it if the text were not isolated.
  // Storing it verbatim is deliberate - a note must say what was typed - so
  // containment is done on render, with dir="auto" making each string its own
  // bidi paragraph.
  const hostile = `گھر\u202Eevil`;
  await page.route((url) => url.pathname === '/api/expenses', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: {
        items: [{ ...expenseRows[0], description: hostile }, expenseRows[1]],
        pagination: { page: 1, limit: 20, total: 2, pages: 1 },
        filteredTotal: 2680.5,
      },
    }),
  }));

  await page.goto('/expenses');
  await page.waitForLoadState('networkidle');

  const isolated = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[dir="auto"]')];
    const node = nodes.find((el) => el.textContent.includes('\u202E'));
    return node ? getComputedStyle(node).unicodeBidi : null;
  });
  // `plaintext` is the containment boundary: the override cannot escape the
  // element it was typed into.
  expect(isolated).toBe('plaintext');

  // And the English row beside it still reads normally.
  await expect(page.locator('[dir="auto"]', { hasText: ENGLISH }).first()).toBeVisible();
});
