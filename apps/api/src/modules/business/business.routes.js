/**
 * Business Mode API Routes.
 */

const express = require('express');
const { protect } = require('../auth/auth.middleware');
const validate = require('../../shared/middleware/validate');
const { requireKey } = require('../../shared/finance/idempotency');
const { requireBusinessMember, requireBusinessRole } = require('./business.middleware');
const BusinessValidator = require('./business.validator');
const ctrl = require('./business.controller');

const router = express.Router();

router.use(protect);

// User-level business listing & creation
router.post('/', BusinessValidator.createBusiness, validate, requireKey, ctrl.createBusiness);
router.get('/', ctrl.listUserBusinesses);

// Business-scoped router
const bizScope = express.Router({ mergeParams: true });
bizScope.use(requireBusinessMember);

// Business details & settings
bizScope.get('/', ctrl.getBusiness);
bizScope.patch('/', requireBusinessRole(['owner', 'admin']), ctrl.updateBusiness);
bizScope.get('/dashboard', ctrl.getDashboard);
bizScope.get('/accounts', ctrl.listAccounts);

// Products & Inventory
bizScope.get('/products', ctrl.listProducts);
bizScope.post('/products', requireBusinessRole(['owner', 'admin', 'inventory_manager']), BusinessValidator.createProduct, validate, ctrl.createProduct);
bizScope.patch('/products/:productId', requireBusinessRole(['owner', 'admin', 'inventory_manager']), ctrl.updateProduct);
bizScope.post('/products/adjust-stock', requireBusinessRole(['owner', 'admin', 'inventory_manager']), requireKey, ctrl.adjustStock);
bizScope.get('/categories', ctrl.listCategories);
bizScope.post('/categories', requireBusinessRole(['owner', 'admin', 'inventory_manager']), ctrl.createCategory);

// Customers & Khata
bizScope.get('/customers', ctrl.listCustomers);
bizScope.get('/customers/:customerId', ctrl.getCustomer);
bizScope.post('/customers', BusinessValidator.createCustomer, validate, ctrl.createCustomer);

// Suppliers & Khata
bizScope.get('/suppliers', ctrl.listSuppliers);
bizScope.get('/suppliers/:supplierId', ctrl.getSupplier);
bizScope.post('/suppliers', BusinessValidator.createSupplier, validate, ctrl.createSupplier);

// Sales & POS
bizScope.get('/sales', ctrl.listSales);
bizScope.get('/sales/:saleId', ctrl.getSale);
bizScope.post('/sales', requireBusinessRole(['owner', 'admin', 'cashier']), BusinessValidator.createSale, validate, requireKey, ctrl.createSale);

// Purchases & Advanced Procurement (V3)
bizScope.get('/purchases', ctrl.listPurchases);
bizScope.get('/purchases/:purchaseId', ctrl.getPurchase);
bizScope.post('/purchases', requireBusinessRole(['owner', 'admin', 'inventory_manager']), BusinessValidator.createPurchase, validate, requireKey, ctrl.createPurchase);

// Purchase Requests (Requisitions)
bizScope.get('/purchase-requests', ctrl.listPurchaseRequests);
bizScope.get('/purchase-requests/:requestId', ctrl.getPurchaseRequest);
bizScope.post('/purchase-requests', requireBusinessRole(['owner', 'admin', 'inventory_manager', 'employee']), BusinessValidator.createPurchaseRequest, validate, ctrl.createPurchaseRequest);
bizScope.post('/purchase-requests/:requestId/submit', requireBusinessRole(['owner', 'admin', 'inventory_manager', 'employee']), ctrl.submitPurchaseRequest);
bizScope.post('/purchase-requests/:requestId/approve', requireBusinessRole(['owner', 'admin']), ctrl.approvePurchaseRequest);
bizScope.post('/purchase-requests/:requestId/reject', requireBusinessRole(['owner', 'admin']), ctrl.rejectPurchaseRequest);

// Purchase Orders (PO)
bizScope.get('/purchase-orders', ctrl.listPurchaseOrders);
bizScope.get('/purchase-orders/:poId', ctrl.getPurchaseOrder);
bizScope.post('/purchase-orders', requireBusinessRole(['owner', 'admin', 'inventory_manager']), BusinessValidator.createPurchaseOrder, validate, ctrl.createPurchaseOrder);
bizScope.post('/purchase-orders/:poId/submit', requireBusinessRole(['owner', 'admin', 'inventory_manager']), ctrl.submitPurchaseOrder);
bizScope.post('/purchase-orders/:poId/approve', requireBusinessRole(['owner', 'admin']), ctrl.approvePurchaseOrder);
bizScope.post('/purchase-orders/:poId/reject', requireBusinessRole(['owner', 'admin']), ctrl.rejectPurchaseOrder);
bizScope.post('/purchase-orders/:poId/send', requireBusinessRole(['owner', 'admin', 'inventory_manager']), ctrl.sendPurchaseOrder);

// Goods Received Notes (GRN) & Receipts
bizScope.get('/grns', ctrl.listGrns);
bizScope.get('/grns/:grnId', ctrl.getGrn);
bizScope.post('/grns', requireBusinessRole(['owner', 'admin', 'inventory_manager']), BusinessValidator.createGrn, validate, requireKey, ctrl.createGrn);

// Supplier Bills (Invoices) & Khata Integration
bizScope.get('/supplier-bills', ctrl.listSupplierBills);
bizScope.get('/supplier-bills/:billId', ctrl.getSupplierBill);
bizScope.post('/supplier-bills', requireBusinessRole(['owner', 'admin', 'accountant']), BusinessValidator.createSupplierBill, validate, requireKey, ctrl.createSupplierBill);

// Supplier Payments
bizScope.post('/supplier-payments', requireBusinessRole(['owner', 'admin', 'accountant']), requireKey, ctrl.createSupplierPayment);

// Purchase Returns (Debit Notes)
bizScope.get('/purchase-returns', ctrl.listPurchaseReturns);
bizScope.get('/purchase-returns/:returnId', ctrl.getPurchaseReturn);
bizScope.post('/purchase-returns', requireBusinessRole(['owner', 'admin', 'inventory_manager']), BusinessValidator.createPurchaseReturn, validate, requireKey, ctrl.createPurchaseReturn);

// Expenses
bizScope.get('/expenses', ctrl.listExpenses);
bizScope.post('/expenses', requireBusinessRole(['owner', 'admin']), BusinessValidator.createExpense, validate, requireKey, ctrl.createExpense);

// Payments (Khata Settlements, Transfers, Owner Capital/Drawings)
bizScope.get('/payments', ctrl.listPayments);
bizScope.post('/payments', requireBusinessRole(['owner', 'admin', 'cashier', 'accountant']), BusinessValidator.createPayment, validate, requireKey, ctrl.createPayment);

// Staff & Payroll
bizScope.get('/employees', requireBusinessRole(['owner', 'admin']), ctrl.listEmployees);
bizScope.post('/employees', requireBusinessRole(['owner', 'admin']), ctrl.createEmployee);
bizScope.get('/payroll', requireBusinessRole(['owner', 'admin', 'accountant']), ctrl.listPayroll);
bizScope.post('/payroll/run', requireBusinessRole(['owner', 'admin', 'accountant']), requireKey, ctrl.runPayroll);

// Financial Reports
bizScope.get('/reports/profit-and-loss', requireBusinessRole(['owner', 'admin', 'accountant']), ctrl.getProfitAndLoss);
bizScope.get('/reports/trial-balance', requireBusinessRole(['owner', 'admin', 'accountant']), ctrl.getTrialBalance);
bizScope.get('/reports/balance-sheet', requireBusinessRole(['owner', 'admin', 'accountant']), ctrl.getBalanceSheet);
bizScope.get('/reports/cash-flow', requireBusinessRole(['owner', 'admin', 'accountant']), ctrl.getCashFlowStatement);
bizScope.get('/reports/general-ledger/:accountId', requireBusinessRole(['owner', 'admin', 'accountant']), ctrl.getGeneralLedgerAccount);
bizScope.get('/reports/aging/customers', requireBusinessRole(['owner', 'admin', 'accountant']), ctrl.getCustomerAging);
bizScope.get('/reports/aging/suppliers', requireBusinessRole(['owner', 'admin', 'accountant']), ctrl.getSupplierAging);

// Sales Returns
bizScope.get('/sales-returns', ctrl.listSalesReturns);
bizScope.post('/sales-returns', requireBusinessRole(['owner', 'admin', 'cashier']), BusinessValidator.createSalesReturn, validate, requireKey, ctrl.createSalesReturn);

// Warehouses & Stock Movement
bizScope.get('/warehouses', ctrl.listWarehouses);
bizScope.post('/warehouses', requireBusinessRole(['owner', 'admin', 'inventory_manager']), BusinessValidator.createWarehouse, validate, ctrl.createWarehouse);
bizScope.get('/stock-transfers', ctrl.listStockTransfers);
bizScope.get('/stock-transfers/:transferId', ctrl.getStockTransfer);
bizScope.post('/stock-transfers', requireBusinessRole(['owner', 'admin', 'inventory_manager']), BusinessValidator.createStockTransfer, validate, requireKey, ctrl.createStockTransfer);
bizScope.post('/stock-transfers/:transferId/receive', requireBusinessRole(['owner', 'admin', 'inventory_manager']), requireKey, ctrl.receiveStockTransfer);

// Physical Stock Counts & Reconciliation
bizScope.get('/stock-counts', ctrl.listStockCounts);
bizScope.get('/stock-counts/:countId', ctrl.getStockCount);
bizScope.post('/stock-counts', requireBusinessRole(['owner', 'admin', 'inventory_manager']), BusinessValidator.createStockCount, validate, requireKey, ctrl.createStockCount);
bizScope.post('/stock-counts/:countId/reconcile', requireBusinessRole(['owner', 'admin', 'inventory_manager']), requireKey, ctrl.reconcileStockCount);

// POS Cashier Shifts
bizScope.get('/shifts/active', ctrl.getActiveShift);
bizScope.get('/shifts', ctrl.listShifts);
bizScope.post('/shifts/open', requireBusinessRole(['owner', 'admin', 'cashier']), BusinessValidator.openShift, validate, requireKey, ctrl.openShift);
bizScope.post('/shifts/close', requireBusinessRole(['owner', 'admin', 'cashier']), BusinessValidator.closeShift, validate, requireKey, ctrl.closeShift);

// Staff Attendance & Itemized Payroll
bizScope.get('/attendance', requireBusinessRole(['owner', 'admin']), ctrl.listAttendance);
bizScope.post('/attendance', requireBusinessRole(['owner', 'admin']), BusinessValidator.logAttendance, validate, ctrl.logAttendance);
bizScope.post('/payroll/itemized-run', requireBusinessRole(['owner', 'admin', 'accountant']), requireKey, ctrl.runItemizedPayroll);

// Business Budgets
bizScope.get('/budgets', requireBusinessRole(['owner', 'admin', 'accountant']), ctrl.listBudgets);
bizScope.post('/budgets', requireBusinessRole(['owner', 'admin', 'accountant']), BusinessValidator.createBudget, validate, requireKey, ctrl.createBudget);

// Notifications
bizScope.get('/notifications', ctrl.listNotifications);
bizScope.patch('/notifications/:notificationId/read', ctrl.markNotificationRead);

router.use('/:businessId', bizScope);

module.exports = router;
