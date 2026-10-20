/**
 * Production Database Read-Only Preflight Verification Script.
 * Strictly executes READ-ONLY queries against Supabase production.
 * Never logs credentials or connection strings.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.production.local' });
const { migrationUrl } = require(path.join(__dirname, '..', 'apps', 'api', 'src', 'infrastructure', 'database', 'databaseUrl'));

const rawUrl = migrationUrl();
if (!rawUrl) {
  console.error('[FATAL] No production connection string available in .env.production.local');
  process.exit(1);
}

// Strip query parameters so pg does not override the pinned CA with system trust store
const cleanUrl = rawUrl.replace(/\?.*$/, '');
const caPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'infrastructure', 'database', 'supabase-ca.crt');
const ca = fs.readFileSync(caPath, 'utf8');

const client = new Client({
  connectionString: cleanUrl,
  ssl: { ca, rejectUnauthorized: true }
});

async function runPreflight() {
  console.log('================================================================');
  console.log('HISABKI KITAB V3 — SUPABASE PRODUCTION READ-ONLY PREFLIGHT');
  console.log('================================================================');

  try {
    await client.connect();

    // 1. Connection & Server Identity
    const idRes = await client.query(`
      SELECT 
        version() AS pg_version,
        current_database() AS db_name,
        current_user AS db_user,
        inet_server_addr() AS server_ip,
        inet_server_port() AS server_port
    `);
    const id = idRes.rows[0];
    console.log('\n[1] DATABASE IDENTITY & HEALTH:');
    console.log(`- Database Name: ${id.db_name}`);
    console.log(`- Current User: ${id.db_user}`);
    console.log(`- PostgreSQL Version: ${id.pg_version.split(',')[0]}`);
    console.log(`- Server IP / Port: ${id.server_ip || 'Pooler/Socket'} : ${id.server_port || '5432'}`);

    // Database Size
    const sizeRes = await client.query(`
      SELECT 
        pg_database_size(current_database()) AS size_bytes,
        pg_size_pretty(pg_database_size(current_database())) AS size_pretty
    `);
    console.log(`- Database Storage Size: ${sizeRes.rows[0].size_pretty} (${sizeRes.rows[0].size_bytes} bytes)`);

    // Operational Connections & Locks
    const actRes = await client.query(`SELECT count(*) AS total_conns FROM pg_stat_activity`);
    const lockRes = await client.query(`SELECT count(*) AS waiting_locks FROM pg_locks WHERE NOT granted`);
    console.log(`- Active Connections: ${actRes.rows[0].total_conns}`);
    console.log(`- Waiting / Blocked Locks: ${lockRes.rows[0].waiting_locks}`);

    // 2. Migration Ledger State
    console.log('\n[2] CURRENT SCHEMA MIGRATION LEDGER:');
    const migRes = await client.query(`
      SELECT name, applied_at 
      FROM schema_migrations 
      ORDER BY name ASC
    `);
    console.log(`- Total Migrations Recorded: ${migRes.rows.length}`);
    if (migRes.rows.length > 0) {
      console.log(`- First Migration: ${migRes.rows[0].name} (applied ${migRes.rows[0].applied_at.toISOString()})`);
      console.log(`- Latest Migration: ${migRes.rows[migRes.rows.length - 1].name} (applied ${migRes.rows[migRes.rows.length - 1].applied_at.toISOString()})`);
      
      const lastMig = migRes.rows[migRes.rows.length - 1].name;
      const isEndingAt0021 = lastMig.startsWith('0021');
      console.log(`- Confirmed Ending at 0021: ${isEndingAt0021 ? 'YES (EXACT MATCH)' : 'NO (WARNING: ' + lastMig + ')'}`);
    }

    // 3. Existing Public Tables
    console.log('\n[3] EXISTING DATABASE TABLES:');
    const tabRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `);
    const tables = tabRes.rows.map(r => r.table_name);
    console.log(`- Total Public Tables: ${tables.length}`);
    console.log(`- Tables: ${tables.join(', ')}`);

    // Check if any biz_* tables exist
    const bizTables = tables.filter(t => t.startsWith('biz_'));
    console.log(`- Existing Business Mode Tables: ${bizTables.length === 0 ? '0 (None present, clean slate for V3)' : bizTables.join(', ')}`);

    // 4. Baseline Table Row Counts
    console.log('\n[4] BASELINE MODES DATA INTEGRITY (ROW COUNTS):');
    const coreTables = [
      'users', 'hostels', 'rooms', 'room_members', 'expenses', 
      'payments', 'debts', 'debt_settlements', 'debt_contacts',
      'shared_living_groups', 'shared_living_members', 'shared_living_expenses'
    ];

    for (const t of coreTables) {
      if (tables.includes(t)) {
        const countRes = await client.query(`SELECT count(*) AS cnt FROM "${t}"`);
        console.log(`  · ${t}: ${countRes.rows[0].cnt} rows`);
      } else {
        console.log(`  · ${t}: NOT PRESENT`);
      }
    }

    // 5. Four-Mode Constraint Check on users table
    console.log('\n[5] USER TABLE CONSTRAINTS & FINANCE MODES:');
    const modeRes = await client.query(`
      SELECT DISTINCT finance_mode, count(*) as count 
      FROM users 
      GROUP BY finance_mode 
      ORDER BY finance_mode
    `);
    console.log('- Existing Users Finance Mode Distribution:');
    modeRes.rows.forEach(r => {
      console.log(`  · ${r.finance_mode}: ${r.count} users`);
    });

    const constrRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'users' AND c.contype = 'c'
    `);
    console.log('- Users Check Constraints:');
    constrRes.rows.forEach(r => {
      console.log(`  · ${r.conname}: ${r.def}`);
    });

    // 6. Permissions Preflight for Migrations 0022-0028
    console.log('\n[6] MIGRATION PERMISSIONS AUDIT:');
    const permRes = await client.query(`
      SELECT 
        has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_table,
        has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_schema
    `);
    console.log(`- Schema CREATE Privilege: ${permRes.rows[0].can_create_table ? 'GRANTED' : 'DENIED'}`);
    console.log(`- Schema USAGE Privilege: ${permRes.rows[0].can_use_schema ? 'GRANTED' : 'DENIED'}`);

    const isSuper = await client.query(`SELECT current_setting('is_superuser') AS is_superuser`);
    console.log(`- Superuser Status: ${isSuper.rows[0].is_superuser}`);

    console.log('\n================================================================');
    console.log('READ-ONLY PREFLIGHT COMPLETE: 100% READS, 0 MUTATIONS');
    console.log('================================================================');

  } catch (err) {
    console.error('[Preflight Failed]:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

runPreflight();
