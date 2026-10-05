# Phase 2 prelaunch verification record

Status on 5 October 2026: **not ready for production rollout**. This is a procedure and evidence form, not evidence that a production restore, hosted CI run, provider job, or deployment occurred. Keep identifiers, row samples, credentials, and provider screenshots in a private operations record. Commit only aggregate counts and pass/fail conclusions.

## 1. Isolate and identify the restore

1. The owner creates a new disposable restore from a named backup/PITR timestamp. Disconnect it from the production API and scheduler. Use different credentials, a localhost listener, and a database name starting `test_` or ending `_test`. Do not use a tunnel to the live database.
2. Record privately: provider/project/region, source backup identifier and timestamp, restored database identity, PostgreSQL version, restore start/end, and person who confirmed isolation. Compare the restored server identity with the live server's identity through provider metadata without giving this shell a live production connection. The localhost/test-name guard in `scripts/require-test-database.js` **cannot detect a localhost tunnel to production**. The `npm run migrate` runner does **not** invoke that test guard because it also serves real deployment migrations. An operator must confirm the endpoint is the independent restore before either tests or migration writes.
3. In a dedicated shell set `NODE_ENV=test`, `ALLOW_DESTRUCTIVE_TEST_DB=true`, `TEST_DATABASE_URL`, `DATABASE_URL`, `POSTGRES_URL`, `DIRECT_URL`, and `POSTGRES_URL_NON_POOLING` to the **same verified restored-local URL**. Check hostname, port, database, server identity, and `schema_migrations` before running a migration. Never paste the URL into reports.
4. Make two independent disposable copies if destructive integration suites are needed: **rehearsal copy** for pre/post snapshots and migrations, **test copy** for suites that create/delete rows. The production restore and its pre-migration snapshot must not be modified by the test suites.

## 2. Pre-migration aggregate snapshot

Start a `BEGIN READ ONLY` transaction on the rehearsal copy and record the applied migration names/count. Save an aggregate snapshot under a private run ID and backup timestamp. Capture table row counts for `users`, `sl_spaces`, `sl_memberships`, `sl_members`, `sl_periods`, `sl_bills`, `sl_expenses`, `sl_shares`, `sl_payments`, `sl_activity`, `expenses`, `income`, `budgets`, `goals`, `goal_contributions`, `debts`, `debt_payments`, and `debt_contacts` when each table exists. Record exact `numeric`/`bigint` sums as decimal strings, never JavaScript floating-point totals. Record creator/actor attribution counts grouped by table and whether creator/actor is null; keep any identity-bearing detail private.

### F3 — ownership before 0019

For each `sl_spaces.id`, compare `owner_id` with `sl_memberships.user_id` where `role='admin'`. Record aggregate counts of spaces, owner account missing, owner membership missing, zero admins, multiple admins, sole admin different from owner, spaces with no other membership, and spaces with eligible successor memberships. `sl_memberships` has no `active` column: an extant membership is the account-level eligibility signal; `sl_members.active` describes residents and is not a substitute. Require **zero** invalid/ambiguous ownership states before 0019. Do not choose or auto-transfer an owner from old rows.

### F5 — exact historical personal money before 0016/0018

For each of these seven legacy fields, capture `count(*)`, null count, non-finite count, sub-minor count, out-of-BIGINT-cent range count, exact legacy `sum(value::numeric)` excluding non-finite values, exact expected `sum(value::numeric * 100)` only for representable rows, discrepancy count, and maximum absolute discrepancy. The fields are `users.monthly_income`, `expenses.amount`, `income.amount`, `goals.target_amount`, `goals.saved_amount`, `goal_contributions.amount`, and `budgets."limit"`. The migration's conversion rule is `value::numeric * 100 = trunc(value::numeric * 100)` within signed BIGINT bounds. Count, do not round, any row that fails. If the shadow column already exists, compare its count/sum and every value with this strict conversion; otherwise mark shadow comparisons not applicable before migration. Run `node scripts/reconcile-personal-money.js` on the isolated copy as an additional read-only preflight, but its current output lacks null/total/shadow counts and does **not** replace this full snapshot.

### F8 — debt identity before 0020

Record debt and payment counts, exact sums of principal, paid amount, outstanding balance, and ledger payments, grouped by owner and direction for private comparison. Count normalized-name groups with more than one debt **within the same owner** and the debts in those groups; keep names and identities private. These groups are ambiguity candidates, not proof of one person. After 0020, require one distinct, same-owner `contact_id` per historical debt, no cross-user or orphan contact, and unchanged old person fields and money/settlement rows. Do not merge contacts by name.

### F10 — recurring Shared Living bills before 0021

Count bills by `(space_id, period_id)` privately and publish only aggregate totals. Count recurring rows, existing non-null root IDs, duplicate `(space_id,period_id,recurring_origin_id)` where root is known, roots missing or in another space, and roots that point to a non-recurring source. Count old same-name/category candidates in each period and candidate copies in adjacent periods separately; names/amounts alone do not establish lineage. Record manual lookalikes separately. Rows with unknown lineage remain unknown; do not backfill their root or merge/delete them automatically. Zero exact known-root conflicts is required for 0021. Any ambiguous old target period requires owner review before recurrence is enabled there.

### Historical financial dates

For personal `expenses.date`, `income.date`, `goal_contributions.date`, `debts.transaction_date`, `debts.due_date`, and `debt_payments` timestamp columns where present, record null counts and non-midnight UTC counts. Separate true event timestamps (debt transactions/payments) from date-only personal financial fields; do **not** label a legitimate event time invalid. For date-only fields, count instants whose calendar day differs under UTC and the supported local/business timezone assumptions, including month/year boundaries. Shared Living `date` columns and `sl_periods.month` are PostgreSQL `date`; count malformed month alignment where possible. No timezone inference can recover an unknown historical user's intended day. Preserve raw timestamps, review only ambiguous aggregates and private samples, and do not bulk-shift dates.

## 3. Migration rehearsal and comparison

1. Save the read-only pre-snapshot and stop if F3/F5/F10 preflight finds an invariant failure. Review debt/date ambiguity without guessing historical identities or dates.
2. On the **rehearsal copy only**, record start/end times and execute the existing migration runner through the latest migration (`0021` at this revision). It runs all pending files under one transaction and advisory lock. Record applied names, duration, lock/wait time and any SQLSTATE. On failure, stop; capture an aggregate conflict count and a private row-level remediation case. Do not weaken SQL or retry after an unexplained conflict.
3. Rerun the same read-only snapshot. Require identical counts, IDs and attribution for all pre-existing financial rows; exact equality of legacy amounts and debt principal/paid/balance/payment sums; exact equality of Shared Living period/bill/expense/share/payment and activity counts/sums; unchanged stored historical dates. New shadow/contact/lineage columns may exist, but old records must not disappear, merge or change amounts. Require seven personal shadows to match strict cents and one distinct same-owner contact per old debt. Existing Shared Living bills with unknown lineage must retain unknown markers. Record exception counts as **zero** or stop and investigate.
4. Perform read-only application/API/export smoke checks against the rehearsal copy with no mutation endpoints or cron invocation. Use the separate **test copy** for migration reapplication and destructive DB/API/browser suites if desired. A green seeded/local suite is not proof that production history reconciled.

## 4. Provider and hosted evidence form

| Gate | Required non-secret evidence | Current state |
|---|---|
| Backup/PITR/restore | Schedule, retention, PITR window, backup ID/time, timed restore into isolated copy, successful boot and reconciliation | Cannot confirm |
| Hosted CI | Run URL, revision SHA matching release artifact, install/test/DB/migration/build outcomes, HTTPS prerender origin | Cannot confirm |
| Production cron | `CRON_SECRET` present (never value), active `/api/internal/recurring` at `5 0 * * *`, one observed authorized run, rejected unauthorized probe on safe non-production route or provider test, logs, failure alert, duration/connection headroom | Cannot confirm |
| DB/runtime | Pool maximum (`PG_POOL_MAX` or default 10) times possible function instances within provider limits; migration direct connection; TLS; function duration | Cannot confirm |
| Auth/web | Distinct JWT secrets present; `NODE_ENV`, `CLIENT_URL`, CORS, HTTPS/Secure/SameSite cookies, trusted proxy and rate-limit store verified against deployed topology | Cannot confirm |
| Optional providers | SMTP/reset delivery; Google Web client ID/origins if enabled; AI key/model/privacy if enabled; analytics ID/consent if enabled | Cannot confirm |
| Operations | External error monitor, API/DB availability and cron failure alerts, owner/on-call and acknowledgment test | Cannot confirm |

Production cron must not be manually triggered for this checklist without an agreed safe plan: its authenticated sweep can create financial rows. Manifest presence and a local successful invocation do not prove provider delivery.

## 5. F13 release decision

The lockfile currently resolves `node-cron@3.0.3` (direct API dependency) to `uuid@8.3.2`, and `react-router-dom@6.30.6` (direct browser dependency) to `react-router@6.30.6`. A fresh `npm audit --omit=dev --json` against the npm registry on 5 October 2026 reported **four moderate production package entries, zero high or critical**: `node-cron`, `uuid`, `react-router`, and `react-router-dom`. The command exited 1 because advisories were found. Repeat it for the final release revision and obtain the owner's security decision; this result is not risk acceptance.

| Chain | Path and exploit prerequisite | Fix/cost | Engineering recommendation |
|---|---|---|---|
| `node-cron → uuid` | Cron is imported for recurrence; installed cron calls `uuid.v4()` without an output buffer. GHSA-w5hq-g745-h8pq concerns v3/v5/v6 with caller-provided buffers. That affected call path was not found in this chain. | Patched uuid is outside cron 3's dependency line; reviewed cron 4 migration changes scheduler API. | **Accept temporary risk**, subject to fresh audit and owner security signoff; track cron upgrade after release. |
| `react-router-dom → react-router`, SSR advisory | Browser uses `BrowserRouter`/`createRoot`; public prerender uses `StaticRouter`/`renderToString`. It does not use Data/Framework mode hydration. GHSA-337j-9hxr-rhxg requires attacker-controlled errors in SSR hydration. | Router 7.18+ is a major compatibility upgrade. | **Accept temporary risk**, subject to fresh audit and signoff; track Router upgrade. |
| `react-router-dom → react-router`, navigation advisory | App uses `Link`/`navigate`; protected routes and login return path are static route pathnames. GHSA-wrjc-x8rr-h8h6 needs an attacker-supplied backslash navigation target and user interaction. No such source was identified in current route definitions, but absence of every path is not proven. | Router 7.18+ is major and needs routing regression review. | **Accept temporary risk only with explicit owner security signoff** and a release-revision navigation review; otherwise treat as prelaunch fix. |

No major upgrade was made. Record the owner, date, advisory IDs, release SHA, rationale and follow-up ticket in the private release decision. A recommendation is not an approved acceptance.

## 6. Controlled rollout and rollback decision

1. **Verified backup:** identify the backup/PITR point, retention and operator; complete the timed restore drill. No backup proof means no rollout.
2. **Migration preflight:** run section 2 against a fresh isolated restore and sign off every invariant/ambiguity. Stop on F3/F5/F10 conflicts or unexplained F8/date history.
3. **Migration execution:** freeze writes as approved, capture a fresh production aggregate baseline through a safe read-only operator procedure, apply migrations with the direct connection during the maintenance window, record duration and SQLSTATE. Do not use the destructive test guard/suites on live production.
4. **API deployment:** deploy the pinned revision, verify health, auth login/refresh/revocation, scoped read/export and financial-create idempotency using an approved controlled test account only.
5. **Web deployment:** deploy the matching artifact, verify prerender origin, login, expenses/income, debts, Shared Living and date filters on desktop/mobile.
6. **Production smoke checks:** compare aggregate financial counts/totals with the frozen baseline, allowing only explicitly recorded test writes. Any unexplained discrepancy stops rollout.
7. **Cron verification:** confirm one provider schedule/secret and observe its scheduled result/log; do not hand-trigger a duplicate sweep. Verify retry/failure visibility and database uniqueness metrics.
8. **Monitoring verification:** inspect error, API/DB availability and cron alerts with an owner; test notification routing without writing financial data. Observe an agreed stabilization window.
9. **Rollback decision:** stop writes/deploy progression on migration failure, any financial mismatch, auth failure, elevated API errors, missed/failed cron, or broken critical browser flows. Roll back API/web to the compatible pinned revision only after checking schema compatibility. Do **not** automatically reverse 0016–0021 or restore a backup over newer financial writes. Choose a reviewed forward repair or isolated restore/cutover with explicit reconciliation and owner approval.

Release approval requires completed restored-history and provider evidence, a current F13 decision, named rollback operator, and no unexplained discrepancy. Until then: **NOT READY FOR PRODUCTION ROLLOUT**.
