const { spawn } = require('node:child_process');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { frontendPort, frontendURL } = require('./frontend-config');

const root = path.join(__dirname, '..');
const playwright = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const browserArgs = [playwright, 'test', '--config', 'tests/browser/config.js', ...process.argv.slice(2)];

async function available() {
  try {
    const response = await fetch(frontendURL, { signal: AbortSignal.timeout(2000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

function launch(args, options = {}) {
  const child = spawn(process.execPath, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
  const launched = { child, error: null, closed: null };
  launched.closed = new Promise((resolve) => {
    child.once('error', (error) => {
      launched.error = error;
      resolve({ code: null, signal: null, error });
    });
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  return launched;
}

async function waitForServer(server) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.error) throw server.error;
    if (server.child.exitCode !== null || server.child.signalCode !== null) {
      const result = await server.closed;
      throw new Error(`Vite exited before it was ready (${result.code ?? result.signal}).`);
    }
    if (await available()) return;
    await delay(250);
  }
  throw new Error(`Vite did not become ready at ${frontendURL} within 120 seconds.`);
}

async function stopServer(server) {
  if (server.child.exitCode !== null || server.child.signalCode !== null) return;
  server.child.kill('SIGTERM');
  let timer;
  const result = await Promise.race([
    server.closed,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), 5000); }),
  ]).finally(() => clearTimeout(timer));
  if (!result) throw new Error('The test-owned Vite process did not close within 5 seconds.');
  if (await available()) throw new Error(`The test-owned Vite server still responds at ${frontendURL}.`);
}

async function main() {
  // Playwright's Windows webServer teardown uses taskkill on a shell/npm process
  // tree. Restricted Windows environments can deny that operation indefinitely.
  // Launch Vite directly and own its lifetime; Linux CI keeps Playwright's
  // existing webServer behavior.
  if (process.platform !== 'win32' || process.env.BROWSER_BASE_URL) {
    const runner = launch(browserArgs);
    const result = await runner.closed;
    if (result.error) throw result.error;
    process.exitCode = result.code ?? 1;
    return;
  }

  if (await available()) {
    if (process.env.CI) throw new Error(`${frontendURL} is already in use.`);
    const runner = launch(browserArgs, {
      env: { ...process.env, BROWSER_BASE_URL: frontendURL },
    });
    const result = await runner.closed;
    if (result.error) throw result.error;
    process.exitCode = result.code ?? 1;
    return;
  }

  const server = launch([vite, '--strictPort', '--port', String(frontendPort)], {
    cwd: path.join(root, 'apps', 'web'),
  });
  let runner;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    process.exitCode = 1;
    runner?.child.kill('SIGTERM');
    server.child.kill('SIGTERM');
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    await waitForServer(server);
    runner = launch(browserArgs, {
      env: { ...process.env, BROWSER_BASE_URL: frontendURL },
    });
    const result = await runner.closed;
    if (result.error) throw result.error;
    process.exitCode = interrupted ? 1 : (result.code ?? 1);
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(`[browser tests] ${error.message}`);
  process.exitCode = 1;
});
