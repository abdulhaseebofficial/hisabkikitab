/**
 * Where the session actually lives.
 *
 * The access token used to be mirrored into localStorage. That survived a page
 * reload, and it also meant any injected script could read the token whenever
 * it liked and keep a copy long after the injection was cleaned up. A stored
 * credential is a credential an attacker can take away with them.
 *
 * It now travels in an httpOnly cookie instead. These check the properties that
 * make that worth doing - and, just as importantly, that the change did not
 * quietly break the header path every non-browser caller uses.
 *
 * Run against a live server:  node tests/security/auth-storage.test.js
 */
const { ok, section, heading, report, requireApi } = require('../e2e/helpers');

const BASE = (process.env.API_URL || 'http://localhost:5000') + '/api';

const raw = async (path, { method = 'GET', cookie, token, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
};

/** All Set-Cookie headers as one array, since fetch folds them into a string. */
const cookiesFrom = (setCookie) =>
  String(setCookie || '')
    // Split on commas that begin a new cookie, not the ones inside Expires.
    .split(/,(?=\s*\w+=)/)
    .map((c) => c.trim())
    .filter(Boolean);

const named = (setCookie, name) =>
  cookiesFrom(setCookie).find((c) => c.toLowerCase().startsWith(`${name.toLowerCase()}=`)) || null;

const valueOf = (cookie) => (cookie ? cookie.split(';')[0] : null);
const safeCookie = (cookie) => cookie ? cookie.replace(/^([^=]+=)[^;]*/, '$1<redacted>') : 'missing';

(async () => {
  await requireApi();

  const email = `authstore${Date.now()}@example.com`;
  let r = await raw('/auth/register', {
    method: 'POST',
    body: {
      acceptTerms: true,
      name: 'Storage QA',
      email,
      password: 'TestPass123!',
      confirmPassword: 'TestPass123!',
    },
  });
  ok('set up a throwaway account', r.status === 201, `-> ${r.status}`);

  const login = await raw('/auth/login', {
    method: 'POST',
    body: { email, password: 'TestPass123!' },
  });
  ok('and signed in', login.status === 200, `-> ${login.status}`);

  const accessCookie = named(login.setCookie, 'hw_access');
  const refreshCookie = named(login.setCookie, 'hw_refresh');
  const bearer = login.json && login.json.data && login.json.data.accessToken;

  heading('THE ACCESS TOKEN IS IN A COOKIE JAVASCRIPT CANNOT READ');

  section('The cookie is set, and set properly');
  ok('signing in sets an access cookie', Boolean(accessCookie), accessCookie ? 'present' : 'missing');
  ok('it is httpOnly, so no script can read it',
    /httponly/i.test(accessCookie || ''), safeCookie(accessCookie));
  ok('it declares a SameSite policy, which is what blocks cross-site writes',
    /samesite=/i.test(accessCookie || ''), safeCookie(accessCookie));
  ok('it is not SameSite=None without also being Secure',
    !/samesite=none/i.test(accessCookie || '') || /secure/i.test(accessCookie || ''),
    safeCookie(accessCookie));
  ok('it carries an explicit expiry rather than lasting the browser session',
    /max-age=|expires=/i.test(accessCookie || ''), safeCookie(accessCookie));
  ok('it is scoped to the API path',
    /path=\/api/i.test(accessCookie || ''), safeCookie(accessCookie));

  section('The refresh cookie keeps its narrower scope');
  ok('the refresh cookie is httpOnly too', /httponly/i.test(refreshCookie || ''), safeCookie(refreshCookie));
  ok('and is sent only to the auth routes that rotate it',
    /path=\/api\/auth/i.test(refreshCookie || ''), safeCookie(refreshCookie));
  ok('the two cookies are different',
    valueOf(accessCookie) !== valueOf(refreshCookie), 'distinct');

  heading('BOTH WAYS IN STILL WORK');

  section('The cookie alone authenticates a request');
  r = await raw('/auth/me', { cookie: valueOf(accessCookie) });
  ok('a request with only the access cookie is authenticated', r.status === 200, `-> ${r.status}`);
  ok('and it is the right account', r.json?.data?.user?.email === email, r.json?.data?.user?.email);

  section('And so does the header, which is the API contract');
  r = await raw('/auth/me', { token: bearer });
  ok('a request with only the bearer header is authenticated', r.status === 200, `-> ${r.status}`);

  section('Neither is not');
  r = await raw('/auth/me');
  ok('a request with no credential at all is refused', r.status === 401, `-> ${r.status}`);

  section('A forged cookie is refused like a forged header');
  r = await raw('/auth/me', { cookie: 'hw_access=not.a.real.token' });
  ok('a made-up access cookie is refused', r.status === 401, `-> ${r.status}`);

  heading('THE EXPLICIT CREDENTIAL WINS');

  section('A bearer token is not overridden by whatever cookie is lying around');
  {
    // A second account, so the two credentials name different people.
    const otherEmail = `authstore2${Date.now()}@example.com`;
    await raw('/auth/register', {
      method: 'POST',
      body: {
        acceptTerms: true,
        name: 'Other QA',
        email: otherEmail,
        password: 'TestPass123!',
        confirmPassword: 'TestPass123!',
      },
    });
    const other = await raw('/auth/login', {
      method: 'POST',
      body: { email: otherEmail, password: 'TestPass123!' },
    });
    const otherBearer = other.json?.data?.accessToken;

    // Cookie says one person, header says the other.
    r = await raw('/auth/me', { cookie: valueOf(accessCookie), token: otherBearer });
    ok('the header decides who the caller is, not the cookie',
      r.json?.data?.user?.email === otherEmail, r.json?.data?.user?.email);

    const gone = await raw('/profile', {
      method: 'DELETE',
      token: otherBearer,
      body: { password: 'TestPass123!' },
    });
    ok('the second account is cleaned up', gone.status === 200, `-> ${gone.status}`);
  }

  heading('LOGGING OUT CLEARS BOTH COOKIES');

  section('Not just the refresh one');
  {
    const out = await raw('/auth/logout', {
      method: 'POST',
      cookie: `${valueOf(refreshCookie)}; ${valueOf(accessCookie)}`,
      body: {},
    });
    ok('logout succeeds', out.status === 200, `-> ${out.status}`);

    const clearedAccess = named(out.setCookie, 'hw_access');
    const clearedRefresh = named(out.setCookie, 'hw_refresh');
    ok('the access cookie is cleared', Boolean(clearedAccess), safeCookie(clearedAccess));
    ok('and so is the refresh cookie', Boolean(clearedRefresh), safeCookie(clearedRefresh));
  }

  heading('CLEAN UP');
  {
    const back = await raw('/auth/login', {
      method: 'POST',
      body: { email, password: 'TestPass123!' },
    });
    const gone = await raw('/profile', {
      method: 'DELETE',
      token: back.json?.data?.accessToken,
      body: { password: 'TestPass123!' },
    });
    ok('the test account is removed', gone.status === 200, `-> ${gone.status}`);
  }

  report();
})();
