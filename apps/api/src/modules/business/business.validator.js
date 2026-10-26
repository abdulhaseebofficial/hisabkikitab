/**
 * Express-Validator rules for Business Mode.
 */

const { body, param, query } = require('express-validator');
const { CURRENCY_CODES } = require('@hisabkikitab/contracts');
// Business names, products, customers and suppliers are written in whatever
// script the shop keeps its books in. `unicodeText` normalises to NFC so a
// search matches across keyboards, and refuses only the characters Postgres
// cannot store - see shared/validation/rules.js.
const { unicodeText } = require('../../shared/validation/rules');

const BusinessValidator = {
  createBusiness: [
    unicodeText(body('name'), { min: 1, max: 150, message: 'Business name is required' }),
    body('currency').optional().isIn(CURRENCY_CODES).withMessage('Unsupported currency code'),
  ],

  createProduct: [
    unicodeText(body('name'), { min: 1, max: 200, message: 'Product name is required' }),
    body('sellingPriceMinor').notEmpty().withMessage('Selling price is required'),
  ],

  createCustomer: [
    unicodeText(body('name'), { min: 1, max: 150, message: 'Customer name is required' }),
    body('phone').optional().trim().isLength({ max: 30 }),
  ],

  createSupplier: [
    unicodeText(body('name'), { min: 1, max: 150, message: 'Supplier name is required' }),
    body('phone').optional().trim().isLength({ max: 30 }),
  ],

  createSale: [
    body('items').isArray({ min: 1 }).withMessage('At least one product item is required for a sale'),
    body('items.*.productId').notEmpty().withMessage('Product ID is required'),
    body('items.*.quantity').notEmpty().withMessage('Quantity is required'),
  ],

  createPurchase: [
    body('items').isArray({ min: 1 }).withMessage('At least one product item is required for a purchase'),
    body('items.*.productId').notEmpty().withMessage('Product ID is required'),
    body('items.*.quantity').notEmpty().withMessage('Quantity is required'),
    body('items.*.unitPriceMinor').notEmpty().withMessage('Unit purchase price is required'),
  ],

  createExpense: [
    body('title').trim().notEmpty().withMessage('Expense title is required').isLength({ max: 200 }),
    body('amountMinor').notEmpty().withMessage('Expense amount is required'),
  ],

  createPayment: [
    body('paymentType').isIn(['customer_payment', 'supplier_payment', 'account_transfer', 'owner_contribution', 'owner_drawing']).withMessage('Invalid payment type'),
    body('amountMinor').notEmpty().withMessage('Payment amount is required'),
  ],

  createSalesReturn: [
    body('saleId').notEmpty().withMessage('Sale ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one return item is required'),
    body('items.*.quantity').notEmpty().withMessage('Quantity is required'),
  ],

  createWarehouse: [
    unicodeText(body('name'), { min: 1, max: 150, message: 'Warehouse name is required' }),
  ],

  createStockTransfer: [
    body('fromBranchId').notEmpty().withMessage('Origin branch / warehouse is required'),
    body('toBranchId').notEmpty().withMessage('Destination branch / warehouse is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one transfer item is required'),
    body('items.*.productId').notEmpty().withMessage('Product ID is required'),
    body('items.*.quantity').notEmpty().withMessage('Quantity is required'),
  ],

  createStockCount: [
    body('items').isArray({ min: 1 }).withMessage('At least one count item is required'),
    body('items.*.productId').notEmpty().withMessage('Product ID is required'),
    body('items.*.countedQty').notEmpty().withMessage('Counted quantity is required'),
  ],

  openShift: [
    body('openingCashMinor').optional().isNumeric().withMessage('Opening cash must be numeric'),
  ],

  closeShift: [
    body('actualCashMinor').notEmpty().withMessage('Actual drawer cash count is required'),
  ],

  logAttendance: [
    body('employeeId').notEmpty().withMessage('Employee ID is required'),
    body('date').notEmpty().withMessage('Date is required'),
    body('status').isIn(['present', 'absent', 'late', 'half_day', 'leave']).withMessage('Invalid attendance status'),
  ],

  createBudget: [
    body('title').trim().notEmpty().withMessage('Budget title is required'),
    body('categoryAccountId').notEmpty().withMessage('Account category is required'),
    body('targetAmountMinor').notEmpty().withMessage('Target amount is required'),
  ],

  createPurchaseRequest: [
    body('items').isArray({ min: 1 }).withMessage('At least one item is required for a purchase request'),
    unicodeText(body('items.*.productName'), { min: 1, max: 200, message: 'Product name is required' }),
    body('items.*.quantity').notEmpty().withMessage('Quantity is required'),
  ],

  createPurchaseOrder: [
    body('supplierId').notEmpty().withMessage('Supplier ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required for a purchase order'),
    body('items.*.productId').notEmpty().withMessage('Product ID is required'),
    body('items.*.quantityOrdered').notEmpty().withMessage('Ordered quantity is required'),
    body('items.*.unitPriceMinor').notEmpty().withMessage('Unit price is required'),
  ],

  createGrn: [
    body('poId').notEmpty().withMessage('Purchase Order ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one received item is required'),
    body('items.*.poItemId').notEmpty().withMessage('Purchase Order item ID is required'),
    body('items.*.productId').notEmpty().withMessage('Product ID is required'),
    body('items.*.quantityReceived').notEmpty().withMessage('Received quantity is required'),
  ],

  createSupplierBill: [
    body('supplierId').notEmpty().withMessage('Supplier ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one bill line item is required'),
    body('items.*.quantity').notEmpty().withMessage('Quantity is required'),
    body('items.*.unitPriceMinor').notEmpty().withMessage('Unit price is required'),
  ],

  createPurchaseReturn: [
    body('supplierId').notEmpty().withMessage('Supplier ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one return item is required'),
    body('items.*.productId').notEmpty().withMessage('Product ID is required'),
    body('items.*.quantity').notEmpty().withMessage('Return quantity is required'),
  ],

  createRecurringExpense: [
    body('title').trim().notEmpty().withMessage('Recurring expense title is required'),
    body('categoryAccountId').notEmpty().withMessage('Category account is required'),
    body('amountMinor').notEmpty().withMessage('Amount is required'),
    body('frequency').isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).withMessage('Valid frequency is required (daily, weekly, monthly, quarterly, yearly)'),
    body('startDate').notEmpty().withMessage('Start date is required'),
  ],

  updateRecurringExpense: [
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('amountMinor').optional().notEmpty().withMessage('Amount cannot be empty'),
    body('frequency').optional().isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).withMessage('Invalid frequency'),
  ],

  generateRecurringExpenses: [
    body('asOfDate').optional().isISO8601().withMessage('asOfDate must be a valid date (YYYY-MM-DD)'),
  ],

  syncOfflineSale: [
    body('clientTxId').isUUID().withMessage('clientTxId must be a valid UUID'),
    body('offlineCreatedAt').notEmpty().withMessage('offlineCreatedAt timestamp is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required in offline sale'),
    body('items.*.productId').notEmpty().withMessage('Product ID is required for all items'),
    body('items.*.quantity').notEmpty().withMessage('Quantity is required for all items'),
    body('items.*.unitPriceMinor').notEmpty().withMessage('Unit price is required for all items'),
  ],
};

module.exports = BusinessValidator;

