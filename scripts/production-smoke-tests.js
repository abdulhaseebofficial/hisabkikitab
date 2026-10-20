/**
 * HisabKi Kitab V3 — Complete Production Smoke Test Suite
 * Executes end-to-end validation against the live production deployment at https://www.hisabkikitab.com
 * Tests all 4 operational modes, authentication, security, and frontend delivery.
 * Ensures zero leftover records in production database.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: '.env.production.local' });

const PROD_URL = 'https://www.hisabkikitab.com';
const PROD_DB_URL = process.env.POSTGRES_URL_NON_POOLING;

const caPath = path.resolve('apps/api/src/infrastructure/database/supabase-ca.crt');
const ca = fs.readFileSync(caPath, 'utf8');

const client = new Client({
  connectionString: PROD_DB_URL.replace(/\?.*$/, ''),
  ssl: { ca, rejectUnauthorized: true }
});

const api = async (method, endpoint, body = null, token = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${PROD_URL}${endpoint}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
};

async function runSmokeTests() {
  console.log('================================================================================');
  console.log('HISABKI KITAB V3 — PRODUCTION POST-DEPLOYMENT SMOKE TESTS');
  console.log(`Target Host: ${PROD_URL}`);
  console.log('================================================================================\n');

  const results = {
    backend_health: 'FAIL',
    student_mode: 'FAIL',
    householder_mode: 'FAIL',
    shared_living_mode: 'FAIL',
    business_mode: 'FAIL',
    security_isolation: 'FAIL',
    frontend_delivery: 'FAIL',
    database_cleanup: 'FAIL',
    verdict: 'FAIL'
  };

  await client.connect();

  try {
    // -------------------------------------------------------------------------
    // Pre-test Baseline Check
    // -------------------------------------------------------------------------
    const preUsersCount = Number((await client.query('SELECT count(*) FROM users')).rows[0].count);
    console.log(`Production baseline user count: ${preUsersCount}`);

    // -------------------------------------------------------------------------
    // 1. Backend Health & Core Meta
    // -------------------------------------------------------------------------
    console.log('\n[TEST 1/7] Backend Health & Status Endpoints...');
    const health = await api('GET', '/api/health');
    console.log(`- /api/health Status: ${health.status}`);
    console.log(`  · database: ${health.json?.database}`);
    console.log(`  · mail: ${health.json?.mail}`);
    console.log(`  · ai: ${health.json?.ai}`);
    console.log(`  · uptime: ${health.json?.uptime}s`);

    const meta = await api('GET', '/api/meta');
    console.log(`- /api/meta Status: ${meta.status} (categories: ${meta.json?.data?.categories?.length || 0})`);

    if (health.status === 200 && health.json?.database === 'connected' && meta.status === 200) {
      console.log('✔ Backend health and public API verified.');
      results.backend_health = 'PASS';
    }

    // -------------------------------------------------------------------------
    // 2. Student Mode Smoke Test
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2/7] Student Mode Smoke Test...');
    const studentPassword = 'SmokeStudentPass123!';
    const studentEmail = `smoke-student-${Date.now()}@example.test`;
    
    const sReg = await api('POST', '/api/auth/register', {
      name: 'Smoke Student',
      email: studentEmail,
      password: studentPassword,
      confirmPassword: studentPassword,
      acceptTerms: true
    });
    console.log(`- Register Student Status: ${sReg.status} (Mode: ${sReg.json?.data?.user?.financeMode})`);

    const sToken = sReg.json?.data?.accessToken;
    if (sToken) {
      const me = await api('GET', '/api/auth/me', null, sToken);
      const dash = await api('GET', '/api/dashboard/summary', null, sToken);
      const exp = await api('GET', '/api/expenses', null, sToken);
      const inc = await api('GET', '/api/income', null, sToken);
      const bud = await api('GET', '/api/budget', null, sToken);
      const deb = await api('GET', '/api/debts', null, sToken);

      console.log(`  · /api/auth/me: ${me.status} (Mode: ${me.json?.data?.user?.financeMode})`);
      console.log(`  · /api/dashboard/summary: ${dash.status} (month: ${dash.json?.data?.monthLabel})`);
      console.log(`  · /api/expenses: ${exp.status} (count: ${exp.json?.data?.expenses?.length ?? 0})`);
      console.log(`  · /api/income: ${inc.status}`);
      console.log(`  · /api/budget: ${bud.status}`);
      console.log(`  · /api/debts: ${deb.status}`);

      if (me.status === 200 && dash.status === 200 && exp.status === 200 && inc.status === 200 && bud.status === 200 && deb.status === 200) {
        console.log('✔ Student Mode smoke test PASSED.');
        results.student_mode = 'PASS';
      }

      // Cleanup
      await api('DELETE', '/api/profile', { password: studentPassword }, sToken);
    }

    // -------------------------------------------------------------------------
    // 3. Householder Mode Smoke Test
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3/7] Householder Mode Smoke Test...');
    const housePassword = 'SmokeHousePass123!';
    const houseEmail = `smoke-house-${Date.now()}@example.test`;
    
    const hReg = await api('POST', '/api/auth/register', {
      name: 'Smoke Householder',
      email: houseEmail,
      password: housePassword,
      confirmPassword: housePassword,
      acceptTerms: true
    });
    const hToken = hReg.json?.data?.accessToken;

    if (hToken) {
      // Switch mode to householder
      await api('PUT', '/api/profile', { financeMode: 'householder' }, hToken);
      const me = await api('GET', '/api/auth/me', null, hToken);
      const dash = await api('GET', '/api/dashboard/summary', null, hToken);
      const deb = await api('GET', '/api/debts', null, hToken);
      const exp = await api('GET', '/api/expenses', null, hToken);
      const inc = await api('GET', '/api/income', null, hToken);

      console.log(`  · /api/auth/me: ${me.status} (Mode: ${me.json?.data?.user?.financeMode})`);
      console.log(`  · /api/dashboard/summary: ${dash.status} (month: ${dash.json?.data?.monthLabel})`);
      console.log(`  · /api/debts: ${deb.status}`);
      console.log(`  · /api/expenses: ${exp.status}`);
      console.log(`  · /api/income: ${inc.status}`);

      if (me.status === 200 && me.json?.data?.user?.financeMode === 'householder' && dash.status === 200 && deb.status === 200 && exp.status === 200) {
        console.log('✔ Householder Mode smoke test PASSED.');
        results.householder_mode = 'PASS';
      }

      // Cleanup
      await api('DELETE', '/api/profile', { password: housePassword }, hToken);
    }

    // -------------------------------------------------------------------------
    // 4. Shared Living Mode Smoke Test & Boundary Enforcement
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4/7] Shared Living Mode Smoke Test & Boundary Check...');
    const slPassword = 'SmokeSharedPass123!';
    const slEmail = `smoke-shared-${Date.now()}@example.test`;

    const slReg = await api('POST', '/api/auth/register', {
      name: 'Smoke SharedLiving',
      email: slEmail,
      password: slPassword,
      confirmPassword: slPassword,
      acceptTerms: true
    });
    const slToken = slReg.json?.data?.accessToken;

    if (slToken) {
      // Switch mode to shared_living
      await api('PUT', '/api/profile', { financeMode: 'shared_living' }, slToken);
      const me = await api('GET', '/api/auth/me', null, slToken);
      const spaces = await api('GET', '/api/shared-living/spaces', null, slToken);
      const blockedExp = await api('GET', '/api/expenses', null, slToken);

      console.log(`  · /api/auth/me: ${me.status} (Mode: ${me.json?.data?.user?.financeMode})`);
      console.log(`  · /api/shared-living/spaces: ${spaces.status}`);
      console.log(`  · /api/expenses boundary enforcement: ${blockedExp.status} (Expected 403: '${blockedExp.json?.message}')`);

      if (me.status === 200 && me.json?.data?.user?.financeMode === 'shared_living' && spaces.status === 200 && blockedExp.status === 403) {
        console.log('✔ Shared Living Mode smoke test PASSED and boundary invariant confirmed.');
        results.shared_living_mode = 'PASS';
      }

      // Cleanup
      await api('DELETE', '/api/profile', { password: slPassword }, slToken);
    }

    // -------------------------------------------------------------------------
    // 5. Business Mode Smoke Test
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5/7] Business Mode Smoke Test & Subsystem Verification...');
    const bzPassword = 'SmokeBusinessPass123!';
    const bzEmail = `smoke-business-${Date.now()}@example.test`;

    const bzReg = await api('POST', '/api/auth/register', {
      name: 'Smoke BusinessOwner',
      email: bzEmail,
      password: bzPassword,
      confirmPassword: bzPassword,
      acceptTerms: true
    });
    const bzToken = bzReg.json?.data?.accessToken;

    if (bzToken) {
      // Switch mode to business (4th mode)
      const modeUpdate = await api('PUT', '/api/profile', { financeMode: 'business' }, bzToken);
      console.log(`  · PUT /api/profile (financeMode: 'business'): ${modeUpdate.status}`);

      const me = await api('GET', '/api/auth/me', null, bzToken);
      console.log(`  · /api/auth/me: ${me.status} (Mode: ${me.json?.data?.user?.financeMode})`);

      // Unauthenticated root check
      const unauth = await api('GET', '/api/business');
      console.log(`  · Unauthenticated GET /api/business: ${unauth.status} (Expected 401)`);

      // Authenticated business list
      const bizList = await api('GET', '/api/business', null, bzToken);
      console.log(`  · Authenticated GET /api/business: ${bizList.status} (Businesses: ${bizList.json?.data?.length || 0})`);

      // Non-member authorization boundary check
      const nonMember = await api('GET', '/api/business/00000000-0000-0000-0000-000000000000/dashboard', null, bzToken);
      console.log(`  · Non-member access /api/business/00000000-0000-0000-0000-000000000000/dashboard: ${nonMember.status} (Expected 403: '${nonMember.json?.message}')`);

      if (
        me.status === 200 &&
        me.json?.data?.user?.financeMode === 'business' &&
        unauth.status === 401 &&
        bizList.status === 200 &&
        nonMember.status === 403
      ) {
        console.log('✔ Business Mode smoke test PASSED.');
        results.business_mode = 'PASS';
      }

      // Cleanup
      await api('DELETE', '/api/profile', { password: bzPassword }, bzToken);
    }

    // -------------------------------------------------------------------------
    // 6. Security Isolation & Mutation Guard
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6/7] Security Isolation & Mutation Guard...');
    const unauthBzWrite = await api('POST', '/api/business/00000000-0000-0000-0000-000000000000/sales', { items: [] });
    console.log(`- Unauthenticated POST /api/business/.../sales: ${unauthBzWrite.status} (Expected 401)`);

    const unauthExpenses = await api('POST', '/api/expenses', { amount: 100 });
    console.log(`- Unauthenticated POST /api/expenses: ${unauthExpenses.status} (Expected 401)`);

    if (unauthBzWrite.status === 401 && unauthExpenses.status === 401) {
      console.log('✔ Authentication and mutation isolation verified.');
      results.security_isolation = 'PASS';
    }

    // -------------------------------------------------------------------------
    // 7. Frontend Delivery & Security Headers
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7/7] Frontend Delivery & Header Integrity...');
    const home = await api('GET', '/');
    const app = await api('GET', '/app.html');
    const about = await api('GET', '/about/');
    const contact = await api('GET', '/contact/');
    const privacy = await api('GET', '/privacy/');
    const terms = await api('GET', '/terms/');

    console.log(`- Homepage (/): ${home.status}`);
    console.log(`- Application (/app.html): ${app.status}`);
    console.log(`- /about/: ${about.status}`);
    console.log(`- /contact/: ${contact.status}`);
    console.log(`- /privacy/: ${privacy.status}`);
    console.log(`- /terms/: ${terms.status}`);

    const hsts = home.headers.get('strict-transport-security');
    console.log(`  · HSTS: ${hsts ? 'PRESENT ✔' : 'MISSING ✖'}`);

    if (home.status === 200 && app.status === 200 && about.status === 200 && contact.status === 200 && privacy.status === 200 && terms.status === 200 && hsts) {
      console.log('✔ Frontend delivery verified.');
      results.frontend_delivery = 'PASS';
    }

    // -------------------------------------------------------------------------
    // Post-test Database Reconciliation
    // -------------------------------------------------------------------------
    console.log('\n[POST-TEST] Verifying Database Zero-Mutation Reversibility...');
    const postUsersCount = Number((await client.query('SELECT count(*) FROM users')).rows[0].count);
    console.log(`Production user count: Post=${postUsersCount} | Baseline=${preUsersCount}`);
    
    if (postUsersCount === preUsersCount) {
      console.log('✔ Database 100% reconciled: all temporary test users successfully purged.');
      results.database_cleanup = 'PASS';
    } else {
      console.error(`✖ User count disparity: ${postUsersCount - preUsersCount} residual users.`);
      results.database_cleanup = 'FAIL';
    }

    // Overall verdict
    if (
      results.backend_health === 'PASS' &&
      results.student_mode === 'PASS' &&
      results.householder_mode === 'PASS' &&
      results.shared_living_mode === 'PASS' &&
      results.business_mode === 'PASS' &&
      results.security_isolation === 'PASS' &&
      results.frontend_delivery === 'PASS' &&
      results.database_cleanup === 'PASS'
    ) {
      results.verdict = 'ALL PASS (LIVE)';
    } else {
      results.verdict = 'PARTIAL / FAILED';
    }

    console.log('\n================================================================================');
    console.log(`FINAL SMOKE TEST VERDICT: ${results.verdict}`);
    console.log('================================================================================\n');

    fs.writeFileSync(
      path.join(__dirname, '..', 'backups', 'production_smoke_test_report.json'),
      JSON.stringify(results, null, 2)
    );

  } catch (err) {
    console.error('[FATAL]:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

runSmokeTests();
