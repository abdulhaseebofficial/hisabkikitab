/**
 * Production-Like Migration Rehearsal (0022 -> 0028)
 * Simulates a realistic upgrade from Supabase production baseline (0021) to V3 (0028).
 * Executes in an isolated schema on Neon Staging PostgreSQL with pre-populated 0001-0021 data.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', 'apps', 'api', '.env') });

const rawUrl = process.env.DATABASE_URL || '';
const url = rawUrl.replace('-pooler', '');

if (!url) {
  console.error('[Rehearsal Fatal] DATABASE_URL not found in environment');
  process.exit(1);
}

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const SCHEMA = `rehearsal_prod_upgrade_${Date.now()}`;

async function runRehearsal() {
  console.log(`================================================================================`);
  console.log(`[Migration Rehearsal] Connecting to Neon Staging PostgreSQL...`);
  console.log(`[Migration Rehearsal] Target Isolated Schema: ${SCHEMA}`);
  console.log(`================================================================================\n`);

  await client.connect();

  try {
    await client.query(`SET statement_timeout = '120000'`);
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${SCHEMA}`);
    await client.query(`SET search_path TO ${SCHEMA}`);

    // Create migration ledger
    await client.query(`
      CREATE TABLE schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');

    // -------------------------------------------------------------------------
    // Step 1: Establish 0001-0021 Baseline (Current Supabase Production State)
    // -------------------------------------------------------------------------
    console.log(`>>> Phase 1: Applying Baseline Migrations 0001 through 0021...`);
    const baselineStart = Date.now();
    for (let i = 1; i <= 21; i++) {
      const numStr = String(i).padStart(4, '0');
      const file = fs.readdirSync(MIGRATIONS_DIR).find((f) => f.startsWith(numStr));
      if (!file) throw new Error(`Missing migration ${numStr}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
    }
    console.log(`✔ Baseline 0001-0021 established in ${Date.now() - baselineStart}ms\n`);

    // -------------------------------------------------------------------------
    // Step 2: Seed Realistic Production Baseline Data (V1 & V2 Data)
    // -------------------------------------------------------------------------
    console.log(`>>> Phase 2: Populating Realistic V1/V2 Baseline Data in 0021 state...`);
    const studentUser = await client.query(`
      INSERT INTO users (name, email, password, finance_mode)
      VALUES ('Ahmed Ali', 'ahmed.student@example.com', '$2b$10$MockHashPass12345678901234567890', 'student')
      RETURNING id, finance_mode;
    `);

    const houseUser = await client.query(`
      INSERT INTO users (name, email, password, finance_mode)
      VALUES ('Fatima Khan', 'fatima.household@example.com', '$2b$10$MockHashPass12345678901234567890', 'householder')
      RETURNING id, finance_mode;
    `);

    const sharedUser = await client.query(`
      INSERT INTO users (name, email, password, finance_mode)
      VALUES ('Zubair Tariq', 'zubair.shared@example.com', '$2b$10$MockHashPass12345678901234567890', 'shared_living')
      RETURNING id, finance_mode;
    `);

    // Insert sample debt
    await client.query(`
      INSERT INTO debts (user_id, person_name, kind, original_amount)
      VALUES ($1, 'Hamza Grocery', 'BORROWED', 2500.00);
    `, [studentUser.rows[0].id]);

    console.log(`✔ Successfully seeded baseline records:`);
    console.log(`  - Student User ID: ${studentUser.rows[0].id} (mode: ${studentUser.rows[0].finance_mode})`);
    console.log(`  - Householder User ID: ${houseUser.rows[0].id} (mode: ${houseUser.rows[0].finance_mode})`);
    console.log(`  - Shared Living User ID: ${sharedUser.rows[0].id} (mode: ${sharedUser.rows[0].finance_mode})\n`);

    // -------------------------------------------------------------------------
    // Step 3: Sequential Upgrade Rehearsal (0022 -> 0028)
    // -------------------------------------------------------------------------
    console.log(`>>> Phase 3: Executing Sequential Upgrade Rehearsal (0022 -> 0028)...`);
    const upgradeTimings = [];

    const upgradeMigrations = [
      '0022_read_only_demo.sql',
      '0023_business_mode.sql',
      '0024_business_mode_v2.sql',
      '0025_business_security_and_fourth_mode.sql',
      '0026_v3_advanced_procurement.sql',
      '0027_v3_recurring_business_expenses.sql',
      '0028_v3_offline_pos_sync.sql',
    ];

    for (const migFile of upgradeMigrations) {
      const filePath = path.join(MIGRATIONS_DIR, migFile);
      const sql = fs.readFileSync(filePath, 'utf8');

      const start = Date.now();
      await client.query(sql);
      const elapsed = Date.now() - start;

      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [migFile]);
      upgradeTimings.push({ file: migFile, elapsedMs: elapsed });
      console.log(`  ✔ Migrated ${migFile.padEnd(46)} Execution Time: ${elapsed}ms`);
    }

    // -------------------------------------------------------------------------
    // Step 4: Verification of Data Integrity & Upgraded System Capabilities
    // -------------------------------------------------------------------------
    console.log(`\n>>> Phase 4: Verifying Upgraded Schema Invariants & Legacy Compatibility...`);

    // 1. Existing baseline users still queryable and untouched
    const checkBaseline = await client.query(`SELECT id, email, finance_mode FROM users ORDER BY created_at ASC`);
    console.log(`  ✔ Existing users queryable: ${checkBaseline.rows.length} baseline users verified intact.`);
    if (checkBaseline.rows.length !== 3) throw new Error('Baseline users lost or corrupted');

    // 2. Fourth Mode Constraint Verification
    const bizUser = await client.query(`
      INSERT INTO users (name, email, password, finance_mode)
      VALUES ('Karobar Owner', 'owner.biz@example.com', '$2b$10$MockHashPass12345678901234567890', 'business')
      RETURNING id, finance_mode;
    `);
    console.log(`  ✔ New fourth operational mode accepted: Business User ID ${bizUser.rows[0].id}`);

    // 3. Demo Protection Trigger Verification
    let demoBlocked = false;
    try {
      const demoUser = await client.query(`
        INSERT INTO users (name, email, password, finance_mode, is_demo)
        VALUES ('Demo User', 'demo.guest@example.com', '$2b$10$MockHashPass12345678901234567890', 'business', true)
        RETURNING id;
      `);
      await client.query(`
        INSERT INTO businesses (owner_id, name) VALUES ($1, 'Illegal Demo Store');
      `, [demoUser.rows[0].id]);
    } catch (err) {
      if (err.code === '42501') demoBlocked = true;
    }
    console.log(`  ✔ Demo account write protection trigger active (SQLSTATE 42501): ${demoBlocked}`);
    if (!demoBlocked) throw new Error('Demo protection trigger failed to reject write');

    // 4. Ledger Completeness Check
    const ledger = await client.query(`SELECT count(*)::int AS count FROM schema_migrations`);
    console.log(`  ✔ Total recorded migrations in ledger: ${ledger.rows[0].count} / 28`);
    if (ledger.rows[0].count !== 28) throw new Error('Incomplete migration ledger');

    // 5. Total Rehearsal Upgrade Duration
    const totalUpgradeMs = upgradeTimings.reduce((sum, t) => sum + t.elapsedMs, 0);
    console.log(`\n================================================================================`);
    console.log(`[Migration Rehearsal Success] Total 0022->0028 Upgrade Duration: ${totalUpgradeMs}ms (${(totalUpgradeMs / 1000).toFixed(2)}s)`);
    console.log(`================================================================================`);

    // Clean up temporary schema
    await client.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
    console.log(`[Migration Rehearsal] Cleaned up temporary schema ${SCHEMA} cleanly.\n`);

    return { success: true, timings: upgradeTimings, totalUpgradeMs };
  } catch (err) {
    console.error(`[Migration Rehearsal Failed]:`, err);
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    } catch {}
    throw err;
  } finally {
    await client.end();
  }
}

runRehearsal()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
