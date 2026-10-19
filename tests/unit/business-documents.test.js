const test = require('node:test');
const assert = require('node:assert/strict');

const BusinessDocuments = require('../../apps/api/src/modules/business/business.documents');
const BusinessRepository = require('../../apps/api/src/modules/business/business.repository');
const BusinessService = require('../../apps/api/src/modules/business/business.service');
const BusinessController = require('../../apps/api/src/modules/business/business.controller');

// Mock data fixtures
const mockBusiness = {
  id: 'biz_01',
  name: 'Al-Madina Traders',
  address: 'Shop 14, Main Commercial Market',
  city: 'Lahore',
  country: 'PK',
  contact_number: '+92 300 1234567',
  email: 'contact@almadinatraders.pk',
  tax_id: '1234567-8',
};

const mockSale = {
  id: 'sale_01',
  business_id: 'biz_01',
  invoice_number: 'INV-2026-0001',
  date: '2026-10-19',
  customer_name: 'Muhammad Usman',
  customer_phone: '+92 321 9876543',
  customer_address: 'Gulberg III, Lahore',
  payment_status: 'paid',
  payment_method: 'cash',
  subtotal_minor: '1500000',   // Rs 15,000.00
  tax_minor: '255000',        // Rs 2,550.00 (17%)
  discount_minor: '50000',    // Rs 500.00
  grand_total_minor: '1705000', // Rs 17,050.00
  paid_amount_minor: '1705000',
  balance_due_minor: '0',
  notes: 'Thank you for your valued order.',
  items: [
    { product_name: 'Basmati Rice Supreme 25kg', quantity: 2, unit_price_minor: '600000', tax_minor: '102000', line_total_minor: '1302000' },
    { product_name: 'Pure Cooking Oil 5L', quantity: 1, unit_price_minor: '300000', tax_minor: '51000', line_total_minor: '351000' },
  ],
};

const mockPo = {
  id: 'po_01',
  business_id: 'biz_01',
  po_number: 'PO-2026-0042',
  date: '2026-10-15',
  expected_delivery_date: '2026-10-22',
  supplier_name: 'Habib Rice Mills',
  supplier_company: 'Habib Agro Ltd',
  supplier_phone: '+92 42 35789000',
  status: 'approved',
  total_amount_minor: '50000000', // Rs 500,000.00
  notes: 'High export quality standard required.',
  items: [
    { sku: 'RICE-BAS-25', product_name: 'Super Kernel Basmati Rice', unit: 'bag', quantity: 100, unit_price_minor: '500000', line_total_minor: '50000000' },
  ],
};

const mockGrn = {
  id: 'grn_01',
  business_id: 'biz_01',
  grn_number: 'GRN-2026-0042',
  received_date: '2026-10-18',
  po_number: 'PO-2026-0042',
  supplier_name: 'Habib Rice Mills',
  supplier_company: 'Habib Agro Ltd',
  warehouse_name: 'Central Warehouse #1',
  status: 'completed',
  total_received_value_minor: '50000000',
  items: [
    { product_name: 'Super Kernel Basmati Rice', ordered_quantity: 100, received_quantity: 100, rejected_quantity: 0, unit_cost_minor: '500000', valuation_total_minor: '50000000' },
  ],
};

const mockBill = {
  id: 'bill_01',
  business_id: 'biz_01',
  bill_number: 'BILL-2026-0089',
  bill_date: '2026-10-19',
  due_date: '2026-11-05',
  po_number: 'PO-2026-0042',
  supplier_name: 'Habib Rice Mills',
  supplier_company: 'Habib Agro Ltd',
  supplier_phone: '+92 42 35789000',
  status: 'unpaid',
  subtotal_minor: '50000000',
  tax_minor: '0',
  grand_total_minor: '50000000',
  paid_amount_minor: '0',
  balance_due_minor: '50000000',
  items: [
    { description: 'Super Kernel Basmati Rice 100 Bags', quantity: 100, unit_price_minor: '500000', tax_minor: '0', line_total_minor: '50000000' },
  ],
};

const mockCustomer = {
  id: 'cust_01',
  business_id: 'biz_01',
  name: 'Muhammad Usman',
  phone: '+92 321 9876543',
  address: 'Gulberg III, Lahore',
  current_balance_minor: '4500000', // Rs 45,000 receivable
};

const mockCustomerLedger = [
  { date: '2026-10-01', description: 'Opening Balance', debit_minor: '2000000', credit_minor: '0', running_balance_minor: '2000000' },
  { date: '2026-10-10', description: 'Credit Sale INV-0080', debit_minor: '3500000', credit_minor: '0', running_balance_minor: '5500000' },
  { date: '2026-10-15', description: 'Cash Payment Received', debit_minor: '0', credit_minor: '1000000', running_balance_minor: '4500000' },
];

const mockSupplier = {
  id: 'sup_01',
  business_id: 'biz_01',
  name: 'Habib Rice Mills',
  company_name: 'Habib Agro Ltd',
  phone: '+92 42 35789000',
  current_balance_minor: '50000000', // Rs 500,000 payable
};

const mockSupplierLedger = [
  { date: '2026-10-18', description: 'Bill #BILL-2026-0089', debit_minor: '0', credit_minor: '50000000', running_balance_minor: '50000000' },
];

const mockPayment = {
  id: 'pay_01234567-89ab-cdef-0123-456789abcdef',
  business_id: 'biz_01',
  date: '2026-10-19',
  payment_type: 'customer_payment',
  amount_minor: '1000000', // Rs 10,000.00
  customer_name: 'Muhammad Usman',
  customer_phone: '+92 321 9876543',
  from_account_name: 'Cash Register Drawer #1',
  reference: 'REC-OCT-09',
  notes: 'Advance installment received',
};

const mockPayrollItem = {
  id: 'pi_01',
  employee_name: 'Tariq Mehmood',
  designation: 'Inventory Warehouse Supervisor',
  phone: '+92 301 4455667',
  month: '2026-10',
  base_salary_minor: '6500000',      // Rs 65,000.00
  allowances_minor: '1000000',       // Rs 10,000.00
  deductions_minor: '200000',        // Rs 2,000.00
  advance_deducted_minor: '500000',  // Rs 5,000.00
  net_payable_minor: '6800000',      // Rs 68,000.00
  status: 'paid',
};

const mockPnl = {
  revenue: { totalMinor: '120000000', accounts: [{ code: '4010', name: 'Sales Revenue', balanceMinor: '120000000' }] },
  cogs: { totalMinor: '80000000', accounts: [{ code: '5010', name: 'Cost of Goods Sold', balanceMinor: '80000000' }] },
  grossProfitMinor: '40000000',
  operatingExpenses: { totalMinor: '15000000', accounts: [{ code: '6010', name: 'Salaries Expense', balanceMinor: '15000000' }] },
  netProfitMinor: '25000000',
};

const mockBalanceSheet = {
  assets: { totalMinor: '150000000', accounts: [{ code: '1010', name: 'Cash', balanceMinor: '50000000' }, { code: '1200', name: 'Inventory', balanceMinor: '100000000' }] },
  liabilities: { totalMinor: '50000000', accounts: [{ code: '2010', name: 'Accounts Payable', balanceMinor: '50000000' }] },
  equity: { totalMinor: '100000000', accounts: [{ code: '3010', name: 'Owner Capital', balanceMinor: '100000000' }] },
  totalLiabilitiesAndEquityMinor: '150000000',
};

const mockCashFlow = {
  openingCashMinor: '20000000',
  operatingActivities: { totalMinor: '35000000', lines: [{ description: 'Collections from Customers', amountMinor: '35000000' }] },
  investingActivities: { totalMinor: '-5000000', lines: [{ description: 'Equipment Purchase', amountMinor: '-5000000' }] },
  financingActivities: { totalMinor: '0', lines: [] },
  netCashChangeMinor: '30000000',
  closingCashMinor: '50000000',
};

function setupServiceMocks() {
  const orig = {
    getBusinessById: BusinessRepository.getBusinessById,
    getSaleById: BusinessRepository.getSaleById,
    getPurchaseOrderById: BusinessRepository.getPurchaseOrderById,
    getGrnById: BusinessRepository.getGrnById,
    getSupplierBillById: BusinessRepository.getSupplierBillById,
    getCustomerById: BusinessRepository.getCustomerById,
    getCustomerLedger: BusinessRepository.getCustomerLedger,
    getSupplierById: BusinessRepository.getSupplierById,
    getSupplierLedger: BusinessRepository.getSupplierLedger,
    getPaymentById: BusinessRepository.getPaymentById,
    getPayrollItemById: BusinessRepository.getPayrollItemById,
    getProfitAndLoss: BusinessService.getProfitAndLoss,
    getBalanceSheet: BusinessService.getBalanceSheet,
    getCashFlowStatement: BusinessService.getCashFlowStatement,
  };

  BusinessRepository.getBusinessById = async (id) => (id === 'biz_01' ? mockBusiness : null);
  BusinessRepository.getSaleById = async (bizId, id) => (bizId === 'biz_01' && id === 'sale_01' ? mockSale : null);
  BusinessRepository.getPurchaseOrderById = async (bizId, id) => (bizId === 'biz_01' && id === 'po_01' ? mockPo : null);
  BusinessRepository.getGrnById = async (bizId, id) => (bizId === 'biz_01' && id === 'grn_01' ? mockGrn : null);
  BusinessRepository.getSupplierBillById = async (bizId, id) => (bizId === 'biz_01' && id === 'bill_01' ? mockBill : null);
  BusinessRepository.getCustomerById = async (bizId, id) => (bizId === 'biz_01' && id === 'cust_01' ? mockCustomer : null);
  BusinessRepository.getCustomerLedger = async (bizId, id) => (bizId === 'biz_01' && id === 'cust_01' ? mockCustomerLedger : []);
  BusinessRepository.getSupplierById = async (bizId, id) => (bizId === 'biz_01' && id === 'sup_01' ? mockSupplier : null);
  BusinessRepository.getSupplierLedger = async (bizId, id) => (bizId === 'biz_01' && id === 'sup_01' ? mockSupplierLedger : []);
  BusinessRepository.getPaymentById = async (bizId, id) => (bizId === 'biz_01' && id === mockPayment.id ? mockPayment : null);
  BusinessRepository.getPayrollItemById = async (bizId, id) => (bizId === 'biz_01' && id === 'pi_01' ? mockPayrollItem : null);
  BusinessService.getProfitAndLoss = async (bizId) => (bizId === 'biz_01' ? mockPnl : null);
  BusinessService.getBalanceSheet = async (bizId) => (bizId === 'biz_01' ? mockBalanceSheet : null);
  BusinessService.getCashFlowStatement = async (bizId) => (bizId === 'biz_01' ? mockCashFlow : null);

  return () => {
    BusinessRepository.getBusinessById = orig.getBusinessById;
    BusinessRepository.getSaleById = orig.getSaleById;
    BusinessRepository.getPurchaseOrderById = orig.getPurchaseOrderById;
    BusinessRepository.getGrnById = orig.getGrnById;
    BusinessRepository.getSupplierBillById = orig.getSupplierBillById;
    BusinessRepository.getCustomerById = orig.getCustomerById;
    BusinessRepository.getCustomerLedger = orig.getCustomerLedger;
    BusinessRepository.getSupplierById = orig.getSupplierById;
    BusinessRepository.getSupplierLedger = orig.getSupplierLedger;
    BusinessRepository.getPaymentById = orig.getPaymentById;
    BusinessRepository.getPayrollItemById = orig.getPayrollItemById;
    BusinessService.getProfitAndLoss = orig.getProfitAndLoss;
    BusinessService.getBalanceSheet = orig.getBalanceSheet;
    BusinessService.getCashFlowStatement = orig.getCashFlowStatement;
  };
}

test('Document Generation - Generates valid PDF buffers for all 12 document types', async () => {
  const restore = setupServiceMocks();
  try {
    const docTypes = [
      { type: 'sales-invoice', id: 'sale_01' },
      { type: 'pos-receipt', id: 'sale_01' },
      { type: 'purchase-order', id: 'po_01' },
      { type: 'goods-received-note', id: 'grn_01' },
      { type: 'supplier-bill', id: 'bill_01' },
      { type: 'customer-statement', id: 'cust_01' },
      { type: 'supplier-statement', id: 'sup_01' },
      { type: 'payment-receipt', id: mockPayment.id },
      { type: 'employee-payslip', id: 'pi_01' },
      { type: 'profit-and-loss', id: 'report' },
      { type: 'balance-sheet', id: 'report' },
      { type: 'cash-flow', id: 'report' },
    ];

    for (const item of docTypes) {
      const res = await BusinessDocuments.generateDocumentPdf({
        businessId: 'biz_01',
        docType: item.type,
        docId: item.id,
        lang: 'en',
      });

      assert.ok(res, `Result should exist for ${item.type}`);
      assert.ok(Buffer.isBuffer(res.buffer), `Buffer should be returned for ${item.type}`);
      assert.equal(res.contentType, 'application/pdf');
      assert.ok(res.filename.endsWith('.pdf'), `Filename should end with .pdf for ${item.type}`);

      // Verify PDF magic header bytes '%PDF-'
      const magic = res.buffer.slice(0, 4).toString('utf8');
      assert.equal(magic, '%PDF', `Document ${item.type} must begin with %PDF magic header`);

      // Verify non-trivial PDF size (> 1000 bytes)
      assert.ok(res.buffer.length > 1000, `Document ${item.type} must contain rich rendered content (size: ${res.buffer.length})`);
    }
  } finally {
    restore();
  }
});

test('Document Generation - Bilingual support renders Roman Urdu documents correctly', async () => {
  const restore = setupServiceMocks();
  try {
    const res = await BusinessDocuments.generateDocumentPdf({
      businessId: 'biz_01',
      docType: 'sales-invoice',
      docId: 'sale_01',
      lang: 'roman_urdu',
    });

    assert.ok(Buffer.isBuffer(res.buffer));
    const magic = res.buffer.slice(0, 4).toString('utf8');
    assert.equal(magic, '%PDF');
    assert.ok(res.buffer.length > 1000);
  } finally {
    restore();
  }
});

test('Document Generation - Cross-tenant isolation rejects mismatched or missing entities', async () => {
  const restore = setupServiceMocks();
  try {
    // 1. Missing business ID throws 404
    await assert.rejects(
      async () => {
        await BusinessDocuments.generateDocumentPdf({
          businessId: 'biz_non_existent',
          docType: 'sales-invoice',
          docId: 'sale_01',
        });
      },
      (err) => err.status === 404 || err.message.includes('Business not found')
    );

    // 2. Mismatched tenant / unknown docId throws 404
    await assert.rejects(
      async () => {
        await BusinessDocuments.generateDocumentPdf({
          businessId: 'biz_01',
          docType: 'sales-invoice',
          docId: 'sale_other_tenant',
        });
      },
      (err) => err.status === 404 || err.message.includes('Sale not found')
    );

    // 3. Unsupported document type throws 400
    await assert.rejects(
      async () => {
        await BusinessDocuments.generateDocumentPdf({
          businessId: 'biz_01',
          docType: 'unsupported-doctype',
          docId: 'xyz',
        });
      },
      (err) => err.status === 400 || err.message.includes('Unsupported document type')
    );
  } finally {
    restore();
  }
});

test('Document Generation Controller - Role authorization checks for sensitive reports and payslips', async () => {
  const restore = setupServiceMocks();
  try {
    // 1. Cashier attempting to download Profit & Loss PDF -> 403 Forbidden
    let statusCode = null;
    let jsonBody = null;

    const reqCashier = {
      businessId: 'biz_01',
      params: { docType: 'profit-and-loss', docId: 'report' },
      query: {},
      businessMembership: { role: 'cashier' },
    };
    const resCashier = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => {
            jsonBody = body;
          },
        };
      },
      setHeader: () => {},
      end: () => {},
    };

    await BusinessController.generateDocumentPdf(reqCashier, resCashier, (err) => {
      if (err) throw err;
    });

    assert.equal(statusCode, 403);
    assert.equal(jsonBody.success, false);
    assert.ok(jsonBody.message.includes('Insufficient business permissions'));

    // 2. Accountant downloading Profit & Loss PDF -> 200 OK with PDF buffer streamed
    let responseEnded = false;
    let headers = {};
    const reqAccountant = {
      businessId: 'biz_01',
      params: { docType: 'profit-and-loss', docId: 'report' },
      query: {},
      businessMembership: { role: 'accountant' },
    };
    const resAccountant = {
      status: (code) => {
        statusCode = code;
        return resAccountant;
      },
      setHeader: (k, v) => {
        headers[k] = v;
      },
      end: (buf) => {
        responseEnded = true;
        assert.ok(Buffer.isBuffer(buf));
        assert.equal(buf.slice(0, 4).toString('utf8'), '%PDF');
      },
    };

    await BusinessController.generateDocumentPdf(reqAccountant, resAccountant, (err) => {
      if (err) throw err;
    });

    assert.ok(responseEnded, 'Response should end with streamed buffer');
    assert.equal(headers['Content-Type'], 'application/pdf');
    assert.ok(headers['Content-Disposition'].includes('ProfitLoss'));
  } finally {
    restore();
  }
});
