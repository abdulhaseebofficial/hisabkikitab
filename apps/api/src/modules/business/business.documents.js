/**
 * HisabKi Kitab - Business Mode V3
 * Professional Document Generation Service
 * 
 * Supports 12 authoritative business document types:
 * 1. A4 Sales Invoice
 * 2. Thermal POS Receipt (80mm)
 * 3. Purchase Order (PO)
 * 4. Goods Received Note (GRN)
 * 5. Supplier Bill
 * 6. Customer Khata Statement
 * 7. Supplier Khata Statement
 * 8. Payment Receipt
 * 9. Employee Payslip
 * 10. Profit & Loss Statement
 * 11. Balance Sheet
 * 12. Cash Flow Statement
 * 
 * Features:
 * - Authoritative persisted minor-unit amounts formatted to PKR
 * - Bilingual support: English (en) and Roman Urdu (ur / roman_urdu)
 * - Brand styling: Emerald Green (#10b981), Slate, and Charcoal
 * - Statutory computer-generated tax document disclaimer
 * - Strict multi-tenant isolation and data authorization
 */

const PDFDocument = require('pdfkit');
const BusinessRepository = require('./business.repository');
const BusinessService = require('./business.service');

// -----------------------------------------------------------------------------
// Constants & Styling
// -----------------------------------------------------------------------------
const COLORS = {
  primary: '#10b981',       // Emerald
  primaryDark: '#065f46',   // Forest Dark
  primaryLight: '#ecfdf5',  // Emerald 50
  secondary: '#1e293b',     // Slate 800
  text: '#1f2937',          // Charcoal Text
  muted: '#64748b',         // Slate 500
  border: '#e2e8f0',        // Slate 200
  borderDark: '#cbd5e1',    // Slate 300
  success: '#16a34a',       // Green 600
  danger: '#dc2626',        // Red 600
  warning: '#d97706',       // Amber 600
  tableHeaderBg: '#f8fafc', // Slate 50
  white: '#ffffff',
};

// -----------------------------------------------------------------------------
// Bilingual Translation Dictionary (English & Roman Urdu)
// -----------------------------------------------------------------------------
const DICT = {
  en: {
    salesInvoice: 'TAX INVOICE',
    posReceipt: 'SALES RECEIPT',
    purchaseOrder: 'PURCHASE ORDER',
    grn: 'GOODS RECEIVED NOTE (GRN)',
    supplierBill: 'SUPPLIER BILL / INVOICE',
    customerStatement: 'CUSTOMER KHATA STATEMENT',
    supplierStatement: 'SUPPLIER KHATA STATEMENT',
    paymentReceipt: 'PAYMENT RECEIPT',
    employeePayslip: 'EMPLOYEE SALARY PAYSLIP',
    pnl: 'PROFIT & LOSS STATEMENT',
    balanceSheet: 'BALANCE SHEET',
    cashFlow: 'STATEMENT OF CASH FLOWS',

    invoiceNo: 'Invoice #',
    receiptNo: 'Receipt #',
    poNo: 'PO #',
    grnNo: 'GRN #',
    billNo: 'Bill #',
    date: 'Date',
    dueDate: 'Due Date',
    deliveryDate: 'Delivery Date',
    receivedDate: 'Received Date',
    period: 'Period',
    asOf: 'As of Date',
    status: 'Status',

    billTo: 'Billed To (Customer)',
    supplier: 'Supplier Details',
    employee: 'Employee Details',
    warehouse: 'Warehouse',
    businessInfo: 'Business Information',
    phone: 'Phone',
    address: 'Address',
    taxId: 'NTN / STRN',
    paymentMethod: 'Payment Method',

    item: 'Item Description',
    sku: 'SKU',
    qty: 'Qty',
    unit: 'Unit',
    unitPrice: 'Unit Price',
    lineTotal: 'Line Total',
    tax: 'Tax',
    discount: 'Discount',
    subtotal: 'Subtotal',
    grandTotal: 'Grand Total',
    amountPaid: 'Amount Paid',
    balanceDue: 'Balance Due',
    currentBalance: 'Current Balance',

    orderedQty: 'Ordered',
    receivedQty: 'Received',
    rejectedQty: 'Rejected',
    unitCost: 'Unit Cost',
    valuation: 'Valuation',

    debit: 'Debit (Dr)',
    credit: 'Credit (Cr)',
    runningBalance: 'Running Balance',
    description: 'Description / Reference',

    salaryDetails: 'Salary & Earnings',
    baseSalary: 'Base Salary',
    allowances: 'Allowances & Bonus',
    grossPay: 'Gross Earnings',
    deductions: 'Deductions',
    advanceDeducted: 'Advance Loan Deduction',
    netPayable: 'Net Payable Salary',

    revenue: 'Operating Revenue',
    cogs: 'Cost of Goods Sold (COGS)',
    grossProfit: 'Gross Profit',
    operatingExpenses: 'Operating Expenses',
    netProfit: 'Net Profit / (Loss)',

    assets: 'ASSETS',
    currentAssets: 'Current Assets',
    nonCurrentAssets: 'Non-Current Assets',
    totalAssets: 'TOTAL ASSETS',
    liabilities: 'LIABILITIES',
    currentLiabilities: 'Current Liabilities',
    totalLiabilities: 'TOTAL LIABILITIES',
    equity: 'EQUITY',
    totalEquity: 'TOTAL EQUITY',
    liabilitiesAndEquity: 'TOTAL LIABILITIES & EQUITY',

    operatingCash: 'Cash Flows from Operating Activities',
    investingCash: 'Cash Flows from Investing Activities',
    financingCash: 'Cash Flows from Financing Activities',
    netCashChange: 'Net Increase / (Decrease) in Cash',
    openingCash: 'Beginning Cash & Bank Balance',
    closingCash: 'Ending Cash & Bank Balance',

    statutoryNote: 'This is a computer-generated document issued by HisabKi Kitab. No physical signature or stamp required.',
    thankYou: 'Thank you for your business!',
    notes: 'Notes / Terms',
  },
  ur: {
    salesInvoice: 'BIKRI KA BILL (INVOICE)',
    posReceipt: 'BIKRI KI RASEED (PARCHEE)',
    purchaseOrder: 'KHAREEDARI KA ORDER (PO)',
    grn: 'MAAL WASOOLI NOTE (GRN)',
    supplierBill: 'SUPPLIER BILL / INVOICE',
    customerStatement: 'GRAHAK KHATA STATEMENT',
    supplierStatement: 'SUPPLIER KHATA STATEMENT',
    paymentReceipt: 'ADAYIGI / WASOOLI RASEED',
    employeePayslip: 'MULAZIM TANKHAW PARCHEE',
    pnl: 'NAFA AUR NUQSAN STATEMENT (P&L)',
    balanceSheet: 'BALANCE SHEET (MALIYATI SOORAT-E-HAAL)',
    cashFlow: 'NAQDI KA BAHAO (CASH FLOW STATEMENT)',

    invoiceNo: 'Invoice No.',
    receiptNo: 'Raseed No.',
    poNo: 'Order No.',
    grnNo: 'GRN No.',
    billNo: 'Bill No.',
    date: 'Tareekh',
    dueDate: 'Adaigi Ki Tareekh',
    deliveryDate: 'Tarseel Ki Tareekh',
    receivedDate: 'Wasooli Ki Tareekh',
    period: 'Muddath',
    asOf: 'As of Tareekh',
    status: 'Haalat (Status)',

    billTo: 'Banaam (Grahak)',
    supplier: 'Supplier Ki Maloomat',
    employee: 'Mulazim Ki Maloomat',
    warehouse: 'Godam (Warehouse)',
    businessInfo: 'Karobar Ki Maloomat',
    phone: 'Phone',
    address: 'Pata',
    taxId: 'NTN / STRN No.',
    paymentMethod: 'Tareeqa-e-Adaigi',

    item: 'Ashya Ki Tafseel',
    sku: 'SKU Code',
    qty: 'Tadaad',
    unit: 'Unit',
    unitPrice: 'Qeemat Fee Adad',
    lineTotal: 'Kul Raqam',
    tax: 'Tax',
    discount: 'Choot (Discount)',
    subtotal: 'Subtotal',
    grandTotal: 'Kul Raqam (Grand Total)',
    amountPaid: 'Ada Shuda Raqam',
    balanceDue: 'Baqaya Wajib-ul-Ada',
    currentBalance: 'Mojooda Khata Balance',

    orderedQty: 'Order Tadaad',
    receivedQty: 'Wasool Shuda',
    rejectedQty: 'Mustarad (Rejected)',
    unitCost: 'Kharid Qeemat',
    valuation: 'Kul Maaliyat',

    debit: 'Debit / Barham (Dr)',
    credit: 'Credit / Jama (Cr)',
    runningBalance: 'Baqaya Balance',
    description: 'Tafseel / Reference',

    salaryDetails: 'Tankhaw Ki Tafseelat',
    baseSalary: 'Bunyadi Tankhaw (Base)',
    allowances: 'Bhatta & Bonus',
    grossPay: 'Majmooi Tankhaw (Gross)',
    deductions: 'Kataotiyan (Deductions)',
    advanceDeducted: 'Advance Loan Kataoti',
    netPayable: 'Wajib-ul-Ada Tankhaw (Net)',

    revenue: 'Kul Aamdani / Sales',
    cogs: 'Bechi Hui Ashya Ki Lagat (COGS)',
    grossProfit: 'Ibtidai Nafa (Gross Profit)',
    operatingExpenses: 'Karobari Ikhrajat (Operating Expenses)',
    netProfit: 'Khaalis Nafa / (Nuqsan)',

    assets: 'ASSETS (ASAASY JAAT)',
    currentAssets: 'Mojooda Asaasy (Current Assets)',
    nonCurrentAssets: 'Ghair-Mojooda Asaasy (Non-Current)',
    totalAssets: 'KUL ASAASY (TOTAL ASSETS)',
    liabilities: 'WAJIBAT (LIABILITIES)',
    currentLiabilities: 'Mojooda Wajibat (Current Liabilities)',
    totalLiabilities: 'KUL WAJIBAT (TOTAL LIABILITIES)',
    equity: 'SARMAYA (OWNER EQUITY)',
    totalEquity: 'KUL SARMAYA (TOTAL EQUITY)',
    liabilitiesAndEquity: 'KUL WAJIBAT AUR SARMAYA',

    operatingCash: 'Karobari Sar-Garmiyon Se Naqdi',
    investingCash: 'Sarmayakari Se Naqdi Ka Bahao',
    financingCash: 'Maaliyati Sar-Garmiyon Se Naqdi',
    netCashChange: 'Naqdi Mein Khaalis Tabdeeli',
    openingCash: 'Aaghaz Ka Naqdi Balance',
    closingCash: 'Ikhtitam Ka Naqdi Balance',

    statutoryNote: 'Yeh computer se tayyar shuda tasdeeq shuda dastawez hai jo HisabKi Kitab ke zariye jari kiya gaya hai.',
    thankYou: 'Aap ke karobar ka shukriya! Dobara zaroor tashreef layein.',
    notes: 'Zaroori Hidayat / Notes',
  }
};

// -----------------------------------------------------------------------------
// Helper: Format Minor Amount into PKR String
// -----------------------------------------------------------------------------
function formatPKR(minorAmount) {
  if (minorAmount === null || minorAmount === undefined || minorAmount === '') {
    return 'Rs. 0.00';
  }
  const val = typeof minorAmount === 'bigint' ? minorAmount : BigInt(String(minorAmount || 0));
  const isNegative = val < 0n;
  const absVal = isNegative ? -val : val;
  const whole = absVal / 100n;
  const cents = absVal % 100n;
  const formattedWhole = Number(whole).toLocaleString('en-PK');
  const centsStr = cents.toString().padStart(2, '0');
  const prefix = isNegative ? '-Rs. ' : 'Rs. ';
  return `${prefix}${formattedWhole}.${centsStr}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toISOString().split('T')[0];
  } catch {
    return String(dateStr);
  }
}

// -----------------------------------------------------------------------------
// Core PDF Layout Helpers
// -----------------------------------------------------------------------------
function drawDivider(doc, y, color = COLORS.border, width = 1) {
  doc.strokeColor(color).lineWidth(width)
    .moveTo(40, y).lineTo(555, y).stroke();
}

function drawDashedDivider(doc, y, left = 40, right = 555) {
  doc.strokeColor(COLORS.borderDark).lineWidth(1).dash(4, { space: 3 })
    .moveTo(left, y).lineTo(right, y).stroke().undash();
}

function drawHeader(doc, business, docTitle, docNo, date, status, t) {
  // Top Emerald Accent Bar
  doc.rect(40, 40, 515, 6).fill(COLORS.primary);

  // Business Name & Brand
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.secondary)
    .text(business.name || 'HisabKi Kitab Business', 40, 56);

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
  let bizY = 76;
  if (business.address || business.city) {
    const fullAddr = [business.address, business.city, business.country || 'PK'].filter(Boolean).join(', ');
    doc.text(fullAddr, 40, bizY);
    bizY += 12;
  }
  if (business.contact_number || business.email) {
    const contacts = [business.contact_number, business.email].filter(Boolean).join(' | ');
    doc.text(contacts, 40, bizY);
    bizY += 12;
  }
  if (business.tax_id) {
    doc.text(`${t.taxId}: ${business.tax_id}`, 40, bizY);
    bizY += 12;
  }

  // Document Title & Number (Right Aligned)
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.primaryDark)
    .text(docTitle, 300, 56, { align: 'right', width: 255 });

  doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
  if (docNo) {
    doc.text(`${docNo}`, 300, 76, { align: 'right', width: 255 });
  }
  doc.fontSize(9).fillColor(COLORS.muted)
    .text(`${t.date}: ${formatDate(date)}`, 300, 90, { align: 'right', width: 255 });

  if (status) {
    const statusUpper = String(status).toUpperCase();
    const statusColor = statusUpper === 'PAID' || statusUpper === 'COMPLETED' || statusUpper === 'APPROVED'
      ? COLORS.success
      : statusUpper === 'CANCELLED' || statusUpper === 'VOID'
      ? COLORS.danger
      : COLORS.warning;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(statusColor)
      .text(`${t.status}: ${statusUpper}`, 300, 104, { align: 'right', width: 255 });
  }

  const endHeaderY = Math.max(bizY + 8, 126);
  drawDivider(doc, endHeaderY);
  return endHeaderY + 10;
}

function drawPartyBox(doc, y, title, name, details = []) {
  doc.rect(40, y, 515, 52).fillAndStroke(COLORS.tableHeaderBg, COLORS.border);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primaryDark)
    .text(title.toUpperCase(), 50, y + 8);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text)
    .text(name || 'Walk-in / Cash', 50, y + 20);

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
  const detailStr = details.filter(Boolean).join(' | ');
  if (detailStr) {
    doc.text(detailStr, 50, y + 36, { width: 495 });
  }
  return y + 62;
}

function drawTable(doc, startY, columns, rows, t) {
  let y = startY;

  // Header Row
  doc.rect(40, y, 515, 20).fill(COLORS.tableHeaderBg);
  doc.strokeColor(COLORS.border).lineWidth(1).rect(40, y, 515, 20).stroke();

  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.secondary);
  columns.forEach((col) => {
    doc.text(col.title, col.x, y + 5, { width: col.width, align: col.align || 'left' });
  });

  y += 20;

  // Data Rows
  doc.font('Helvetica').fontSize(9);
  rows.forEach((row, i) => {
    if (y > 720) {
      doc.addPage();
      y = 40;
      doc.rect(40, y, 515, 20).fill(COLORS.tableHeaderBg);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.secondary);
      columns.forEach((col) => {
        doc.text(col.title, col.x, y + 5, { width: col.width, align: col.align || 'left' });
      });
      y += 20;
      doc.font('Helvetica').fontSize(9);
    }

    if (i % 2 === 1) {
      doc.rect(40, y, 515, 20).fill('#fafafa');
    }

    doc.fillColor(COLORS.text);
    columns.forEach((col) => {
      const val = row[col.key] !== undefined ? String(row[col.key]) : '-';
      doc.text(val, col.x, y + 5, { width: col.width, align: col.align || 'left' });
    });

    drawDivider(doc, y + 20, COLORS.border, 0.5);
    y += 20;
  });

  return y + 8;
}

function drawSummaryBox(doc, y, summaryItems) {
  const boxWidth = 220;
  const boxX = 555 - boxWidth;
  let curY = y;

  summaryItems.forEach((item) => {
    if (curY > 740) {
      doc.addPage();
      curY = 40;
    }

    const isBold = item.bold || item.isTotal;
    const isTotal = item.isTotal;

    if (isTotal) {
      doc.rect(boxX - 5, curY - 2, boxWidth + 5, 20).fill(COLORS.primaryLight);
      drawDivider(doc, curY - 2, COLORS.primary, 1);
      drawDivider(doc, curY + 18, COLORS.primary, 1);
    }

    doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(isTotal ? 10 : 9)
      .fillColor(isTotal ? COLORS.primaryDark : COLORS.text);

    doc.text(item.label, boxX, curY + (isTotal ? 3 : 0), { width: 110, align: 'left' });
    doc.text(item.value, boxX + 110, curY + (isTotal ? 3 : 0), { width: 110, align: 'right' });

    curY += isTotal ? 24 : 16;
  });

  return curY + 10;
}

function drawFooter(doc, t) {
  const pageHeight = doc.page.height;
  const footerY = pageHeight - 45;

  drawDivider(doc, footerY, COLORS.borderDark, 0.75);
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
    .text(t.statutoryNote, 40, footerY + 6, { align: 'center', width: 515 })
    .text(`HisabKi Kitab (https://hisabkikitab.com) — Production Financial System`, 40, footerY + 18, { align: 'center', width: 515 });
}

function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// -----------------------------------------------------------------------------
// Document Type Generators (12 Types)
// -----------------------------------------------------------------------------

const BusinessDocuments = {
  /**
   * Generates PDF buffer for any of the 12 document types.
   */
  async generateDocumentPdf({ businessId, docType, docId, query = {}, lang = 'en' }) {
    const business = await BusinessRepository.getBusinessById(businessId);
    if (!business) {
      const err = new Error('Business not found');
      err.status = 404;
      throw err;
    }

    const t = (lang === 'ur' || lang === 'roman_urdu') ? DICT.ur : DICT.en;

    switch (docType) {
      case 'sales-invoice':
        return this.generateSalesInvoice(business, docId, t);
      case 'pos-receipt':
        return this.generatePosReceipt(business, docId, t);
      case 'purchase-order':
        return this.generatePurchaseOrder(business, docId, t);
      case 'goods-received-note':
      case 'grn':
        return this.generateGrn(business, docId, t);
      case 'supplier-bill':
        return this.generateSupplierBill(business, docId, t);
      case 'customer-statement':
        return this.generateCustomerStatement(business, docId, t);
      case 'supplier-statement':
        return this.generateSupplierStatement(business, docId, t);
      case 'payment-receipt':
        return this.generatePaymentReceipt(business, docId, t);
      case 'employee-payslip':
      case 'payslip':
        return this.generateEmployeePayslip(business, docId, query, t);
      case 'profit-and-loss':
      case 'pnl':
        return this.generateProfitAndLoss(business, query, t);
      case 'balance-sheet':
        return this.generateBalanceSheet(business, query, t);
      case 'cash-flow':
        return this.generateCashFlow(business, query, t);
      default: {
        const err = new Error(`Unsupported document type: ${docType}`);
        err.status = 400;
        throw err;
      }
    }
  },

  // 1. A4 Sales Invoice
  async generateSalesInvoice(business, saleId, t) {
    const sale = await BusinessRepository.getSaleById(business.id, saleId);
    if (!sale) {
      const err = new Error('Sale not found');
      err.status = 404;
      throw err;
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.salesInvoice, `${t.invoiceNo} ${sale.invoice_number}`, sale.date, sale.payment_status || 'paid', t);

    // Customer Box
    const customerDetails = [sale.customer_phone, sale.customer_address];
    y = drawPartyBox(doc, y, t.billTo, sale.customer_name, customerDetails);

    // Columns
    const columns = [
      { title: t.item, key: 'name', x: 45, width: 230 },
      { title: t.qty, key: 'quantity', x: 280, width: 50, align: 'right' },
      { title: t.unitPrice, key: 'price', x: 335, width: 75, align: 'right' },
      { title: t.tax, key: 'tax', x: 415, width: 55, align: 'right' },
      { title: t.lineTotal, key: 'total', x: 475, width: 75, align: 'right' },
    ];

    const rows = (sale.items || []).map((it) => ({
      name: it.product_name,
      quantity: it.quantity,
      price: formatPKR(it.unit_price_minor),
      tax: formatPKR(it.tax_minor || 0),
      total: formatPKR(it.line_total_minor),
    }));

    y = drawTable(doc, y, columns, rows, t);

    // Summary Box
    const summaryItems = [
      { label: t.subtotal, value: formatPKR(sale.subtotal_minor) },
      { label: t.tax, value: formatPKR(sale.tax_minor || 0) },
      { label: t.discount, value: formatPKR(sale.discount_minor || 0) },
      { label: t.grandTotal, value: formatPKR(sale.grand_total_minor), isTotal: true },
      { label: t.amountPaid, value: formatPKR(sale.paid_amount_minor) },
      { label: t.balanceDue, value: formatPKR(sale.balance_due_minor), bold: true },
    ];

    y = drawSummaryBox(doc, y, summaryItems);

    if (sale.notes) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.secondary).text(`${t.notes}:`, 40, y);
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(sale.notes, 40, y + 12);
    }

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `Invoice-${sale.invoice_number}.pdf`, contentType: 'application/pdf' };
  },

  // 2. Thermal POS Receipt (80mm width = 226 points)
  async generatePosReceipt(business, saleId, t) {
    const sale = await BusinessRepository.getSaleById(business.id, saleId);
    if (!sale) {
      const err = new Error('Sale not found');
      err.status = 404;
      throw err;
    }

    const doc = new PDFDocument({ size: [226, 750], margin: 12 });
    let y = 14;

    // Header: Centered
    doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.secondary)
      .text(business.name, 12, y, { align: 'center', width: 202 });
    y += 16;

    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    if (business.address || business.city) {
      doc.text(`${business.address || ''} ${business.city || ''}`.trim(), 12, y, { align: 'center', width: 202 });
      y += 11;
    }
    if (business.contact_number) {
      doc.text(`Tel: ${business.contact_number}`, 12, y, { align: 'center', width: 202 });
      y += 11;
    }
    if (business.tax_id) {
      doc.text(`${t.taxId}: ${business.tax_id}`, 12, y, { align: 'center', width: 202 });
      y += 11;
    }

    y += 4;
    drawDashedDivider(doc, y, 12, 214);
    y += 6;

    // Receipt Meta
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text)
      .text(t.posReceipt, 12, y, { align: 'center', width: 202 });
    y += 12;

    doc.font('Helvetica').fontSize(8).fillColor(COLORS.text);
    doc.text(`${t.receiptNo} ${sale.invoice_number}`, 12, y);
    doc.text(`${formatDate(sale.date)}`, 12, y, { align: 'right', width: 202 });
    y += 11;

    if (sale.customer_name) {
      doc.text(`${t.billTo}: ${sale.customer_name}`, 12, y);
      y += 11;
    }

    drawDashedDivider(doc, y, 12, 214);
    y += 6;

    // Itemized Lines
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.secondary);
    doc.text(t.item, 12, y, { width: 110 });
    doc.text(t.qty, 125, y, { width: 25, align: 'right' });
    doc.text(t.lineTotal, 155, y, { width: 59, align: 'right' });
    y += 12;

    doc.font('Helvetica').fontSize(8).fillColor(COLORS.text);
    (sale.items || []).forEach((it) => {
      doc.text(it.product_name, 12, y, { width: 110, ellipsis: true });
      doc.text(String(it.quantity), 125, y, { width: 25, align: 'right' });
      doc.text(formatPKR(it.line_total_minor), 155, y, { width: 59, align: 'right' });
      y += 11;
    });

    drawDashedDivider(doc, y, 12, 214);
    y += 6;

    // Totals
    const addRow = (lbl, val, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 9 : 8).fillColor(COLORS.text);
      doc.text(lbl, 12, y, { width: 120 });
      doc.text(val, 132, y, { width: 82, align: 'right' });
      y += bold ? 13 : 11;
    };

    addRow(t.subtotal, formatPKR(sale.subtotal_minor));
    if (sale.tax_minor > 0) addRow(t.tax, formatPKR(sale.tax_minor));
    if (sale.discount_minor > 0) addRow(t.discount, formatPKR(sale.discount_minor));
    addRow(t.grandTotal, formatPKR(sale.grand_total_minor), true);
    addRow(t.amountPaid, formatPKR(sale.paid_amount_minor));
    if (sale.balance_due_minor > 0) addRow(t.balanceDue, formatPKR(sale.balance_due_minor), true);

    y += 4;
    drawDashedDivider(doc, y, 12, 214);
    y += 8;

    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
      .text(t.thankYou, 12, y, { align: 'center', width: 202 })
      .text(`HisabKi Kitab POS`, 12, y + 11, { align: 'center', width: 202 });

    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `Receipt-${sale.invoice_number}.pdf`, contentType: 'application/pdf' };
  },

  // 3. Purchase Order (PO)
  async generatePurchaseOrder(business, poId, t) {
    const po = await BusinessRepository.getPurchaseOrderById(business.id, poId);
    if (!po) {
      const err = new Error('Purchase order not found');
      err.status = 404;
      throw err;
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.purchaseOrder, `${t.poNo} ${po.po_number}`, po.date, po.status, t);

    // Supplier Box
    const supplierDetails = [po.supplier_company, po.supplier_phone];
    y = drawPartyBox(doc, y, t.supplier, po.supplier_name, supplierDetails);

    const columns = [
      { title: t.sku, key: 'sku', x: 45, width: 80 },
      { title: t.item, key: 'name', x: 130, width: 195 },
      { title: t.qty, key: 'quantity', x: 330, width: 50, align: 'right' },
      { title: t.unitPrice, key: 'price', x: 385, width: 80, align: 'right' },
      { title: t.lineTotal, key: 'total', x: 470, width: 80, align: 'right' },
    ];

    const rows = (po.items || []).map((it) => ({
      sku: it.sku || '-',
      name: it.product_name,
      quantity: `${it.quantity} ${it.unit || ''}`,
      price: formatPKR(it.unit_price_minor),
      total: formatPKR(it.line_total_minor),
    }));

    y = drawTable(doc, y, columns, rows, t);

    const summaryItems = [
      { label: t.grandTotal, value: formatPKR(po.total_amount_minor), isTotal: true },
    ];
    y = drawSummaryBox(doc, y, summaryItems);

    if (po.notes) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.secondary).text(`${t.notes}:`, 40, y);
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(po.notes, 40, y + 12);
    }

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `PO-${po.po_number}.pdf`, contentType: 'application/pdf' };
  },

  // 4. Goods Received Note (GRN)
  async generateGrn(business, grnId, t) {
    const grn = await BusinessRepository.getGrnById(business.id, grnId);
    if (!grn) {
      const err = new Error('GRN not found');
      err.status = 404;
      throw err;
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.grn, `${t.grnNo} ${grn.grn_number}`, grn.received_date, grn.status, t);

    // Supplier & Warehouse Box
    const supplierDetails = [grn.supplier_company, `${t.warehouse}: ${grn.warehouse_name || 'Main'}`];
    y = drawPartyBox(doc, y, t.supplier, grn.supplier_name, supplierDetails);

    const columns = [
      { title: t.item, key: 'name', x: 45, width: 175 },
      { title: t.orderedQty, key: 'ordered', x: 225, width: 55, align: 'right' },
      { title: t.receivedQty, key: 'received', x: 285, width: 55, align: 'right' },
      { title: t.rejectedQty, key: 'rejected', x: 345, width: 55, align: 'right' },
      { title: t.unitCost, key: 'cost', x: 405, width: 70, align: 'right' },
      { title: t.valuation, key: 'valuation', x: 480, width: 70, align: 'right' },
    ];

    const rows = (grn.items || []).map((it) => ({
      name: it.product_name,
      ordered: it.ordered_quantity,
      received: it.received_quantity,
      rejected: it.rejected_quantity || 0,
      cost: formatPKR(it.unit_cost_minor),
      valuation: formatPKR(it.valuation_total_minor),
    }));

    y = drawTable(doc, y, columns, rows, t);

    const summaryItems = [
      { label: t.valuation, value: formatPKR(grn.total_received_value_minor), isTotal: true },
    ];
    y = drawSummaryBox(doc, y, summaryItems);

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `GRN-${grn.grn_number}.pdf`, contentType: 'application/pdf' };
  },

  // 5. Supplier Bill
  async generateSupplierBill(business, billId, t) {
    const bill = await BusinessRepository.getSupplierBillById(business.id, billId);
    if (!bill) {
      const err = new Error('Supplier bill not found');
      err.status = 404;
      throw err;
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.supplierBill, `${t.billNo} ${bill.bill_number}`, bill.bill_date, bill.status, t);

    const supplierDetails = [bill.supplier_company, bill.supplier_phone, bill.po_number ? `${t.poNo}: ${bill.po_number}` : ''];
    y = drawPartyBox(doc, y, t.supplier, bill.supplier_name, supplierDetails);

    const columns = [
      { title: t.item, key: 'name', x: 45, width: 230 },
      { title: t.qty, key: 'quantity', x: 280, width: 50, align: 'right' },
      { title: t.unitPrice, key: 'price', x: 335, width: 75, align: 'right' },
      { title: t.tax, key: 'tax', x: 415, width: 55, align: 'right' },
      { title: t.lineTotal, key: 'total', x: 475, width: 75, align: 'right' },
    ];

    const rows = (bill.items || []).map((it) => ({
      name: it.description || it.product_name || 'Item',
      quantity: it.quantity,
      price: formatPKR(it.unit_price_minor),
      tax: formatPKR(it.tax_minor || 0),
      total: formatPKR(it.line_total_minor),
    }));

    y = drawTable(doc, y, columns, rows, t);

    const summaryItems = [
      { label: t.subtotal, value: formatPKR(bill.subtotal_minor) },
      { label: t.tax, value: formatPKR(bill.tax_minor || 0) },
      { label: t.grandTotal, value: formatPKR(bill.grand_total_minor), isTotal: true },
      { label: t.amountPaid, value: formatPKR(bill.paid_amount_minor) },
      { label: t.balanceDue, value: formatPKR(bill.balance_due_minor), bold: true },
    ];
    y = drawSummaryBox(doc, y, summaryItems);

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `SupplierBill-${bill.bill_number}.pdf`, contentType: 'application/pdf' };
  },

  // 6. Customer Khata Statement
  async generateCustomerStatement(business, customerId, t) {
    const customer = await BusinessRepository.getCustomerById(business.id, customerId);
    if (!customer) {
      const err = new Error('Customer not found');
      err.status = 404;
      throw err;
    }
    const ledger = await BusinessRepository.getCustomerLedger(business.id, customerId);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.customerStatement, customer.name, new Date(), null, t);

    y = drawPartyBox(doc, y, t.billTo, customer.name, [customer.phone, customer.address, `${t.currentBalance}: ${formatPKR(customer.current_balance_minor)}`]);

    const columns = [
      { title: t.date, key: 'date', x: 45, width: 75 },
      { title: t.description, key: 'desc', x: 125, width: 190 },
      { title: t.debit, key: 'debit', x: 320, width: 70, align: 'right' },
      { title: t.credit, key: 'credit', x: 395, width: 70, align: 'right' },
      { title: t.runningBalance, key: 'balance', x: 470, width: 80, align: 'right' },
    ];

    const rows = (ledger || []).map((l) => ({
      date: formatDate(l.date),
      desc: l.description || l.narration || '-',
      debit: l.debit_minor > 0 ? formatPKR(l.debit_minor) : '-',
      credit: l.credit_minor > 0 ? formatPKR(l.credit_minor) : '-',
      balance: formatPKR(l.running_balance_minor || l.balance_minor || 0),
    }));

    y = drawTable(doc, y, columns, rows, t);

    const summaryItems = [
      { label: t.currentBalance, value: formatPKR(customer.current_balance_minor), isTotal: true },
    ];
    y = drawSummaryBox(doc, y, summaryItems);

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `CustomerKhata-${customer.name.replace(/\s+/g, '_')}.pdf`, contentType: 'application/pdf' };
  },

  // 7. Supplier Khata Statement
  async generateSupplierStatement(business, supplierId, t) {
    const supplier = await BusinessRepository.getSupplierById(business.id, supplierId);
    if (!supplier) {
      const err = new Error('Supplier not found');
      err.status = 404;
      throw err;
    }
    const ledger = await BusinessRepository.getSupplierLedger(business.id, supplierId);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.supplierStatement, supplier.name, new Date(), null, t);

    y = drawPartyBox(doc, y, t.supplier, supplier.name, [supplier.company_name, supplier.phone, `${t.currentBalance}: ${formatPKR(supplier.current_balance_minor)}`]);

    const columns = [
      { title: t.date, key: 'date', x: 45, width: 75 },
      { title: t.description, key: 'desc', x: 125, width: 190 },
      { title: t.debit, key: 'debit', x: 320, width: 70, align: 'right' },
      { title: t.credit, key: 'credit', x: 395, width: 70, align: 'right' },
      { title: t.runningBalance, key: 'balance', x: 470, width: 80, align: 'right' },
    ];

    const rows = (ledger || []).map((l) => ({
      date: formatDate(l.date),
      desc: l.description || l.narration || '-',
      debit: l.debit_minor > 0 ? formatPKR(l.debit_minor) : '-',
      credit: l.credit_minor > 0 ? formatPKR(l.credit_minor) : '-',
      balance: formatPKR(l.running_balance_minor || l.balance_minor || 0),
    }));

    y = drawTable(doc, y, columns, rows, t);

    const summaryItems = [
      { label: t.currentBalance, value: formatPKR(supplier.current_balance_minor), isTotal: true },
    ];
    y = drawSummaryBox(doc, y, summaryItems);

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `SupplierKhata-${supplier.name.replace(/\s+/g, '_')}.pdf`, contentType: 'application/pdf' };
  },

  // 8. Payment Receipt
  async generatePaymentReceipt(business, paymentId, t) {
    const payment = await BusinessRepository.getPaymentById(business.id, paymentId);
    if (!payment) {
      const err = new Error('Payment not found');
      err.status = 404;
      throw err;
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.paymentReceipt, `${t.receiptNo} ${payment.id.slice(0, 8).toUpperCase()}`, payment.date, 'completed', t);

    const partyName = payment.customer_name || payment.supplier_name || 'Cash Transfer / Equity';
    const partyDetails = [payment.customer_phone || payment.supplier_phone, payment.reference ? `Ref: ${payment.reference}` : ''];
    y = drawPartyBox(doc, y, payment.payment_type.replace(/_/g, ' ').toUpperCase(), partyName, partyDetails);

    const summaryItems = [
      { label: t.paymentMethod, value: payment.from_account_name || payment.to_account_name || 'Cash' },
      { label: t.grandTotal, value: formatPKR(payment.amount_minor), isTotal: true },
    ];
    y = drawSummaryBox(doc, y, summaryItems);

    if (payment.notes) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.secondary).text(`${t.notes}:`, 40, y);
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(payment.notes, 40, y + 12);
    }

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `Receipt-${payment.id.slice(0, 8)}.pdf`, contentType: 'application/pdf' };
  },

  // 9. Employee Payslip
  async generateEmployeePayslip(business, docId, query, t) {
    let item = await BusinessRepository.getPayrollItemById(business.id, docId);
    if (!item) {
      // Check if docId was payrollRunId
      const run = await BusinessRepository.getPayrollRunById(business.id, docId);
      if (run && run.items && run.items.length) {
        item = run.items[0];
        item.month = run.month;
      }
    }

    if (!item) {
      const err = new Error('Payroll record not found');
      err.status = 404;
      throw err;
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.employeePayslip, `${t.period}: ${item.month}`, new Date(), item.status || 'paid', t);

    y = drawPartyBox(doc, y, t.employee, item.employee_name, [item.designation, item.phone]);

    const summaryItems = [
      { label: t.baseSalary, value: formatPKR(item.base_salary_minor) },
      { label: t.allowances, value: formatPKR(item.allowances_minor || 0) },
      { label: t.grossPay, value: formatPKR(BigInt(item.base_salary_minor) + BigInt(item.allowances_minor || 0)), bold: true },
      { label: t.deductions, value: formatPKR(item.deductions_minor || 0) },
      { label: t.advanceDeducted, value: formatPKR(item.advance_deducted_minor || 0) },
      { label: t.netPayable, value: formatPKR(item.net_payable_minor), isTotal: true },
    ];
    y = drawSummaryBox(doc, y, summaryItems);

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `Payslip-${item.employee_name.replace(/\s+/g, '_')}-${item.month}.pdf`, contentType: 'application/pdf' };
  },

  // 10. Profit & Loss Statement
  async generateProfitAndLoss(business, query, t) {
    const fromDate = query.fromDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const toDate = query.toDate || new Date().toISOString().split('T')[0];

    const pnl = await BusinessService.getProfitAndLoss(business.id, { fromDate, toDate });

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.pnl, `${t.period}: ${fromDate} to ${toDate}`, new Date(), null, t);

    const columns = [
      { title: t.description, key: 'name', x: 45, width: 350 },
      { title: t.grandTotal, key: 'amount', x: 400, width: 150, align: 'right' },
    ];

    const rows = [
      { name: `--- ${t.revenue} ---`, amount: '' },
      ...(pnl.revenue?.accounts || []).map((a) => ({ name: `  ${a.code} - ${a.name}`, amount: formatPKR(a.balanceMinor) })),
      { name: `Total ${t.revenue}`, amount: formatPKR(pnl.revenue?.totalMinor || 0) },
      { name: '', amount: '' },
      { name: `--- ${t.cogs} ---`, amount: '' },
      ...(pnl.cogs?.accounts || []).map((a) => ({ name: `  ${a.code} - ${a.name}`, amount: formatPKR(a.balanceMinor) })),
      { name: `Total ${t.cogs}`, amount: formatPKR(pnl.cogs?.totalMinor || 0) },
      { name: '', amount: '' },
      { name: `${t.grossProfit}`, amount: formatPKR(pnl.grossProfitMinor || 0) },
      { name: '', amount: '' },
      { name: `--- ${t.operatingExpenses} ---`, amount: '' },
      ...(pnl.operatingExpenses?.accounts || []).map((a) => ({ name: `  ${a.code} - ${a.name}`, amount: formatPKR(a.balanceMinor) })),
      { name: `Total ${t.operatingExpenses}`, amount: formatPKR(pnl.operatingExpenses?.totalMinor || 0) },
    ];

    y = drawTable(doc, y, columns, rows, t);

    const summaryItems = [
      { label: t.grossProfit, value: formatPKR(pnl.grossProfitMinor || 0), bold: true },
      { label: t.netProfit, value: formatPKR(pnl.netProfitMinor || 0), isTotal: true },
    ];
    y = drawSummaryBox(doc, y, summaryItems);

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `ProfitLoss-${fromDate}-to-${toDate}.pdf`, contentType: 'application/pdf' };
  },

  // 11. Balance Sheet
  async generateBalanceSheet(business, query, t) {
    const asOfDate = query.asOfDate || new Date().toISOString().split('T')[0];
    const bs = await BusinessService.getBalanceSheet(business.id, asOfDate);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.balanceSheet, `${t.asOf}: ${asOfDate}`, new Date(), null, t);

    const columns = [
      { title: t.description, key: 'name', x: 45, width: 350 },
      { title: t.grandTotal, key: 'amount', x: 400, width: 150, align: 'right' },
    ];

    const rows = [
      { name: `--- ${t.assets} ---`, amount: '' },
      ...(bs.assets?.accounts || []).map((a) => ({ name: `  ${a.code} - ${a.name}`, amount: formatPKR(a.balanceMinor) })),
      { name: t.totalAssets, amount: formatPKR(bs.assets?.totalMinor || 0) },
      { name: '', amount: '' },
      { name: `--- ${t.liabilities} ---`, amount: '' },
      ...(bs.liabilities?.accounts || []).map((a) => ({ name: `  ${a.code} - ${a.name}`, amount: formatPKR(a.balanceMinor) })),
      { name: t.totalLiabilities, amount: formatPKR(bs.liabilities?.totalMinor || 0) },
      { name: '', amount: '' },
      { name: `--- ${t.equity} ---`, amount: '' },
      ...(bs.equity?.accounts || []).map((a) => ({ name: `  ${a.code} - ${a.name}`, amount: formatPKR(a.balanceMinor) })),
      { name: t.totalEquity, amount: formatPKR(bs.equity?.totalMinor || 0) },
    ];

    y = drawTable(doc, y, columns, rows, t);

    const summaryItems = [
      { label: t.totalAssets, value: formatPKR(bs.assets?.totalMinor || 0), bold: true },
      { label: t.liabilitiesAndEquity, value: formatPKR(bs.totalLiabilitiesAndEquityMinor || 0), isTotal: true },
    ];
    y = drawSummaryBox(doc, y, summaryItems);

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `BalanceSheet-${asOfDate}.pdf`, contentType: 'application/pdf' };
  },

  // 12. Cash Flow Statement
  async generateCashFlow(business, query, t) {
    const fromDate = query.fromDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const toDate = query.toDate || new Date().toISOString().split('T')[0];

    const cf = await BusinessService.getCashFlowStatement(business.id, { fromDate, toDate });

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let y = drawHeader(doc, business, t.cashFlow, `${t.period}: ${fromDate} to ${toDate}`, new Date(), null, t);

    const columns = [
      { title: t.description, key: 'name', x: 45, width: 350 },
      { title: t.grandTotal, key: 'amount', x: 400, width: 150, align: 'right' },
    ];

    const rows = [
      { name: `--- ${t.operatingCash} ---`, amount: '' },
      ...(cf.operatingActivities?.lines || []).map((l) => ({ name: `  ${l.description}`, amount: formatPKR(l.amountMinor) })),
      { name: `Total ${t.operatingCash}`, amount: formatPKR(cf.operatingActivities?.totalMinor || 0) },
      { name: '', amount: '' },
      { name: `--- ${t.investingCash} ---`, amount: '' },
      ...(cf.investingActivities?.lines || []).map((l) => ({ name: `  ${l.description}`, amount: formatPKR(l.amountMinor) })),
      { name: `Total ${t.investingCash}`, amount: formatPKR(cf.investingActivities?.totalMinor || 0) },
      { name: '', amount: '' },
      { name: `--- ${t.financingCash} ---`, amount: '' },
      ...(cf.financingActivities?.lines || []).map((l) => ({ name: `  ${l.description}`, amount: formatPKR(l.amountMinor) })),
      { name: `Total ${t.financingCash}`, amount: formatPKR(cf.financingActivities?.totalMinor || 0) },
    ];

    y = drawTable(doc, y, columns, rows, t);

    const summaryItems = [
      { label: t.openingCash, value: formatPKR(cf.openingCashMinor || 0) },
      { label: t.netCashChange, value: formatPKR(cf.netCashChangeMinor || 0), bold: true },
      { label: t.closingCash, value: formatPKR(cf.closingCashMinor || 0), isTotal: true },
    ];
    y = drawSummaryBox(doc, y, summaryItems);

    drawFooter(doc, t);
    const buffer = await streamToBuffer(doc);
    return { buffer, filename: `CashFlow-${fromDate}-to-${toDate}.pdf`, contentType: 'application/pdf' };
  },
};

module.exports = BusinessDocuments;
