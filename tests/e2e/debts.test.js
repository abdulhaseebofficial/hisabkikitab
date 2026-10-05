/**
 * Udhaar: the money rules, end to end.
 *
 * This is where the arithmetic is actually held. A debt is the one place in the
 * app where a rounding error is not cosmetic - payments have to add up to
 * exactly the original amount, and "settled" has to mean nothing is left. Most
 * of what follows is about that, plus the two things a shared ledger has to get
 * right: nobody may touch another student's records, and a refused payment must
 * leave no trace.
 *
 * Run with:  npm run qa:debts   (the API must be running)
 */
const { ok, section, call, report, requireApi, bailIfRateLimited } = require('./helpers');

(async () => {
  await requireApi();

  const email = `debts-${Date.now()}@example.com`;
  let r = await call('POST', '/auth/register', { acceptTerms: true,
    name: 'Debt Student', email, password: 'DebtPass123!', confirmPassword: 'DebtPass123!',
  });
  bailIfRateLimited(r);
  const token = r.data?.data?.accessToken;
  ok('an account for the debt checks', r.status === 201, `-> ${r.status}`);

  section('CREATING A RECORD');

  r = await call('POST', '/debts', {
    kind: 'BORROWED', personName: 'Ali', originalAmount: 5000,
    note: 'Mess bill emergency', personContact: '0300-1234567',
  }, token);
  const borrowedId = r.data?.data?.debt?._id;
  const borrowedContactId = r.data?.data?.debt?.contactId;
  ok('a borrowed record is created', r.status === 201, `-> ${r.status}`);
  ok('a new debt has a stable contact id', /^[0-9a-f-]{36}$/i.test(borrowedContactId || ''));
  ok('it starts PENDING', r.data?.data?.debt?.status === 'PENDING', r.data?.data?.debt?.status);
  ok('with nothing paid', r.data?.data?.debt?.paidAmount === 0, `${r.data?.data?.debt?.paidAmount}`);
  ok('and the whole amount remaining', r.data?.data?.debt?.remainingAmount === 5000,
    `${r.data?.data?.debt?.remainingAmount}`);
  ok('a record with no due date is never overdue', r.data?.data?.debt?.isOverdue === false);
  ok('the contact is kept', r.data?.data?.debt?.personContact === '0300-1234567');

  r = await call('POST', '/debts', { kind: 'LENT', personName: 'Sara', originalAmount: 1200 }, token);
  const lentId = r.data?.data?.debt?._id;
  ok('a lent record is created', r.status === 201, `-> ${r.status}`);

  section('AMOUNTS AND FIELDS THAT MUST BE REFUSED');

  for (const [label, amount] of [['zero', 0], ['a negative', -100]]) {
    r = await call('POST', '/debts', { kind: 'LENT', personName: 'X', originalAmount: amount }, token);
    ok(`${label} amount is refused`, r.status === 400, `-> ${r.status}`);
  }
  r = await call('POST', '/debts', { kind: 'SOMETHING', personName: 'X', originalAmount: 10 }, token);
  ok('an unknown kind is refused', r.status === 400, `-> ${r.status}`);
  r = await call('POST', '/debts', { kind: 'LENT', personName: '   ', originalAmount: 10 }, token);
  ok('a blank person name is refused', r.status === 400, `-> ${r.status}`);
  r = await call('POST', '/debts', { kind: 'LENT', originalAmount: 10 }, token);
  ok('a missing person name is refused', r.status === 400, `-> ${r.status}`);
  r = await call('POST', '/debts',
    { kind: 'LENT', personName: 'X', originalAmount: 10, category: 'NotOneOfMine' }, token);
  ok('a category that is not the student’s own is refused', r.status === 400, `-> ${r.status}`);

  section('EXACT ARITHMETIC - why these columns are numeric');

  r = await call('POST', '/debts',
    { kind: 'BORROWED', personName: 'Float Test', originalAmount: 100 }, token);
  const floatId = r.data?.data?.debt?._id;
  for (const amount of [33.33, 33.33, 33.33]) {
    await call('POST', `/debts/${floatId}/payments`, { amount }, token);
  }
  r = await call('GET', `/debts/${floatId}`, undefined, token);
  // In floating point this lands on 0.010000000000005 and never settles.
  ok('three payments of 33.33 leave exactly 0.01',
    r.data?.data?.debt?.remainingAmount === 0.01, `${r.data?.data?.debt?.remainingAmount}`);
  r = await call('POST', `/debts/${floatId}/payments`, { amount: 0.01 }, token);
  ok('and the last 0.01 settles it exactly',
    r.data?.data?.debt?.status === 'SETTLED' && r.data?.data?.debt?.remainingAmount === 0,
    `${r.data?.data?.debt?.status}, remaining=${r.data?.data?.debt?.remainingAmount}`);

  section('PARTIAL PAYMENTS');

  r = await call('POST', `/debts/${borrowedId}/payments`,
    { amount: 2000, note: 'First instalment' }, token);
  ok('a partial payment is recorded', r.status === 201, `-> ${r.status}`);
  ok('the status becomes PARTIALLY_PAID', r.data?.data?.debt?.status === 'PARTIALLY_PAID',
    r.data?.data?.debt?.status);
  ok('and the remaining drops', r.data?.data?.debt?.remainingAmount === 3000,
    `${r.data?.data?.debt?.remainingAmount}`);

  r = await call('POST', `/debts/${borrowedId}/payments`, { amount: 0 }, token);
  ok('a zero payment is refused', r.status === 400, `-> ${r.status}`);
  r = await call('POST', `/debts/${borrowedId}/payments`, { amount: -500 }, token);
  ok('a negative payment is refused', r.status === 400, `-> ${r.status}`);

  section('OVERPAYMENT LEAVES NOTHING BEHIND');

  r = await call('POST', `/debts/${borrowedId}/payments`, { amount: 999999 }, token);
  ok('paying more than is left is refused', r.status === 400, `-> ${r.status}`);
  ok('and the message says how much is left', /3000/.test(r.data?.message || ''), r.data?.message);

  // The important half: the transaction rolled back, so the ledger and the
  // balance are exactly as they were.
  r = await call('GET', `/debts/${borrowedId}`, undefined, token);
  ok('the balance is unchanged', r.data?.data?.debt?.remainingAmount === 3000,
    `${r.data?.data?.debt?.remainingAmount}`);
  ok('and no payment row was written', (r.data?.data?.payments || []).length === 1,
    `${(r.data?.data?.payments || []).length} payments`);

  section('SETTLING IN FULL');

  r = await call('POST', `/debts/${borrowedId}/settle`, {}, token);
  ok('settle clears whatever is left', r.data?.data?.debt?.status === 'SETTLED',
    r.data?.data?.debt?.status);
  ok('remaining is exactly zero', r.data?.data?.debt?.remainingAmount === 0);
  r = await call('POST', `/debts/${borrowedId}/settle`, {}, token);
  ok('settling an already settled record is refused', r.status === 400, `-> ${r.status}`);

  // A settled record keeps its history rather than disappearing.
  r = await call('GET', `/debts/${borrowedId}`, undefined, token);
  ok('a settled record keeps its full ledger', (r.data?.data?.payments || []).length === 2,
    `${(r.data?.data?.payments || []).length} payments`);
  ok('and the payments add up to the original',
    (r.data?.data?.payments || []).reduce((sum, p) => sum + p.amount, 0) === 5000);

  section('CORRECTING A MISTYPED PAYMENT');

  const paymentId = r.data?.data?.payments?.[0]?._id;
  r = await call('DELETE', `/debts/${borrowedId}/payments/${paymentId}`, undefined, token);
  ok('a payment can be undone', r.status === 200, `-> ${r.status}`);
  ok('and the record reopens', r.data?.data?.debt?.status === 'PARTIALLY_PAID',
    `${r.data?.data?.debt?.status}, remaining=${r.data?.data?.debt?.remainingAmount}`);
  r = await call('DELETE', `/debts/${borrowedId}/payments/${paymentId}`, undefined, token);
  ok('undoing it twice is a 404', r.status === 404, `-> ${r.status}`);

  section('OVERDUE IS DERIVED, NOT STORED');

  const past = new Date();
  past.setDate(past.getDate() - 3);
  r = await call('POST', '/debts', {
    kind: 'LENT', personName: 'Late Bilal', originalAmount: 800, dueDate: past.toISOString(),
  }, token);
  const overdueId = r.data?.data?.debt?._id;
  ok('a past due date reads as overdue straight away', r.data?.data?.debt?.isOverdue === true);
  ok('while the stored status stays PENDING', r.data?.data?.debt?.status === 'PENDING',
    r.data?.data?.debt?.status);

  r = await call('GET', '/debts?status=OVERDUE', undefined, token);
  ok('overdue can be filtered on', (r.data?.data?.items || []).some((d) => d._id === overdueId),
    `${(r.data?.data?.items || []).length} rows`);

  const future = new Date();
  future.setDate(future.getDate() + 30);
  r = await call('POST', '/debts', {
    kind: 'LENT', personName: 'Future Usman', originalAmount: 300, dueDate: future.toISOString(),
  }, token);
  ok('a future due date is not overdue', r.data?.data?.debt?.isOverdue === false);

  section('SUMMARY');

  r = await call('GET', '/debts/summary', undefined, token);
  const s = r.data?.data;
  ok('the summary loads', r.status === 200, `-> ${r.status}`);
  // Ali: 5000 borrowed, 2000 still paid after the settle payment was undone.
  // Float Test is settled, so it contributes nothing.
  ok('payable counts only outstanding borrowed', s?.payable === 3000, `payable=${s?.payable}`);
  ok('receivable counts only outstanding lent', s?.receivable === 2300, `receivable=${s?.receivable}`);
  ok('net balance is receivable minus payable', s?.netBalance === -700, `net=${s?.netBalance}`);
  ok('overdue counts only what is late and unpaid', s?.overdue === 800, `overdue=${s?.overdue}`);
  ok('settled records are counted apart', s?.settledCount === 1, `settled=${s?.settledCount}`);
  ok('and due-soon records are listed', Array.isArray(s?.dueSoon), `${s?.dueSoon?.length} due soon`);

  section('FILTERING, SORTING AND PAGING');

  r = await call('GET', '/debts?kind=BORROWED', undefined, token);
  ok('the kind filter works', (r.data?.data?.items || []).every((d) => d.kind === 'BORROWED'),
    `${(r.data?.data?.items || []).length} rows`);
  r = await call('GET', '/debts?status=SETTLED', undefined, token);
  ok('the settled filter works', (r.data?.data?.items || []).every((d) => d.status === 'SETTLED'),
    `${(r.data?.data?.items || []).length} rows`);
  r = await call('GET', '/debts?status=OUTSTANDING', undefined, token);
  ok('the outstanding filter excludes settled',
    (r.data?.data?.items || []).every((d) => d.status !== 'SETTLED'),
    `${(r.data?.data?.items || []).length} rows`);

  // This once threw a 500: the second half of the clause pointed at the wrong
  // parameter, so a name was compared against a user id.
  r = await call('GET', '/debts?search=Sara', undefined, token);
  ok('person search finds the record', r.status === 200 && (r.data?.data?.items || []).length === 1,
    `-> ${r.status}, ${(r.data?.data?.items || []).length} rows`);
  r = await call('GET', '/debts?search=Mess%20bill', undefined, token);
  ok('search also looks at the note', (r.data?.data?.items || []).length === 1,
    `${(r.data?.data?.items || []).length} rows`);
  r = await call('GET', '/debts?search=%25', undefined, token);
  ok('a wildcard typed into search is escaped, not executed',
    r.status === 200 && (r.data?.data?.items || []).length === 0, `-> ${r.status}`);

  r = await call('GET', '/debts?sort=amount', undefined, token);
  const amounts = (r.data?.data?.items || []).map((d) => d.originalAmount);
  ok('sorting by amount is largest first',
    amounts.every((a, i) => i === 0 || amounts[i - 1] >= a), amounts.join(', '));

  r = await call('GET', '/debts?limit=2', undefined, token);
  ok('paging uses the same shape as every other list',
    r.data?.data?.pagination && 'hasNext' in r.data.data.pagination && 'pages' in r.data.data.pagination,
    JSON.stringify(r.data?.data?.pagination));
  ok('and honours the limit', (r.data?.data?.items || []).length <= 2);

  r = await call('GET', '/debts?status=NONSENSE', undefined, token);
  ok('an unknown status filter is refused', r.status === 400, `-> ${r.status}`);
  r = await call('GET', '/debts?sort=nonsense', undefined, token);
  ok('an unknown sort is refused', r.status === 400, `-> ${r.status}`);

  section('EDITING');

  r = await call('PUT', `/debts/${lentId}`, { personName: 'Sara Khan', note: 'For the trip' }, token);
  ok('a record can be edited', r.data?.data?.debt?.personName === 'Sara Khan', `-> ${r.status}`);
  r = await call('PUT', `/debts/${borrowedId}`, { originalAmount: 100 }, token);
  ok('the amount cannot be corrected below what is already paid', r.status === 400, `-> ${r.status}`);
  ok('and the message says how much that is', /2000/.test(r.data?.message || ''), r.data?.message);
  r = await call('PUT', `/debts/${borrowedId}`, { originalAmount: 2000 }, token);
  ok('correcting it down to exactly what was paid settles it',
    r.data?.data?.debt?.status === 'SETTLED', r.data?.data?.debt?.status);

  section('ONE STUDENT MUST NOT TOUCH ANOTHER’S');

  const other = await call('POST', '/auth/register', { acceptTerms: true,
    name: 'Other Student', email: `other-${Date.now()}@example.com`,
    password: 'OtherPass123!', confirmPassword: 'OtherPass123!',
  });
  const otherToken = other.data?.data?.accessToken;

  r = await call('POST', '/debts', { kind: 'LENT', personName: 'Ali', originalAmount: 1 }, otherToken);
  const otherDebtId = r.data?.data?.debt?._id;
  const otherContactId = r.data?.data?.debt?.contactId;
  ok('another user can have the same display name with a different contact id',
    r.status === 201 && otherContactId && otherContactId !== borrowedContactId);
  r = await call('POST', '/debts', { kind: 'LENT', contactId: otherContactId, originalAmount: 1 }, token);
  ok('cross-user contact cannot be used to create a debt', r.status === 404, `-> ${r.status}`);
  r = await call('PATCH', `/debts/contacts/${otherContactId}`, { displayName: 'Stolen' }, token);
  ok('cross-user contact cannot be renamed', r.status === 404, `-> ${r.status}`);
  r = await call('PATCH', `/debts/contacts/${borrowedContactId}`, { displayName: 'Stolen' }, otherToken);
  ok('another user cannot rename the owner contact', r.status === 404, `-> ${r.status}`);
  r = await call('GET', '/debts/contacts?search=Ali', undefined, token);
  ok('contact list is scoped to the authenticated user', r.status === 200 &&
    r.data?.data?.items?.some((item) => item.id === borrowedContactId) &&
    !r.data?.data?.items?.some((item) => item.id === otherContactId));
  r = await call('GET', `/debts/people/records?contactId=${borrowedContactId}`, undefined, otherToken);
  ok('guessed contact id does not reveal another user debt records',
    r.status === 200 && r.data?.data?.items?.length === 0);

  for (const [what, method, path, body] of [
    ['read', 'GET', `/debts/${lentId}`, undefined],
    ['edit', 'PUT', `/debts/${lentId}`, { note: 'hacked' }],
    ['delete', 'DELETE', `/debts/${lentId}`, undefined],
    ['pay', 'POST', `/debts/${lentId}/payments`, { amount: 1 }],
    ['settle', 'POST', `/debts/${lentId}/settle`, {}],
    ['read the ledger of', 'GET', `/debts/${lentId}/payments`, undefined],
  ]) {
    const res = await call(method, path, body, otherToken);
    ok(`another student cannot ${what} it`, res.status === 404, `-> ${res.status}`);
  }

  r = await call('GET', '/debts', undefined, otherToken);
  ok('and sees only their own debt in a list', (r.data?.data?.items || []).length === 1 &&
    r.data?.data?.items?.[0]?._id === otherDebtId);
  r = await call('GET', '/debts/summary', undefined, otherToken);
  ok('and their summary includes only their own debt',
    r.data?.data?.payable === 0 && r.data?.data?.receivable === 1);
  r = await call('GET', '/debts?search=Sara', undefined, otherToken);
  ok('nor through search', (r.data?.data?.items || []).length === 0);

  section('AUTHENTICATION AND BAD IDS');

  for (const [method, path] of [
    ['GET', '/debts'], ['GET', '/debts/summary'], ['POST', '/debts'],
    ['GET', `/debts/${lentId}`], ['POST', `/debts/${lentId}/payments`],
  ]) {
    const res = await call(method, path);
    ok(`${method} ${path.split('?')[0]} needs a token`, res.status === 401, `-> ${res.status}`);
  }

  r = await call('GET', '/debts/not-a-uuid', undefined, token);
  ok('a malformed id is a 400', r.status === 400, `-> ${r.status}`);
  r = await call('GET', '/debts/00000000-0000-0000-0000-000000000000', undefined, token);
  ok('a well-formed unknown id is a 404', r.status === 404, `-> ${r.status}`);
  r = await call('POST', '/debts/00000000-0000-0000-0000-000000000000/payments', { amount: 5 }, token);
  ok('paying an unknown record is a 404', r.status === 404, `-> ${r.status}`);
  r = await call('DELETE', `/debts/${lentId}/payments/not-a-uuid`, undefined, token);
  ok('a malformed payment id is a 400', r.status === 400, `-> ${r.status}`);

  section('DEBT PRINCIPAL STAYS OUT OF INCOME AND SPENDING');

  // The whole accounting decision, asserted: borrowing 5,000 and lending 1,200
  // must not have moved either dashboard figure.
  // Everything so far has been settled, so an outstanding record is created
  // here on purpose: comparing two zeroes would prove nothing about whether
  // the dashboard is really reading the same totals.
  r = await call('POST', '/debts', {
    kind: 'BORROWED',
    personName: 'Dashboard check',
    originalAmount: 777.77,
    transactionDate: new Date().toISOString(),
  }, token);
  ok('a record is left outstanding for the comparison', r.status === 201, `-> ${r.status}`);

  // Read the page's own totals first: the dashboard must repeat them exactly,
  // because the widget renders them and adds up nothing of its own.
  const pageSummary = await call('GET', '/debts/summary', undefined, token);
  const summaryPayable = pageSummary.data?.data?.payable;
  ok('the page reports the outstanding amount', summaryPayable === 777.77, `payable=${summaryPayable}`);

  r = await call('GET', '/dashboard/summary', undefined, token);
  ok('borrowing did not become income', r.data?.data?.totals?.incomeLogged === 0,
    `incomeLogged=${r.data?.data?.totals?.incomeLogged}`);
  ok('lending did not become an expense', r.data?.data?.totals?.spent === 0,
    `spent=${r.data?.data?.totals?.spent}`);
  ok('and repaying did not become one either', r.data?.data?.totals?.expenseCount === 0,
    `${r.data?.data?.totals?.expenseCount} expenses`);

  // The dashboard widget renders these figures and adds up nothing of its
  // own, so the position has to arrive with the rest of the dashboard.
  ok('the dashboard carries the debt position', r.data?.data?.debts !== undefined,
    r.data?.data?.debts === undefined ? 'no debts block' : 'present');
  ok('it agrees with the udhaar page', r.data?.data?.debts?.payable === summaryPayable,
    `dashboard=${r.data?.data?.debts?.payable} page=${summaryPayable}`);
  ok('and it carries what is falling due', Array.isArray(r.data?.data?.debts?.dueSoon),
    `dueSoon=${typeof r.data?.data?.debts?.dueSoon}`);

  section('WHAT THE MONEY WAS FOR');

  // Six months on, "Ali - 5000" tells nobody anything. The purpose is the
  // difference between a record and a note-to-self that stopped meaning
  // something.
  r = await call('POST', '/debts', {
    kind: 'BORROWED',
    personName: 'Purpose person',
    originalAmount: 1200,
    purpose: 'Hostel fee for March',
    purposeCategory: 'education',
  }, token);
  ok('a record can say what the money was for', r.status === 201, `-> ${r.status}`);
  ok('the purpose comes back as written', r.data?.data?.debt?.purpose === 'Hostel fee for March',
    String(r.data?.data?.debt?.purpose));
  ok('and so does the reason it is filed under',
    r.data?.data?.debt?.purposeCategory === 'education', String(r.data?.data?.debt?.purposeCategory));
  const purposeId = r.data?.data?.debt?._id;

  r = await call('POST', '/debts', {
    kind: 'LENT', personName: 'Bad purpose', originalAmount: 10, purposeCategory: 'holiday-on-mars',
  }, token);
  ok('a reason the app does not know is refused', r.status === 400, `-> ${r.status}`);

  // "Other" on its own is the same as no reason at all, so it has to be
  // written out. This is the requiresNote flag in the catalogue, enforced.
  r = await call('POST', '/debts', {
    kind: 'LENT', personName: 'Vague', originalAmount: 10, purposeCategory: 'other',
  }, token);
  ok('"other" with nothing written is refused', r.status === 400, `-> ${r.status}`);

  r = await call('POST', '/debts', {
    kind: 'LENT', personName: 'Explained', originalAmount: 10,
    purposeCategory: 'other', purpose: 'Lent for a bus ticket home',
  }, token);
  ok('"other" with an explanation is accepted', r.status === 201, `-> ${r.status}`);
  const explainedId = r.data?.data?.debt?._id;

  r = await call('PUT', `/debts/${purposeId}`, { purpose: 'Hostel fee for April' }, token);
  ok('the purpose can be corrected', r.data?.data?.debt?.purpose === 'Hostel fee for April',
    String(r.data?.data?.debt?.purpose));

  r = await call('PUT', `/debts/${purposeId}`, { purpose: 'x'.repeat(301) }, token);
  ok('an essay is refused rather than truncated', r.status === 400, `-> ${r.status}`);

  section('CANCELLING A RECORD, WHICH IS NOT DELETING IT');

  const beforeCancel = (await call('GET', '/debts/summary', undefined, token)).data?.data;

  r = await call('POST', `/debts/${explainedId}/cancel`, { reason: 'They said keep it' }, token);
  ok('a record can be cancelled', r.status === 200, `-> ${r.status}`);
  ok('and its status says so', r.data?.data?.debt?.status === 'CANCELLED',
    String(r.data?.data?.debt?.status));

  r = await call('GET', `/debts/${explainedId}`, undefined, token);
  ok('the record is still there to read', r.status === 200, `-> ${r.status}`);
  ok('the reason was kept with it', String(r.data?.data?.debt?.note || '').includes('They said keep it'),
    JSON.stringify(r.data?.data?.debt?.note));
  ok('and it did not start the note with a blank line',
    !String(r.data?.data?.debt?.note || '').startsWith('\n'),
    JSON.stringify(r.data?.data?.debt?.note));

  const afterCancel = (await call('GET', '/debts/summary', undefined, token)).data?.data;
  ok('but it stops counting towards what is owed',
    afterCancel?.receivable === beforeCancel?.receivable - 10,
    `${beforeCancel?.receivable} -> ${afterCancel?.receivable}`);

  r = await call('POST', `/debts/${explainedId}/cancel`, {}, token);
  ok('cancelling twice is refused rather than silently repeated', r.status === 400, `-> ${r.status}`);

  // A settled debt is a finished story. Cancelling it would quietly rewrite
  // what was actually paid.
  r = await call('POST', '/debts', { kind: 'LENT', personName: 'Settled one', originalAmount: 50 }, token);
  const settledId = r.data?.data?.debt?._id;
  await call('POST', `/debts/${settledId}/settle`, {}, token);
  r = await call('POST', `/debts/${settledId}/cancel`, {}, token);
  ok('a settled record cannot be cancelled', r.status === 400, `-> ${r.status}`);

  r = await call('POST', `/debts/00000000-0000-4000-8000-000000000000/cancel`, {}, token);
  ok('cancelling a record that is not there is a 404', r.status === 404, `-> ${r.status}`);

  section('DELETING A RECORD');

  r = await call('DELETE', `/debts/${lentId}`, undefined, token);
  ok('a record can be deleted', r.status === 200, `-> ${r.status}`);
  r = await call('GET', `/debts/${lentId}`, undefined, token);
  ok('and is gone afterwards', r.status === 404, `-> ${r.status}`);
  r = await call('GET', `/debts/${lentId}/payments`, undefined, token);
  ok('its ledger went with it', r.status === 404, `-> ${r.status}`);

  section('ONE LEDGER PER PERSON');
  await call('POST', '/debts', { kind: 'LENT', contactId: borrowedContactId, originalAmount: 500 }, token);
  r = await call('GET', '/debts/people', undefined, token);
  const ali = r.data?.data?.items?.filter((person) => person.contactId === borrowedContactId) || [];
  ok('borrowed and lent records share one Ali ledger', r.status === 200 && ali.length === 1 && ali[0].recordCount === 2,
    JSON.stringify(ali));
  // The borrowed record was fully settled in EDITING, so only the new loan
  // to Ali remains outstanding. The settled history still appears above.
  ok('Ali net balance reflects both directions and ignores the settled balance', ali[0]?.netBalance === 500,
    String(ali[0]?.netBalance));
  r = await call('GET', `/debts/people/records?contactId=${borrowedContactId}`, undefined, token);
  ok('one person profile contains both transactions', r.status === 200 &&
    new Set(r.data?.data?.items?.map((item) => item.kind)).size === 2, `-> ${r.status}`);

  r = await call('POST', '/debts', { kind: 'LENT', personName: 'Ali', originalAmount: 7 }, token);
  const distinctAliId = r.data?.data?.debt?.contactId;
  ok('same-name new person is not silently merged', r.status === 201 && distinctAliId !== borrowedContactId);
  r = await call('GET', '/debts/people?search=Ali', undefined, token);
  ok('same-name contacts stay as distinct groups', r.status === 200 &&
    r.data?.data?.items?.filter((person) => person.name === 'Ali').length === 2);

  section('CLEAN UP');
  r = await call('DELETE', '/profile', { password: 'DebtPass123!' }, token);
  ok('the test account is removed', r.status === 200, `-> ${r.status}`);
  r = await call('DELETE', '/profile', { password: 'OtherPass123!' }, otherToken);
  ok('and so is the second one', r.status === 200, `-> ${r.status}`);

  report('UDHAAR');
})();
