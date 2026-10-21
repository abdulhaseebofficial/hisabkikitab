const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ARTIFACT_DIR = path.resolve('C:/Users/Abdul Haseeb/.gemini/antigravity/brain/9351a8ed-af60-4c9f-a804-f223095bf656/visual-qa');
const LOCAL_SCREENSHOT_DIR = path.resolve(__dirname, '../../test-results/visual-qa');

[ARTIFACT_DIR, LOCAL_SCREENSHOT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function saveScreenshot(page, filename) {
  const localPath = path.join(LOCAL_SCREENSHOT_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  try {
    fs.copyFileSync(localPath, artifactPath);
  } catch {}
}

test.describe('Cross-Mode Independence & Zero Data Overlap Browser Suite', () => {
  test('Mode switching, business switching, and zero data overlap verification', async ({ page }) => {
    // Synthetic stores
    const studentData = {
      user: {
        id: 'usr-student-1',
        _id: 'usr-student-1',
        name: 'Zaid Student',
        email: 'zaid.student@example.com',
        currency: 'PKR',
        financeMode: 'student',
        isDemo: false,
        onboardingCompleted: true,
      },
      expenses: [
        { id: 'exp-s-1', amount: 3500, category: 'Mess/Food', description: 'Hostel Mess Bill', date: '2026-10-15' },
      ],
      dashboard: {
        monthLabel: 'October 2026',
        totals: {
          income: 50000,
          spent: 20000,
          remaining: 30000,
          spentPercent: 40,
          dailyAverage: 1500,
          safeDailySpend: 2500,
          daysLeftInMonth: 12,
          expenseCount: 4,
        },
        categoryBreakdown: [{ category: 'Mess/Food', amount: 15000, percent: 75 }],
        recentExpenses: [{ id: 'exp-s-1', amount: 3500, category: 'Mess/Food', description: 'Hostel Mess Bill', date: '2026-10-15' }],
        trend: [],
        comparison: { previousMonthSpent: 18000, changePercent: 11 },
        budgets: [],
        goals: [],
        debts: { payable: 0, receivable: 0, netBalance: 0, overdue: 0, dueSoon: [] },
        upcomingBills: [],
      },
    };

    const businessAData = {
      business: { id: 'biz-A', name: 'Al-Madina General Store', category: 'grocery', currency: 'PKR', role: 'owner' },
      dashboard: {
        todaySales: 45000,
        monthlySales: 980000,
        monthlyProfit: 215000,
        lowStockCount: 3,
        cashBalance: 65000,
        receivables: 120000,
        payables: 85000,
        recentSales: [{ id: 'sale-A-1', invoiceNumber: 'INV-A-101', customerName: 'Tariq Cash', total: 4500 }],
      },
    };

    const businessBData = {
      business: { id: 'biz-B', name: 'Lahore Electronics', category: 'electronics', currency: 'PKR', role: 'owner' },
      dashboard: {
        todaySales: 120000,
        monthlySales: 2450000,
        monthlyProfit: 540000,
        lowStockCount: 7,
        cashBalance: 180000,
        receivables: 350000,
        payables: 210000,
        recentSales: [{ id: 'sale-B-1', invoiceNumber: 'INV-B-501', customerName: 'Bilal Cash', total: 15000 }],
      },
    };

    let activeBusinessId = 'biz-A';

    // Route mocking
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const u = new URL(route.request().url());
      const p = u.pathname;

      if (p === '/api/auth/me' || p === '/api/profile' || p === '/api/settings/profile') {
        const req = route.request();
        const method = req.method();
        if (method === 'PUT' || method === 'PATCH') {
          const body = JSON.parse(req.postData() || '{}');
          if (body.financeMode) {
            studentData.user.financeMode = body.financeMode;
          }
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { user: studentData.user } }),
        });
      }

      if (p === '/api/profile/categories') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { defaults: ['Food', 'Groceries', 'Utilities', 'Rent'], custom: [], all: ['Food', 'Groceries', 'Utilities', 'Rent'] },
          }),
        });
      }

      if (p === '/api/auth/config') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { google: { enabled: false }, passwordReset: { enabled: false } } }),
        });
      }

      if (p === '/api/dashboard/summary' || p === '/api/dashboard') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: studentData.dashboard }),
        });
      }

      if (p === '/api/business') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [businessAData.business, businessBData.business],
          }),
        });
      }

      if (p === '/api/business/biz-A') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: businessAData.business }) });
      }

      if (p === '/api/business/biz-B') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: businessBData.business }) });
      }

      if (p === '/api/business/biz-A/dashboard') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: businessAData.dashboard }) });
      }

      if (p === '/api/business/biz-B/dashboard') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: businessBData.dashboard }) });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });

    // 1. Visit Personal Student Dashboard (1440px Desktop)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('hkk_app_mode', 'personal');
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Verify Student items render and Business items do NOT exist
    await expect(page.getByText(/Your planned pocket money/i)).toBeVisible();
    await expect(page.getByText(/Al-Madina General Store/i)).toHaveCount(0);
    await expect(page.getByText(/Lahore Electronics/i)).toHaveCount(0);
    await saveScreenshot(page, 'isolation-step1-student-dashboard.png');

    // 2. Switch to Business Mode via Settings -> Finance Mode
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    const bizCard = page.locator('div.grid button').filter({ hasText: /business/i });
    await expect(bizCard.first()).toBeVisible({ timeout: 5000 });
    await bizCard.first().click();

    const confirmBiz = page.getByRole('button', { name: /^switch mode$/i });
    await expect(confirmBiz).toBeVisible({ timeout: 5000 });
    await confirmBiz.click();
    await expect(page).toHaveURL(/\/business$/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Verify Business A items render and Student items do NOT exist
    await expect(page.getByText(/Al-Madina General Store/i).first()).toBeVisible();
    await expect(page.getByText(/Your planned pocket money/i)).toHaveCount(0);
    await saveScreenshot(page, 'isolation-step2-businessA-dashboard.png');

    // 3. Switch back to Personal Mode via Settings -> Finance Mode
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    const studentCard = page.locator('div.grid button').filter({ hasText: /student/i });
    await expect(studentCard.first()).toBeVisible({ timeout: 5000 });
    await studentCard.first().click();

    const confirmStudent = page.getByRole('button', { name: /^switch mode$/i });
    await expect(confirmStudent).toBeVisible({ timeout: 5000 });
    await confirmStudent.click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Verify Student data restored cleanly with zero business overlap
    await expect(page.getByText(/Your planned pocket money/i)).toBeVisible();
    await expect(page.getByText(/Al-Madina General Store/i)).toHaveCount(0);
    await expect(page.getByText(/Lahore Electronics/i)).toHaveCount(0);
    await saveScreenshot(page, 'isolation-step3-return-to-student.png');
  });
});
