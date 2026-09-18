/**
 * aiService — the only place in the codebase that talks to the Claude API.
 *
 * Design notes
 *  - The API key never leaves the server. The frontend calls /api/ai/* and this
 *    module makes the outbound request.
 *  - Every function degrades gracefully: if ANTHROPIC_API_KEY is missing or the
 *    API call fails, a deterministic rule-based advisor answers instead and the
 *    response is flagged with `aiPowered: false`. The product keeps working.
 *  - Structured endpoints (advice, budget suggestion) use the Messages API
 *    structured-output format so the frontend gets predictable JSON rather than
 *    prose it has to parse with regexes.
 */

const ai = require('../../infrastructure/ai');
const { FALLBACK_BUDGET_SPLIT, DEFAULT_CATEGORIES } = require('../../shared/constants');
const { round2 } = require('../../shared/utils/calculations');
const { modeOf } = require('../../shared/categories');
const { safeLanguage } = require('@hisabkikitab/contracts/catalogue');

/* ----------------------------- helpers ------------------------------ */

// Indian grouping (1,25,000) only applies to INR; PKR and the rest read
// naturally with western grouping (125,000).
const localeFor = (currency) => (currency === 'INR' ? 'en-IN' : currency === 'PKR' ? 'en-PK' : 'en-US');

/**
 * Money as the advisor should say it: whole units, no paisa.
 *
 * Student money is round money. "Keep it under PKR 2,032.67 a day" is both
 * unsayable and slightly absurd advice, and the dashboard tile beside it shows
 * PKR 2,033 - two different numbers for the same figure reads as a bug.
 */
const money = (currency, n) =>
  `${currency} ${Math.round(Number(n) || 0).toLocaleString(localeFor(currency))}`;

/**
 * Renders the caller's spending snapshot as a compact, readable block of text.
 * Keeping it deterministic (sorted, fixed field order) means the system-prompt
 * prefix stays cache friendly across calls.
 */
const snapshotToText = (snapshot, currency = 'INR') => {
  const {
    monthLabel,
    income,
    totalSpent,
    remaining,
    breakdown = [],
    budgets = [],
    goals = [],
    daysLeftInMonth,
    previousMonthSpent,
    topCategory,
    dailyAverage,
  } = snapshot;

  const lines = [];
  lines.push(`Period: ${monthLabel}`);
  lines.push(`Monthly income / pocket money: ${money(currency, income)}`);
  lines.push(`Spent so far: ${money(currency, totalSpent)}`);
  lines.push(`Money left: ${money(currency, remaining)}`);
  lines.push(`Days remaining in the month: ${daysLeftInMonth}`);
  lines.push(`Average spend per day so far: ${money(currency, dailyAverage)}`);
  if (previousMonthSpent != null) {
    lines.push(`Last month total spend: ${money(currency, previousMonthSpent)}`);
  }
  if (topCategory) lines.push(`Biggest category this month: ${topCategory}`);

  lines.push('');
  lines.push('Spending by category:');
  if (breakdown.length === 0) {
    lines.push('  (no expenses logged yet this month)');
  } else {
    breakdown.forEach((b) => {
      lines.push(`  - ${b.category}: ${money(currency, b.amount)} (${b.percent}% of spending)`);
    });
  }

  if (budgets.length) {
    lines.push('');
    lines.push('Category budgets set by the student (limit vs spent):');
    budgets.forEach((b) => {
      lines.push(
        `  - ${b.category}: limit ${money(currency, b.limit)}, spent ${money(currency, b.spent)} (${b.status})`
      );
    });
  }

  if (goals.length) {
    lines.push('');
    lines.push('Active savings goals:');
    goals.forEach((g) => {
      const due = g.deadline ? new Date(g.deadline).toISOString().slice(0, 10) : 'no deadline';
      lines.push(
        `  - ${g.title}: saved ${money(currency, g.savedAmount)} of ${money(currency, g.targetAmount)} (${g.progress}%), due ${due}`
      );
    });
  }

  return lines.join('\n');
};

/**
 * How every piece of advice ends, whichever mode and language it is in.
 *
 * These are the rules that are not about who the reader is: honesty about the
 * data, no shaming, no advice that trades money for safety.
 */
const SHARED_RULES = [
  '- Be specific and numeric. Refer to their real categories and real amounts, never generic filler like "make a budget".',
  '- If the data is thin (few or no expenses logged), say so kindly and give starter advice instead of inventing numbers.',
  '- Never invent transactions, balances or facts that were not in the data you were given.',
  '- Be warm and encouraging. Never shame them for spending. No lecturing, no moralising, no "you should have".',
  '- Never assume their gender, and never assume who they live with or how they get around.',
  '- Never suggest saving money in a way that costs personal safety. Do not propose walking alone at night,',
  '  skipping a ride home after dark, or leaving somewhere late to avoid a fare. If a cheaper option is only',
  '  safe in daylight or in a group, say that plainly.',
];

/**
 * The advisor persona for someone running a household.
 *
 * Written separately rather than by softening the student one, because the two
 * lives share almost no advice. Telling someone who is paying an electricity
 * bill and school fees to eat the mess food they already paid for is not
 * merely useless - it says the app has not understood them at all.
 */
const HOUSEHOLDER_PROMPT = [
  'You are Hisab Ki Kitab, a warm and practical money coach for someone running a household in Pakistan.',
  '',
  'Who you are talking to: an adult responsible for a home. Their month is shaped by obligations that arrive whether',
  'or not anyone planned for them - house rent, the electricity bill in a hot month, gas, water, internet and mobile',
  'packages, the grocery run, school fees and uniforms, medicines and a doctor visit, fuel or fares, help sent to',
  'family, an installment or a committee, zakat and charity, and guests who arrive on short notice.',
  '',
  'How you advise:',
  '- Their fixed costs come first. Advice that ignores rent, bills and fees is advice they cannot use.',
  '- Amounts are meaningful. Trimming a few thousand rupees a month is a real result for a household, so treat it as one.',
  '- Respect how households here actually save: buying rashan monthly rather than daily, comparing bijli usage month to',
  '  month, sharing a ride or an internet package, keeping something aside before Eid or a wedding season, and being',
  '  careful with installments and committees rather than pretending they do not exist.',
  '- Never assume there is a second income, a car, savings, or a bank account.',
  ...SHARED_RULES,
  '- Plain English, the way a sensible relative would talk. An occasional everyday Urdu word is fine.',
  '- Keep it short.',
].join('\n');

/**
 * The advisor persona for a student.
 *
 * Deliberately stable text so the cached prefix is reused across requests -
 * which is still true now that there is one prompt per mode: the text a given
 * person sends does not change between requests.
 */
const STUDENT_PROMPT = [
  'You are Hisab Ki Kitab, a warm and practical money coach for a university student living in a hostel in Pakistan.',
  '',
  'Who you are talking to: a student aged roughly 18 to 24 whose entire monthly budget is small pocket money sent',
  'from home. Their world is the hostel mess bill, chai and paratha at the canteen, samosas and rolls from the dhaba',
  'outside the gate, rickshaw and Careem fares, a Daewoo or train ticket home for Eid, mobile load and monthly',
  'internet packages on Jazz, Zong, Ufone or Telenor, photocopies and lab files from the shop near campus, a cricket',
  'match, a cheap outing with friends, a trip to the salon or barber, and the occasional medical expense.',
  '',
  'How you advise:',
  '- Every tip must be something they could do this week without a job, a credit card, or investing knowledge.',
  '- Amounts are small on purpose. Saving 500 or 1500 rupees a month is a genuine win here, so treat it as one.',
  '- Respect Pakistani hostel life: eating the mess food they already paid for instead of ordering from the dhaba,',
  '  claiming a mess rebate when they go home, splitting a rickshaw or Careem ride with roommates, sharing a monthly',
  '  internet package, buying used books from seniors or the Sunday bazaar, booking Daewoo and train tickets early,',
  '  and watching how quickly small JazzCash and Easypaisa transfers add up.',
  // The rules that are not about who is reading come from one place, so the
  // two personas cannot quietly drift apart. This one used to carry its own
  // copy, and it had already lost a line the other kept.
  '- Write so the advice fits any student in any hostel.',
  ...SHARED_RULES,
  '- Plain English, the way a friendly senior at the hostel would talk. An occasional everyday Urdu word is fine.',
  '- Keep it short. Students skim.',
].join('\n');

/**
 * The persona for this person, plus the instruction to write in their language.
 *
 * Roman Urdu rather than Urdu script, because that is what the rest of the app
 * uses and what most people here actually type. Numbers, currency codes and
 * anything the person wrote themselves are left exactly as given - the advice
 * changes language, their records never do.
 */
const systemPromptFor = (user) => {
  const base = modeOf(user) === 'householder' ? HOUSEHOLDER_PROMPT : STUDENT_PROMPT;
  if (safeLanguage(user && user.language) !== 'roman_ur') return base;

  return [
    base,
    '',
    'Write your answer in Roman Urdu - Urdu written in English letters, the way people type it here.',
    'Do not use Urdu script. Keep numbers, amounts and currency codes as digits exactly as given, and',
    "leave category names, people's names and anything the person typed themselves unchanged.",
  ].join('\n');
};

/** Wraps an AI call so any failure downgrades to the rule-based advisor. */
const withFallback = async (label, run, fallback) => {
  if (!ai.isConfigured()) return { ...fallback(), aiPowered: false, reason: 'no_api_key' };

  try {
    const result = await run();
    return { ...result, aiPowered: true };
  } catch (err) {
    console.error(`[ai] ${label} failed; using the built-in advisor`);
    return { ...fallback(), aiPowered: false, reason: 'api_error' };
  }
};

/* --------------------- 1. Personalised advice ----------------------- */

const ADVICE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One friendly sentence summarising the month.' },
    tips: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short action, max 8 words.' },
          detail: { type: 'string', description: 'Two sentences max, with concrete numbers.' },
          category: { type: 'string', description: 'The spending category this tip targets.' },
          estimatedMonthlySaving: {
            type: 'number',
            description: 'Realistic monthly saving in the user currency.',
          },
        },
        required: ['title', 'detail', 'category', 'estimatedMonthlySaving'],
        additionalProperties: false,
      },
    },
    warning: {
      type: 'string',
      description: 'Overspending warning, or an empty string when nothing is off track.',
    },
    encouragement: { type: 'string', description: 'One short encouraging closing line.' },
  },
  required: ['headline', 'tips', 'warning', 'encouragement'],
  additionalProperties: false,
};

const getAdvice = async ({ user, snapshot, tipCount = 4 }) =>
  withFallback(
    'advice',
    async () => {
      const answer = await ai.complete({
        maxTokens: 8000,
        system: systemPromptFor(user),
        effort: 'medium',
        schema: ADVICE_SCHEMA,
        messages: [
          {
            role: 'user',
            content: [
              `Here is my money situation. Currency is ${user.currency}.`,
              '',
              snapshotToText(snapshot, user.currency),
              '',
              `Give me exactly ${tipCount} money-saving tips that fit my actual spending above.`,
              'Put the highest-impact tip first. Keep every detail field under 40 words.',
              'If a category is clearly over budget, say so in the warning field; otherwise leave warning empty.',
            ].join('\n'),
          },
        ],
      });

      return answer.json;
    },
    () => fallbackAdvice({ user, snapshot, tipCount })
  );

/* --------------------- 2. Conversational Q&A ------------------------ */

const chat = async ({ user, snapshot, history = [], message }) =>
  withFallback(
    'chat',
    async () => {
      const answer = await ai.complete({
        maxTokens: 8000,
        system: systemPromptFor(user),
        effort: 'medium',
        messages: [
          // The snapshot is injected as the opening turn so the stored chat
          // history can be replayed verbatim on every request.
          {
            role: 'user',
            content: [
              `Context about me (currency ${user.currency}, name ${user.name}). Do not reply to this message`,
              'directly, just use it as background for everything I ask next.',
              '',
              snapshotToText(snapshot, user.currency),
            ].join('\n'),
          },
          { role: 'assistant', content: 'Got it, I have your numbers in front of me. Ask away!' },
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ],
      });

      return { reply: answer.text };
    },
    () => fallbackChat({ user, snapshot, message })
  );

/* ----------------------- 3. Tip of the day -------------------------- */

const dailyTip = async ({ user, snapshot }) =>
  withFallback(
    'tip',
    async () => {
      const answer = await ai.complete({
        maxTokens: 4000,
        system: systemPromptFor(user),
        effort: 'low',
        messages: [
          {
            role: 'user',
            content: [
              `Currency ${user.currency}. My numbers:`,
              '',
              snapshotToText(snapshot, user.currency),
              '',
              'Give me ONE money tip for today. Two sentences maximum, under 35 words total.',
              'Tie it to a real number from my data. Plain text only, no markdown, no preamble.',
            ].join('\n'),
          },
        ],
      });

      return { tip: answer.text };
    },
    () => fallbackTip({ user, snapshot })
  );

/* ------------------ 4. AI suggested monthly budget ------------------ */

const BUDGET_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One or two sentences explaining the plan.' },
    savingsTarget: {
      type: 'number',
      description: 'Amount to set aside each month once every category limit is funded.',
    },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          limit: { type: 'number' },
          reason: { type: 'string', description: 'Max 15 words on why this number.' },
        },
        required: ['category', 'limit', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'savingsTarget', 'categories'],
  additionalProperties: false,
};

const suggestBudget = async ({ user, snapshot, categories }) =>
  withFallback(
    'suggest-budget',
    async () => {
      const answer = await ai.complete({
        maxTokens: 8000,
        system: systemPromptFor(user),
        effort: 'medium',
        schema: BUDGET_SCHEMA,
        messages: [
          {
            role: 'user',
            content: [
              `Build me a realistic monthly budget. Currency ${user.currency}.`,
              `My monthly income is ${money(user.currency, user.monthlyIncome)}.`,
              '',
              'My recent spending pattern:',
              snapshotToText(snapshot, user.currency),
              '',
              `Use only these categories: ${categories.join(', ')}.`,
              'Rules: every category gets a limit (0 is fine if I never spend there).',
              'The limits plus savingsTarget must add up to my income or slightly less, never more.',
              'Base the numbers on what I actually spend, then trim the flexible categories, not the fixed ones.',
              'Round every number to the nearest 50.',
            ].join('\n'),
          },
        ],
      });

      return answer.json;
    },
    () => fallbackBudget({ user, snapshot, categories })
  );

/* -------------------- 5. Weekly summary report ---------------------- */

const weeklySummary = async ({ user, snapshot }) =>
  withFallback(
    'weekly-summary',
    async () => {
      const answer = await ai.complete({
        maxTokens: 8000,
        system: systemPromptFor(user),
        effort: 'low',
        messages: [
          {
            role: 'user',
            content: [
              `Currency ${user.currency}. Here is my week:`,
              '',
              snapshotToText(snapshot, user.currency),
              '',
              'Write a short weekly wrap-up: what I spent most on, one thing I did well, one thing to watch,',
              'and one small challenge for next week (something like a no-outing weekend).',
              'Under 120 words. Warm and casual. Plain text with simple line breaks, no markdown headings.',
            ].join('\n'),
          },
        ],
      });

      return { summary: answer.text };
    },
    () => ({ summary: fallbackTip({ user, snapshot }).tip })
  );

/* ================= Rule-based fallback advisor ====================== */
/* Used when there is no API key or the API call failed. Not as sharp as
   Claude, but it keeps every screen functional and never shows an error. */

const fallbackAdvice = ({ user, snapshot, tipCount = 4 }) => {
  const cur = user.currency;
  const { breakdown = [], income = 0, totalSpent = 0, remaining = 0, daysLeftInMonth = 0 } = snapshot;
  const tips = [];

  const top = breakdown[0];
  if (top) {
    tips.push({
      title: `Trim your ${top.category} spend`,
      detail: `${top.category} is ${top.percent}% of your spending at ${money(cur, top.amount)}. Cutting it by a fifth frees about ${money(cur, top.amount * 0.2)} a month.`,
      category: top.category,
      estimatedMonthlySaving: round2(top.amount * 0.2),
    });
  }

  const food = breakdown.find((b) => /food|mess/i.test(b.category));
  if (food) {
    tips.push({
      title: 'Eat the mess meals you already paid for',
      detail: `You spent ${money(cur, food.amount)} on food. Skipping two dhaba meals a week keeps roughly ${money(cur, food.amount * 0.15)} in your pocket.`,
      category: food.category,
      estimatedMonthlySaving: round2(food.amount * 0.15),
    });
  }

  const fun = breakdown.find((b) => /entertain/i.test(b.category));
  if (fun) {
    tips.push({
      title: 'Make one weekend a no-spend weekend',
      detail: `Entertainment came to ${money(cur, fun.amount)}. One quiet weekend a month saves about ${money(cur, fun.amount / 4)} with almost no effort.`,
      category: fun.category,
      estimatedMonthlySaving: round2(fun.amount / 4),
    });
  }

  const travel = breakdown.find((b) => /travel/i.test(b.category));
  if (travel) {
    tips.push({
      title: 'Share rickshaws, book tickets early',
      detail: `Travel cost ${money(cur, travel.amount)}. Splitting a rickshaw or Careem with hostel mates and booking Daewoo tickets early usually shaves a quarter off.`,
      category: travel.category,
      estimatedMonthlySaving: round2(travel.amount * 0.25),
    });
  }

  tips.push({
    title: 'Pay yourself first',
    detail: `Move ${money(cur, Math.max(500, income * 0.1))} into a savings goal the day your pocket money lands, before you can spend it.`,
    category: 'Misc',
    estimatedMonthlySaving: round2(Math.max(500, income * 0.1)),
  });

  const overspending = income > 0 && totalSpent > income * 0.9;
  const dailySafe = daysLeftInMonth > 0 ? remaining / daysLeftInMonth : remaining;

  return {
    headline:
      totalSpent === 0
        ? 'No expenses logged yet this month, so here is a starter plan.'
        : `You have spent ${money(cur, totalSpent)} so far this month.`,
    tips: tips.slice(0, tipCount),
    warning: overspending
      ? `You have used ${Math.round((totalSpent / income) * 100)}% of your income with ${daysLeftInMonth} days to go. Try to stay under ${money(cur, dailySafe)} a day.`
      : '',
    encouragement: 'Small changes add up fast at this budget. You have got this.',
  };
};

const fallbackChat = ({ user, snapshot, message }) => {
  const advice = fallbackAdvice({ user, snapshot, tipCount: 3 });
  const lines = [
    `Here is what your numbers say about "${String(message).slice(0, 80)}":`,
    '',
    advice.headline,
    '',
    ...advice.tips.map((t, i) => `${i + 1}. ${t.title} - ${t.detail}`),
  ];
  if (advice.warning) lines.push('', advice.warning);
  lines.push('', '(The AI advisor is not configured, so this is Hisab Ki Kitab built-in advice.)');
  return { reply: lines.join('\n') };
};

/**
 * The tip of the day when there is no API key - which is most of the time, so
 * this is what people actually read.
 *
 * Worded per mode. The advice a student needs and the advice a household needs
 * are different advice, not the same sentence with the nouns swapped: a student
 * is deciding whether to eat out tonight, a household is deciding whether this
 * month's bills leave room for anything else. Telling a person paying an
 * electricity bill to watch their chai spending is how an app announces it has
 * not understood who is using it.
 *
 * Every figure comes from the person's own month. Nothing here is generic.
 */
const fallbackTip = ({ user, snapshot }) => {
  const cur = user.currency;
  const household = modeOf(user) === 'householder';
  const { breakdown = [], remaining = 0, daysLeftInMonth = 1 } = snapshot;

  // Nothing logged yet: the only useful advice is to start logging, and even
  // that is worth saying in the reader's own terms.
  if (!breakdown.length) {
    return {
      tip: household
        ? 'Write down every household expense for the next three days - the bijli bill and the small bazaar trips both. You cannot cut what you cannot see.'
        : 'Log every expense for the next three days, even the chai at the canteen. You cannot cut what you cannot see.',
    };
  }

  const top = breakdown[0];

  // Already past the income for this month: a "safe daily spend" would be a
  // negative number, which is not advice. Say the honest thing instead.
  if (remaining <= 0) {
    return {
      tip: household
        ? `The household is ${money(cur, Math.abs(remaining))} past its income this month, and ${top.category} is the biggest share at ${money(cur, top.amount)}. Hold everything except the fixed bills for the next ${daysLeftInMonth} days, and put a limit on ${top.category} before next month starts.`
        : `You are ${money(cur, Math.abs(remaining))} past your income this month, with ${top.category} the biggest slice at ${money(cur, top.amount)}. Treat the next ${daysLeftInMonth} days as a spend-nothing stretch and start next month with a limit on ${top.category}.`,
    };
  }

  const perDay = daysLeftInMonth > 0 ? remaining / daysLeftInMonth : remaining;

  return {
    tip: household
      ? `${top.category} is the household's biggest cost at ${money(cur, top.amount)}. There are ${daysLeftInMonth} days left and ${money(cur, remaining)} to cover them - about ${money(cur, perDay)} a day once the bills are set aside.`
      : `${top.category} is your biggest cost at ${money(cur, top.amount)}. With ${daysLeftInMonth} days left, keep it under ${money(cur, perDay)} a day and you will finish the month in the green.`,
  };
};

const fallbackBudget = ({ user, snapshot, categories }) => {
  const income = user.monthlyIncome || snapshot.income || 0;
  const list = categories && categories.length ? categories.slice() : DEFAULT_CATEGORIES.slice();

  // Blend the default split with the student's real habits, then round to 50.
  const spentBy = {};
  (snapshot.breakdown || []).forEach((b) => {
    spentBy[b.category] = b.amount;
  });

  const rows = list.map((category) => {
    const share = FALLBACK_BUDGET_SPLIT[category] != null ? FALLBACK_BUDGET_SPLIT[category] : 0.05;
    const fromSplit = income * share;
    const actual = spentBy[category] || 0;
    const blended = actual > 0 ? (fromSplit + actual) / 2 : fromSplit;
    return {
      category,
      limit: Math.round((blended * 0.9) / 50) * 50, // the 10% trim leaves room to save
      reason: actual > 0 ? 'Based on what you actually spend here' : 'Standard hostel-student allocation',
    };
  });

  const allocated = rows.reduce((sum, r) => sum + r.limit, 0);
  return {
    summary:
      income > 0
        ? `A starter plan for ${money(user.currency, income)} a month, trimmed by about 10% so there is always something left to save.`
        : 'Add your monthly pocket money in Settings to get a plan sized to your income.',
    savingsTarget: Math.max(0, Math.round((income - allocated) / 50) * 50),
    categories: rows,
  };
};

module.exports = {
  isConfigured: ai.isConfigured,
  providerName: ai.providerName,
  getAdvice,
  chat,
  dailyTip,
  suggestBudget,
  weeklySummary,
  activeModel: ai.activeModel,
  modelChain: ai.modelChain,
  SETUP_HINT: ai.SETUP_HINT,
  // Exported for tests. Which persona a person gets decides whether the advice
  // is about a mess bill or an electricity bill, and that is worth checking
  // without needing an API key to do it.
  systemPromptFor,
};
