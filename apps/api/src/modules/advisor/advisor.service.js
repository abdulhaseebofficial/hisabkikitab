/**
 * What the advisor does with a student's numbers.
 *
 * Two halves sit under this one:
 *
 *   advisor.ai.js         the prompts, the response schemas, and the
 *                         rule-based advisor that answers when no model can
 *   ../../infrastructure/ai  whichever provider actually replies
 *
 * This file is the feature: fetch the snapshot, ask, keep what is worth
 * keeping, and hand back a plain object. Nothing here knows about HTTP, and
 * nothing above it knows which model answered.
 */

const ai = require('./advisor.ai');
const chatRepo = require('./advisor.repository');
const ApiError = require('../../shared/errors/ApiError');
const { allCategories } = require('../../shared/categories');
const { buildSnapshot, buildWeeklySnapshot } = require('../analytics/analytics.service');
const { currentPeriod } = require('../../shared/utils/calculations');
const { apiToMinor, minor, minorToApi } = require('../../shared/finance/personalMoney');

const CHAT_HISTORY_TURNS = 20;
const MAX_QUESTION_LENGTH = 1000;
const MAX_HISTORY_LIMIT = 100;
const DEFAULT_HISTORY_LIMIT = 50;

const periodFrom = (source = {}) => {
  const now = currentPeriod();
  return {
    month: Number(source.month) || now.month,
    year: Number(source.year) || now.year,
  };
};

/* ------------------------------ status ------------------------------ */

/** What the UI needs to show an "AI offline" badge honestly. */
const status = () => ({
  configured: ai.isConfigured(),
  // Which service is answering - 'gemini', 'claude', or null when the
  // rule-based advisor is standing in.
  provider: ai.providerName(),
  // The model actually answering, which may not be the configured one if this
  // key could not reach it.
  model: ai.isConfigured() ? ai.activeModel() : null,
  modelChain: ai.isConfigured() ? ai.modelChain() : [],
  fallback: 'Built-in rule based advisor',
});

/* ------------------------------ advice ------------------------------ */

const advice = async (user, body) => {
  const snapshot = await buildSnapshot(user, periodFrom(body));
  const tipCount = Math.min(5, Math.max(3, Number(body.tipCount) || 4));

  const result = await ai.getAdvice({ user, snapshot, tipCount });

  return {
    ...result,
    context: {
      monthLabel: snapshot.monthLabel,
      totalSpent: snapshot.totalSpent,
      remaining: snapshot.remaining,
      income: snapshot.income,
      topCategory: snapshot.topCategory,
    },
  };
};

/* ------------------------------- chat ------------------------------- */

/**
 * Conversational Q&A grounded in the student's real numbers. The last turns
 * are replayed so follow-up questions make sense, and both sides are stored so
 * the conversation survives a refresh.
 */
const chat = async (user, rawMessage) => {
  const message = String(rawMessage || '').trim();
  if (!message) throw ApiError.badRequest('Type a question first');
  if (message.length > MAX_QUESTION_LENGTH) {
    throw ApiError.badRequest('That question is a bit too long, try shortening it');
  }

  const [snapshot, history] = await Promise.all([
    buildSnapshot(user, currentPeriod()),
    chatRepo.recentForUser(user._id, CHAT_HISTORY_TURNS),
  ]);

  const result = await ai.chat({
    user,
    snapshot,
    history: history.map((m) => ({ role: m.role, content: m.content })),
    message,
  });

  await chatRepo.addMany(user._id, [
    { role: 'user', content: message },
    { role: 'assistant', content: result.reply },
  ]);

  return result;
};

const history = (userId, limit) =>
  chatRepo.recentForUser(
    userId,
    Math.min(MAX_HISTORY_LIMIT, Number(limit) || DEFAULT_HISTORY_LIMIT)
  );

const clearChat = (userId) => chatRepo.clear(userId);

/* -------------------------- tip of the day -------------------------- */

/**
 * The tip is identical for a whole day, so it is cached in memory: one model
 * call per student per day instead of one per page load.
 *
 * Per-process, so a restart or a second instance simply asks again - which is
 * the right trade for something this cheap to recompute.
 */
const tipCache = new Map(); // userId -> { day, payload }
const today = () => new Date().toISOString().slice(0, 10);

const dailyTip = async (user, { refresh = false } = {}) => {
  const key = String(user._id);
  const cached = tipCache.get(key);

  if (cached && cached.day === today() && !refresh) {
    return { ...cached.payload, cached: true };
  }

  const snapshot = await buildSnapshot(user, currentPeriod());
  const payload = await ai.dailyTip({ user, snapshot });

  tipCache.set(key, { day: today(), payload });
  return { ...payload, cached: false };
};

/* --------------------------- budget plan ---------------------------- */

/**
 * A per-category plan. Nothing is saved until the student hits "apply" on the
 * Budget page, which posts it to /api/budget/bulk.
 */
const suggestBudget = async (user, body) => {
  const snapshot = await buildSnapshot(user, periodFrom(body));
  const categories = allCategories(user);

  const result = await ai.suggestBudget({ user, snapshot, categories });

  // Never trust a model with the maths: report what it actually allocated so
  // the UI can refuse a plan that spends more than the student earns.
  const incomeMinor = user.monthlyIncomeMinor != null ? minor(user.monthlyIncomeMinor) : apiToMinor(user.monthlyIncome || snapshot.income || 0);
  let allocatedMinor;
  try {
    allocatedMinor = (result.categories || []).reduce((sum, c) => sum + apiToMinor(c.limit || 0), 0n);
  } catch {
    throw ApiError.internal('Budget suggestion contained unsupported money precision');
  }

  return {
    ...result,
    income: minorToApi(incomeMinor),
    allocated: minorToApi(allocatedMinor),
    exceedsIncome: incomeMinor > 0n && allocatedMinor > incomeMinor,
  };
};

/* -------------------------- weekly summary -------------------------- */

const weeklySummary = async (user) => {
  const snapshot = await buildWeeklySnapshot(user);
  const result = await ai.weeklySummary({ user, snapshot });

  return { ...result, totalSpent: snapshot.totalSpent, breakdown: snapshot.breakdown };
};

/** The whole conversation, for the data export. */
const exportChat = (userId, limit) => chatRepo.listForUser(userId, limit);

module.exports = {
  exportChat,
  status,
  advice,
  chat,
  history,
  clearChat,
  dailyTip,
  suggestBudget,
  weeklySummary,

  // Re-exported so app.js, server.js and the dashboard can report which
  // provider is answering without reaching past this module.
  isConfigured: ai.isConfigured,
  providerName: ai.providerName,
  activeModel: ai.activeModel,
  modelChain: ai.modelChain,
  SETUP_HINT: ai.SETUP_HINT,
};
