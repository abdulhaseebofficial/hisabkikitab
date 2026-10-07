/**
 * End-to-end API checks: every resource, the auth edges, and the
 * authorisation boundary between two students.
 *
 * Run with:  npm run qa
 */
const { ok, section, heading, call, report, requireApi, bailIfRateLimited, currentCookie } = require('./helpers');

(async () => {
  await requireApi();

  section('AUTH');
  let r = await call('POST', '/auth/login', { email: 'demo@hisabkikitab.app', password: 'demo1234' });
  bailIfRateLimited(r);
  ok('login with the demo account', r.status === 200 && !!r.data?.data?.accessToken, `-> ${r.status}`);
  let token = r.data?.data?.accessToken;
  const me = r.data?.data?.user;
  ok('login returns the user', !!me?.email, me?.email);

  r = await call('POST', '/auth/login', { email: 'demo@hisabkikitab.app', password: 'wrong-password' });
  ok('wrong password is rejected', r.status === 401, `-> ${r.status}`);

  r = await call('POST', '/auth/login', { email: 'not-an-email', password: 'x' });
  ok('malformed email is rejected', r.status === 400, `-> ${r.status}`);

  r = await call('GET', '/auth/me', undefined, token);
  ok('GET /auth/me with a token', r.status === 200, `-> ${r.status}`);

  r = await call('GET', '/auth/me');
  ok('GET /auth/me without a token is 401', r.status === 401, `-> ${r.status}`);

  r = await call('GET', '/auth/me', undefined, token + 'tampered');
  ok('a tampered token is rejected', r.status === 401, `-> ${r.status}`);

  section('SESSION ROTATION');
  // The refresh cookie is rotated on every use. The jar holds the newest one,
  // so the login cookie captured here is deliberately the superseded one.
  const staleCookie = currentCookie();
  r = await call('POST', '/auth/refresh');
  ok('refresh mints a new access token', r.status === 200 && !!r.data?.data?.accessToken, `-> ${r.status}`);
  const rotatedCookie = currentCookie();
  ok('and rotates the cookie', rotatedCookie !== staleCookie, 'cookie changed');

  // A superseded token presented while its replacement is still the live end of
  // the chain is the two-tabs case, not an attack: both tabs woke together and
  // both refreshed with the same cookie. Treating that as a stolen cookie is
  // what used to log people out for having two tabs open, so it is served.
  //
  // Once the chain has moved on, the same token is a replay again - and that is
  // what is asserted next. tests/e2e/refresh.test.js covers the race itself.
  r = await call('POST', '/auth/refresh', undefined, undefined, { cookie: staleCookie });
  ok('a superseded token is served while its replacement is still live',
    r.status === 200, `-> ${r.status}`);

  // Advance the chain: the rotated cookie is used, so the replacement the stale
  // token points at is itself rotated and no longer live.
  r = await call('POST', '/auth/refresh', undefined, undefined, { cookie: rotatedCookie });
  ok('the live session still refreshes normally', r.status === 200, `-> ${r.status}`);

  r = await call('POST', '/auth/refresh', undefined, undefined, { cookie: staleCookie });
  ok('but once the chain has moved on the same token is a replay',
    r.status === 401, `-> ${r.status}`);

  // And a replay revokes everything, including whatever was still live.
  r = await call('POST', '/auth/refresh', undefined, undefined, { cookie: rotatedCookie });
  ok('the replay revoked the live session too', r.status === 401, `-> ${r.status}`);

  // Sign back in so the rest of the suite has a working session.
  r = await call('POST', '/auth/login', { email: 'demo@hisabkikitab.app', password: 'demo1234' });
  ok('signing back in works', r.status === 200, `-> ${r.status}`);
  token = r.data?.data?.accessToken;

  section('DASHBOARD');

  // The breakdown assertion below needs spending in the current month, so this
  // suite creates it rather than assuming a previous run left some behind: the
  // account is emptied at the end, which made the second run of the day fail.
  r = await call('POST', '/expenses', {
    amount: 120, category: 'Mess/Food', description: 'QA dashboard seed',
    paymentMethod: 'Cash', date: new Date().toISOString(),
  }, token);
  const dashSeedId = r.data?.data?.expense?._id;
  ok('a dashboard figure exists to report on', r.status === 201 && !!dashSeedId, `-> ${r.status}`);

  r = await call('GET', '/dashboard/summary', undefined, token);
  const dash = r.data?.data;
  ok('dashboard summary loads', r.status === 200 && !!dash, `-> ${r.status}`);
  ok('has totals', !!dash?.totals && typeof dash.totals.spent === 'number', `spent=${dash?.totals?.spent}`);
  ok('has a category breakdown', Array.isArray(dash?.categoryBreakdown) && dash.categoryBreakdown.length > 0,
    `${dash?.categoryBreakdown?.length} categories`);
  ok('has a daily trend', Array.isArray(dash?.trend) && dash.trend.length > 0, `${dash?.trend?.length} days`);
  ok('remaining = income - spent', dash && Math.abs((dash.totals.income - dash.totals.spent) - dash.totals.remaining) < 0.01,
    `${dash?.totals?.income} - ${dash?.totals?.spent} = ${dash?.totals?.remaining}`);

  // Put the account back as it was found, so the counts the next section
  // asserts on are not shifted by this one.
  r = await call('DELETE', `/expenses/${dashSeedId}`, undefined, token);
  ok('the dashboard seed is cleaned up', r.status === 200, `-> ${r.status}`);

  section('EXPENSES — full CRUD');
  r = await call('GET', '/expenses?limit=5', undefined, token);
  ok('list expenses', r.status === 200 && Array.isArray(r.data?.data?.items), `${r.data?.data?.pagination?.total} total`);
  const firstPageIds = (r.data?.data?.items || []).map((e) => e._id);

  r = await call('POST', '/expenses', { amount: 250, category: 'Mess/Food', description: 'QA test lunch', paymentMethod: 'Cash', date: new Date().toISOString() }, token);
  ok('create an expense', r.status === 201, `-> ${r.status}`);
  const expenseId = r.data?.data?.expense?._id;

  r = await call('PUT', `/expenses/${expenseId}`, { amount: 275, description: 'QA test lunch (edited)' }, token);
  ok('update an expense', r.status === 200 && r.data?.data?.expense?.amount === 275, `amount=${r.data?.data?.expense?.amount}`);

  r = await call('POST', '/expenses', { amount: -50, category: 'Mess/Food' }, token);
  ok('a negative amount is rejected', r.status === 400, `-> ${r.status}`);

  r = await call('POST', '/expenses', { amount: 100 }, token);
  ok('a missing category is rejected', r.status === 400, `-> ${r.status}`);

  r = await call('GET', '/expenses?search=QA%20test&limit=10', undefined, token);
  ok('search finds it', r.status === 200 && r.data.data.items.some((e) => e._id === expenseId), `${r.data?.data?.items?.length} hits`);

  r = await call('GET', '/expenses?category=Mess%2FFood&limit=50', undefined, token);
  ok('category filter works', r.status === 200 && r.data.data.items.every((e) => e.category === 'Mess/Food'),
    `${r.data?.data?.items?.length} rows, all Mess/Food`);

  r = await call('GET', '/expenses?minAmount=100000&limit=5', undefined, token);
  ok('an impossible filter returns nothing', r.status === 200 && r.data.data.items.length === 0, `${r.data?.data?.items?.length} rows`);

  // Both pages in the same breath: creating a row between the two calls shifts
  // the window and makes an overlap look like a pagination bug.
  const pg1 = await call('GET', '/expenses?page=1&limit=5&sortBy=date&order=desc', undefined, token);
  const pg2 = await call('GET', '/expenses?page=2&limit=5&sortBy=date&order=desc', undefined, token);
  const idsA = (pg1.data?.data?.items || []).map((e) => e._id);
  const idsB = (pg2.data?.data?.items || []).map((e) => e._id);
  ok('page 2 does not repeat page 1', idsB.length > 0 && !idsB.some((id) => idsA.includes(id)),
    `${idsA.length} + ${idsB.length} rows, ${idsB.filter((id) => idsA.includes(id)).length} overlap`);

  section('INCOME');
  r = await call('GET', '/income', undefined, token);
  ok('list income', r.status === 200 && Array.isArray(r.data?.data?.items), `${r.data?.data?.items?.length} rows`);
  r = await call('POST', '/income', { amount: 5000, source: 'Pocket Money', note: 'QA test', date: new Date().toISOString() }, token);
  ok('add income', r.status === 201, `-> ${r.status}`);
  const incomeId = r.data?.data?.income?._id;

  section('GOALS');
  r = await call('POST', '/goals', { title: 'QA Goal', targetAmount: 10000, icon: '🎯' }, token);
  ok('create a goal', r.status === 201, `-> ${r.status}`);
  const goalId = r.data?.data?.goal?._id;
  r = await call('PATCH', `/goals/${goalId}/add`, { amount: 2500 }, token);
  ok('contribute to a goal', r.status === 200 && r.data?.data?.goal?.savedAmount === 2500, `saved=${r.data?.data?.goal?.savedAmount}`);
  r = await call('PATCH', `/goals/${goalId}/add`, { amount: -500 }, token);
  ok('withdraw from a goal', r.status === 200 && r.data?.data?.goal?.savedAmount === 2000, `saved=${r.data?.data?.goal?.savedAmount}`);
  r = await call('PATCH', `/goals/${goalId}/add`, { amount: 0 }, token);
  ok('a zero contribution is rejected', r.status === 400, `-> ${r.status}`);

  section('BUDGET');
  const now = new Date();
  r = await call('POST', '/budget', { category: 'Travel', limit: 3000, month: now.getMonth() + 1, year: now.getFullYear() }, token);
  ok('set a budget limit', r.status === 200 || r.status === 201, `-> ${r.status}`);
  r = await call('GET', `/budget?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, undefined, token);
  ok('list budgets', r.status === 200 && Array.isArray(r.data?.data?.items), `${r.data?.data?.items?.length} rows`);
  ok('budget totals present', typeof r.data?.data?.totals?.limit === 'number', `limit=${r.data?.data?.totals?.limit}`);

  // budgetProgress joins the limits a student set with what they actually
  // spent. analytics reads those limits through its own query now rather than
  // through the budgets service, so pin the shape and the arithmetic: a wrong
  // join here would still return 200 with plausible-looking numbers.
  const progressRow = (r.data?.data?.items || [])[0];
  ok('a budget row carries limit, spent and remaining',
    progressRow && ['_id', 'category', 'limit', 'spent', 'remaining', 'usedPercent', 'status', 'month', 'year']
      .every((k) => k in progressRow),
    progressRow ? Object.keys(progressRow).join(', ') : 'no rows');
  ok('remaining is limit minus spent',
    progressRow && Math.abs((progressRow.limit - progressRow.spent) - progressRow.remaining) < 0.01,
    progressRow ? `${progressRow.limit} - ${progressRow.spent} = ${progressRow.remaining}` : '-');
  ok('usedPercent matches spent against limit',
    progressRow && (progressRow.limit === 0
      ? progressRow.usedPercent === 0
      : Math.abs(progressRow.usedPercent - Math.round((progressRow.spent / progressRow.limit) * 100)) <= 1),
    progressRow ? `${progressRow.usedPercent}%` : '-');
  ok('status is one of the four traffic lights',
    progressRow && ['none', 'safe', 'warning', 'over'].includes(progressRow.status),
    progressRow?.status);
  ok('the row is for the month asked for',
    progressRow && progressRow.month === r.data.data.month && progressRow.year === r.data.data.year,
    progressRow ? `${progressRow.month}/${progressRow.year}` : '-');

  // The same figures reach the dashboard and the AI snapshot through
  // buildSnapshot, so they must agree with what /budget just returned.
  const snapshot = await call('GET', '/dashboard/summary', undefined, token);
  const dashBudget = (snapshot.data?.data?.budgets || []).find((b) => b.category === progressRow?.category);
  ok('the dashboard sees the same budget figures',
    dashBudget && Math.abs(dashBudget.limit - progressRow.limit) < 0.01
      && Math.abs(dashBudget.spent - progressRow.spent) < 0.01,
    dashBudget ? `${dashBudget.category}: ${dashBudget.limit}/${dashBudget.spent}` : 'not found');
  r = await call('POST', '/budget', { category: 'Travel', limit: -100 }, token);
  ok('a negative limit is rejected', r.status === 400, `-> ${r.status}`);

  section('REPORTS');
  r = await call('GET', `/reports/monthly?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, undefined, token);
  ok('monthly report', r.status === 200 && !!r.data?.data?.totals, `-> ${r.status}`);
  ok('report has a comparison', !!r.data?.data?.comparison, `vs ${r.data?.data?.comparison?.previousLabel}`);
  r = await call('GET', `/reports/export?format=csv&month=${now.getMonth() + 1}&year=${now.getFullYear()}`, undefined, token);
  ok('CSV export', r.status === 200 && r.data.byteLength > 50, `${r.data.byteLength} bytes`);
  r = await call('GET', `/reports/export?format=pdf&month=${now.getMonth() + 1}&year=${now.getFullYear()}`, undefined, token);
  const pdfHead = r.data.byteLength ? Buffer.from(r.data.slice(0, 5)).toString() : '';
  ok('PDF export is a real PDF', r.status === 200 && pdfHead.startsWith('%PDF'), `${r.data.byteLength} bytes, starts "${pdfHead}"`);

  section('AI ADVISOR (no API key — fallback must answer)');
  r = await call('GET', '/ai/status', undefined, token);
  ok('advisor status', r.status === 200, `configured=${r.data?.data?.configured}`);
  r = await call('GET', '/ai/tip', undefined, token);
  ok('tip of the day', r.status === 200 && !!r.data?.data?.tip, `${String(r.data?.data?.tip?.message || '').slice(0, 45)}...`);
  r = await call('POST', '/ai/advice', { tipCount: 4 }, token);
  ok('advice', r.status === 200 && Array.isArray(r.data?.data?.tips) && r.data.data.tips.length > 0,
    `${(r.data?.data?.tips || []).length} tips`);

  // This endpoint reached for a method that stopped existing when the data
  // layer moved to Postgres, and nothing noticed because nothing asked.
  r = await call('POST', '/ai/suggest-budget', {}, token);
  ok('suggest a budget', r.status === 200, `-> ${r.status}`);
  ok('the plan covers categories', Array.isArray(r.data?.data?.categories),
    `${(r.data?.data?.categories || []).length} rows`);
  ok('the plan reports what it allocated', typeof r.data?.data?.allocated === 'number',
    `allocated=${r.data?.data?.allocated}`);

  r = await call('GET', '/ai/weekly-summary', undefined, token);
  ok('weekly summary', r.status === 200 && !!r.data?.data?.summary, `-> ${r.status}`);

  r = await call('GET', '/ai/chat/history', undefined, token);
  ok('chat history loads', r.status === 200 && Array.isArray(r.data?.data?.messages),
    `${(r.data?.data?.messages || []).length} messages`);

  section('NOTIFICATIONS');
  r = await call('GET', '/notifications', undefined, token);
  ok('list notifications', r.status === 200 && Array.isArray(r.data?.data?.items), `${r.data?.data?.items?.length} items, ${r.data?.data?.unreadCount} unread`);

  // Running the alert rules on demand. This answered 200 for two commits while
  // one of its four checks threw on every call, because Promise.allSettled
  // turns a rejection into a logged warning - so assert what came back, not
  // just the status.
  r = await call('POST', '/notifications/check', undefined, token);
  ok('the alert rules run', r.status === 200, `-> ${r.status}`);
  ok('and report what they created', typeof r.data?.data?.created === 'number' && Array.isArray(r.data?.data?.items),
    `created=${r.data?.data?.created}`);

  // Re-running must not duplicate: every alert carries a dedupe key.
  const firstRun = await call('POST', '/notifications/check', undefined, token);
  const secondRun = await call('POST', '/notifications/check', undefined, token);
  ok('re-running the checks creates nothing new', secondRun.data?.data?.created === 0,
    `first=${firstRun.data?.data?.created}, second=${secondRun.data?.data?.created}`);

  // The list query is deliberately lenient - these all worked before the
  // validator was added and must keep working.
  for (const q of ['limit=abc', 'limit=999999', 'limit=5', 'unread=true', 'unread=maybe', 'unread=false']) {
    r = await call('GET', `/notifications?${q}`, undefined, token);
    ok(`?${q} is accepted`, r.status === 200, `-> ${r.status}`);
  }
  // A negative limit reached Postgres as `LIMIT -5` and came back a 500.
  r = await call('GET', '/notifications?limit=-5', undefined, token);
  ok('a negative limit is handled, not a 500', r.status === 200, `-> ${r.status}`);

  r = await call('GET', '/notifications?limit=3', undefined, token);
  ok('limit is honoured', (r.data?.data?.items?.length || 0) <= 3, `${r.data?.data?.items?.length} items`);

  // Malformed ids are refused the way every other module refuses them.
  for (const [method, path] of [['PATCH', '/notifications/not-a-uuid/read'], ['DELETE', '/notifications/not-a-uuid']]) {
    r = await call(method, path, undefined, token);
    ok(`${method} with a malformed id is a 400`, r.status === 400, `-> ${r.status}`);
    ok('and says which field', r.data?.errors?.[0]?.field === 'id', r.data?.errors?.[0]?.message);
  }

  // A well-formed id for something that is not there is a 404, not a 400.
  r = await call('PATCH', '/notifications/00000000-0000-0000-0000-000000000000/read', undefined, token);
  ok('a well-formed unknown id is a 404', r.status === 404, `-> ${r.status}`);

  // Every notification route needs a session.
  for (const [method, path] of [['GET', '/notifications'], ['POST', '/notifications/check'],
    ['PATCH', '/notifications/read-all'], ['DELETE', '/notifications']]) {
    r = await call(method, path);
    ok(`${method} ${path} needs a token`, r.status === 401, `-> ${r.status}`);
  }

  r = await call('PATCH', '/notifications/read-all', undefined, token);
  ok('mark all read', r.status === 200, `-> ${r.status}`);
  r = await call('GET', '/notifications', undefined, token);
  ok('and the unread count is now zero', r.data?.data?.unreadCount === 0, `${r.data?.data?.unreadCount} unread`);

  section('EVENTS - a write announces, notifications reacts');

  // A fresh account, so nothing else has already raised these alerts.
  const evEmail = `events-${Date.now()}@example.com`;
  r = await call('POST', '/auth/register', { acceptTerms: true,
    name: 'Events Student', email: evEmail,
    password: 'EventsPass123!', confirmPassword: 'EventsPass123!',
  });
  const evToken = r.data?.data?.accessToken;
  ok('a fresh account for the event checks', r.status === 201, `-> ${r.status}`);

  r = await call('GET', '/notifications', undefined, evToken);
  ok('it starts with an empty tray', (r.data?.data?.items?.length || 0) === 0,
    `${r.data?.data?.items?.length} items`);

  // A small limit, then an expense that blows straight through it. Nothing
  // here mentions notifications - the expense write announces, and the alert
  // rules are what decide that means something.
  r = await call('POST', '/budget', { category: 'Travel', limit: 100 }, evToken);
  ok('a small budget is set', r.status === 201, `-> ${r.status}`);

  r = await call('POST', '/expenses', { amount: 500, category: 'Travel', description: 'Overspend trigger' }, evToken);
  ok('the expense is written', r.status === 201, `-> ${r.status}`);
  const evExpenseId = r.data?.data?.expense?._id;

  // The announcement is fire and forget, so give the listener a moment.
  await new Promise((resolve) => setTimeout(resolve, 1200));

  r = await call('GET', '/notifications', undefined, evToken);
  const overspend = (r.data?.data?.items || []).filter((n) => n.type === 'overspend');
  ok('writing the expense raised an overspend alert', overspend.length >= 1,
    `${overspend.length} overspend alert(s)`);
  // The alert names the category the way a person reads it - "Transport" -
  // not the way it is stored - "Travel". Both are asserted: the label has to
  // be there, and the stored id must not be.
  ok('and it names the category that went over, as a label',
    overspend.some((n) => `${n.title} ${n.message}`.includes('Transport')),
    overspend[0]?.title);
  ok('without putting the stored id on screen',
    overspend.every((n) => !`${n.title} ${n.message}`.includes('Travel')),
    overspend[0]?.title);

  // Writing again must not raise the same alert twice - that is what the
  // dedupe key on each notification is for.
  const beforeSecond = (r.data?.data?.items || []).length;
  r = await call('POST', '/expenses', { amount: 300, category: 'Travel', description: 'Second overspend' }, evToken);
  ok('a second expense is written', r.status === 201, `-> ${r.status}`);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  r = await call('GET', '/notifications', undefined, evToken);
  const afterSecond = (r.data?.data?.items || []).filter((n) => n.type === 'overspend').length;
  ok('the same overspend is not raised twice', afterSecond === overspend.length,
    `${overspend.length} -> ${afterSecond}`);

  // A write that fails must announce nothing.
  const trayBefore = (r.data?.data?.items || []).length;
  r = await call('POST', '/expenses', { amount: -50, category: 'Travel' }, evToken);
  ok('an invalid expense is refused', r.status === 400, `-> ${r.status}`);
  await new Promise((resolve) => setTimeout(resolve, 800));
  r = await call('GET', '/notifications', undefined, evToken);
  ok('and a refused write announces nothing', (r.data?.data?.items?.length || 0) === trayBefore,
    `${trayBefore} -> ${r.data?.data?.items?.length}`);

  // Reaching a goal is announced too, and awaited - so the notification is
  // already in the tray by the time the response says the goal was reached.
  r = await call('POST', '/goals', { title: 'Event Goal', targetAmount: 200 }, evToken);
  const evGoalId = r.data?.data?.goal?._id;
  ok('a goal is created', r.status === 201, `-> ${r.status}`);

  r = await call('PATCH', `/goals/${evGoalId}/add`, { amount: 200 }, evToken);
  ok('funding it reports the goal reached', r.data?.data?.justCompleted === true, `-> ${r.status}`);

  r = await call('GET', '/notifications', undefined, evToken);
  const reached = (r.data?.data?.items || []).filter((n) => n.type === 'goal_completed');
  ok('and the celebration is already in the tray', reached.length === 1,
    `${reached.length} goal_completed`);
  ok('naming the goal', reached[0]?.title?.includes('Event Goal'), reached[0]?.title);

  // Taking money out and putting it back must not celebrate a second time.
  await call('PATCH', `/goals/${evGoalId}/add`, { amount: -50 }, evToken);
  await call('PATCH', `/goals/${evGoalId}/add`, { amount: 50 }, evToken);
  r = await call('GET', '/notifications', undefined, evToken);
  ok('re-reaching the same goal does not celebrate twice',
    (r.data?.data?.items || []).filter((n) => n.type === 'goal_completed').length === 1);

  // The expense itself still behaves exactly as before.
  r = await call('GET', `/expenses/${evExpenseId}`, undefined, evToken);
  ok('the expense that triggered all this is intact',
    r.status === 200 && r.data?.data?.expense?.amount === 500, `-> ${r.status}`);

  await call('DELETE', '/profile', { password: 'EventsPass123!' }, evToken);

  section('FEEDBACK');
  r = await call('POST', '/feedback', { type: 'Bug', rating: 4, message: 'QA automated check of the feedback route.', page: '/dashboard' }, token);
  ok('submit feedback', r.status === 201, `-> ${r.status}`);
  r = await call('POST', '/feedback', { message: 'hi' }, token);
  ok('a too-short message is rejected', r.status === 400, `-> ${r.status}`);
  r = await call('GET', '/feedback/mine', undefined, token);
  ok('my feedback lists', r.status === 200 && r.data.data.items.length > 0, `${r.data?.data?.items?.length} items`);

  section('COVERAGE - income, feedback, reports, dashboard');

  // A private account, so these assertions are about what this student did and
  // not about whatever the demo data happens to contain.
  const covEmail = `coverage-${Date.now()}@example.com`;
  r = await call('POST', '/auth/register', { acceptTerms: true,
    name: 'Coverage Student', email: covEmail,
    password: 'CoverPass123!', confirmPassword: 'CoverPass123!',
  });
  const covToken = r.data?.data?.accessToken;
  ok('a private account for the coverage checks', r.status === 201, `-> ${r.status}`);

  /* ------------------------------ income ---------------------------- */

  r = await call('POST', '/income', { amount: 20000, source: 'Pocket Money', note: 'September' }, covToken);
  ok('income is logged', r.status === 201, `-> ${r.status}`);
  const covIncomeId = r.data?.data?.income?._id;

  r = await call('POST', '/income', { amount: 5000, source: 'Part-time Job' }, covToken);
  ok('a second source is logged', r.status === 201, `-> ${r.status}`);

  r = await call('GET', '/income/summary', undefined, covToken);
  ok('the summary totals every source', r.data?.data?.total === 25000, `total=${r.data?.data?.total}`);
  ok('and breaks it down by source', (r.data?.data?.bySource || []).length === 2,
    (r.data?.data?.bySource || []).map((x) => x.source).join(', '));
  ok('reporting planned income separately from what arrived',
    typeof r.data?.data?.plannedIncome === 'number', `planned=${r.data?.data?.plannedIncome}`);

  r = await call('POST', '/income', { amount: 100, source: 'Not A Real Source' }, covToken);
  ok('an unknown income source is refused', r.status === 400, `-> ${r.status}`);
  r = await call('POST', '/income', { amount: 0 }, covToken);
  ok('a zero amount is refused', r.status === 400, `-> ${r.status}`);

  r = await call('PUT', `/income/${covIncomeId}`, { amount: 21000 }, covToken);
  ok('income can be corrected', r.data?.data?.income?.amount === 21000, `-> ${r.status}`);
  r = await call('PUT', '/income/00000000-0000-0000-0000-000000000000', { amount: 1 }, covToken);
  ok('editing income that is not there is a 404', r.status === 404, `-> ${r.status}`);
  r = await call('DELETE', `/income/${covIncomeId}`, undefined, covToken);
  ok('income can be deleted', r.status === 200, `-> ${r.status}`);
  r = await call('DELETE', `/income/${covIncomeId}`, undefined, covToken);
  ok('deleting it twice is a 404, not a second success', r.status === 404, `-> ${r.status}`);

  /* ----------------------------- feedback --------------------------- */

  r = await call('GET', '/feedback/meta', undefined, covToken);
  ok('feedback meta lists the types', (r.data?.data?.types || []).length > 0,
    (r.data?.data?.types || []).join(', '));
  ok('and how to reach the developer', !!r.data?.data?.developer?.email);

  r = await call('POST', '/feedback',
    { type: 'Bug', rating: 3, message: 'A coverage note about the app.', page: '/settings' }, covToken);
  ok('feedback is stored even with no SMTP configured', r.status === 201, `-> ${r.status}`);
  ok('and records that it was not emailed', r.data?.data?.feedback?.emailed === false,
    `emailed=${r.data?.data?.feedback?.emailed}`);

  // The rule is 5-2000, so this is one character under it.
  r = await call('POST', '/feedback', { type: 'Bug', message: 'four' }, covToken);
  ok('a too-short message is refused', r.status === 400, `-> ${r.status}`);
  r = await call('POST', '/feedback',
    { type: 'Nonsense', message: 'A long enough message to pass the length rule.' }, covToken);
  ok('an unknown feedback type is refused', r.status === 400, `-> ${r.status}`);
  r = await call('POST', '/feedback',
    { rating: 9, message: 'A long enough message to pass the length rule.' }, covToken);
  ok('a rating outside 1-5 is refused', r.status === 400, `-> ${r.status}`);

  r = await call('GET', '/feedback/mine', undefined, covToken);
  ok('a student sees only their own feedback', (r.data?.data?.items || []).length === 1,
    `${(r.data?.data?.items || []).length} items`);

  /* ------------------------------ reports --------------------------- */

  await call('POST', '/expenses',
    { amount: 400, category: 'Mess/Food', description: 'Coverage lunch' }, covToken);
  await call('POST', '/expenses',
    { amount: 150, category: 'Travel', description: 'Coverage rickshaw' }, covToken);

  r = await call('GET', '/reports/monthly', undefined, covToken);
  ok('the monthly report loads', r.status === 200, `-> ${r.status}`);
  ok('totals add up to what was spent', r.data?.data?.totals?.spent === 550,
    `spent=${r.data?.data?.totals?.spent}`);
  ok('the biggest category is the biggest one',
    r.data?.data?.highestCategory?.category === 'Mess/Food', r.data?.data?.highestCategory?.category);
  ok('the biggest single expense is named', r.data?.data?.biggestExpense?.amount === 400,
    `${r.data?.data?.biggestExpense?.amount}`);
  ok('last month is there to compare against',
    typeof r.data?.data?.comparison?.previousSpent === 'number', r.data?.data?.comparison?.previousLabel);
  ok('the transaction count matches', r.data?.data?.totals?.transactionCount === 2,
    `${r.data?.data?.totals?.transactionCount}`);

  // A CSV is not JSON, so the helper hands it back as raw bytes.
  r = await call('GET', '/reports/export?format=csv', undefined, covToken);
  const csv = Buffer.from(r.data || []).toString('utf8');
  ok('the CSV export names the student', csv.includes('Coverage Student'), `${csv.length} bytes`);
  ok('and lists the transactions', csv.includes('Coverage lunch'));
  ok('with the amounts beside them', csv.includes('400') && csv.includes('150'));

  r = await call('GET', '/reports/monthly?month=99&year=2026', undefined, covToken);
  ok('an impossible month is refused', r.status === 400, `-> ${r.status}`);

  /* ----------------------------- dashboard -------------------------- */

  r = await call('GET', '/dashboard/summary', undefined, covToken);
  ok('the dashboard loads', r.status === 200, `-> ${r.status}`);
  ok('spend matches the report', r.data?.data?.totals?.spent === 550, `${r.data?.data?.totals?.spent}`);
  ok('income comes from what was actually logged', r.data?.data?.totals?.income === 5000,
    `income=${r.data?.data?.totals?.income}`);
  ok('remaining is income minus spend',
    Math.abs(r.data?.data?.totals?.remaining - (5000 - 550)) < 0.01,
    `${r.data?.data?.totals?.remaining}`);
  ok('the trend covers the whole month with no gaps',
    Array.isArray(r.data?.data?.trend) && r.data.data.trend.length >= 28,
    `${r.data?.data?.trend?.length} days`);
  ok('every category spent on is in the breakdown',
    (r.data?.data?.categoryBreakdown || []).length === 2,
    (r.data?.data?.categoryBreakdown || []).map((c) => c.category).join(', '));
  ok('recent expenses are listed', (r.data?.data?.recentExpenses || []).length === 2);
  ok('and it says whether the AI is configured',
    typeof r.data?.data?.aiConfigured === 'boolean', `${r.data?.data?.aiConfigured}`);

  await call('DELETE', '/profile', { password: 'CoverPass123!' }, covToken);

  section('PROFILE & SETTINGS');
  r = await call('GET', '/profile/categories', undefined, token);
  ok('list categories', r.status === 200, `${(r.data?.data?.all || []).length} total`);
  r = await call('POST', '/profile/categories', { name: 'QA Category' }, token);
  ok('add a custom category', r.status === 200 || r.status === 201, `-> ${r.status}`);
  r = await call('DELETE', '/profile/categories/QA%20Category', undefined, token);
  ok('remove a custom category', r.status === 200, `-> ${r.status}`);
  r = await call('PUT', '/profile', { name: me?.name, monthlyIncome: 28000 }, token);
  ok('update the profile', r.status === 200, `-> ${r.status}`);
  r = await call('GET', '/profile/export', undefined, token);
  ok('export all data', r.status === 200, `-> ${r.status}`);

  section('GOOGLE SIGN-IN');

  /*
   * The signature check belongs to Google and cannot be exercised without a
   * token Google signed. What is checked here is everything around it: that the
   * feature announces itself honestly, that a forged or malformed token gets
   * nowhere, and that failure says nothing useful to whoever is probing.
   */
  r = await call('GET', '/auth/config');
  ok('the sign-in screen can ask what is available', r.status === 200, `-> ${r.status}`);
  const googleConfig = r.data?.data?.google;
  ok('and the answer says whether Google sign-in is on', typeof googleConfig?.enabled === 'boolean',
    JSON.stringify(googleConfig));
  ok('the config endpoint leaks no secret',
    Object.keys(r.data?.data || {}).sort().join(',') === 'google,passwordReset' &&
      Object.keys(googleConfig || {}).sort().join(',') ===
        (googleConfig?.enabled ? 'clientId,enabled' : 'enabled') &&
      Object.keys(r.data?.data?.passwordReset || {}).join(',') === 'enabled' &&
      typeof r.data.data.passwordReset.enabled === 'boolean' &&
      (!googleConfig?.enabled || /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleConfig.clientId)),
    'only documented public capability fields');

  for (const [label, body] of [
    ['no token at all', {}],
    ['an empty token', { idToken: '' }],
    ['a token that is not a string', { idToken: 12345 }],
    ['a one-character token', { idToken: 'x' }],
  ]) {
    r = await call('POST', '/auth/google', body);
    ok(`google sign-in with ${label} is refused`, r.status === 400, `-> ${r.status}`);
  }

  r = await call('POST', '/auth/google', {
    idToken: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIiwiZW1haWwiOiJhQGIuY28ifQ.',
  });
  ok('a forged alg=none Google token is refused',
    r.status === 401 || r.status === 400, `-> ${r.status}`);
  ok('and the refusal does not name the claim that failed',
    !/issuer|audience|signature|verified/i.test(r.text), r.data?.message || '');

  r = await call('POST', '/auth/google', { idToken: 'a'.repeat(9000) });
  ok('an oversized token is refused', r.status === 400 || r.status === 413, `-> ${r.status}`);


  section('SIGN-UP RULES - the server is the one that decides');

  /*
   * The sign-up form applies the same rules from @hisabkikitab/contracts, but a
   * form is a convenience. These go straight at the API with the form bypassed,
   * which is what an attacker - or a stale browser tab - would do.
   */
  // Anything that actually gets created is remembered and removed at the end
  // of the section, so a suite about validation does not leave a trail of
  // accounts behind it.
  const created = [];
  const signup = async (overrides) => {
    const password = overrides.password === undefined ? 'TestPass123!' : overrides.password;
    const response = await call('POST', '/auth/register', {
      acceptTerms: true,
      name: 'Valid Name',
      email: `rules-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password,
      confirmPassword: password,
      ...overrides,
    });
    const issued = response.data?.data?.accessToken;
    if (issued) created.push({ token: issued, password });
    return response;
  };

  for (const [label, name] of [
    ['digits', 'Ali123'],
    ['an email address', 'ali@example.com'],
    ['script content', '<script>alert(1)</script>'],
    ['only spaces', '   '],
    ['an emoji', 'Ali \u{1F600}'],
    ['an underscore', 'Ali_Khan'],
  ]) {
    r = await signup({ name });
    ok(`a name with ${label} is refused`, r.status === 400, `-> ${r.status}`);
  }

  for (const [label, name] of [
    ['a plain name', 'Ali'],
    ['spaces', 'Abdul Haseeb'],
    ['a hyphen', 'Anne-Marie'],
    ['an apostrophe', "O'Brien"],
    ['non-Latin script', 'محمد علی'],
    ['an accent', 'José'],
  ]) {
    r = await signup({ name });
    ok(`a name with ${label} is accepted`, r.status === 201, `-> ${r.status}`);
  }

  r = await signup({ name: '  Abdul   Haseeb  ' });
  ok('a name is trimmed and its spaces collapsed', r.data?.data?.user?.name === 'Abdul Haseeb',
    JSON.stringify(r.data?.data?.user?.name));

  for (const [label, email] of [
    ['two @ signs', 'a@@b.com'], ['no local part', '@b.com'], ['no domain', 'a@'],
    ['no dot in the domain', 'a@b'], ['a space inside', 'a b@c.com'], ['nothing at all', ''],
  ]) {
    r = await signup({ email });
    ok(`an email with ${label} is refused`, r.status === 400, `-> ${r.status}`);
  }

  const dotted = `first.last+tag-${Date.now()}@example.com`;
  r = await signup({ email: `  ${dotted}  ` });
  ok('an email is trimmed but not otherwise rewritten', r.data?.data?.user?.email === dotted,
    r.data?.data?.user?.email);

  for (const [label, password] of [
    ['no uppercase', 'hostel1!'], ['no lowercase', 'HOSTEL1!'], ['no number', 'HostelAa!'],
    ['no special character', 'Hostel123'], ['under 8 characters', 'Ho1!'],
    ['a leading space', ' Hostel1!'], ['a trailing space', 'Hostel1! '],
  ]) {
    r = await signup({ password, confirmPassword: password });
    ok(`a password with ${label} is refused`, r.status === 400, `-> ${r.status}`);
  }

  r = await signup({ password: 'Hostel1!', confirmPassword: 'Hostel2!' });
  ok('a mismatched confirmation is refused', r.status === 400, `-> ${r.status}`);

  r = await signup({ acceptTerms: false });
  ok('signing up without accepting the terms is refused', r.status === 400, `-> ${r.status}`);
  r = await signup({ acceptTerms: undefined });
  ok('and so is leaving the terms out entirely', r.status === 400, `-> ${r.status}`);

  r = await signup({ password: 'Hostel1!', confirmPassword: 'Hostel1!' });
  ok('a password meeting every rule is accepted', r.status === 201, `-> ${r.status}`);
  ok('and the response never contains the password',
    !JSON.stringify(r.data || {}).toLowerCase().includes('hostel1!'), 'not echoed back');

  r = await call('PUT', '/profile', { name: 'Bad1' }, token);
  ok('the same name rule applies to editing a profile', r.status === 400, `-> ${r.status}`);

  let removed = 0;
  for (const account of created) {
    const gone = await call('DELETE', '/profile', { password: account.password }, account.token);
    if (gone.status === 200) removed += 1;
  }
  ok('every account these checks created is removed again', removed === created.length,
    `${removed} of ${created.length}`);

  section('AUTHORISATION — one student must not see another\'s data');
  const other = `qa${Date.now()}@example.com`;
  r = await call('POST', '/auth/register', { acceptTerms: true, name: 'QA Second', email: other, password: 'TestPass123!', confirmPassword: 'TestPass123!' }, undefined);
  ok('register a second account', r.status === 201, `-> ${r.status}`);
  const token2 = r.data?.data?.accessToken;
  r = await call('POST', '/auth/register', { acceptTerms: true, name: 'Dup', email: other, password: 'TestPass123!', confirmPassword: 'TestPass123!' });
  ok('a duplicate email is rejected', r.status === 400 || r.status === 409, `-> ${r.status}`);
  r = await call('POST', '/auth/register', { acceptTerms: true, name: 'Weak', email: `w${Date.now()}@example.com`, password: 'short', confirmPassword: 'short' });
  ok('a weak password is rejected', r.status === 400, `-> ${r.status}`);

  r = await call('GET', `/expenses/${expenseId}`, undefined, token2);
  ok("cannot read another student's expense", r.status === 404 || r.status === 403, `-> ${r.status}`);
  r = await call('PUT', `/expenses/${expenseId}`, { amount: 1 }, token2);
  ok("cannot edit another student's expense", r.status === 404 || r.status === 403, `-> ${r.status}`);
  r = await call('DELETE', `/goals/${goalId}`, undefined, token2);
  ok("cannot delete another student's goal", r.status === 404 || r.status === 403, `-> ${r.status}`);
  r = await call('GET', '/expenses', undefined, token2);
  ok('a new account starts empty', r.status === 200 && r.data.data.items.length === 0, `${r.data?.data?.items?.length} rows`);

  section('CLEANUP');
  r = await call('DELETE', `/expenses/${expenseId}`, undefined, token);
  ok('delete the test expense', r.status === 200, `-> ${r.status}`);
  r = await call('DELETE', `/income/${incomeId}`, undefined, token);
  ok('delete the test income', r.status === 200, `-> ${r.status}`);
  r = await call('DELETE', `/goals/${goalId}`, undefined, token);
  ok('delete the test goal', r.status === 200, `-> ${r.status}`);

  section('TICKING A RECURRING BILL OFF');
  {
    const billEmail = `bill${Date.now()}@example.com`;
    let b = await call('POST', '/auth/register', {
      acceptTerms: true, name: 'Bill QA', email: billEmail,
      password: 'TestPass123!', confirmPassword: 'TestPass123!',
    });
    const billToken = b.data?.data?.accessToken;
    await call('PUT', '/profile', { financeMode: 'householder', monthlyIncome: 90000 }, billToken);

    b = await call('POST', '/expenses', {
      amount: 8000, category: 'electricity_bill', description: 'Bijli bill',
      date: new Date().toISOString(), isRecurring: true, recurringFrequency: 'monthly',
    }, billToken);
    const theBill = b.data?.data?.expense;
    ok('a recurring household bill is created', b.status === 201, `-> ${b.status}`);

    const before = await call('GET', '/dashboard/summary', undefined, billToken);
    const spentBefore = before.data?.data?.totals?.spent;
    ok('and it shows up as an upcoming bill',
      (before.data?.data?.upcomingBills || []).some((x) => x._id === theBill._id),
      `${(before.data?.data?.upcomingBills || []).length} upcoming`);

    b = await call('POST', `/expenses/${theBill._id}/mark-paid`, {}, billToken);
    ok('it can be marked paid', b.status === 201, `-> ${b.status}`);
    ok('which records the spend', b.data?.data?.expense?.amount === 8000,
      String(b.data?.data?.expense?.amount));
    ok('and moves the due date on rather than leaving it due',
      new Date(b.data?.data?.nextDueAt) > new Date(theBill.nextRunAt),
      `${String(theBill.nextRunAt).slice(0, 10)} -> ${String(b.data?.data?.nextDueAt).slice(0, 10)}`);

    const after = await call('GET', '/dashboard/summary', undefined, billToken);
    ok('the month is 8000 heavier afterwards',
      after.data?.data?.totals?.spent === spentBefore + 8000,
      `${spentBefore} -> ${after.data?.data?.totals?.spent}`);
    ok('and the bill is no longer listed as due',
      !(after.data?.data?.upcomingBills || []).some((x) => x._id === theBill._id),
      'gone from upcoming');

    // A plain expense is not a bill, and saying so is better than silently
    // doing nothing.
    b = await call('POST', '/expenses', { amount: 50, category: 'groceries', date: new Date().toISOString() }, billToken);
    const plain = b.data?.data?.expense;
    b = await call('POST', `/expenses/${plain._id}/mark-paid`, {}, billToken);
    ok('a non-recurring expense cannot be marked paid', b.status === 400, `-> ${b.status}`);

    // The bill belongs to the household. The student side must not reach it.
    await call('PUT', '/profile', { financeMode: 'student' }, billToken);
    b = await call('POST', `/expenses/${theBill._id}/mark-paid`, {}, billToken);
    ok('and a household bill cannot be ticked off from student mode',
      b.status === 404, `-> ${b.status}`);

    await call('PUT', '/profile', { financeMode: 'householder' }, billToken);
    b = await call('DELETE', '/profile', { password: 'TestPass123!' }, billToken);
    ok('the bill test account is removed', b.status === 200, `-> ${b.status}`);
  }

  report();
})().catch((e) => {
  console.error('\nThe suite crashed:', e.message);
  process.exit(1);
});
