# Recurring expense scheduler

`GET /api/internal/recurring` runs the transaction-safe recurring sweep. It requires `Authorization: Bearer <CRON_SECRET>` and rejects requests when `CRON_SECRET` is missing or shorter than 16 characters. The endpoint reports only the created count. User IDs and financial descriptions are not included in its success response. Failed user sweeps make the endpoint fail, so the scheduler can alert and retry; per-occurrence uniqueness in migration 0015 protects retries.

The root `vercel.json` now declares the one production cron job:

```json
"crons": [{ "path": "/api/internal/recurring", "schedule": "5 0 * * *" }]
```

Set a strong random `CRON_SECRET` of at least 16 characters in the Vercel **Production** environment before deployment; never put it in the manifest. Vercel sends it as a Bearer header. The daily `00:05 UTC` cadence matches the existing in-process recurrence schedule; the sweep catches every due occurrence up to invocation time, and its database uniqueness permits safe retries. Vercel Hobby can delay a daily invocation within the hour, so exact 00:05 delivery is not guaranteed. Confirm the active Vercel project, plan limit, `/api` rewrite to the backend, function duration and connection budget before deployment. Use the Cron Jobs execution view and function logs to monitor each run. A 5xx or missing invocation needs investigation and alerting. In-process `node-cron` still serves long-running local hosts and is not a reliable serverless trigger.

Local verification uses a disposable PostgreSQL database to check missing/wrong/correct Bearer tokens, a successful sweep and a safe repeated sweep. Production cron execution, secret existence, timing and monitoring remain **Cannot confirm** until the provider configuration is checked and an actual invocation is observed. No production deployment has occurred.

## Monthly anchoring and month-end drift

A monthly series is anchored on a day of the month. Advancing it sets the day to
`min(anchor day, days in the target month)`, so a bill due on the 31st falls on
28 or 29 February and returns to the 31st in March. Advancing from the clamped
date alone would make February permanent: the 31st became the 28th and stayed
there for every later month. That is the historical drift this section is about.

The anchor is the template's own `date`. It is only used when it could actually
belong to the schedule being advanced - that is, when the pointer still shows
the anchor day, or was clamped to the last day of a shorter month. When it does
not fit (`date` and `next_run_at` were never on the same day, or `date` was
edited before an edit rescheduled the series) the pointer's own day is used
instead. Two reasons:

- Moving a live bill to a different day of the month on the strength of a
  mismatched `date` changes when it is due, which a user did not ask for.
- The occurrence it generates is keyed by date. `expenses_generated_occurrence_key`
  is `UNIQUE (generated_from, date) WHERE recurrence_occurrence`, so idempotency
  depends on the generated date being stable. Change the anchor and a sweep can
  create a second row for a period it has already covered, because the new date
  does not collide with the old one.

Also note that `expenses.date` is `NOT NULL DEFAULT now()`. A template inserted
without an explicit date silently anchors on the day it was created, which is
why fixtures must set `date` rather than let the default decide.

### Taking inventory before changing anything

```
node -r dotenv/config scripts/recurring-drift-inventory.js dotenv_config_path=apps/api/.env
```

Read-only: it opens the session `READ ONLY` and issues nothing but SELECTs. It
reports every recurring template grouped as consistent, drifted (the February
clamp signature), or anchor-mismatch, counts the occurrences generated per
template, flags any template with two occurrences on one date, and prints a
per-row reconciliation proposal.

Nothing is rewritten. Moving a due date changes which accounting month the next
occurrence lands in, so each proposal needs a human decision and a migration
plan. The safe default is to leave drifted pointers where they are: the
scheduler now ignores an anchor that does not fit, so those rows keep their
present day and generate no duplicates.
