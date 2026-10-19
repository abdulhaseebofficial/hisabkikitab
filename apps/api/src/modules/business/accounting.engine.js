/**
 * Double-Entry Accounting Engine for HisabKi Kitab Business Mode.
 *
 * Core Accounting Invariants:
 * 1. Every journal entry must have at least 2 lines.
 * 2. Sum of Debits MUST strictly equal Sum of Credits (debits === credits).
 * 3. All amounts are stored in integer minor units (bigint) to avoid rounding drift.
 * 4. Assets & Expenses: Balance increases on Debit, decreases on Credit.
 * 5. Liabilities, Equity & Revenue: Balance increases on Credit, decreases on Debit.
 */

class AccountingEngine {
  /**
   * Posts a balanced journal entry atomically within the provided database transaction client.
   */
  static async postJournalEntry(client, {
    businessId,
    branchId = null,
    entryNumber,
    date,
    entryType,
    referenceType = null,
    referenceId = null,
    narration = '',
    lines = [],
    userId = null,
  }) {
    if (!client) throw new Error('AccountingEngine requires an active database client/transaction');
    if (!lines || lines.length < 2) {
      throw new Error('A journal entry must contain at least two lines');
    }

    let totalDebit = 0n;
    let totalCredit = 0n;

    for (const line of lines) {
      const d = BigInt(line.debitMinor || 0);
      const c = BigInt(line.creditMinor || 0);
      if (d < 0n || c < 0n) throw new Error('Debit and Credit amounts must be non-negative');
      if (d === 0n && c === 0n) throw new Error('Journal line must have either a debit or credit');
      totalDebit += d;
      totalCredit += c;
    }

    if (totalDebit !== totalCredit) {
      throw new Error(`Unbalanced journal entry: Total debits (${totalDebit}) do not equal total credits (${totalCredit})`);
    }

    if (totalDebit === 0n) {
      throw new Error('Journal entry cannot be for zero amount');
    }

    // 1. Insert Journal Entry Header
    const entryRes = await client.query(
      `INSERT INTO biz_journal_entries (
        business_id, branch_id, entry_number, date, entry_type,
        reference_type, reference_id, narration, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [businessId, branchId, entryNumber, date, entryType, referenceType, referenceId, narration, userId]
    );
    const entry = entryRes.rows[0];

    // 2. Insert Lines and Update Account Balances
    for (const line of lines) {
      const debit = BigInt(line.debitMinor || 0);
      const credit = BigInt(line.creditMinor || 0);

      await client.query(
        `INSERT INTO biz_journal_lines (
          journal_entry_id, account_id, debit_minor, credit_minor, description
        ) VALUES ($1, $2, $3, $4, $5)`,
        [entry.id, line.accountId, debit.toString(), credit.toString(), line.description || '']
      );

      // Fetch account type to adjust balance correctly
      const accRes = await client.query(
        `SELECT id, type FROM biz_accounts WHERE id = $1 AND business_id = $2`,
        [line.accountId, businessId]
      );
      if (!accRes.rows.length) {
        throw new Error(`Account ${line.accountId} not found in business ${businessId}`);
      }
      const acc = accRes.rows[0];

      // Assets and Expenses increase on Debit, decrease on Credit
      // Liabilities, Equity, Revenue increase on Credit, decrease on Debit
      const isDebitNormal = acc.type === 'asset' || acc.type === 'expense';
      const balanceDelta = isDebitNormal ? (debit - credit) : (credit - debit);

      await client.query(
        `UPDATE biz_accounts
         SET balance_minor = balance_minor + $1
         WHERE id = $2 AND business_id = $3`,
        [balanceDelta.toString(), line.accountId, businessId]
      );
    }

    return entry;
  }

  /**
   * Generates a balanced Trial Balance for a business as of a specific date.
   */
  static async getTrialBalance(client, businessId, asOfDate = null) {
    const params = [businessId];
    let dateFilter = '';
    if (asOfDate) {
      params.push(asOfDate);
      dateFilter = 'AND e.date <= $2';
    }

    const { rows } = await client.query(
      `SELECT
         a.id, a.code, a.name, a.type, a.subtype,
         COALESCE(SUM(l.debit_minor), 0) AS total_debit,
         COALESCE(SUM(l.credit_minor), 0) AS total_credit
       FROM biz_accounts a
       LEFT JOIN biz_journal_lines l ON l.account_id = a.id
       LEFT JOIN biz_journal_entries e ON e.id = l.journal_entry_id AND e.business_id = a.business_id ${dateFilter}
       WHERE a.business_id = $1
       GROUP BY a.id, a.code, a.name, a.type, a.subtype
       ORDER BY a.code ASC`,
      params
    );

    let sumDebit = 0n;
    let sumCredit = 0n;

    const accounts = rows.map((r) => {
      const d = BigInt(r.total_debit);
      const c = BigInt(r.total_credit);
      sumDebit += d;
      sumCredit += c;

      const isDebitNormal = r.type === 'asset' || r.type === 'expense';
      const net = isDebitNormal ? (d - c) : (c - d);

      return {
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
        subtype: r.subtype,
        totalDebit: d.toString(),
        totalCredit: c.toString(),
        netBalance: net.toString(),
      };
    });

    return {
      accounts,
      totalDebit: sumDebit.toString(),
      totalCredit: sumCredit.toString(),
      isBalanced: sumDebit === sumCredit,
    };
  }

  /**
   * Calculates Profit & Loss for a given date range.
   * Net Sales = Revenue - Returns - Discounts
   * Gross Profit = Net Sales - COGS
   * Operating Profit = Gross Profit - Operating Expenses
   * Net Profit = Operating Profit + Other Income
   */
  static async getProfitAndLoss(client, businessId, { fromDate, toDate }) {
    const { rows } = await client.query(
      `SELECT
         a.id, a.code, a.name, a.type, a.subtype,
         COALESCE(SUM(l.debit_minor), 0) AS debits,
         COALESCE(SUM(l.credit_minor), 0) AS credits
       FROM biz_accounts a
       JOIN biz_journal_lines l ON l.account_id = a.id
       JOIN biz_journal_entries e ON e.id = l.journal_entry_id
       WHERE a.business_id = $1
         AND a.type IN ('revenue', 'expense')
         AND e.date >= $2 AND e.date <= $3
       GROUP BY a.id, a.code, a.name, a.type, a.subtype
       ORDER BY a.code ASC`,
      [businessId, fromDate, toDate]
    );

    let grossSales = 0n;
    let serviceRevenue = 0n;
    let otherIncome = 0n;
    let salesDiscounts = 0n;
    let cogs = 0n;
    let operatingExpenses = 0n;

    const expenseBreakdown = [];

    for (const r of rows) {
      const debits = BigInt(r.debits);
      const credits = BigInt(r.credits);

      if (r.type === 'revenue') {
        if (r.subtype === 'sales_revenue') {
          grossSales += (credits - debits);
        } else if (r.subtype === 'service_revenue') {
          serviceRevenue += (credits - debits);
        } else if (r.subtype === 'sales_discount') {
          salesDiscounts += (debits - credits);
        } else {
          otherIncome += (credits - debits);
        }
      } else if (r.type === 'expense') {
        const netExp = debits - credits;
        if (r.subtype === 'cogs') {
          cogs += netExp;
        } else {
          operatingExpenses += netExp;
          expenseBreakdown.push({
            code: r.code,
            name: r.name,
            amountMinor: netExp.toString(),
          });
        }
      }
    }

    const netSales = grossSales + serviceRevenue - salesDiscounts;
    const grossProfit = netSales - cogs;
    const netProfit = grossProfit - operatingExpenses + otherIncome;

    return {
      period: { fromDate, toDate },
      revenue: {
        grossSales: grossSales.toString(),
        serviceRevenue: serviceRevenue.toString(),
        salesDiscounts: salesDiscounts.toString(),
        netSales: netSales.toString(),
        otherIncome: otherIncome.toString(),
      },
      cogs: cogs.toString(),
      grossProfit: grossProfit.toString(),
      operatingExpenses: operatingExpenses.toString(),
      expenseBreakdown,
      netProfit: netProfit.toString(),
      grossMarginPct: netSales > 0n ? Number((grossProfit * 10000n) / netSales) / 100 : 0,
      netMarginPct: netSales > 0n ? Number((netProfit * 10000n) / netSales) / 100 : 0,
    };
  }

  /**
   * Generates a formal Balance Sheet as of a specific date.
   * Asserts and proves: Assets = Liabilities + Equity
   */
  static async getBalanceSheet(client, businessId, asOfDate = null) {
    const params = [businessId];
    let dateFilter = '';
    if (asOfDate) {
      params.push(asOfDate);
      dateFilter = 'AND e.date <= $2';
    }

    const { rows } = await client.query(
      `SELECT
         a.id, a.code, a.name, a.type, a.subtype,
         COALESCE(SUM(l.debit_minor), 0) AS total_debit,
         COALESCE(SUM(l.credit_minor), 0) AS total_credit
       FROM biz_accounts a
       LEFT JOIN biz_journal_lines l ON l.account_id = a.id
       LEFT JOIN biz_journal_entries e ON e.id = l.journal_entry_id AND e.business_id = a.business_id ${dateFilter}
       WHERE a.business_id = $1
       GROUP BY a.id, a.code, a.name, a.type, a.subtype
       ORDER BY a.code ASC`,
      params
    );

    const assets = [];
    const liabilities = [];
    const equity = [];

    let totalAssets = 0n;
    let totalLiabilities = 0n;
    let totalEquity = 0n;

    let totalRevenue = 0n;
    let totalExpenses = 0n;

    for (const r of rows) {
      const d = BigInt(r.total_debit);
      const c = BigInt(r.total_credit);

      if (r.type === 'asset') {
        const net = d - c;
        totalAssets += net;
        assets.push({ id: r.id, code: r.code, name: r.name, subtype: r.subtype, balanceMinor: net.toString() });
      } else if (r.type === 'liability') {
        const net = c - d;
        totalLiabilities += net;
        liabilities.push({ id: r.id, code: r.code, name: r.name, subtype: r.subtype, balanceMinor: net.toString() });
      } else if (r.type === 'equity') {
        // Normal equity is credit-normal, drawings are debit-normal
        const net = r.subtype === 'owner_drawing' ? -(d - c) : (c - d);
        totalEquity += net;
        equity.push({ id: r.id, code: r.code, name: r.name, subtype: r.subtype, balanceMinor: net.toString() });
      } else if (r.type === 'revenue') {
        totalRevenue += (c - d);
      } else if (r.type === 'expense') {
        totalExpenses += (d - c);
      }
    }

    // Current period net profit/loss accrues into Equity:
    const currentPeriodNetIncome = totalRevenue - totalExpenses;
    totalEquity += currentPeriodNetIncome;
    equity.push({
      id: 'current-period-income',
      code: '3999',
      name: 'Current Period Net Earnings',
      subtype: 'current_earnings',
      balanceMinor: currentPeriodNetIncome.toString(),
    });

    const isBalanced = totalAssets === (totalLiabilities + totalEquity);
    const imbalanceMinor = totalAssets - (totalLiabilities + totalEquity);

    return {
      asOfDate: asOfDate || new Date().toISOString().split('T')[0],
      assets: {
        accounts: assets,
        totalMinor: totalAssets.toString(),
      },
      liabilities: {
        accounts: liabilities,
        totalMinor: totalLiabilities.toString(),
      },
      equity: {
        accounts: equity,
        totalMinor: totalEquity.toString(),
      },
      totalLiabilitiesAndEquityMinor: (totalLiabilities + totalEquity).toString(),
      isBalanced,
      imbalanceMinor: imbalanceMinor.toString(),
    };
  }

  /**
   * Generates a Cash Flow Statement categorized into Operating, Investing, and Financing flows.
   */
  static async getCashFlowStatement(client, businessId, { fromDate, toDate }) {
    // 1. Fetch cash accounts
    const cashAccs = await client.query(
      `SELECT id, code, name FROM biz_accounts WHERE business_id = $1 AND subtype IN ('cash', 'bank', 'wallet')`,
      [businessId]
    );
    const cashAccountIds = new Set(cashAccs.rows.map((r) => r.id));

    // 2. Fetch journal entries in date range
    const { rows } = await client.query(
      `SELECT
         e.id AS entry_id, e.date, e.entry_type, e.entry_number, e.narration,
         l.account_id, l.debit_minor, l.credit_minor,
         a.code, a.name, a.type, a.subtype
       FROM biz_journal_entries e
       JOIN biz_journal_lines l ON l.journal_entry_id = e.id
       JOIN biz_accounts a ON a.id = l.account_id
       WHERE e.business_id = $1 AND e.date >= $2 AND e.date <= $3
       ORDER BY e.date ASC, e.entry_number ASC`,
      [businessId, fromDate, toDate]
    );

    let operatingCashFlow = 0n;
    let investingCashFlow = 0n;
    let financingCashFlow = 0n;

    // Group lines by journal entry
    const entriesMap = new Map();
    for (const row of rows) {
      if (!entriesMap.has(row.entry_id)) {
        entriesMap.set(row.entry_id, []);
      }
      entriesMap.get(row.entry_id).push(row);
    }

    for (const lines of entriesMap.values()) {
      const cashLines = lines.filter((l) => cashAccountIds.has(l.account_id));
      if (!cashLines.length) continue;

      // Check if purely an internal transfer between cash accounts
      const nonCashLines = lines.filter((l) => !cashAccountIds.has(l.account_id));
      if (!nonCashLines.length) {
        // Internal transfer between cash/bank -> net impact on total cash is 0
        continue;
      }

      for (const cl of cashLines) {
        const netCashDelta = BigInt(cl.debit_minor) - BigInt(cl.credit_minor); // positive = inflow, negative = outflow

        // Classify based on non-cash counterparts
        for (const counterpart of nonCashLines) {
          if (counterpart.subtype === 'owner_equity' || counterpart.subtype === 'owner_drawing') {
            financingCashFlow += netCashDelta;
          } else if (counterpart.subtype === 'fixed_asset' || counterpart.subtype === 'investment') {
            investingCashFlow += netCashDelta;
          } else {
            // Default to Operating (Sales, Collections, Purchases, Overheads, Taxes)
            operatingCashFlow += netCashDelta;
          }
        }
      }
    }

    const netChangeInCash = operatingCashFlow + investingCashFlow + financingCashFlow;

    return {
      period: { fromDate, toDate },
      operatingActivities: {
        totalMinor: operatingCashFlow.toString(),
      },
      investingActivities: {
        totalMinor: investingCashFlow.toString(),
      },
      financingActivities: {
        totalMinor: financingCashFlow.toString(),
      },
      netChangeInCashMinor: netChangeInCash.toString(),
    };
  }

  /**
   * Retrieves the General Ledger detailed account statement with running balance.
   */
  static async getGeneralLedgerAccount(client, businessId, accountId, { fromDate, toDate }) {
    const accRes = await client.query(
      `SELECT id, code, name, type, subtype, currency FROM biz_accounts WHERE id = $1 AND business_id = $2`,
      [accountId, businessId]
    );
    if (!accRes.rows.length) throw new Error('Account not found');
    const account = accRes.rows[0];
    const isDebitNormal = account.type === 'asset' || account.type === 'expense';

    // 1. Calculate opening balance prior to fromDate
    const openRes = await client.query(
      `SELECT
         COALESCE(SUM(l.debit_minor), 0) AS total_debit,
         COALESCE(SUM(l.credit_minor), 0) AS total_credit
       FROM biz_journal_lines l
       JOIN biz_journal_entries e ON e.id = l.journal_entry_id
       WHERE e.business_id = $1 AND l.account_id = $2 AND e.date < $3`,
      [businessId, accountId, fromDate]
    );
    const openDebit = BigInt(openRes.rows[0].total_debit);
    const openCredit = BigInt(openRes.rows[0].total_credit);
    let runningBalance = isDebitNormal ? (openDebit - openCredit) : (openCredit - openDebit);

    // 2. Fetch lines in date range
    const linesRes = await client.query(
      `SELECT
         e.id AS entry_id, e.date, e.entry_number, e.entry_type, e.narration,
         l.debit_minor, l.credit_minor, l.description
       FROM biz_journal_lines l
       JOIN biz_journal_entries e ON e.id = l.journal_entry_id
       WHERE e.business_id = $1 AND l.account_id = $2 AND e.date >= $3 AND e.date <= $4
       ORDER BY e.date ASC, e.entry_number ASC, l.id ASC`,
      [businessId, accountId, fromDate, toDate]
    );

    let periodDebit = 0n;
    let periodCredit = 0n;

    const statementLines = linesRes.rows.map((row) => {
      const d = BigInt(row.debit_minor);
      const c = BigInt(row.credit_minor);
      periodDebit += d;
      periodCredit += c;

      if (isDebitNormal) {
        runningBalance += (d - c);
      } else {
        runningBalance += (c - d);
      }

      return {
        date: row.date,
        entryNumber: row.entry_number,
        entryType: row.entry_type,
        narration: row.narration || row.description,
        debitMinor: d.toString(),
        creditMinor: c.toString(),
        runningBalanceMinor: runningBalance.toString(),
      };
    });

    return {
      account,
      period: { fromDate, toDate },
      openingBalanceMinor: (isDebitNormal ? (openDebit - openCredit) : (openCredit - openDebit)).toString(),
      periodDebitMinor: periodDebit.toString(),
      periodCreditMinor: periodCredit.toString(),
      closingBalanceMinor: runningBalance.toString(),
      lines: statementLines,
    };
  }
}

module.exports = AccountingEngine;

