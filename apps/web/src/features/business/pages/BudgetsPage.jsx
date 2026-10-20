import { useEffect, useState } from 'react';
import { Target, Plus, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { formatRs } from '../../../shared/utils/money';
import { allowOnlyNumbers, sanitizeNumericString } from '../../../shared/utils/inputs';

export default function BudgetsPage() {
  const { activeBusinessId } = useBusiness();
  const [budgets, setBudgets] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Period filter (e.g., 2026-10)
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  // Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [categoryAccountId, setCategoryAccountId] = useState('');
  const [targetAmountRs, setTargetAmountRs] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchBudgets = () => {
    if (!activeBusinessId) return;
    setLoading(true);
    Promise.all([
      businessApi.listBudgets(activeBusinessId, { period }),
      businessApi.listAccounts(activeBusinessId),
    ])
      .then(([bList, accList]) => {
        setBudgets(bList || []);
        // Only expense accounts for budgeting
        setAccounts((accList || []).filter((a) => a.type === 'expense'));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBudgets();
  }, [activeBusinessId, period]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) return toast.error('Budget title is required');
    if (!categoryAccountId) return toast.error('Expense category account is required');
    if (Number(targetAmountRs) <= 0) return toast.error('Target amount must be greater than 0');

    setSaving(true);
    try {
      await businessApi.createBudget(activeBusinessId, {
        title: title.trim(),
        period,
        categoryAccountId,
        targetAmountMinor: Math.round(Number(targetAmountRs) * 100),
        notes: notes.trim(),
      });
      toast.success('Budget created successfully');
      setCreateOpen(false);
      setTitle('');
      setCategoryAccountId('');
      setTargetAmountRs('');
      setNotes('');
      fetchBudgets();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to create budget');
    } finally {
      setSaving(false);
    }
  };

  const totalBudgetMinor = budgets.reduce((sum, b) => sum + Number(b.target_amount_minor || 0), 0);
  const totalSpentMinor = budgets.reduce((sum, b) => sum + Number(b.actual_spent_minor || 0), 0);
  const overallUtilizationPct = totalBudgetMinor > 0 ? Math.round((totalSpentMinor / totalBudgetMinor) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Business Budgets & Cost Controls
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Set expense category targets and monitor live burn against general ledger postings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="hw-input text-xs"
          />
          <Button variant="primary" onClick={() => setCreateOpen(true)} className="text-xs">
            <Plus className="mr-1.5 h-4 w-4" /> New Budget
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <span className="text-xs font-semibold text-slate-500">Allocated Budget ({period})</span>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{formatRs(totalBudgetMinor)}</p>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-semibold text-slate-500">Actual Spent (Posted to GL)</span>
          <p className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">{formatRs(totalSpentMinor)}</p>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-semibold text-slate-500">Budget Consumption</span>
          <div className="mt-1 flex items-baseline gap-2">
            <p
              className={`text-2xl font-bold ${
                overallUtilizationPct > 100
                  ? 'text-rose-600'
                  : overallUtilizationPct > 80
                  ? 'text-amber-500'
                  : 'text-emerald-600'
              }`}
            >
              {overallUtilizationPct}%
            </p>
            <span className="text-xs text-slate-400">
              {totalBudgetMinor >= totalSpentMinor
                ? `${formatRs(totalBudgetMinor - totalSpentMinor)} left`
                : `${formatRs(totalSpentMinor - totalBudgetMinor)} overrun`}
            </span>
          </div>
        </Card>
      </div>

      {/* Budget Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {budgets.map((b) => {
          const target = Number(b.target_amount_minor || 0);
          const spent = Number(b.actual_spent_minor || 0);
          const pct = target > 0 ? Math.round((spent / target) * 100) : 0;
          const isOver = spent > target;

          return (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">{b.title}</h3>
                  <span className="text-xs text-slate-500">{b.category_account_name || 'Operating Expense'}</span>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isOver
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                      : pct > 80
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  }`}
                >
                  {pct}% Used
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full transition-all ${
                      isOver ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                <span>Spent: {formatRs(spent)}</span>
                <span>Target: {formatRs(target)}</span>
              </div>
            </Card>
          );
        })}

        {!budgets.length && (
          <div className="col-span-full py-12 text-center text-slate-400">
            No budgets configured for {period}. Click "New Budget" to set category spending limits.
          </div>
        )}
      </div>

      {/* Create Budget Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={`Create Budget Target (${period})`}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Budget Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Monthly Marketing & Facebook Ads"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Expense Account Category</label>
            <select
              required
              value={categoryAccountId}
              onChange={(e) => setCategoryAccountId(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            >
              <option value="">Select Expense Account</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Target Monthly Cap (PKR)</label>
            <input
              type="text"
              inputMode="decimal"
              required
              placeholder="e.g. 50000"
              value={targetAmountRs}
              onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
              onChange={(e) => setTargetAmountRs(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Notes / Strategy</label>
            <input
              type="text"
              placeholder="e.g. Seasonal promotion campaign budget"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Save Target
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
