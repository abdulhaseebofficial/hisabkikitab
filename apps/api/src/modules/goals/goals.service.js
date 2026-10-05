/**
 * Savings goal rules.
 *
 * Everything the feature decides rather than stores lives here: what a goal
 * looks like once its pace is worked out, whether a deadline is acceptable,
 * what a contribution is allowed to do, and when reaching a goal is worth
 * telling the student about.
 *
 * The controller above this only turns requests into calls and results into
 * JSON; the repository below only reads and writes rows.
 */

const goalsRepo = require('./goals.repository');
const ApiError = require('../../shared/errors/ApiError');
const { goalPace, round2 } = require('../../shared/utils/calculations');
const events = require('../../shared/events');
const { DEFAULT_GOAL_ICON } = require('../../shared/constants');
const requests = require('../../shared/finance/idempotency');
const { minor, minorToApi, decimalToMinor, roundRatio } = require('../../shared/finance/personalMoney');

/** Adds the derived pace fields the UI needs on top of the stored row. */
const decorate = (goal) => ({
  ...goal,
  progress: Math.min(100, roundRatio(
    goal.savedAmountMinor ?? decimalToMinor(goal.savedAmount),
    goal.targetAmountMinor ?? decimalToMinor(goal.targetAmount))),
  ...goalPace(goal),
});

/** Every goal for a student, decorated, with the totals the list header shows. */
const list = async (userId, status) => {
  const goals = await goalsRepo.list(userId, status);
  const items = goals.map(decorate);

  const totals = items.reduce(
    (acc, g) => {
      acc.targeted += minor(g.targetAmountMinor ?? decimalToMinor(g.targetAmount));
      acc.saved += minor(g.savedAmountMinor ?? decimalToMinor(g.savedAmount));
      return acc;
    },
    { targeted: 0n, saved: 0n }
  );

  return {
    items,
    summary: {
      count: items.length,
      active: items.filter((g) => !g.isCompleted).length,
      completed: items.filter((g) => g.isCompleted).length,
      totalTargeted: minorToApi(totals.targeted),
      totalSaved: minorToApi(totals.saved),
    },
  };
};

const getById = async (id, userId) => {
  const goal = await goalsRepo.findById(id, userId);
  if (!goal) throw ApiError.notFound('Goal not found');
  return decorate(goal);
};

const create = async (userId, input, requestKey, tx = null) => {
  const { title, targetAmount, savedAmount, deadline, icon, note } = input;

  // Comparing against the start of today, not now, so a deadline of "today"
  // is still accepted for the rest of the day.
  if (deadline && new Date(deadline) < new Date(new Date().toDateString())) {
    throw ApiError.badRequest('The deadline cannot be in the past');
  }

  const values = {
    title,
    targetAmount,
    savedAmount: savedAmount || 0,
    deadline: deadline || null,
    icon: icon || DEFAULT_GOAL_ICON,
    note: note || '',
  };
  // Onboarding passes its enclosing transaction; public creates require a key.
  if (!tx && !requestKey) throw ApiError.badRequest('A UUID Idempotency-Key header is required');
  const goal = tx ? await goalsRepo.create(userId, values, tx)
    : (await requests.run(userId, 'goal:create', requestKey, input,
      requestTx => goalsRepo.create(userId, values, requestTx))).value;

  return decorate(goal);
};

/** Only the fields a student is allowed to change are copied across. */
const EDITABLE = ['title', 'targetAmount', 'deadline', 'icon', 'note'];

const update = async (id, userId, body) => {
  const existing = await goalsRepo.findById(id, userId);
  if (!existing) throw ApiError.notFound('Goal not found');

  const patch = {};
  EDITABLE.forEach((field) => {
    if (body[field] !== undefined) patch[field] = body[field];
  });

  const goal = await goalsRepo.update(id, userId, patch);
  return decorate(goal);
};

/**
 * Add to a goal, or take money back out with a negative amount.
 *
 * Returns `justCompleted` so the UI can celebrate, and announces the fact so
 * anything that cares can react - reaching a goal is a fact about the goal,
 * not about the request that happened to cause it.
 */
const contribute = async (user, id, rawAmount, note, requestKey) => {
  const amount = decimalToMinor(rawAmount, { allowNegative: true, allowZero: false });

  const { value, replayed } = await requests.run(user._id, `goal:contribute:${id}`, requestKey,
    { amount: rawAmount, note }, async tx => {
      const { goal, wasCompleted, overdrawn } = await goalsRepo.contribute(
        id, user._id, rawAmount, note || '', tx
      );
      if (overdrawn) throw ApiError.badRequest('You cannot withdraw more than you have saved in this goal');
      if (!goal) throw ApiError.notFound('Goal not found');
      return { goal: decorate(goal), justCompleted: !wasCompleted && goal.isCompleted, withdrawn: amount < 0n };
    });

  // Announced after the contribution is committed, and awaited, so whatever
  // listens has finished by the time the response says the goal was reached.
  if (value.justCompleted && !replayed) {
    await events.emitAndWait(events.GOAL_REACHED, { user, goal: value.goal });
  }
  return value;
};

const remove = async (id, userId) => {
  const removed = await goalsRepo.remove(id, userId);
  if (!removed) throw ApiError.notFound('Goal not found');
  return id;
};

/* ------------------- for other modules to build on ------------------ */

/** The nearest open goals, for the dashboard strip. */
const listOpen = (userId, limit) => goalsRepo.listOpen(userId, limit);

/** Goals whose deadline falls inside `days`, for the alert rules. */
const listDueSoon = (userId, days) => goalsRepo.findDueSoon(userId, days);

/** Every goal, undecorated, for the data export. */
const listAllForUser = (userId) => goalsRepo.list(userId, 'all');

module.exports = {
  listOpen,
  listDueSoon,
  listAllForUser,
  list,
  getById,
  create,
  update,
  contribute,
  remove,
};
