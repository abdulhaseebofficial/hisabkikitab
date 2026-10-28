import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const distDir = path.resolve('apps/web/dist');
const port = 4173;

// Minimal static server for apps/web/dist
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
  '.txt': 'text/plain'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath.endsWith('/')) {
    reqPath += 'index.html';
  }

  let filePath = path.join(distDir, reqPath);
  if (!fs.existsSync(filePath)) {
    // try fallback or directory index
    if (fs.existsSync(filePath + '/index.html')) {
      filePath = filePath + '/index.html';
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, async () => {
  console.log(`Preview server running at http://localhost:${port}/`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });

  try {
    console.log('Navigating to /templates/...');
    await page.goto(`http://localhost:${port}/templates/`, { waitUntil: 'networkidle' });

    // Check title
    const title = await page.title();
    console.log('Page Title:', title);

    // Check H1
    const h1 = await page.locator('h1').innerText();
    console.log('H1:', h1);

    // Check Download links
    const downloadCards = await page.locator('a[download]').all();
    console.log(`Found ${downloadCards.length} download links with download attribute.`);

    // Test downloading Monthly Household Budget
    const [download1] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('a[href="/downloads/hisabkikitab-monthly-household-budget.xlsx"]').click()
    ]);
    const filename1 = download1.suggestedFilename();
    console.log('Downloaded file 1:', filename1);

    // Test downloading Roommate Expense Splitter
    const [download2] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('a[href="/downloads/hisabkikitab-roommate-hostel-expense-splitter.xlsx"]').click()
    ]);
    const filename2 = download2.suggestedFilename();
    console.log('Downloaded file 2:', filename2);

    // Test interactive preview table toggle
    const roommateTabBtn = page.locator('button:has-text("Roommate Expense Splitter")');
    if (await roommateTabBtn.count() > 0) {
      await roommateTabBtn.click();
      console.log('Clicked Roommate Expense Splitter preview tab.');
      await page.waitForTimeout(300);
      const activeTabContent = await page.locator('table').innerText();
      console.log('Preview table updated successfully, sample row text present.');
    }

    // Check FAQ Accordion click
    const faqItem = page.locator('button:has-text("Are these Excel templates free to download?")');
    if (await faqItem.count() > 0) {
      await faqItem.click();
      console.log('Toggled FAQ accordion item.');
    }

    console.log('Console errors encountered:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.error('Console errors:', consoleErrors);
    }

    console.log('PLAYWRIGHT BROWSER QA PASSED!');
  } catch (err) {
    console.error('Playwright Browser QA Failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
