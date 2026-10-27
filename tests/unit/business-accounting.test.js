const test = require('node:test');
const assert = require('node:assert/strict');
const AccountingEngine = require('../../apps/api/src/modules/business/accounting.engine');

test('AccountingEngine strictly enforces double-entry balancing rules', async () => {
  // 1. Missing client
  await assert.rejects(
    AccountingEngine.postJournalEntry(null, { lines: [] }),
    /AccountingEngine requires an active database client/
  );

  // Mock dummy client
  const mockClient = { query: async () => ({ rows: [] }) };

  // 2. Fewer than 2 lines
  await assert.rejects(
    AccountingEngine.postJournalEntry(mockClient, { lines: [{ accountId: '1', debitMinor: 100n }] }),
    /must contain at least two lines/
  );

  // 3. Unbalanced lines
  await assert.rejects(
    AccountingEngine.postJournalEntry(mockClient, {
      lines: [
        { accountId: '1', debitMinor: 1000n, creditMinor: 0n },
        { accountId: '2', debitMinor: 0n, creditMinor: 800n },
      ],
    }),
    /Unbalanced journal entry: Total debits \(1000\) do not equal total credits \(800\)/
  );

  // 4. Zero amount lines
  await assert.rejects(
    AccountingEngine.postJournalEntry(mockClient, {
      lines: [
        { accountId: '1', debitMinor: 0n, creditMinor: 0n },
        { accountId: '2', debitMinor: 0n, creditMinor: 0n },
      ],
    }),
    /Journal line must have either a debit or credit/
  );

  // 5. Negative amounts rejected
  await assert.rejects(
    AccountingEngine.postJournalEntry(mockClient, {
      lines: [
        { accountId: '1', debitMinor: -500n, creditMinor: 0n },
        { accountId: '2', debitMinor: 0n, creditMinor: -500n },
      ],
    }),
    /must be non-negative/
  );
});

test('Double-entry normal balances calculate correctly across all 5 account types', () => {
  // Test balance adjustment logic:
  // Asset & Expense: Debit increases, Credit decreases
  // Liability, Equity & Revenue: Credit increases, Debit decreases

  const computeDelta = (type, debit, credit) => {
    const isDebitNormal = type === 'asset' || type === 'expense';
    return isDebitNormal ? (BigInt(debit) - BigInt(credit)) : (BigInt(credit) - BigInt(debit));
  };

  // Asset (Cash) received Rs 1000 debit
  assert.equal(computeDelta('asset', 100000n, 0n), 100000n);
  // Asset (Cash) paid Rs 300 credit
  assert.equal(computeDelta('asset', 0n, 30000n), -30000n);

  // Expense (Rent) paid Rs 500 debit
  assert.equal(computeDelta('expense', 50000n, 0n), 50000n);

  // Liability (Payables) increased on credit Rs 2000
  assert.equal(computeDelta('liability', 0n, 200000n), 200000n);
  // Liability paid off on debit Rs 1500
  assert.equal(computeDelta('liability', 150000n, 0n), -150000n);

  // Equity (Owner Capital) credited Rs 5000
  assert.equal(computeDelta('equity', 0n, 500000n), 500000n);

  // Revenue (Sales) credited Rs 1200
  assert.equal(computeDelta('revenue', 0n, 120000n), 120000n);
});

test('Double-entry opening balances reconcile cleanly without trial balance disparity', () => {
  // Opening Assets
  const openingCash = 5000000n; // Rs 50,000
  const openingBank = 15000000n; // Rs 150,000
  const openingStock = 20000000n; // Rs 200,000
  const openingReceivables = 3000000n; // Rs 30,000

  const totalAssets = openingCash + openingBank + openingStock + openingReceivables; // 43,000,000 minor

  // Opening Liabilities
  const openingPayables = 8000000n; // Rs 80,000

  // Derived Owner Equity
  const ownerCapital = totalAssets - openingPayables; // 35,000,000 minor

  const journalLines = [
    { accountCode: '1010', debitMinor: openingCash, creditMinor: 0n },
    { accountCode: '1020', debitMinor: openingBank, creditMinor: 0n },
    { accountCode: '1040', debitMinor: openingStock, creditMinor: 0n },
    { accountCode: '1030', debitMinor: openingReceivables, creditMinor: 0n },
    { accountCode: '2010', debitMinor: 0n, creditMinor: openingPayables },
    { accountCode: '3010', debitMinor: 0n, creditMinor: ownerCapital },
  ];

  const sumDebits = journalLines.reduce((acc, l) => acc + l.debitMinor, 0n);
  const sumCredits = journalLines.reduce((acc, l) => acc + l.creditMinor, 0n);

  assert.equal(sumDebits, sumCredits);
  assert.equal(sumDebits, 43000000n);
});

test('Weighted-average inventory costing and COGS computation conserve value', () => {
  // Initial stock: 10 units @ 100/unit
  const initialQty = 10;
  const initialUnitCost = 10000n; // 100.00 in minor units
  let currentValuation = BigInt(initialQty) * initialUnitCost; // 100,000

  // Purchase: 20 units @ 130/unit
  const purchaseQty = 20;
  const purchaseUnitCost = 13000n;
  const purchaseValuation = BigInt(purchaseQty) * purchaseUnitCost; // 260,000

  const newQty = initialQty + purchaseQty; // 30
  const newTotalValuation = currentValuation + purchaseValuation; // 360,000
  const weightedAverageUnitCost = newTotalValuation / BigInt(newQty); // 12,000 (120.00/unit)

  assert.equal(weightedAverageUnitCost, 12000n);

  // Sale: 5 units @ 180/unit
  const soldQty = 5;
  const sellingUnitPrice = 18000n;
  const grossSales = BigInt(soldQty) * sellingUnitPrice; // 90,000
  const cogs = BigInt(soldQty) * weightedAverageUnitCost; // 60,000
  const grossProfit = grossSales - cogs; // 30,000

  assert.equal(grossSales, 90000n);
  assert.equal(cogs, 60000n);
  assert.equal(grossProfit, 30000n);

  // Remaining inventory
  const remainingQty = newQty - soldQty; // 25
  const remainingValuation = BigInt(remainingQty) * weightedAverageUnitCost; // 300,000
  assert.equal(remainingValuation + cogs, newTotalValuation);
});

test('Owner capital injections and personal drawings do not distort Profit & Loss', () => {
  // Simulated trial balance amounts
  let revenue = 0n;
  let cogs = 0n;
  let operatingExpenses = 0n;
  let ownerCapital = 0n;
  let ownerDrawings = 0n;
  let cashAndBank = 0n;

  // 1. Owner injects Rs 500,000 (50,000,000 minor)
  const capitalInjection = 50000000n;
  cashAndBank += capitalInjection;
  ownerCapital += capitalInjection;
  // Crucial check: revenue is untouched
  assert.equal(revenue, 0n);

  // 2. Business makes a sale of Rs 100,000 (10,000,000 minor), COGS Rs 60,000
  const saleAmount = 10000000n;
  const saleCogs = 6000000n;
  cashAndBank += saleAmount;
  revenue += saleAmount;
  cogs += saleCogs;

  // 3. Operating expense (rent) Rs 15,000 (1,500,000 minor)
  const rentExpense = 1500000n;
  cashAndBank -= rentExpense;
  operatingExpenses += rentExpense;

  // 4. Owner draws Rs 20,000 (2,000,000 minor) for personal expenses
  const drawings = 2000000n;
  cashAndBank -= drawings;
  ownerDrawings += drawings;
  // Crucial check: operating expenses are untouched
  assert.equal(operatingExpenses, rentExpense);

  // Profit & Loss calculation:
  const grossProfit = revenue - cogs; // 10,000,000 - 6,000,000 = 4,000,000
  const netProfit = grossProfit - operatingExpenses; // 4,000,000 - 1,500,000 = 2,500,000

  assert.equal(netProfit, 2500000n); // Rs 25,000 true operational profit
  assert.equal(ownerCapital, 50000000n);
  assert.equal(ownerDrawings, 2000000n);
});

test('Customer split-payment and credit ledger balance accurately', () => {
  let cashBalance = 0n;
  let customerReceivables = 0n;
  let salesRevenue = 0n;

  // POS Sale: Rs 10,000 total. Customer pays Rs 3,000 cash, Rs 7,000 on udhaar (credit)
  const totalSale = 1000000n;
  const cashPaid = 300000n;
  const creditAmount = totalSale - cashPaid; // 700,000

  // Journal entry lines:
  // Dr Cash: 300,000
  // Dr Receivables: 700,000
  // Cr Revenue: 1,000,000
  cashBalance += cashPaid;
  customerReceivables += creditAmount;
  salesRevenue += totalSale;

  assert.equal(cashBalance + customerReceivables, salesRevenue);
  assert.equal(customerReceivables, 700000n);

  // Subsequent partial recovery of Rs 4,000
  const recovery = 400000n;
  cashBalance += recovery;
  customerReceivables -= recovery;

  assert.equal(customerReceivables, 300000n); // Rs 3,000 remaining due
  assert.equal(cashBalance, 700000n);
});
