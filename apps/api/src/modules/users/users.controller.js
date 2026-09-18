/**
 * Profile and account endpoints. Request in, JSON out; the rules are in
 * users.service.
 */

const users = require('./users.service');
const asyncHandler = require('../../shared/http/asyncHandler');
const { REFRESH_COOKIE, refreshCookieOptions } = require('../auth/auth.tokens');

/** PUT /api/profile */
const updateProfile = asyncHandler(async (req, res) => {
  const user = await users.updateProfile(req.user._id, req.body);
  res.json({ success: true, message: 'Profile updated', data: { user } });
});

/**
 * POST /api/profile/onboarding
 * Finishes the first-run wizard: income + currency in one shot, optional first
 * goal.
 */
const completeOnboarding = asyncHandler(async (req, res) => {
  const data = await users.completeOnboarding(req.user._id, req.body);
  res.json({ success: true, message: 'You are all set!', data });
});

/** GET /api/profile/categories - default + custom categories for this user. */
const getCategories = asyncHandler(async (req, res) => {
  res.json({ success: true, data: users.listCategories(req.user) });
});

/** POST /api/profile/categories - add a custom category. */
const addCategory = asyncHandler(async (req, res) => {
  const { name, all } = await users.addCategory(req.user, req.body.name);
  res.status(201).json({ success: true, message: `Added "${name}"`, data: { all } });
});

/** DELETE /api/profile/categories/:name - remove a custom category. */
const deleteCategory = asyncHandler(async (req, res) => {
  const { name, all } = await users.removeCategory(req.user, req.params.name);
  res.json({ success: true, message: `Removed "${name}"`, data: { all } });
});

/**
 * GET /api/profile/export
 * Full data export (GDPR-style "download everything I have").
 */
const exportData = asyncHandler(async (req, res) => {
  const dump = await users.exportEverything(req.user);
  res.setHeader('Content-Disposition', 'attachment; filename="hisabkikitab-data.json"');
  res.json(dump);
});

/**
 * DELETE /api/profile
 * Deletes the account and everything attached to it. Requires the password so
 * a stolen access token alone cannot wipe an account.
 */
const deleteAccount = asyncHandler(async (req, res) => {
  await users.deleteAccount(req.user._id, req.body.password);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  res.json({ success: true, message: 'Your account and all data have been deleted' });
});

module.exports = {
  updateProfile,
  completeOnboarding,
  getCategories,
  addCategory,
  deleteCategory,
  exportData,
  deleteAccount,
};
