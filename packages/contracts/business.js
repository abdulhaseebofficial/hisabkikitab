/**
 * Business Mode Contracts and Vocabularies
 * Shared across apps/api and apps/web.
 */

const BUSINESS_CATEGORIES = [
  { id: 'grocery', en: 'Grocery / Kiryana Shop', roman_ur: 'Kiryana / Parchon Store' },
  { id: 'general_store', en: 'General Store', roman_ur: 'General Store' },
  { id: 'clothing', en: 'Clothing / Garments', roman_ur: 'Kapray / Garments Store' },
  { id: 'mobile_accessories', en: 'Mobile & Accessories', roman_ur: 'Mobile aur Accessories' },
  { id: 'electronics', en: 'Electronics & Appliances', roman_ur: 'Bijli aur Electronics Ka Samaan' },
  { id: 'pharmacy', en: 'Pharmacy / Medical Store', roman_ur: 'Medical Store / Pharmacy' },
  { id: 'restaurant_cafe', en: 'Restaurant / Cafe', roman_ur: 'Hotel / Restaurant / Cafe' },
  { id: 'bakery', en: 'Bakery & Sweets', roman_ur: 'Bakery aur Meethai' },
  { id: 'hardware', en: 'Hardware & Sanitary', roman_ur: 'Hardware aur Sanitary' },
  { id: 'auto_parts', en: 'Auto Parts & Workshop', roman_ur: 'Auto Parts aur Workshop' },
  { id: 'wholesale', en: 'Wholesale Distribution', roman_ur: 'Wholesale Agency' },
  { id: 'online_store', en: 'Online / E-Commerce Store', roman_ur: 'Online Store' },
  { id: 'freelancing', en: 'Freelancing & Agency', roman_ur: 'Freelancing / IT Services' },
  { id: 'services', en: 'Professional Services', roman_ur: 'Professional Services' },
  { id: 'repair', en: 'Repair Services', roman_ur: 'Repairing Services' },
  { id: 'manufacturing', en: 'Small Manufacturing', roman_ur: 'Chhoti Factory / Manufacturing' },
  { id: 'other', en: 'Other Small Business', roman_ur: 'Deegar Karobar' },
];

const BUSINESS_ROLES = [
  { id: 'owner', label: 'Owner / Malik' },
  { id: 'admin', label: 'Admin / Manager' },
  { id: 'accountant', label: 'Accountant / Munshi' },
  { id: 'cashier', label: 'Cashier / Salesman' },
  { id: 'inventory_manager', label: 'Inventory Manager / Godam Incharge' },
  { id: 'employee', label: 'Staff / Mulazim' },
];

const DEFAULT_CHART_OF_ACCOUNTS = [
  // Assets (1000s)
  { code: '1010', name: 'Cash in Hand', type: 'asset', subtype: 'cash', is_system: true },
  { code: '1020', name: 'Bank Account', type: 'asset', subtype: 'bank', is_system: true },
  { code: '1030', name: 'Digital Wallet (JazzCash/Easypaisa)', type: 'asset', subtype: 'wallet', is_system: true },
  { code: '1100', name: 'Accounts Receivable (Customers Khata)', type: 'asset', subtype: 'receivable', is_system: true },
  { code: '1150', name: 'Input Tax / Tax Receivable', type: 'asset', subtype: 'tax_receivable', is_system: true },
  { code: '1200', name: 'Merchandise Inventory', type: 'asset', subtype: 'inventory', is_system: true },
  // Liabilities (2000s)
  { code: '2010', name: 'Accounts Payable (Suppliers Khata)', type: 'liability', subtype: 'payable', is_system: true },
  { code: '2020', name: 'Unpaid Operating Bills', type: 'liability', subtype: 'payable', is_system: true },
  { code: '2030', name: 'Accrued Salaries & Payroll Payable', type: 'liability', subtype: 'payable', is_system: true },
  { code: '2040', name: 'Goods Received Not Invoiced (GRNI) / Accrued Purchases', type: 'liability', subtype: 'payable', is_system: true },
  { code: '2050', name: 'Sales Tax Payable', type: 'liability', subtype: 'tax_payable', is_system: true },
  // Equity (3000s)
  { code: '3010', name: 'Owner Capital / Investment', type: 'equity', subtype: 'owner_equity', is_system: true },
  { code: '3020', name: 'Owner Drawings', type: 'equity', subtype: 'owner_drawing', is_system: true },
  { code: '3900', name: 'Retained Earnings', type: 'equity', subtype: 'retained_earnings', is_system: true },
  // Revenue (4000s)
  { code: '4010', name: 'Product Sales Revenue', type: 'revenue', subtype: 'sales_revenue', is_system: true },
  { code: '4020', name: 'Service Revenue', type: 'revenue', subtype: 'service_revenue', is_system: true },
  { code: '4090', name: 'Other Operating Income', type: 'revenue', subtype: 'other_income', is_system: true },
  { code: '4100', name: 'Sales Discounts', type: 'revenue', subtype: 'sales_discount', is_system: true },
  { code: '4110', name: 'Sales Returns & Allowances', type: 'revenue', subtype: 'sales_discount', is_system: true },
  // COGS (5000s)
  { code: '5010', name: 'Cost of Goods Sold (COGS)', type: 'expense', subtype: 'cogs', is_system: true },
  { code: '5020', name: 'Purchase Price Variance', type: 'expense', subtype: 'cogs', is_system: true },
  // Operating Expenses (6000s)
  { code: '6010', name: 'Rent Expense', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6020', name: 'Electricity & Utilities', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6030', name: 'Salaries & Staff Wages', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6040', name: 'Marketing & Advertising', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6050', name: 'Transport, Fuel & Delivery', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6060', name: 'Maintenance & Repairs', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6070', name: 'Internet, Phone & POS', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6080', name: 'Packaging & Supplies', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6090', name: 'Bank & Transaction Fees', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6100', name: 'Inventory Shrinkage & Adjustment Loss', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6110', name: 'Damaged Goods Expense', type: 'expense', subtype: 'operating_expense', is_system: true },
  { code: '6990', name: 'Miscellaneous Expenses', type: 'expense', subtype: 'operating_expense', is_system: true },
];

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash in Hand (Naqad)' },
  { id: 'bank', label: 'Bank Transfer' },
  { id: 'wallet', label: 'Digital Wallet (JazzCash/Easypaisa/Raast)' },
  { id: 'credit', label: 'Credit (Khata / Baqi)' },
  { id: 'split', label: 'Split Payment (Partial Cash + Credit)' },
];

const AGING_BUCKETS = [
  { key: 'current', label: 'Current / Not Due', minDays: 0, maxDays: 0 },
  { key: '1_30', label: '1 - 30 Days', minDays: 1, maxDays: 30 },
  { key: '31_60', label: '31 - 60 Days', minDays: 31, maxDays: 60 },
  { key: '61_90', label: '61 - 90 Days', minDays: 61, maxDays: 90 },
  { key: 'over_90', label: 'Over 90 Days', minDays: 91, maxDays: Infinity },
];

const PURCHASE_REQUEST_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'converted_to_po', 'cancelled'];
const PURCHASE_ORDER_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'sent_to_supplier', 'partially_received', 'fully_received', 'billed', 'closed', 'cancelled'];
const GRN_STATUSES = ['received', 'inspected', 'cancelled'];
const SUPPLIER_BILL_STATUSES = ['unpaid', 'partially_paid', 'paid', 'cancelled'];
const PURCHASE_RETURN_REFUND_METHODS = ['credit_note', 'cash', 'bank'];
const SALES_RETURN_CONDITIONS = ['restockable', 'damaged'];
const SHIFT_STATUSES = ['open', 'closed'];
const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'leave', 'half_day'];
const RECURRING_EXPENSE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
const RECURRING_EXPENSE_STATUSES = ['active', 'paused', 'cancelled', 'completed'];
const RECURRING_OCCURRENCE_STATUSES = ['generated', 'paid', 'skipped', 'failed'];

module.exports = {
  BUSINESS_CATEGORIES,
  BUSINESS_ROLES,
  DEFAULT_CHART_OF_ACCOUNTS,
  PAYMENT_METHODS,
  AGING_BUCKETS,
  PURCHASE_REQUEST_STATUSES,
  PURCHASE_ORDER_STATUSES,
  GRN_STATUSES,
  SUPPLIER_BILL_STATUSES,
  PURCHASE_RETURN_REFUND_METHODS,
  SALES_RETURN_CONDITIONS,
  SHIFT_STATUSES,
  ATTENDANCE_STATUSES,
  RECURRING_EXPENSE_FREQUENCIES,
  RECURRING_EXPENSE_STATUSES,
  RECURRING_OCCURRENCE_STATUSES,
};

