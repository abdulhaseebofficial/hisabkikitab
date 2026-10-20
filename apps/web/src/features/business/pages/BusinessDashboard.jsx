import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Receipt,
  AlertTriangle,
  Wallet,
  ShoppingBag,
  Users,
  Building,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Boxes,
  Store,
} from 'lucide-react';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { formatRs } from '../../../shared/utils/money';

export default function BusinessDashboard() {
  const { activeBusiness, activeBusinessId, openOnboarding } = useBusiness();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeBusinessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    businessApi
      .getDashboard(activeBusinessId)
      .then((data) => setSummary(data))
      .catch((err) => console.error('[dashboard] Failed to load business metrics:', err))
      .finally(() => setLoading(false));
  }, [activeBusinessId]);

  if (!activeBusinessId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-canvas-darkCard">
        <Store className="h-16 w-16 text-emerald-600 dark:text-emerald-400" />
        <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">Welcome to HisabKi Kitab Business Mode</h2>
        <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Manage your retail shop, wholesale agency, or service business with double-entry accounting, inventory, POS, customer khata, and profit tracking.
        </p>
        <Button onClick={openOnboarding} className="mt-6 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4" /> Create Your First Business
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Business Mode
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {activeBusiness?.city || 'Pakistan'} • {activeBusiness?.currency || 'PKR'}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {activeBusiness?.name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/business/pos">
            <Button className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <ShoppingBag className="h-4 w-4" /> Open POS
            </Button>
          </Link>
          <Link to="/business/sales">
            <Button variant="secondary" className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> New Sale
            </Button>
          </Link>
          <Link to="/business/expenses">
            <Button variant="secondary" className="flex items-center gap-1.5">
              <Receipt className="h-4 w-4" /> Add Expense
            </Button>
          </Link>
        </div>
      </div>

      {/* Smart Alerts */}
      {summary && summary.lowStockCount > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium">
              You have <strong>{summary.lowStockCount}</strong> product(s) below minimum stock level.
            </span>
          </div>
          <Link to="/business/inventory?filter=low" className="text-xs font-semibold text-amber-700 underline hover:text-amber-800 dark:text-amber-300">
            View Inventory
          </Link>
        </div>
      )}

      {/* Primary KPI Metric Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Today's Sales */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Today's Sales</span>
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-100">
            {formatRs(summary?.todaySales || 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Collected: {formatRs(summary?.todayCollected || 0)}
          </p>
        </Card>

        {/* Cash in Hand */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Cash in Hand</span>
            <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-100">
            {formatRs(summary?.cashBalance || 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Bank: {formatRs(summary?.bankBalance || 0)}
          </p>
        </Card>

        {/* Customer Receivables (Khata) */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Customer Receivables</span>
            <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-100">
            {formatRs(summary?.totalReceivables || 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Market Khata (Paisa Lena Hai)
          </p>
        </Card>

        {/* Supplier Payables */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Supplier Payables</span>
            <ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-rose-600 sm:text-2xl dark:text-rose-400">
            {formatRs(summary?.totalPayables || 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Wajib-ul-Ada (Dena Hai)
          </p>
        </Card>
      </div>

      {/* Operational Highlights */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Monthly Summary */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Monthly Performance</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Monthly Sales:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{formatRs(summary?.monthSales || 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Monthly Expenses:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{formatRs(summary?.monthExpenses || 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-slate-100 pt-2 dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-400">Inventory Valuation:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatRs(summary?.inventoryValuation || 0)}</span>
            </div>
          </div>
          <div className="mt-5">
            <Link to="/business/reports" className="block text-center text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
              Open Full Profit & Loss Report →
            </Link>
          </div>
        </Card>

        {/* Quick Nav Tiles */}
        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <Link to="/business/khata" className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:shadow-md dark:border-slate-800 dark:bg-canvas-darkCard">
            <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            <div className="mt-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Customer & Supplier Khata</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Digital ledger, balances, statements</p>
            </div>
          </Link>

          <Link to="/business/inventory" className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:shadow-md dark:border-slate-800 dark:bg-canvas-darkCard">
            <Boxes className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <div className="mt-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Inventory & Products</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">SKUs, pricing, stock adjustments</p>
            </div>
          </Link>

          <Link to="/business/accounts" className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:shadow-md dark:border-slate-800 dark:bg-canvas-darkCard">
            <div className="flex items-center justify-between">
              <Wallet className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800">
                Desktop
              </span>
            </div>
            <div className="mt-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Accounts & Transfers</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Cash, banks, owner capital & drawings</p>
            </div>
          </Link>

          <Link to="/business/reports" className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:shadow-md dark:border-slate-800 dark:bg-canvas-darkCard">
            <div className="flex items-center justify-between">
              <FileText className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800">
                Desktop
              </span>
            </div>
            <div className="mt-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Financial Reports</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">P&L, Trial Balance, Aging</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
