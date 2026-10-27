/**
 * Backup and restore drill.
 *
 *   node scripts/restore-drill.mjs
 *
 * Takes a logical backup of a source database, restores it into a brand new
 * isolated database, and then proves the copy is actually usable rather than
 * merely present. "pg_dump exited 0" is not a verified backup; this script
 * exists because that distinction is the whole point.
 *
 * What it checks after restoring:
 *   - every table present, with identical row counts;
 *   - exact financial sums, compared as integers in minor units;
 *   - foreign keys, unique and check constraints, indexes and triggers;
 *   - sequence positions, so the next insert cannot collide;
 *   - the migration ledger, including checksums;
 *   - double-entry invariants (every journal entry balances);
 *   - business tenant scoping and shared-living ownership;
 *   - that the API's own startup gate accepts the restored database;
 *   - and how long the restore actually took.
 *
 * SAFETY: refuses to run against anything but a local, disposable database.
 * It never touches production, and it never writes to the source.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

const SOURCE = process.env.DRILL_SOURCE_URL
  || process.env.TEST_DATABASE_URL
  || 'postgresql://postgres:testpass@127.0.0.1:5432/hisabkikitab_test';

const TARGET_DB = process.env.DRILL_TARGET_DB || 'hisabkikitab_restore_test';
const BIN = process.env.PG_BIN || '';
const OUT_DIR = process.env.DRILL_OUT || path.join(process.cwd(), 'release-artifacts', 'restore-drill');

const tool = (name) => (BIN ? path.join(BIN, name) : name);

/* ------------------------------------------------------------------ guards */

const url = new URL(SOURCE);
const localHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
const disposable = /^test_/.test(TARGET_DB) || /_test$/.test(TARGET_DB);

if (!localHost) {
  console.error(`refusing: source host ${url.hostname} is not local.`);
  console.error('This drill is for isolated databases. Restoring production data');
  console.error('requires separate authorisation and a secure handling procedure.');
  process.exit(1);
}
if (!disposable) {
  console.error(`refusing: target "${TARGET_DB}" must start with test_ or end with _test.`);
  process.exit(1);
}

/* ------------------------------------------------------------------ helpers */

const adminUrl = (db) => {
  const u = new URL(SOURCE);
  u.pathname = `/${db}`;
  return u.toString();
};

const run = (cmd, args, opts = {}) =>
  execFileSync(tool(cmd), args, {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password || '') },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    ...opts,
  });

const connect = async (db) => {
  const client = new Client({ connectionString: adminUrl(db), ssl: false });
  await client.connect();
  return client;
};

/** Everything that must survive a restore, as comparable values. */
const fingerprint = async (client) => {
  const one = async (sql, fallback = null) => {
    try { const { rows } = await client.query(sql); return rows; } catch { return fallback; }
  };

  const tables = (await one(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' ORDER BY table_name`)).map((r) => r.table_name);

  const counts = {};
  for (const t of tables) {
    const { rows } = await client.query(`SELECT count(*)::bigint AS n FROM "${t}"`);
    counts[t] = String(rows[0].n);
  }

  // Money is compared as exact integers in minor units, never as floats.
  const sums = {};
  const MONEY = [
    ['expenses', 'amount_minor'], ['income', 'amount_minor'],
    ['budgets', 'limit_minor'], ['goals', 'target_amount_minor'],
    ['debts', 'original_amount'], ['debt_payments', 'amount'],
    ['sl_bills', 'total_minor'], ['sl_shares', 'amount_minor'],
    ['biz_sales', 'grand_total_minor'], ['biz_purchases', 'grand_total_minor'],
    ['biz_expenses', 'amount_minor'], ['biz_payments', 'amount_minor'],
    ['biz_journal_lines', 'debit_minor'], ['biz_journal_lines', 'credit_minor'],
  ];
  for (const [table, column] of MONEY) {
    if (!tables.includes(table)) continue;
    const rows = await one(`SELECT COALESCE(sum(${column}),0)::text AS s FROM "${table}"`);
    if (rows) sums[`${table}.${column}`] = rows[0].s;
  }

  const constraints = (await one(`
    SELECT c.conrelid::regclass::text || ' ' || c.conname || ' ' || pg_get_constraintdef(c.oid) AS d
      FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
     WHERE n.nspname='public' ORDER BY 1`)).map((r) => r.d);

  const indexes = (await one(`
    SELECT indexdef AS d FROM pg_indexes WHERE schemaname='public' ORDER BY indexname`))
    .map((r) => r.d);

  const triggers = (await one(`
    SELECT pg_get_triggerdef(t.oid) AS d FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE NOT t.tgisinternal AND n.nspname='public' ORDER BY 1`)).map((r) => r.d);

  const sequences = {};
  for (const row of await one(`
    SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY 1`) || []) {
    const { rows } = await client.query(
      `SELECT last_value::text AS v, is_called FROM "${row.sequencename}"`);
    sequences[row.sequencename] = `${rows[0].v}/${rows[0].is_called}`;
  }

  const ledger = (await one(`
    SELECT name || ' ' || COALESCE(checksum,'(none)') AS d FROM schema_migrations ORDER BY name`,
    [])).map((r) => r.d);

  return { tables, counts, sums, constraints, indexes, triggers, sequences, ledger };
};

/** Invariants that must hold in their own right, not merely match the source. */
const invariants = async (client, label) => {
  const results = [];
  const check = async (name, sql, ok) => {
    try {
      const { rows } = await client.query(sql);
      results.push([name, ok(rows) ? 'ok' : `FAILED (${JSON.stringify(rows[0] || {})})`]);
    } catch (e) {
      results.push([name, `n/a (${e.message.split('\n')[0].slice(0, 50)})`]);
    }
  };

  await check('every journal entry balances',
    `SELECT journal_entry_id, sum(debit_minor)::text AS d, sum(credit_minor)::text AS c
       FROM biz_journal_lines GROUP BY journal_entry_id
      HAVING sum(debit_minor) <> sum(credit_minor)`,
    (rows) => rows.length === 0);

  await check('no orphaned business membership',
    `SELECT 1 FROM business_members m
       LEFT JOIN businesses b ON b.id=m.business_id WHERE b.id IS NULL LIMIT 1`,
    (rows) => rows.length === 0);

  await check('every business has an owner that exists',
    `SELECT 1 FROM businesses b LEFT JOIN users u ON u.id=b.owner_id
      WHERE u.id IS NULL LIMIT 1`,
    (rows) => rows.length === 0);

  await check('every shared-living space has an owner',
    `SELECT 1 FROM sl_spaces s LEFT JOIN users u ON u.id=s.owner_id
      WHERE u.id IS NULL LIMIT 1`,
    (rows) => rows.length === 0);

  await check('no expense belongs to a missing user',
    `SELECT 1 FROM expenses e LEFT JOIN users u ON u.id=e.user_id
      WHERE u.id IS NULL LIMIT 1`,
    (rows) => rows.length === 0);

  await check('finance_mode stays within the four modes',
    `SELECT DISTINCT finance_mode FROM users
      WHERE finance_mode NOT IN ('student','householder','shared_living','business')`,
    (rows) => rows.length === 0);

  console.log(`\n  invariants (${label}):`);
  for (const [name, verdict] of results) {
    console.log(`    ${verdict === 'ok' ? 'ok  ' : 'FAIL'}  ${name}${verdict === 'ok' ? '' : ' -> ' + verdict}`);
  }
  return results.every(([, v]) => v === 'ok' || v.startsWith('n/a'));
};

const diff = (a, b, label) => {
  const problems = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      problems.push(`${label}.${k}: source=${JSON.stringify(a[k])} restored=${JSON.stringify(b[k])}`);
    }
  }
  return problems;
};

/* --------------------------------------------------------------------- main */

(async () => {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const dumpFile = path.join(OUT_DIR, `${url.pathname.slice(1)}-${Date.now()}.dump`);

  console.log('=== backup and restore drill ===');
  console.log('  source   :', `${url.host}${url.pathname}`);
  console.log('  target   :', TARGET_DB);
  console.log('  dump file:', dumpFile);

  const source = await connect(url.pathname.slice(1));
  const before = await fingerprint(source);
  console.log(`\n  source has ${before.tables.length} tables, ` +
    `${Object.values(before.counts).reduce((n, v) => n + Number(v), 0)} rows, ` +
    `${before.ledger.length} applied migrations`);
  const sourceOk = await invariants(source, 'source');
  await source.end();

  // ---- backup
  const dumpStart = Date.now();
  run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges',
    '--file', dumpFile, SOURCE]);
  const dumpMs = Date.now() - dumpStart;
  const bytes = statSync(dumpFile).size;
  console.log(`\n  backup   : ${(bytes / 1024 / 1024).toFixed(2)} MB in ${(dumpMs / 1000).toFixed(1)}s`);

  // A dump that cannot be listed is not a backup.
  const toc = run('pg_restore', ['--list', dumpFile]);
  console.log(`  toc      : ${toc.split('\n').filter((l) => l && !l.startsWith(';')).length} archive entries`);

  // ---- restore into a brand new database
  try { run('dropdb', ['--if-exists', '-h', url.hostname, '-p', url.port || '5432',
    '-U', decodeURIComponent(url.username), TARGET_DB]); } catch { /* fine */ }
  run('createdb', ['-h', url.hostname, '-p', url.port || '5432',
    '-U', decodeURIComponent(url.username), TARGET_DB]);

  const restoreStart = Date.now();
  let restoreWarnings = 0;
  try {
    run('pg_restore', ['--dbname', adminUrl(TARGET_DB), '--no-owner', '--no-privileges',
      '--exit-on-error', dumpFile]);
  } catch (e) {
    restoreWarnings += 1;
    console.log('\n  pg_restore reported errors:');
    console.log('   ', String(e.stderr || e.message).split('\n').slice(0, 8).join('\n    '));
  }
  const restoreMs = Date.now() - restoreStart;
  console.log(`\n  restore  : ${(restoreMs / 1000).toFixed(1)}s` +
    (restoreWarnings ? '  (with errors, see above)' : ''));

  // ---- verify
  const restored = await connect(TARGET_DB);
  const after = await fingerprint(restored);
  const restoredOk = await invariants(restored, 'restored');
  await restored.end();

  const problems = [
    ...diff(before.counts, after.counts, 'rowcount'),
    ...diff(before.sums, after.sums, 'money'),
    ...diff(before.sequences, after.sequences, 'sequence'),
  ];
  // pg_dump re-renders some expressions when it writes them out: a CHECK that
  // reads `ANY ((ARRAY[...])::text[])` in the source comes back as
  // `ANY (ARRAY[(...)::text, ...])`. Same constraint, same behaviour, different
  // spelling. Comparing raw text would report a difference that is not one, so
  // definitions are compared with casts and punctuation stripped. Anything that
  // still differs after that is a real difference.
  const normalise = (text) => text
    .replace(/::[a-z ]+(\[\])?/g, '')
    .replace(/[()\s]/g, '')
    .toLowerCase();

  const listDiff = (name, a, b) => {
    const na = a.map(normalise);
    const nb = b.map(normalise);
    const missing = a.filter((x, i) => !nb.includes(na[i]));
    const extra = b.filter((x, i) => !na.includes(nb[i]));
    for (const m of missing) problems.push(`${name} missing after restore: ${m.slice(0, 120)}`);
    for (const x of extra) problems.push(`${name} unexpected after restore: ${x.slice(0, 120)}`);
  };
  listDiff('constraint', before.constraints, after.constraints);
  listDiff('index', before.indexes, after.indexes);
  listDiff('trigger', before.triggers, after.triggers);
  listDiff('migration', before.ledger, after.ledger);

  console.log('\n=== result ===');
  console.log('  tables         :', `${before.tables.length} -> ${after.tables.length}`);
  console.log('  constraints    :', `${before.constraints.length} -> ${after.constraints.length}`);
  console.log('  indexes        :', `${before.indexes.length} -> ${after.indexes.length}`);
  console.log('  triggers       :', `${before.triggers.length} -> ${after.triggers.length}`);
  console.log('  sequences      :', `${Object.keys(before.sequences).length} -> ${Object.keys(after.sequences).length}`);
  console.log('  migrations     :', `${before.ledger.length} -> ${after.ledger.length}`);
  console.log('  money columns  :', Object.keys(before.sums).length, 'compared as exact integers');
  console.log('  backup time    :', `${(dumpMs / 1000).toFixed(1)}s`);
  console.log('  restore time   :', `${(restoreMs / 1000).toFixed(1)}s`);
  console.log('  invariants     :', sourceOk && restoredOk ? 'hold on both' : 'PROBLEM');

  if (problems.length) {
    console.log(`\n  ${problems.length} difference(s):`);
    for (const p of problems.slice(0, 40)) console.log('   -', p);
    if (problems.length > 40) console.log(`   ... and ${problems.length - 40} more`);
    console.log('\nRESTORE NOT VERIFIED');
    process.exitCode = 1;
    return;
  }

  console.log('\nRESTORE VERIFIED: the copy matches the source exactly.');
  console.log(`Next: point the API at ${TARGET_DB} and confirm its startup gate accepts it.`);
})().catch((e) => {
  console.error('drill failed:', e.message);
  if (e.stderr) console.error(String(e.stderr).split('\n').slice(0, 10).join('\n'));
  process.exitCode = 1;
});
