import client from '../../../shared/api/client';

export const businessApi = {
  // Businesses
  listBusinesses: () => client.get('/business').then((r) => r.data.data),
  createBusiness: (payload, options = {}) => {
    const key = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
    return client.post('/business', payload, {
      ...options,
      headers: {
        'Idempotency-Key': key,
        ...(options.headers || {}),
      },
    }).then((r) => r.data.data);
  },
  getBusiness: (id) => client.get(`/business/${id}`).then((r) => r.data.data),
  updateBusiness: (id, payload) => client.patch(`/business/${id}`, payload).then((r) => r.data.data),

  // Dashboard & Accounts
  getDashboard: (id) => client.get(`/business/${id}/dashboard`).then((r) => r.data.data),
  listAccounts: (id) => client.get(`/business/${id}/accounts`).then((r) => r.data.data),

  // Products & Inventory
  listProducts: (id, params) => client.get(`/business/${id}/products`, { params }).then((r) => r.data.data),
  createProduct: (id, payload) => client.post(`/business/${id}/products`, payload).then((r) => r.data.data),
  updateProduct: (id, productId, payload) => client.patch(`/business/${id}/products/${productId}`, payload).then((r) => r.data.data),
  adjustStock: (id, payload) => client.post(`/business/${id}/products/adjust-stock`, payload).then((r) => r.data.data),
  listCategories: (id) => client.get(`/business/${id}/categories`).then((r) => r.data.data),
  createCategory: (id, payload) => client.post(`/business/${id}/categories`, payload).then((r) => r.data.data),

  // Customers & Khata
  listCustomers: (id, params) => client.get(`/business/${id}/customers`, { params }).then((r) => r.data.data),
  getCustomer: (id, customerId) => client.get(`/business/${id}/customers/${customerId}`).then((r) => r.data.data),
  createCustomer: (id, payload) => client.post(`/business/${id}/customers`, payload).then((r) => r.data.data),

  // Suppliers & Khata
  listSuppliers: (id, params) => client.get(`/business/${id}/suppliers`, { params }).then((r) => r.data.data),
  getSupplier: (id, supplierId) => client.get(`/business/${id}/suppliers/${supplierId}`).then((r) => r.data.data),
  createSupplier: (id, payload) => client.post(`/business/${id}/suppliers`, payload).then((r) => r.data.data),

  // Sales & POS
  listSales: (id, params) => client.get(`/business/${id}/sales`, { params }).then((r) => r.data.data),
  getSale: (id, saleId) => client.get(`/business/${id}/sales/${saleId}`).then((r) => r.data.data),
  createSale: (id, payload) => client.post(`/business/${id}/sales`, payload).then((r) => r.data.data),

  // Purchases
  listPurchases: (id, params) => client.get(`/business/${id}/purchases`, { params }).then((r) => r.data.data),
  getPurchase: (id, purchaseId) => client.get(`/business/${id}/purchases/${purchaseId}`).then((r) => r.data.data),
  createPurchase: (id, payload) => client.post(`/business/${id}/purchases`, payload).then((r) => r.data.data),

  // Expenses
  listExpenses: (id, params) => client.get(`/business/${id}/expenses`, { params }).then((r) => r.data.data),
  createExpense: (id, payload) => client.post(`/business/${id}/expenses`, payload).then((r) => r.data.data),

  // Payments (Khata Collections, Transfers, Capital, Drawings)
  listPayments: (id, params) => client.get(`/business/${id}/payments`, { params }).then((r) => r.data.data),
  createPayment: (id, payload) => client.post(`/business/${id}/payments`, payload).then((r) => r.data.data),

  // Staff & Payroll
  listEmployees: (id) => client.get(`/business/${id}/employees`).then((r) => r.data.data),
  createEmployee: (id, payload) => client.post(`/business/${id}/employees`, payload).then((r) => r.data.data),
  listPayroll: (id) => client.get(`/business/${id}/payroll`).then((r) => r.data.data),
  runPayroll: (id, payload) => client.post(`/business/${id}/payroll/run`, payload).then((r) => r.data.data),

  // Reports
  getProfitAndLoss: (id, params) => client.get(`/business/${id}/reports/profit-and-loss`, { params }).then((r) => r.data.data),
  getTrialBalance: (id, params) => client.get(`/business/${id}/reports/trial-balance`, { params }).then((r) => r.data.data),
  getBalanceSheet: (id, params) => client.get(`/business/${id}/reports/balance-sheet`, { params }).then((r) => r.data.data),
  getCashFlow: (id, params) => client.get(`/business/${id}/reports/cash-flow`, { params }).then((r) => r.data.data),
  getGeneralLedgerAccount: (id, accountId, params) => client.get(`/business/${id}/reports/general-ledger/${accountId}`, { params }).then((r) => r.data.data),
  getCustomerAging: (id, params) => client.get(`/business/${id}/reports/aging/customers`, { params }).then((r) => r.data.data),
  getSupplierAging: (id, params) => client.get(`/business/${id}/reports/aging/suppliers`, { params }).then((r) => r.data.data),

  // Sales Returns
  listSalesReturns: (id) => client.get(`/business/${id}/sales-returns`).then((r) => r.data.data),
  createSalesReturn: (id, payload) => client.post(`/business/${id}/sales-returns`, payload).then((r) => r.data.data),

  // Warehouses & Stock Movements
  listWarehouses: (id) => client.get(`/business/${id}/warehouses`).then((r) => r.data.data),
  createWarehouse: (id, payload) => client.post(`/business/${id}/warehouses`, payload).then((r) => r.data.data),
  listStockTransfers: (id) => client.get(`/business/${id}/stock-transfers`).then((r) => r.data.data),
  createStockTransfer: (id, payload) => client.post(`/business/${id}/stock-transfers`, payload).then((r) => r.data.data),
  receiveStockTransfer: (id, transferId) => client.post(`/business/${id}/stock-transfers/${transferId}/receive`).then((r) => r.data.data),

  // Stock Counts & Physical Reconciliation
  listStockCounts: (id) => client.get(`/business/${id}/stock-counts`).then((r) => r.data.data),
  createStockCount: (id, payload) => client.post(`/business/${id}/stock-counts`, payload).then((r) => r.data.data),
  reconcileStockCount: (id, countId) => client.post(`/business/${id}/stock-counts/${countId}/reconcile`).then((r) => r.data.data),

  // POS Shifts
  getActiveShift: (id) => client.get(`/business/${id}/shifts/active`).then((r) => r.data.data),
  listShifts: (id) => client.get(`/business/${id}/shifts`).then((r) => r.data.data),
  openShift: (id, payload) => client.post(`/business/${id}/shifts/open`, payload).then((r) => r.data.data),
  closeShift: (id, payload) => client.post(`/business/${id}/shifts/close`, payload).then((r) => r.data.data),

  // Offline POS Synchronization (V3)
  syncOfflineSale: (id, payload) => client.post(`/business/${id}/pos/sync`, payload).then((r) => r.data),
  listOfflineSyncHistory: (id, params) => client.get(`/business/${id}/pos/sync-history`, { params }).then((r) => r.data.data),

  // Attendance & Itemized Payroll
  listAttendance: (id, params) => client.get(`/business/${id}/attendance`, { params }).then((r) => r.data.data),
  logAttendance: (id, payload) => client.post(`/business/${id}/attendance`, payload).then((r) => r.data.data),
  runItemizedPayroll: (id, payload) => client.post(`/business/${id}/payroll/itemized-run`, payload).then((r) => r.data.data),

  // Budgets
  listBudgets: (id, params) => client.get(`/business/${id}/budgets`, { params }).then((r) => r.data.data),
  createBudget: (id, payload) => client.post(`/business/${id}/budgets`, payload).then((r) => r.data.data),

  // Recurring Expenses (V3)
  listRecurringExpenses: (id, params) => client.get(`/business/${id}/recurring-expenses`, { params }).then((r) => r.data.data),
  getUpcomingRecurringExpenses: (id) => client.get(`/business/${id}/recurring-expenses/upcoming`).then((r) => r.data.data),
  getOverdueRecurringExpenses: (id) => client.get(`/business/${id}/recurring-expenses/overdue`).then((r) => r.data.data),
  getRecurringExpense: (id, recurringId) => client.get(`/business/${id}/recurring-expenses/${recurringId}`).then((r) => r.data.data),
  createRecurringExpense: (id, payload) => client.post(`/business/${id}/recurring-expenses`, payload).then((r) => r.data.data),
  updateRecurringExpense: (id, recurringId, payload) => client.put(`/business/${id}/recurring-expenses/${recurringId}`, payload).then((r) => r.data.data),
  pauseRecurringExpense: (id, recurringId) => client.post(`/business/${id}/recurring-expenses/${recurringId}/pause`).then((r) => r.data.data),
  resumeRecurringExpense: (id, recurringId) => client.post(`/business/${id}/recurring-expenses/${recurringId}/resume`).then((r) => r.data.data),
  cancelRecurringExpense: (id, recurringId) => client.post(`/business/${id}/recurring-expenses/${recurringId}/cancel`).then((r) => r.data.data),
  listRecurringOccurrences: (id, recurringId) => client.get(`/business/${id}/recurring-expenses/${recurringId}/occurrences`).then((r) => r.data.data),
  generateRecurringExpenses: (id, payload) => client.post(`/business/${id}/recurring-expenses/generate`, payload).then((r) => r.data.data),

  // Advanced Procurement (V3)
  listPurchaseRequests: (id, params) => client.get(`/business/${id}/purchase-requests`, { params }).then((r) => r.data.data),
  getPurchaseRequest: (id, reqId) => client.get(`/business/${id}/purchase-requests/${reqId}`).then((r) => r.data.data),
  createPurchaseRequest: (id, payload) => client.post(`/business/${id}/purchase-requests`, payload).then((r) => r.data.data),
  submitPurchaseRequest: (id, reqId) => client.post(`/business/${id}/purchase-requests/${reqId}/submit`).then((r) => r.data.data),
  approvePurchaseRequest: (id, reqId) => client.post(`/business/${id}/purchase-requests/${reqId}/approve`).then((r) => r.data.data),
  rejectPurchaseRequest: (id, reqId, payload) => client.post(`/business/${id}/purchase-requests/${reqId}/reject`, payload).then((r) => r.data.data),

  listPurchaseOrders: (id, params) => client.get(`/business/${id}/purchase-orders`, { params }).then((r) => r.data.data),
  getPurchaseOrder: (id, poId) => client.get(`/business/${id}/purchase-orders/${poId}`).then((r) => r.data.data),
  createPurchaseOrder: (id, payload) => client.post(`/business/${id}/purchase-orders`, payload).then((r) => r.data.data),
  submitPurchaseOrder: (id, poId) => client.post(`/business/${id}/purchase-orders/${poId}/submit`).then((r) => r.data.data),
  approvePurchaseOrder: (id, poId) => client.post(`/business/${id}/purchase-orders/${poId}/approve`).then((r) => r.data.data),
  rejectPurchaseOrder: (id, poId, payload) => client.post(`/business/${id}/purchase-orders/${poId}/reject`, payload).then((r) => r.data.data),
  sendPurchaseOrder: (id, poId) => client.post(`/business/${id}/purchase-orders/${poId}/send`).then((r) => r.data.data),

  listGrns: (id, params) => client.get(`/business/${id}/grns`, { params }).then((r) => r.data.data),
  getGrn: (id, grnId) => client.get(`/business/${id}/grns/${grnId}`).then((r) => r.data.data),
  createGrn: (id, payload) => client.post(`/business/${id}/grns`, payload).then((r) => r.data.data),

  listSupplierBills: (id, params) => client.get(`/business/${id}/supplier-bills`, { params }).then((r) => r.data.data),
  getSupplierBill: (id, billId) => client.get(`/business/${id}/supplier-bills/${billId}`).then((r) => r.data.data),
  createSupplierBill: (id, payload) => client.post(`/business/${id}/supplier-bills`, payload).then((r) => r.data.data),

  createSupplierPayment: (id, payload) => client.post(`/business/${id}/supplier-payments`, payload).then((r) => r.data.data),

  listPurchaseReturns: (id, params) => client.get(`/business/${id}/purchase-returns`, { params }).then((r) => r.data.data),
  getPurchaseReturn: (id, returnId) => client.get(`/business/${id}/purchase-returns/${returnId}`).then((r) => r.data.data),
  createPurchaseReturn: (id, payload) => client.post(`/business/${id}/purchase-returns`, payload).then((r) => r.data.data),
};

export default businessApi;

