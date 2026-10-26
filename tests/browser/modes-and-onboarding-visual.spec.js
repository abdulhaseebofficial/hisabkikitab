const { test, expect } = require('@playwright/test');
const { saveScreenshot } = require('./visual-artifacts');

test.describe('Modes and Onboarding Visual Proof Suite', () => {
  test('Capture Onboarding Modal, Original Modes, and Navigation proofs', async ({ page }) => {
    // 1. Mock API for Student Mode
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const u = new URL(route.request().url());
      const p = u.pathname;

      if (p === '/api/auth/me') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              user: {
                id: 'usr-student-1',
                _id: 'usr-student-1',
                name: 'Hamza Student',
                email: 'hamza@example.com',
                currency: 'PKR',
                financeMode: 'student',
                isDemo: false,
                onboardingCompleted: true,
              },
            },
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

      if (p === '/api/dashboard') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              monthLabel: 'October 2026',
              totals: {
                income: 45000,
                spent: 18000,
                remaining: 27000,
                safeDailySpend: 2250,
                daysLeftInMonth: 12,
              },
              categoryBreakdown: [
                { category: 'Mess/Food', amount: 9000, percent: 50 },
                { category: 'Travel', amount: 4500, percent: 25 },
                { category: 'Books/Notes', amount: 4500, percent: 25 },
              ],
              recentExpenses: [],
              trend: [],
            },
          }),
        });
      }

      if (p === '/api/business') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });

    // 1. Student Dashboard (Desktop 1440px)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('hkk_app_mode', 'personal');
    });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await saveScreenshot(page, 'proof-student-dashboard-1440px.png');

    // 2. Mobile Drawer Navigation (390px)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const menuBtn = page.getByRole('button', { name: /open menu/i });
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'proof-mobile-nav-drawer-390px.png');
      const closeBtn = page.getByRole('button', { name: /close navigation/i });
      if (await closeBtn.isVisible()) await closeBtn.click();
    }

    // 3. Desktop Navigation Rail (1440px)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('hkk_app_mode', 'business');
      localStorage.setItem('hkk_active_business_id', 'biz-test-1');
    });
    await page.route('/api/business', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ id: 'biz-test-1', name: 'Al-Madina Traders', category: 'grocery', currency: 'PKR', role: 'owner' }],
        }),
      });
    });
    await page.goto('/business');
    await page.waitForLoadState('networkidle');
    await saveScreenshot(page, 'proof-desktop-business-rail-1440px.png');

    // 4. Onboarding Modal Wizard (1024px)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.route('/api/business', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }), // No businesses triggers onboarding prompt
      });
    });
    await page.goto('/business');
    await page.waitForLoadState('networkidle');
    await saveScreenshot(page, 'proof-onboarding-modal-open-1024px.png');
  });
});
