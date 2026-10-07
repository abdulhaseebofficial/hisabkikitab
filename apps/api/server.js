/**
 * Runtime entry point.
 *
 * Two jobs, and only these two: start listening when this file is run directly,
 * and export the app for a platform that imports it instead. Everything about
 * how the application is put together lives in src/app.js.
 *
 * `require('dotenv')` stays first because every module below reads process.env
 * at require time.
 */

require('dotenv').config();

const createApp = require('./src/app');
const advisor = require('./src/modules/advisor/advisor.service');
const { closePool } = require('./src/infrastructure/database/pool');
const { startCronJobs } = require('./src/infrastructure/scheduling');

const PORT = process.env.PORT || 5000;

const app = createApp();

let server;

const start = async () => {
  try {
    await app.bootstrap(); // validates the environment, then opens the connection

    server = app.listen(PORT, () => {
      console.log('');
      console.log('  Hisabki Kitab API');
      console.log(`  listening on   http://localhost:${PORT}`);
      console.log(`  environment    ${process.env.NODE_ENV || 'development'}`);
      console.log(
        `  ai advisor     ${
          advisor.isConfigured()
            ? `${advisor.providerName()} - ${advisor.modelChain().join(' -> ')}`
            : `fallback rules (${advisor.SETUP_HINT})`
        }`
      );
      console.log('');
    });

    if (process.env.NODE_ENV !== 'test') startCronJobs();
  } catch (err) {
    console.error('[startup] failed:', err.message);
    process.exit(1);
  }
};

/** Close the HTTP server before exiting so in-flight requests finish. */
const shutdown = (signal) => {
  console.log(`\n[shutdown] ${signal} received, closing server`);
  if (!server) process.exit(0);
  server.close(() => {
    closePool().finally(() => process.exit(0));
  });
  // Do not hang forever if a socket refuses to close.
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason);
});

// `npm start` runs this file directly and listens on a port. Vercel instead
// imports it and looks for the Express app as the module's default export.
if (require.main === module) start();

module.exports = app;
module.exports.start = start;
