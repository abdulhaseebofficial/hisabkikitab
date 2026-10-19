# Public Content, Tools & Trust Modules Documentation

## 1. Overview
Beyond authenticated accounting, **Hisabki Kitab** includes public-facing educational, utility, and compliance modules accessible to visitors before registering:
1. **Learn**: Financial literacy articles written specifically for hostel students and domestic households in Pakistan.
2. **Tools**: Free interactive web calculators.
3. **Trust**: Institutional compliance pages (About, Contact, Privacy Policy, Terms of Service, Disclaimer).

---

## 2. Learn Module (`apps/web/src/features/learn`)

### Purpose:
Provides actionable financial education grounded in Pakistani realities (e.g. inflation, currency devaluations, irregular incomes, mess food budgeting, committee pitfalls).

### Article Catalog (`articles-index.json`):
1. `beginners-guide-to-personal-budgeting` — Beginner's roadmap to budgeting in Pakistan.
2. `how-to-manage-household-expenses` — Balancing utilities, groceries, and domestic help.
3. `how-to-split-expenses-with-roommates` — Fair sharing rules for flatmates and hostel rooms.
4. `how-to-track-money-you-lend-and-borrow` — Managing informal debts (*Udhaar*) without ruining relationships.
5. `emergency-fund-how-much-should-you-save` — Building a buffer against medical emergencies and price shocks.
6. `how-freelancers-can-manage-irregular-income` — Smoothing cash flows for digital freelancers and gig workers.
7. `how-to-create-a-monthly-budget` — Step-by-step 50/30/20 adaptation for low-income brackets.
8. `how-to-reduce-unnecessary-spending` — Identifying canteen leaks and digital micro-transactions.
9. `how-to-save-money-every-month` — Practical habits for hostel students.
10. `how-to-set-financial-goals` — Structuring realistic short-term and long-term milestones.

### SEO & Server Pre-rendering:
- Public routes (`/learn/*`) are statically pre-rendered via `prerender.jsx` to maximize Google Search visibility.
- Structured JSON-LD schema (Article, BreadcrumbList) embedded on every article.
- Supports instant bilingual toggle between English and Roman Urdu.

---

## 3. Financial Tools Module (`apps/web/src/features/tools`)

Interactive, zero-login calculators available under `/tools`:
1. **Daily Safe Spend Calculator**: Inputs monthly pocket money and days remaining to determine the exact daily spending envelope.
2. **Mess Rebate Calculator**: Calculates the reimbursement students can claim from the hostel warden when traveling home for holidays.
3. **Debt Payoff Plan Calculator**: Projects repayment timelines for borrowed amounts across weekly or monthly installments.
4. **Roommate Expense Splitter**: Standalone split calculator previewing equal, percentage, and weighted allocations.

---

## 4. Trust & Legal Module (`apps/web/src/features/trust`)

Accessible under dedicated URLs (`/about`, `/contact`, `/privacy`, `/terms`, `/disclaimer`):
- **About**: Origin story of Hisabki Kitab, mission for university students in Pakistan.
- **Privacy Policy**: Explicit disclosure of data minimization — passwords hashed with bcrypt, access tokens ephemeral, refresh tokens hashed, no sale of user data, Google OAuth data privacy.
- **Terms of Service**: Acceptable use policy, account deletion rights, data export rights.
- **Financial Disclaimer**: Clear notice that Hisabki Kitab and its AI Advisor provide informational financial tracking and not certified professional banking or investment advice.
- **Contact**: Direct communication links to the developer (Email, LinkedIn, feedback form).
