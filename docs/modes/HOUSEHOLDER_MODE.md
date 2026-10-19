# Householder Mode (گھریلو موڈ / Household Finance)

## 1. Overview & Purpose
**Householder Mode** transforms **Hisabki Kitab** into a robust personal & domestic finance tracking system tailored for individuals running a household in Pakistan.

While Student Mode addresses flexible pocket money and small daily cash flows, Householder Mode focuses on:
- Major recurring utility bills (Electricity / Bijli, Sui Gas, Water / Tanker, Broadband).
- Essential monthly grocery runs (*Ghar ka rashan*).
- Education expenses (school/college fees, uniforms, vans).
- Family support (*Ghar walon ki madad*) and healthcare/medicines.
- Debt commitments, committee installments, and Zakat/charity.

---

## 2. Behavioral Persona & System Psychology
In Householder Mode:
- **Tone & Persona**: A mature, empathetic, and prudent household financial manager.
- **Language**: English or Roman Urdu (`roman_ur`).
- **Focus**: Committed obligations vs disposable income, anticipating utility spikes (e.g., summer electricity bills), planning for annual events (Eid, weddings, school admissions).
- **Core Principle**: Fixed costs come first. Telling a householder to "eat mess food" or giving generic student tips is strictly prevented.

---

## 3. Database Schema & Data Isolation
Records in Householder Mode are partitioned by `finance_mode = 'householder'`.

### Partitioned Tables:
- `expenses.finance_mode = 'householder'`
- `income.finance_mode = 'householder'`
- `budgets.finance_mode = 'householder'`
- `debts.finance_mode = 'householder'`
- `notifications.finance_mode = 'householder'`

### Constraints & Indexes:
- `budgets_unique_idx`: Unique index on `(user_id, finance_mode, year, month, category)` ensures independent category limits for household months without colliding with student months.
- `debts_finance_mode_check`: Debts created in householder mode carry `finance_mode = 'householder'`, allowing formal loan and committee tracking.
- `expenses_user_cat_date_idx` & `expenses_user_date_idx`: Partitioned queries efficiently filter by `finance_mode`.

---

## 4. Categories & Vocabulary (Catalogue Contract)

Defined in `@hisabkikitab/contracts/catalogue.json`:

| Category ID | English Label (`en`) | Roman Urdu Label (`roman_ur`) | Purpose / Notes |
|---|---|---|---|
| `groceries` | Groceries / Ration | Ghar Ka Rashan | Monthly bulk flour, oil, rice, pulses, spices |
| `house_rent` | House Rent | Ghar Ka Kiraya | Monthly apartment or house rent |
| `electricity_bill` | Electricity Bill | Bijli Ka Bill | WAPDA / K-Electric monthly consumption |
| `gas_bill` | Gas Bill | Gas Ka Bill | Sui Northern / Sui Southern gas charges |
| `water_bill` | Water Bill | Pani Ka Bill | Water supply board or private tanker loads |
| `internet` | Internet | Internet | PTCL, StormFiber, Nayatel, fiber broadband |
| `mobile` | Mobile | Mobile | Family postpaid bills & prepaid packages |
| `maintenance` | Maintenance & Repairs | Marammat | Plumbing, wiring, AC servicing, house repairs |
| `domestic_help` | Domestic Help | Ghar Ka Kaam | Maid, cook, driver, security guard salaries |
| `transport_fuel` | Transport / Fuel | Safar / Petrol | Petrol, CNG, bike maintenance, school van fares |
| `school_fees` | Education / School Fees | Taleem / School Fees | Tuition fees, textbooks, bags, uniforms |
| `healthcare` | Healthcare / Medicines | Sehat / Dawai | Prescriptions, doctor consults, medical tests |
| `children` | Children | Bachay | Pocket money, toys, formula milk, diapers |
| `family_support` | Family Support | Ghar Walon Ki Madad | Remittances to parents or extended family |
| `clothing` | Clothing | Kapray | Seasonal clothes, unstitched fabric, footwear |
| `personal_care` | Personal Care | Zaati Zaroorat | Salon, toiletries, personal hygiene |
| `dining_out` | Dining Out | Bahar Khana | Family restaurant meals, takeout, weekend treats |
| `entertainment` | Entertainment | Tafreeh | Outings, parks, streaming subscriptions |
| `insurance` | Insurance | Insurance | Health, vehicle, or life insurance premiums |
| `loan_installment` | Loan Installment | Qarz Ki Qist | Bank loans, car installments, personal loans |
| `charity_zakat` | Charity / Zakat | Sadqa / Zakat | Annual Zakat, Fitrana, Sadqah, community help |
| `savings` | Savings / Investment | Bachat / Sarmayakari | Committee deposits, gold savings, emergency fund |
| `emergency` | Emergency | Emergency | Unexpected medical or home repairs |
| `guests_events` | Guests & Events | Mehman / Taqreeb | Dawat expenses, wedding gifts, Eid spending |
| `other` | Other | Deegar | Unclassified household spend (requires note) |

### Income Sources in Householder Mode:
- `salary` (Tankhwah)
- `business_income` (Karobar Ki Aamdani)
- `freelance_income` (Freelance Aamdani)
- `rental_income` (Kiraya Aamdani)
- `investments` (Sarmayakari Munafa)
- `pension` (Pension)
- `family_contribution` (Ghar Walon Ka Hissa)
- `other` (Deegar)

---

## 5. Key Business Logic & Calculations

### 1. Committed vs. Discretionary Spending
Household budgeting calculates fixed committed liabilities before daily spend:
$$\text{Committed Costs} = \sum (\text{Rent} + \text{Utilities} + \text{School Fees} + \text{Loan Installments})$$
$$\text{Discretionary Balance} = \text{Monthly Income} - \text{Committed Costs}$$

### 2. Utility Bill Due Date Reminders
The system tracks recurring utility bills and generates proactive alerts 3 days and 1 day prior to due dates to avoid late payment surcharges.

### 3. Log Reminder Wording
Configured via `packages/contracts/notifications.json`:
- **English**: *"Nothing logged for two days. Add what the household spent while you still remember it, the small things included."*
- **Roman Urdu**: *"Do din se kuch darj nahi hua. Ghar ke kharchay abhi likh lein jab tak yaad hain, chhoti cheezein bhi."*

---

## 6. AI Financial Advisor Behavior in Householder Mode
Driven by `HOUSEHOLDER_PROMPT` in `apps/api/src/modules/advisor/advisor.ai.js`:
- Grounded in Pakistani household dynamics.
- Focuses on practical saving: buying rashan monthly in bulk rather than piecemeal, monitoring peak unit rates for electricity, setting aside funds before Eid/winter wedding seasons, keeping committees (*beesi*) manageable.
- Never assumes high-income luxuries (e.g. second car, stock portfolios).
- Tone is that of a sensible, respectful elder relative giving grounded financial counsel.

---

## 7. Frontend User Experience
- **Dashboard**: `HouseholderDashboard.jsx` highlights committed vs remaining funds, utility bill statuses, rashan budget health, and upcoming loan/committee dates.
- **Reports**: Detailed breakdown categorizing expenses by essential vs discretionary categories for transparent monthly financial audits.
