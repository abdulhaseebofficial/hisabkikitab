const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '../../apps/web/src/features/learn/content/articles');
const articles = fs.readdirSync(directory).map((file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')));
const categories = ['saving', 'earning', 'budgeting', 'personal-finance', 'household', 'shared-living', 'lending-borrowing', 'freelancing', 'small-business', 'financial-habits'];

test.beforeEach(async ({ page }) => {
  // Public content must work even when no finance API/session is available.
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Not authenticated"}' }));
  await page.addInitScript(() => localStorage.setItem('hw-theme', 'dark'));
});

test('all public routes render, have metadata, and fit the viewport', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const calculatorRoutes=['budget-calculator','savings-goal-calculator','expense-split-calculator','emergency-fund-calculator','debt-repayment-calculator','net-worth-calculator','freelancer-income-calculator'].map((slug)=>`/tools/${slug}`);
  for (const route of ['/', '/learn', '/tools', ...calculatorRoutes, ...categories.map((category) => `/learn/${category}`), ...articles.map((article) => `/learn/${article.category}/${article.slug}`)]) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Your session expired. Please log in again.')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${route === '/' ? '/$' : route + '$'}`));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('budget calculator handles valid and invalid values without NaN', async ({ page }) => {
  await page.goto('/tools/budget-calculator');
  await page.getByLabel('Monthly take-home income').fill('60000');
  for(const [name,value] of [['Rent','18000'],['Utilities','4000'],['Food','12000'],['Transport','3000'],['Education','2000'],['Debt payments','3000'],['Shopping','1000'],['Entertainment','1000'],['Other expenses','1000'],['Planned savings','5000']]) await page.getByLabel(name).fill(value);
  await page.getByRole('button',{name:'Calculate'}).click();
  await expect(page.getByText('PKR 10,000')).toBeVisible();
  await expect(page.getByText(/NaN/)).toHaveCount(0);
  await page.getByLabel('Rent').fill('-10');
  await page.getByRole('button',{name:'Calculate'}).click();
  await expect(page.getByLabel('Rent')).toHaveJSProperty('validity.valid',false);
});

test('all seven calculators cover values, validation, accuracy, overflow and reset', async ({ page }) => {
  const scenarios = [
    { slug:'budget-calculator', values:[['Monthly take-home income','60000'],['Rent','18000'],['Utilities','4000'],['Food','12000'],['Transport','3000'],['Education','2000'],['Debt payments','3000'],['Shopping','1000'],['Entertainment','1000'],['Other expenses','1000'],['Planned savings','5000']], expected:'PKR 10,000' },
    { slug:'savings-goal-calculator', values:[['Target amount','120000'],['Current savings','20000'],['Monthly contribution','5000']], expected:'20' },
    { slug:'expense-split-calculator', values:[['Total shared expenses','10000.01'],['Number of people','3']], expected:'3,333.34' },
    { slug:'emergency-fund-calculator', values:[['Essential monthly expenses','30000'],['Months of cover to plan for','6'],['Current emergency savings','50000']], expected:'130,000' },
    { slug:'debt-repayment-calculator', values:[['Current debt balance','100000'],['Monthly payment','10000'],['Annual interest rate (%)','12']], expected:'11' },
    { slug:'net-worth-calculator', values:[['Cash','100'],['Savings','200'],['Investments','300'],['Property and other major assets','400'],['Other assets','50'],['Credit card balances','80'],['Loans','70'],['Other liabilities','20']], expected:'880' },
    { slug:'freelancer-income-calculator', values:[['Total freelance income in the period','120000'],['Number of months worked','4'],['Total business costs in that period','20000'],['Reserve percentage (%)','25']], expected:'18,750' },
  ];
  for (const scenario of scenarios) {
    await page.goto(`/tools/${scenario.slug}`);
    const inputs = page.locator('form input');
    await expect(inputs).toHaveCount(scenario.values.length);
    await page.getByRole('button', { name:'Calculate' }).click();
    await expect(page.locator('form input:invalid')).not.toHaveCount(0);
    for (const [label,value] of scenario.values) await page.getByLabel(label).fill(value);
    await page.getByRole('button', { name:'Calculate' }).click();
    await expect(page.getByRole('heading', { name:'Your estimate' }).locator('xpath=..')).toContainText(scenario.expected);
    await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await page.getByRole('button', { name:'Reset' }).click();
    await expect.poll(() => inputs.evaluateAll((items) => items.every((input) => input.value === ''))).toBe(true);
    await expect(page.getByText('Enter your numbers to see an estimate. Your inputs stay in this browser and are not saved.')).toBeVisible();
    for (const [label] of scenario.values) {
      await page.getByLabel(label).fill('0');
      await expect(page.getByLabel(label)).toHaveJSProperty('validity.valid', true);
    }
    if (scenario.slug === 'expense-split-calculator') await page.getByLabel('Number of people').fill('1');
    if (scenario.slug === 'emergency-fund-calculator') await page.getByLabel('Months of cover to plan for').fill('1');
    if (scenario.slug === 'debt-repayment-calculator') await page.getByLabel('Annual interest rate (%)').fill('0');
    if (scenario.slug === 'freelancer-income-calculator') await page.getByLabel('Number of months worked').fill('1');
    await page.getByRole('button', { name:'Calculate' }).click();
    await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0);
    await page.getByRole('button', { name:'Reset' }).click();
    const firstField = page.getByLabel(scenario.values[0][0]);
    await firstField.fill('-1');
    await expect(firstField).toHaveJSProperty('validity.valid', false);
    await page.getByRole('button', { name:'Reset' }).click();
    for (const [label] of scenario.values) await page.getByLabel(label).fill(/percentage|interest rate/i.test(label) ? '100' : '1e100');
    await page.getByRole('button', { name:'Calculate' }).click();
    await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0);
  }
});

test('calculator pages remain usable at common viewport widths and on refresh', async ({ page }) => {
  for (const width of [360,390,768,1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 820 : 960 });
    for (const slug of ['budget-calculator','savings-goal-calculator','expense-split-calculator','emergency-fund-calculator','debt-repayment-calculator','net-worth-calculator','freelancer-income-calculator']) {
      await page.goto(`/tools/${slug}`);
      await expect(page.getByRole('heading', { level:1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const inputBox = await page.locator('form input').first().boundingBox();
      expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(width);
    }
    await page.goto('/learn/shared-living/how-to-split-expenses-with-roommates');
    await expect(page.getByRole('heading', { level:1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(Number(await page.locator('article .text-base').first().evaluate((node) => getComputedStyle(node).fontSize.replace('px','')))).toBeGreaterThanOrEqual(16);
    await expect(page.locator('article [role="region"] table')).toBeVisible();
  }
  await page.goto('/learn/shared-living/how-to-split-expenses-with-roommates');
  await page.reload();
  await expect(page.getByRole('heading', { level:1 })).toBeVisible();
  await page.goto('/tools/debt-repayment-calculator');
  await page.reload();
  await expect(page.getByRole('heading', { level:1 })).toBeVisible();
});

test('production route loading keeps tools and private entry free of article bodies', async ({ page, context }) => {
  const metric = async (target, route) => {
    const started = Date.now();
    await target.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await (route === '/dashboard' ? target.getByRole('heading', { name: 'Welcome back' }) : target.locator('h1')).waitFor({ timeout: 15000 });
    return { elapsedMs:Date.now()-started, resources:await target.evaluate(() => ({
      jsBytes:performance.getEntriesByType('resource').filter((entry)=>entry.name.endsWith('.js')).reduce((sum,entry)=>sum+entry.transferSize,0),
      scripts:performance.getEntriesByType('resource').filter((entry)=>entry.name.endsWith('.js')).map((entry)=>new URL(entry.name).pathname.split('/').pop()),
      assets:performance.getEntriesByType('resource').map((entry)=>new URL(entry.name).pathname.split('/').pop()),
      fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      lcp:performance.getEntriesByType('largest-contentful-paint').at(-1)?.startTime ?? null,
    })) };
  };
  const tool = await metric(page, '/tools/budget-calculator');
  await expect(page.getByLabel('Monthly take-home income')).toBeVisible();
  expect(tool.resources.scripts.some((name)=>name.startsWith('how-to-'))).toBe(false);
  const article = await metric(page, '/learn/saving/how-to-save-money-every-month');
  await expect(page.getByRole('heading', { name:'How to Save Money Every Month' })).toBeVisible();
  expect(article.resources.assets.some((name)=>name.startsWith('how-to-save-money-every-month'))).toBe(true);
  const privatePage = await context.newPage();
  const privateEntry = await metric(privatePage, '/dashboard');
  expect(privateEntry.resources.assets.some((name)=>name.startsWith('LearnPage') || name.startsWith('how-to-'))).toBe(false);
  console.log(`[route-load] ${JSON.stringify({ toolMs: tool.elapsedMs, articleMs: article.elapsedMs, privateMs: privateEntry.elapsedMs, toolJsBytes: tool.resources.jsBytes, articleJsBytes: article.resources.jsBytes, privateJsBytes: privateEntry.resources.jsBytes, privatePath: new URL(privatePage.url()).pathname })}`);
  await privatePage.close();
});

test('unknown calculator routes are not indexable', async ({ page }) => {
  await page.goto('/tools/not-a-calculator');
  await expect(page.getByRole('heading', { name:'Calculator not found' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
});

test('Learn navigation, table of contents, themes, and missing content', async ({ page, isMobile }) => {
  await page.goto('/learn/budgeting/how-to-create-a-monthly-budget');
  if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: isMobile ? 'Mobile public navigation' : 'Public navigation' });
  await expect(nav.locator('a[href="/learn"]')).toHaveAttribute('aria-current', 'page');
  if (isMobile) {
    await nav.locator('a[href="/learn"]').click();
    await expect(page.getByRole('navigation', { name: 'Mobile public navigation' })).toHaveCount(0);
    await page.goto('/learn/budgeting/how-to-create-a-monthly-budget');
  }
  await page.getByRole('navigation', { name: 'Table of contents' }).getByRole('link', { name: 'The calculation' }).click();
  await expect(page).toHaveURL(/#calculation$/);
  await expect(page.getByRole('heading', { name: 'The calculation' })).toBeInViewport();
  await page.getByRole('button', { name: 'Use light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.goto('/learn/saving/not-a-guide');
  await expect(page.getByRole('heading', { name: 'Guide not found' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
});

test('homepage links and existing private route protection still work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Explore all guides' }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole('heading', { name: 'Explore by category' })).toBeVisible();
  for (const route of ['dashboard', 'expenses', 'income', 'goals', 'debts', 'budget', 'advisor', 'reports', 'settings']) {
    await page.goto(`/${route}`);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('[data-learn-seo]')).toHaveCount(0);
    await expect(page.locator('[data-ad-slot]')).toHaveCount(0);
  }
});

test('public homepage and navigation stay usable at common mobile and desktop widths', async ({ page }) => {
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 820 : 960 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 1024) {
      const menu = page.getByRole('button', { name: 'Open navigation' });
      await expect(menu).toBeVisible();
      await menu.click();
      const nav = page.getByRole('navigation', { name: 'Mobile public navigation' });
      await expect(nav.getByRole('link', { name: 'Guides' })).toBeVisible();
      await nav.getByRole('link', { name: 'Guides' }).click();
    } else {
      await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Guides' }).click();
    }
    await expect(page).toHaveURL(/\/learn$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('tablet article remains readable without horizontal page scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/learn/shared-living/how-to-split-expenses-with-roommates');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
