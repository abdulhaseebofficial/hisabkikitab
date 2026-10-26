# Release readiness: Phase 2 + 2.5 + 2.6

Everything verified since commit `ef5fc1a`, what a user will notice, and how to
get back if it goes wrong.

| | |
| --- | --- |
| Schema change | **None.** 28 migrations, unchanged. |
| Database rollback needed | **No.** Rollback is a redeploy of the previous build. |
| API breaking change | **No.** The renamed report fields still ship under their old names. |
| User-visible wording change | **Yes, substantial.** See section 4. |
| Numbers shown to users change | **Yes.** See section 4. This is the point of the release. |

---

## 1. What this release contains

Three things, in order of how much they matter:

1. **A blocker fix.** The shared contract let the business payment rails
   replace the personal payment methods, so `POST /api/expenses` answered
   `400 "Unknown payment method"` to every expense the web UI submitted. If the
   build currently in production carries that contract, **nobody can record a
   personal expense from the UI.** Verify this against production before
   scheduling anything else (section 6).
2. **Financial accuracy corrections.** Received income is no longer confused
   with planned income, and "saved" is now named for what it is: cash flow.
   These change the numbers on the dashboard and in reports.
3. **Verification infrastructure.** CI now runs every suite; the production
   recurring audit is prepared but not run.

## 2. API backward compatibility

`/api/reports/monthly` renamed two fields. Both old names still ship, so no
consumer breaks:

| Old | New | Behaviour |
| --- | --- | --- |
| `totals.saved` | `totals.netCashFlow` | Identical value. |
| `totals.savingsRate` | `totals.netCashFlowRate` | Identical, except the old name sends `0` where the new one sends `null` ("no received income, so no rate"). The old client expected a number. |

Confirmed against a running API:

```
totals keys : income, plannedIncome, spent, netCashFlow, netCashFlowRate,
              dailyAverage, transactionCount, saved, savingsRate
netCashFlow : 750   | saved (alias)        : 750
netCashFlowRate: 75 | savingsRate (alias)  : 75
```

The aliases exist for the installed PWA, not for third parties: a client served
a cached shell runs an older bundle that reads `totals.saved`. They are marked
`@deprecated` in `reports.service.js` with the removal condition written down -
one release after the Phase 3 bundle is the only one in the wild.

**One change has no alias and cannot have one.** `snapshot.income` keeps its
name but changes meaning: it is now received income only, where before it fell
back to the planned figure when nothing had been logged. An older cached bundle
will show the new, smaller number under the old label. That is a correction, not
a regression - but it is the mechanism behind every "my income went down"
question support will get.

## 3. Frontend asset caching

`apps/web/public/sw.js`, reviewed:

| Request | Strategy | Release behaviour |
| --- | --- | --- |
| `/api/*` | never intercepted | Financial data is always live. Correct. |
| navigation (HTML) | network-first, cache fallback | An online user gets the new shell and the new hashed bundles immediately. |
| `/assets/*`, images, fonts | **cache-first**, revalidating in the background | Safe, because Vite emits content-hashed filenames: a new build requests new URLs. |

The residual window: `CACHE_NAME` is the constant `'hkk-pwa-v1'` and never
changes, so the cached copy of `/` from a previous deploy is kept indefinitely.
A user whose HTML fetch fails (offline, flaky network) is served that old shell,
and the old hashed assets it references are still cached, so they run the
previous version until a navigation succeeds. The deprecated API aliases in
section 2 are what make that window harmless.

**Recommended, not done here:** include the build identifier in the cache name
so a deploy retires the old shell instead of keeping it:

```js
const CACHE_NAME = `hkk-pwa-${__BUILD_ID__}`;   // define it in vite.config.js
```

Left out of this release deliberately - it changes caching behaviour for every
installed client and deserves its own change, not a line in a release that is
already moving financial figures.

## 4. Release notes: what a user will see

### Numbers that change

**Income is now what actually arrived.** Before, if a user had set a monthly
income on their profile but logged no income rows for the month, the dashboard
treated the *plan* as income. Now the plan is shown separately and never counted
as money received.

For a user with a planned income of Rs 60,000 and nothing logged this month:

| Figure | Before | After |
| --- | --- | --- |
| Income | Rs 60,000 | Rs 0 |
| Income minus spending | Rs 60,000 − spending | −(spending) |
| Footnote | "Your planned pocket money" | "Plan: Rs 60,000 (not received)" |
| Safe to spend per day | a number | Rs 0, with "Add your income to see this" |

Users who log their income see no change. Users who only set a profile figure
see their headline numbers drop to zero, and a negative "income minus spending"
once they have spent anything. **This is the correction working.** Expect
support questions; the honest answer is that the old screen was adding income
that had not arrived.

Cents are now shown where they were previously rounded away (household "left",
upcoming bills, safe-per-day, daily average).

### Wording that changes

| Where | Before | After |
| --- | --- | --- |
| Dashboard hero | "Money left this month" | "Income minus spending" |
| Household hero | "Left for the household" | "Household income minus spending" |
| Dashboard income | "Income" | "Received income" |
| Reports | "Saved", "{percent}% savings rate" | "Income minus spending", "Net flow is {percent}% of received income" |
| Budget | "Income", "Room left to budget or save" | "Planned income", "Plan left to allocate" |
| No income logged | — | "No income logged this month" |

Both English and Roman Urdu are updated together.

### Behaviour that changes

- **Expenses can be saved again** with a payment method (the blocker fix).
- **"This month" on the expenses page covers the whole month**, not up to today.
  A user east of UTC who recorded an expense after local midnight used to watch
  it vanish from the list it had just been added to.
- **Business is selectable again in Settings → Finance mode**, so switching into
  and out of it works both ways. The Personal/Business toggle stays removed from
  the header.
- **Monthly bills keep their day of the month.** A bill due on the 31st no
  longer settles permanently onto the 28th after passing through February.
- **A business owner deleting their account** now gets an accurate message
  instead of "a change happened at the same time, retry" - advice that could
  never succeed. Account deletion is still blocked for them; see section 7.

## 5. Database migration status

No migration was added, changed, or removed. `database/migrations/` holds the
same 28 files as at `ef5fc1a`.

Verified on a disposable PostgreSQL 17.6:

```
applied: 0001_initial_schema.sql … 0028_v3_offline_pos_sync.sql
pending: none
```

Before deploying, confirm production is at the same point:

```powershell
vercel env pull .env.production.local --environment=production
npm run migrate:deployed   # applies nothing when already current
```

`migrate:status` is the read-only way to look without applying:

```powershell
node -r dotenv/config -e "const m=require('./apps/api/src/infrastructure/database/migrate');m.status().then(s=>console.log('pending:',s.pending.join(', ')||'none')).finally(()=>require('./apps/api/src/infrastructure/database/pool').closePool())" dotenv_config_path=.env.production.local
```

Because no migration ships, `pending: none` is the expected answer both before
and after this release.

## 6. Release and rollback plan

### Pre-flight

1. **Establish whether the blocker is live.** Against production, send a
   personal expense with a payment method, or check the `400` rate on
   `POST /api/expenses`. If the blocker is live, this release is urgent
   remediation and should not wait on anything in section 7.
2. Confirm `pending: none` on production (section 5).
3. Confirm the CI run on the release commit is green across all six jobs.
4. Draft the user-facing note from section 4 and have support read it **before**
   deploy, not after the first ticket.

### Deploy

Normal platform deploy. Nothing special: no migration, no data backfill, no
feature flag. Preview-deploy first and check, on the preview URL:

- a personal expense saves with a payment method chosen;
- Settings → Finance mode offers four modes and switching works both ways;
- an existing Business account still opens `/business` with its data;
- the dashboard shows "Received income" and a separate plan footnote.

### Rollback

**Code rollback is sufficient and complete**, because the release contains no
schema change and writes no new column:

1. Promote the previous production deployment (platform rollback).
2. No down-migration. No data restore.
3. The only lingering effect is cosmetic: clients that cached the new shell keep
   it until a navigation succeeds, and the old bundle reads `totals.saved`,
   which the old API also sends. Nothing breaks either way.

What rollback **does not** undo: nothing. No data written by this release
differs in shape from what the previous build writes.

### Database rollback is a separate, unresolved problem

`docs/BACKUP_RESTORE_RUNBOOK.md` records that the production Supabase project
was on a Free organisation plan with **no managed backups**, no PITR, and no
verified restore path. That is not a blocker for *this* release - a code-only
release needs no database rollback - but it means **any future release that
carries a migration has no tested way back.** Resolve it before the first
schema-bearing release, not during one.

## 7. Known limitations shipping with this release

These are accepted, not fixed:

- **A business owner still cannot delete their account.** `businesses.owner_id`
  is `ON DELETE RESTRICT` and there is no ownership-transfer or
  business-close endpoint. The message is now accurate and points at support;
  the capability is Phase 3 work.
- **Production recurring drift is unverified.** The audit is prepared and
  read-only-proven (`docs/PRODUCTION_RECURRING_AUDIT.md`) but has not been run,
  because that needs authorisation to touch real finances.
- **Category names show as raw ids** for four student categories
  (`student_shopping`, `student_family`, `student_savings`, `student_emergency`)
  and are English in Roman Urdu mode throughout. The catalogue already carries
  the labels; nothing reads them. This is the direct prerequisite for Phase 3.
- **No guard on `/business` for personal-mode users.** The comment in
  `AppLayout.jsx` claims one. Server-side scoping means it is not a data leak;
  the comment and the code disagree.
