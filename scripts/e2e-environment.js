// Reuses documented npm commands against a fresh schema, without changing .env.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..');
const state = path.join(root, '.env.e2e.local');
const action = process.argv[2];
const apiHealth = 'http://127.0.0.1:5000/api/health';
const npm = (args) => new Promise((resolve, reject) => {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true })
    : spawn('npm', args, { cwd: root, env: process.env, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} exited ${code}`)));
});

const startApi = async () => {
  const child = spawn(process.execPath, [path.join(root, 'apps', 'api', 'server.js')], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  let startupError;
  child.once('error', (error) => { startupError = error; });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw new Error(`isolated API exited ${child.exitCode} before becoming ready`);
    try {
      const response = await fetch(apiHealth, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return child;
    } catch (_) {
      // Startup commonly takes a few attempts while the database connection opens.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill();
  throw new Error(`isolated API did not become ready at ${apiHealth}`);
};

const stopApi = async (child) => {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 5_000);
  });
};
async function main() {
  if (!['setup', 'dev', 'check', 'e2e', 'cleanup'].includes(action)) throw new Error('Use setup, dev, check, e2e or cleanup');
  // Keep the E2E environment out of unit tests that exercise production and
  // development security settings, and out of the production build.
  // These are the same commands as CI/check.
  if (action === 'check') {
    for (const command of ['check:boundaries', 'check:shadowing', 'check:dead', 'test:unit', 'test:web', 'build']) {
      await npm(['run', command]);
    }
  }
  require('dotenv').config({ path: path.join(root, 'apps/api/.env'), quiet: true });
  if (action === 'setup' && !fs.existsSync(state)) {
    const schema = `hw_e2e_${crypto.randomBytes(8).toString('hex')}`;
    const { migrationUrl } = require('../apps/api/src/infrastructure/database/databaseUrl');
    process.env.DATABASE_URL = migrationUrl();
    const db = require('../apps/api/src/infrastructure/database/pool');
    try { await db.query(`CREATE SCHEMA ${schema}`); } finally { await db.closePool(); }
    fs.writeFileSync(state, `HW_E2E_SCHEMA=${schema}\n`);
  }
  require('dotenv').config({ path: state, override: true, quiet: true });
  require('./e2e-preload');
  const db = require('../apps/api/src/infrastructure/database/pool');
  try {
    const row = await db.queryOne('SELECT current_schema() AS name');
    if (row.name !== process.env.HW_E2E_SCHEMA) throw new Error('Database did not honor isolated search_path; refusing to continue');
    console.log(`[e2e] isolated schema: ${row.name}`);
    if (action === 'cleanup') {
      await db.query(`DROP SCHEMA ${process.env.HW_E2E_SCHEMA} CASCADE`);
      fs.unlinkSync(state);
    }
  } finally { await db.closePool(); }
  if (action === 'cleanup') return;
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --require "${path.join(__dirname, 'e2e-preload.js').replace(/\\/g, '/')}"`.trim();
  if (action === 'setup') { await npm(['run', 'migrate']); await npm(['run', 'seed']); }
  else if (action === 'check') {
    for (const command of ['test:migrations', 'test:db']) {
      await npm(['run', command]);
    }
    const api = await startApi();
    try { await npm(['run', 'test:e2e']); } finally { await stopApi(api); }
  } else await npm(['run', { dev: 'dev', e2e: 'test:e2e' }[action]]);
}
main().catch((error) => { console.error('[e2e]', error.code || '', error.message, ...(error.errors || []).map((item) => item.message)); process.exitCode = 1; });
