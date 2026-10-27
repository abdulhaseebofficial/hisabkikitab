/**
 * Unicode through Postgres: stored, read back, searched, updated, deleted.
 *
 * The validators are tested separately; this is about the database itself. The
 * questions are whether the column keeps the bytes it was given, whether a
 * character limit is a character limit rather than a byte limit, whether an
 * Urdu search finds an Urdu row, and whether the one character Postgres
 * refuses is refused in a way the API can report.
 *
 * Amounts are checked alongside the text on purpose. The point of the phase is
 * that a person can write their notes in their own language; it would be no use
 * if doing so disturbed the money.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../../scripts/require-test-database');
const { query, queryOne, closePool } = require('../../apps/api/src/infrastructure/database/pool');
const expenses = require('../../apps/api/src/modules/expenses/expenses.repository');
const income = require('../../apps/api/src/modules/income/income.repository');
const goals = require('../../apps/api/src/modules/goals/goals.repository');

const SCRIPTS = {
  urdu: 'گھر کا کرایہ',
  'urdu diacritics': 'کِتاب کا حِساب',
  'mixed urdu/english': 'Monthly گھر Expense',
  'mixed with amount': 'Rs. 500 کا خرچ',
  hindi: 'घर का किराया',
  bengali: 'বাড়ি ভাড়া',
  gurmukhi: 'ਘਰ ਦਾ ਕਿਰਾਇਆ',
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

const makeUser = (label) => queryOne(
  'INSERT INTO users(name,email,password,monthly_income) VALUES($1,$2,$3,0) RETURNING id',
  [label, `${crypto.randomUUID()}@test.local`, 'test-only'],
);

test.after(() => closePool());

test('the database is UTF-8, which is what makes any of this possible', async () => {
  const [row] = await query(
    `SELECT pg_encoding_to_char(encoding) AS db_encoding,
            current_setting('server_encoding') AS server_encoding,
            current_setting('client_encoding') AS client_encoding
       FROM pg_database WHERE datname = current_database()`
  );
  assert.equal(row.db_encoding, 'UTF8');
  assert.equal(row.server_encoding, 'UTF8');
  assert.equal(row.client_encoding, 'UTF8');
});

test('every script survives a write and a read byte for byte', async () => {
  const user = await makeUser('Unicode storage');
  try {
    for (const [label, text] of Object.entries(SCRIPTS)) {
      const created = await expenses.create(user.id, {
        financeMode: 'student',
        category: 'Mess/Food',
        description: text,
        amount: 12.34,
        date: new Date('2030-03-15T00:00:00Z'),
      });
      assert.equal(created.description, text, `${label} comes back as written`);

      const stored = await queryOne(
        'SELECT description, amount_minor::text AS minor FROM expenses WHERE id=$1',
        [created._id],
      );
      assert.equal(stored.description, text, `${label} is stored as written`);
      // The money is untouched by whatever script the note is in.
      assert.equal(stored.minor, '1234');
    }
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('a category and a note in Urdu are stored on the same row without interfering', async () => {
  const user = await makeUser('Unicode category');
  try {
    const created = await expenses.create(user.id, {
      financeMode: 'student',
      category: SCRIPTS.urdu,
      description: SCRIPTS['mixed with amount'],
      amount: 0.07,
      date: new Date('2030-03-16T00:00:00Z'),
    });
    const stored = await queryOne(
      'SELECT category, description, amount_minor::text AS minor FROM expenses WHERE id=$1',
      [created._id],
    );
    assert.equal(stored.category, SCRIPTS.urdu);
    assert.equal(stored.description, SCRIPTS['mixed with amount']);
    assert.equal(stored.minor, '7', 'sub-rupee precision is unaffected');
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('searching in Urdu finds the Urdu row and not the others', async () => {
  const user = await makeUser('Unicode search');
  try {
    for (const text of [SCRIPTS.urdu, SCRIPTS.hindi, SCRIPTS.chinese, 'Dhaba lunch']) {
      await expenses.create(user.id, {
        financeMode: 'student', category: 'Mess/Food', description: text,
        amount: 10, date: new Date('2030-03-17T00:00:00Z'),
      });
    }

    const found = await expenses.list(user.id, 'student', { search: SCRIPTS.urdu });
    assert.equal(found.items.length, 1, 'one match');
    assert.equal(found.items[0].description, SCRIPTS.urdu);

    // A partial Urdu word matches too - substring search is script-neutral.
    const partial = await expenses.list(user.id, 'student', { search: 'کرایہ' });
    assert.equal(partial.items.length, 1);

    // And a search in one script does not drag in another.
    const chinese = await expenses.list(user.id, 'student', { search: SCRIPTS.chinese });
    assert.equal(chinese.items.length, 1);
    assert.equal(chinese.items[0].description, SCRIPTS.chinese);
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('an Urdu row can be updated and deleted like any other', async () => {
  const user = await makeUser('Unicode lifecycle');
  try {
    const created = await expenses.create(user.id, {
      financeMode: 'student', category: 'Mess/Food', description: SCRIPTS.urdu,
      amount: 25, date: new Date('2030-03-18T00:00:00Z'),
    });

    const updated = await expenses.update(created._id, 'student', user.id, {
      description: SCRIPTS['mixed urdu/english'],
    });
    assert.equal(updated.description, SCRIPTS['mixed urdu/english']);

    await expenses.remove(created._id, 'student', user.id);
    const gone = await queryOne('SELECT count(*)::int AS n FROM expenses WHERE id=$1', [created._id]);
    assert.equal(gone.n, 0);
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('income notes and goal titles hold Unicode too', async () => {
  const user = await makeUser('Unicode other fields');
  try {
    const earned = await income.create(user.id, {
      financeMode: 'student', amount: 500, note: 'میری آمدنی',
      date: new Date('2030-03-19T00:00:00Z'),
    });
    assert.equal(earned.note, 'میری آمدنی');

    const goal = await goals.create(user.id, { title: 'دکان کا حساب', targetAmount: 5000 });
    assert.equal(goal.title, 'دکان کا حساب');
    const storedGoal = await queryOne('SELECT title FROM goals WHERE id=$1', [goal._id]);
    assert.equal(storedGoal.title, 'دکان کا حساب');
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('a name in any script is stored as written', async () => {
  const names = ['علی احمد', 'किराया जी', 'வாடகை', '王小明', 'سمیہ خان'];
  for (const name of names) {
    const user = await makeUser(name);
    try {
      const stored = await queryOne('SELECT name FROM users WHERE id=$1', [user.id]);
      assert.equal(stored.name, name);
    } finally {
      await query('DELETE FROM users WHERE id=$1', [user.id]);
    }
  }
});

test('a column limit counts characters, so Urdu is not cut to a third', async () => {
  const user = await makeUser('Unicode length');
  try {
    // 200 Urdu characters is roughly 400 bytes in UTF-8. If the limit were
    // bytes, this would be refused.
    const long = 'آ'.repeat(200);
    assert.ok(Buffer.byteLength(long, 'utf8') > 300, 'the sample must exceed the limit in bytes');

    const created = await expenses.create(user.id, {
      financeMode: 'student', category: 'Mess/Food', description: long,
      amount: 1, date: new Date('2030-03-20T00:00:00Z'),
    });
    const stored = await queryOne('SELECT description FROM expenses WHERE id=$1', [created._id]);
    assert.equal(stored.description.length, 200, 'all 200 characters survived');
    assert.equal(stored.description, long);
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('a NUL byte is refused by Postgres with the code the API maps to 400', async () => {
  // This is why `unicodeText` rejects the C0 block at the edge: without it the
  // request reached here and the 22021 surfaced as a 500.
  const user = await makeUser('Unicode nul');
  try {
    await assert.rejects(
      query(
        `INSERT INTO expenses(user_id,finance_mode,amount,category,date,description)
         VALUES($1,'student',1,'Mess/Food',now(),$2)`,
        [user.id, 'گھر\u0000bad'],
      ),
      (err) => err.code === '22021',
    );
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('text that looks like an attack is stored literally, never executed', async () => {
  const user = await makeUser('Unicode hostile');
  try {
    const hostile = [
      "گھر'; DROP TABLE expenses; --",
      '<script>alert(1)</script>',
      'گھر<script>alert(1)</script>',
      'گھر\u202Eevil',
      "' OR 1=1 --",
    ];
    for (const text of hostile) {
      const created = await expenses.create(user.id, {
        financeMode: 'student', category: 'Mess/Food', description: text,
        amount: 1, date: new Date('2030-03-21T00:00:00Z'),
      });
      const stored = await queryOne('SELECT description FROM expenses WHERE id=$1', [created._id]);
      assert.equal(stored.description, text, 'stored exactly, so the record says what was typed');
    }
    // The table the injection asked to drop is still there.
    const alive = await queryOne("SELECT to_regclass('expenses') IS NOT NULL AS ok");
    assert.equal(alive.ok, true);
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('aggregates over Unicode rows are exact', async () => {
  const user = await makeUser('Unicode totals');
  try {
    for (const [text, amount] of [[SCRIPTS.urdu, 0.1], [SCRIPTS.hindi, 0.2], ['plain', 0.3]]) {
      await expenses.create(user.id, {
        financeMode: 'student', category: 'Mess/Food', description: text,
        amount, date: new Date('2030-04-10T00:00:00Z'),
      });
    }
    const listed = await expenses.list(user.id, 'student');
    assert.equal(listed.filteredTotal, 0.6, 'the script of a note changes no total');

    const stored = await queryOne(
      'SELECT sum(amount_minor)::text AS minor FROM expenses WHERE user_id=$1', [user.id],
    );
    assert.equal(stored.minor, '60');
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});
