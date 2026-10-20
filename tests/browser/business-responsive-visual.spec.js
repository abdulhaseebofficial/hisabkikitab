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
  } catch {
    // Artifact copy fallback
  }
}

function setupMockBusinessApi(page) {
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const u = new URL(route.request().url());
    const pathname = u.pathname;

    // 1. Auth Me
    if (pathname === '/api/auth/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: 'usr-test-1',
              _id: 'usr-test-1',
              name: 'Zaid Khan',
              email: 'zaid@example.com',
              currency: 'PKR',
              financeMode: 'student',
              isDemo: false,
              onboardingCompleted: true,
            },
          },
        }),
      });
    }

    // 2. Auth Config
    if (pathname === '/api/auth/config') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { google: { enabled: false }, passwordReset: { enabled: false } },
        }),
      });
    }

    // 3. Business List
    if (pathname === '/api/business') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'biz-test-1',
              name: 'Al-Madina Traders',
              category: 'grocery',
              currency: 'PKR',
              city: 'Lahore',
              role: 'owner',
            },
          ],
        }),
      });
    }

    // 4. Single Business
    if (pathname === '/api/business/biz-test-1') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'biz-test-1',
            name: 'Al-Madina Traders',
            category: 'grocery',
            currency: 'PKR',
            city: 'Lahore',
            role: 'owner',
          },
        }),
      });
    }

    // 5. Dashboard
    if (pathname === '/api/business/biz-test-1/dashboard') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            todaySales: 3500000,
            cashBalance: 7500000,
            pendingKhataReceivable: 450000,
            lowStockCount: 2,
          },
        }),
      });
    }

    // 6. POS Products
    if (pathname === '/api/business/biz-test-1/products') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { id: 'p-1', name: 'Basmati Rice 5kg', price_minor: 120000, stock_quantity: 15, barcode: '111' },
            { id: 'p-2', name: 'Cooking Oil 1L', price_minor: 55000, stock_quantity: 40, barcode: '222' },
            { id: 'p-3', name: 'Dal Chana 1kg', price_minor: 28000, stock_quantity: 3, barcode: '333' },
          ],
        }),
      });
    }

    // 7. Categories
    if (pathname === '/api/business/biz-test-1/categories') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ id: 'cat-1', name: 'Groceries' }],
        }),
      });
    }

    // 8. Customers
    if (pathname === '/api/business/biz-test-1/customers') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ id: 'c-1', name: 'Haji Aslam', phone: '03001234567', current_balance_minor: 50000 }],
        }),
      });
    }

    // 9. Shifts
    if (pathname === '/api/business/biz-test-1/shifts/active') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null }),
      });
    }

    // 10. Accounts
    if (pathname === '/api/business/biz-test-1/accounts') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { id: 'acc-1', code: '1010', name: 'Cash in Till', type: 'asset', subtype: 'cash', balance_minor: 2500000 },
            { id: 'acc-2', code: '1020', name: 'Bank Al-Habib', type: 'asset', subtype: 'bank', balance_minor: 5000000 },
          ],
        }),
      });
    }

    // 11. Payments
    if (pathname === '/api/business/biz-test-1/payments') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }

    // 12. Procurement
    if (pathname.includes('/purchase-') || pathname.includes('/grns') || pathname.includes('/supplier-bills')) {
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
}

const VIEWPORTS = [
  { name: '320px-iphone-se-narrow', width: 320, height: 568 },
  { name: '360px-galaxy-s8', width: 360, height: 740 },
  { name: '375px-iphone-se2', width: 375, height: 667 },
  { name: '390px-iphone-14', width: 390, height: 844 },
  { name: '412px-pixel-galaxy', width: 412, height: 915 },
  { name: '430px-iphone-pro-max', width: 430, height: 932 },
  { name: '768px-tablet-portrait', width: 768, height: 1024 },
  { name: '1024px-tablet-landscape-desktop', width: 1024, height: 768 },
  { name: '1440px-desktop-wide', width: 1440, height: 900 },
];

test.describe('Business Mode Mobile vs Desktop Visual QA & Breakpoints', () => {
  for (const vp of VIEWPORTS) {
    test(`Visual QA & layout integrity at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupMockBusinessApi(page);

      // Pre-seed business session in localStorage
      await page.addInitScript(() => {
        localStorage.setItem('hkk_app_mode', 'business');
        localStorage.setItem('hkk_active_business_id', 'biz-test-1');
      });

      // 1. Business Dashboard
      await page.goto('/business');
      await page.waitForLoadState('networkidle');

      // Verify no horizontal overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(overflow).toBe(false);

      await saveScreenshot(page, `dashboard-${vp.name}.png`);

      const desktopRail = page.locator('aside.w-60').first();
      if (vp.width < 1024) {
        // Mobile & Tablet: Desktop rail is hidden by Tailwind lg:block
        await expect(desktopRail).not.toBeVisible();
      } else {
        // Desktop: Desktop rail is visible with all 13 authorized navigation items
        await expect(desktopRail).toBeVisible();
      }

      // 2. POS Terminal
      await page.goto('/business/pos');
      await page.waitForLoadState('networkidle');
      const posOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(posOverflow).toBe(false);
      await saveScreenshot(page, `pos-${vp.name}.png`);

      // 3. Desktop-Only Workspace: Accounts & General Ledger
      await page.goto('/business/accounts');
      await page.waitForLoadState('networkidle');
      await saveScreenshot(page, `accounts-${vp.name}.png`);

      if (vp.width < 1024) {
        // On mobile & tablet (< 1024px): DesktopOnlyWorkspaceGuard renders branded notice
        await expect(page.getByTestId('desktop-only-guard-notice')).toBeVisible();
        await expect(page.getByText(/This advanced Business Mode feature is available on Desktop or Laptop/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /back to business dashboard/i })).toBeVisible();
      } else {
        // On desktop (>= 1024px): Renders full Accounts & GL workspace
        await expect(page.getByTestId('desktop-only-guard-notice')).toHaveCount(0);
        await expect(page.getByText(/Accounts/i).first()).toBeVisible();
      }

      // 4. Desktop-Only Workspace: Advanced Procurement
      await page.goto('/business/procurement');
      await page.waitForLoadState('networkidle');
      await saveScreenshot(page, `procurement-${vp.name}.png`);

      if (vp.width < 1024) {
        await expect(page.getByTestId('desktop-only-guard-notice')).toBeVisible();
        await expect(page.getByRole('button', { name: /back to business dashboard/i })).toBeVisible();
      } else {
        await expect(page.getByTestId('desktop-only-guard-notice')).toHaveCount(0);
        await expect(page.getByText(/Procurement/i).first()).toBeVisible();
      }
    });
  }
});
