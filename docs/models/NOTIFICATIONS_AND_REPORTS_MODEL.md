# Notifications & Reports Model Documentation

## 1. Overview
The **Notifications & Reports** subsystem handles system alerts, budget/goal trigger monitoring, monthly financial summaries, and export capabilities (PDF & CSV) across **Hisabki Kitab**.

---

## 2. In-App Notification System

### Database Schema: `notifications`
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finance_mode  text NOT NULL DEFAULT 'student' CHECK (finance_mode IN ('student', 'householder')),
  type          text NOT NULL,
  title         text NOT NULL,
  message       text NOT NULL,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key    text NOT NULL,
  read          boolean NOT NULL DEFAULT false,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Prevents notification spam
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_idx 
  ON notifications (user_id, dedupe_key);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx 
  ON notifications (user_id, finance_mode, read, created_at DESC);
```

### Key Architectural Invariants:
1. **Idempotent Deduplication**: Each alert calculates a `dedupeKey` (e.g. `overspend:Mess/Food:2026-10`). The unique database index swallows duplicate inserts cleanly using `ON CONFLICT DO NOTHING`.
2. **Metadata-Driven Translation**: The database stores the abstract translation **KEY** and values in `meta` rather than fixed strings. If a user switches from English to Roman Urdu, alerts rendered from history adapt dynamically to the user's current language.
3. **Mode-Specific Wording**: Notifications adjust their tone and context depending on whether the user is in `student` or `householder` mode (e.g. household rashan reminders vs student pocket money reminders).

### Standard Notification Types:
- `overspendWarning`: Spent $> 80\%$ of category budget.
- `overspendOver`: Spent $\ge 100\%$ of category budget limit.
- `goalDueSoon`: Savings goal deadline approaching within 7 days.
- `goalOverdue`: Savings goal deadline passed without reaching target.
- `billDue`: Recurring bill due within 3 days.
- `logReminder`: Inactivity alert triggered after 48 hours without logging an expense.

---

## 3. Reports & Analytics Engine

### 1. Analytics & Dashboard Aggregation
Implemented in `apps/api/src/modules/analytics/analytics.service.js`:
- **Current vs Previous Month**: Category-by-category spending comparison with percentage delta.
- **Spending Velocity**:
  $$\text{Daily Average Spend} = \frac{\text{Total Month Spend}}{\text{Days Elapsed}}$$
  $$\text{Safe Daily Spend} = \max\left(0, \frac{\text{Remaining Budget}}{\text{Days Remaining}}\right)$$
- **Top Category Identification**: Determines where the highest proportion of funds is leaking.

### 2. PDF Export
- Generated server-side using `pdfkit`.
- Custom-tailored layout including:
  - Header with user details and date range.
  - Financial health scorecard (Income, Total Spent, Net Savings).
  - Categorized spending breakdown with percentage shares.
  - Complete transaction audit ledger.

### 3. CSV Export
- Hand-rolled RFC 4180 compliant CSV generator (`apps/api/src/modules/reports/reports.csv.js`).
- Safely sanitizes CSV injection risks (prepends single quote to cells beginning with `=`, `+`, `-`, or `@`).
- Exports transactions for the active mode with columns: Date, Category, Description, Payment Method, Amount.

---

## 4. API Endpoints

| Method | Path | Description | Protected |
|---|---|---|:---:|
| `GET` | `/api/notifications` | List unread and recent notifications for current mode | Yes |
| `PATCH` | `/api/notifications/:id/read` | Mark single notification as read | Yes |
| `POST` | `/api/notifications/read-all` | Mark all notifications as read | Yes |
| `GET` | `/api/reports/monthly` | Get aggregated financial summary for a given month/year | Yes |
| `GET` | `/api/reports/export/pdf` | Stream generated PDF report for a given month | Yes |
| `GET` | `/api/reports/export/csv` | Stream CSV spreadsheet export of transactions | Yes |
