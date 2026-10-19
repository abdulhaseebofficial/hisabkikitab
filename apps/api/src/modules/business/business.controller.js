/**
 * Business controller.
 */

const BusinessService = require('./business.service');

const unwrap = (val) => (val && val.value !== undefined ? val.value : val);

const BusinessController = {
  async createBusiness(req, res, next) {
    try {
      if (req.user?.isDemo) {
        return res.status(403).json({ success: false, message: 'Demo Mode is read-only' });
      }
      const business = req.financialRequestKey
        ? await BusinessService.createBusinessIdempotent(req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createBusiness(req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(business) });
    } catch (e) {
      next(e);
    }
  },

  async listUserBusinesses(req, res, next) {
    try {
      const businesses = await BusinessService.listUserBusinesses(req.user.id);
      res.json({ success: true, data: businesses });
    } catch (e) {
      next(e);
    }
  },

  async getBusiness(req, res, next) {
    try {
      const business = await BusinessService.getBusiness(req.businessId);
      if (!business) return res.status(404).json({ success: false, message: 'Business not found' });
      res.json({ success: true, data: business });
    } catch (e) {
      next(e);
    }
  },

  async updateBusiness(req, res, next) {
    try {
      const updated = await BusinessService.updateBusiness(req.businessId, req.user.id, req.body);
      res.json({ success: true, data: updated });
    } catch (e) {
      next(e);
    }
  },

  async getDashboard(req, res, next) {
    try {
      const summary = await BusinessService.getDashboardSummary(req.businessId);
      res.json({ success: true, data: summary });
    } catch (e) {
      next(e);
    }
  },

  async listAccounts(req, res, next) {
    try {
      const accounts = await BusinessService.listAccounts(req.businessId);
      res.json({ success: true, data: accounts });
    } catch (e) {
      next(e);
    }
  },

  async listProducts(req, res, next) {
    try {
      const products = await BusinessService.listProducts(req.businessId, req.query);
      res.json({ success: true, data: products });
    } catch (e) {
      next(e);
    }
  },

  async createProduct(req, res, next) {
    try {
      const product = await BusinessService.createProduct(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: product });
    } catch (e) {
      next(e);
    }
  },

  async updateProduct(req, res, next) {
    try {
      const product = await BusinessService.updateProduct(req.businessId, req.params.productId, req.user.id, req.body);
      res.json({ success: true, data: product });
    } catch (e) {
      next(e);
    }
  },

  async adjustStock(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.adjustStockIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.adjustStock(req.businessId, req.user.id, req.body);
      res.json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async listCategories(req, res, next) {
    try {
      const categories = await BusinessService.listCategories(req.businessId);
      res.json({ success: true, data: categories });
    } catch (e) {
      next(e);
    }
  },

  async createCategory(req, res, next) {
    try {
      const category = await BusinessService.createCategory(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: category });
    } catch (e) {
      next(e);
    }
  },

  async listCustomers(req, res, next) {
    try {
      const customers = await BusinessService.listCustomers(req.businessId, req.query.search);
      res.json({ success: true, data: customers });
    } catch (e) {
      next(e);
    }
  },

  async getCustomer(req, res, next) {
    try {
      const customer = await BusinessService.getCustomer(req.businessId, req.params.customerId);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
      res.json({ success: true, data: customer });
    } catch (e) {
      next(e);
    }
  },

  async createCustomer(req, res, next) {
    try {
      const customer = await BusinessService.createCustomer(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: customer });
    } catch (e) {
      next(e);
    }
  },

  async listSuppliers(req, res, next) {
    try {
      const suppliers = await BusinessService.listSuppliers(req.businessId, req.query.search);
      res.json({ success: true, data: suppliers });
    } catch (e) {
      next(e);
    }
  },

  async getSupplier(req, res, next) {
    try {
      const supplier = await BusinessService.getSupplier(req.businessId, req.params.supplierId);
      if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
      res.json({ success: true, data: supplier });
    } catch (e) {
      next(e);
    }
  },

  async createSupplier(req, res, next) {
    try {
      const supplier = await BusinessService.createSupplier(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: supplier });
    } catch (e) {
      next(e);
    }
  },

  async listSales(req, res, next) {
    try {
      const sales = await BusinessService.listSales(req.businessId, req.query);
      res.json({ success: true, data: sales });
    } catch (e) {
      next(e);
    }
  },

  async getSale(req, res, next) {
    try {
      const sale = await BusinessService.getSale(req.businessId, req.params.saleId);
      if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
      res.json({ success: true, data: sale });
    } catch (e) {
      next(e);
    }
  },

  async createSale(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createSaleIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createSale(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async listPurchases(req, res, next) {
    try {
      const purchases = await BusinessService.listPurchases(req.businessId, req.query);
      res.json({ success: true, data: purchases });
    } catch (e) {
      next(e);
    }
  },

  async getPurchase(req, res, next) {
    try {
      const purchase = await BusinessService.getPurchase(req.businessId, req.params.purchaseId);
      if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });
      res.json({ success: true, data: purchase });
    } catch (e) {
      next(e);
    }
  },

  async createPurchase(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createPurchaseIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createPurchase(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async listExpenses(req, res, next) {
    try {
      const expenses = await BusinessService.listExpenses(req.businessId, req.query);
      res.json({ success: true, data: expenses });
    } catch (e) {
      next(e);
    }
  },

  async createExpense(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createExpenseIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createExpense(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async listPayments(req, res, next) {
    try {
      const payments = await BusinessService.listPayments(req.businessId, req.query);
      res.json({ success: true, data: payments });
    } catch (e) {
      next(e);
    }
  },

  async createPayment(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createPaymentIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createPayment(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async listEmployees(req, res, next) {
    try {
      const employees = await BusinessService.listEmployees(req.businessId);
      res.json({ success: true, data: employees });
    } catch (e) {
      next(e);
    }
  },

  async createEmployee(req, res, next) {
    try {
      const employee = await BusinessService.createEmployee(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: employee });
    } catch (e) {
      next(e);
    }
  },

  async listPayroll(req, res, next) {
    try {
      const payroll = await BusinessService.listPayrollRuns(req.businessId);
      res.json({ success: true, data: payroll });
    } catch (e) {
      next(e);
    }
  },

  async runPayroll(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.runPayrollIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.runPayroll(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async getProfitAndLoss(req, res, next) {
    try {
      const pnl = await BusinessService.getProfitAndLoss(req.businessId, req.query);
      res.json({ success: true, data: pnl });
    } catch (e) {
      next(e);
    }
  },

  async getTrialBalance(req, res, next) {
    try {
      const tb = await BusinessService.getTrialBalance(req.businessId, req.query.asOfDate);
      res.json({ success: true, data: tb });
    } catch (e) {
      next(e);
    }
  },

  async getBalanceSheet(req, res, next) {
    try {
      const bs = await BusinessService.getBalanceSheet(req.businessId, req.query.asOfDate);
      res.json({ success: true, data: bs });
    } catch (e) {
      next(e);
    }
  },

  async getCashFlowStatement(req, res, next) {
    try {
      const cf = await BusinessService.getCashFlowStatement(req.businessId, req.query);
      res.json({ success: true, data: cf });
    } catch (e) {
      next(e);
    }
  },

  async getGeneralLedgerAccount(req, res, next) {
    try {
      const gl = await BusinessService.getGeneralLedgerAccount(req.businessId, req.params.accountId, req.query);
      res.json({ success: true, data: gl });
    } catch (e) {
      next(e);
    }
  },

  async createSalesReturn(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createSalesReturnIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createSalesReturn(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async listSalesReturns(req, res, next) {
    try {
      const returns = await BusinessService.listSalesReturns(req.businessId);
      res.json({ success: true, data: returns });
    } catch (e) {
      next(e);
    }
  },

  async listWarehouses(req, res, next) {
    try {
      const whs = await BusinessService.listWarehouses(req.businessId);
      res.json({ success: true, data: whs });
    } catch (e) {
      next(e);
    }
  },

  async createWarehouse(req, res, next) {
    try {
      const wh = await BusinessService.createWarehouse(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: wh });
    } catch (e) {
      next(e);
    }
  },

  async createStockTransfer(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createStockTransferIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createStockTransfer(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async listStockTransfers(req, res, next) {
    try {
      const transfers = await BusinessService.listStockTransfers(req.businessId);
      res.json({ success: true, data: transfers });
    } catch (e) {
      next(e);
    }
  },

  async getStockTransfer(req, res, next) {
    try {
      const trf = await BusinessService.getStockTransfer(req.businessId, req.params.transferId);
      if (!trf) return res.status(404).json({ success: false, message: 'Stock transfer not found' });
      res.json({ success: true, data: trf });
    } catch (e) {
      next(e);
    }
  },

  async receiveStockTransfer(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.receiveStockTransferIdempotent(req.businessId, req.user.id, req.params.transferId, req.financialRequestKey)
        : await BusinessService.receiveStockTransfer(req.businessId, req.user.id, req.params.transferId);
      res.json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async createStockCount(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createStockCountIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createStockCount(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async listStockCounts(req, res, next) {
    try {
      const counts = await BusinessService.listStockCounts(req.businessId);
      res.json({ success: true, data: counts });
    } catch (e) {
      next(e);
    }
  },

  async getStockCount(req, res, next) {
    try {
      const count = await BusinessService.getStockCount(req.businessId, req.params.countId);
      if (!count) return res.status(404).json({ success: false, message: 'Stock count not found' });
      res.json({ success: true, data: count });
    } catch (e) {
      next(e);
    }
  },

  async reconcileStockCount(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.reconcileStockCountIdempotent(req.businessId, req.user.id, req.params.countId, req.financialRequestKey)
        : await BusinessService.reconcileStockCount(req.businessId, req.user.id, req.params.countId);
      res.json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async getActiveShift(req, res, next) {
    try {
      const shift = await BusinessService.getActiveShift(req.businessId, req.user.id);
      res.json({ success: true, data: shift });
    } catch (e) {
      next(e);
    }
  },

  async openShift(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.openShiftIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.openShift(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async closeShift(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.closeShiftIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.closeShift(req.businessId, req.user.id, req.body);
      res.json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async listShifts(req, res, next) {
    try {
      const shifts = await BusinessService.listShifts(req.businessId);
      res.json({ success: true, data: shifts });
    } catch (e) {
      next(e);
    }
  },

  async getCustomerAging(req, res, next) {
    try {
      const report = await BusinessService.getCustomerAging(req.businessId, req.query.asOfDate);
      res.json({ success: true, data: report });
    } catch (e) {
      next(e);
    }
  },

  async getSupplierAging(req, res, next) {
    try {
      const report = await BusinessService.getSupplierAging(req.businessId, req.query.asOfDate);
      res.json({ success: true, data: report });
    } catch (e) {
      next(e);
    }
  },

  async logAttendance(req, res, next) {
    try {
      const att = await BusinessService.logAttendance(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: att });
    } catch (e) {
      next(e);
    }
  },

  async listAttendance(req, res, next) {
    try {
      const att = await BusinessService.listAttendance(req.businessId, req.query.month);
      res.json({ success: true, data: att });
    } catch (e) {
      next(e);
    }
  },

  async runItemizedPayroll(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.runItemizedPayrollIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.runItemizedPayroll(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async createBudget(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createBudgetIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createBudget(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  async listBudgets(req, res, next) {
    try {
      const budgets = await BusinessService.listBudgets(req.businessId, req.query.period);
      res.json({ success: true, data: budgets });
    } catch (e) {
      next(e);
    }
  },

  async listNotifications(req, res, next) {
    try {
      const notifications = await BusinessService.listNotifications(req.businessId, req.query.unreadOnly === 'true');
      res.json({ success: true, data: notifications });
    } catch (e) {
      next(e);
    }
  },

  async markNotificationRead(req, res, next) {
    try {
      const notif = await BusinessService.markNotificationRead(req.businessId, req.params.notificationId);
      res.json({ success: true, data: notif });
    } catch (e) {
      next(e);
    }
  },
};

module.exports = BusinessController;

