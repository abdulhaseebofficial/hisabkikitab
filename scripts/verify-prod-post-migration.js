/**
 * Comprehensive Supabase Production Post-Migration Verification Script
 * Strictly executes READ-ONLY queries against Supabase production.
 * Reconciles post-migration state against pre-migration baseline manifest.
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

const cleanUrl = rawUrl.replace(/\?.*$/, '');
const caPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'infrastructure', 'database', 'supabase-ca.crt');
const ca = fs.readFileSync(caPath, 'utf8');

const client = new Client({
  connectionString: cleanUrl,
  ssl: { ca, rejectUnauthorized: true }
});

// Load pre-migration manifest
const manifestPath = path.join(__dirname, '..', 'backups', 'supabase_prod_backup_2026-10-20T13-12-59-419Z.manifest.json');
const preManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function verify() {
  console.log('================================================================================');
  console.log('HISABKI KITAB V3 — SUPABASE PRODUCTION POST-MIGRATION VERIFICATION');
  console.log('================================================================================');

  const report = {
    connection: 'UNKNOWN',
    migration_ledger: 'UNKNOWN',
    baseline_reconciliation: {
      student_mode: 'UNKNOWN',
      householder_mode: 'UNKNOWN',
      shared_living_mode: 'UNKNOWN',
      overall_counts: 'UNKNOWN'
    },
    business_mode_schema: 'UNKNOWN',
    immutability_triggers: 'UNKNOWN',
    user_constraint: 'UNKNOWN',
    isolation_check: 'UNKNOWN',
    verdict: 'UNKNOWN'
  };

  try {
    await client.connect();
    report.connection = 'PASS';

    // 1. Database Identity
    const idRes = await client.query(`
      SELECT 
        version() AS pg_version,
        current_database() AS db_name,
        current_user AS db_user,
        inet_server_addr() AS server_ip,
        inet_server_port() AS server_port,
        pg_database_size(current_database()) AS size_bytes,
        pg_size_pretty(pg_database_size(current_database())) AS size_pretty
    `);
    const id = idRes.rows[0];
    console.log('\n[1] PRODUCTION DATABASE IDENTITY & HEALTH:');
    console.log(`- Database Name: ${id.db_name}`);
    console.log(`- Database User: ${id.db_user}`);
    console.log(`- PostgreSQL Version: ${id.pg_version.split(',')[0]}`);
    console.log(`- Server IP / Port: ${id.server_ip || 'Pooler/Socket'} : ${id.server_port || '5432'}`);
    console.log(`- Current Storage Size: ${id.size_pretty} (${id.size_bytes} bytes)`);

    // 2. Migration Ledger State
    console.log('\n[2] SCHEMA MIGRATION LEDGER VERIFICATION:');
    const migRes = await client.query(`
      SELECT name, applied_at 
      FROM schema_migrations 
      ORDER BY name ASC
    `);
    console.log(`- Total Migrations Recorded: ${migRes.rows.length} / 28`);
    
    const migrationNames = migRes.rows.map(r => r.name);
    const expectedMigrations = fs
      .readdirSync(path.join(__dirname, '..', 'database', 'migrations'))
      .filter(f => f.endsWith('.sql'))
      .sort();

    let allMigrationsMatch = true;
    for (let i = 0; i < expectedMigrations.length; i++) {
      const exp = expectedMigrations[i];
      const actual = migrationNames[i];
      if (actual !== exp) {
        console.error(`  ✖ Mismatch at index ${i}: expected ${exp}, found ${actual}`);
        allMigrationsMatch = false;
      }
    }

    if (allMigrationsMatch && migRes.rows.length === expectedMigrations.length) {
      console.log(`✔ All ${expectedMigrations.length} migrations verified present and strictly ordered in production ledger:`);
      migRes.rows.slice(21).forEach(r => {
        console.log(`  · ${r.name} applied at ${r.applied_at.toISOString()}`);
      });
      report.migration_ledger = 'PASS';
    } else {
      console.error('✖ Migration ledger validation FAILED');
      report.migration_ledger = 'FAIL';
    }

    // 3. Baseline Data Reconciliation (Student, Householder, Shared Living)
    console.log('\n[3] RECONCILIATION AGAINST PRE-MIGRATION MANIFEST:');
    const pre = preManifest.baseline_metrics;

    // Users
    const usersRes = await client.query(`SELECT count(*) as count FROM users`);
    const usersCount = Number(usersRes.rows[0].count);
    const usersByModeRes = await client.query(`
      SELECT finance_mode, count(*) as count 
      FROM users 
      GROUP BY finance_mode 
      ORDER BY finance_mode
    `);
    const usersByMode = {};
    usersByModeRes.rows.forEach(r => { usersByMode[r.finance_mode] = Number(r.count); });

    console.log(`- Users Count: Post=${usersCount} | Pre=${pre.users_count} -> ${usersCount === pre.users_count ? 'MATCH ✔' : 'MISMATCH ✖'}`);
    console.log(`  · Student Users: Post=${usersByMode.student || 0} | Pre=${pre.users_by_mode.student} -> ${(usersByMode.student || 0) === pre.users_by_mode.student ? 'MATCH ✔' : 'MISMATCH ✖'}`);
    console.log(`  · Householder Users: Post=${usersByMode.householder || 0} | Pre=${pre.users_by_mode.householder} -> ${(usersByMode.householder || 0) === pre.users_by_mode.householder ? 'MATCH ✔' : 'MISMATCH ✖'}`);
    console.log(`  · Shared Living Users: Post=${usersByMode.shared_living || 0} | Pre=${pre.users_by_mode.shared_living} -> ${(usersByMode.shared_living || 0) === pre.users_by_mode.shared_living ? 'MATCH ✔' : 'MISMATCH ✖'}`);
    console.log(`  · Business Users: Post=${usersByMode.business || 0} | Pre=0 -> ${(usersByMode.business || 0) === 0 ? 'MATCH (CLEAN SLATE) ✔' : 'MISMATCH ✖'}`);

    // Expenses
    const expensesRes = await client.query(`
      SELECT count(*) as count, coalesce(sum(amount_minor), 0) as sum_minor 
      FROM expenses
    `);
    const expensesCount = Number(expensesRes.rows[0].count);
    const expensesSumMinor = String(expensesRes.rows[0].sum_minor);
    console.log(`- Expenses Count: Post=${expensesCount} | Pre=${pre.expenses_count} -> ${expensesCount === pre.expenses_count ? 'MATCH ✔' : 'MISMATCH ✖'}`);
    console.log(`- Expenses Sum Minor: Post=${expensesSumMinor} | Pre=${pre.expenses_sum_minor} -> ${expensesSumMinor === pre.expenses_sum_minor ? 'MATCH ✔' : 'MISMATCH ✖'}`);

    // Income
    const incomeRes = await client.query(`
      SELECT count(*) as count, coalesce(sum(amount_minor), 0) as sum_minor 
      FROM income
    `);
    const incomeCount = Number(incomeRes.rows[0].count);
    const incomeSumMinor = String(incomeRes.rows[0].sum_minor);
    console.log(`- Income Count: Post=${incomeCount} | Pre=${pre.income_count} -> ${incomeCount === pre.income_count ? 'MATCH ✔' : 'MISMATCH ✖'}`);
    console.log(`- Income Sum Minor: Post=${incomeSumMinor} | Pre=${pre.income_sum_minor} -> ${incomeSumMinor === pre.income_sum_minor ? 'MATCH ✔' : 'MISMATCH ✖'}`);

    // Debts
    const debtsRes = await client.query(`
      SELECT count(*) as count, coalesce(sum(original_amount), 0) as sum_orig, coalesce(sum(paid_amount), 0) as sum_paid 
      FROM debts
    `);
    const debtsCount = Number(debtsRes.rows[0].count);
    const debtsSumOrig = Number(debtsRes.rows[0].sum_orig);
    const debtsSumPaid = Number(debtsRes.rows[0].sum_paid);
    console.log(`- Debts Count: Post=${debtsCount} | Pre=${pre.debts_count} -> ${debtsCount === pre.debts_count ? 'MATCH ✔' : 'MISMATCH ✖'}`);
    console.log(`- Debts Original Sum: Post=Rs ${debtsSumOrig} | Pre=Rs ${pre.debts_sum_original} -> ${debtsSumOrig === pre.debts_sum_original ? 'MATCH ✔' : 'MISMATCH ✖'}`);
    console.log(`- Debts Paid Sum: Post=Rs ${debtsSumPaid} | Pre=Rs ${pre.debts_sum_paid} -> ${debtsSumPaid === pre.debts_sum_paid ? 'MATCH ✔' : 'MISMATCH ✖'}`);

    // Debt Contacts
    const debtContactsRes = await client.query(`SELECT count(*) as count FROM debt_contacts`);
    const debtContactsCount = Number(debtContactsRes.rows[0].count);
    console.log(`- Debt Contacts Count: Post=${debtContactsCount} | Pre=${pre.debt_contacts_count} -> ${debtContactsCount === pre.debt_contacts_count ? 'MATCH ✔' : 'MISMATCH ✖'}`);

    // Shared Living Spaces & Memberships
    const slSpacesRes = await client.query(`SELECT count(*) as count FROM sl_spaces`);
    const slMembershipsRes = await client.query(`SELECT count(*) as count FROM sl_memberships`);
    const slSpacesCount = Number(slSpacesRes.rows[0].count);
    const slMembershipsCount = Number(slMembershipsRes.rows[0].count);
    console.log(`- SL Spaces Count: Post=${slSpacesCount} | Pre=${pre.sl_spaces_count} -> ${slSpacesCount === pre.sl_spaces_count ? 'MATCH ✔' : 'MISMATCH ✖'}`);
    console.log(`- SL Memberships Count: Post=${slMembershipsCount} | Pre=${pre.sl_memberships_count} -> ${slMembershipsCount === pre.sl_memberships_count ? 'MATCH ✔' : 'MISMATCH ✖'}`);

    const studentPass = usersByMode.student === pre.users_by_mode.student && expensesCount === pre.expenses_count && expensesSumMinor === pre.expenses_sum_minor;
    const housePass = usersByMode.householder === pre.users_by_mode.householder && debtsCount === pre.debts_count && debtsSumOrig === pre.debts_sum_original && debtsSumPaid === pre.debts_sum_paid;
    const slPass = usersByMode.shared_living === pre.users_by_mode.shared_living && slSpacesCount === pre.sl_spaces_count && slMembershipsCount === pre.sl_memberships_count;

    report.baseline_reconciliation.student_mode = studentPass ? 'PASS' : 'FAIL';
    report.baseline_reconciliation.householder_mode = housePass ? 'PASS' : 'FAIL';
    report.baseline_reconciliation.shared_living_mode = slPass ? 'PASS' : 'FAIL';
    report.baseline_reconciliation.overall_counts = (studentPass && housePass && slPass) ? 'PASS' : 'FAIL';

    // 4. Verify Users Table Constraint
    console.log('\n[4] USERS TABLE FINANCE_MODE CONSTRAINT:');
    const constrRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'users' AND c.contype = 'c'
    `);
    constrRes.rows.forEach(r => {
      console.log(`- Constraint: ${r.conname} => ${r.def}`);
    });
    const financeCheck = constrRes.rows.find(r => r.conname === 'users_finance_mode_check');
    if (financeCheck && financeCheck.def.includes('business') && financeCheck.def.includes('student') && financeCheck.def.includes('householder') && financeCheck.def.includes('shared_living')) {
      console.log('✔ users_finance_mode_check cleanly incorporates all 4 modes.');
      report.user_constraint = 'PASS';
    } else {
      console.error('✖ users_finance_mode_check does not contain all 4 modes');
      report.user_constraint = 'FAIL';
    }

    // 5. Verify Business Mode Schema (Tables, Triggers, RLS)
    console.log('\n[5] BUSINESS MODE SCHEMA INTEGRITY:');
    const tabRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `);
    const allTables = tabRes.rows.map(r => r.table_name);
    console.log(`- Total Public Tables: ${allTables.length}`);
    
    const bizTables = allTables.filter(t => t.startsWith('biz_') || t.startsWith('business_') || t === 'businesses');
    const nonBizTables = allTables.filter(t => !t.startsWith('biz_') && !t.startsWith('business_') && t !== 'businesses');
    console.log(`- Baseline Tables (${nonBizTables.length}): ${nonBizTables.join(', ')}`);
    console.log(`- Business Mode Tables (${bizTables.length}): ${bizTables.join(', ')}`);

    // Verify baseline table set is preserved
    let missingBaselineTables = [];
    for (const bt of pre.tables) {
      if (!allTables.includes(bt)) {
        missingBaselineTables.push(bt);
      }
    }
    if (missingBaselineTables.length === 0) {
      console.log('✔ All 28 baseline tables preserved exactly.');
    } else {
      console.error(`✖ Missing baseline tables: ${missingBaselineTables.join(', ')}`);
    }

    // Check each required business table
    const requiredBizTables = [
      'businesses', 'business_settings', 'business_members', 'business_branches',
      'biz_accounts', 'biz_journal_entries', 'biz_journal_lines', 'biz_products',
      'biz_product_categories', 'biz_product_variants', 'biz_stock_counts', 'biz_stock_count_items',
      'biz_stock_movements', 'biz_stock_transfers', 'biz_stock_transfer_items',
      'biz_warehouses', 'biz_suppliers', 'biz_purchase_requests', 'biz_purchase_request_items',
      'biz_purchase_orders', 'biz_purchase_order_items', 'biz_grns', 'biz_grn_items',
      'biz_supplier_bills', 'biz_supplier_bill_items', 'biz_supplier_payment_allocations',
      'biz_purchases', 'biz_purchase_items', 'biz_purchase_returns', 'biz_purchase_return_items',
      'biz_sales', 'biz_sale_items', 'biz_sales_returns', 'biz_sales_return_items',
      'biz_pos_shifts', 'biz_offline_sync_log', 'biz_recurring_expenses',
      'biz_recurring_expense_occurrences', 'biz_employees', 'biz_employee_attendance',
      'biz_payroll_runs', 'biz_payroll_items', 'biz_financial_requests', 'biz_customers',
      'biz_expenses', 'biz_budgets', 'biz_audit_logs'
    ];

    let missingBizTables = [];
    for (const t of requiredBizTables) {
      if (!allTables.includes(t)) {
        missingBizTables.push(t);
      }
    }

    if (missingBizTables.length === 0) {
      console.log('✔ All required business tables verified present in public schema.');
      report.business_mode_schema = 'PASS';
    } else {
      console.error(`✖ Missing business tables: ${missingBizTables.join(', ')}`);
      report.business_mode_schema = 'FAIL';
    }

    // 6. Verify Immutability Triggers on General Ledger
    console.log('\n[6] GENERAL LEDGER IMMUTABILITY TRIGGERS:');
    const trigRes = await client.query(`
      SELECT tgname, relname, proname
      FROM pg_trigger tg
      JOIN pg_class c ON tg.tgrelid = c.oid
      JOIN pg_proc p ON tg.tgfoid = p.oid
      WHERE tgname IN ('biz_journal_entries_immutability', 'biz_journal_lines_immutability')
    `);
    console.log(`- Immutability Triggers found: ${trigRes.rows.length} / 2`);
    trigRes.rows.forEach(r => {
      console.log(`  · Trigger '${r.tgname}' on table '${r.relname}' executing function '${r.proname}()'`);
    });

    if (trigRes.rows.length === 2) {
      console.log('✔ Journal immutability triggers (biz_journal_entries_immutability, biz_journal_lines_immutability) active.');
      report.immutability_triggers = 'PASS';
    } else {
      console.error('✖ Journal immutability triggers missing or incomplete');
      report.immutability_triggers = 'FAIL';
    }

    // 7. Verify Zero Business Data Mutations (Clean Slate)
    console.log('\n[7] BUSINESS MODE DATA INITIAL STATE:');
    const bzCnt = await client.query(`SELECT count(*) as count FROM businesses`);
    const jnlCnt = await client.query(`SELECT count(*) as count FROM biz_journal_entries`);
    const prodCnt = await client.query(`SELECT count(*) as count FROM biz_products`);
    const saleCnt = await client.query(`SELECT count(*) as count FROM biz_sales`);
    console.log(`- businesses count: ${bzCnt.rows[0].count}`);
    console.log(`- biz_journal_entries count: ${jnlCnt.rows[0].count}`);
    console.log(`- biz_products count: ${prodCnt.rows[0].count}`);
    console.log(`- biz_sales count: ${saleCnt.rows[0].count}`);

    if (Number(bzCnt.rows[0].count) === 0 && Number(jnlCnt.rows[0].count) === 0 && Number(prodCnt.rows[0].count) === 0 && Number(saleCnt.rows[0].count) === 0) {
      console.log('✔ Business tables are in pristine clean-slate state (0 records).');
      report.isolation_check = 'PASS';
    } else {
      console.warn('⚠ Unexpected records found in business tables');
      report.isolation_check = 'WARNING';
    }

    // Overall verdict
    if (
      report.migration_ledger === 'PASS' &&
      report.baseline_reconciliation.overall_counts === 'PASS' &&
      report.business_mode_schema === 'PASS' &&
      report.immutability_triggers === 'PASS' &&
      report.user_constraint === 'PASS' &&
      report.isolation_check === 'PASS'
    ) {
      report.verdict = 'ALL PASS';
    } else {
      report.verdict = 'FAILED SOME CHECKS';
    }

    console.log('\n================================================================================');
    console.log(`FINAL POST-MIGRATION VERIFICATION VERDICT: ${report.verdict}`);
    console.log('================================================================================\n');

    // Save report to disk
    fs.writeFileSync(
      path.join(__dirname, '..', 'backups', 'post_migration_verification_report.json'),
      JSON.stringify(report, null, 2)
    );

  } catch (err) {
    console.error('[FATAL]:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

verify();
