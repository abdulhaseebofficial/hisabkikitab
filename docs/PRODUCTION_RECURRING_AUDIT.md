# Controlled production audit: recurring schedules

A read-only inventory of the live recurring schedules, and the reconciliation
decision that follows it. Nothing here changes a financial record.

**This audit has not been run.** Production recurring drift is therefore
**unverified**. Running it needs an explicit decision by the owner of the data,
because it means connecting a developer machine to real user finances.

---

## 1. What the audit answers

| Question | How |
| --- | --- |
| How many recurring templates exist, per finance mode? | counted |
| How many monthly series sit on a day their anchor cannot explain? | the drift classification |
| Did any template ever generate two occurrences for the same date? | `generated_from` + `date` grouping |
| For each drifted series, what would honouring the anchor change? | printed as a proposal, not applied |

The drift being looked for is the February clamp. Before the anchor was
respected, a monthly series that passed through a short month kept the clamped
day forever: a rent bill due on the 31st became due on the 28th and stayed
there. See `docs/RECURRING_SCHEDULER.md` for the mechanism.

## 2. Why it cannot write

`scripts/recurring-drift-inventory.js` takes **one** pooled client, opens
`BEGIN TRANSACTION READ ONLY`, and rolls it back at the end. Postgres then
refuses `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` and every form of DDL with
error `25006`. The guarantee is the database's, not the script's good behaviour.

Before reading a single row, `assertReadOnly()` attempts a trivial write inside
a savepoint and requires it to fail with `25006`. If the write is *allowed* the
audit aborts immediately with a non-zero exit, because a connection that can
write is not the connection that was authorised.

This matters because the obvious approach is unsafe and was measured to be
unsafe: `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` applies only to
the pooled connection that ran it. A later query handed a different connection
is not read-only, and a write on it succeeds. The first version of this script
used that, and a probe created a table through it.

Enforcement is covered by `tests/db/audit-read-only.test.js`, which asserts all
ten write classes are refused, that the assertion passes under `READ ONLY`,
that it throws under `READ WRITE`, and that no probe table ever survives.

## 3. Authorisation checklist

Do not proceed until every line is true.

- [ ] The owner of the production data has explicitly approved this audit run.
- [ ] A current, restorable backup exists and its age is known. (`docs/BACKUP_RESTORE_RUNBOOK.md`)
- [ ] The connection string used is a **read-only database role**, if one exists.
      The script's own protection does not depend on this, but two
      independent layers is the right posture for production. If no read-only
      role exists, note that and continue - see section 6.
- [ ] The run is being done from a machine whose shell history and terminal
      output are acceptable places for user ids to appear. The audit prints
      template ids, user ids, finance mode, and category/description labels.
- [ ] `NODE_ENV` is **not** `test` and `ALLOW_DESTRUCTIVE_TEST_DB` is **not**
      set. Both make `assertSafeDatabaseTarget` in `pool.js` refuse the
      production host outright - correct for tests, and in the way here.

## 4. Running it

Production credentials come from the deployment platform, never from a file in
the repository.

```powershell
# 1. Pull production configuration into a file git already ignores.
vercel env pull .env.production.local --environment=production

# 2. Confirm the host is the one you intend to audit, without printing secrets.
node -e "require('dotenv').config({path:'.env.production.local'});const u=new URL(process.env.POSTGRES_URL||process.env.DATABASE_URL);console.log('host:',u.hostname,'db:',u.pathname,'user:',u.username.slice(0,4)+'***')"

# 3. Run the audit, capturing the report.
node -r dotenv/config scripts/recurring-drift-inventory.js dotenv_config_path=.env.production.local | Tee-Object -FilePath "recurring-audit-$(Get-Date -Format yyyy-MM-dd).txt"
```

Expected exit codes:

| Exit | Meaning |
| --- | --- |
| `0` | The inventory completed. Read the report. |
| `1` | It refused to run or could not connect. **Nothing was read.** The message says which. |

A `1` with `refusing to run: this connection accepted a write` means the
read-only transaction was not in force. Stop and investigate the connection
before retrying; do not work around it.

Afterwards, delete `.env.production.local` and the captured report once the
decision in section 5 is recorded, or move them somewhere that is an
appropriate home for user ids.

## 5. Reading the result, and deciding

The report ends in one of two states.

**No drift.** `monthly drifted: 0` and `anchor mismatch: 0`. Record the counts
and the date in the release notes. Nothing further to do.

**Drift present.** Each affected template prints its current next due date and
the date it would resume on if the anchor were honoured. For each one, choose:

| Option | When | Consequence |
| --- | --- | --- |
| **Leave it** (default) | Almost always | The scheduler already ignores an anchor that does not fit, so the series keeps its present day and generates no duplicates. The bill stays on the day the user has been paying it on. |
| **Re-anchor it** | The user has complained that the date moved, or the day is contractually fixed (rent) | Moves the next occurrence. **This can change which accounting month it lands in.** Needs the user told, a written migration plan, and a before/after total for the affected months. |

Do not batch-apply the proposals. There is no script to do it and that is
deliberate: each row is one person's bill.

If any template reports **two occurrences on one date**, that is a different and
more serious finding - a duplicate charge in someone's ledger. Treat it as an
incident, not a reconciliation: identify the rows, confirm with the user, and
correct them individually with a recorded reason.

## 6. Hardening to do before a second audit

Not blockers for the first run, but each removes a reason to be nervous:

1. **A read-only database role.** `GRANT CONNECT`, `USAGE` on the schema and
   `SELECT` on the tables, nothing else. Then the audit cannot write even if
   every application-level protection were removed.
2. **Pin the pool to one connection** for audit runs (`PG_POOL_MAX=1`). The
   single-client transaction already makes this unnecessary; it makes the intent
   obvious to the next reader.
3. **Redact the labels.** The report prints category and description, which are
   user-authored text. A `--counts-only` mode would answer "is there drift?"
   without putting anybody's bill names in a terminal.

## 7. What this audit does not cover

- **Business recurring expenses.** `biz_recurring_expenses` (migration 0027) is
  a separate subsystem with its own schedule, occurrence ledger and dedup
  invariant. This script only reads the personal `expenses` table. A business
  audit is separate work.
- **Shared Living bills.** `sl_bills` has its own occurrence handling
  (migration 0021) and is not inventoried here.
- **Whether a past occurrence was correct.** The audit reports the shape of the
  schedule, not whether each historical row should have been created.
