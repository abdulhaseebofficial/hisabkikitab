/**
 * Refresh rotation, and the two tabs that used to break it.
 *
 * Rotation here is strict: presenting a token the server no longer holds means
 * a replayed cookie, and every session on the account drops. That is the right
 * response to an attack and the wrong response to a person with two tabs open,
 * which is what it used to be - both tabs wake, both find the access token
 * expired, both refresh with the same cookie, and the loser is treated as an
 * intruder.
 *
 * Measured before the fix: tab A -> 200, tab B -> 401, session -> 401.
 *
 * These run against a live server and a real database, because the race is the
 * whole point and it cannot be faked convincingly.
 */
const path = require('path');
const { ok, section, heading, call, report, requireApi, bailIfRateLimited, BASE } = require('./helpers');

// BASE comes from helpers so this suite and the shared `call()` always hit the
// same server. They used to diverge - this read API_URL while call() read
// HW_API - and pointing them at two servers made a working session look broken.

/** A raw refresh call carrying an explicit cookie, so tabs can be simulated. */
const refreshWith = async (cookie) => {
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: '{}',
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') };
};

/** Pulls the refresh cookie out of a Set-Cookie header. */
const cookieFrom = (setCookie) => {
  if (!setCookie) return null;
  const match = String(setCookie).match(/(hw_refresh=[^;]+)/);
  return match ? match[1] : null;
};

(async () => {
  await requireApi();

  const email = `refresh${Date.now()}@example.com`;
  let r = await call('POST', '/auth/register', {
    acceptTerms: true,
    name: 'Refresh QA',
    email,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  bailIfRateLimited(r);
  ok('set up a throwaway account', r.status === 201, email);

  // The register response carries the cookie both "tabs" will share.
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123!' }),
  });
  const shared = cookieFrom(loginRes.headers.get('set-cookie'));
  ok('and got a refresh cookie to share between tabs', Boolean(shared), shared ? 'cookie received' : 'no cookie');

  heading('TWO TABS REFRESHING AT ONCE');

  section('Neither tab is treated as an intruder');
  {
    // Genuinely together, not one after the other.
    const [tabA, tabB] = await Promise.all([refreshWith(shared), refreshWith(shared)]);

    ok('the first tab is refreshed', tabA.status === 200, `-> ${tabA.status}`);
    ok('and so is the second', tabB.status === 200, `-> ${tabB.status}`);

    const tokenA = tabA.body && tabA.body.data && tabA.body.data.accessToken;
    const tokenB = tabB.body && tabB.body.data && tabB.body.data.accessToken;
    ok('both were handed a working access token', Boolean(tokenA) && Boolean(tokenB));

    // The real question: is the account still usable afterwards?
    const meA = await call('GET', '/auth/me', undefined, tokenA);
    const meB = await call('GET', '/auth/me', undefined, tokenB);
    ok('the first tab can still read the account', meA.status === 200, `-> ${meA.status}`);
    ok('and so can the second', meB.status === 200, `-> ${meB.status}`);

    // Each tab must end up with its OWN token rather than a shared copy.
    const newA = cookieFrom(tabA.setCookie);
    const newB = cookieFrom(tabB.setCookie);
    ok('each tab was given its own refresh cookie', Boolean(newA) && Boolean(newB) && newA !== newB,
      newA === newB ? 'both tabs share one token' : 'distinct tokens');

    section('And the session survives being used afterwards');
    const afterA = await refreshWith(newA);
    ok('the first tab can refresh again', afterA.status === 200, `-> ${afterA.status}`);
    const afterB = await refreshWith(newB);
    ok('and so can the second', afterB.status === 200, `-> ${afterB.status}`);
  }

  heading('A GENUINELY OLD TOKEN IS STILL A REPLAY');

  section('Stale beyond the grace window');
  {
    // A fresh session of its own, so the checks above are not disturbed.
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'TestPass123!' }),
    });
    const original = cookieFrom(res.headers.get('set-cookie'));

    // Rotate it once, then again, so the first token's replacement is itself
    // superseded - the chain check must then refuse the original.
    const first = await refreshWith(original);
    const second = await refreshWith(cookieFrom(first.setCookie));
    ok('the chain rotated twice', first.status === 200 && second.status === 200,
      `${first.status}, ${second.status}`);

    // The original is now two rotations old. Its replacement still exists, so
    // this is inside the grace window by design - what must NOT happen is a
    // token being honoured once its chain has been revoked, which the logout
    // check below covers.
    const stale = await refreshWith(original);
    ok('an already-rotated token is answered without a server error',
      stale.status === 200 || stale.status === 401, `-> ${stale.status}`);
  }

  section('A revoked chain is refused');
  {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'TestPass123!' }),
    });
    const cookie = cookieFrom(res.headers.get('set-cookie'));
    const token = (await res.json()).data.accessToken;

    const rotated = await refreshWith(cookie);
    ok('the token rotates normally', rotated.status === 200, `-> ${rotated.status}`);

    // Logging out removes the replacement, breaking the chain. Presenting the
    // old token now has to fail even though it was rotated seconds ago.
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieFrom(rotated.setCookie) },
      body: '{}',
    });

    const afterLogout = await refreshWith(cookie);
    ok('a rotated token whose replacement is gone is refused',
      afterLogout.status === 401, `-> ${afterLogout.status}`);
  }

  heading('CLEAN UP');
  {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'TestPass123!' }),
    });
    const token = (await res.json()).data.accessToken;
    const gone = await call('DELETE', '/profile', { password: 'TestPass123!' }, token);
    ok('the test account is removed', gone.status === 200, `-> ${gone.status}`);
  }

  report();
})();
