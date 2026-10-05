/**
 * Account and profile rules.
 *
 * This module owns the `users` table, so anything else that needs a student's
 * record goes through here rather than reaching for the repository - auth in
 * particular, which owns sessions but not accounts.
 *
 * The rules that live here are about what a student may change (a fixed list
 * of fields, never the private columns), what a category may be called, and
 * what has to be true before an account can be deleted.
 */

const usersRepo = require('./users.repository');
// Plain requires. These used to be deferred because each of these modules
// asked users for the current account, closing a circle. They no longer do:
// the category check moved to shared/categories and the alert refresh became
// an event, so the dependency runs one way and there is nothing to defer.
const expenses = require('../expenses/expenses.service');
const income = require('../income/income.service');
const goals = require('../goals/goals.service');
const requests = require('../../shared/finance/idempotency');
const budgets = require('../budgets/budgets.service');
const advisor = require('../advisor/advisor.service');
const debts = require('../debts/debts.service');
const sharedLivingExport = require('./sharedLivingExport.repository');
const ApiError = require('../../shared/errors/ApiError');
const { DEFAULT_GOAL_ICON } = require('../../shared/constants');
const { allCategories, modeOf } = require('../../shared/categories');
const catalogue = require('@hisabkikitab/contracts/catalogue');
const { MODES, categoryIdsFor, allKnownCategoryIds } = catalogue;

const EXPORT_CHAT_LIMIT = 1000;

/** The only profile fields a student is allowed to set directly. */
const EDITABLE = [
  'name',
  'monthlyIncome',
  'currency',
  'university',
  'hostelName',
  'theme',
  // Which set of books is open, and which language it reads in. Both are
  // validated against the catalogue allowlists before they get here.
  'financeMode',
  'language',
];

const toPublic = usersRepo.toPublicUser;

/* ----------------------------- profile ------------------------------ */

const updateProfile = async (userId, body) => {
  const patch = {};
  EDITABLE.forEach((field) => {
    if (body[field] !== undefined) patch[field] = body[field];
  });

  const user = await usersRepo.updateProfile(userId, patch);
  return toPublic(user);
};

/**
 * Finishes the first-run wizard: income and currency in one shot, plus an
 * optional first goal so the student lands on a dashboard with something on it.
 */
const completeOnboarding = async (userId, body, requestKey) => {
  const { financeMode, language, monthlyIncome, currency, university, hostelName, goal } = body;
  const { value } = await requests.run(userId, 'profile:onboarding', requestKey, body, async tx => {
    const user = await usersRepo.updateProfile(userId, {
      // Undefined leaves existing optional settings alone.
      financeMode: financeMode || undefined,
      language: language || undefined,
      monthlyIncome: monthlyIncome || 0,
      currency: currency || undefined,
      university: university === undefined ? undefined : university,
      hostelName: hostelName === undefined ? undefined : hostelName,
      onboardingCompleted: true,
    }, tx);

    let createdGoal = null;
    if (financeMode !== 'shared_living' && goal && goal.title && goal.targetAmount) {
      createdGoal = await goals.create(userId, {
        title: goal.title,
        targetAmount: goal.targetAmount,
        deadline: goal.deadline || null,
        icon: goal.icon || DEFAULT_GOAL_ICON,
      }, null, tx);
    }
    return { user: toPublic(user), goal: createdGoal };
  });
  return value;
};

/* ---------------------------- categories ---------------------------- */

/**
 * What this person can file an expense under right now.
 *
 * `defaults` is their current mode's list - a student is not offered a gas
 * bill - while `custom` is theirs in both modes, because they typed it.
 * `financeMode` is echoed back so the caller can label the list without
 * guessing which one it asked for.
 */
const listCategories = (user) => ({
  financeMode: modeOf(user),
  defaults: categoryIdsFor('expense', modeOf(user)),
  custom: user.customCategories,
  all: allCategories(user),
});

const addCategory = async (user, rawName) => {
  const name = String(rawName || '').trim();
  if (!name) throw ApiError.badRequest('Category name is required');

  // Case-insensitive and across BOTH modes, so "travel" cannot sit beside the
  // built-in "Travel" - and a custom category invented in student mode does not
  // reappear as a duplicate the day the person switches to householder.
  const existing = [...allKnownCategoryIds(), ...(user.customCategories || [])]
    .map((c) => c.trim().toLowerCase());
  if (existing.includes(name.toLowerCase())) {
    throw ApiError.conflict('That category already exists');
  }

  const updated = await usersRepo.updateProfile(user._id, {
    customCategories: [...user.customCategories, name],
  });

  return { name, all: allCategories(updated) };
};

/**
 * Removing a category the student still uses would orphan those expenses, so
 * it is refused with a count rather than silently reassigning them.
 */
const removeCategory = async (user, rawName) => {
  const name = decodeURIComponent(rawName);

  // Built-in in EITHER mode: a student must not be able to delete a household
  // category just because it is not on their own list today.
  if (allKnownCategoryIds().includes(name)) {
    throw ApiError.badRequest('Built-in categories cannot be removed');
  }

  const inUse = await expenses.countByCategory(user._id, modeOf(user), name);
  if (inUse > 0) {
    throw ApiError.badRequest(
      `${inUse} expense(s) still use "${name}". Move them to another category first.`
    );
  }

  const updated = await usersRepo.updateProfile(user._id, {
    customCategories: user.customCategories.filter((c) => c !== name),
  });

  return { name, all: allCategories(updated) };
};

/* ------------------------------ account ----------------------------- */

/**
 * Everything this person has, for a "download all my data" request.
 *
 * BOTH modes, always, and organised by mode rather than poured into one list.
 * Every other read in the app is scoped to whichever set of books is open, and
 * that is right - but a file calling itself everything while quietly omitting
 * the half the person was not looking at is a false answer to a data request.
 * Someone exporting before deleting their account would lose records they were
 * never shown.
 *
 * Three decisions worth naming:
 *
 *   - Goals sit at the top level under `shared`, not inside either mode.
 *     They genuinely are shared, and copying them into both sections would
 *     make a reader counting their savings count them twice.
 *
 *   - Debts come with their ledgers, including cancelled and settled ones. A
 *     cancelled debt is something that happened and was written off; dropping
 *     it would misrepresent the account rather than tidy it.
 *
 *   - Stored values are the export. Where a label would help a human reading
 *     the file, it is added ALONGSIDE the id - never instead of it - so the
 *     file stays portable and re-importable while still being legible.
 */
const exportEverything = async (user) => {
  const language = user && user.language;

  /** A row plus a human-readable label for its stored category. */
  const withLabel = (row, field, kind) => ({
    ...row,
    [`${field}Label`]: catalogue.labelForAnyMode(kind, row[field], language),
  });

  // Named apart from the modules they come from: destructuring straight into
  // `expenses` and friends would shadow the imports the calls themselves use.
  const sections = await Promise.all(
    MODES.map(async (mode) => {
      const [modeExpenses, modeIncome, modeBudgets, modeDebts] = await Promise.all([
        expenses.listAllForUser(user._id, mode),
        income.listAllForUser(user._id, mode),
        budgets.listAllForUser(user._id, mode),
        debts.listAllForExport(user._id, mode),
      ]);

      return [
        mode,
        {
          financeMode: mode,
          expenses: modeExpenses.map((row) => withLabel(row, 'category', 'expense')),
          income: modeIncome.map((row) => withLabel(row, 'source', 'income')),
          budgets: modeBudgets.map((row) => withLabel(row, 'category', 'expense')),
          debts: modeDebts,
        },
      ];
    })
  );

  const [allGoals, chat, sharedLiving] = await Promise.all([
    goals.listAllForUser(user._id),
    advisor.exportChat(user._id, EXPORT_CHAT_LIMIT),
    sharedLivingExport.forUser(user._id),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    // Says plainly what the file covers, so nobody has to infer it from the
    // rows or assume it matches the mode they happened to be in.
    financeModes: [...MODES],
    scope: 'complete-account',
    profile: toPublic(user),

    // One section per mode, each row still carrying its own financeMode so a
    // section and a row can never disagree.
    byFinanceMode: Object.fromEntries(sections),

    // Not inside either mode, because they belong to neither and to both.
    shared: {
      note: 'Goals are shared across both finance modes and are listed once.',
      goals: allGoals,
      aiConversation: chat,
      sharedLiving,
    },
  };
};

/**
 * Deletes the account and everything attached to it.
 *
 * The password is required so a stolen access token on its own cannot wipe an
 * account. Every child table is ON DELETE CASCADE, so removing the row takes
 * the data with it.
 */
const deleteAccount = async (userId, password) => {
  const user = await usersRepo.findById(userId, { withPassword: true });

  if (!user) throw ApiError.notFound('Account not found');
  if (!user.password) {
    throw ApiError.badRequest('Set a password in Settings before deleting this Google account');
  }

  if (!password || !(await usersRepo.comparePassword(password, user.password))) {
    throw ApiError.badRequest('Enter your current password to confirm deletion');
  }

  let deletion;
  try {
    deletion = await usersRepo.removeAccountSafely(userId);
  } catch (err) {
    if (err.code === '23503') {
      // This is retryable if a space/join raced the initial space-lock query.
      throw ApiError.conflict('shared.accountDeletionRetry');
    }
    throw err;
  }
  if (!deletion.deleted) {
    if (deletion.hasSuccessor)
      throw ApiError.conflict('shared.ownerTransferBeforeDelete');
    throw ApiError.conflict('shared.ownerNoSuccessorDelete');
  }
};

/* ------------------- for other modules to build on ------------------ */

/** The account behind an email, with the password hash, for auth to check. */
const findCredentialsByEmail = (email) => usersRepo.findByEmail(email, { withPassword: true });

/** Whether an email is taken, without pulling the hash. */
const findByEmail = (email) => usersRepo.findByEmail(email);

/** Creates the account itself. auth wraps this with session handling. */
const createAccount = (input) => usersRepo.create(input);

const comparePassword = (candidate, hash) => usersRepo.comparePassword(candidate, hash);

/**
 * Sets a new password, which also clears any reset token, bumps the account's
 * token version and drops every stored session.
 */
const setPassword = (userId, password) => usersRepo.setPassword(userId, password);

const createPasswordResetToken = (userId) => usersRepo.createPasswordResetToken(userId);

const findByResetToken = (hashedToken) => usersRepo.findByResetToken(hashedToken);

/**
 * Invalidates every session for an account.
 *
 * Lives here rather than with auth because it deletes the session rows AND
 * bumps this table's token_version in one transaction - splitting it across
 * two modules would split the transaction.
 */
const revokeAllSessions = (userId) => usersRepo.revokeAllSessions(userId);

const findById = (userId, options) => usersRepo.findById(userId, options);

/* ------------------------------- google ----------------------------- */
// Thin pass-throughs, like findByEmail above: auth owns the sign-in decision,
// users owns what an account is.
const findByGoogleId = (googleId) => usersRepo.findByGoogleId(googleId);
const linkGoogleId = (userId, googleId) => usersRepo.linkGoogleId(userId, googleId);
const createFromGoogle = (profile) => usersRepo.createFromGoogle(profile);


module.exports = {
  toPublic,
  updateProfile,
  completeOnboarding,
  listCategories,
  addCategory,
  removeCategory,
  exportEverything,
  deleteAccount,
  findCredentialsByEmail,
  findByEmail,
  createAccount,
  comparePassword,
  setPassword,
  createPasswordResetToken,
  findByResetToken,
  revokeAllSessions,
  findById,
  findByGoogleId,
  linkGoogleId,
  createFromGoogle,
};
