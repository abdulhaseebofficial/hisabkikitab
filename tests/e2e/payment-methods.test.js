/**
 * The payment method a person picks has to survive the round trip.
 *
 * This suite exists because of a regression that every other suite missed. The
 * shared contract merges the business namespace over the vocabulary, business
 * redefined `PAYMENT_METHODS` as `{ id, label }` objects, and the personal list
 * of strings disappeared. `isIn(PAYMENT_METHODS)` then compared the string a
 * person had chosen against a list of objects, never matched, and the API
 * answered 400 "Unknown payment method" to every attempt to record spending.
 *
 * Nothing caught it: the database suites write through the repository and skip
 * service validation, and the one API money suite never sent a payment method
 * at all. So this suite sends every advertised method, over the real HTTP API,
 * in both personal modes - and checks that the business rails are *not*
 * accepted here, because that confusion is what broke it.
 */

const { ok, section, call, report, requireApi } = require('./helpers');
const { PAYMENT_METHODS, BUSINESS_PAYMENT_METHODS } = require('../../packages/contracts');

const PASSWORD = 'TestPass123!';

/** The first default category of whichever mode the account is in. */
const firstCategory = async (token) => {
  const response = await call('GET', '/profile/categories', undefined, token);
  return { status: response.status, category: response.data?.data?.defaults?.[0] };
};

const createExpense = (token, body) => call('POST', '/expenses', body, token);

(async () => {
  await requireApi();

  const email = `payment-methods-${Date.now()}@example.test`;
  const registration = await call('POST', '/auth/register', {
    acceptTerms: true, name: 'Payment Methods', email, password: PASSWORD, confirmPassword: PASSWORD,
  });
  const token = registration.data?.data?.accessToken;

  section('SETUP');
  ok('disposable normal account authenticates', registration.status === 201 && !!token);
  const onboarding = await call('POST', '/profile/onboarding', {
    financeMode: 'student', language: 'en', monthlyIncome: 0, currency: 'PKR',
  }, token);
  ok('account onboards into Individual / Student mode', onboarding.status === 200,
    `-> ${onboarding.status}`);

  const created = [];

  try {
    section('EVERY ADVERTISED PAYMENT METHOD IS ACCEPTED (STUDENT)');
    const student = await firstCategory(token);
    ok('student default categories are served', student.status === 200 && !!student.category,
      String(student.category));

    for (const method of PAYMENT_METHODS) {
      const response = await createExpense(token, {
        amount: 1.25,
        category: student.category,
        paymentMethod: method,
        description: `method ${method}`,
      });
      const saved = response.data?.data?.expense;
      ok(`"${method}" saves and round-trips`,
        response.status === 201 && saved?.paymentMethod === method,
        `-> ${response.status} ${saved?.paymentMethod ?? response.data?.message ?? ''}`);
      if (saved?._id) created.push(saved._id);
    }

    const omitted = await createExpense(token, {
      amount: 1.25, category: student.category, description: 'method omitted',
    });
    const omittedSaved = omitted.data?.data?.expense;
    ok('omitting the method still works and defaults to an accepted value',
      omitted.status === 201 && PAYMENT_METHODS.includes(omittedSaved?.paymentMethod),
      `-> ${omitted.status} ${omittedSaved?.paymentMethod ?? ''}`);
    if (omittedSaved?._id) created.push(omittedSaved._id);

    section('INVALID PAYMENT METHODS ARE REFUSED');
    const invented = await createExpense(token, {
      amount: 1.25, category: student.category, paymentMethod: 'Barter',
    });
    ok('an invented method is a client error',
      invented.status === 400
      && invented.data?.errors?.some((error) => error.field === 'paymentMethod'),
      `-> ${invented.status}`);

    // The exact confusion behind the outage: business payment rails are
    // lowercase ids for the biz_* tables and must not pass here.
    for (const rail of BUSINESS_PAYMENT_METHODS.slice(0, 3)) {
      const response = await createExpense(token, {
        amount: 1.25, category: student.category, paymentMethod: rail.id,
      });
      ok(`business rail "${rail.id}" is refused for a personal expense`,
        response.status === 400, `-> ${response.status}`);
    }
    const asObject = await createExpense(token, {
      amount: 1.25, category: student.category, paymentMethod: { id: 'cash', label: 'Cash in Hand (Naqad)' },
    });
    ok('a payment method sent as an object is refused, not coerced',
      asObject.status === 400, `-> ${asObject.status}`);

    section('HOUSEHOLD MODE SAVES THE SAME WAY');
    const switched = await call('PUT', '/profile', { financeMode: 'householder' }, token);
    ok('account switches to Householder mode',
      switched.status === 200 && switched.data?.data?.user?.financeMode === 'householder',
      String(switched.data?.data?.user?.financeMode));

    const household = await firstCategory(token);
    ok('household default categories differ from the student set',
      household.status === 200 && !!household.category && household.category !== student.category,
      String(household.category));

    const householdExpense = await createExpense(token, {
      amount: 2.5,
      category: household.category,
      paymentMethod: PAYMENT_METHODS[0],
      description: 'household method check',
    });
    const householdSaved = householdExpense.data?.data?.expense;
    ok(`household expense saves with "${PAYMENT_METHODS[0]}"`,
      householdExpense.status === 201 && householdSaved?.paymentMethod === PAYMENT_METHODS[0],
      `-> ${householdExpense.status} ${householdSaved?.paymentMethod ?? householdExpense.data?.message ?? ''}`);
    ok('household expense is stamped with the household mode',
      householdSaved?.financeMode === 'householder', String(householdSaved?.financeMode));
    if (householdSaved?._id) created.push(householdSaved._id);

    section('FINANCIAL DATA ISOLATION BETWEEN MODES');
    const inHousehold = await call('GET', '/expenses', undefined, token);
    const householdIds = (inHousehold.data?.data?.items || []).map((row) => row._id);
    ok('household list contains the household expense',
      inHousehold.status === 200 && householdIds.includes(householdSaved?._id));
    ok('household list contains none of the student expenses',
      created.slice(0, PAYMENT_METHODS.length).every((id) => !householdIds.includes(id)),
      `${householdIds.length} row(s) listed`);

    const back = await call('PUT', '/profile', { financeMode: 'student' }, token);
    ok('account switches back to Individual / Student mode',
      back.status === 200 && back.data?.data?.user?.financeMode === 'student');

    const inStudent = await call('GET', '/expenses', undefined, token);
    const studentIds = (inStudent.data?.data?.items || []).map((row) => row._id);
    ok('student list contains the student expenses again',
      inStudent.status === 200
      && created.slice(0, PAYMENT_METHODS.length).every((id) => studentIds.includes(id)),
      `${studentIds.length} row(s) listed`);
    ok('student list does not contain the household expense',
      !studentIds.includes(householdSaved?._id));
    ok('nothing was deleted by switching modes',
      studentIds.length >= PAYMENT_METHODS.length);

    section('BUSINESS DATA STAYS OUT OF A PERSONAL ACCOUNT');
    const businesses = await call('GET', '/business', undefined, token);
    ok('a personal account owns no businesses',
      businesses.status === 200 && Array.isArray(businesses.data?.data)
      && businesses.data.data.length === 0,
      `-> ${businesses.status} ${JSON.stringify(businesses.data?.data ?? null).slice(0, 60)}`);
  } finally {
    for (const id of created) await call('DELETE', `/expenses/${id}`, undefined, token);
    await call('DELETE', '/profile', { password: PASSWORD }, token);
  }

  report();
})().catch((error) => { console.error(error); process.exitCode = 1; });
