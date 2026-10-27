import DesktopOnlyWorkspaceGuard from '../components/DesktopOnlyWorkspaceGuard';
import { useEffect, useState } from 'react';
import { Wallet, ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Plus, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { formatRs } from '../../../shared/utils/money';
import { allowOnlyNumbers, sanitizeNumericString } from '../../../shared/utils/inputs';

export default function AccountsPage() {
  const { activeBusinessId } = useBusiness();
  const [accounts, setAccounts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Transfer Modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [transferAmountRs, setTransferAmountRs] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [savingTransfer, setSavingTransfer] = useState(false);

  // Capital / Drawing Modal
  const [equityModalOpen, setEquityModalOpen] = useState(false);
  const [equityType, setEquityType] = useState('owner_contribution'); // 'owner_contribution' | 'owner_drawing'
  const [equityAccountId, setEquityAccountId] = useState('');
  const [equityAmountRs, setEquityAmountRs] = useState('');
  const [equityNotes, setEquityNotes] = useState('');
  const [savingEquity, setSavingEquity] = useState(false);

  const fetchAccountsData = () => {
    setAccounts([]);
    setPayments([]);
    if (!activeBusinessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      businessApi.listAccounts(activeBusinessId),
      businessApi.listPayments(activeBusinessId),
    ])
      .then(([accs, pays]) => {
        setAccounts(accs || []);
        setPayments(pays || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAccountsData();
  }, [activeBusinessId]);

  const moneyAccounts = accounts.filter((a) => ['cash', 'bank', 'wallet'].includes(a.subtype));

  const handleTransfer = async (e) => {
    e.preventDefault();
    const amountMinor = Math.round(Number(transferAmountRs || 0) * 100);
    if (!fromAccountId || !toAccountId) return toast.error('Please select both from and to accounts');
    if (fromAccountId === toAccountId) return toast.error('Source and destination accounts must be different');
    if (amountMinor <= 0) return toast.error('Please enter a valid transfer amount');

    setSavingTransfer(true);
    try {
      await businessApi.createPayment(activeBusinessId, {
        paymentType: 'account_transfer',
        amountMinor,
        fromAccountId,
        toAccountId,
        notes: transferNotes.trim() || 'Internal account transfer',
      });

      toast.success('Transfer completed successfully!');
      setTransferModalOpen(false);
      setTransferAmountRs('');
      setTransferNotes('');
      fetchAccountsData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Transfer failed');
    } finally {
      setSavingTransfer(false);
    }
  };

  const handleEquityAction = async (e) => {
    e.preventDefault();
    const amountMinor = Math.round(Number(equityAmountRs || 0) * 100);
    if (amountMinor <= 0) return toast.error('Please enter a valid amount');

    setSavingEquity(true);
    try {
      await businessApi.createPayment(activeBusinessId, {
        paymentType: equityType,
        amountMinor,
        fromAccountId: equityType === 'owner_drawing' ? equityAccountId : null,
        toAccountId: equityType === 'owner_contribution' ? equityAccountId : null,
        notes: equityNotes.trim(),
      });

      toast.success(equityType === 'owner_contribution' ? 'Owner capital recorded!' : 'Owner drawing recorded!');
      setEquityModalOpen(false);
      setEquityAmountRs('');
      setEquityNotes('');
      fetchAccountsData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Transaction failed');
    } finally {
      setSavingEquity(false);
    }
  };

  return (
    <DesktopOnlyWorkspaceGuard
      featureName="Full General Ledger & Accounts"
      featureDescription="Cash & Bank Accounts, Double-Entry General Ledger, Journal entries, and Capital/Drawings"
      featureIcon={Wallet}
      quickActionLink={{ to: '/business/expenses', label: 'Record Business Expense' }}
      essentialSummary={
        <p className="text-slate-600 dark:text-slate-400">
          Daily cash sales and expenses are recorded via <strong>POS</strong> and <strong>Business Expenses</strong>. Bank transfers, Chart of Accounts, and General Ledger reconciliation are available on desktop.
        </p>
      }
    >
      <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Cash, Bank & Money Accounts
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track liquid cash, bank balances, internal transfers, and owner capital & drawings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setEquityType('owner_contribution');
              setEquityAccountId(moneyAccounts[0]?.id || '');
              setEquityModalOpen(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Owner Capital
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setEquityType('owner_drawing');
              setEquityAccountId(moneyAccounts[0]?.id || '');
              setEquityModalOpen(true);
            }}
            className="flex items-center gap-1.5"
          >
            <ArrowUpRight className="h-4 w-4 text-rose-500" /> Owner Drawing
          </Button>
          <Button
            onClick={() => {
              setFromAccountId(moneyAccounts[0]?.id || '');
              setToAccountId(moneyAccounts[1]?.id || '');
              setTransferModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <ArrowLeftRight className="h-4 w-4" /> Transfer Funds
          </Button>
        </div>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {moneyAccounts.map((acc) => (
          <Card key={acc.id} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Code {acc.code} • {acc.subtype}
              </span>
              <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-slate-100">{acc.name}</h3>
            <p className="mt-4 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatRs(acc.balance_minor)}
            </p>
          </Card>
        ))}
      </div>

      {/* Recent Transfers & Payments */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Recent Account Movements</h3>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">From / To</th>
                  <th className="px-4 py-3">Remarks</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 text-slate-500">{p.date}</td>
                    <td className="px-4 py-3 font-semibold capitalize text-slate-900 dark:text-slate-100">
                      {p.payment_type?.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {p.from_account_name && `From: ${p.from_account_name} `}
                      {p.to_account_name && `To: ${p.to_account_name}`}
                      {p.customer_name && `Customer: ${p.customer_name}`}
                      {p.supplier_name && `Supplier: ${p.supplier_name}`}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{p.notes || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatRs(p.amount_minor)}
                    </td>
                  </tr>
                ))}
                {!payments.length && !loading && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                      No account movements recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Internal Transfer Modal */}
      <Modal open={transferModalOpen} onClose={() => setTransferModalOpen(false)} title="Transfer Funds Between Accounts" size="md">
        <form onSubmit={handleTransfer} className="space-y-4">
          <p className="text-xs text-slate-500">
            Transfers move money between two accounts without altering sales or expenses.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Transfer From (Nikaalna Hai)
              </label>
              <select
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                {moneyAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatRs(a.balance_minor)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Transfer To (Daalna Hai)
              </label>
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                {moneyAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatRs(a.balance_minor)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Amount to Transfer (Rs) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              required
              value={transferAmountRs}
              onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
              onChange={(e) => setTransferAmountRs(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
              placeholder="0"
              className="hw-input mt-1 w-full font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Remarks
            </label>
            <input
              type="text"
              value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)}
              placeholder="e.g. Cash deposited in Meezan Bank"
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setTransferModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={savingTransfer} type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">
              {savingTransfer ? 'Transferring...' : 'Execute Transfer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Owner Equity (Capital / Drawing) Modal */}
      <Modal open={equityModalOpen} onClose={() => setEquityModalOpen(false)} title={equityType === 'owner_contribution' ? 'Record Owner Capital Investment' : 'Record Owner Personal Drawing'} size="sm">
        <form onSubmit={handleEquityAction} className="space-y-4">
          <p className="text-xs text-slate-500">
            {equityType === 'owner_contribution'
              ? 'Owner adds personal funds into the business. Accurately credited to Owner Equity without distorting business sales.'
              : 'Owner withdraws money from business for personal use. Accurately debited to Owner Drawings without distorting operating expenses.'}
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Account {equityType === 'owner_contribution' ? 'Receiving Money' : 'Disbursing Money'}
            </label>
            <select
              value={equityAccountId}
              onChange={(e) => setEquityAccountId(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            >
              {moneyAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatRs(a.balance_minor)})
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
              value={equityAmountRs}
              onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
              onChange={(e) => setEquityAmountRs(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
              placeholder="0"
              className="hw-input mt-1 w-full font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Notes
            </label>
            <input
              type="text"
              value={equityNotes}
              onChange={(e) => setEquityNotes(e.target.value)}
              placeholder="e.g. Personal capital injection"
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setEquityModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={savingEquity} type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">
              {savingEquity ? 'Recording...' : 'Confirm'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
    </DesktopOnlyWorkspaceGuard>
  );
}
