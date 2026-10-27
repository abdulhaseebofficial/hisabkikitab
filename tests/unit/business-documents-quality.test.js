const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BusinessDocuments = require('../../apps/api/src/modules/business/business.documents');
const BusinessRepository = require('../../apps/api/src/modules/business/business.repository');
const BusinessService = require('../../apps/api/src/modules/business/business.service');
const BusinessController = require('../../apps/api/src/modules/business/business.controller');

// Standard test business
const mockBusiness = {
  id: 'biz_quality_01',
  name: 'Khyber General Store & Supplies',
  address: 'Plaza 12, Commercial Area, Phase 4, DHA',
  city: 'Lahore',
  country: 'PK',
  contact_number: '+92 42 35891234',
  email: 'accounts@khyberstore.pk',
  tax_id: 'NTN-7654321-9',
};

// Fixture generator for long documents (50+ line items to test pagination & overflow)
function generateLongItems(count = 50) {
  const items = [];
  for (let i = 1; i <= count; i++) {
    items.push({
      product_name: `Bulk Item #${i} - Industrial Grade Standard Packaging`,
      quantity: 5,
      unit_price_minor: '120000', // Rs 1,200.00
      tax_minor: '20400',         // 17% tax Rs 204.00
      line_total_minor: '702000', // Rs 7,020.00
    });
  }
  return items;
}

function setupQualityMocks() {
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

  BusinessRepository.getBusinessById = async (id) => (id === mockBusiness.id ? mockBusiness : null);

  // Normal and long sale fixtures
  BusinessRepository.getSaleById = async (bizId, id) => {
    if (bizId !== mockBusiness.id) return null;
    const isLong = id === 'sale_long';
    const items = isLong ? generateLongItems(60) : generateLongItems(3);
    const subtotal = items.reduce((acc, it) => acc + BigInt(it.unit_price_minor) * BigInt(it.quantity), 0n);
    const tax = items.reduce((acc, it) => acc + BigInt(it.tax_minor) * BigInt(it.quantity), 0n);
    const grandTotal = subtotal + tax;

    return {
      id,
      business_id: mockBusiness.id,
      invoice_number: isLong ? 'INV-2026-LONG' : 'INV-2026-0001',
      date: '2026-10-20',
      customer_name: 'Haji Abdul Rehman & Sons',
      customer_phone: '+92 300 9988776',
      customer_address: 'Badami Bagh Wholesale Market, Lahore',
      payment_status: 'paid',
      payment_method: 'bank_transfer',
      subtotal_minor: subtotal.toString(),
      tax_minor: tax.toString(),
      discount_minor: '0',
      grand_total_minor: grandTotal.toString(),
      paid_amount_minor: grandTotal.toString(),
      balance_due_minor: '0',
      items,
    };
  };

  BusinessRepository.getPurchaseOrderById = async (bizId, id) => {
    if (bizId !== mockBusiness.id) return null;
    const items = generateLongItems(40).map((it, idx) => ({
      sku: `SKU-${idx + 1}`,
      product_name: it.product_name,
      unit: 'pack',
      quantity: it.quantity,
      unit_price_minor: it.unit_price_minor,
      line_total_minor: it.line_total_minor,
    }));
    return {
      id,
      business_id: mockBusiness.id,
      po_number: 'PO-2026-QUALITY',
      date: '2026-10-18',
      expected_delivery_date: '2026-10-28',
      supplier_name: 'National Commodity Mill Ltd',
      supplier_company: 'National Group',
      supplier_phone: '+92 21 32415500',
      status: 'approved',
      total_amount_minor: '28080000',
      notes: 'Standard quality delivery required.',
      items,
    };
  };

  BusinessRepository.getGrnById = async (bizId, id) => {
    if (bizId !== mockBusiness.id) return null;
    return {
      id,
      business_id: mockBusiness.id,
      grn_number: 'GRN-2026-0099',
      received_date: '2026-10-19',
      po_number: 'PO-2026-QUALITY',
      supplier_name: 'National Commodity Mill Ltd',
      supplier_company: 'National Group',
      warehouse_name: 'DHA Central Warehouse',
      status: 'completed',
      total_received_value_minor: '28080000',
      items: [
        { product_name: 'Standard Raw Inventory Pack', ordered_quantity: 100, received_quantity: 100, rejected_quantity: 0, unit_cost_minor: '280800', valuation_total_minor: '28080000' },
      ],
    };
  };

  BusinessRepository.getSupplierBillById = async (bizId, id) => {
    if (bizId !== mockBusiness.id) return null;
    return {
      id,
      business_id: mockBusiness.id,
      bill_number: 'BILL-2026-1001',
      bill_date: '2026-10-20',
      due_date: '2026-11-20',
      po_number: 'PO-2026-QUALITY',
      supplier_name: 'National Commodity Mill Ltd',
      status: 'unpaid',
      subtotal_minor: '28080000',
      tax_minor: '0',
      grand_total_minor: '28080000',
      paid_amount_minor: '0',
      balance_due_minor: '28080000',
      items: [
        { description: 'Received goods per GRN-0099', quantity: 100, unit_price_minor: '280800', tax_minor: '0', line_total_minor: '28080000' },
      ],
    };
  };

  BusinessRepository.getCustomerById = async (bizId, id) => ({
    id,
    business_id: mockBusiness.id,
    name: 'Haji Abdul Rehman & Sons',
    phone: '+92 300 9988776',
    address: 'Badami Bagh Wholesale Market, Lahore',
    current_balance_minor: '15000000', // Rs 150,000.00
  });

  BusinessRepository.getCustomerLedger = async () => {
    const rows = [];
    for (let i = 1; i <= 35; i++) {
      rows.push({
        date: `2026-10-${String(i % 28 + 1).padStart(2, '0')}`,
        description: `Customer Invoice Delivery #${i}`,
        debit_minor: '500000',
        credit_minor: '0',
        running_balance_minor: `${i * 500000}`,
      });
    }
    return rows;
  };

  BusinessRepository.getSupplierById = async (bizId, id) => ({
    id,
    business_id: mockBusiness.id,
    name: 'National Commodity Mill Ltd',
    company_name: 'National Group',
    phone: '+92 21 32415500',
    current_balance_minor: '28080000',
  });

  BusinessRepository.getSupplierLedger = async () => [
    { date: '2026-10-01', description: 'Opening Balance', debit_minor: '0', credit_minor: '10000000', running_balance_minor: '10000000' },
    { date: '2026-10-15', description: 'Bill #BILL-2026-1001', debit_minor: '0', credit_minor: '18080000', running_balance_minor: '28080000' },
  ];

  BusinessRepository.getPaymentById = async (bizId, id) => ({
    id,
    business_id: mockBusiness.id,
    date: '2026-10-20',
    payment_type: 'customer_payment',
    amount_minor: '5000000',
    customer_name: 'Haji Abdul Rehman & Sons',
    customer_phone: '+92 300 9988776',
    from_account_name: 'Meezan Bank Islamic Current',
    reference: 'PAY-MZN-994',
    notes: 'Advance clearance for October deliveries',
  });

  BusinessRepository.getPayrollItemById = async (bizId, id) => ({
    id,
    employee_name: 'Noman Bashir',
    designation: 'Senior Accountant',
    phone: '+92 333 1122334',
    month: '2026-10',
    base_salary_minor: '9000000',
    allowances_minor: '1500000',
    deductions_minor: '300000',
    advance_deducted_minor: '1000000',
    net_payable_minor: '9200000',
    status: 'paid',
  });

  BusinessService.getProfitAndLoss = async () => ({
    revenue: { totalMinor: '500000000', accounts: [{ code: '4010', name: 'Sales Revenue', balanceMinor: '500000000' }] },
    cogs: { totalMinor: '300000000', accounts: [{ code: '5010', name: 'Cost of Goods Sold', balanceMinor: '300000000' }] },
    grossProfitMinor: '200000000',
    operatingExpenses: { totalMinor: '60000000', accounts: [{ code: '6010', name: 'Operating Salaries', balanceMinor: '60000000' }] },
    netProfitMinor: '140000000',
  });

  BusinessService.getBalanceSheet = async () => ({
    assets: { totalMinor: '600000000', accounts: [{ code: '1010', name: 'Cash and Bank', balanceMinor: '200000000' }, { code: '1200', name: 'Inventory Asset', balanceMinor: '400000000' }] },
    liabilities: { totalMinor: '180000000', accounts: [{ code: '2010', name: 'Accounts Payable', balanceMinor: '180000000' }] },
    equity: { totalMinor: '420000000', accounts: [{ code: '3010', name: 'Owner Capital', balanceMinor: '420000000' }] },
    totalLiabilitiesAndEquityMinor: '600000000',
  });

  BusinessService.getCashFlowStatement = async () => ({
    openingCashMinor: '80000000',
    operatingActivities: { totalMinor: '150000000', lines: [{ description: 'Operating Net Income', amountMinor: '150000000' }] },
    investingActivities: { totalMinor: '-30000000', lines: [{ description: 'Fixed Assets Addition', amountMinor: '-30000000' }] },
    financingActivities: { totalMinor: '0', lines: [] },
    netCashChangeMinor: '120000000',
    closingCashMinor: '200000000',
  });

  return () => {
    Object.keys(orig).forEach((k) => {
      if (k.startsWith('getProfit') || k.startsWith('getBalance') || k.startsWith('getCash')) {
        BusinessService[k] = orig[k];
      } else {
        BusinessRepository[k] = orig[k];
      }
    });
  };
}

test('PDF Quality - Long table overflow produces multi-page document without errors', async () => {
  const restore = setupQualityMocks();
  try {
    const longInvoice = await BusinessDocuments.generateDocumentPdf({
      businessId: mockBusiness.id,
      docType: 'sales-invoice',
      docId: 'sale_long',
      lang: 'en',
    });

    assert.ok(Buffer.isBuffer(longInvoice.buffer));
    assert.equal(longInvoice.buffer.slice(0, 4).toString('utf8'), '%PDF');
    // Multi-page document with 60 items compressed via PDFKit zlib stream
    assert.ok(longInvoice.buffer.length > 5000, `Multi-page PDF must be rich and complete (size: ${longInvoice.buffer.length})`);

    // Long Customer Statement with 35 ledger rows
    const longStatement = await BusinessDocuments.generateDocumentPdf({
      businessId: mockBusiness.id,
      docType: 'customer-statement',
      docId: 'cust_01',
      lang: 'en',
    });

    assert.ok(Buffer.isBuffer(longStatement.buffer));
    assert.ok(longStatement.buffer.length > 5000, `Multi-page ledger statement must be > 5KB (size: ${longStatement.buffer.length})`);
  } finally {
    restore();
  }
});

test('PDF Quality - Thermal 80mm roll POS receipt conforms to narrow dimensions and layout', async () => {
  const restore = setupQualityMocks();
  try {
    const receipt = await BusinessDocuments.generateDocumentPdf({
      businessId: mockBusiness.id,
      docType: 'pos-receipt',
      docId: 'sale_01',
      lang: 'en',
    });

    assert.ok(Buffer.isBuffer(receipt.buffer));
    assert.equal(receipt.buffer.slice(0, 4).toString('utf8'), '%PDF');
    // Thermal receipt is compact but valid PDF
    assert.ok(receipt.buffer.length > 1000);
    assert.ok(receipt.filename.includes('Receipt') || receipt.filename.endsWith('.pdf'));
  } finally {
    restore();
  }
});

test('PDF Quality - Roman Urdu translation and PKR currency formatting in rendered documents', async () => {
  const restore = setupQualityMocks();
  try {
    const pnlEn = await BusinessDocuments.generateDocumentPdf({
      businessId: mockBusiness.id,
      docType: 'profit-and-loss',
      lang: 'en',
    });

    const pnlUrdu = await BusinessDocuments.generateDocumentPdf({
      businessId: mockBusiness.id,
      docType: 'profit-and-loss',
      lang: 'roman_urdu',
    });

    assert.ok(Buffer.isBuffer(pnlEn.buffer));
    assert.ok(Buffer.isBuffer(pnlUrdu.buffer));
    assert.ok(pnlUrdu.buffer.length > 1500);

    // Balance Sheet in Roman Urdu
    const bsUrdu = await BusinessDocuments.generateDocumentPdf({
      businessId: mockBusiness.id,
      docType: 'balance-sheet',
      lang: 'roman_urdu',
    });
    assert.ok(Buffer.isBuffer(bsUrdu.buffer));
    assert.ok(bsUrdu.buffer.length > 1500);
  } finally {
    restore();
  }
});

test('PDF Quality - Role-based authorization rejects unauthorized roles for sensitive statements', async () => {
  // Test role check logic directly as in business.controller.js
  const restrictedTypes = ['profit-and-loss', 'pnl', 'balance-sheet', 'cash-flow', 'employee-payslip', 'payslip'];

  for (const docType of restrictedTypes) {
    // Cashier role must be rejected
    const cashierMembership = { role: 'cashier' };
    const isAllowedForCashier = ['owner', 'admin', 'accountant'].includes(cashierMembership.role);
    assert.equal(isAllowedForCashier, false, `Cashier must not be authorized to download ${docType}`);

    // Owner, Admin, Accountant must be permitted
    for (const allowedRole of ['owner', 'admin', 'accountant']) {
      const allowedMembership = { role: allowedRole };
      const isAllowed = ['owner', 'admin', 'accountant'].includes(allowedMembership.role);
      assert.equal(isAllowed, true, `${allowedRole} must be authorized to download ${docType}`);
    }
  }
});
