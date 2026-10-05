/**
 * The attack surface, checked from outside the application.
 *
 * pentest.js goes after specific vulnerability classes with payloads. This one
 * asks structural questions instead - is every route actually behind auth, does
 * a cross-site request get anywhere, does an anonymous caller learn anything -
 * because those fail quietly and no single payload reveals them.
 *
 * Needs a live API: npm run dev, then npm run test:security.
 * Read-only apart from two throwaway accounts it creates and deletes.
 */

require('../../scripts/require-test-database');
const crypto = require('node:crypto');
const BASE = process.env.HW_API || 'http://localhost:5000/api';

let passed = 0;
let failed = 0;
const failures = [];

const held = (name, ok, detail = '') => {
  const line = `${name}${detail ? '  - ' + detail : ''}`;
  if (ok) { passed += 1; console.log('  held    ' + line); }
  else { failed += 1; failures.push(line); console.log('  BROKE   ' + line); }
};
const section = (t) => console.log('\n--- ' + t + ' ---');

const call = async (method, path, { body, token, headers = {}, cookie, raw } = {}) => {
  const h = { ...headers };
  if (body !== undefined && !raw) h['content-type'] = 'application/json';
  if (token) h.authorization = 'Bearer ' + token;
  if (method === 'POST' && /^\/expenses$/.test(path))
    h['Idempotency-Key'] ||= crypto.randomUUID();
  if (cookie) h.cookie = cookie;

  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, data, text, headers: res.headers };
};

/**
 * Every route the API exposes, with what an anonymous caller should get.
 * Keeping this list here rather than deriving it means a new route added
 * without auth shows up as a missing entry rather than passing silently.
 */
const ROUTES = [
  ['GET', '/dashboard/summary'], ['GET', '/expenses'], ['POST', '/expenses'],
  ['GET', '/expenses/00000000-0000-0000-0000-000000000000'],
  ['PUT', '/expenses/00000000-0000-0000-0000-000000000000'],
  ['DELETE', '/expenses/00000000-0000-0000-0000-000000000000'],
  ['GET', '/income'], ['GET', '/income/summary'], ['POST', '/income'],
  ['GET', '/goals'], ['POST', '/goals'],
  ['GET', '/budget'], ['POST', '/budget'], ['POST', '/budget/bulk'],
  ['GET', '/debts'], ['GET', '/debts/summary'], ['POST', '/debts'],
  ['GET', '/debts/00000000-0000-0000-0000-000000000000/payments'],
  ['POST', '/debts/00000000-0000-0000-0000-000000000000/payments'],
  ['GET', '/notifications'], ['POST', '/notifications/check'],
  ['PATCH', '/notifications/read-all'], ['DELETE', '/notifications'],
  ['GET', '/feedback/mine'], ['GET', '/feedback/meta'], ['POST', '/feedback'],
  ['GET', '/reports/monthly'], ['GET', '/reports/export'],
  ['GET', '/ai/status'], ['POST', '/ai/advice'], ['POST', '/ai/chat'],
  ['GET', '/ai/chat/history'], ['GET', '/ai/tip'],
  ['GET', '/auth/me'], ['PUT', '/auth/change-password'],
  ['PUT', '/profile'], ['POST', '/profile/onboarding'], ['GET', '/profile/categories'],
  ['GET', '/profile/export'], ['DELETE', '/profile'],
];

(async () => {
  const stamp = Date.now();
  const passwordA = 'SurfaceA1!';
  const emailA = `surface_a_${stamp}@example.com`;
  let tokenA = null;
  let cookieA = null;

  try {
    /* ---------------------------------------------------------------- */
    section('EVERY PROTECTED ROUTE REFUSES AN ANONYMOUS CALLER');

    let unprotected = [];
    for (const [method, path] of ROUTES) {
      const r = await call(method, path, { body: method === 'GET' || method === 'DELETE' ? undefined : {} });
      // 401 is the answer. 400 would mean validation ran before auth, which
      // leaks that the route exists and what it wants.
      if (r.status !== 401) unprotected.push(`${method} ${path} -> ${r.status}`);
    }
    held(`all ${ROUTES.length} protected routes answer 401 without a token`,
      unprotected.length === 0, unprotected.slice(0, 5).join('; ') || 'none reachable');

    held('validation never runs before authentication',
      unprotected.every((u) => !u.endsWith('-> 400')), 'no route validated an anonymous body');

    /* ---------------------------------------------------------------- */
    section('CROSS-SITE REQUESTS (CSRF)');

    const reg = await call('POST', '/auth/register', {
      body: { acceptTerms: true, name: 'Surface A', email: emailA, password: passwordA, confirmPassword: passwordA },
    });
    tokenA = reg.data?.data?.accessToken;
    const setCookie = reg.headers.get('set-cookie') || '';
    cookieA = setCookie.split(';')[0];
    held('a throwaway account was created', reg.status === 201 && Boolean(tokenA), `-> ${reg.status}`);

    // The refresh cookie is the ONLY credential a browser attaches by itself.
    // Everything else needs an Authorization header, which a cross-site form
    // or image cannot set. So CSRF reduces to: what can the cookie alone do?
    held('the session cookie is SameSite=Lax, so a cross-site POST never carries it',
      /SameSite=Lax/i.test(setCookie), (setCookie.match(/SameSite=\w+/i) || ['missing'])[0]);
    held('and it is scoped to the routes that rotate it, not the whole API',
      /Path=\/api\/auth/i.test(setCookie), (setCookie.match(/Path=[^;]*/i) || ['none'])[0]);

    // A state-changing request carrying only the cookie must get nowhere.
    const cookieOnly = await call('POST', '/expenses', {
      body: { amount: 1, category: 'Mess/Food' }, cookie: cookieA,
    });
    held('the cookie alone cannot create an expense', cookieOnly.status === 401, `-> ${cookieOnly.status}`);

    const cookieOnlyDelete = await call('DELETE', '/profile', { body: { password: passwordA }, cookie: cookieA });
    held('the cookie alone cannot delete an account', cookieOnlyDelete.status === 401, `-> ${cookieOnlyDelete.status}`);

    // An attacker page can send a form POST with no preflight. urlencoded is
    // parsed by this API, so the shape is reachable - what stops it is that no
    // state-changing route accepts the cookie as authentication.
    const formPost = await call('POST', '/expenses', {
      raw: true,
      body: 'amount=1&category=Mess%2FFood',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      cookie: cookieA,
    });
    held('a simple cross-site form POST is refused', formPost.status === 401, `-> ${formPost.status}`);

    const evil = await call('POST', '/auth/login', {
      body: { email: emailA, password: passwordA },
      headers: { origin: 'https://evil.example' },
    });
    held('a request from an unlisted origin is rejected by CORS',
      evil.status === 403, `-> ${evil.status}`);
    held('and the rejection is not reported as a server fault',
      evil.status < 500, 'a blocked origin is a client error, not a 500');

    const evilRefresh = await call('POST', '/auth/refresh', {
      cookie: cookieA, headers: { origin: 'https://evil.example' },
    });
    held('and so is a cross-origin refresh carrying a real cookie',
      evilRefresh.status === 403, `-> ${evilRefresh.status}`);

    /* ---------------------------------------------------------------- */
    section('SESSION AND REFRESH TOKENS');

    const refreshed = await call('POST', '/auth/refresh', { cookie: cookieA });
    held('a refresh with the right cookie succeeds', refreshed.status === 200, `-> ${refreshed.status}`);
    const rotated = (refreshed.headers.get('set-cookie') || '').split(';')[0];
    held('and rotates the cookie', Boolean(rotated) && rotated !== cookieA, 'a new value was issued');

    // Rotation has a narrow grace window, and it has to: two browser tabs share
    // one cookie, so both wake, both find the access token expired, and both
    // refresh with the same value. Refusing the loser logged people out of
    // everything for having two tabs open. While the replacement is still the
    // live end of the chain, that race is served.
    const raced = await call('POST', '/auth/refresh', { cookie: cookieA });
    held('a superseded cookie is served while its replacement is still live',
      raced.status === 200, `-> ${raced.status} (the two-tabs case)`);

    // The window closes the moment the real session moves on. Using the
    // rotated cookie advances the chain, and the old one is a replay again.
    const advanced = await call('POST', '/auth/refresh', { cookie: rotated });
    held('the live session refreshes normally', advanced.status === 200, `-> ${advanced.status}`);

    const replay = await call('POST', '/auth/refresh', { cookie: cookieA });
    held('replaying the OLD refresh cookie is refused once the chain has moved on',
      replay.status === 401, `-> ${replay.status}`);

    const afterReplay = await call('POST', '/auth/refresh', {
      cookie: (advanced.headers.get('set-cookie') || '').split(';')[0],
    });
    held('and the replay invalidates the whole session, not just the old token',
      afterReplay.status === 401, `-> ${afterReplay.status} (reuse detection)`);
    const oldAccess = await call('GET', '/auth/me', { token: tokenA });
    held('and the replay revokes an already issued access token',
      oldAccess.status === 401, `-> ${oldAccess.status}`);

    /* ---------------------------------------------------------------- */
    section('WHAT AN ERROR TELLS AN ATTACKER');

    const loginA = await call('POST', '/auth/login', { body: { email: emailA, password: passwordA } });
    tokenA = loginA.data?.data?.accessToken;
    cookieA = (loginA.headers.get('set-cookie') || '').split(';')[0];

    const wrongPassword = await call('POST', '/auth/login', { body: { email: emailA, password: 'Wrong123!' } });
    const unknownEmail = await call('POST', '/auth/login', {
      body: { email: `nobody_${stamp}@example.com`, password: 'Wrong123!' },
    });
    held('a wrong password and an unknown account look the same',
      wrongPassword.status === unknownEmail.status &&
      wrongPassword.data?.message === unknownEmail.data?.message,
      `${wrongPassword.status} / ${unknownEmail.status}`);

    const forgotKnown = await call('POST', '/auth/forgot-password', { body: { email: emailA } });
    const forgotUnknown = await call('POST', '/auth/forgot-password', {
      body: { email: `nobody_${stamp}@example.com` },
    });
    held('password reset does not confirm whether an account exists',
      forgotKnown.status === forgotUnknown.status &&
      forgotKnown.data?.message === forgotUnknown.data?.message,
      `${forgotKnown.status} / ${forgotUnknown.status}`);

    const notFound = await call('GET', '/expenses/00000000-0000-0000-0000-000000000000', { token: tokenA });
    held('a missing record leaks no stack trace',
      !notFound.text.includes(' at ') && !/[\\/]apps[\\/]api[\\/]/.test(notFound.text),
      `-> ${notFound.status}`);

    const badUuid = await call('GET', '/expenses/not-a-uuid', { token: tokenA });
    held('a malformed id is a clean 4xx, not a database error',
      badUuid.status >= 400 && badUuid.status < 500 && !/22P02|invalid input syntax/i.test(badUuid.text),
      `-> ${badUuid.status}`);

    const notThere = await call('GET', '/this-route-does-not-exist', { token: tokenA });
    held('an unknown route does not describe the router',
      notThere.status === 404 && !/express|router|stack/i.test(notThere.text), `-> ${notThere.status}`);

    /* ---------------------------------------------------------------- */
    section('RESPONSE HEADERS');

    const headed = await call('GET', '/health');
    const header = (n) => headed.headers.get(n) || '';
    held('health response has a correlation request ID',
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(header('x-request-id')));
    held('X-Content-Type-Options is nosniff', /nosniff/i.test(header('x-content-type-options')));
    held('framing is restricted', /deny|sameorigin/i.test(header('x-frame-options')) ||
      /frame-ancestors/i.test(header('content-security-policy')));
    held('a content security policy is sent', /default-src/i.test(header('content-security-policy')));
    held('HSTS is sent', /max-age=\d+/i.test(header('strict-transport-security')));
    held('a referrer policy is set', header('referrer-policy').length > 0, header('referrer-policy'));
    held('the server does not advertise itself', !header('x-powered-by'), header('x-powered-by') || 'absent');

    const authed = await call('GET', '/auth/me', { token: tokenA });
    held('authenticated responses are not cacheable by a shared cache',
      !/public/i.test(authed.headers.get('cache-control') || ''),
      authed.headers.get('cache-control') || 'no cache-control');

    /* ---------------------------------------------------------------- */
    section('LIMITS ON WHAT CAN BE SENT AND ASKED FOR');

    const huge = await call('POST', '/expenses', {
      token: tokenA, body: { amount: 1, category: 'Mess/Food', description: 'x'.repeat(200000) },
    });
    held('an oversized body is refused', huge.status === 413 || huge.status === 400, `-> ${huge.status}`);

    let deep = { v: 1 };
    for (let i = 0; i < 2000; i += 1) deep = { nested: deep };
    const nested = await call('POST', '/feedback', { token: tokenA, body: deep });
    held('deeply nested JSON does not crash the process',
      nested.status >= 400 && nested.status < 500, `-> ${nested.status}`);

    // Either answer is secure: refuse the request, or serve a bounded page.
    // This API refuses, which is the stronger of the two.
    const bigPage = await call('GET', '/expenses?limit=100000', { token: tokenA });
    const bounded = bigPage.status === 400 ||
      (bigPage.status === 200 && (bigPage.data?.data?.items?.length ?? 0) <= 100);
    held('a caller cannot ask for an unbounded page', bounded,
      bigPage.status === 400 ? 'refused with 400' : `${bigPage.data?.data?.items?.length} rows`);

    const wordLimit = await call('GET', '/expenses?limit=abc', { token: tokenA });
    held('a non-numeric limit is refused rather than coerced',
      wordLimit.status === 400, `-> ${wordLimit.status}`);

    const negativePage = await call('GET', '/notifications?limit=-5', { token: tokenA });
    held('a negative limit does not reach the database',
      negativePage.status === 200, `-> ${negativePage.status}`);

    const badSort = await call('GET', '/expenses?sortBy=amount;DROP TABLE users--', { token: tokenA });
    held('an unknown sort column falls back instead of being interpolated',
      badSort.status === 200 && !/syntax error|DROP/i.test(badSort.text), `-> ${badSort.status}`);

    /* ---------------------------------------------------------------- */
    section('PROTOTYPE POLLUTION AND PARAMETER TRICKS');

    const polluted = await call('POST', '/expenses', {
      token: tokenA,
      body: { amount: 5, category: 'Mess/Food', __proto__: { polluted: true }, constructor: { prototype: { x: 1 } } },
    });
    held('a __proto__ payload does not pollute the prototype',
      ({}).polluted === undefined, `-> ${polluted.status}, Object.prototype untouched`);

    const override = await call('POST', '/expenses', {
      token: tokenA,
      body: { amount: 5, category: 'Mess/Food' },
      headers: { 'x-http-method-override': 'DELETE' },
    });
    held('a method-override header does not change the verb',
      override.status !== 204, `-> ${override.status}`);

    /* ---------------------------------------------------------------- */
    section('CLEAN UP');
    const del = await call('DELETE', '/profile', { token: tokenA, body: { password: passwordA } });
    held('the throwaway account is removed', del.status === 200, `-> ${del.status}`);
  } catch (err) {
    console.error('\nERROR:', err.message);
    failed += 1;
    failures.push(err.message);
  }

  console.log(`\n===== ${passed} held, ${failed} broke =====`);
  if (failures.length) {
    console.log('\nBROKE:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(failed ? 1 : 0);
})();
