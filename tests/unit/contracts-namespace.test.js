/**
 * The shared contract is one flat namespace, and that is only safe while no two
 * definitions want the same name.
 *
 * `index.js` merges business over the vocabulary, so a duplicate name does not
 * raise anything - the later definition simply replaces the earlier one. That
 * is how the business payment rails (objects, `{ id, label }`) came to stand in
 * for the personal payment methods (plain strings): every expense validator
 * then compared a string the person had picked against a list of objects, found
 * no match, and answered "Unknown payment method" to every attempt to record
 * spending.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const contracts = require('../../packages/contracts');
const vocabulary = require('../../packages/contracts/vocabulary.json');
const business = require('../../packages/contracts/business');
const { PAYMENT_METHODS } = require('../../apps/api/src/shared/constants');

test('business contracts never take a name the shared vocabulary already uses', () => {
  const collisions = Object.keys(business).filter((name) => name in vocabulary);
  assert.deepEqual(collisions, [],
    'a business export is shadowing a shared one; give it a BUSINESS_ prefix');
});

test('payment methods reach the expense validator as the strings a person picks', () => {
  for (const list of [contracts.PAYMENT_METHODS, PAYMENT_METHODS]) {
    assert.ok(Array.isArray(list) && list.length > 0);
    for (const method of list) {
      assert.equal(typeof method, 'string',
        `expense validation compares strings, got ${JSON.stringify(method)}`);
    }
  }
  // The value the API stores when nothing is chosen has to be an accepted one.
  assert.ok(PAYMENT_METHODS.includes('Cash'));

  // The business rails stay available, under their own name and their own shape.
  assert.ok(contracts.BUSINESS_PAYMENT_METHODS.every(
    (method) => typeof method.id === 'string' && typeof method.label === 'string'));
  // Those ids are what the biz_* payment_method CHECK constraints allow.
  assert.deepEqual(contracts.BUSINESS_PAYMENT_METHODS.map((method) => method.id),
    ['cash', 'bank', 'wallet', 'credit', 'split']);
});

test('every advertised payment method passes expense validation', async () => {
  const { validationResult } = require('express-validator');
  const expenseValidators = require('../../apps/api/src/modules/expenses/expenses.validator');

  const check = async (paymentMethod) => {
    const req = { body: { amount: 10, category: 'Mess/Food', date: '2026-10-05', paymentMethod } };
    for (const validator of expenseValidators.create) await validator.run(req);
    return validationResult(req).array().map((error) => error.path);
  };

  for (const method of PAYMENT_METHODS) {
    assert.deepEqual(await check(method), [], `${method} should be accepted`);
  }
  assert.deepEqual(await check('Barter'), ['paymentMethod'],
    'an invented method is still refused');
});
