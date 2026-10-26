/**
 * The build toolchain must resolve a patched shell-quote.
 *
 * `concurrently` reaches shell-quote, and shell-quote below 1.12.0 carries the
 * command-injection advisory this gate exists to keep out of the toolchain.
 * The check is that the lockfile resolves a patched shell-quote and that the
 * installed tree matches the lockfile - not that `concurrently` is frozen at
 * one version. It used to assert `concurrently === '9.2.5'` exactly, which made
 * any upgrade of an unrelated dev tool fail the release gate even when the
 * patched shell-quote was still in place.
 *
 * MINIMUM_SHELL_QUOTE is the security fact. Raise it when a later advisory
 * says so; do not relax it.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lock = require('../package-lock.json');

const MINIMUM_SHELL_QUOTE = '1.12.0';

/** Numeric semver compare, enough for the x.y.z versions npm records here. */
const atLeast = (version, minimum) => {
  if (typeof version !== 'string') return false;
  const parse = (value) => value.split('-')[0].split('.').map((part) => Number(part) || 0);
  const [a, b] = [parse(version), parse(minimum)];
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
};

const concurrently = lock.packages?.['node_modules/concurrently'];
const shellQuote = lock.packages?.['node_modules/shell-quote'];

const problems = [];
if (!concurrently?.version) problems.push('concurrently is not in the lockfile');
if (!shellQuote?.version) problems.push('shell-quote is not in the lockfile');
if (shellQuote?.version && !atLeast(shellQuote.version, MINIMUM_SHELL_QUOTE)) {
  problems.push(`lockfile resolves shell-quote ${shellQuote.version}, below the patched ${MINIMUM_SHELL_QUOTE}`);
}

// A nested copy would be reached by concurrently in preference to the hoisted
// one, so an unpatched nested resolution has to fail too.
const nested = Object.entries(lock.packages || {})
  .filter(([path]) => path.endsWith('/node_modules/shell-quote'))
  .filter(([, entry]) => !atLeast(entry.version, MINIMUM_SHELL_QUOTE));
for (const [path, entry] of nested) {
  problems.push(`${path} resolves shell-quote ${entry.version}, below the patched ${MINIMUM_SHELL_QUOTE}`);
}

if (problems.length) {
  console.error('Build-tool dependency gate failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  // The installed tree has to be the tree the lockfile describes, or the
  // lockfile check above proves nothing about what actually runs.
  const installedConcurrently = require('concurrently/package.json').version;
  const installedShellQuote = require('shell-quote/package.json').version;
  if (installedConcurrently !== concurrently.version || installedShellQuote !== shellQuote.version) {
    console.error('Installed build-tool versions differ from the lockfile:');
    console.error(`- concurrently installed ${installedConcurrently}, lockfile ${concurrently.version}`);
    console.error(`- shell-quote installed ${installedShellQuote}, lockfile ${shellQuote.version}`);
    process.exitCode = 1;
  } else {
    console.log(`Verified concurrently ${installedConcurrently} -> shell-quote ${installedShellQuote} (patched floor ${MINIMUM_SHELL_QUOTE}).`);
  }
}
