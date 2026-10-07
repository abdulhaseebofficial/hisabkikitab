# Recurring expense scheduler

`GET /api/internal/recurring` runs the transaction-safe recurring sweep. It requires `Authorization: Bearer <CRON_SECRET>` and rejects requests when `CRON_SECRET` is missing or shorter than 16 characters. The endpoint reports only the created count. User IDs and financial descriptions are not included in its success response. Failed user sweeps make the endpoint fail, so the scheduler can alert and retry; per-occurrence uniqueness in migration 0015 protects retries.

The root `vercel.json` now declares the one production cron job:

```json
"crons": [{ "path": "/api/internal/recurring", "schedule": "5 0 * * *" }]
```

Set a strong random `CRON_SECRET` of at least 16 characters in the Vercel **Production** environment before deployment; never put it in the manifest. Vercel sends it as a Bearer header. The daily `00:05 UTC` cadence matches the existing in-process recurrence schedule; the sweep catches every due occurrence up to invocation time, and its database uniqueness permits safe retries. Vercel Hobby can delay a daily invocation within the hour, so exact 00:05 delivery is not guaranteed. Confirm the active Vercel project, plan limit, `/api` rewrite to the backend, function duration and connection budget before deployment. Use the Cron Jobs execution view and function logs to monitor each run. A 5xx or missing invocation needs investigation and alerting. In-process `node-cron` still serves long-running local hosts and is not a reliable serverless trigger.

Local verification uses a disposable PostgreSQL database to check missing/wrong/correct Bearer tokens, a successful sweep and a safe repeated sweep. Production cron execution, secret existence, timing and monitoring remain **Cannot confirm** until the provider configuration is checked and an actual invocation is observed. No production deployment has occurred.
