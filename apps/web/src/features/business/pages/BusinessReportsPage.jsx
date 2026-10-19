import { useEffect, useState } from 'react';
import {
  FileText,
  TrendingUp,
  DollarSign,
  Calendar,
  Scale,
  CheckCircle2,
  Download,
  Building2,
  Activity,
  BookOpen,
} from 'lucide-react';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { formatRs } from '../../../shared/utils/money';

export default function BusinessReportsPage() {
  const { activeBusinessId } = useBusiness();
  const [reportType, setReportType] = useState('pnl'); // 'pnl' | 'balance_sheet' | 'cash_flow' | 'trial_balance' | 'general_ledger'
  const [pnl, setPnl] = useState(null);
  const [balanceSheet, setBalanceSheet] = useState(null);
  const [cashFlow, setCashFlow] = useState(null);
  const [trialBalance, setTrialBalance] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [ledgerStatement, setLedgerStatement] = useState(null);
  const [loading, setLoading] = useState(true);

  // Date filters
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Load all accounts for the GL selector
  useEffect(() => {
    if (!activeBusinessId) return;
    businessApi.listAccounts(activeBusinessId).then((accs) => {
      setAccounts(accs || []);
      if (accs && accs.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accs[0].id);
      }
    }).catch(console.error);
  }, [activeBusinessId]);

  const fetchReports = () => {
    if (!activeBusinessId) return;
    setLoading(true);

    if (reportType === 'pnl') {
      businessApi
        .getProfitAndLoss(activeBusinessId, { fromDate, toDate })
        .then(setPnl)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else if (reportType === 'balance_sheet') {
      businessApi
        .getBalanceSheet(activeBusinessId, { asOfDate: toDate })
        .then(setBalanceSheet)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else if (reportType === 'cash_flow') {
      businessApi
        .getCashFlow(activeBusinessId, { fromDate, toDate })
        .then(setCashFlow)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else if (reportType === 'trial_balance') {
      businessApi
        .getTrialBalance(activeBusinessId, { asOfDate: toDate })
        .then(setTrialBalance)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else if (reportType === 'general_ledger') {
      if (!selectedAccountId) {
        setLoading(false);
        return;
      }
      businessApi
        .getGeneralLedgerAccount(activeBusinessId, selectedAccountId, { fromDate, toDate })
        .then(setLedgerStatement)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    fetchReports();
  }, [activeBusinessId, reportType, fromDate, toDate, selectedAccountId]);

  // CSV Exporter
  const handleExportCsv = () => {
    const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    let rows = [];

    if (reportType === 'pnl' && pnl) {
      rows = [
        ['Profit & Loss Statement'],
        ['Period', `${fromDate} to ${toDate}`],
        [],
        ['Operating Revenue', 'Amount (Rs)'],
        ['Gross Sales', formatRs(pnl.revenue.grossSales)],
        ['Less: Sales Discounts', formatRs(pnl.revenue.salesDiscounts)],
        ['Net Sales Revenue', formatRs(pnl.revenue.netSales)],
        [],
        ['Cost of Goods Sold (COGS)', formatRs(pnl.cogs)],
        ['Gross Profit', formatRs(pnl.grossProfit)],
        ['Gross Margin %', `${pnl.grossMarginPct}%`],
        [],
        ['Operating Expenses'],
        ...pnl.expenseBreakdown.map((exp) => [exp.name, formatRs(exp.amountMinor)]),
        ['Total Operating Expenses', formatRs(pnl.operatingExpenses)],
        [],
        ['NET CLEAN PROFIT', formatRs(pnl.netProfit)],
        ['Net Profit Margin %', `${pnl.netMarginPct}%`],
      ];
    } else if (reportType === 'balance_sheet' && balanceSheet) {
      rows = [
        ['Balance Sheet Statement'],
        ['As of Date', toDate],
        [],
        ['Assets', 'Code', 'Balance (Rs)'],
        ...balanceSheet.assets.map((a) => [a.name, a.code, formatRs(a.balanceMinor)]),
        ['TOTAL ASSETS', '', formatRs(balanceSheet.totalAssetsMinor)],
        [],
        ['Liabilities', 'Code', 'Balance (Rs)'],
        ...balanceSheet.liabilities.map((l) => [l.name, l.code, formatRs(l.balanceMinor)]),
        ['TOTAL LIABILITIES', '', formatRs(balanceSheet.totalLiabilitiesMinor)],
        [],
        ['Equity', 'Code', 'Balance (Rs)'],
        ...balanceSheet.equity.map((e) => [e.name, e.code, formatRs(e.balanceMinor)]),
        ['Current Period Net Income / Retained Earnings', '', formatRs(balanceSheet.currentPeriodNetIncomeMinor)],
        ['TOTAL EQUITY', '', formatRs(balanceSheet.totalEquityMinor)],
        [],
        ['TOTAL LIABILITIES & EQUITY', '', formatRs(balanceSheet.totalLiabilitiesAndEquityMinor)],
      ];
    } else if (reportType === 'cash_flow' && cashFlow) {
      rows = [
        ['Cash Flow Statement'],
        ['Period', `${fromDate} to ${toDate}`],
        [],
        ['Operating Activities', 'Amount (Rs)'],
        ['Cash Receipts from Customers', formatRs(cashFlow.operatingActivities.cashFromSales)],
        ['Cash Paid to Suppliers', `-${formatRs(cashFlow.operatingActivities.cashToSuppliers)}`],
        ['Cash Paid for Operating Expenses', `-${formatRs(cashFlow.operatingActivities.cashForExpenses)}`],
        ['Net Cash Flow from Operations', formatRs(cashFlow.operatingActivities.netOperatingCash)],
        [],
        ['Financing Activities', 'Amount (Rs)'],
        ['Owner Capital Injected', formatRs(cashFlow.financingActivities.ownerCapitalInjected)],
        ['Owner Drawings / Withdrawals', `-${formatRs(cashFlow.financingActivities.ownerDrawings)}`],
        ['Net Cash Flow from Financing', formatRs(cashFlow.financingActivities.netFinancingCash)],
        [],
        ['NET OVERALL CASH FLOW', formatRs(cashFlow.netCashFlow)],
      ];
    } else if (reportType === 'trial_balance' && trialBalance) {
      rows = [
        ['Trial Balance'],
        ['As of Date', toDate],
        [],
        ['Account Code', 'Account Name', 'Type', 'Debit (Rs)', 'Credit (Rs)'],
        ...trialBalance.accounts.map((a) => {
          const isDebitNormal = a.type === 'asset' || a.type === 'expense';
          return [
            a.code,
            a.name,
            a.type,
            isDebitNormal && Number(a.netBalance) > 0 ? formatRs(a.netBalance) : '',
            !isDebitNormal && Number(a.netBalance) > 0 ? formatRs(a.netBalance) : '',
          ];
        }),
        [],
        ['Total Debits & Credits', '', '', formatRs(trialBalance.totalDebit), formatRs(trialBalance.totalCredit)],
      ];
    } else if (reportType === 'general_ledger' && ledgerStatement) {
      rows = [
        ['General Ledger Account Statement'],
        ['Account', `${ledgerStatement.account.name} (${ledgerStatement.account.code})`],
        ['Period', `${fromDate} to ${toDate}`],
        ['Opening Balance', formatRs(ledgerStatement.openingBalanceMinor)],
        [],
        ['Date', 'Entry #', 'Type', 'Narration', 'Debit (Rs)', 'Credit (Rs)', 'Running Balance (Rs)'],
        ...ledgerStatement.lines.map((l) => [
          l.date,
          l.entryNumber,
          l.entryType,
          l.narration || '',
          formatRs(l.debitMinor),
          formatRs(l.creditMinor),
          formatRs(l.runningBalanceMinor),
        ]),
        [],
        ['Closing Balance', '', '', '', '', '', formatRs(ledgerStatement.closingBalanceMinor)],
      ];
    }

    if (!rows.length) return;
    const blob = new Blob(
      ['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hisabkikitab-${reportType}-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Financial Statements & General Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enterprise double-entry reporting, Balance Sheet, Cash Flow, and General Ledger statements.
          </p>
        </div>

        {/* Action Bar: Dates & CSV Download */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="hw-input text-xs"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="hw-input text-xs"
            />
          </div>

          <Button variant="secondary" onClick={handleExportCsv} className="text-xs">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setReportType('pnl')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            reportType === 'pnl'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <TrendingUp className="h-4 w-4" /> Profit & Loss
        </button>
        <button
          type="button"
          onClick={() => setReportType('balance_sheet')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            reportType === 'balance_sheet'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 className="h-4 w-4" /> Balance Sheet
        </button>
        <button
          type="button"
          onClick={() => setReportType('cash_flow')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            reportType === 'cash_flow'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Activity className="h-4 w-4" /> Cash Flow
        </button>
        <button
          type="button"
          onClick={() => setReportType('trial_balance')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            reportType === 'trial_balance'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Scale className="h-4 w-4" /> Trial Balance
        </button>
        <button
          type="button"
          onClick={() => setReportType('general_ledger')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            reportType === 'general_ledger'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BookOpen className="h-4 w-4" /> General Ledger
        </button>
      </div>

      {/* 1. Profit & Loss Report View */}
      {reportType === 'pnl' && pnl && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <span className="text-xs font-semibold text-slate-500">Net Sales Revenue</span>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatRs(pnl.revenue.netSales)}
              </p>
            </Card>

            <Card className="p-4">
              <span className="text-xs font-semibold text-slate-500">Gross Profit (Margin: {pnl.grossMarginPct}%)</span>
              <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatRs(pnl.grossProfit)}
              </p>
            </Card>

            <Card className="p-4">
              <span className="text-xs font-semibold text-slate-500">Net Clean Profit (Margin: {pnl.netMarginPct}%)</span>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatRs(pnl.netProfit)}
              </p>
            </Card>
          </div>

          <Card className="overflow-hidden p-6">
            <div className="border-b border-slate-200 pb-4 text-center dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Profit & Loss Statement</h3>
              <p className="text-xs text-slate-500">For the period: {fromDate} to {toDate}</p>
            </div>

            <div className="mt-6 space-y-4 text-sm">
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Operating Revenue</h4>
                <div className="flex justify-between pl-4">
                  <span>Gross Product Sales</span>
                  <span className="font-medium">{formatRs(pnl.revenue.grossSales)}</span>
                </div>
                {Number(pnl.revenue.salesDiscounts) > 0 && (
                  <div className="flex justify-between pl-4 text-rose-500">
                    <span>Less: Sales Discounts</span>
                    <span>-{formatRs(pnl.revenue.salesDiscounts)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-100 pl-4 pt-1 font-semibold dark:border-slate-800">
                  <span>Net Sales</span>
                  <span>{formatRs(pnl.revenue.netSales)}</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Cost of Goods Sold</h4>
                <div className="flex justify-between pl-4 text-rose-600 dark:text-rose-400">
                  <span>Cost of Products Sold (Inventory Cost)</span>
                  <span className="font-medium">-{formatRs(pnl.cogs)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pl-4 pt-1 font-bold text-emerald-700 dark:border-slate-800 dark:text-emerald-300">
                  <span>Gross Profit</span>
                  <span>{formatRs(pnl.grossProfit)}</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Operating Expenses & Overheads</h4>
                {pnl.expenseBreakdown.map((exp) => (
                  <div key={exp.code} className="flex justify-between pl-4 text-slate-600 dark:text-slate-400">
                    <span>{exp.name}</span>
                    <span>{formatRs(exp.amountMinor)}</span>
                  </div>
                ))}
                {!pnl.expenseBreakdown.length && (
                  <div className="pl-4 text-xs text-slate-400">No operating expenses recorded in this period.</div>
                )}
                <div className="flex justify-between border-t border-slate-100 pl-4 pt-1 font-semibold text-rose-600 dark:border-slate-800 dark:text-rose-400">
                  <span>Total Operating Expenses</span>
                  <span>-{formatRs(pnl.operatingExpenses)}</span>
                </div>
              </div>

              <div className="border-t-2 border-slate-900 pt-3 dark:border-slate-100">
                <div className="flex justify-between text-base font-extrabold text-slate-900 dark:text-slate-100">
                  <span>NET PROFIT (Safi Nafa)</span>
                  <span className="text-emerald-700 dark:text-emerald-400">{formatRs(pnl.netProfit)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 2. Balance Sheet View */}
      {reportType === 'balance_sheet' && balanceSheet && (
        <Card className="overflow-hidden p-6">
          <div className="border-b border-slate-200 pb-4 text-center dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Balance Sheet Statement</h3>
            <p className="text-xs text-slate-500">As of: {balanceSheet.asOfDate}</p>
            {balanceSheet.isBalanced && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Double-Entry Verified (Assets = Liabilities + Equity)
              </span>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Assets Column */}
            <div className="space-y-4">
              <h4 className="border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:border-slate-800 dark:text-slate-100">
                Assets (Malkiat)
              </h4>
              <div className="space-y-2 text-sm">
                {balanceSheet.assets.map((a) => (
                  <div key={a.id} className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>
                      {a.name} <span className="font-mono text-xs text-slate-400">({a.code})</span>
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{formatRs(a.balanceMinor)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-bold text-slate-900 dark:border-slate-100 dark:text-slate-100">
                <span>TOTAL ASSETS</span>
                <span className="text-emerald-700 dark:text-emerald-400">{formatRs(balanceSheet.totalAssetsMinor)}</span>
              </div>
            </div>

            {/* Liabilities & Equity Column */}
            <div className="space-y-6">
              {/* Liabilities */}
              <div className="space-y-3">
                <h4 className="border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:border-slate-800 dark:text-slate-100">
                  Liabilities (Wajib-ul-Ada)
                </h4>
                <div className="space-y-2 text-sm">
                  {balanceSheet.liabilities.map((l) => (
                    <div key={l.id} className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>
                        {l.name} <span className="font-mono text-xs text-slate-400">({l.code})</span>
                      </span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{formatRs(l.balanceMinor)}</span>
                    </div>
                  ))}
                  {!balanceSheet.liabilities.length && (
                    <div className="text-xs text-slate-400">No outstanding liabilities.</div>
                  )}
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-bold dark:border-slate-800">
                  <span>Total Liabilities</span>
                  <span>{formatRs(balanceSheet.totalLiabilitiesMinor)}</span>
                </div>
              </div>

              {/* Equity */}
              <div className="space-y-3">
                <h4 className="border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:border-slate-800 dark:text-slate-100">
                  Equity & Retained Earnings
                </h4>
                <div className="space-y-2 text-sm">
                  {balanceSheet.equity.map((e) => (
                    <div key={e.id} className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>
                        {e.name} <span className="font-mono text-xs text-slate-400">({e.code})</span>
                      </span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{formatRs(e.balanceMinor)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Current Period Net Earnings</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {formatRs(balanceSheet.currentPeriodNetIncomeMinor)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-bold dark:border-slate-800">
                  <span>Total Equity</span>
                  <span>{formatRs(balanceSheet.totalEquityMinor)}</span>
                </div>
              </div>

              <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-bold text-slate-900 dark:border-slate-100 dark:text-slate-100">
                <span>TOTAL LIABILITIES & EQUITY</span>
                <span className="text-emerald-700 dark:text-emerald-400">
                  {formatRs(balanceSheet.totalLiabilitiesAndEquityMinor)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 3. Cash Flow Statement View */}
      {reportType === 'cash_flow' && cashFlow && (
        <Card className="overflow-hidden p-6">
          <div className="border-b border-slate-200 pb-4 text-center dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Cash Flow Statement</h3>
            <p className="text-xs text-slate-500">Period: {cashFlow.period.fromDate} to {cashFlow.period.toDate}</p>
          </div>

          <div className="mt-6 space-y-6 text-sm">
            {/* Operating */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Cash Flows from Operating Activities</h4>
              <div className="flex justify-between pl-4">
                <span>Cash Receipts from Product Sales</span>
                <span className="font-medium">{formatRs(cashFlow.operatingActivities.cashFromSales)}</span>
              </div>
              <div className="flex justify-between pl-4 text-rose-600 dark:text-rose-400">
                <span>Cash Paid for Inventory Purchases</span>
                <span>-{formatRs(cashFlow.operatingActivities.cashToSuppliers)}</span>
              </div>
              <div className="flex justify-between pl-4 text-rose-600 dark:text-rose-400">
                <span>Cash Paid for Operating Expenses & Overheads</span>
                <span>-{formatRs(cashFlow.operatingActivities.cashForExpenses)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pl-4 pt-1 font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100">
                <span>Net Cash from Operating Activities</span>
                <span>{formatRs(cashFlow.operatingActivities.netOperatingCash)}</span>
              </div>
            </div>

            {/* Financing */}
            <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Cash Flows from Financing Activities</h4>
              <div className="flex justify-between pl-4">
                <span>Owner Capital Contributions</span>
                <span className="font-medium">{formatRs(cashFlow.financingActivities.ownerCapitalInjected)}</span>
              </div>
              <div className="flex justify-between pl-4 text-rose-600 dark:text-rose-400">
                <span>Owner Drawings / Withdrawals</span>
                <span>-{formatRs(cashFlow.financingActivities.ownerDrawings)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pl-4 pt-1 font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100">
                <span>Net Cash from Financing Activities</span>
                <span>{formatRs(cashFlow.financingActivities.netFinancingCash)}</span>
              </div>
            </div>

            {/* Total Net Cash Flow */}
            <div className="border-t-2 border-slate-900 pt-3 dark:border-slate-100">
              <div className="flex justify-between text-base font-extrabold text-slate-900 dark:text-slate-100">
                <span>NET CHANGE IN CASH & BANK BALANCES</span>
                <span
                  className={
                    BigInt(cashFlow.netCashFlow) >= 0n
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  {formatRs(cashFlow.netCashFlow)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 4. Trial Balance View */}
      {reportType === 'trial_balance' && trialBalance && (
        <Card className="overflow-hidden p-6">
          <div className="border-b border-slate-200 pb-4 text-center dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">General Ledger Trial Balance</h3>
            <p className="text-xs text-slate-500">As of date: {toDate}</p>
            {trialBalance.isBalanced && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Perfectly Balanced (Debits = Credits)
              </span>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-bold uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Account Name</th>
                  <th className="px-4 py-2">Classification</th>
                  <th className="px-4 py-2 text-right">Debit Balance</th>
                  <th className="px-4 py-2 text-right">Credit Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {trialBalance.accounts.map((acc) => {
                  const isDebitNormal = acc.type === 'asset' || acc.type === 'expense';
                  return (
                    <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-2 font-mono font-semibold">{acc.code}</td>
                      <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{acc.name}</td>
                      <td className="px-4 py-2 uppercase text-slate-400">{acc.type}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {isDebitNormal && Number(acc.netBalance) > 0 ? formatRs(acc.netBalance) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {!isDebitNormal && Number(acc.netBalance) > 0 ? formatRs(acc.netBalance) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-900 font-bold dark:border-slate-100">
                <tr>
                  <td colSpan={3} className="px-4 py-3">Totals</td>
                  <td className="px-4 py-3 text-right">{formatRs(trialBalance.totalDebit)}</td>
                  <td className="px-4 py-3 text-right">{formatRs(trialBalance.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* 5. General Ledger View */}
      {reportType === 'general_ledger' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Select General Ledger Account:
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="hw-input max-w-sm text-xs"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} — {acc.name} ({acc.type.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          </Card>

          {ledgerStatement && (
            <Card className="overflow-hidden p-6">
              <div className="border-b border-slate-200 pb-4 text-center dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {ledgerStatement.account.name} ({ledgerStatement.account.code})
                </h3>
                <p className="text-xs text-slate-500">
                  Period: {fromDate} to {toDate} • Classification: {ledgerStatement.account.type.toUpperCase()}
                </p>
                <div className="mt-3 flex justify-center gap-6 text-xs font-semibold">
                  <span>Opening: {formatRs(ledgerStatement.openingBalanceMinor)}</span>
                  <span className="text-emerald-600">Closing: {formatRs(ledgerStatement.closingBalanceMinor)}</span>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Entry #</th>
                      <th className="px-4 py-2.5">Narration / Description</th>
                      <th className="px-4 py-2.5 text-right">Debit (Rs)</th>
                      <th className="px-4 py-2.5 text-right">Credit (Rs)</th>
                      <th className="px-4 py-2.5 text-right">Running Balance (Rs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ledgerStatement.lines.map((line) => (
                      <tr key={line.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <td className="px-4 py-2.5 font-medium">{line.date}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-500">{line.entryNumber}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{line.narration || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-slate-900 dark:text-slate-100">
                          {Number(line.debitMinor) > 0 ? formatRs(line.debitMinor) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-slate-900 dark:text-slate-100">
                          {Number(line.creditMinor) > 0 ? formatRs(line.creditMinor) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400">
                          {formatRs(line.runningBalanceMinor)}
                        </td>
                      </tr>
                    ))}
                    {!ledgerStatement.lines.length && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          No transactions recorded for this account in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
