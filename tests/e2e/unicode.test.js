/**
 * Urdu and the other Asian scripts over the real HTTP API.
 *
 * The unit suite proves the rules and the database suite proves the storage.
 * This proves the whole path a person's text actually travels: request body,
 * validation, repository, Postgres, serialisation, response - and then the
 * search, the update, the delete and both exports.
 *
 * It covers the fields named in the phase brief: names, expense and income
 * descriptions, categories, notes, goal names, debt contacts and notes, and
 * feedback. Shared Living and Business have their own suites; the shared-living
 * space name is checked here because its validator has its own text rule.
 */

const { ok, section, call, report, requireApi } = require('./helpers');

const PASSWORD = 'TestPass123!';

const SCRIPTS = {
  urdu: 'گھر کا کرایہ',
  'urdu bill': 'بجلی کا بل',
  'urdu income': 'میری آمدنی',
  'urdu shop': 'دکان کا حساب',
  'urdu today': 'آج کی خریداری',
  'urdu diacritics': 'کِتاب کا حِساب',
  'mixed urdu/english': 'Monthly گھر Expense',
  'mixed with amount': 'Rs. 500 کا خرچ',
  hindi: 'घर का किराया',
  bengali: 'বাড়ি ভাড়া',
  gurmukhi: 'ਘਰ ਦਾ ਕਿਰਾਇਆ',
  sindhi: 'گھر جو ڀاڙو',
  arabic: 'إيجار المنزل',
  persian: 'اجاره خانه',
  tamil: 'வீட்டு வாடகை',
  telugu: 'ఇంటి అద్దె',
  chinese: '房租支出',
  japanese: '家賃の支払い',
  korean: '집세 지출',
  thai: 'ค่าเช่าบ้าน',
  indonesian: 'Sewa rumah bulanan',
};

const NAMES = {
  urdu: 'علی احمد',
  hindi: 'किराया जी',
  tamil: 'வாடகை',
  chinese: '王小明',
  arabic: 'محمد',
};

(async () => {
  await requireApi();

  const email = `unicode-${Date.now()}@example.test`;
  const registration = await call('POST', '/auth/register', {
    acceptTerms: true, name: 'Unicode Probe', email, password: PASSWORD, confirmPassword: PASSWORD,
  });
  const token = registration.data?.data?.accessToken;

  section('SETUP');
  ok('disposable account authenticates', registration.status === 201 && !!token);
  const onboarding = await call('POST', '/profile/onboarding', {
    financeMode: 'student', language: 'en', monthlyIncome: 50000, currency: 'PKR',
  }, token);
  ok('account onboards', onboarding.status === 200, `-> ${onboarding.status}`);

  const created = [];

  try {
    section('USER NAME IN EVERY SCRIPT');
    for (const [label, value] of Object.entries(NAMES)) {
      const response = await call('PUT', '/profile', { name: value }, token);
      ok(`name in ${label} is accepted and returned unchanged`,
        response.status === 200 && response.data?.data?.user?.name === value,
        `-> ${response.status} ${response.data?.data?.user?.name ?? response.data?.message ?? ''}`);
    }
    const badName = await call('PUT', '/profile', { name: 'Ali2' }, token);
    ok('a name with a digit is still refused', badName.status === 400, `-> ${badName.status}`);

    section('EXPENSE DESCRIPTION IN EVERY SCRIPT');
    for (const [label, value] of Object.entries(SCRIPTS)) {
      const response = await call('POST', '/expenses', {
        amount: 12.34, category: 'Mess/Food', description: value, paymentMethod: 'Cash',
      }, token);
      const saved = response.data?.data?.expense;
      if (saved?._id) created.push(saved._id);
      ok(`${label} round-trips exactly`,
        response.status === 201 && saved?.description === value && String(saved?.amountMinor) === '1234',
        `-> ${response.status}`);
    }

    section('SEARCH, UPDATE AND DELETE IN URDU');
    const searched = await call('GET', `/expenses?search=${encodeURIComponent(SCRIPTS.urdu)}`, undefined, token);
    const hits = searched.data?.data?.items || [];
    ok('an Urdu search finds the Urdu row', searched.status === 200
      && hits.some((row) => row.description === SCRIPTS.urdu), `${hits.length} row(s)`);

    const partial = await call('GET', `/expenses?search=${encodeURIComponent('کرایہ')}`, undefined, token);
    ok('a partial Urdu word matches too', partial.status === 200
      && (partial.data?.data?.items || []).length > 0);

    const target = created[0];
    const updated = await call('PUT', `/expenses/${target}`, { description: SCRIPTS['mixed with amount'] }, token);
    ok('an Urdu row updates to mixed Urdu/English',
      updated.status === 200 && updated.data?.data?.expense?.description === SCRIPTS['mixed with amount'],
      `-> ${updated.status}`);

    const removed = await call('DELETE', `/expenses/${target}`, undefined, token);
    ok('and deletes', removed.status === 200, `-> ${removed.status}`);
    created.shift();

    section('EVERY OTHER FREE-TEXT FIELD');
    const earned = await call('POST', '/income', {
      amount: 500, source: 'Pocket Money', note: SCRIPTS['urdu income'],
    }, token);
    ok('income note keeps Urdu',
      earned.status === 201 && earned.data?.data?.income?.note === SCRIPTS['urdu income'],
      `-> ${earned.status}`);

    const goal = await call('POST', '/goals', {
      title: SCRIPTS['urdu shop'], targetAmount: 5000, note: SCRIPTS['urdu today'],
    }, token);
    ok('goal title and note keep Urdu',
      goal.status === 201
      && goal.data?.data?.goal?.title === SCRIPTS['urdu shop']
      && goal.data?.data?.goal?.note === SCRIPTS['urdu today'],
      `-> ${goal.status}`);

    const debt = await call('POST', '/debts', {
      kind: 'BORROWED', personName: NAMES.urdu, originalAmount: 1000,
      purposeCategory: 'other', purpose: SCRIPTS['urdu bill'],
    }, token);
    const savedDebt = debt.data?.data?.debt;
    ok('debt contact name and purpose keep Urdu',
      debt.status === 201 && savedDebt?.personName === NAMES.urdu && savedDebt?.purpose === SCRIPTS['urdu bill'],
      `-> ${debt.status} ${JSON.stringify(debt.data?.errors || '').slice(0, 70)}`);

    const feedback = await call('POST', '/feedback', {
      type: 'General', message: SCRIPTS['mixed urdu/english'],
    }, token);
    ok('feedback message keeps mixed Urdu/English',
      feedback.status === 201 && feedback.data?.data?.feedback?.message === SCRIPTS['mixed urdu/english'],
      `-> ${feedback.status}`);

    section('A CUSTOM CATEGORY TYPED IN URDU');
    const category = await call('POST', '/profile/categories', { name: SCRIPTS.urdu }, token);
    const all = category.data?.data?.all || [];
    ok('an Urdu category is created and listed',
      category.status === 201 && all.includes(SCRIPTS.urdu), `-> ${category.status}`);

    const spent = await call('POST', '/expenses', {
      amount: 7.5, category: SCRIPTS.urdu, description: SCRIPTS['urdu today'],
    }, token);
    if (spent.data?.data?.expense?._id) created.push(spent.data.data.expense._id);
    ok('and an expense can be filed under it',
      spent.status === 201 && spent.data?.data?.expense?.category === SCRIPTS.urdu,
      `-> ${spent.status}`);

    const duplicate = await call('POST', '/profile/categories', { name: SCRIPTS.urdu }, token);
    ok('adding the same Urdu category twice is refused, not duplicated',
      duplicate.status >= 400, `-> ${duplicate.status}`);

    section('SHARED LIVING SPACE NAME');
    const space = await call('POST', '/shared-living/spaces', {
      name: SCRIPTS['urdu shop'], currency: 'PKR', month: '2030-05', residents: 1, members: [NAMES.urdu],
    }, token);
    ok('a shared space can be named in Urdu with an Urdu member',
      space.status === 200 && space.data?.data?.name === SCRIPTS['urdu shop'],
      `-> ${space.status} ${JSON.stringify(space.data?.message || '').slice(0, 60)}`);

    section('LIMITS AND HOSTILE INPUT');
    const atLimit = await call('POST', '/expenses', {
      amount: 1, category: 'Mess/Food', description: 'آ'.repeat(200),
    }, token);
    if (atLimit.data?.data?.expense?._id) created.push(atLimit.data.data.expense._id);
    ok('200 Urdu characters fit a 200-character field', atLimit.status === 201, `-> ${atLimit.status}`);

    const overLimit = await call('POST', '/expenses', {
      amount: 1, category: 'Mess/Food', description: 'آ'.repeat(201),
    }, token);
    ok('201 does not', overLimit.status === 400, `-> ${overLimit.status}`);

    const nul = await call('POST', '/expenses', {
      amount: 1, category: 'Mess/Food', description: 'گھر\u0000bad',
    }, token);
    ok('a NUL byte is a 400, not a 500', nul.status === 400, `-> ${nul.status}`);

    for (const [label, value] of [
      ['a script tag', '<script>alert(1)</script>'],
      ['Urdu with a script tag', 'گھر<script>alert(1)</script>'],
      ['an injection attempt', "گھر'; DROP TABLE expenses; --"],
      ['a bidi override', 'گھر\u202Eevil'],
    ]) {
      const response = await call('POST', '/expenses', {
        amount: 1, category: 'Mess/Food', description: value,
      }, token);
      const saved = response.data?.data?.expense;
      if (saved?._id) created.push(saved._id);
      // Stored verbatim on purpose: parameterised SQL and React escaping are
      // what make it safe, and a note has to say what the person wrote.
      ok(`${label} is stored verbatim rather than stripped`,
        response.status === 201 && saved?.description === value, `-> ${response.status}`);
    }

    section('EXPORTS');
    const now = new Date();
    const period = `month=${now.getUTCMonth() + 1}&year=${now.getUTCFullYear()}`;

    const csv = await call('GET', `/reports/export?format=csv&${period}`, undefined, token);
    const csvText = Buffer.isBuffer(csv.data) ? csv.data.toString('utf8')
      : Buffer.from(csv.data || '').toString('utf8');
    ok('the CSV export carries the Urdu text', csv.status === 200 && csvText.includes(SCRIPTS['urdu today']),
      `-> ${csv.status}`);
    ok('and starts with a UTF-8 BOM so a spreadsheet reads it correctly',
      csvText.charCodeAt(0) === 0xfeff || csvText.startsWith('\ufeff'));

    const pdf = await call('GET', `/reports/export?format=pdf&${period}`, undefined, token);
    const pdfBuffer = Buffer.isBuffer(pdf.data) ? pdf.data : Buffer.from(pdf.data || '');
    ok('the PDF export is still produced', pdf.status === 200 && pdfBuffer.slice(0, 5).toString() === '%PDF-',
      `-> ${pdf.status} ${pdfBuffer.length} bytes`);
    // The built-in PDF font has no Urdu glyphs. What matters is that the file
    // says so rather than dropping the text; the drawn-text assertion lives in
    // the unit suite, where the font can be inspected directly.
  } finally {
    for (const id of created) await call('DELETE', `/expenses/${id}`, undefined, token);
    await call('DELETE', '/profile', { password: PASSWORD }, token);
  }

  report();
})().catch((error) => { console.error(error); process.exitCode = 1; });
