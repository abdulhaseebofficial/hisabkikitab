# Accounting timezone and period policy

**Status:** describes the behaviour verified in Phase 2.5. Nothing here changes a
historical accounting period; see "Changing this later" at the end.

## The rule

**One accounting month, defined in UTC, for every personal finance mode.**

A month runs from `YYYY-MM-01T00:00:00.000Z` to the last millisecond of that
month, also in UTC. The month a transaction belongs to is decided by the UTC
instant stored against it, never by the viewer's local calendar, and never by
the server's local calendar.

This is deliberate. The alternative - resolving the month in whatever timezone
the reader happens to be in - means the same expense can sit in September for
one member of a household and October for another, and that a month total
changes when the reader boards a plane. A ledger has to add up to the same
number for everyone who opens it, so the period boundary is a property of the
data, not of the reader.

The cost is that a user in UTC+05:00 (Pakistan) who logs an expense between
05:00 local on the 1st and local midnight sees it land in the month that is
current in UTC. The window where local and UTC disagree is the first and last
few hours of each month.

## Where it is implemented

| Layer | Boundary comes from | Verified |
| --- | --- | --- |
| Period of "now" | `currentPeriod()` - `getUTCMonth()` / `getUTCFullYear()` | `apps/api/src/shared/utils/calculations.js` |
| Month start / end | `startOfCalendarMonth` / `endOfCalendarMonth` - `Date.UTC(...)` | same file |
| Dashboard | `buildSnapshot` via `currentPeriod()`; client asks with `getUTCMonth()` | `analytics.service.js`, `DashboardPage.jsx` |
| Reports | `monthly()` via `startOfCalendarMonth` / `endOfCalendarMonth` | `reports.service.js`, `ReportsPage.jsx` |
| Budget | `currentPeriod()`; client period from `getUTCMonth()` | `budgets.service.js`, `BudgetPage.jsx` |
| Income | `currentPeriod()` + UTC month bounds | `income.service.js`, `income.repository.js` |
| Expense filters | the local calendar day, read as UTC bounds by the API - see below | `ExpenseFilters.jsx` |
| Recurring schedules | `next_run_at` advanced with `setUTC*` only | `recurringExpenses.job.js` |
| Shared Living | `YYYY-MM` keys from `toISOString()`, `sl_periods.month` a `date` pinned to day 1 | `sharedLiving.calculations.js`, migration 0010 |

A `date` / `timestamptz` column is always written as a UTC instant, so the
database agrees with the application without a session timezone setting.

## The one place the local calendar is used on purpose

The two date inputs on the expenses page, and the presets that fill them, are
**local calendar days**. So is the date a new expense is dated with
(`ExpenseForm` defaults to `toInputDate(new Date())`). The server then reads each
`YYYY-MM-DD` as a UTC bound, so the stored instant and the accounting month are
still UTC.

This has to stay consistent across the three of them. It briefly did not: the
presets were moved to the UTC calendar day while the form kept defaulting to the
local one, and ending "This month" at the UTC "today" meant a person east of UTC
who recorded an expense after local midnight watched it vanish from the list it
was just added to - the row was dated 5 October local while the range still
ended 4 October UTC. "This month" now runs to the end of the month rather than
to today, which also keeps a deliberately post-dated expense visible.

If these are ever moved to the UTC calendar, the expense form's default date has
to move with them, or the same class of bug comes back.

## Deliberate exceptions

These are not accounting-period boundaries and do not follow the rule:

- **Relative windows.** The upcoming-bill horizon (`dashboard.service.js`) and
  the notification lookback (`notifications.service.js`) move a date by N days
  with local-time `setDate`. On the deployment host (UTC) this is identical to
  UTC arithmetic; on a developer machine in another zone it shifts by the
  offset. They select a rolling window, never a month total, so a few hours
  either way changes nothing that is reported as a figure.
- **Goal pacing.** `daysBetween` / `goalPace` count days to a deadline through
  local-time `startOfDay` / `endOfDay`. Same reasoning: a countdown, not a
  period boundary.
- **Business fiscal year.** Business mode has its own `financial_year_start`
  on the business record and defaults some report filters from local
  `getFullYear()` (`business.service.js`, `BusinessReportsPage.jsx`). Business
  accounting is a separate domain from the personal UTC accounting month and is
  out of scope for this policy.

## Writing dates from SQL

`expenses.date`, `income.date` and `next_run_at` are `timestamptz`. A bare
`'2025-06-28'` handed to Postgres is read in the **session** timezone, not UTC,
so a script run on a machine at UTC+05:00 stores `2025-06-27T19:00:00Z` and the
row lands in the wrong day - and, at a month boundary, the wrong accounting
month. The application never does this: the expense service normalises a
`YYYY-MM-DD` body field to UTC midnight before it reaches SQL. Seeds, migrations
and one-off scripts must pass a full instant (`'2025-06-28T00:00:00Z'`) or cast
explicitly.

## A trap to be aware of

`calculations.js` also exports `startOfMonth` / `endOfMonth`, which build
**local-time** month boundaries. No application code calls them - only their own
unit test does. Mixing either of them with `currentPeriod()` would produce month
bounds in one timezone and a month number in another, which is an off-by-one
month at every boundary. New period code must use the `*CalendarMonth` pair.

## Behaviour at the edges

- **Local midnight.** Nothing happens. The period only changes on UTC
  boundaries.
- **Month end.** An expense stored at `2026-10-31T20:00:00Z` is October
  everywhere. For a reader in UTC+05:00 that is 01:00 on 1 November local, and
  it still counts as October. This is the intended trade-off.
- **Year end.** `previousPeriod` wraps December to the prior year explicitly, so
  the January dashboard compares against December of the year before.
- **Regional offsets.** Verified in `tests/browser/expense-date-boundary.spec.js`
  (a locally-entered date survives the round trip and is included by "This
  month") and `tests/db/date-boundaries.test.js` /
  `tests/unit/date-boundaries.test.js`.
- **DST.** No personal accounting boundary uses local time, so there is no
  spring-forward or fall-back case to handle. Pakistan observes no DST.

## Changing this later

Moving to per-user timezones would re-bucket transactions that already sit in a
reported month, which changes totals a user has seen and may have acted on. It
is a data migration, not a configuration flag, and needs:

1. A `timezone` column on `users`, defaulted from the account's region.
2. A decision, written down, on whether history is re-bucketed or frozen - and
   if frozen, a cut-over date before which UTC continues to apply.
3. A reconciliation report proving each affected month's total before and after.

Until that exists, do not change the boundary helpers.
