/**
 * Settings QA, option by option. Everything destructive runs against a
 * throwaway account, so seeded data survives.
 *
 * Run with:  npm run qa
 */
const { ok, section, heading, call, report, requireApi, bailIfRateLimited, currentCookie } = require('./helpers');

(async () => {
  await requireApi();

  // A throwaway account carries every test, destructive ones included.
  const email = `settings${Date.now()}@example.com`;
  let r = await call('POST', '/auth/register', { acceptTerms: true, name: 'Settings QA', email, password: 'TestPass123!', confirmPassword: 'TestPass123!' });
  bailIfRateLimited(r);
  let token = r.data?.data?.accessToken;
  ok('set up a throwaway account', r.status === 201 && !!token, email);

  heading('CARD 1 — PROFILE');

  section('Full name');
  r = await call('PUT', '/profile', { name: 'Renamed Student' }, token);
  ok('a valid name saves', r.status === 200 && r.data?.data?.user?.name === 'Renamed Student', r.data?.data?.user?.name);
  r = await call('GET', '/auth/me', undefined, token);
  ok('and it persists after a reload', r.data?.data?.user?.name === 'Renamed Student', r.data?.data?.user?.name);
  r = await call('PUT', '/profile', { name: '' }, token);
  ok('an empty name is rejected', r.status === 400, `-> ${r.status}`);
  r = await call('PUT', '/profile', { name: 'x'.repeat(61) }, token);
  ok('a 61-character name is rejected', r.status === 400, `-> ${r.status}`);

  section('Monthly pocket money');
  r = await call('PUT', '/profile', { monthlyIncome: 32000 }, token);
  ok('a valid income saves', r.status === 200 && r.data?.data?.user?.monthlyIncome === 32000, String(r.data?.data?.user?.monthlyIncome));
  r = await call('PUT', '/profile', { monthlyIncome: -500 }, token);
  ok('a negative income is rejected', r.status === 400, `-> ${r.status}`);
  r = await call('PUT', '/profile', { monthlyIncome: 'abc' }, token);
  ok('a non-numeric income is rejected', r.status === 400, `-> ${r.status}`);
  r = await call('PUT', '/profile', { monthlyIncome: 0 }, token);
  ok('zero income is allowed (a student may have none)', r.status === 200, `-> ${r.status}`);
  await call('PUT', '/profile', { monthlyIncome: 32000 }, token);

  section('Currency');
  const meta = (await call('GET', '/meta')).data?.data;
  const codes = (meta?.currencies || []).map((c) => c.code);
  let allCurrenciesOk = true;
  for (const code of codes) {
    const res = await call('PUT', '/profile', { currency: code }, token);
    if (res.status !== 200 || res.data?.data?.user?.currency !== code) allCurrenciesOk = false;
  }
  ok(`all ${codes.length} currencies are accepted`, allCurrenciesOk, codes.join(', '));
  r = await call('PUT', '/profile', { currency: 'XYZ' }, token);
  ok('an unsupported currency is rejected', r.status === 400, `-> ${r.status}`);
  await call('PUT', '/profile', { currency: 'PKR' }, token);

  section('University and Hostel name (both optional)');
  r = await call('PUT', '/profile', { university: '', hostelName: '' }, token);
  ok('both may be left empty', r.status === 200, `-> ${r.status}`);
  r = await call('PUT', '/profile', { university: 'NUST', hostelName: 'Block C' }, token);
  ok('both save', r.status === 200 && r.data?.data?.user?.university === 'NUST', `${r.data?.data?.user?.university} / ${r.data?.data?.user?.hostelName}`);
  r = await call('PUT', '/profile', { university: 'x'.repeat(101) }, token);
  ok('a 101-character university is rejected', r.status === 400, `-> ${r.status}`);

  heading('CARD 2 — APPEARANCE (theme)');
  for (const theme of ['light', 'dark', 'system']) {
    r = await call('PUT', '/profile', { theme }, token);
    ok(`theme "${theme}" saves`, r.status === 200 && r.data?.data?.user?.theme === theme, r.data?.data?.user?.theme);
  }
  r = await call('PUT', '/profile', { theme: 'neon' }, token);
  ok('an unknown theme is rejected', r.status === 400, `-> ${r.status}`);

  heading('CARD 3 — CATEGORIES');
  r = await call('GET', '/profile/categories', undefined, token);
  const builtIn = r.data?.data?.defaults || r.data?.data?.all || [];
  ok('the built-in list loads', r.status === 200 && builtIn.length >= 9, `${builtIn.length} categories`);

  r = await call('POST', '/profile/categories', { name: 'Gym' }, token);
  ok('add a custom category', r.status === 200 || r.status === 201, `-> ${r.status}`);
  r = await call('GET', '/profile/categories', undefined, token);
  ok('it appears in the list', (r.data?.data?.all || []).includes('Gym'), `${(r.data?.data?.all || []).length} total`);

  r = await call('POST', '/profile/categories', { name: 'Gym' }, token);
  ok('a duplicate is rejected', r.status >= 400, `-> ${r.status}`);
  r = await call('POST', '/profile/categories', { name: 'Mess/Food' }, token);
  ok('clashing with a built-in name is rejected', r.status >= 400, `-> ${r.status}`);
  r = await call('POST', '/profile/categories', { name: '   ' }, token);
  ok('a blank name is rejected', r.status === 400, `-> ${r.status}`);
  r = await call('POST', '/profile/categories', { name: 'y'.repeat(41) }, token);
  ok('a 41-character name is rejected', r.status === 400, `-> ${r.status}`);

  // An unused custom category comes straight out.
  r = await call('DELETE', '/profile/categories/Gym', undefined, token);
  ok('an unused custom category is removed', r.status === 200, `-> ${r.status}`);

  // One that is in use must NOT be, or its expenses would be orphaned.
  await call('POST', '/profile/categories', { name: 'Gym' }, token);
  await call('POST', '/expenses', { amount: 500, category: 'Gym', description: 'QA gym fee' }, token);
  r = await call('DELETE', '/profile/categories/Gym', undefined, token);
  ok('a category still in use is refused', r.status === 400, `-> ${r.status}`);
  ok('and the refusal says how many expenses use it', /\d+ expense/.test(r.data?.message || ''), r.data?.message);

  r = await call('DELETE', '/profile/categories/Mess%2FFood', undefined, token);
  ok('a built-in category cannot be removed', r.status >= 400, `-> ${r.status}`);

  heading('CARD 4 — SECURITY AND DATA');

  section('Export my data');
  r = await call('GET', '/profile/export', undefined, token);
  const dump = r.data?.data || r.data;
  const dumpStr = JSON.stringify(dump || '');
  ok('export returns something', r.status === 200 && dumpStr.length > 50, `${dumpStr.length} chars`);
  ok('the export contains the expenses', /QA gym fee/.test(dumpStr), 'test expense found in the dump');
  ok('the export does NOT contain the password hash', !/\$2[aby]\$/.test(dumpStr), 'no bcrypt hash leaked');

  // A file that calls itself everything has to be everything. Someone
  // exporting before deleting their account must not lose the half of their
  // records that happened to be in the other mode.
  {
    let x = await call('PUT', '/profile', { financeMode: 'householder' }, token);
    ok('switch to the other mode to leave a record there', x.status === 200, `-> ${x.status}`);
    x = await call('POST', '/expenses', { amount: 4321, category: 'electricity_bill', date: new Date().toISOString(), description: 'QA bijli bill' }, token);
    ok('a household expense is logged', x.status === 201, `-> ${x.status}`);

    x = await call('PUT', '/profile', { financeMode: 'student' }, token);
    ok('and back to student mode', x.status === 200, `-> ${x.status}`);

    // A cancelled record and a settled one, so the export can be checked for
    // representing both accurately rather than tidying them away.
    let d = await call('POST', '/debts', { kind: 'LENT', personName: 'QA cancelled', originalAmount: 400 }, token);
    const cancelledId = d.data?.data?.debt?._id;
    await call('POST', `/debts/${cancelledId}/cancel`, { reason: 'written off' }, token);

    d = await call('POST', '/debts', { kind: 'BORROWED', personName: 'QA settled', originalAmount: 300 }, token);
    const settledId = d.data?.data?.debt?._id;
    await call('POST', `/debts/${settledId}/settle`, {}, token);

    x = await call('GET', '/profile/export', undefined, token);
    const dump = x.data?.data || x.data || {};
    const both = JSON.stringify(dump);

    ok('the export carries the student records', /QA gym fee/.test(both), 'student expense present');
    ok('and the household ones the person is not currently looking at',
      /QA bijli bill/.test(both), 'household expense present');
    ok('and says which modes it covers',
      /"financeModes"/.test(both) && /householder/.test(both), 'financeModes declared');

    // Separated rather than poured into one list, so a reader can tell which
    // life each record belongs to without inspecting every row.
    ok('it is organised by finance mode',
      Boolean(dump.byFinanceMode && dump.byFinanceMode.student && dump.byFinanceMode.householder),
      Object.keys(dump.byFinanceMode || {}).join(', '));
    ok('and names itself a complete-account export',
      dump.scope === 'complete-account', String(dump.scope));

    const studentSection = (dump.byFinanceMode && dump.byFinanceMode.student) || {};
    const houseSection = (dump.byFinanceMode && dump.byFinanceMode.householder) || {};

    ok('the student section holds only student rows',
      (studentSection.expenses || []).every((e) => e.financeMode === 'student'),
      `${(studentSection.expenses || []).length} rows`);
    ok('the household section holds only household rows',
      (houseSection.expenses || []).every((e) => e.financeMode === 'householder'),
      `${(houseSection.expenses || []).length} rows`);

    // Stored ids stay; labels are added beside them, never instead of them.
    const anyExpense = (houseSection.expenses || [])[0];
    ok('rows keep their stored category id', Boolean(anyExpense && anyExpense.category),
      anyExpense && anyExpense.category);
    ok('and carry a readable label alongside it', Boolean(anyExpense && anyExpense.categoryLabel),
      anyExpense && anyExpense.categoryLabel);

    // Udhaar, with its ledger and its real statuses.
    const exportedDebts = studentSection.debts || [];
    ok('cancelled udhaar is in the export, not dropped',
      exportedDebts.some((x2) => x2.status === 'CANCELLED'),
      exportedDebts.map((x2) => x2.status).join(', '));
    ok('and settled udhaar keeps the ledger that proves what was paid',
      exportedDebts.some((x2) => x2.status === 'SETTLED' && (x2.payments || []).length > 0),
      exportedDebts.map((x2) => `${x2.status}:${(x2.payments || []).length}`).join(' '));

    // Goals belong to neither mode and are listed once.
    ok('goals are listed once, as shared', Array.isArray(dump.shared && dump.shared.goals),
      `${((dump.shared || {}).goals || []).length} goal(s)`);
    ok('and are not copied into either mode section',
      studentSection.goals === undefined && houseSection.goals === undefined,
      'no duplicate goals');
  }

  section('Change password');
  r = await call('PUT', '/auth/change-password', { currentPassword: 'wrong-one', newPassword: 'NewPass456!' }, token);
  ok('a wrong current password is rejected', r.status === 401 || r.status === 400, `-> ${r.status}`);
  r = await call('PUT', '/auth/change-password', { currentPassword: 'TestPass123!', newPassword: 'short' }, token);
  ok('a weak new password is rejected', r.status === 400, `-> ${r.status}`);
  // Captured before the change: changing the password revokes every session and
  // then issues a fresh one, so the jar moves on to a valid cookie immediately.
  // Replaying the captured one is the only way to prove the old one is dead.
  const cookieBefore = currentCookie();
  r = await call('PUT', '/auth/change-password', { currentPassword: 'TestPass123!', newPassword: 'NewPass456!' }, token);
  ok('a valid change succeeds', r.status === 200, `-> ${r.status}`);

  r = await call('POST', '/auth/refresh', undefined, undefined, { cookie: cookieBefore });
  ok('the refresh token from before the change is revoked', r.status === 401, `-> ${r.status}`);

  r = await call('POST', '/auth/refresh', undefined);
  ok('the session that changed it stays signed in', r.status === 200, `-> ${r.status}`);

  // Revocation must take effect on access-token requests as well as refresh.
  r = await call('GET', '/auth/me', undefined, token);
  ok('the access token from before the change is revoked', r.status === 401, `-> ${r.status}`);

  r = await call('POST', '/auth/login', { email, password: 'TestPass123!' });
  ok('the old password stops working', r.status === 401, `-> ${r.status}`);
  r = await call('POST', '/auth/login', { email, password: 'NewPass456!' });
  ok('the new password works', r.status === 200, `-> ${r.status}`);
  const freshToken = r.data?.data?.accessToken;
  token = freshToken;

  heading('MODE AND LANGUAGE');

  section('Onboarding asks first, and the answer has to survive');
  {
    // The wizard collects the mode and the language before anything else. If
    // the endpoint drops them, the person answers two questions for nothing
    // and lands on a dashboard built for somebody else.
    const wizardEmail = `wizard${Date.now()}@example.com`;
    let w = await call('POST', '/auth/register', {
      acceptTerms: true, name: 'Wizard QA', email: wizardEmail,
      password: 'TestPass123!', confirmPassword: 'TestPass123!',
    });
    const wizardToken = w.data?.data?.accessToken;
    ok('a second throwaway account for the wizard', w.status === 201 && !!wizardToken, wizardEmail);

    w = await call('POST', '/profile/onboarding', {
      financeMode: 'householder', language: 'roman_ur', monthlyIncome: 90000, currency: 'PKR',
    }, wizardToken);
    ok('onboarding accepts a mode and a language', w.status === 200, `-> ${w.status}`);
    ok('the mode it was told is the mode it saved',
      w.data?.data?.user?.financeMode === 'householder', String(w.data?.data?.user?.financeMode));
    ok('and the language too',
      w.data?.data?.user?.language === 'roman_ur', String(w.data?.data?.user?.language));

    w = await call('GET', '/auth/me', undefined, wizardToken);
    ok('both survive a reload', w.data?.data?.user?.financeMode === 'householder'
      && w.data?.data?.user?.language === 'roman_ur',
      `${w.data?.data?.user?.financeMode}/${w.data?.data?.user?.language}`);

    // A householder gets the householder categories, not the hostel ones.
    w = await call('GET', '/profile/categories', undefined, wizardToken);
    const all = w.data?.data?.all || [];
    ok('and the categories follow the mode', all.includes('electricity_bill') && !all.includes('Mess/Food'),
      `${all.length} categories`);

    await call('DELETE', '/profile', { password: 'TestPass123!' }, wizardToken);
  }

  section('Switching mode keeps both sets of books');
  {
    // The promise the confirmation dialog makes: nothing is deleted, the other
    // side is simply out of view. If this fails, the dialog is lying.
    let m = await call('POST', '/expenses', { amount: 120, category: 'Mess/Food', date: new Date().toISOString() }, token);
    ok('an expense is logged in student mode', m.status === 201, `-> ${m.status}`);

    // Earlier sections logged their own expenses on this account, so the test
    // is that the count comes back unchanged - not that it is one.
    m = await call('GET', '/expenses', undefined, token);
    const studentCount = (m.data?.data?.items || []).length;

    m = await call('PUT', '/profile', { financeMode: 'householder' }, token);
    ok('the mode can be switched', m.status === 200 && m.data?.data?.user?.financeMode === 'householder',
      String(m.data?.data?.user?.financeMode));

    m = await call('GET', '/expenses', undefined, token);
    const houseItems = m.data?.data?.items || [];
    // Earlier sections put a record on the household side too, so the test is
    // that the student one is not here - not that nothing is.
    ok('the student expense is out of view',
      !houseItems.some((e) => Number(e.amount) === 120),
      `${houseItems.length} household items, none of them the student's`);

    // The strong form: the household total is exactly the household rows.
    // Anything leaking across from student mode would show up as a difference.
    const houseSum = houseItems.reduce((total, e) => total + Number(e.amount), 0);
    m = await call('GET', '/dashboard/summary', undefined, token);
    ok('and the household total is exactly the household records',
      Math.abs(Number(m.data?.data?.totals?.spent || 0) - houseSum) < 0.01,
      `total=${m.data?.data?.totals?.spent} rows=${houseSum}`);

    m = await call('PUT', '/profile', { financeMode: 'student' }, token);
    ok('switching back is allowed', m.status === 200, `-> ${m.status}`);

    m = await call('GET', '/expenses', undefined, token);
    ok('and every record is exactly where it was left',
      (m.data?.data?.items || []).length === studentCount,
      `${studentCount} before, ${(m.data?.data?.items || []).length} after`);
    ok('with amounts untouched', m.data?.data?.items?.[0]?.amount === 120,
      String(m.data?.data?.items?.[0]?.amount));
  }

  section('Only the modes and languages the app has');
  r = await call('PUT', '/profile', { financeMode: 'landlord' }, token);
  ok('an invented mode is refused', r.status === 400, `-> ${r.status}`);
  r = await call('PUT', '/profile', { language: 'fr' }, token);
  ok('an unsupported language is refused', r.status === 400, `-> ${r.status}`);
  r = await call('PUT', '/profile', { language: 'roman_ur' }, token);
  ok('a supported one is accepted', r.status === 200 && r.data?.data?.user?.language === 'roman_ur',
    String(r.data?.data?.user?.language));
  await call('PUT', '/profile', { language: 'en' }, token);

  section('Delete account');
  r = await call('DELETE', '/profile', { password: 'wrong-password' }, freshToken);
  ok('a wrong password will not delete the account', r.status === 401 || r.status === 400, `-> ${r.status}`);
  r = await call('GET', '/auth/me', undefined, freshToken);
  ok('the account is still there after the failed attempt', r.status === 200, `-> ${r.status}`);
  r = await call('DELETE', '/profile', { password: 'NewPass456!' }, freshToken);
  ok('the right password deletes the account', r.status === 200, `-> ${r.status}`);
  r = await call('POST', '/auth/login', { email, password: 'NewPass456!' });
  // 429 is the auth rate limiter, which this suite trips by design after many
  // login attempts. Either way the sign-in did not succeed, which is the point.
  ok('the deleted account can no longer sign in', r.status === 401 || r.status === 429,
    `-> ${r.status}${r.status === 429 ? ' (rate limited — brute-force guard is live)' : ''}`);

  report();
})().catch((e) => {
  console.error('\nThe suite crashed:', e.message);
  process.exit(1);
});
