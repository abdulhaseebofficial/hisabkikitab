const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('one daily production cron reaches the existing protected backend route', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../../vercel.json'), 'utf8'));
  assert.deepEqual(config.crons, [{ path: '/api/internal/recurring', schedule: '5 0 * * *' }]);
  assert.equal(config.rewrites.find(({ source }) => source === '/api(/.*)?')?.destination?.service,
    'backend');
  assert.equal(JSON.stringify(config).includes('CRON_SECRET'), false);
});
