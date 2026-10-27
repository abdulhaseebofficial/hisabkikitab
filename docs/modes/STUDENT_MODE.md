# Student Mode (طالب علم موڈ / Student Life)

## 1. Overview & Purpose
**Student Mode** is the foundational finance mode of **Hisabki Kitab**, specifically engineered for university students living in hostels or shared university housing across Pakistan. 

Unlike traditional financial management tools that assume regular salaries, investments, mortgages, and credit cards, Student Mode operates on the reality of student life:
- Fixed, limited monthly pocket money sent by parents or earned via part-time/tutoring/freelance work.
- High volume of small cash transactions (canteen chai, mess food, rickshaw fares, photocopy prints, mobile load).
- Hostel-specific obligations (monthly mess bills, semester fees, hostel rent).
- Peer-to-peer micro-borrowing and lending (dhabba khata, friends paying for rickshaws).

---

## 2. Behavioral Persona & System Psychology
In Student Mode:
- **Tone & Persona**: A friendly, practical senior hostel student ("hostel senior / mentor").
- **Language**: English or Roman Urdu (`roman_ur`).
- **Focus**: Daily survival budget ("Safe Daily Spend"), cutting canteen leaks, claiming mess rebates, avoiding end-of-month debt.
- **Spending Mindset**: Every rupee counts. Saving Rs 500 or Rs 1,500 is treated as a major victory.

---

## 3. Database Schema & Data Isolation
Records in Student Mode are partitioned using the column `finance_mode = 'student'`.

### Partitioned Tables:
- `expenses.finance_mode = 'student'`
- `income.finance_mode = 'student'`
- `budgets.finance_mode = 'student'`
- `debts.finance_mode = 'student'`
- `notifications.finance_mode = 'student'`

### Shared / Global Tables:
- `users`: Stores user settings (`finance_mode = 'student'`, `language = 'en' | 'roman_ur'`, `monthly_income`).
- `goals` and `goal_contributions`: Intentionally mode-agnostic. Long-term savings goals persist whether the student switches to householder mode or back.

> **Isolation Invariant**: Switching between `student` and `householder` mode updates `users.finance_mode` but **never deletes, archives, or modifies** historical records. The user sees only records matching their current mode.

---

## 4. Categories & Vocabulary (Catalogue Contract)

Defined in `@hisabkikitab/contracts/catalogue.json`:

| Category ID | English Label (`en`) | Roman Urdu Label (`roman_ur`) | Description |
|---|---|---|---|
| `Mess/Food` | Food | Khana | Hostel mess bill, canteen meals, dhaba orders |
| `Rent/Hostel Fee` | Hostel / Rent | Hostel / Kiraya | Monthly/semester hostel fees or room rent |
| `Books & Stationery` | Education | Taleem | Books, photocopies, assignment printouts, notes |
| `Travel` | Transport | Safar | Bus, metro, rickshaw, Careem, Indrive, Daewoo |
| `Mobile/Internet` | Mobile / Internet | Mobile / Internet | Jazz / Zong / Telenor / Ufone packages & cards |
| `Entertainment` | Entertainment | Tafreeh | Movies, outings, snooker, cricket matches |
| `Health` | Health | Sehat | Clinic visits, medicines, emergency doctor fees |
| `Personal Care` | Personal Care | Zaati Zaroorat | Barber, salon, toiletries, soap, laundry |
| `student_shopping` | Shopping | Kharidari | Clothes, shoes, electronics, room items |
| `student_family` | Family | Ghar Walay | Gifts for siblings or money sent back home |
| `student_savings` | Savings | Bachat | Manual savings transferred out of wallet |
| `student_emergency` | Emergency | Emergency | Unexpected urgent expenses |
| `Misc` | Other | Deegar | Unclassified (requires note) |

### Income Sources in Student Mode:
- `Pocket Money` (Jeb Kharch)
- `Part-time Job` (Part-time Kaam)
- `Scholarship` (Wazifa)
- `Freelance` (Freelance)
- `Gift` (Tohfa)
- `Other` (Deegar)

---

## 5. Key Business Logic & Calculations

### 1. Safe Daily Spend (Rozana Kharch Ki Had)
Calculated dynamically to prevent the student from running out of money before the month ends:
$$\text{Safe Daily Spend} = \frac{\text{Remaining Monthly Pocket Money}}{\text{Days Remaining in Month}}$$
Where:
- If today is within the month: $\text{daysLeft} = \text{daysInMonth} - \text{dayOfMonth} + 1$.
- If spending exceeds income, Safe Daily Spend safely clamps to $0$.

### 2. Mess Rebate Tracking
Mess charges are often fixed. When students travel home for Eid or breaks, tracking days absent allows calculating the expected mess reduction/rebate.

### 3. Overspending Alerts
- **Warning**: Triggered at 80% of category budget limit.
- **Critical**: Triggered when category spend $\ge 100\%$ of budget.
- Contextual notification generated using `notifications.json`:
  > *"You have spent PKR 4,200 against a PKR 4,000 limit for Mess/Food this month."* / *"Is mahine Mess/Food par PKR 4,200 kharch ho chuke hain jab ke had PKR 4,000 thi."*

---

## 6. AI Financial Advisor Behavior in Student Mode
Driven by `STUDENT_PROMPT` in `apps/api/src/modules/advisor/advisor.ai.js`:
- Grounded in hostel reality: mentions mess food vs dhaba food, mess rebate, sharing rickshaws/Indrive, buying second-hand textbooks, sharing Wi-Fi devices.
- Provides actionable tips of Rs 200 - 1,500 scale.
- Does not recommend investments, mutual funds, or credit cards.
- Respects safety: strictly forbids advising students to walk alone late at night or take unsafe routes to save money.

---

## 7. Frontend User Experience
- **Dashboard**: `StudentDashboard.jsx` shows Safe Daily Spend prominently, monthly pocket money bar, recent transactions, quick add expense modal (`N` keyboard shortcut), and weekly tips.
- **Bottom Navigation Bar**: Mobile-first fixed bottom bar featuring:
  - Dashboard
  - Expenses
  - Floating `+` Quick Add Button
  - Budgets
  - Advisor
