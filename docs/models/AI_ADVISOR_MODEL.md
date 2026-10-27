# AI Financial Advisor Model Documentation

## 1. Overview
The **AI Financial Advisor** is the flagship intelligent feature of **Hisabki Kitab**. It delivers personalized, culturally attuned financial advice for university hostel students and household managers in Pakistan.

---

## 2. Architecture & Security Invariants
- **Backend-Only Service**: The AI API keys (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) never touch the frontend or browser.
- **Fail-Safe Multi-Tier Chain**:
  ```
  Primary: Anthropic Claude (Messages API / Claude 3.5 Sonnet / Haiku)
     ↓ (If unavailable or unconfigured)
  Secondary: Google Gemini API
     ↓ (If unavailable or unconfigured)
  Fallback: Deterministic Rule-Based Financial Advisor (aiPowered: false)
  ```
- **Zero Downtime / Graceful Degradation**: If no external AI provider is configured or an API error occurs, the rule-based engine generates grounded numerical advice immediately. No user-facing error is thrown.

---

## 3. Mode-Specific AI Personas

### 1. Student Persona (`STUDENT_PROMPT`)
- **Archetype**: A practical, friendly senior hostel student ("hostel senior / mentor").
- **Target Audience**: Students aged 18–24 surviving on monthly pocket money.
- **Domain Context**: Hostel mess food, dhaba chai and parathas, rickshaw/Careem rides, Daewoo/train tickets home for Eid, mobile data loads (Jazz, Zong, Telenor), photocopies, and stationery.
- **Advice Scale**: Realistic Rs 200 to Rs 1,500 savings suggestions.
- **Language Adaptability**: Responds in English or natural Roman Urdu (`roman_ur`) without Urdu script, preserving numeric integrity.

### 2. Householder Persona (`HOUSEHOLDER_PROMPT`)
- **Archetype**: A mature, empathetic, and prudent household financial counselor.
- **Target Audience**: Adults responsible for domestic finances and family obligations.
- **Domain Context**: Monthly rashan purchases, utility bills (electricity, Sui gas, water tankers, Wi-Fi), school fees, medical prescriptions, domestic staff wages, loan/committee installments, and Zakat.
- **Advice Scale**: Rs 2,000 to Rs 15,000 optimization strategies.

### 3. Non-Negotiable Shared Safety Rules (`SHARED_RULES`)
1. **Physical Safety First**: The advisor must never advise users to walk alone late at night, skip a secure ride, or compromise personal safety to save money.
2. **Numeric Grounding**: Advice must quote actual user numbers and categories; hallucinated figures are forbidden.
3. **No Shaming / Moralizing**: Warm and constructive tone; no judgmental lecturing.

---

## 4. Financial Snapshot Context Generation
Before querying the LLM, the backend compiles a deterministic numerical summary (`snapshotToText` in `advisor.ai.js`):
- Monthly income / pocket money.
- Total spent so far & remaining balance.
- Days remaining in month & safe daily spend.
- Spending breakdown by category (amount and percentage).
- Active budget limits and alerts.
- Active savings goals and deadlines.

---

## 5. Endpoints & Capabilities

| Endpoint | Method | Format | Description |
|---|---|---|---|
| `/api/ai/chat` | `POST` | Markdown stream/JSON | Interactive conversational advisor grounded in the user's live financial data |
| `/api/ai/advice` | `GET` | Structured JSON | 3–5 concrete, actionable financial tips returned as a checklist |
| `/api/ai/suggested-budget` | `GET` | Structured JSON | Recommended category limits tailored to user's actual spending patterns |
| `/api/ai/tip-of-the-day` | `GET` | JSON | Cached daily financial insight displayed on the dashboard |
| `/api/ai/weekly-wrapup` | `GET` | JSON | Weekly spending review highlighting successes and a challenge for next week |

---

## 6. Structured Output Format (Suggested Budget)

The advisor outputs deterministic JSON matching this contract:
```json
{
  "totalIncome": 25000,
  "suggestedSavings": 3500,
  "categories": [
    { "category": "Mess/Food", "limit": 10000, "rationale": "Covers monthly mess fee with a small cushion." },
    { "category": "Travel", "limit": 3000, "rationale": "Shared rickshaw rides to campus." },
    { "category": "Mobile/Internet", "limit": 1500, "rationale": "Monthly student data package." }
  ],
  "aiPowered": true
}
```
Users can apply this entire plan to their actual `budgets` table with one click.

---

## 7. Chat Messages Database Schema (`chat_messages`)

The conversational advisor session is persisted in PostgreSQL so chat history survives browser refreshes and tab closures:

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_user_idx ON chat_messages (user_id, created_at);
```

### Persistence Features:
- Replays the most recent 20 messages in chronological order as model context to avoid token limits while retaining conversational memory.
- `DELETE /api/ai/chat` allows the user to clear their chat history at any time.

