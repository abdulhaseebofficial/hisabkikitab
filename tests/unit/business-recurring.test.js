const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const BusinessService = require('../../apps/api/src/modules/business/business.service');
const BusinessRepository = require('../../apps/api/src/modules/business/business.repository');
const AccountingEngine = require('../../apps/api/src/modules/business/accounting.engine');

function createMockDb() {
  const db = {
    recurringExpenses: new Map(),
    recurringOccurrences: new Map(),
    expenses: new Map(),
    suppliers: new Map([
      ['sup_office', { id: 'sup_office', name: 'Office Landlord', current_balance_minor: '0' }]
    ]),
    accounts: new Map([
      ['acc_cash', { id: 'acc_cash', code: '1010', name: 'Cash', type: 'asset', subtype: 'cash' }],
      ['acc_bank', { id: 'acc_bank', code: '1020', name: 'Bank Account', type: 'asset', subtype: 'bank' }],
      ['acc_ap', { id: 'acc_ap', code: '2010', name: 'Accounts Payable', type: 'liability', subtype: 'payable' }],
      ['acc_rent', { id: 'acc_rent', code: '5010', name: 'Rent Expense', type: 'expense', subtype: 'operating' }],
      ['acc_util', { id: 'acc_util', code: '5020', name: 'Electricity Utilities', type: 'expense', subtype: 'operating' }],
    ]),
    journalEntries: [],
    journalLines: [],
    auditLogs: [],
  };

  const createClient = () => ({
    query: async (text, params = []) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
        return { rows: [] };
      }

      // 1. Recurring expenses query
      if (sql.includes('FROM biz_recurring_expenses') && sql.includes('next_due_date <=')) {
        const [businessId, asOfDate] = params;
        const matching = Array.from(db.recurringExpenses.values()).filter(
          (r) => r.business_id === businessId && r.status === 'active' && r.next_due_date <= asOfDate
        );
        return { rows: matching };
      }

      if (sql.includes('INSERT INTO biz_recurring_expenses')) {
        const id = 'rec_' + crypto.randomUUID().slice(0, 8);
        const record = {
          id,
          business_id: params[0],
          branch_id: params[1],
          supplier_id: params[2],
          category_account_id: params[3],
          payment_account_id: params[4],
          title: params[5],
          category: params[6],
          vendor: params[7],
          amount_minor: params[8],
          frequency: params[9],
          interval_count: params[10],
          start_date: params[11],
          end_date: params[12],
          next_due_date: params[13],
          due_days_after: params[14],
          auto_pay: params[15],
          payment_method: params[16],
          status: 'active',
          notes: params[17],
          created_by: params[18],
        };
        db.recurringExpenses.set(id, record);
        return { rows: [record] };
      }

      if (sql.includes('UPDATE biz_recurring_expenses SET')) {
        const id = params[1];
        const record = db.recurringExpenses.get(id);
        if (record) {
          for (let i = 2; i < params.length; i++) {
            const paramPlaceholder = `$${i + 1}`;
            if (sql.includes(`next_due_date = ${paramPlaceholder}`)) {
              record.next_due_date = params[i];
            }
            if (sql.includes(`status = ${paramPlaceholder}`)) {
              record.status = params[i];
            }
          }
        }
        return { rows: [record] };
      }

      // 2. Occurrences lookup
      if (sql.includes('FROM biz_recurring_expense_occurrences') && sql.includes('period_key = $3')) {
        const [, recId, periodKey] = params;
        const occ = Array.from(db.recurringOccurrences.values()).find(
          (o) => o.recurring_expense_id === recId && o.period_key === periodKey
        );
        return { rows: occ ? [occ] : [] };
      }

      if (sql.includes('INSERT INTO biz_recurring_expense_occurrences')) {
        const id = 'occ_' + crypto.randomUUID().slice(0, 8);
        const occ = {
          id,
          business_id: params[0],
          recurring_expense_id: params[1],
          expense_id: params[2],
          period_key: params[3],
          occurrence_date: params[4],
          due_date: params[5],
          amount_minor: params[6],
          status: params[7],
        };
        db.recurringOccurrences.set(id, occ);
        return { rows: [occ] };
      }

      // 3. Biz expenses insert
      if (sql.includes('INSERT INTO biz_expenses')) {
        const id = 'exp_' + crypto.randomUUID().slice(0, 8);
        const exp = {
          id,
          business_id: params[0],
          branch_id: params[1],
          category_account_id: params[2],
          title: params[3],
          category: params[4],
          amount_minor: params[5],
          date: params[6],
          payment_method: params[7],
          payment_account_id: params[8],
          paid_amount_minor: params[9],
          status: params[10],
          vendor: params[11],
          notes: params[12],
          created_by: params[13],
        };
        db.expenses.set(id, exp);
        return { rows: [exp] };
      }

      // 4. Accounts lookups
      if (sql.includes('FROM biz_accounts WHERE business_id = $1 AND id = $2')) {
        const [, accId] = params;
        const acc = Array.from(db.accounts.values()).find((a) => a.id === accId);
        return { rows: acc ? [acc] : [] };
      }

      if (sql.includes('FROM biz_accounts WHERE business_id = $1 AND code = $2')) {
        const [, code] = params;
        const acc = Array.from(db.accounts.values()).find((a) => a.code === code);
        return { rows: acc ? [acc] : [] };
      }

      if (sql.includes('FROM biz_accounts WHERE business_id = $1 AND subtype = $2')) {
        const [, subtype] = params;
        const acc = Array.from(db.accounts.values()).find((a) => a.subtype === subtype);
        return { rows: acc ? [acc] : [] };
      }

      // 5. Supplier update
      if (sql.includes('UPDATE biz_suppliers') && sql.includes('current_balance_minor = current_balance_minor + $1')) {
        const [amountStr, supId] = params;
        const sup = db.suppliers.get(supId);
        if (sup) {
          sup.current_balance_minor = (BigInt(sup.current_balance_minor) + BigInt(amountStr)).toString();
        }
        return { rows: [sup] };
      }

      // 6. Audit logs
      if (sql.includes('INSERT INTO biz_audit_logs')) {
        db.auditLogs.push(params);
        return { rows: [] };
      }

      return { rows: [] };
    },
    release: () => {},
  });

  return { db, createClient };
}

test('Recurring Business Expenses - Date math and period keys', () => {
  const { computeNextRecurringDate, computeRecurringPeriodKey } = BusinessService;

  // Monthly clamping on month end (Jan 31 -> Feb 28)
  const feb28 = computeNextRecurringDate('2026-01-31', 'monthly', 1);
  assert.equal(feb28, '2026-02-28');

  // Leap year monthly clamping (Jan 31 2028 -> Feb 29 2028)
  const feb29 = computeNextRecurringDate('2028-01-31', 'monthly', 1);
  assert.equal(feb29, '2028-02-29');

  // Quarterly clamping (Mar 31 -> Jun 30)
  const jun30 = computeNextRecurringDate('2026-03-31', 'quarterly', 1);
  assert.equal(jun30, '2026-06-30');

  // Daily interval math
  const nextDaily = computeNextRecurringDate('2026-10-15', 'daily', 3);
  assert.equal(nextDaily, '2026-10-18');

  // Weekly interval math
  const nextWeekly = computeNextRecurringDate('2026-10-01', 'weekly', 2);
  assert.equal(nextWeekly, '2026-10-15');

  // Period key formats
  assert.equal(computeRecurringPeriodKey('2026-10-19', 'monthly'), '2026-10');
  assert.equal(computeRecurringPeriodKey('2026-10-19', 'quarterly'), '2026-Q4');
  assert.equal(computeRecurringPeriodKey('2026-10-19', 'yearly'), '2026');
  assert.equal(computeRecurringPeriodKey('2026-10-19', 'daily'), '2026-10-19');
});

test('Recurring Expenses - Unpaid Accrued Bill posts Dr Expense and Cr AP with Khata balance update', async () => {
  const { db, createClient } = createMockDb();
  const client = createClient();

  // Create active monthly rent schedule (Auto-pay: FALSE)
  db.recurringExpenses.set('rec_rent', {
    id: 'rec_rent',
    business_id: 'biz_01',
    category_account_id: 'acc_rent',
    supplier_id: 'sup_office',
    title: 'Head Office Monthly Rent',
    category: 'Rent',
    vendor: 'Office Landlord',
    amount_minor: '15000000', // Rs 150,000.00
    frequency: 'monthly',
    interval_count: 1,
    start_date: '2026-10-01',
    next_due_date: '2026-10-01',
    due_days_after: 5,
    auto_pay: false,
    payment_method: 'unpaid',
    status: 'active',
  });

  const originalPostJournalEntry = AccountingEngine.postJournalEntry;
  AccountingEngine.postJournalEntry = async (_client, entry) => {
    db.journalEntries.push(entry);
    return { id: 'je_' + crypto.randomUUID().slice(0, 8), ...entry };
  };

  try {
    const occurrences = await BusinessService.generateRecurringExpenseOccurrences(
      'biz_01',
      'user_mgr',
      { asOfDate: '2026-10-05' },
      client
    );

    assert.equal(occurrences.length, 1);
    const occ = occurrences[0];
    assert.equal(occ.period_key, '2026-10');
    assert.equal(occ.occurrence_date, '2026-10-01');
    assert.equal(occ.due_date, '2026-10-06'); // 5 days after
    assert.equal(occ.status, 'generated');

    // Verify created expense
    assert.equal(db.expenses.size, 1);
    const exp = Array.from(db.expenses.values())[0];
    assert.equal(exp.status, 'unpaid');
    assert.equal(exp.paid_amount_minor, '0');

    // Verify double-entry general ledger posting
    assert.equal(db.journalEntries.length, 1);
    const je = db.journalEntries[0];
    assert.equal(je.entryType, 'expense');
    assert.equal(je.lines.length, 2);

    const drLine = je.lines.find((l) => BigInt(l.debitMinor) > 0n);
    const crLine = je.lines.find((l) => BigInt(l.creditMinor) > 0n);

    assert.equal(drLine.accountId, 'acc_rent'); // Dr Rent Expense
    assert.equal(drLine.debitMinor, '15000000');
    assert.equal(crLine.accountId, 'acc_ap');   // Cr Accounts Payable (Accrued)
    assert.equal(crLine.creditMinor, '15000000');

    // Double-entry balancing invariant
    assert.equal(BigInt(drLine.debitMinor), BigInt(crLine.creditMinor));

    // Verify supplier khata liability increased
    const supplier = db.suppliers.get('sup_office');
    assert.equal(supplier.current_balance_minor, '15000000');

    // Verify next due date was advanced to next month (2026-11-01)
    const updatedRec = db.recurringExpenses.get('rec_rent');
    assert.equal(updatedRec.next_due_date, '2026-11-01');
  } finally {
    AccountingEngine.postJournalEntry = originalPostJournalEntry;
  }
});

test('Recurring Expenses - Auto-pay posts Dr Expense and Cr Bank/Cash directly', async () => {
  const { db, createClient } = createMockDb();
  const client = createClient();

  // Create active utility schedule (Auto-pay: TRUE via Bank)
  db.recurringExpenses.set('rec_util', {
    id: 'rec_util',
    business_id: 'biz_01',
    category_account_id: 'acc_util',
    payment_account_id: 'acc_bank',
    title: 'Electricity Utility Bill',
    category: 'Utilities',
    vendor: 'LESCO',
    amount_minor: '4500000', // Rs 45,000.00
    frequency: 'monthly',
    interval_count: 1,
    start_date: '2026-10-10',
    next_due_date: '2026-10-10',
    due_days_after: 0,
    auto_pay: true,
    payment_method: 'bank',
    status: 'active',
  });

  const originalPostJournalEntry = AccountingEngine.postJournalEntry;
  AccountingEngine.postJournalEntry = async (_client, entry) => {
    db.journalEntries.push(entry);
    return { id: 'je_' + crypto.randomUUID().slice(0, 8), ...entry };
  };

  try {
    const occurrences = await BusinessService.generateRecurringExpenseOccurrences(
      'biz_01',
      'user_mgr',
      { asOfDate: '2026-10-10' },
      client
    );

    assert.equal(occurrences.length, 1);
    const occ = occurrences[0];
    assert.equal(occ.status, 'paid');

    // Verify expense is marked paid
    const exp = Array.from(db.expenses.values())[0];
    assert.equal(exp.status, 'paid');
    assert.equal(exp.paid_amount_minor, '4500000');

    // Verify double-entry posting
    assert.equal(db.journalEntries.length, 1);
    const je = db.journalEntries[0];
    const drLine = je.lines.find((l) => BigInt(l.debitMinor) > 0n);
    const crLine = je.lines.find((l) => BigInt(l.creditMinor) > 0n);

    assert.equal(drLine.accountId, 'acc_util'); // Dr Utility Expense
    assert.equal(drLine.debitMinor, '4500000');
    assert.equal(crLine.accountId, 'acc_bank'); // Cr Bank
    assert.equal(crLine.creditMinor, '4500000');

    assert.equal(BigInt(drLine.debitMinor), BigInt(crLine.creditMinor));
  } finally {
    AccountingEngine.postJournalEntry = originalPostJournalEntry;
  }
});

test('Recurring Expenses - Deduplication invariant prevents duplicate occurrences for same period', async () => {
  const { db, createClient } = createMockDb();
  const client = createClient();

  db.recurringExpenses.set('rec_rent', {
    id: 'rec_rent',
    business_id: 'biz_01',
    category_account_id: 'acc_rent',
    title: 'Head Office Rent',
    category: 'Rent',
    amount_minor: '15000000',
    frequency: 'monthly',
    interval_count: 1,
    start_date: '2026-10-01',
    next_due_date: '2026-10-01',
    auto_pay: false,
    status: 'active',
  });

  const originalPostJournalEntry = AccountingEngine.postJournalEntry;
  AccountingEngine.postJournalEntry = async (_client, entry) => {
    db.journalEntries.push(entry);
    return { id: 'je_' + crypto.randomUUID().slice(0, 8), ...entry };
  };

  try {
    // 1st run: generates occurrence for 2026-10
    const firstRun = await BusinessService.generateRecurringExpenseOccurrences(
      'biz_01',
      'user_mgr',
      { asOfDate: '2026-10-01' },
      client
    );
    assert.equal(firstRun.length, 1);
    assert.equal(db.journalEntries.length, 1);

    // Reset date back to 2026-10-01 to simulate re-running scheduler for same date
    const rec = db.recurringExpenses.get('rec_rent');
    rec.next_due_date = '2026-10-01';

    // 2nd run: should detect period_key '2026-10' already exists and skip duplicate creation
    const secondRun = await BusinessService.generateRecurringExpenseOccurrences(
      'biz_01',
      'user_mgr',
      { asOfDate: '2026-10-01' },
      client
    );
    assert.equal(secondRun.length, 0);
    // Journal entries must remain exactly 1 (no duplicate posting!)
    assert.equal(db.journalEntries.length, 1);
  } finally {
    AccountingEngine.postJournalEntry = originalPostJournalEntry;
  }
});

test('Recurring Expenses - End date boundary auto-completes status when schedule expires', async () => {
  const { db, createClient } = createMockDb();
  const client = createClient();

  // Schedule with end_date equal to current occurrence date
  db.recurringExpenses.set('rec_short', {
    id: 'rec_short',
    business_id: 'biz_01',
    category_account_id: 'acc_rent',
    title: 'Short Term Lease',
    category: 'Rent',
    amount_minor: '10000000',
    frequency: 'monthly',
    interval_count: 1,
    start_date: '2026-10-01',
    next_due_date: '2026-10-01',
    end_date: '2026-10-15', // Expires in Oct 2026
    auto_pay: false,
    status: 'active',
  });

  const originalPostJournalEntry = AccountingEngine.postJournalEntry;
  AccountingEngine.postJournalEntry = async () => ({ id: 'je_1' });

  try {
    const run = await BusinessService.generateRecurringExpenseOccurrences(
      'biz_01',
      'user_mgr',
      { asOfDate: '2026-10-01' },
      client
    );
    assert.equal(run.length, 1);

    // After advancing to 2026-11-01, next_due_date > end_date, so status becomes 'completed'
    const rec = db.recurringExpenses.get('rec_short');
    assert.equal(rec.next_due_date, '2026-11-01');
    assert.equal(rec.status, 'completed');
  } finally {
    AccountingEngine.postJournalEntry = originalPostJournalEntry;
  }
});

