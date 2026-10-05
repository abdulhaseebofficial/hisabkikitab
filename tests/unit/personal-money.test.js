const test = require('node:test');
const assert = require('node:assert/strict');
const { types } = require('pg');
require('../../apps/api/src/infrastructure/database/pool');
const money = require('../../apps/api/src/shared/finance/personalMoney');

test('decimal inputs, sums and subtraction use integer minor units', () => {
  const amounts = ['0.10', '0.20', '-0.05'].map((value) => money.decimalToMinor(value, { allowNegative: true }));
  assert.equal(money.sumMinor(amounts), 25n);
  assert.equal(money.minorToApi(money.sumMinor(amounts)), 0.25);
  assert.equal(money.minorToApi(money.decimalToMinor('0.30') - money.decimalToMinor('0.10')), 0.2);
  assert.equal(money.ratioPercent2(20n, 30n), 66.67);
});

test('PostgreSQL parsers never coerce unsafe integers to Number or JSON BigInt', () => {
  assert.equal(types.getTypeParser(20)('9007199254740991'), Number.MAX_SAFE_INTEGER);
  assert.equal(types.getTypeParser(20)('9007199254740992'), '9007199254740992');
  assert.equal(types.getTypeParser(1700)('999999999999999999.99'), '999999999999999999.99');
  assert.equal(JSON.stringify({ amount: money.minorToApi(9007199254740992n) }), '{"amount":"90071992547409.92"}');
});
