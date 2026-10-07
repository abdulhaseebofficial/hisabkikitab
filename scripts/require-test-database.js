/** Fail closed before any integration suite opens a database or sends API writes. */
const url = process.env.TEST_DATABASE_URL;
let parsed;
try { parsed = new URL(url); } catch { /* reported below without echoing secrets */ }
const local = parsed && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
const disposableName = parsed && /(?:^test_|_test$)/i.test(decodeURIComponent(parsed.pathname.slice(1)));
const safe = process.env.ALLOW_DESTRUCTIVE_TEST_DB === 'true' &&
  process.env.NODE_ENV === 'test' && parsed &&
  ['postgres:', 'postgresql:'].includes(parsed.protocol) && local && disposableName;
if (!safe) {
  throw new Error('Integration tests require NODE_ENV=test, ALLOW_DESTRUCTIVE_TEST_DB=true, and TEST_DATABASE_URL for a localhost database named test_* or *_test. Production/remote databases are rejected.');
}
for (const name of ['HW_API', 'BROWSER_API_URL', 'BROWSER_BASE_URL']) {
  if (process.env[name]) {
    let target;
    try { target = new URL(process.env[name]); } catch { /* rejected below */ }
    if (!target || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
      throw new Error(`${name} must target localhost for integration tests.`);
    }
  }
}
// dotenv.config() in legacy tests does not override these explicit values.
for (const name of ['DATABASE_URL', 'POSTGRES_URL', 'DIRECT_URL', 'POSTGRES_URL_NON_POOLING']) {
  process.env[name] = url;
}
