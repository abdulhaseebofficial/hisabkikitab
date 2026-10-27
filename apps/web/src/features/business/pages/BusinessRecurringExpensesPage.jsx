import { useEffect, useState } from 'react';
import {
  CalendarClock,
  Plus,
  Play,
  Pause,
  XCircle,
  AlertCircle,
  Clock,
  CheckCircle2,
  Calendar,
  CreditCard,
  Building,
  RotateCcw,
  History,
  FileText,
  Edit,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import { useBusiness } from '../BusinessContext';
import { useAuth } from '../../auth';
import businessApi from '../api/businessApi';
import useT from '../../../shared/i18n/I18nProvider';
import { formatRs } from '../../../shared/utils/money';
import { allowOnlyNumbers, sanitizeNumericString } from '../../../shared/utils/inputs';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'Utilities (Bijli, Gas, Water)',
  'Rent (Dukan / Office Kiraya)',
  'Internet & Telecom',
  'Software & Subscriptions',
  'Salaries & Retainers',
  'Maintenance & Cleaning',
  'Marketing & Advertising',
  'Insurance',
  'Other Operational',
];

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly (Haftawar)' },
  { value: 'monthly', label: 'Monthly (Mahana)' },
  { value: 'quarterly', label: 'Quarterly (Seh-Mahana)' },
  { value: 'yearly', label: 'Yearly (Salana)' },
];

export default function BusinessRecurringExpensesPage() {
  const { activeBusinessId, activeBusiness, role } = useBusiness();
  const { user } = useAuth();
  const isDemo = Boolean(user?.isDemo);
  const { t, language } = useT();

  const [activeTab, setActiveTab] = useState('templates'); // 'templates' | 'upcoming' | 'overdue'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'paused' | 'cancelled'
  const [loading, setLoading] = useState(true);

  const [templates, setTemplates] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [categoryAccountId, setCategoryAccountId] = useState('');
  const [amountRs, setAmountRs] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [nextDueDate, setNextDueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [autoPay, setAutoPay] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('bank');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');

  // Occurrence History Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedTemplateForHistory, setSelectedTemplateForHistory] = useState(null);
  const [occurrences, setOccurrences] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Manual Generator Modal
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateUpToDate, setGenerateUpToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [generating, setGenerating] = useState(false);

  const fetchData = async () => {
    setTemplates([]);
    setUpcoming([]);
    setOverdue([]);
    setAccounts([]);
    setSuppliers([]);
    if (!activeBusinessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [allTemplates, upcomingList, overdueList, allAccounts, allSuppliers] = await Promise.all([
        businessApi.listRecurringExpenses(activeBusinessId),
        businessApi.getUpcomingRecurringExpenses(activeBusinessId),
        businessApi.getOverdueRecurringExpenses(activeBusinessId),
        businessApi.listAccounts(activeBusinessId).catch(() => []),
        businessApi.listSuppliers(activeBusinessId).catch(() => []),
      ]);

      setTemplates(allTemplates || []);
      setUpcoming(upcomingList || []);
      setOverdue(overdueList || []);
      setAccounts(allAccounts || []);
      setSuppliers(allSuppliers || []);

      // Pre-select default accounts if available
      const defaultExpenseAcc = allAccounts?.find((a) => a.type === 'expense');
      if (defaultExpenseAcc && !categoryAccountId) {
        setCategoryAccountId(defaultExpenseAcc.id);
      }
      const defaultBankAcc = allAccounts?.find((a) => a.type === 'asset' && (a.subtype === 'bank' || a.subtype === 'cash'));
      if (defaultBankAcc && !paymentAccountId) {
        setPaymentAccountId(defaultBankAcc.id);
      }
    } catch (err) {
      toast.error('Failed to load recurring expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeBusinessId]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setCategory(CATEGORIES[0]);
    setAmountRs('');
    setFrequency('monthly');
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setNextDueDate(today);
    setEndDate('');
    setAutoPay(false);
    setPaymentMethod('bank');
    setSupplierId('');
    setNotes('');
  };

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (tmpl) => {
    setEditingId(tmpl.id);
    setTitle(tmpl.title);
    setCategory(tmpl.category);
    setCategoryAccountId(tmpl.category_account_id);
    setAmountRs((Number(tmpl.amount_minor || 0) / 100).toFixed(0));
    setFrequency(tmpl.frequency);
    setStartDate(tmpl.start_date || '');
    setNextDueDate(tmpl.next_due_date || '');
    setEndDate(tmpl.end_date || '');
    setAutoPay(Boolean(tmpl.auto_pay));
    setPaymentMethod(tmpl.payment_method || 'bank');
    setPaymentAccountId(tmpl.payment_account_id || '');
    setSupplierId(tmpl.supplier_id || '');
    setNotes(tmpl.notes || '');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isDemo) {
      toast.error('Demo Mode is read-only. Cannot modify recurring expenses.');
      return;
    }
    if (!title.trim()) return toast.error('Title is required');
    if (!categoryAccountId) return toast.error('Category GL account is required');
    const amountVal = Number(amountRs);
    if (!amountVal || amountVal <= 0) return toast.error('Valid positive amount is required');

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        category,
        categoryAccountId,
        amountMinor: Math.round(amountVal * 100),
        frequency,
        startDate,
        nextDueDate,
        endDate: endDate ? endDate : null,
        autoPay,
        paymentMethod: autoPay ? paymentMethod : null,
        paymentAccountId: autoPay ? paymentAccountId : null,
        supplierId: supplierId ? supplierId : null,
        notes: notes.trim(),
      };

      if (editingId) {
        await businessApi.updateRecurringExpense(activeBusinessId, editingId, payload);
        toast.success('Recurring expense updated successfully');
      } else {
        await businessApi.createRecurringExpense(activeBusinessId, payload);
        toast.success('Recurring expense template scheduled');
      }

      setModalOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async (id) => {
    if (isDemo) return toast.error('Demo Mode is read-only');
    try {
      await businessApi.pauseRecurringExpense(activeBusinessId, id);
      toast.success('Schedule paused');
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to pause');
    }
  };

  const handleResume = async (id) => {
    if (isDemo) return toast.error('Demo Mode is read-only');
    try {
      await businessApi.resumeRecurringExpense(activeBusinessId, id);
      toast.success('Schedule resumed');
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to resume');
    }
  };

  const handleCancel = async (id) => {
    if (isDemo) return toast.error('Demo Mode is read-only');
    if (!window.confirm('Are you sure you want to cancel this recurring schedule? Future bills will stop generating.')) {
      return;
    }
    try {
      await businessApi.cancelRecurringExpense(activeBusinessId, id);
      toast.success('Schedule cancelled');
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to cancel');
    }
  };

  const openHistory = async (tmpl) => {
    setSelectedTemplateForHistory(tmpl);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const data = await businessApi.listRecurringOccurrences(activeBusinessId, tmpl.id);
      setOccurrences(data || []);
    } catch (err) {
      toast.error('Failed to load occurrence history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleGenerateOccurrences = async (e) => {
    e.preventDefault();
    if (isDemo) return toast.error('Demo Mode is read-only');
    setGenerating(true);
    try {
      const res = await businessApi.generateRecurringExpenses(activeBusinessId, {
        upToDate: generateUpToDate,
      });
      toast.success(`Generated ${res?.count || 0} occurrences / bills`);
      setGenerateModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to generate occurrences');
    } finally {
      setGenerating(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });

  const activeCount = templates.filter((t) => t.status === 'active').length;
  const pausedCount = templates.filter((t) => t.status === 'paused').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-emerald-600" /> Recurring Business Expenses
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Automate monthly rent, utilities, vendor retainers, and recurring supplier bills with double-entry integrity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setGenerateModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <RotateCcw className="h-3.5 w-3.5 text-emerald-600" /> Run Scheduler
          </Button>

          <Button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            <Plus className="h-4 w-4" /> Schedule New Expense
          </Button>
        </div>
      </div>

      {/* Demo Warning Banner */}
      {isDemo && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Demo Mode is Read-Only
          </p>
          <p className="mt-0.5">
            You can inspect scheduled expenses and history, but mutations are protected by database security triggers.
          </p>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Play className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Active Schedules</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{activeCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Pause className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Paused Schedules</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{pausedCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Upcoming Due</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{upcoming.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Overdue Payments</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{overdue.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold ${
              activeTab === 'templates'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <CalendarClock className="h-4 w-4" /> All Schedules ({templates.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upcoming')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold ${
              activeTab === 'upcoming'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Clock className="h-4 w-4" /> Upcoming Due ({upcoming.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overdue')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold ${
              activeTab === 'overdue'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <AlertCircle className="h-4 w-4" /> Overdue ({overdue.length})
          </button>
        </div>

        {activeTab === 'templates' && (
          <div className="flex items-center gap-1.5 pb-2">
            <span className="text-xs text-slate-400">Filter:</span>
            {['all', 'active', 'paused', 'cancelled'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Card */}
      <Card className="overflow-hidden">
        {/* Tab 1: Templates Table */}
        {activeTab === 'templates' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Expense Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Frequency</th>
                  <th className="px-4 py-3 text-right">Amount (Rs)</th>
                  <th className="px-4 py-3">Next Due</th>
                  <th className="px-4 py-3">Settlement</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTemplates.map((tmpl) => (
                  <tr key={tmpl.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                      <div>{tmpl.title}</div>
                      {tmpl.supplier_name && (
                        <div className="text-xs font-normal text-slate-500">Vendor: {tmpl.supplier_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{tmpl.category}</td>
                    <td className="px-4 py-3 text-xs capitalize text-slate-600 dark:text-slate-400">
                      {tmpl.frequency}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatRs(tmpl.amount_minor)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {tmpl.next_due_date || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {tmpl.auto_pay ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="h-3 w-3" /> Auto-Pay ({tmpl.payment_method})
                        </span>
                      ) : (
                        <span className="text-slate-500">Manual Bill Accrual</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          tmpl.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : tmpl.status === 'paused'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {tmpl.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openHistory(tmpl)}
                          title="View Occurrence History"
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                        >
                          <History className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(tmpl)}
                          title="Edit Template"
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                        >
                          <Edit className="h-4 w-4" />
                        </button>

                        {tmpl.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => handlePause(tmpl.id)}
                            title="Pause Schedule"
                            className="rounded p-1 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                          >
                            <Pause className="h-4 w-4" />
                          </button>
                        )}

                        {tmpl.status === 'paused' && (
                          <button
                            type="button"
                            onClick={() => handleResume(tmpl.id)}
                            title="Resume Schedule"
                            className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}

                        {tmpl.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => handleCancel(tmpl.id)}
                            title="Cancel Schedule"
                            className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {!filteredTemplates.length && !loading && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                      No recurring expenses found. Click "Schedule New Expense" to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Upcoming Due Table */}
        {activeTab === 'upcoming' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Expense</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Next Due Date</th>
                  <th className="px-4 py-3 text-right">Amount (Rs)</th>
                  <th className="px-4 py-3">Settlement Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {upcoming.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{u.title}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{u.category}</td>
                    <td className="px-4 py-3 text-xs font-medium text-blue-600 dark:text-blue-400">
                      {u.next_due_date}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatRs(u.amount_minor)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {u.auto_pay ? `Auto-Pay (${u.payment_method})` : 'Manual Bill Generation'}
                    </td>
                  </tr>
                ))}
                {!upcoming.length && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                      No upcoming expenses due in the next 30 days.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Overdue Table */}
        {activeTab === 'overdue' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Expense</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Overdue Date</th>
                  <th className="px-4 py-3 text-right">Amount (Rs)</th>
                  <th className="px-4 py-3 text-center">Action Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {overdue.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{o.title}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{o.category}</td>
                    <td className="px-4 py-3 text-xs font-bold text-rose-600 dark:text-rose-400">
                      {o.next_due_date}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatRs(o.amount_minor)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => {
                          setGenerateUpToDate(o.next_due_date);
                          setGenerateModalOpen(true);
                        }}
                        className="text-xs"
                      >
                        Generate Bill Now
                      </Button>
                    </td>
                  </tr>
                ))}
                {!overdue.length && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                      Great news! All recurring expenses are up to date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Recurring Expense' : 'Schedule New Recurring Expense'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Expense Title / Description *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Dukan Kiraya (Shop Rent) / Fiber Internet"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">GL Expense Account *</label>
              <select
                required
                value={categoryAccountId}
                onChange={(e) => setCategoryAccountId(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                <option value="">Select Expense Account</option>
                {accounts
                  .filter((a) => a.type === 'expense')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Amount (Rs) *</label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="e.g. 35000"
                value={amountRs}
                onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                onChange={(e) => setAmountRs(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
                className="hw-input mt-1 w-full text-xs font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Frequency *</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Next Due Date *</label>
              <input
                type="date"
                required
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">End Date (Optional)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Supplier / Landlord (Optional)
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            >
              <option value="">No vendor attached</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.phone || 'No phone'})
                </option>
              ))}
            </select>
          </div>

          {/* Auto-Pay Configuration */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Automatic Payment (Auto-Pay)</p>
                <p className="text-[11px] text-slate-500">
                  Automatically records an approved payment and debits cash/bank when due.
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoPay}
                onChange={(e) => setAutoPay(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </div>

            {autoPay && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="hw-input mt-1 w-full text-xs"
                  >
                    <option value="bank">Bank Transfer</option>
                    <option value="cash">Cash on Hand</option>
                    <option value="wallet">Digital Wallet</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Payment Account</label>
                  <select
                    required={autoPay}
                    value={paymentAccountId}
                    onChange={(e) => setPaymentAccountId(e.target.value)}
                    className="hw-input mt-1 w-full text-xs"
                  >
                    <option value="">Select Asset Account</option>
                    {accounts
                      .filter((a) => a.type === 'asset' && (a.subtype === 'bank' || a.subtype === 'cash'))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name} ({a.subtype})
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Notes / Instructions</label>
            <textarea
              rows={2}
              placeholder="e.g. Account number, billing reference, meter # etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              loading={saving}
              disabled={isDemo}
            >
              {editingId ? 'Save Changes' : 'Create Schedule'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Occurrence History Modal */}
      <Modal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title={`Occurrence History - ${selectedTemplateForHistory?.title || ''}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Audit log of all financial bills generated and settled for this recurring schedule.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Period Key</th>
                  <th className="px-3 py-2">Due Date</th>
                  <th className="px-3 py-2 text-right">Amount (Rs)</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2">Reference Bill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {occurrences.map((occ) => (
                  <tr key={occ.id}>
                    <td className="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">
                      {occ.period_key}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{occ.due_date}</td>
                    <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatRs(occ.amount_minor)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                          occ.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : occ.status === 'bill_created'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {occ.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                      {occ.bill_id ? `BILL-${occ.bill_id.slice(0, 8)}` : 'Auto-Settled'}
                    </td>
                  </tr>
                ))}
                {!occurrences.length && !loadingHistory && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No occurrences generated yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setHistoryModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manual Generator Modal */}
      <Modal
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        title="Execute Recurring Expense Scheduler"
        size="sm"
      >
        <form onSubmit={handleGenerateOccurrences} className="space-y-4">
          <p className="text-xs text-slate-500">
            Process all active recurring expense schedules up to the chosen date and generate due expense bills or auto-payments.
          </p>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Process Up To Date *</label>
            <input
              type="date"
              required
              value={generateUpToDate}
              onChange={(e) => setGenerateUpToDate(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setGenerateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              loading={generating}
              disabled={isDemo}
            >
              Generate Occurrences
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
