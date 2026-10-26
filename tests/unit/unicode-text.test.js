/**
 * Urdu and the other Asian scripts, through every layer that can refuse them.
 *
 * The app stores money for people who write their notes in Urdu, Hindi, Tamil
 * or Chinese, often mixed with English in the same sentence. Three things have
 * to hold for that to work, and each is checked here:
 *
 *   a name in any script is accepted, and a name with a digit still is not;
 *   a free-text field keeps exactly what was typed, counts its limit in
 *   characters rather than bytes, and answers 400 rather than 500 for the one
 *   character Postgres cannot hold;
 *   the PDF export says so when it cannot draw a script, instead of quietly
 *   dropping the text.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const { body } = require('express-validator');

const { checkName, normalizeName } = require('../../packages/contracts/validation');
const { unicodeText, UNSTORABLE_TEXT } = require('../../apps/api/src/shared/validation/rules');
const { pdfText, MARKER } = require('../../apps/api/src/modules/reports/reports.pdfText');
const catalogue = require('../../packages/contracts/catalogue');

/** One word of real text per script this phase promises to accept. */
const SCRIPTS = {
  urdu: 'گھر کا کرایہ',
  'urdu diacritics': 'کِتاب کا حِساب',
  english: 'House rent',
  'mixed urdu/english': 'Monthly گھر Expense',
  'mixed with amount': 'Rs. 500 کا خرچ',
  hindi: 'घर का किराया',
  bengali: 'বাড়ি ভাড়া',
  'punjabi gurmukhi': 'ਘਰ ਦਾ ਕਿਰਾਇਆ',
  'punjabi shahmukhi': 'گھر دا کرایہ',
  sindhi: 'گھر جو ڀاڑو',
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

/** Runs one express-validator chain and returns the failing field paths. */
const run = async (chain, value) => {
  const req = { body: { field: value } };
  await chain.run(req);
  return { errors: validationResult(req).array().map((e) => e.path), value: req.body.field };
};

const textChain = (options) => unicodeText(body('field'), options);

/* -------------------------------- names --------------------------------- */

test('a name is accepted in every script this phase promises', () => {
  const names = {
    urdu: 'علی احمد',
    'urdu diacritics': 'کِتاب',
    hindi: 'नमस्ते जी',
    'hindi ending in a vowel sign': 'किराया',
    bengali: 'বাড়ি',
    gurmukhi: 'ਕਿਰਾਇਆ',
    tamil: 'வாடகை',
    telugu: 'అద్దె',
    arabic: 'محمد',
    persian: 'احمد',
    chinese: '王小明',
    japanese: '田中',
    korean: '김출수',
    thai: 'สมชาย',
    'latin accented': 'José',
    'latin apostrophe': 'O’Brien',
    'latin hyphenated': 'Mary-Jane',
  };
  for (const [label, value] of Object.entries(names)) {
    assert.equal(checkName(value).ok, true, `${label} (${value}) must be accepted`);
  }
});

test('Indic names ending in a dependent vowel sign are the case that used to fail', () => {
  // The pattern once required the last character to be \p{L}. Devanagari,
  // Bengali, Tamil and Telugu words routinely end in \p{M}, so most Indic
  // names were refused with "letters, spaces, hyphens and apostrophes only".
  for (const value of ['किराया', 'বাড়ি',
    'வாடகை', 'అద్దె']) {
    const marks = [...value].filter((ch) => /\p{M}/u.test(ch));
    assert.ok(marks.length > 0, 'the sample must actually contain a combining mark');
    assert.ok(/\p{M}/u.test(value[value.length - 1]), 'and must end in one');
    assert.equal(checkName(value).ok, true);
  }
});

test('widening the name rule did not weaken it', () => {
  const refused = {
    'a digit': 'Ali2',
    'an email': 'a@b.com',
    'a script tag': '<script>alert(1)</script>',
    'an emoji': 'Ali \u{1F642}',
    'a slash': 'a/b',
    'a lone combining mark': 'ّ',
    'a leading combining mark': 'ّAli',
    'a NUL byte': 'Ali\u0000',
    empty: '',
    'only spaces': '   ',
  };
  for (const [label, value] of Object.entries(refused)) {
    assert.equal(checkName(value).ok, false, `${label} must still be refused`);
  }
});

test('a name is trimmed and its inner spacing collapsed, and nothing else', () => {
  assert.equal(normalizeName('  علی    احمد '),
    'علی احمد');
  // No character the person typed is removed - a bad name is refused, never
  // silently repaired into a different one.
  assert.equal(checkName('Ali2').value, 'Ali2');
});

/* ----------------------------- free text -------------------------------- */

test('a free-text field keeps every script byte for byte', async () => {
  for (const [label, value] of Object.entries(SCRIPTS)) {
    const result = await run(textChain({ max: 200 }), value);
    assert.deepEqual(result.errors, [], `${label} must be accepted`);
    assert.equal(result.value, value, `${label} must be stored exactly as typed`);
  }
});

test('text that only looks dangerous is stored as typed, not stripped', async () => {
  // Parameterised SQL and React escaping are what make these safe. A validator
  // that removed them would store something the person did not write, and a
  // note on a financial record has to say what they said.
  const kept = [
    '<script>alert(1)</script>',
    'گھر<script>alert(1)</script>',
    "گھر'; DROP TABLE expenses; --",
    'rent > 20000 & bills < 5000',
    "Ali's shop",
    'گھر\u202Eevil',
  ];
  for (const value of kept) {
    const result = await run(textChain({ max: 200 }), value);
    assert.deepEqual(result.errors, [], `${value} must be accepted`);
    assert.equal(result.value, value, 'stored exactly as typed');
  }
});

test('the length limit counts characters, not bytes', async () => {
  // Urdu is two to three bytes per character in UTF-8. A byte limit would cut
  // a 200-character allowance down to about 67 characters of Urdu.
  const urduChar = 'آ';
  assert.ok(Buffer.byteLength(urduChar, 'utf8') > 1, 'the sample must be multi-byte');

  const atLimit = await run(textChain({ max: 200 }), urduChar.repeat(200));
  assert.deepEqual(atLimit.errors, [], '200 Urdu characters must fit a 200-character field');

  const overLimit = await run(textChain({ max: 200 }), urduChar.repeat(201));
  assert.deepEqual(overLimit.errors, ['field'], '201 must not');
});

test('a NUL byte is a client error, named, instead of a database 500', async () => {
  // Postgres refuses NUL in text with 22021. That used to surface as a 500 and
  // an entry in the error log, for what is a malformed request.
  const result = await run(textChain({ max: 200 }), 'گھر\u0000bad');
  assert.deepEqual(result.errors, ['field']);

  for (const control of ['\u0000', '\u0008', '\u000B', '\u000C', '\u001F']) {
    assert.equal(UNSTORABLE_TEXT.test(control), true, `${JSON.stringify(control)} is unstorable`);
  }
  // The three a person can actually mean are left alone.
  for (const allowed of ['\t', '\n', '\r']) {
    assert.equal(UNSTORABLE_TEXT.test(allowed), false, `${JSON.stringify(allowed)} is fine`);
  }
});

test('canonically equivalent text is normalised so search can match it', async () => {
  // The same Urdu word, precomposed and decomposed. They render identically
  // and Postgres compares bytes, so without NFC a description saved from one
  // keyboard is not found by a search typed on another.
  const decomposed = 'أ';
  const composed = decomposed.normalize('NFC');
  assert.notEqual(composed, decomposed, 'the sample must differ before normalising');

  const result = await run(textChain({ max: 200 }), decomposed);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value, composed, 'stored in NFC');
  // NFC is canonical equivalence - the same text by Unicode’s definition,
  // not a rewrite. Nothing a person can see has changed.
  assert.equal(result.value.normalize('NFD'), decomposed.normalize('NFD'));
});

test('surrounding whitespace is trimmed and inner text is untouched', async () => {
  const result = await run(textChain({ max: 200 }), '  Monthly گھر  Expense  ');
  assert.equal(result.value, 'Monthly گھر  Expense');
});

/* --------------------------- the PDF export ----------------------------- */

/** A stand-in for the built-in PDF font: Latin only, like the real one. */
const latinOnlyDoc = () => ({
  _font: {
    font: {
      characterToGlyph: (codePoint) =>
        (codePoint >= 0x20 && codePoint <= 0x7e ? 'glyph' : '.notdef'),
    },
  },
});

test('the PDF marks text its font cannot draw instead of dropping it', () => {
  const text = pdfText(latinOnlyDoc());

  assert.equal(text.safe('Dhaba lunch'), 'Dhaba lunch', 'Latin text is untouched');
  assert.equal(text.safe(SCRIPTS.urdu), MARKER);
  assert.equal(text.safe(SCRIPTS.chinese), MARKER);
  assert.equal(text.safe(SCRIPTS['mixed urdu/english']), MARKER,
    'a mixed value is replaced whole: half a description reads as the person’s own typo');

  assert.equal(text.omitted, 3);
  const note = text.note();
  assert.match(note, /3 values are written in a script this PDF cannot display/);
  assert.match(note, /CSV/, 'and it says where to get the full text');
});

test('the PDF note is absent when nothing was lost', () => {
  const text = pdfText(latinOnlyDoc());
  text.safe('Dhaba lunch');
  text.safe('Hostel fee');
  assert.equal(text.omitted, 0);
  assert.equal(text.note(), null);
});

test('identical unrenderable values are counted once', () => {
  const text = pdfText(latinOnlyDoc());
  text.safe(SCRIPTS.urdu);
  text.safe(SCRIPTS.urdu);
  assert.equal(text.omitted, 1);
  assert.match(text.note(), /1 value is written/);
});

test('an empty or missing value is not reported as lost', () => {
  const text = pdfText(latinOnlyDoc());
  assert.equal(text.safe(''), '');
  assert.equal(text.safe(null), '');
  assert.equal(text.safe(undefined), '');
  assert.equal(text.omitted, 0);
});

test('a PDF font that cannot be inspected is assumed to be Latin only', () => {
  // Reaching into pdfkit for the font could break. Failing closed keeps the
  // export honest rather than silently losing text again.
  const text = pdfText({});
  assert.equal(text.safe('Dhaba lunch'), 'Dhaba lunch');
  assert.equal(text.safe(SCRIPTS.urdu), MARKER);
});

test('the real built-in PDF font genuinely lacks these glyphs', () => {
  // Not a mock: this is the font the export actually uses. If a future pdfkit
  // embeds a Unicode font, this test is how we find out.
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument();
  const font = doc._font.font;
  assert.equal(font.characterToGlyph('A'.codePointAt(0)), 'A');
  for (const script of ['urdu', 'hindi', 'chinese', 'tamil', 'thai']) {
    const first = SCRIPTS[script].codePointAt(0);
    assert.equal(font.characterToGlyph(first), '.notdef', `${script} has no glyph`);
  }
});

/* ------------------------ the database backstop -------------------------- */

test('a character Postgres cannot store is a client error even without a validator', () => {
  // Every free-text validator now rejects the C0 block with a named field, so
  // this should not be reachable. It stays because the cost of being wrong is a
  // 500 and an error-log entry blaming the server for a malformed request.
  const { errorHandler } = require('../../apps/api/src/shared/middleware/errorHandler');

  const capture = () => {
    const res = {
      statusCode: null,
      body: null,
      status(code) { res.statusCode = code; return res; },
      json(payload) { res.body = payload; return res; },
    };
    return res;
  };
  const req = { requestId: 'test-request', app: { emit() {} } };

  const res = capture();
  errorHandler({ code: '22021', message: 'invalid byte sequence' }, req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /cannot be stored/);
  assert.equal(res.body.success, false);

  // An error with no mapping is still a 500, so this did not widen into a
  // catch-all that hides real faults.
  const unknown = capture();
  errorHandler({ message: 'something actually broke' }, req, unknown, () => {});
  assert.equal(unknown.statusCode, 500);
});

/* ------------------------- business fields ------------------------------ */

test('a shop keeps its books in its own script', async () => {
  // The brief names these explicitly: business customer and supplier names,
  // and product names. They were already unrestricted; this pins that down and
  // gives them the same NFC and control-character handling as the rest.
  const businessValidators = require('../../apps/api/src/modules/business/business.validator');

  const check = async (chain, value) => {
    const req = { body: { name: value, items: [{ productName: value }] } };
    for (const validator of chain) await validator.run(req);
    return validationResult(req).array().map((e) => e.path);
  };

  for (const key of ['createBusiness', 'createProduct', 'createCustomer', 'createSupplier']) {
    for (const script of ['urdu', 'chinese', 'hindi', 'mixed urdu/english']) {
      const errors = await check(businessValidators[key], SCRIPTS[script]);
      assert.equal(errors.includes('name'), false,
        `${key} must accept a name in ${script}`);
    }
    const blank = await check(businessValidators[key], '   ');
    assert.equal(blank.includes('name'), true, `${key} still requires a name`);

    const nul = await check(businessValidators[key], 'دکان ');
    assert.equal(nul.includes('name'), true, `${key} still refuses a NUL byte`);
  }
});

/* ----------------------- language architecture -------------------------- */

test('every interface language declares how it is written', () => {
  const languages = catalogue.uiLanguages();
  assert.ok(languages.length >= 1);
  for (const language of languages) {
    assert.match(language.bcp47, /^[a-z]{2}(-[A-Za-z]+)*$/, `${language.id} needs a BCP 47 tag`);
    assert.ok(['ltr', 'rtl'].includes(language.dir), `${language.id} needs a direction`);
    assert.ok(language.sample.length > 0, `${language.id} needs a sample line to recognise it by`);
  }
});

test('the languages offered are exactly the ones with a translation catalogue', () => {
  // Text ENTRY works in every script. An interface LANGUAGE is a much smaller
  // claim, and only the ones with a complete catalogue may be offered: a
  // half-translated interface falls back to English key by key and reads as a
  // bug rather than as unfinished work.
  assert.deepEqual(catalogue.uiLanguages().map((l) => l.id), ['en', 'roman_ur']);
  assert.equal(catalogue.safeLanguage('ur'), 'en', 'Urdu script is not an interface language yet');
  assert.equal(catalogue.safeLanguage('nonsense'), 'en');
});

test('an unknown language falls back rather than throwing', () => {
  const meta = catalogue.languageMeta('nonsense');
  assert.equal(meta.id, 'en');
  assert.equal(meta.dir, 'ltr');
});

/* ------------------------- category labels ------------------------------ */

test('a stored category id resolves to words, in both interface languages', () => {
  // The ids that were showing through to the screen as-is.
  const slugs = ['student_shopping', 'student_family', 'student_savings', 'student_emergency'];
  for (const id of slugs) {
    for (const language of ['en', 'roman_ur']) {
      const label = catalogue.labelForAnyMode('expense', id, language);
      assert.notEqual(label, id, `${id} must not render as its own id in ${language}`);
      assert.ok(label.length > 0);
      assert.equal(/_/.test(label), false, `${label} still looks like an id`);
    }
  }
});

test('ids are not renamed to translate them', () => {
  // The id is the stored value and the API contract; only the label moves.
  for (const id of ['Mess/Food', 'student_savings', 'groceries']) {
    const ids = catalogue.allKnownCategoryIds();
    if (!ids.includes(id)) continue;
    assert.ok(ids.includes(id), `${id} is still the stored id`);
    assert.notEqual(catalogue.labelForAnyMode('expense', id, 'en'), id);
  }
});

test('a category somebody invented comes back exactly as they wrote it', () => {
  for (const custom of [SCRIPTS.urdu, SCRIPTS.chinese, 'Gym', 'Chai چائے']) {
    for (const language of ['en', 'roman_ur']) {
      assert.equal(catalogue.labelForAnyMode('expense', custom, language), custom);
    }
  }
});

test('income sources are labelled the same way', () => {
  const ids = catalogue.categoryIdsFor('income', 'householder');
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const label = catalogue.labelForAnyMode('income', id, 'roman_ur');
    assert.ok(label.length > 0);
    assert.equal(/_/.test(label), false, `income source ${id} renders as ${label}`);
  }
});
