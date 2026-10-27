import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSiteOrigin } from '../../scripts/site-origin.mjs';

test('SEO origin follows the live www redirect even with the older apex setting', () => {
  assert.equal(canonicalSiteOrigin('https://hisabkikitab.com'), 'https://www.hisabkikitab.com');
  assert.equal(canonicalSiteOrigin('https://www.hisabkikitab.com'), 'https://www.hisabkikitab.com');
  assert.equal(canonicalSiteOrigin(''), '');
  assert.throws(() => canonicalSiteOrigin('http://hisabkikitab.com'), /HTTPS origin/);
  assert.throws(() => canonicalSiteOrigin('https://hisabkikitab.com/learn/'), /HTTPS origin/);
});
