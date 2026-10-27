# Release candidate — Phase 4 / 4A

**This document was rewritten on 28 October 2026.** Its previous version rested
on a wrong premise and reached wrong conclusions. Both are corrected below, and
the correction is recorded rather than quietly replaced, because the wrong
version was used to issue a NO-GO.

---

## 0. What the previous version got wrong

It stated that production ran `origin/main` with **21 migrations**, that this
candidate added **7 pending migrations**, and that applying them would leave the
release with **no rollback path**.

All three are false.

The error traces to a single unverified inference. Production's commit could not
be read from `vercel inspect --json` (which returns a reduced object with no
`gitSource`), so the live build was inferred from a matching vendor-bundle hash
and the deployment date. That inference pointed at `origin/main`. It was wrong.
It was labelled PARTIAL at the time — but the conclusions built on top of it
were then stated with far more confidence than their foundation supported.

**What actually settled it:** the Vercel REST API returns the deployment's git
metadata even though the CLI does not.

```
meta.githubCommitSha : 6a1f104ac522152747aed228e58fcfa399648828
meta.githubCommitRef : fix/v3-critical-business-isolation-and-responsive
```

Production runs a **feature branch**, not `main`. That commit ships 28 migration
files, not 21.

## 1. What is actually live

Verified read-only on 28 October 2026. Nothing was deployed, promoted, migrated,
restored or mutated.

| | |
| --- | --- |
| Deployment id | `dpl_A4sUt2oQWnsDyse6Ee4rDWZcrMNB` |
| Resolved from | `www.hisabkikitab.com` itself, not the deployment list |
| Live commit | `6a1f104` on `fix/v3-critical-business-isolation-and-responsive` |
| Created | 2026-10-21 01:51 PKT |
| Database | Supabase project `ojdwkjygitjrlyozkxmk`, db `postgres`, PostgreSQL 17.6, us-east-1 |
| Applied migrations | **28** (`0001`…`0028`); `0022`–`0028` applied 2026-10-20 13:47 UTC |
| Public tables | 77, of which 45 are `biz_*` |
| Health | `status: ok`, database connected, mail configured |

The live commit **is an ancestor of this candidate**, and is **not** contained in
`origin/main`. `origin/main` is behind production, not ahead of it.

## 2. The candidate needs no migration at all

The candidate's 28 migration filenames are **identical** to the 28 rows in
production's `schema_migrations`. Diffed name by name: no additions, no
removals, no renames.

Stronger than that — the schemas themselves were compared. A structural
fingerprint of production (`information_schema` and `pg_catalog` only, no row
data) was diffed against a freshly migrated local database:

| | production | candidate | |
| --- | --- | --- | --- |
| columns | 822 | 822 | identical |
| constraints | 507 | 507 | identical |
| indexes | 230 | 230 | identical |
| triggers | 96 | 96 | identical |
| sequences | 0 | 0 | identical |

**Byte-identical across all 1,660 fingerprint lines.** No schema drift, no
out-of-band change, nothing pending.

Three consequences follow:

1. **Deploying this candidate is a pure code deploy.** No migration step.
2. **Rollback is a plain redeploy.** Both builds ship the same migration set, so
   the previous deployment's startup gate is satisfied by the same database.
3. **The `0021` edit is proven harmless, not argued harmless.** Production
   applied the two-copy version on 2026-10-07; the candidate ships the one-copy
   version; the resulting schemas are identical. The removed statements were
   idempotent duplicates, and the fingerprint is the evidence.

## 3. The actual blocker: Business mode is broken in production

This replaces the previous document's headline risk, which did not exist.

The live commit `6a1f104` contains both defects found in Phase 4:

- `req.user.id` is read in **68 places** in the business controller plus the
  membership middleware. `camel()` in that same commit maps `id` to `_id`, and
  `req.user` is built by `findById` → `toApi`, so that property is always
  `undefined`.
- `createBusiness` writes its audit row on a pooled connection while the
  business row is still uncommitted, failing a foreign key and rolling the
  creation back.

Production has 45 `biz_*` tables and the business code deployed. Business mode
is therefore live, reachable, and non-functional: creating a business fails, and
every business-scoped route would answer 403 to the business's own owner.

This was **not** verified by exercising the production API, because doing so
would create real records. It is established from the deployed commit's source
together with the deployed schema, which is conclusive without touching
anything.

> **Not measured:** how many accounts are affected. Running aggregate counts
> against production was blocked by the environment's safety classifier. The
> query was `count(*)` only — no names, amounts, or rows. Re-running it with
> permission would turn "Business mode is broken" into "Business mode is broken
> for N owners", which is the difference between a defect and an incident.

## 4. Release plan

Because there is no migration, the plan is short and genuinely reversible.

### Pre-flight

1. Confirm CI is green on the release commit.
2. Confirm `npm run migrate:status` against production reports **pending: none**
   — a check that nothing has changed since this document, not a migration step.
3. Deploy to a preview first and exercise all four modes against a
   non-production database.

### Deploy

Normal platform deploy. No migration, no backfill, no feature flag, no
maintenance window, no write freeze.

On first cold start the new build logs:

```
[db] 28 migration(s) predate checksum tracking and are unverified;
     run `npm run migrate:adopt` once the running schema has been confirmed.
```

That line is informational and does not block startup — proven by dropping the
`checksum` column from a test database to reproduce production's exact ledger
shape and starting against it.

### Rollback

Promote the previous production deployment. Sufficient and complete: the
migration sets are identical, so the older build's gate is satisfied by the same
database. No down-migration, no restore, no data loss window.

### Optional, once the release is healthy

`npm run migrate:adopt` stamps content checksums onto the 28 existing ledger
rows, so a future edit to an already-applied migration is caught at startup
rather than going unnoticed the way `0021` did. It is a **write to production**
(`UPDATE schema_migrations`) and needs its own authorisation. Deferring it
indefinitely is safe; nothing depends on it.

Run it only once the running schema has been confirmed to be what these files
produce — which section 2 has now established.

## 5. Recovery posture

| | |
| --- | --- |
| Restore **mechanism** | **Verified.** `npm run restore:drill` — exact match on 77 tables, 507 constraints, 230 indexes, 96 triggers, 28 ledger rows, 11 money columns compared as exact integers; all double-entry and ownership invariants hold; 0.6s backup, 2.8s restore; the API startup gate accepts the restored copy. |
| Production **backup provision** | **Still unverified.** Whether the Supabase project carries managed backups or PITR, and with what retention, is a dashboard and billing fact this workspace cannot read. |
| Restore of production data | **Not attempted, not authorised.** The drill refuses any non-local source by design. |

The backup gap is not a blocker for *this* release, which changes no schema and
is reversible by redeploy. It remains an operational gap that will matter the
next time a migration actually ships.

## 6. Status

**Prepared, verified locally, not deployed.** No production deployment, no
production migration, no restore, no financial mutation, no customer-data
export. Production was read only: deployment metadata, the migration ledger,
schema structure, and public health endpoints.
