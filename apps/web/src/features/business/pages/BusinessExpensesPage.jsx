import { useEffect, useState } from 'react';
import { Plus, Receipt, Search, Calendar, Tag, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { formatRs } from '../../../shared/utils/money';
import { allowOnlyNumbers, sanitizeNumericString } from '../../../shared/utils/inputs';

const EXPENSE_CATEGORIES = [
  'Rent',
  'Electricity & Utilities',
  'Salaries & Wages',
  'Marketing & Advertising',
  'Transport & Fuel',
  'Maintenance & Repairs',
  'Internet & Phone',
  'Packaging & Supplies',
  'Taxes & Government Fees',
  'Miscellaneous',
];

export default function BusinessExpensesPage() {
  const { activeBusinessId } = useBusiness();
  const [expenses, setExpenses] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Rent');
  const [amountRs, setAmountRs] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchExpenses = () => {
    if (!activeBusinessId) return;
    setLoading(true);
    businessApi
      .listExpenses(activeBusinessId)
      .then((data) => setExpenses(data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchExpenses();
  }, [activeBusinessId]);

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    const amountMinor = Math.round(Number(amountRs || 0) * 100);
    if (!title.trim()) return toast.error('Expense title is required');
    if (amountMinor <= 0) return toast.error('Please enter a valid expense amount');

    setSaving(true);
    try {
      await businessApi.createExpense(activeBusinessId, {
        title: title.trim(),
        category,
        amountMinor,
        paymentMethod,
        vendor: vendor.trim(),
        notes: notes.trim(),
      });

      toast.success('Expense recorded successfully');
      setAddModalOpen(false);
      setTitle('');
      setAmountRs('');
      setVendor('');
      setNotes('');
      fetchExpenses();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to record expense');
    } finally {
      setSaving(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + BigInt(e.amount_minor || 0), 0n);

  const filteredExpenses = expenses.filter((e) => {
    const s = search.toLowerCase();
    return !s || e.title.toLowerCase().includes(s) || e.category.toLowerCase().includes(s) || (e.vendor && e.vendor.toLowerCase().includes(s));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Business Operating Expenses
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage overheads, rent, utilities, staff salaries, and vendor bills.
          </p>
        </div>

        <Button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="h-4 w-4" /> Add Business Expense
        </Button>
      </div>

      {/* Summary card & Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-canvas-darkCard">
          <span className="text-xs font-semibold uppercase text-slate-500">Total Recorded Overheads</span>
          <p className="mt-1 text-xl font-bold text-rose-600 dark:text-rose-400">
            {formatRs(totalExpenses.toString())}
          </p>
        </div>

        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses by title or category..."
            className="hw-input w-full pl-9"
          />
        </div>
      </div>

      {/* Expenses Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Expense Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Paid Via</th>
                <th className="px-4 py-3">Vendor / Recipient</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                    {exp.title}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{exp.category}</td>
                  <td className="px-4 py-3 text-slate-500">{exp.date}</td>
                  <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-400">
                    {exp.payment_method === 'unpaid' ? 'Unpaid Bill' : exp.payment_method}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{exp.vendor || '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400">
                    {formatRs(exp.amount_minor)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${exp.status === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}>
                      {exp.status === 'paid' ? 'Paid' : 'Unpaid Bill'}
                    </span>
                  </td>
                </tr>
              ))}

              {!filteredExpenses.length && !loading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                    No operating expenses logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Expense Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Record Business Expense" size="md">
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Expense Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Shop Rent for October 2026"
              className="hw-input mt-1 w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Amount (Rs) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={amountRs}
                onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                onChange={(e) => setAmountRs(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
                placeholder="0"
                className="hw-input mt-1 w-full font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Payment Status
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                <option value="cash">Paid via Cash in Hand</option>
                <option value="bank">Paid via Bank Transfer</option>
                <option value="wallet">Paid via Digital Wallet</option>
                <option value="unpaid">Unpaid (Add as Payable Bill)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Vendor / Landlord / Payee
              </label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Optional"
                className="hw-input mt-1 w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid through online banking"
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">
              {saving ? 'Recording...' : 'Record Expense'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
