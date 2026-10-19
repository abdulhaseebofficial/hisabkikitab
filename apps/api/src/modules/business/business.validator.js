/**
 * Express-Validator rules for Business Mode.
 */

const { body, param, query } = require('express-validator');
const { CURRENCY_CODES } = require('@hisabkikitab/contracts');

const BusinessValidator = {
  createBusiness: [
    body('name').trim().notEmpty().withMessage('Business name is required').isLength({ max: 150 }),
    body('currency').optional().isIn(CURRENCY_CODES).withMessage('Unsupported currency code'),
  ],

  createProduct: [
    body('name').trim().notEmpty().withMessage('Product name is required').isLength({ max: 200 }),
    body('sellingPriceMinor').notEmpty().withMessage('Selling price is required'),
  ],

  createCustomer: [
    body('name').trim().notEmpty().withMessage('Customer name is required').isLength({ max: 150 }),
    body('phone').optional().trim().isLength({ max: 30 }),
  ],

  createSupplier: [
    body('name').trim().notEmpty().withMessage('Supplier name is required').isLength({ max: 150 }),
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
    body('name').trim().notEmpty().withMessage('Warehouse name is required').isLength({ max: 150 }),
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
};

module.exports = BusinessValidator;

