/**
 * Rate limiting: what it allows, what it refuses, and how it behaves when the
 * counter itself is unavailable.
 *
 * The last one is the part worth writing down. A limiter whose store is down
 * has to answer one way or the other, and the right answer depends on what is
 * behind it. Failing open on a login endpoint means "the counter is broken" and
 * "there is no counter" look identical to somebody guessing passwords; failing
 * closed on every read means a database blip takes the whole API down. So the
 * sensitive endpoints refuse and the rest carry on, and both are asserted here.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const API = path.join(__dirname, '..', '..', 'apps', 'api');
const { createMemoryStore } = require(path.join(API, 'src/infrastructure/rateLimit/stores'));

// NODE_ENV=test makes every limiter a pass-through, which is right for the
// suites and wrong for testing the limiter itself. The check happens when the
// middleware runs, not when it is required, so `run` below is where the
// environment has to be pinned - otherwise these tests pass or fail depending
// on whether the shell that started them had NODE_ENV=test exported for the
// database suites.
const rateLimiter = require(path.join(API, 'src/shared/middleware/rateLimiter'));

const { limiter, keyFor, setStore } = rateLimiter;

/** A minimal req/res pair, enough for the middleware and nothing more. */
const exchange = (req = {}) => {
  const headers = {};
  const res = {
    statusCode: null,
    body: null,
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return { req: { ip: '203.0.113.9', ...req }, res, headers };
};

/**
 * Runs the middleware once and reports whether it called next().
 *
 * `nodeEnv` is explicit because the limiter consults it on every call: the
 * default pins it away from "test" so limiting is actually exercised, and the
 * pass-through test asks for "test" by name.
 */
const run = async (middleware, context, nodeEnv = 'development') => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  let passed = false;
  try {
    await middleware(context.req, context.res, () => {
      passed = true;
    });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
  return passed;
};

/* ------------------------------ the counting ------------------------------ */

test('requests inside the limit are allowed through', async () => {
  const restore = setStore(createMemoryStore());
  try {
    const middleware = limiter({ scope: 'test-allow', windowMs: 60000, max: 3, text: 'no' });

    for (let i = 0; i < 3; i += 1) {
      const context = exchange();
      assert.strictEqual(await run(middleware, context), true, `request ${i + 1} should pass`);
    }
  } finally {
    restore();
  }
});

test('the one past the limit is refused with 429', async () => {
  const restore = setStore(createMemoryStore());
  try {
    const middleware = limiter({ scope: 'test-block', windowMs: 60000, max: 2, text: 'slow down' });

    await run(middleware, exchange());
    await run(middleware, exchange());

    const context = exchange();
    assert.strictEqual(await run(middleware, context), false, 'the third should not pass');
    assert.strictEqual(context.res.statusCode, 429);
    assert.strictEqual(context.res.body.message, 'slow down');
    assert.ok(context.headers['Retry-After'], 'a refused caller should be told when to come back');
  } finally {
    restore();
  }
});

test('the caller is told what the limit is and what is left', async () => {
  const restore = setStore(createMemoryStore());
  try {
    const middleware = limiter({ scope: 'test-headers', windowMs: 60000, max: 5, text: 'no' });
    const context = exchange();
    await run(middleware, context);

    assert.strictEqual(context.headers['RateLimit-Limit'], '5');
    assert.strictEqual(context.headers['RateLimit-Remaining'], '4');
    assert.ok(Number(context.headers['RateLimit-Reset']) > 0);
  } finally {
    restore();
  }
});

test('two different subjects do not share a budget', async () => {
  // One person behind a shared university NAT must not be limited by their
  // neighbours, which is why an account id beats an address as the subject.
  const restore = setStore(createMemoryStore());
  try {
    const middleware = limiter({ scope: 'test-subjects', windowMs: 60000, max: 1, text: 'no' });

    assert.strictEqual(await run(middleware, exchange({ user: { _id: 'a' } })), true);
    assert.strictEqual(await run(middleware, exchange({ user: { _id: 'b' } })), true);
    assert.strictEqual(await run(middleware, exchange({ user: { _id: 'a' } })), false);
  } finally {
    restore();
  }
});

test('two different limits do not share a budget either', async () => {
  const restore = setStore(createMemoryStore());
  try {
    const one = limiter({ scope: 'scope-one', windowMs: 60000, max: 1, text: 'no' });
    const two = limiter({ scope: 'scope-two', windowMs: 60000, max: 1, text: 'no' });

    assert.strictEqual(await run(one, exchange()), true);
    assert.strictEqual(await run(two, exchange()), true, 'spending one budget must not spend the other');
  } finally {
    restore();
  }
});

/* ------------------------------ the window -------------------------------- */

test('the budget comes back when the window ends', async () => {
  const restore = setStore(createMemoryStore());
  try {
    // A window measured in milliseconds, so the test does not have to wait.
    const middleware = limiter({ scope: 'test-window', windowMs: 30, max: 1, text: 'no' });

    assert.strictEqual(await run(middleware, exchange()), true);
    assert.strictEqual(await run(middleware, exchange()), false, 'still inside the window');

    await new Promise((resolve) => setTimeout(resolve, 45));

    assert.strictEqual(await run(middleware, exchange()), true, 'the window should have reset');
  } finally {
    restore();
  }
});

/* --------------------------- what the store sees -------------------------- */

test('the subject is hashed, never stored in the clear', async () => {
  // The table should be able to say how often somebody called an endpoint
  // without being able to say who they were.
  const key = keyFor('auth', { ip: '198.51.100.7' });

  assert.match(key, /^[0-9a-f]{64}$/, 'the key should be a sha256 digest');
  assert.ok(!key.includes('198.51.100.7'));
});

test('an account id is preferred over the address it came from', () => {
  const byUser = keyFor('auth', { ip: '198.51.100.7', user: { _id: 'user-1' } });
  const byIp = keyFor('auth', { ip: '198.51.100.7' });

  assert.notStrictEqual(byUser, byIp);
  assert.ok(!byUser.includes('user-1'));
});

/* --------------------------- when the store fails ------------------------- */

/** A store that always throws, standing in for the counter being unreachable. */
const brokenStore = () => ({
  name: 'broken',
  async hit() {
    throw new Error('connection refused');
  },
  async reset() {},
});

test('a sensitive endpoint refuses when the counter is unavailable', async () => {
  // "The limiter is broken" and "there is no limiter" must not look the same
  // to somebody brute-forcing a password.
  const restore = setStore(brokenStore());
  try {
    const middleware = limiter({
      scope: 'test-sensitive',
      windowMs: 60000,
      max: 5,
      text: 'no',
      failClosed: true,
    });

    const context = exchange();
    assert.strictEqual(await run(middleware, context), false);
    assert.strictEqual(context.res.statusCode, 503);
  } finally {
    restore();
  }
});

test('an ordinary endpoint carries on when the counter is unavailable', async () => {
  // A database blip should not take the whole API down, and the exposure from
  // a few unmetered reads is not comparable.
  const restore = setStore(brokenStore());
  try {
    const middleware = limiter({ scope: 'test-ordinary', windowMs: 60000, max: 5, text: 'no' });
    assert.strictEqual(await run(middleware, exchange()), true);
  } finally {
    restore();
  }
});

test('a store failure does not put the subject in the log', async () => {
  const restore = setStore(brokenStore());
  const lines = [];
  const realError = console.error;
  console.error = (...args) => lines.push(args.join(' '));

  try {
    const middleware = limiter({ scope: 'test-logging', windowMs: 60000, max: 5, text: 'no' });
    await run(middleware, exchange({ ip: '198.51.100.7', user: { _id: 'user-1' } }));

    assert.ok(lines.length > 0, 'a store failure should be reported somewhere');
    const logged = lines.join('\n');
    assert.ok(!logged.includes('198.51.100.7'), 'the address must not be logged');
    assert.ok(!logged.includes('user-1'), 'the account id must not be logged');
  } finally {
    console.error = realError;
    restore();
  }
});

/* ------------------------------ configuration ----------------------------- */

test('the suites are not rate limited', async () => {
  // Hundreds of calls per run; a limit there fails runs rather than finding
  // bugs. Production is unaffected because NODE_ENV is never "test" there.
  const restore = setStore(brokenStore());

  try {
    const middleware = limiter({
      scope: 'test-skip',
      windowMs: 60000,
      max: 0,
      text: 'no',
      failClosed: true,
    });
    assert.strictEqual(await run(middleware, exchange(), 'test'), true);
  } finally {
    restore();
  }
});

test('an unusable store setting is refused at startup rather than ignored', () => {
  const previous = process.env.RATE_LIMIT_STORE;
  process.env.RATE_LIMIT_STORE = 'redis-that-is-not-configured';

  try {
    // Reached through a fresh require so the module picks the setting up.
    delete require.cache[require.resolve(path.join(API, 'src/shared/middleware/rateLimiter'))];
    const fresh = require(path.join(API, 'src/shared/middleware/rateLimiter'));
    assert.throws(() => fresh.getStore(), /RATE_LIMIT_STORE/);
  } finally {
    process.env.RATE_LIMIT_STORE = previous;
    delete require.cache[require.resolve(path.join(API, 'src/shared/middleware/rateLimiter'))];
  }
});

/* -------------------------- the memory store itself ----------------------- */

test('the memory store counts and expires a window', async () => {
  const store = createMemoryStore();

  const first = await store.hit('k', 30);
  assert.strictEqual(first.count, 1);

  const second = await store.hit('k', 30);
  assert.strictEqual(second.count, 2);
  assert.strictEqual(second.resetAt.getTime(), first.resetAt.getTime(), 'the window should not move');

  await new Promise((resolve) => setTimeout(resolve, 45));

  const afterExpiry = await store.hit('k', 30);
  assert.strictEqual(afterExpiry.count, 1, 'an expired window should start again');
});

test('resetting a subject forgets it', async () => {
  const store = createMemoryStore();
  await store.hit('k', 60000);
  await store.reset('k');
  assert.strictEqual((await store.hit('k', 60000)).count, 1);
});
