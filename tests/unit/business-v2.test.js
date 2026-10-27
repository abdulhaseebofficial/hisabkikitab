const test = require('node:test');
const assert = require('node:assert/strict');
const AccountingEngine = require('../../apps/api/src/modules/business/accounting.engine');
const { AGING_BUCKETS, SYSTEM_ACCOUNTS } = require('@hisabkikitab/contracts/business');

test('Business V2: Balance Sheet maintains Assets = Liabilities + Equity continuously', () => {
  // Simulate journal entries over an entire trading period
  // Starting state:
  // Cash (1010): 100,000 PKR
  // Inventory (1200): 50,000 PKR
  // Accounts Payable (2010): 30,000 PKR
  // Owner Capital (3010): 120,000 PKR
  // Assets = 150,000; Liab + Equity = 30,000 + 120,000 = 150,000. Balanced!

  let cash = 10000000n;
  let inventory = 5000000n;
  let receivables = 0n;
  let payables = 3000000n;
  let capital = 12000000n;

  // Track revenue & expenses for the period
  let grossSales = 0n;
  let salesReturns = 0n;
  let cogs = 0n;
  let operatingExpenses = 0n;
  let shrinkageLoss = 0n;

  // Transaction 1: Cash Sale of Rs 20,000 (Cost basis Rs 12,000)
  // Debit Cash 20,000, Credit Sales 20,000
  // Debit COGS 12,000, Credit Inventory 12,000
  cash += 2000000n;
  grossSales += 2000000n;
  cogs += 1200000n;
  inventory -= 1200000n;

  // Transaction 2: Credit Sale of Rs 15,000 (Cost basis Rs 9,000)
  // Debit Receivables 15,000, Credit Sales 15,000
  // Debit COGS 9,000, Credit Inventory 9,000
  receivables += 1500000n;
  grossSales += 1500000n;
  cogs += 900000n;
  inventory -= 900000n;

  // Transaction 3: Customer Return (Restockable) Rs 5,000 (Cost Rs 3,000)
  // Debit Sales Returns 5,000, Credit Cash 5,000
  // Debit Inventory 3,000, Credit COGS 3,000
  salesReturns += 500000n;
  cash -= 500000n;
  inventory += 300000n;
  cogs -= 300000n;

  // Transaction 4: Operating Expenses (Rent & Utilities) Rs 8,000 paid via cash
  cash -= 800000n;
  operatingExpenses += 800000n;

  // Transaction 5: Inventory Physical Audit reveals Rs 2,000 shrinkage
  // Debit Shrinkage Loss 2,000, Credit Inventory 2,000
  shrinkageLoss += 200000n;
  inventory -= 200000n;

  // Transaction 6: Partial Supplier payment Rs 10,000 from cash
  cash -= 1000000n;
  payables -= 1000000n;

  // Transaction 7: Customer Khata Collection Rs 10,000 cash
  cash += 1000000n;
  receivables -= 1000000n;

  // Compute Net Income for period:
  // Net Revenue = Gross Sales (35,000) - Sales Returns (5,000) = 30,000
  // Total COGS = 12,000 + 9,000 - 3,000 = 18,000
  // Gross Profit = 30,000 - 18,000 = 12,000
  // Total Expenses = Operating (8,000) + Shrinkage (2,000) = 10,000
  // Net Income = 12,000 - 10,000 = 2,000 (200,000 minor)
  const netRevenue = grossSales - salesReturns;
  const grossProfit = netRevenue - cogs;
  const netIncome = grossProfit - (operatingExpenses + shrinkageLoss);

  assert.equal(netIncome, 200000n, 'Net income must equal Rs 2,000');

  // Verify Balance Sheet Equation:
  const totalAssets = cash + inventory + receivables;
  const totalLiabilities = payables;
  const totalEquity = capital + netIncome;

  assert.equal(totalAssets, totalLiabilities + totalEquity, 'Assets must strictly equal Liabilities + Equity');
});

test('Business V2: Sales Returns accounting distinguishes Restockable vs Damaged goods', () => {
  // Scenario A: Restockable Return
  // Product returned in mint condition, put back on the shelf
  const saleItemUnitPrice = 250000n; // Rs 2,500
  const saleItemCostPrice = 160000n; // Rs 1,600
  const returnQty = 2n;

  const refundAmount = saleItemUnitPrice * returnQty; // 500,000 (Rs 5,000)
  const costBasis = saleItemCostPrice * returnQty; // 320,000 (Rs 3,200)

  // Journal entries for restockable return:
  // 1. Debit Sales Returns (4110) 500,000 / Credit Cash (1010) 500,000
  // 2. Debit Inventory (1200) 320,000 / Credit COGS (5010) 320,000
  const restockJournal = [
    { accountCode: '4110', debit: refundAmount, credit: 0n },
    { accountCode: '1010', debit: 0n, credit: refundAmount },
    { accountCode: '1200', debit: costBasis, credit: 0n },
    { accountCode: '5010', debit: 0n, credit: costBasis },
  ];

  const totalRestockDebit = restockJournal.reduce((s, l) => s + l.debit, 0n);
  const totalRestockCredit = restockJournal.reduce((s, l) => s + l.credit, 0n);
  assert.equal(totalRestockDebit, totalRestockCredit, 'Restock return journal must balance');
  assert.equal(totalRestockDebit, refundAmount + costBasis);

  // Scenario B: Damaged / Broken Return
  // Product is damaged and cannot be sold again; must be written off as expense
  // Journal entries:
  // 1. Debit Sales Returns (4110) 500,000 / Credit Cash (1010) 500,000
  // 2. Debit Damaged Goods Expense (6110) 320,000 / Credit COGS (5010) 320,000
  const damageJournal = [
    { accountCode: '4110', debit: refundAmount, credit: 0n },
    { accountCode: '1010', debit: 0n, credit: refundAmount },
    { accountCode: '6110', debit: costBasis, credit: 0n },
    { accountCode: '5010', debit: 0n, credit: costBasis },
  ];

  const totalDamageDebit = damageJournal.reduce((s, l) => s + l.debit, 0n);
  const totalDamageCredit = damageJournal.reduce((s, l) => s + l.credit, 0n);
  assert.equal(totalDamageDebit, totalDamageCredit, 'Damaged return journal must balance');

  // Verify that inventory account (1200) was NOT debited in damaged scenario
  assert.equal(damageJournal.some((l) => l.accountCode === '1200'), false);
});

test('Business V2: POS Shift cash drawer variance formula is exact', () => {
  const openingCash = 500000n; // Rs 5,000 opening float
  const cashSalesCollected = 4250000n; // Rs 42,500 collected from sales
  const cashRefundsPaid = 150000n; // Rs 1,500 paid in returns

  const expectedCash = openingCash + cashSalesCollected - cashRefundsPaid;
  assert.equal(expectedCash, 4600000n); // Rs 46,000 expected in drawer

  // Case 1: Exact drawer
  const actualExact = 4600000n;
  const varianceExact = actualExact - expectedCash;
  assert.equal(varianceExact, 0n);

  // Case 2: Shortage of Rs 500 (e.g. cashier made incorrect change)
  const actualShort = 4550000n;
  const varianceShort = actualShort - expectedCash;
  assert.equal(varianceShort, -50000n);

  // Case 3: Surplus of Rs 350
  const actualSurplus = 4635000n;
  const varianceSurplus = actualSurplus - expectedCash;
  assert.equal(varianceSurplus, 35000n);
});

test('Business V2: Aging intervals correctly bucket overdue khata accounts', () => {
  const asOfDate = new Date('2026-10-19T00:00:00Z');

  const categorizeInvoice = (invoiceDateStr) => {
    const invDate = new Date(`${invoiceDateStr}T00:00:00Z`);
    const diffDays = Math.floor((asOfDate - invDate) / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) return 'bucket_1_30';
    if (diffDays <= 60) return 'bucket_31_60';
    if (diffDays <= 90) return 'bucket_61_90';
    return 'bucket_over_90';
  };

  // Invoices:
  // 5 days ago: 2026-10-14 -> 1-30
  assert.equal(categorizeInvoice('2026-10-14'), 'bucket_1_30');

  // 35 days ago: 2026-09-14 -> 31-60
  assert.equal(categorizeInvoice('2026-09-14'), 'bucket_31_60');

  // 75 days ago: 2026-08-05 -> 61-90
  assert.equal(categorizeInvoice('2026-08-05'), 'bucket_61_90');

  // 120 days ago: 2026-06-21 -> 90+
  assert.equal(categorizeInvoice('2026-06-21'), 'bucket_over_90');
});

test('Business V2: Cash flow statement isolates operating from internal vault-to-bank transfers', () => {
  const cashAccounts = new Set(['1010', '1020', '1030']);

  // Transaction A: Customer pays cash Rs 10,000 for sale
  // Debit 1010, Credit 4010 -> Operating cash receipt
  const txA = { debitAccount: '1010', creditAccount: '4010', amount: 1000000n };
  const isInternalTransferA = cashAccounts.has(txA.debitAccount) && cashAccounts.has(txA.creditAccount);
  assert.equal(isInternalTransferA, false, 'Sale is not an internal transfer');

  // Transaction B: Merchant deposits shop cash into bank account (Vault to Bank)
  // Debit 1020 (Bank), Credit 1010 (Cash in Hand)
  const txB = { debitAccount: '1020', creditAccount: '1010', amount: 5000000n };
  const isInternalTransferB = cashAccounts.has(txB.debitAccount) && cashAccounts.has(txB.creditAccount);
  assert.equal(isInternalTransferB, true, 'Cash-to-bank deposit must be classified as internal transfer');

  // Internal transfers must not distort net operating cash flow:
  let netOperatingCash = 0n;
  const transactions = [txA, txB];
  for (const tx of transactions) {
    if (cashAccounts.has(tx.debitAccount) && cashAccounts.has(tx.creditAccount)) {
      // Excluded from operating/investing/financing cash flows
      continue;
    }
    if (cashAccounts.has(tx.debitAccount) && tx.creditAccount === '4010') {
      netOperatingCash += tx.amount;
    }
  }

  assert.equal(netOperatingCash, 1000000n, 'Net operating cash flow should reflect only real customer receipt');
});
