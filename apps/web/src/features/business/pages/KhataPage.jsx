import { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  BookOpen,
  Check,
  MessageSquare,
  Clock,
  AlertTriangle,
  Send,
  Download,
  Printer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { formatRs } from '../../../shared/utils/money';
import { downloadDocumentPdf, previewDocumentPdf, DOCUMENT_TYPES } from '../utils/businessDocuments';

export default function KhataPage() {
  const { activeBusiness, activeBusinessId } = useBusiness();
  const [activeTab, setActiveTab] = useState('customers'); // 'customers' | 'suppliers' | 'aging'
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Aging state
  const [agingTab, setAgingTab] = useState('customers'); // 'customers' | 'suppliers'
  const [customerAging, setCustomerAging] = useState(null);
  const [supplierAging, setSupplierAging] = useState(null);

  // Add Party Modals
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [partyOpening, setPartyOpening] = useState('');
  const [partyCreditLimit, setPartyCreditLimit] = useState('');
  const [savingParty, setSavingParty] = useState(false);

  // Payment Modal (Vasooli / Adaigi)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentAmountRs, setPaymentAmountRs] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Statement Ledger Modal
  const [statementOpen, setStatementOpen] = useState(false);
  const [statementData, setStatementData] = useState(null);
  const [statementIsCustomer, setStatementIsCustomer] = useState(true);
  const [loadingStatement, setLoadingStatement] = useState(false);

  const fetchParties = () => {
    if (!activeBusinessId) return;
    setLoading(true);
    Promise.all([
      businessApi.listCustomers(activeBusinessId),
      businessApi.listSuppliers(activeBusinessId),
      businessApi.getCustomerAging(activeBusinessId),
      businessApi.getSupplierAging(activeBusinessId),
    ])
      .then(([custs, supps, cAging, sAging]) => {
        setCustomers(custs || []);
        setSuppliers(supps || []);
        setCustomerAging(cAging);
        setSupplierAging(sAging);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchParties();
  }, [activeBusinessId]);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!partyName.trim()) return toast.error('Name is required');
    setSavingParty(true);
    try {
      await businessApi.createCustomer(activeBusinessId, {
        name: partyName.trim(),
        phone: partyPhone.trim(),
        address: partyAddress.trim(),
        openingBalanceMinor: Math.round(Number(partyOpening || 0) * 100),
        creditLimitMinor: partyCreditLimit ? Math.round(Number(partyCreditLimit) * 100) : null,
      });
      toast.success('Customer added to Khata');
      setAddCustomerOpen(false);
      resetPartyForm();
      fetchParties();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to add customer');
    } finally {
      setSavingParty(false);
    }
  };

  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    if (!partyName.trim()) return toast.error('Name is required');
    setSavingParty(true);
    try {
      await businessApi.createSupplier(activeBusinessId, {
        name: partyName.trim(),
        phone: partyPhone.trim(),
        address: partyAddress.trim(),
        openingBalanceMinor: Math.round(Number(partyOpening || 0) * 100),
      });
      toast.success('Supplier added to Khata');
      setAddSupplierOpen(false);
      resetPartyForm();
      fetchParties();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to add supplier');
    } finally {
      setSavingParty(false);
    }
  };

  const resetPartyForm = () => {
    setPartyName('');
    setPartyPhone('');
    setPartyAddress('');
    setPartyOpening('');
    setPartyCreditLimit('');
  };

  const openPaymentModal = (party) => {
    setPaymentTarget(party);
    setPaymentAmountRs('');
    setPaymentNotes('');
    setPaymentModalOpen(true);
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    const amountMinor = Math.round(Number(paymentAmountRs || 0) * 100);
    if (amountMinor <= 0) return toast.error('Please enter a valid amount');

    setSavingPayment(true);
    try {
      const isCustomer = activeTab === 'customers' || agingTab === 'customers';
      await businessApi.createPayment(activeBusinessId, {
        paymentType: isCustomer ? 'customer_payment' : 'supplier_payment',
        amountMinor,
        customerId: isCustomer ? paymentTarget.id : null,
        supplierId: !isCustomer ? paymentTarget.id : null,
        notes: paymentNotes.trim(),
      });

      toast.success(isCustomer ? 'Payment collection recorded!' : 'Supplier payment recorded!');
      setPaymentModalOpen(false);
      setPaymentTarget(null);
      fetchParties();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Payment failed');
    } finally {
      setSavingPayment(false);
    }
  };

  const openStatement = async (party, isCustomerParty) => {
    const isCust = isCustomerParty !== undefined ? isCustomerParty : activeTab === 'customers';
    setStatementIsCustomer(isCust);
    setStatementOpen(true);
    setLoadingStatement(true);
    try {
      const data = isCust
        ? await businessApi.getCustomer(activeBusinessId, party.id)
        : await businessApi.getSupplier(activeBusinessId, party.id);
      setStatementData(data);
    } catch (err) {
      toast.error('Failed to load statement');
      setStatementOpen(false);
    } finally {
      setLoadingStatement(false);
    }
  };

  const sendWhatsAppReminder = (customer) => {
    const phone = (customer.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return toast.error('No valid phone number for customer');
    let intlPhone = phone;
    if (intlPhone.startsWith('0')) {
      intlPhone = '92' + intlPhone.slice(1);
    }
    const balFormatted = formatRs(customer.current_balance_minor);
    const bizName = activeBusiness?.name || 'HisabKi Kitab';
    const msg = `Assalam-o-Alaikum ${customer.name},\n\nYeh ${bizName} ki taraf se khata reminder hai. Record ke mutabiq aap ka baqaya hisab ${balFormatted} hai.\n\nBaraye meherbani barwaqt adaigi farmaiye. Shukriya!\n${bizName}`;
    const url = `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const totalReceivables = customers.reduce((sum, c) => sum + BigInt(c.current_balance_minor || 0), 0n);
  const totalPayables = suppliers.reduce((sum, s) => sum + BigInt(s.current_balance_minor || 0), 0n);

  const displayedList = (activeTab === 'customers' ? customers : suppliers).filter((p) => {
    const s = search.toLowerCase();
    return !s || p.name.toLowerCase().includes(s) || (p.phone && p.phone.includes(s));
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Digital Khata & Party Ledgers
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage customer receivables, supplier obligations, aging intervals & payment reminders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab !== 'aging' && (
            <Button
              onClick={() => (activeTab === 'customers' ? setAddCustomerOpen(true) : setAddSupplierOpen(true))}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <UserPlus className="h-4 w-4" /> {activeTab === 'customers' ? 'Add Customer' : 'Add Supplier'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs and Total Balances */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab('customers');
            setSearch('');
          }}
          className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
            activeTab === 'customers'
              ? 'border-emerald-500 bg-emerald-50/60 shadow-sm dark:bg-emerald-950/20'
              : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-canvas-darkCard'
          }`}
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Customer Khata (Lene Hain)
            </span>
            <p className="mt-1 text-xl font-bold text-emerald-900 dark:text-emerald-100">
              {formatRs(totalReceivables.toString())}
            </p>
            <span className="text-xs text-slate-500">{customers.length} Customers</span>
          </div>
          <ArrowDownLeft className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('suppliers');
            setSearch('');
          }}
          className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
            activeTab === 'suppliers'
              ? 'border-rose-500 bg-rose-50/60 shadow-sm dark:bg-rose-950/20'
              : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-canvas-darkCard'
          }`}
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
              Supplier Khata (Dene Hain)
            </span>
            <p className="mt-1 text-xl font-bold text-rose-900 dark:text-rose-100">
              {formatRs(totalPayables.toString())}
            </p>
            <span className="text-xs text-slate-500">{suppliers.length} Suppliers</span>
          </div>
          <ArrowUpRight className="h-8 w-8 text-rose-600 dark:text-rose-400" />
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('aging');
          }}
          className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
            activeTab === 'aging'
              ? 'border-indigo-500 bg-indigo-50/60 shadow-sm dark:bg-indigo-950/20'
              : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-canvas-darkCard'
          }`}
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
              Aging Analysis (Muddat)
            </span>
            <p className="mt-1 text-xl font-bold text-indigo-900 dark:text-indigo-100">5-Interval</p>
            <span className="text-xs text-slate-500">1-30, 31-60, 61-90, 90+ days</span>
          </div>
          <Clock className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
        </button>
      </div>

      {/* Customer & Supplier View */}
      {activeTab !== 'aging' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTab === 'customers' ? 'customer' : 'supplier'} by name or phone...`}
              className="hw-input w-full pl-9"
            />
          </div>

          <Card className="overflow-hidden">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayedList.map((party) => {
                const bal = BigInt(party.current_balance_minor || 0);
                const isCustomer = activeTab === 'customers';
                const hasCreditLimit = isCustomer && party.credit_limit_minor;
                const isOverLimit = hasCreditLimit && bal > BigInt(party.credit_limit_minor);

                return (
                  <div
                    key={party.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold ${
                          isCustomer
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                        }`}
                      >
                        {party.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{party.name}</h4>
                          {isOverLimit && (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                              <AlertTriangle className="h-3 w-3" /> Over Limit
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {party.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {party.phone}
                            </span>
                          )}
                          {party.address && <span>• {party.address}</span>}
                          {hasCreditLimit && <span>• Limit: {formatRs(party.credit_limit_minor)}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                      <div className="text-right">
                        <span className="block text-[10px] uppercase font-bold text-slate-400">
                          {isCustomer ? 'Receivable Balance' : 'Payable Balance'}
                        </span>
                        <span
                          className={`text-base font-bold ${
                            isCustomer ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {formatRs(bal.toString())}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isCustomer && bal > 0n && party.phone && (
                          <button
                            type="button"
                            onClick={() => sendWhatsAppReminder(party)}
                            title="Send WhatsApp Payment Reminder"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => openPaymentModal(party)}
                          className={
                            isCustomer
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700 text-xs'
                              : 'bg-rose-600 text-white hover:bg-rose-700 text-xs'
                          }
                        >
                          {isCustomer ? 'Receive' : 'Pay'}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => openStatement(party)} className="text-xs">
                          <BookOpen className="h-3.5 w-3.5" /> Ledger
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!displayedList.length && !loading && (
                <div className="py-12 text-center text-sm text-slate-400">
                  No {activeTab} in your Khata yet. Click the button above to add one!
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Aging Analysis View */}
      {activeTab === 'aging' && (
        <div className="space-y-6">
          <div className="flex gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setAgingTab('customers')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                agingTab === 'customers'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Customer Receivables Aging
            </button>
            <button
              type="button"
              onClick={() => setAgingTab('suppliers')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                agingTab === 'suppliers'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Supplier Payables Aging
            </button>
          </div>

          {/* Aging Summary Buckets */}
          {(() => {
            const report = agingTab === 'customers' ? customerAging : supplierAging;
            if (!report) return null;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Card className="p-3">
                    <span className="text-[10px] font-bold uppercase text-slate-400">1 - 30 Days</span>
                    <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                      {formatRs(report.summary.bucket_1_30)}
                    </p>
                  </Card>
                  <Card className="p-3">
                    <span className="text-[10px] font-bold uppercase text-slate-400">31 - 60 Days</span>
                    <p className="mt-1 text-base font-bold text-amber-600">
                      {formatRs(report.summary.bucket_31_60)}
                    </p>
                  </Card>
                  <Card className="p-3">
                    <span className="text-[10px] font-bold uppercase text-slate-400">61 - 90 Days</span>
                    <p className="mt-1 text-base font-bold text-orange-600">
                      {formatRs(report.summary.bucket_61_90)}
                    </p>
                  </Card>
                  <Card className="p-3">
                    <span className="text-[10px] font-bold uppercase text-slate-400">90+ Days Overdue</span>
                    <p className="mt-1 text-base font-bold text-rose-600">
                      {formatRs(report.summary.bucket_over_90)}
                    </p>
                  </Card>
                  <Card className="p-3">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Total Outstanding</span>
                    <p className="mt-1 text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {formatRs(report.summary.grandTotal)}
                    </p>
                  </Card>
                </div>

                {/* Aging Table */}
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                        <tr>
                          <th className="px-4 py-3">Party Name</th>
                          <th className="px-4 py-3">Contact</th>
                          <th className="px-4 py-3 text-right">1 - 30 Days</th>
                          <th className="px-4 py-3 text-right">31 - 60 Days</th>
                          <th className="px-4 py-3 text-right">61 - 90 Days</th>
                          <th className="px-4 py-3 text-right">90+ Days</th>
                          <th className="px-4 py-3 text-right">Total Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(agingTab === 'customers' ? report.customers : report.suppliers).map((party) => (
                          <tr key={party.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                              {party.name}
                            </td>
                            <td className="px-4 py-3 text-slate-500">{party.phone || '—'}</td>
                            <td className="px-4 py-3 text-right">
                              {Number(party.bucket_1_30) > 0 ? formatRs(party.bucket_1_30) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-amber-600">
                              {Number(party.bucket_31_60) > 0 ? formatRs(party.bucket_31_60) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-orange-600">
                              {Number(party.bucket_61_90) > 0 ? formatRs(party.bucket_61_90) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-rose-600">
                              {Number(party.bucket_over_90) > 0 ? formatRs(party.bucket_over_90) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                              {formatRs(party.current_balance_minor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            );
          })()}
        </div>
      )}

      {/* Add Party Modal */}
      <Modal
        open={addCustomerOpen || addSupplierOpen}
        onClose={() => {
          setAddCustomerOpen(false);
          setAddSupplierOpen(false);
        }}
        title={addCustomerOpen ? 'Add Customer to Khata' : 'Add Supplier to Khata'}
        size="md"
      >
        <form onSubmit={addCustomerOpen ? handleCreateCustomer : handleCreateSupplier} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Party Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder="e.g. Haji Muhammad Aslam"
              className="hw-input mt-1 w-full"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Phone Number</label>
              <input
                type="text"
                value={partyPhone}
                onChange={(e) => setPartyPhone(e.target.value)}
                placeholder="0300-1234567"
                className="hw-input mt-1 w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Address / Area</label>
              <input
                type="text"
                value={partyAddress}
                onChange={(e) => setPartyAddress(e.target.value)}
                placeholder="Shop # 12, Main Bazar..."
                className="hw-input mt-1 w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Opening Balance (Rs)
              </label>
              <input
                type="number"
                min="0"
                value={partyOpening}
                onChange={(e) => setPartyOpening(e.target.value)}
                placeholder="0"
                className="hw-input mt-1 w-full"
              />
            </div>
            {addCustomerOpen && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Credit Limit (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={partyCreditLimit}
                  onChange={(e) => setPartyCreditLimit(e.target.value)}
                  placeholder="e.g. 100000"
                  className="hw-input mt-1 w-full"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setAddCustomerOpen(false);
                setAddSupplierOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button disabled={savingParty} type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">
              {savingParty ? 'Saving...' : 'Save to Khata'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Payment Entry Modal (Vasooli / Adaigi) */}
      <Modal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title={activeTab === 'customers' || agingTab === 'customers' ? 'Receive Customer Payment' : 'Pay Supplier'}
        size="sm"
      >
        <form onSubmit={handleSavePayment} className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Recording payment for <strong>{paymentTarget?.name}</strong> (Current Balance:{' '}
            {formatRs(paymentTarget?.current_balance_minor || 0)}).
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Amount (Rs) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              required
              value={paymentAmountRs}
              onChange={(e) => setPaymentAmountRs(e.target.value)}
              placeholder="Enter amount"
              className="hw-input mt-1 w-full text-base font-bold"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Remarks / Notes</label>
            <input
              type="text"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="e.g. Received via cash at shop"
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={savingPayment} type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">
              {savingPayment ? 'Saving...' : 'Confirm Payment'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Statement Ledger Modal */}
      <Modal
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
        title={`${statementData?.name || 'Party'} - Khata Ledger`}
        size="lg"
      >
        {loadingStatement ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading ledger records...</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Current Outstanding Balance: </span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                {formatRs(statementData?.current_balance_minor || 0)}
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-slate-100 font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Ref #</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {statementData?.ledger?.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="px-3 py-2 text-slate-500">{row.date}</td>
                      <td className="px-3 py-2 capitalize font-medium">{row.type}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.reference || '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-rose-600 dark:text-rose-400">
                        {Number(row.debit_minor) > 0 ? formatRs(row.debit_minor) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {Number(row.credit_minor) > 0 ? formatRs(row.credit_minor) : '—'}
                      </td>
                    </tr>
                  ))}
                  {!statementData?.ledger?.length && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No transactions found in this ledger.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    previewDocumentPdf({
                      businessId: activeBusinessId,
                      docType: statementIsCustomer
                        ? DOCUMENT_TYPES.CUSTOMER_STATEMENT
                        : DOCUMENT_TYPES.SUPPLIER_STATEMENT,
                      docId: statementData?.id,
                    })
                  }
                  className="flex items-center gap-1 text-xs"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Statement
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    downloadDocumentPdf({
                      businessId: activeBusinessId,
                      docType: statementIsCustomer
                        ? DOCUMENT_TYPES.CUSTOMER_STATEMENT
                        : DOCUMENT_TYPES.SUPPLIER_STATEMENT,
                      docId: statementData?.id,
                      customFilename: `${statementIsCustomer ? 'Customer' : 'Supplier'}-Statement-${statementData?.name || 'Party'}.pdf`,
                    })
                  }
                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                >
                  <Download className="h-3.5 w-3.5" /> Download Statement PDF
                </Button>
              </div>

              <Button variant="secondary" onClick={() => setStatementOpen(false)} className="text-xs">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
