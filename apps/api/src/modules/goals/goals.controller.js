/**
 * Savings goal endpoints.
 *
 * Request in, JSON out. Every decision about what a goal means belongs to
 * goals.service.
 */

const goals = require('./goals.service');
const asyncHandler = require('../../shared/http/asyncHandler');

/** GET /api/goals - ?status=active|completed|all (default all) */
const listGoals = asyncHandler(async (req, res) => {
  const data = await goals.list(req.user._id, req.query.status);
  res.json({ success: true, data });
});

/** GET /api/goals/:id */
const getGoal = asyncHandler(async (req, res) => {
  const goal = await goals.getById(req.params.id, req.user._id);
  res.json({ success: true, data: { goal } });
});

/** POST /api/goals */
const createGoal = asyncHandler(async (req, res) => {
  const goal = await goals.create(req.user._id, req.body, req.financialRequestKey);
  res.status(201).json({ success: true, message: 'Goal created', data: { goal } });
});

/** PUT /api/goals/:id */
const updateGoal = asyncHandler(async (req, res) => {
  const goal = await goals.update(req.params.id, req.user._id, req.body);
  res.json({ success: true, message: 'Goal updated', data: { goal } });
});

/**
 * PATCH /api/goals/:id/add
 * One endpoint for both directions: a negative amount is a withdrawal.
 */
const contribute = asyncHandler(async (req, res) => {
  const { goal, justCompleted, withdrawn } = await goals.contribute(
    req.user,
    req.params.id,
    req.body.amount,
    req.body.note,
    req.financialRequestKey
  );

  res.json({
    success: true,
    message: withdrawn ? `Withdrawn from "${goal.title}"` : `Added to "${goal.title}"`,
    data: { goal, justCompleted },
  });
});

/** DELETE /api/goals/:id */
const deleteGoal = asyncHandler(async (req, res) => {
  const id = await goals.remove(req.params.id, req.user._id);
  res.json({ success: true, message: 'Goal deleted', data: { id } });
});

module.exports = { listGoals, getGoal, createGoal, updateGoal, contribute, deleteGoal };
