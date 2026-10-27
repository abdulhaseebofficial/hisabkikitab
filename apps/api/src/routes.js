/**
 * Every feature router, mounted in one place.
 *
 * The mount paths are part of the public API and are deliberately left as they
 * were: `/api/budget` is singular while its module is `budgets`, and `/api/ai`
 * is shorter than its `advisor` module. Renaming either would break clients,
 * so the tidier names live on the module side only.
 */

const registerRoutes = (app) => {
  app.use('/api/shared-living', require('./modules/sharedLiving/sharedLiving.routes'));
  app.use('/api/business', require('./modules/business').routes);
  const { protect } = require('./modules/auth/auth.middleware');
  const personalPaths = ['/api/expenses','/api/income','/api/goals','/api/debts','/api/budget','/api/dashboard','/api/ai','/api/reports'];
  app.use(personalPaths, protect, (req, res, next) => {
    if (req.user.financeMode === 'shared_living') return res.status(403).json({success:false,message:'shared.personalMode'});
    return next();
  });
  app.use('/api/auth', require('./modules/auth/auth.routes'));
  app.use('/api/profile', require('./modules/users/users.routes'));
  app.use('/api/expenses', require('./modules/expenses/expenses.routes'));
  app.use('/api/income', require('./modules/income/income.routes'));
  app.use('/api/goals', require('./modules/goals/goals.routes'));
  app.use('/api/debts', require('./modules/debts/debts.routes'));
  app.use('/api/budget', require('./modules/budgets/budgets.routes'));
  app.use('/api/dashboard', require('./modules/dashboard/dashboard.routes'));
  app.use('/api/ai', require('./modules/advisor/advisor.routes'));
  app.use('/api/reports', require('./modules/reports/reports.routes'));
  app.use('/api/notifications', require('./modules/notifications/notifications.routes'));
  app.use('/api/feedback', require('./modules/feedback/feedback.routes'));
};

module.exports = registerRoutes;
