# Release candidate — Phase 4

What this candidate contains, how it differs from what is actually live, and
the one thing about it that is genuinely dangerous.

**This document supersedes `docs/RELEASE_READINESS.md` section 5 and 6 for this
candidate.** That document was written against this branch's own base commit
(`ef5fc1a`), where the migration set was already 28 files, so it concluded "no
schema change, rollback is a redeploy". Measured against **production** rather
than against this branch, both conclusions are wrong. The old document remains
accurate for the release it describes.

---

## 1. What is actually live

Verified read-only on 2026-10-27, no changes made:

| | |
| --- | --- |
| Deployment id | `dpl_A4sUt2oQWnsDyse6Ee4rDWZcrMNB` |
| Deployment URL | `hisabkikitab-otpacac9f-abdul-haseeb-projects.vercel.app` |
| Aliases | `www.hisabkikitab.com`, `hisabkikitab.com` |
| Created | 2026-10-21 01:51 PKT |
| Status | Ready, production target |
| `/api/health` | `status: ok`, `database: connected`, `mail: configured`, `ai: fallback mode` |
| Migration ledger | matches its deployed build exactly — see below |

**How the ledger is known to match.** `/api/health` sits *above* the bootstrap
gate on purpose and only runs `SELECT 1`, so it proves reachability, not
correctness. `/api/auth/config` sits *behind* the gate and returns `200`, which
means `connectDB()` completed — and `connectDB()` refuses to open the database
unless the applied migrations are exactly the set this build ships.

**Live commit: PARTIAL.** `vercel inspect --json` returns a reduced object with
no `gitSource` or `meta`, so the CLI cannot give the commit SHA. What is
established: the live `vendor-BNXpOteY.js` bundle hash is **byte-identical** to
a local build of this branch, so production's dependency tree matches ours
exactly; the `index-*` hashes differ, as expected from changed application code.
`origin/main` is at `96ddcca` (2026-10-19) and the deployment was created
2026-10-21, which is consistent with `origin/main` being live but does not
prove it.

> **Recommendation:** add the build commit to `/api/health`. "Which commit is
> live" is currently not answerable from outside the Vercel dashboard, which is
> precisely the question every incident starts with.

## 2. What this candidate changes relative to production

| | |
| --- | --- |
| Candidate HEAD | `fix/v3-desktop-mode-isolation-repairs` |
| Commits ahead of `origin/main` | 36 |
| Commits behind | 0 — `origin/main` is an ancestor of HEAD |
| **Migrations added** | **7** (`0022` … `0028`) |
| Migrations modified | 1 (`0021`, benign — see below) |
| API breaking change | No |

Production ships 21 migration files. This candidate ships 28.

`0021_shared_bill_occurrence.sql` was edited to delete an accidentally
duplicated block. Both copies were idempotent (`ADD COLUMN IF NOT EXISTS`,
`SET DEFAULT`), so a database that applied the old text has exactly the schema
the new text produces. Editing an already-applied migration is normally unsafe
— the gate compares file *names*, not contents, so a semantic change would go
undetected. This one is safe; the next one might not be.

## 3. The dangerous part: this release cannot be rolled back by redeploy

`connectDB()` fails closed in **both** directions, and the currently deployed
build contains the same gate:

- **pending** migrations (code ahead of database) → refuses to start.
- **unexpected** applied migrations (database ahead of code) → refuses to start.

The consequence, stated plainly:

1. This candidate cannot be deployed until `0022`–`0028` are applied, or it
   will refuse to serve.
2. **Once those 7 migrations are applied, promoting the current production
   deployment will not bring the site back.** That older build ships 21
   migration files, would see 7 unexpected ones, and would refuse to start.

So the usual escape hatch — promote the previous deployment — is unavailable
for this release. Rolling back would require a **down-migration or a database
restore**, and:

`docs/BACKUP_RESTORE_RUNBOOK.md` records the production Supabase project on a
Free organisation plan with **no managed backups, no PITR, and no verified
restore path.** No down-migrations exist in this repo.

**Therefore: between applying the migrations and confirming the release is
healthy, there is no tested way back.** That is not a reason to block the
release, but it is a decision the owner must make knowingly rather than
discover during an incident.

The gate itself is correct and should not be weakened. A financial application
serving reads and writes against a schema it does not understand is the worse
outcome. The problem to fix is the missing backup, not the gate.

### What would make this reversible

In rough order of value:

1. **A verified backup and restore drill** on a paid plan, per the existing
   runbook. This is the real blocker and it is an owner/billing decision, not
   a code change.
2. **Down-migrations for `0022`–`0028`.** Checked: none of the seven destroys
   data — six are purely additive (new `biz_*` tables, a demo flag), and the
   one apparent exception, `0025`, drops and immediately re-adds the
   `users_finance_mode_check` constraint to widen it rather than removing
   anything.

   That makes the schema itself tolerable to an older build, but it does **not**
   make rollback safe, and the gate should not be relaxed on that basis. Once
   `0025` widens the constraint, users can be in `finance_mode = 'business'`
   and `biz_*` rows can exist. The 21-migration build has no code for either.
   Rolling back to it would strand those accounts in a mode it cannot render
   and financial records it cannot read. The schema would load; the data would
   not make sense. Failing closed is the better of the two outcomes.
3. **The commit SHA in `/api/health`**, so the live build is identifiable.

## 4. Pre-flight for this candidate

1. Confirm the owner accepts section 3 — no rollback path — in writing.
2. Resolve the backup gap first if that answer is no. **Stop here.**
3. Read production's ledger without touching it:
   `npm run migrate:status` against the production URL. Expect `pending:
   0022 … 0028`.
4. Confirm CI is green on the release commit across all seven jobs.
5. Deploy to a **preview** first and exercise the four modes against a
   non-production database.

## 5. Deploy order

Unlike the previous release, order matters and is not interchangeable:

1. Apply `0022`–`0028` through the approved CLI (`npm run migrate:deployed`).
   Never at startup — the gate exists to prevent exactly that.
2. Deploy the build.

Between steps 1 and 2 the **currently live build is already broken**: it will
see 7 unexpected migrations at its next cold start and refuse to serve. This
window is not zero on a serverless platform, where instances recycle
unpredictably.

> Keep the window as short as possible, and treat step 1 as the point of no
> return rather than step 2.

## 6. Status

**NOT AUTHORISED FOR PRODUCTION.** Prepared and verified locally only.

Tagged locally as `release/phase4-rc-20261027`. The regression below was run
at `b2a04eb`; the tag adds only documentation on top, no code or test changes.
**Not pushed**, no
deployment was made, and no production data was read or written beyond the
public read-only endpoints quoted in section 1.

Full regression on the tagged commit, against a disposable PostgreSQL 17.6:

| suite | result |
| --- | --- |
| Browser (Playwright, 2 projects) | 146 passed, 0 failed, 2 skipped |
| Unit | 344 / 344 |
| Web (Vitest, 41 files) | 355 / 355 |
| Database integration | 87 / 87 |
| E2E API | 548 / 548 |
| Migrations, security, SEO, 4 architecture checks | exit 0 |
| Production build | exit 0 |
