const { test, expect } = require('@playwright/test');

const routes = ['/login', '/register'];
const themes = ['light', 'dark'];
const viewports = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
];

for (const route of routes) {
  for (const theme of themes) {
    for (const viewport of viewports) {
      test(`${route} ${theme} ${viewport.width}x${viewport.height} scroll layout`, async ({ page }, testInfo) => {
        test.skip(
          viewport.width >= 1024 ? testInfo.project.name !== 'desktop-en' : testInfo.project.name !== 'mobile-roman-ur',
          'Run desktop cases in a desktop browser and mobile cases in a mobile browser.',
        );
        await page.setViewportSize(viewport);
        await page.addInitScript((selectedTheme) => {
          localStorage.setItem('hw-theme', selectedTheme);
          localStorage.setItem('hkk-analytics-consent-v1', JSON.stringify({ choice: 'denied', at: Date.now() }));
        }, theme);
        await page.route((url) => url.pathname.startsWith('/api/'), (request) => {
          if (request.request().url().includes('/auth/config')) {
            return request.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { google: { enabled: false } } }) });
          }
          return request.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
        });
        await page.goto(route);

        const shell = page.locator('.hkk-auth-shell');
        const brand = page.locator('.hkk-auth-brand');
        const panel = page.locator('.hkk-auth-form-panel');
        await expect(shell).toBeVisible();
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
        await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${theme}-${viewport.width}x${viewport.height}-top.png`) });

        if (viewport.width >= 1024) {
          await expect(brand).toBeVisible();
          const initial = await page.evaluate(() => {
            const brandPanel = document.querySelector('.hkk-auth-brand');
            const formPanel = document.querySelector('.hkk-auth-form-panel');
            return {
              brandTop: brandPanel.getBoundingClientRect().top,
              brandHeight: brandPanel.getBoundingClientRect().height,
              shellHeight: document.querySelector('.hkk-auth-shell').getBoundingClientRect().height,
              panelHeight: formPanel.clientHeight,
              panelOverflow: getComputedStyle(formPanel).overflowY,
              ancestorOverflow: [document.documentElement, document.body, document.querySelector('#root'), document.querySelector('.hkk-auth-shell')]
                .map((element) => getComputedStyle(element).overflowY),
            };
          });
          expect(initial.brandTop).toBe(0);
          expect(initial.brandHeight).toBe(viewport.height);
          expect(initial.shellHeight).toBe(viewport.height);
          expect(initial.panelHeight).toBe(viewport.height);
          expect(initial.panelOverflow).toBe('auto');
          expect(initial.ancestorOverflow).toEqual(['hidden', 'hidden', 'hidden', 'hidden']);

          // Check all actual controls and links before adding any test-only height.
          const controls = panel.locator('input, button, a');
          for (let index = 0; index < await controls.count(); index += 1) {
            const control = controls.nth(index);
            if (!(await control.isVisible())) continue;
            await control.scrollIntoViewIfNeeded();
            const bounds = await control.boundingBox();
            const panelBounds = await panel.boundingBox();
            expect(bounds.y).toBeGreaterThanOrEqual(panelBounds.y - 1);
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(panelBounds.y + panelBounds.height + 1);
          }

          // Login can fit at 900px, so add temporary height to exercise its scroll container.
          await panel.evaluate((element) => {
            if (element.scrollHeight <= element.clientHeight) {
              const spacer = document.createElement('div');
              spacer.style.cssText = 'height: 400px; flex: none';
              element.append(spacer);
            }
            element.scrollTop = element.scrollHeight;
          });
          const scrolled = await page.evaluate(() => ({
            panel: document.querySelector('.hkk-auth-form-panel').scrollTop,
            brandTop: document.querySelector('.hkk-auth-brand').getBoundingClientRect().top,
            document: window.scrollY,
            html: document.documentElement.scrollTop,
            body: document.body.scrollTop,
          }));
          expect(scrolled.panel).toBeGreaterThan(0);
          expect(scrolled.brandTop).toBe(initial.brandTop);
          expect([scrolled.document, scrolled.html, scrolled.body]).toEqual([0, 0, 0]);
        } else {
          await expect(brand).toBeHidden();
          const overflow = await page.evaluate(() => [document.documentElement, document.body]
            .map((element) => getComputedStyle(element).overflowY));
          expect(overflow).not.toContain('hidden');
          await panel.locator(':scope > div').evaluate((element) => {
            if (document.documentElement.scrollHeight <= innerHeight) {
              const spacer = document.createElement('div');
              spacer.style.height = '400px';
              element.append(spacer);
            }
          });
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        }

        await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${theme}-${viewport.width}x${viewport.height}-scrolled.png`) });
      });
    }
  }
}
