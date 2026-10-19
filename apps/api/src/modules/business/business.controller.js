/**
 * Business controller.
 */

const BusinessService = require('./business.service');
const BusinessDocuments = require('./business.documents');

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

  // ---------------------------------------------------------------------------
  // Advanced Procurement (V3)
  // ---------------------------------------------------------------------------

  // 1. Purchase Requests
  async listPurchaseRequests(req, res, next) {
    try {
      const requests = await BusinessService.listPurchaseRequests(req.businessId, req.query);
      res.json({ success: true, data: requests });
    } catch (e) {
      next(e);
    }
  },

  async getPurchaseRequest(req, res, next) {
    try {
      const pr = await BusinessService.getPurchaseRequest(req.businessId, req.params.requestId);
      if (!pr) return res.status(404).json({ success: false, message: 'Purchase request not found' });
      res.json({ success: true, data: pr });
    } catch (e) {
      next(e);
    }
  },

  async createPurchaseRequest(req, res, next) {
    try {
      const pr = await BusinessService.createPurchaseRequest(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: pr });
    } catch (e) {
      next(e);
    }
  },

  async submitPurchaseRequest(req, res, next) {
    try {
      const pr = await BusinessService.submitPurchaseRequest(req.businessId, req.user.id, req.params.requestId);
      res.json({ success: true, data: pr });
    } catch (e) {
      next(e);
    }
  },

  async approvePurchaseRequest(req, res, next) {
    try {
      const pr = await BusinessService.approvePurchaseRequest(req.businessId, req.user.id, req.params.requestId);
      res.json({ success: true, data: pr });
    } catch (e) {
      next(e);
    }
  },

  async rejectPurchaseRequest(req, res, next) {
    try {
      const pr = await BusinessService.rejectPurchaseRequest(req.businessId, req.user.id, req.params.requestId, req.body?.reason || '');
      res.json({ success: true, data: pr });
    } catch (e) {
      next(e);
    }
  },

  // 2. Purchase Orders
  async listPurchaseOrders(req, res, next) {
    try {
      const orders = await BusinessService.listPurchaseOrders(req.businessId, req.query);
      res.json({ success: true, data: orders });
    } catch (e) {
      next(e);
    }
  },

  async getPurchaseOrder(req, res, next) {
    try {
      const po = await BusinessService.getPurchaseOrder(req.businessId, req.params.poId);
      if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
      res.json({ success: true, data: po });
    } catch (e) {
      next(e);
    }
  },

  async createPurchaseOrder(req, res, next) {
    try {
      const po = await BusinessService.createPurchaseOrder(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: po });
    } catch (e) {
      next(e);
    }
  },

  async submitPurchaseOrder(req, res, next) {
    try {
      const po = await BusinessService.submitPurchaseOrder(req.businessId, req.user.id, req.params.poId);
      res.json({ success: true, data: po });
    } catch (e) {
      next(e);
    }
  },

  async approvePurchaseOrder(req, res, next) {
    try {
      const po = await BusinessService.approvePurchaseOrder(req.businessId, req.user.id, req.params.poId);
      res.json({ success: true, data: po });
    } catch (e) {
      next(e);
    }
  },

  async rejectPurchaseOrder(req, res, next) {
    try {
      const po = await BusinessService.rejectPurchaseOrder(req.businessId, req.user.id, req.params.poId, req.body?.reason || '');
      res.json({ success: true, data: po });
    } catch (e) {
      next(e);
    }
  },

  async sendPurchaseOrder(req, res, next) {
    try {
      const po = await BusinessService.sendPurchaseOrder(req.businessId, req.user.id, req.params.poId);
      res.json({ success: true, data: po });
    } catch (e) {
      next(e);
    }
  },

  // 3. Goods Received Notes (GRN)
  async listGrns(req, res, next) {
    try {
      const grns = await BusinessService.listGrns(req.businessId, req.query);
      res.json({ success: true, data: grns });
    } catch (e) {
      next(e);
    }
  },

  async getGrn(req, res, next) {
    try {
      const grn = await BusinessService.getGrn(req.businessId, req.params.grnId);
      if (!grn) return res.status(404).json({ success: false, message: 'Goods Received Note not found' });
      res.json({ success: true, data: grn });
    } catch (e) {
      next(e);
    }
  },

  async createGrn(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createGrnIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createGrn(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  // 4. Supplier Bills
  async listSupplierBills(req, res, next) {
    try {
      const bills = await BusinessService.listSupplierBills(req.businessId, req.query);
      res.json({ success: true, data: bills });
    } catch (e) {
      next(e);
    }
  },

  async getSupplierBill(req, res, next) {
    try {
      const bill = await BusinessService.getSupplierBill(req.businessId, req.params.billId);
      if (!bill) return res.status(404).json({ success: false, message: 'Supplier bill not found' });
      res.json({ success: true, data: bill });
    } catch (e) {
      next(e);
    }
  },

  async createSupplierBill(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createSupplierBillIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createSupplierBill(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  // 5. Supplier Payments
  async createSupplierPayment(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createSupplierPaymentIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createSupplierPayment(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  // 6. Purchase Returns
  async listPurchaseReturns(req, res, next) {
    try {
      const returns = await BusinessService.listPurchaseReturns(req.businessId, req.query);
      res.json({ success: true, data: returns });
    } catch (e) {
      next(e);
    }
  },

  async getPurchaseReturn(req, res, next) {
    try {
      const prn = await BusinessService.getPurchaseReturn(req.businessId, req.params.returnId);
      if (!prn) return res.status(404).json({ success: false, message: 'Purchase return not found' });
      res.json({ success: true, data: prn });
    } catch (e) {
      next(e);
    }
  },

  async createPurchaseReturn(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.createPurchaseReturnIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.createPurchaseReturn(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  // ---------------------------------------------------------------------------
  // Recurring Business Expenses (V3)
  // ---------------------------------------------------------------------------
  async listRecurringExpenses(req, res, next) {
    try {
      const expenses = await BusinessService.listRecurringExpenses(req.businessId, req.query);
      res.json({ success: true, data: expenses });
    } catch (e) {
      next(e);
    }
  },

  async getRecurringExpense(req, res, next) {
    try {
      const expense = await BusinessService.getRecurringExpense(req.businessId, req.params.recurringId);
      if (!expense) return res.status(404).json({ success: false, message: 'Recurring expense not found' });
      res.json({ success: true, data: expense });
    } catch (e) {
      next(e);
    }
  },

  async createRecurringExpense(req, res, next) {
    try {
      const created = await BusinessService.createRecurringExpense(req.businessId, req.user.id, req.body);
      res.status(201).json({ success: true, data: created });
    } catch (e) {
      next(e);
    }
  },

  async updateRecurringExpense(req, res, next) {
    try {
      const updated = await BusinessService.updateRecurringExpense(req.businessId, req.user.id, req.params.recurringId, req.body);
      res.json({ success: true, data: updated });
    } catch (e) {
      next(e);
    }
  },

  async pauseRecurringExpense(req, res, next) {
    try {
      const paused = await BusinessService.pauseRecurringExpense(req.businessId, req.user.id, req.params.recurringId);
      res.json({ success: true, data: paused });
    } catch (e) {
      next(e);
    }
  },

  async resumeRecurringExpense(req, res, next) {
    try {
      const resumed = await BusinessService.resumeRecurringExpense(req.businessId, req.user.id, req.params.recurringId);
      res.json({ success: true, data: resumed });
    } catch (e) {
      next(e);
    }
  },

  async cancelRecurringExpense(req, res, next) {
    try {
      const cancelled = await BusinessService.cancelRecurringExpense(req.businessId, req.user.id, req.params.recurringId);
      res.json({ success: true, data: cancelled });
    } catch (e) {
      next(e);
    }
  },

  async getUpcomingRecurringExpenses(req, res, next) {
    try {
      const days = Number(req.query.days) || 30;
      const upcoming = await BusinessService.getUpcomingRecurringExpenses(req.businessId, days);
      res.json({ success: true, data: upcoming });
    } catch (e) {
      next(e);
    }
  },

  async getOverdueRecurringExpenses(req, res, next) {
    try {
      const overdue = await BusinessService.getOverdueRecurringExpenses(req.businessId);
      res.json({ success: true, data: overdue });
    } catch (e) {
      next(e);
    }
  },

  async listRecurringOccurrences(req, res, next) {
    try {
      const occurrences = await BusinessService.listRecurringOccurrences(req.businessId, req.params.recurringId, req.query);
      res.json({ success: true, data: occurrences });
    } catch (e) {
      next(e);
    }
  },

  async generateRecurringOccurrences(req, res, next) {
    try {
      const result = req.financialRequestKey
        ? await BusinessService.generateRecurringExpenseOccurrencesIdempotent(req.businessId, req.user.id, req.financialRequestKey, req.body)
        : await BusinessService.generateRecurringExpenseOccurrences(req.businessId, req.user.id, req.body);
      res.status(200).json({ success: true, data: unwrap(result) });
    } catch (e) {
      next(e);
    }
  },

  // ---------------------------------------------------------------------------
  // Professional Document Generation (V3)
  // ---------------------------------------------------------------------------
  async generateDocumentPdf(req, res, next) {
    try {
      const { docType, docId } = req.params;
      const lang = req.query.lang || 'en';

      const restrictedDocTypes = ['profit-and-loss', 'pnl', 'balance-sheet', 'cash-flow', 'employee-payslip', 'payslip'];
      if (restrictedDocTypes.includes(docType)) {
        const role = req.businessMembership?.role;
        if (role !== 'owner' && role !== 'admin' && role !== 'accountant') {
          return res.status(403).json({ success: false, message: 'Insufficient business permissions to view this document' });
        }
      }

      const result = await BusinessDocuments.generateDocumentPdf({
        businessId: req.businessId,
        docType,
        docId: docId || req.query.id,
        query: req.query,
        lang,
      });

      res.setHeader('Content-Type', result.contentType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
      res.setHeader('Content-Length', result.buffer.length);
      return res.end(result.buffer);
    } catch (e) {
      next(e);
    }
  },

  // ---------------------------------------------------------------------------
  // Offline POS Synchronization (V3)
  // ---------------------------------------------------------------------------
  async syncOfflineSale(req, res, next) {
    try {
      const rawResult = await BusinessService.syncOfflineSale(req.businessId, req.user.id, req.body);
      const result = unwrap(rawResult);
      if (result.status === 'conflict') {
        return res.status(409).json({
          success: false,
          status: 'conflict',
          data: result,
          message: result.conflictReason || 'Transaction conflict detected',
        });
      }
      res.status(200).json({ success: true, data: result });
    } catch (e) {
      next(e);
    }
  },

  async listOfflineSyncHistory(req, res, next) {
    try {
      const history = await BusinessService.listOfflineSyncHistory(req.businessId, req.query.limit);
      res.status(200).json({ success: true, data: history });
    } catch (e) {
      next(e);
    }
  },
};

module.exports = BusinessController;

