# P0 Business Mode hotfix — release runbook

**Status: prepared, verified, NOT DEPLOYED. Awaiting owner authorisation.**

This runbook covers Option A only: the minimal Business Mode hotfix. It does
not cover the larger Phase 4 candidate, which should follow separately once the
incident is closed.

---

## 1. What is being released

| | |
| --- | --- |
| Branch | `hotfix/business-mode-p0` |
| Commit | `a7b3cd4faa8e6e2e53e0d2a54bd6dd1b858e2e74` |
| Parent | `6a1f104ac522152747aed228e58fcfa399648828` — **the commit currently serving production** |
| Commits above live | **1** |
| Files changed | **7** |
| Production code changed | 142 lines in `apps/api`, all in the business module |
| Frontend changed | **none** |
| Schema / migrations changed | **none** |
| New configuration | **none** |

Every changed line in `apps/api` belongs to one of three fixes — verified by
classification, not by inspection:

```
req.user.id -> req.user._id   : 69 lines
audit client added            :  1 line
u.full_name -> u.name         :  1 line
                                ---
                                 71 replacements (142 +/- lines)
```

Nothing else. The remaining three files are `package.json` (registers the new
test), `tests/e2e/helpers.js` (sends an explicitly supplied Idempotency-Key),
and the new `tests/e2e/business-isolation.test.js`.

## 2. Deployment prerequisites — all verified

| Check | Result |
| --- | --- |
| Live commit is the hotfix's parent | **yes** — `6a1f104`, read from the Vercel REST API |
| Production migration ledger | **28 applied**, `0001`–`0028` |
| Hotfix migration filenames vs ledger | **identical** |
| Hotfix migration contents vs verified candidate | **all 28 hash identically** |
| Migration required by this release | **none** |
| New environment variable required | **none** |
| Rollback deployment available | **yes** — `dpl_A4sUt2oQWnsDyse6Ee4rDWZcrMNB`, Ready |
| Frozen worktrees modified during testing | **no** — both clean |

## 3. Deploy

No migration, no maintenance window, no write freeze, no feature flag.

1. Deploy `hotfix/business-mode-p0` at `a7b3cd4` to production.
2. Watch the first cold start. Expect a normal boot line. The startup gate
   compares the 28 migration names against the ledger and will pass.
3. Run the smoke tests in section 4 immediately.

Because no frontend file changed, the bundle users already have cached stays
valid. Only API behaviour changes.

## 4. Post-release smoke tests

Run these as a **real but synthetic account** — create a throwaway login rather
than using a real owner's. Do **not** post synthetic sales, purchases or
payments against the live database; creating one business and reading pages is
sufficient to prove the fix and leaves a single removable record.

| # | Step | Expected before | Expected after |
| --- | --- | --- | --- |
| 1 | `POST /api/business` (synthetic) | `500` | **`201`** |
| 2 | `GET /api/business` | `200`, count `0` | **`200`, count `1`** |
| 3 | `GET /api/business/:id` | `403` to its own owner | **`200`** |
| 4 | `GET /api/business/:id/dashboard` | `403` | **`200`** |
| 5 | `GET /api/business/:id/pos/sync-history` | `500` | **`200`** |
| 6 | Second account `GET /api/business/:id` | — | **`403`** |
| 7 | Second account `GET /api/business` | — | **`200`, count `0`** |
| 8 | Student/Householder dashboard loads | `200` | `200` (unchanged) |

Steps 1–5 are the incident. Steps 6–7 prove the fix did not trade correctness
for openness. Step 8 proves the other modes are untouched.

### Business onboarding verification

A brand-new account must see an empty business list (`200`, count `0`), then
after creating one must see **exactly that one**. The defect's signature was an
empty list that never filled, so this is the single most important check.

### Business membership verification

The creating account must be a member with role `owner`, and a second account
must receive `403` on every business-scoped route — not an empty list. An empty
list where a `403` belongs would mean authorization silently degraded.

### POS sync-history verification

`GET /api/business/:id/pos/sync-history` must return `200` with an array
(empty is correct for a new business). A `500` means the column fix did not
deploy.

## 5. Monitoring

For the first hour after deploy:

```bash
vercel logs <deployment-url> --status-code 500 --json      # expect: nothing
vercel logs <deployment-url> --query "business" --json     # expect: 200/304, no 500
```

**Baseline before this release:** no `500` responses appear in the retained log
window, and exactly one `/api/business` request appears (`GET`, `304`). Any
`500` after deploy is therefore new and worth investigating immediately.

Watch for:

- any `500` on `/api/business*` — the fix did not take effect;
- `403` on `/api/business/:id` for an account that just created it — the
  membership fix did not take effect;
- a rise in `4xx` on `/api/auth/*` — unrelated to this change, but would
  indicate something else broke.

## 6. Rollback

**Trigger rollback if any of these are true within the first hour:**

- a `500` appears on any `/api/business*` route;
- an owner receives `403` on a business they just created;
- any non-business route starts returning `5xx` at a rate above its baseline;
- the API fails to boot.

**Procedure:** promote `dpl_A4sUt2oQWnsDyse6Ee4rDWZcrMNB` in the Vercel
dashboard. That is sufficient and complete:

- the hotfix adds no migration, so the previous build's startup gate is
  satisfied by the same database;
- no frontend file changed, so cached bundles stay valid in both directions;
- no data written by the hotfix differs in shape from what the previous build
  writes.

Rolling back restores the broken Business mode. It does not lose data.

**Clean-up after a rollback:** any synthetic business created during smoke
testing can be removed, but note that posting ledger entries makes a business
undeletable by design (general ledger entries are immutable). Smoke testing as
specified above creates no ledger entries.

## 7. Remaining operational risks

| Risk | Status |
| --- | --- |
| Affected owner count | **UNKNOWN** — log retention does not reach the 20–21 October launch, and the aggregate count query is restricted. Not a blocker for shipping. |
| Preview verification | **BLOCKED** — all 28 Vercel environment variables are Production-scoped; zero Preview. A preview cannot reach production credentials (good) and also cannot boot (blocking). |
| Backup provision | **UNKNOWN** — whether the Supabase project has scheduled backups or PITR cannot be read from the workspace. Irrelevant to this release, which changes no schema. |
| 20 other non-atomic audit writes | Present on this branch; fixed in the Phase 4 candidate. Not P0 — they do not fail, they can only outlive a rollback. |
| Production runs a feature branch | `6a1f104` is not in `origin/main`; `main` is behind production. Worth reconciling after the incident. |
| `/api/health` does not report the build commit | "What is live" needs the Vercel API to answer. Worth adding. |

## 8. What this release deliberately excludes

Migration checksum integrity, the restore drill, the other 20 audit-atomicity
fixes, all Phase 3 Unicode and localisation work, and the browser-spec repairs.
All are in the Phase 4 candidate. None is P0, and 149 files is the wrong blast
radius for an emergency.
