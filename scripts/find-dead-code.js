#!/usr/bin/env node
/**
 * Finds code nothing reaches.  `npm run check:dead`
 *
 * Walks out from the real entry points following imports, then reports files
 * no path leads to, exports nothing outside their own file mentions, declared
 * dependencies nothing requires, and empty directories.
 *
 * Reporting only. Deciding what to do about a finding needs judgement this
 * cannot have - most of what a naive version flags is a config file a tool
 * loads by convention, or something reached by a bare specifier rather than a
 * relative path. Those are listed below rather than silently ignored, so the
 * reasoning is visible and can be argued with.
 *
 * Exits non-zero only on findings outside the known set, so it is safe in CI.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..').split(path.sep).join('/');
// Generated output only: shared by entry discovery, reachability and empty-dir checks.
const SKIP = new Set([
  'node_modules', '.git', 'dist', 'build', '.vercel', 'coverage', '.nyc_output',
  'test-results', 'playwright-report', 'blob-report',
  '.cache', '.vite', '.vite-temp', '.vitest', '.turbo',
]);
const CODE = ['.js', '.jsx', '.mjs', '.cjs'];

/**
 * Where execution actually begins. Everything else has to be reachable.
 *
 * The application entry points are listed because there are few and they are
 * deliberate. Everything a runner invokes directly is discovered instead -
 * anything under tests/ or scripts/, every *.test.js(x) wherever it lives, and
 * the test setup file - because listing those by hand only means the next new
 * test trips this check on the day it is written.
 */
const FIXED_ENTRIES = [
  'apps/api/server.js',
  'apps/api/src/infrastructure/database/migrate.js',
  'apps/web/src/main.jsx',
  'database/seeds/demo.js',
];

const discoverEntries = (dir) => {
  const full = path.join(ROOT, dir).split(path.sep).join('/');
  if (!fs.existsSync(full)) return [];
  return walk(full)
    .filter((f) => /\.(js|jsx)$/.test(f))
    .map((f) => f.replace(ROOT + '/', ''));
};

/** Reachable, but not by an import a scanner can follow. */
const EXPECTED_UNREACHABLE = {
  'apps/web/vite.config.js': 'Vite loads it by name',
  'apps/web/tailwind.config.js': 'Tailwind loads it by name',
  'apps/web/postcss.config.js': 'PostCSS loads it by name',
  'packages/contracts/index.js': "required as '@hisabkikitab/contracts', not by path",
  'packages/contracts/validation.js':
    "imported as '@hisabkikitab/contracts/validation' by both apps, not by path",
  'packages/contracts/catalogue.js':
    "imported as '@hisabkikitab/contracts/catalogue' by both apps, not by path",
  'packages/contracts/notifications.js':
    "imported as '@hisabkikitab/contracts/notifications' by the API, not by path",
};

/** Exported on purpose, even though nothing calls them yet. */
const EXPECTED_UNUSED_EXPORTS = {
  'apps/api/src/infrastructure/scheduling/index.js :: runRecurringExpenses':
    'the handler an external scheduler is meant to call',
  'apps/api/src/infrastructure/scheduling/index.js :: runAlerts':
    'the handler an external scheduler is meant to call',
  'apps/api/src/infrastructure/database/migrate.js :: tableNames':
    'printed by the migrate CLI',
};

const IMPORT = /(?:from\s+|import\s*\(\s*|require\(\s*)(['"])([^'"]+)\1/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full.split(path.sep).join('/'));
  }
  return out;
}

const all = walk(ROOT);
const code = all.filter((f) => CODE.some((e) => f.endsWith(e)));
const rel = (f) => f.replace(ROOT + '/', '');

function resolve(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.join(path.posix.dirname(fromFile), spec);
  const tries = [base, base + '.js', base + '.jsx', base + '.mjs', base + '.cjs',
    base + '/index.js', base + '/index.jsx', base + '.json', base + '.css'];
  return tries.find((t) => all.includes(t)) || null;
}

// --- what is reachable ---------------------------------------------------
const reached = new Set();
const ENTRIES = FIXED_ENTRIES
  .concat(discoverEntries('tests'))
  .concat(discoverEntries('scripts'))
  // Co-located component tests and the runner's own setup file.
  .concat(code.filter((f) => /\.test\.jsx?$/.test(f) || /vitest\.setup\.js$/.test(f)).map(rel));

const queue = ENTRIES.map((e) => ROOT + '/' + e).filter((f) => all.includes(f));

while (queue.length) {
  const file = queue.pop();
  if (reached.has(file)) continue;
  reached.add(file);
  if (!CODE.some((e) => file.endsWith(e))) continue;
  IMPORT.lastIndex = 0;
  const text = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = IMPORT.exec(text)) !== null) {
    const target = resolve(file, m[2]);
    if (target && !reached.has(target)) queue.push(target);
  }
}

// --- findings ------------------------------------------------------------
const body = new Map(code.map((f) => [f, fs.readFileSync(f, 'utf8')]));

const deadFiles = code.filter((f) => !reached.has(f)).map(rel);

/**
 * This file names the exports it expects to find unused, so letting it count
 * as a user would quietly cancel every exclusion recorded above.
 */
const SELF = ROOT + '/scripts/find-dead-code.js';

const unusedExports = [];
for (const f of code.filter((f) => reached.has(f))) {
  const m = body.get(f).match(/module\.exports = \{([\s\S]*?)\};/);
  if (!m) continue;
  const names = m[1].split(',')
    .map((n) => n.split(':')[0].trim())
    .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  for (const name of names) {
    const used = code.some(
      (o) => o !== f && o !== SELF && new RegExp('\\b' + name + '\\b').test(body.get(o))
    );
    if (!used) unusedExports.push(rel(f) + ' :: ' + name);
  }
}

const unusedDeps = [];
for (const pkgPath of all.filter((f) => f.endsWith('package.json'))) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const dir = path.posix.dirname(pkgPath);
  const text = code.filter((f) => f.startsWith(dir + '/')).map((f) => body.get(f)).join('\n') +
    JSON.stringify(pkg.scripts || {});
  for (const dep of Object.keys(pkg.dependencies || {})) {
    const escaped = dep.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
    if (!new RegExp(`['"]${escaped}(/|['"])`).test(text)) unusedDeps.push(rel(pkgPath) + ' :: ' + dep);
  }
}

const emptyDirs = [];
(function findEmpty(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    findEmpty(full);
    if (fs.readdirSync(full).length === 0) emptyDirs.push(rel(full.split(path.sep).join('/')));
  }
})(ROOT);

// --- report --------------------------------------------------------------
const unexplainedFiles = deadFiles.filter((f) => !EXPECTED_UNREACHABLE[f]);
const unexplainedExports = unusedExports.filter((e) => !EXPECTED_UNUSED_EXPORTS[e]);

console.log(`scanned ${code.length} code files; ${reached.size} reachable from entry points\n`);

const show = (title, rows, known) => {
  console.log(`${title} (${rows.length})`);
  if (!rows.length) console.log('  none');
  rows.forEach((r) => console.log(`  ${known && known[r] ? '· ' : '! '}${r}${known && known[r] ? '  - ' + known[r] : ''}`));
  console.log('');
};

show('UNREACHABLE FILES', deadFiles, EXPECTED_UNREACHABLE);
show('EXPORTS NOTHING ELSE MENTIONS', unusedExports, EXPECTED_UNUSED_EXPORTS);
show('DECLARED DEPENDENCIES NOTHING IMPORTS', unusedDeps);
show('EMPTY DIRECTORIES', emptyDirs);

const problems = unexplainedFiles.length + unexplainedExports.length +
  unusedDeps.length + emptyDirs.length;

if (problems) {
  console.error(`${problems} finding(s) with no recorded reason. Either remove them, or add a line to this file saying why they stay.`);
  process.exit(1);
}
console.log('nothing unexplained: every finding above has a recorded reason');
