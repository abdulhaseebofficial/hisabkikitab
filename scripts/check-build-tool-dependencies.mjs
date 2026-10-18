import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lock = require('../package-lock.json');
const concurrently = lock.packages?.['node_modules/concurrently'];
const shellQuote = lock.packages?.['node_modules/shell-quote'];

if (concurrently?.version !== '9.2.5' ||
    concurrently.dependencies?.['shell-quote'] !== '1.12.0' ||
    shellQuote?.version !== '1.12.0') {
  console.error('Build-tool lockfile is not pinned to the reviewed patched concurrently/shell-quote pair.');
  process.exitCode = 1;
} else {
  const actualConcurrently = require('concurrently/package.json').version;
  const actualShellQuote = require('shell-quote/package.json').version;
  if (actualConcurrently !== concurrently.version || actualShellQuote !== shellQuote.version) {
    console.error('Installed build-tool versions differ from the reviewed lockfile.');
    process.exitCode = 1;
  } else {
    console.log(`Verified concurrently ${actualConcurrently} -> shell-quote ${actualShellQuote}.`);
  }
}
