/**
 * Scheduling adapter.
 *
 * The two background jobs are plain async functions that can be called from
 * anywhere - a cron tick, an HTTP handler, a test - and are safe to call twice.
 * That matters because in-process cron only fires while a process is alive,
 * which a serverless deployment cannot promise. The same handlers are reachable
 * over HTTP so an external scheduler can drive them punctually.
 *
 * Nothing here knows about Express, and registering the timers is opt-in, so
 * importing this module has no side effect.
 */

const cron = require('node-cron');

const { materializeAll } = require('./recurringExpenses.job');
const { runAlertSweep } = require('./alerts.job');

/** Materialise recurring expenses that have fallen due, for every student. */
const runRecurringExpenses = async () => {
  const created = await materializeAll({ strict: true });
  return { created };
};

/** Refresh alerts (overspending, goal deadlines, bills due) for every student. */
const runAlerts = async () => runAlertSweep();

/**
 * Registers the in-process timers.
 *
 * Only useful in a long-running process (`npm start`, local dev). On a platform
 * that freezes idle instances these will not fire reliably - the handlers above
 * are the supported path there. Both jobs also run on demand when a student
 * opens the app, so a missed tick never means wrong data, only late data.
 */
const startCronJobs = () => {
  cron.schedule('5 0 * * *', async () => {
    try {
      await runRecurringExpenses();
    } catch (err) {
      console.error('[cron] recurring expenses failed:', err.message);
    }
  });

  cron.schedule('0 9 * * *', async () => {
    try {
      const { users } = await runAlerts();
      console.log(`[cron] alert check finished for ${users} user(s)`);
    } catch (err) {
      console.error('[cron] alert check failed:', err.message);
    }
  });

  console.log('[cron] scheduled jobs registered');
};

module.exports = { runRecurringExpenses, runAlerts, startCronJobs };
