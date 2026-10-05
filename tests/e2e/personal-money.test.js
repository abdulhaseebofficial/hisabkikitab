const { ok, section, call, report, requireApi } = require('./helpers');

(async () => {
  await requireApi();
  section('PERSONAL MONEY API PRECISION');
  const login = await call('POST', '/auth/login', { email: 'demo@hisabkikitab.app', password: 'demo1234' });
  const token = login.data?.data?.accessToken;
  ok('disposable demo account authenticates', login.status === 200 && !!token);
  const created = [];
  try {
    for (const amount of [0.1, 0.2]) {
      const response = await call('POST', '/expenses', { amount, category: 'Mess/Food', description: 'Exact API money' }, token);
      const saved = response.data?.data?.expense;
      ok(`expense ${amount} serializes exactly`, response.status === 201 && saved?.amount === amount
        && String(saved?.amountMinor) === String(amount * 100));
      if (saved?._id) created.push(saved._id);
    }
    const list = await call('GET', '/expenses?search=Exact%20API%20money', undefined, token);
    ok('API aggregate of 0.1 and 0.2 is 0.3', list.status === 200 && list.data?.data?.filteredTotal === 0.3);
    const invalid = await call('POST', '/expenses', { amount: 0.001, category: 'Mess/Food' }, token);
    ok('sub-minor precision is a client error', invalid.status === 400);
    const invalidGoal = await call('POST', '/goals', { title: 'Under DB minimum', targetAmount: 0.99 }, token);
    ok('goal below DB minimum is a client error', invalidGoal.status === 400);
  } finally {
    for (const id of created) await call('DELETE', `/expenses/${id}`, undefined, token);
  }
  report();
})().catch((error) => { console.error(error); process.exitCode = 1; });
