const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../../scripts/require-test-database');
const { query, queryOne, closePool } = require('../../apps/api/src/infrastructure/database/pool');

test('every historical personal amount has an exact minor-unit shadow', async () => {
  const fields = [
    ['users', 'monthly_income', 'monthly_income_minor'],
    ['expenses', 'amount', 'amount_minor'],
    ['income', 'amount', 'amount_minor'],
    ['goals', 'target_amount', 'target_amount_minor'],
    ['goals', 'saved_amount', 'saved_amount_minor'],
    ['goal_contributions', 'amount', 'amount_minor'],
    ['budgets', '"limit"', 'limit_minor'],
  ];
  for (const [table, legacy, minor] of fields) {
    const row = await queryOne(`SELECT count(*)::integer AS mismatches FROM ${table}
      WHERE ${minor} IS NULL OR ${minor}::numeric <> ${legacy}::numeric * 100`);
    assert.equal(row.mismatches, 0, `${table}.${legacy}`);
  }
});

test('new writes maintain minor units and reject sub-cent historical loss', async () => {
  const user = await queryOne(
    'INSERT INTO users(name,email,password,monthly_income) VALUES($1,$2,$3,$4) RETURNING id,monthly_income_minor',
    ['Money test', `${crypto.randomUUID()}@test.local`, 'test-only', 0.3]
  );
  try {
    assert.equal(user.monthly_income_minor, 30);
    const expense = await queryOne(`INSERT INTO expenses(user_id,finance_mode,amount,category)
      VALUES($1,'student',10.01,'Test') RETURNING id,amount_minor`, [user.id]);
    assert.equal(expense.amount_minor, 1001);
    await query('UPDATE expenses SET amount=$1 WHERE id=$2', [0.3, expense.id]);
    assert.equal((await queryOne('SELECT amount_minor FROM expenses WHERE id=$1', [expense.id])).amount_minor, 30);
    await assert.rejects(
      query("INSERT INTO expenses(user_id,finance_mode,amount,category) VALUES($1,'student',1.001,'Test')", [user.id]),
      /cannot be represented in minor units/
    );
  } finally {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test.after(async () => closePool());
