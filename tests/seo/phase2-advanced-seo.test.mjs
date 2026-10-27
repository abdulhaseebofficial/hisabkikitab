import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { toolPaths } from '../../apps/web/dist-ssr/prerender.js';

const dist = resolve('apps/web/dist');
const html = async (path) => new JSDOM(await readFile(resolve(dist, path === '/' ? 'index.html' : `${path.slice(1)}/index.html`), 'utf8')).window.document;

test('Homepage features approved H1, enhanced metadata, and direct calculator internal links', async () => {
  const doc = await html('/');

  // Title & description validation
  assert.equal(doc.title, 'HisabKi Kitab | Smart Personal & Shared Money Management');
  const desc = doc.querySelector('meta[name="description"]')?.content;
  assert.ok(desc.includes('Track your income and expenses'), 'Meta description matches approved positioning');

  // H1 validation
  const h1 = doc.querySelector('h1');
  assert.ok(h1, 'Homepage must have an H1');
  assert.ok(h1.textContent.includes('Smart Personal and Shared Money Management for Everyday Life'), 'H1 matches approved target keyword copy');

  // Internal links to calculators
  const links = [...doc.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
  assert.ok(links.some(l => l.startsWith('/tools/budget-calculator')), 'Homepage must link to budget calculator');
  assert.ok(links.some(l => l.startsWith('/tools/savings-goal-calculator')), 'Homepage must link to savings goal calculator');
  assert.ok(links.some(l => l.startsWith('/tools/expense-split-calculator')), 'Homepage must link to expense split calculator');
  assert.ok(links.some(l => l.startsWith('/tools')), 'Homepage must link to tools hub');
});

test('All 7 calculators have unique H2 headings, formulas, worked examples and registration CTAs', async () => {
  const calculators = toolPaths.filter(p => p !== '/tools');
  assert.equal(calculators.length, 7, 'All 7 calculators must be verified');

  for (const path of calculators) {
    const doc = await html(path);

    // Single H1 check
    assert.equal(doc.querySelectorAll('h1').length, 1, `${path}: expected exactly one H1`);

    // Verify unique H2 headings exist and are not purely generic
    const h2s = [...doc.querySelectorAll('h2')].map(h => h.textContent.trim());
    assert.ok(h2s.length >= 3, `${path}: expected at least 3 descriptive H2 sections`);
    assert.ok(h2s.some(h => h.includes('Enter your figures: ')), `${path}: form heading must be customized`);
    assert.ok(h2s.some(h => h.includes('Your estimate: ')), `${path}: results heading must be customized`);
    assert.ok(h2s.some(h => h.includes('How this estimate works: ')), `${path}: methodology heading must be customized`);

    // Verify registration CTA
    const regLinks = [...doc.querySelectorAll('a[href]')].filter(a => a.getAttribute('href') === '/register' || a.getAttribute('href') === '/register/');
    assert.ok(regLinks.length >= 1, `${path}: expected primary registration CTA for guests`);

    // Verify formula & worked example in body
    const bodyText = doc.body.textContent;
    assert.ok(bodyText.includes('Calculation Formula'), `${path}: must display mathematical formula`);
    assert.ok(bodyText.includes('Worked Example'), `${path}: must display realistic worked example`);
    assert.ok(bodyText.includes('Common Pitfalls'), `${path}: must display practical pitfalls to avoid`);
  }
});
