const test = require('node:test');
const assert = require('node:assert/strict');
const { startOfCalendarMonth, endOfCalendarMonth, currentPeriod } = require('../../apps/api/src/shared/utils/calculations');

test('financial month bounds represent the same stored UTC calendar dates in either server timezone', () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ['Asia/Karachi', 'America/Los_Angeles']) {
      process.env.TZ = timezone;
      assert.equal(startOfCalendarMonth(2026, 10).toISOString(), '2026-10-01T00:00:00.000Z');
      assert.equal(endOfCalendarMonth(2026, 10).toISOString(), '2026-10-31T23:59:59.999Z');
      assert.equal(endOfCalendarMonth(2028, 2).toISOString(), '2028-02-29T23:59:59.999Z');
      assert.deepEqual(currentPeriod(new Date('2026-10-01T00:30:00Z')), { month: 10, year: 2026 });
      assert.deepEqual(currentPeriod(new Date('2027-01-01T00:30:00Z')), { month: 1, year: 2027 });
    }
  } finally {
    process.env.TZ = originalTimezone;
  }
});
